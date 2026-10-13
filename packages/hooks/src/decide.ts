/**
 * The Stop hook's decisions, as pure functions.
 *
 * "Pure" here means: they only change the state object they are given and
 * return a result. No files, no clock, no waiting. That makes every rule
 * easy to test. `stop.ts` runs them inside `updateState`, so each decision
 * happens under the state lock (ADR 0002, ADR 0003).
 */
import {
  clearWaiter,
  enqueueMessage,
  hasBuriedCodeTag,
  isCurrentWaiter,
  type NewActivityEntry,
  parseTag,
  type RelayConfig,
  type RelayState,
  registerWaiter,
  type Role,
  startRound,
  takeMessageFor,
} from '@relay/core';

/** The re-arm request a waiter sends when no message came before its deadline. */
export const REARM_MESSAGE = 'Relay: no message yet. Reply with only: WAITING';

/**
 * Sent to the lead, once, when its reply had no tag at the start but had a
 * TO CODE: line further down (bug 002). Not a round and not a handoff.
 */
export const NUDGE_MESSAGE =
  "Relay: your reply didn't start with a tag. Resend it with the tag as the very first thing.";

export function otherRole(role: Role): Role {
  return role === 'lead' ? 'builder' : 'lead';
}

/** The text a session receives, with a first line saying where it came from. */
export function formatDelivery(from: Role, text: string): string {
  const header =
    from === 'lead' ? 'Relay: message from the lead.' : 'Relay: report from the builder.';
  return `${header}\n\n${text}`;
}

// ---------------------------------------------------------------------------
// When Claude finishes a reply (the start of every Stop hook)
// ---------------------------------------------------------------------------

export interface StopContext {
  role: Role;
  config: RelayConfig;
  /** Claude's final reply (`last_assistant_message`). */
  reply: string;
  sessionId: string;
  /** This hook process's PID. */
  pid: number;
  now: Date;
  /** The hook's timeout. The waiter's deadline is now + this. */
  timeoutSeconds: number;
}

export interface StopDecision {
  /** True if this hook should now wait for the next message. */
  wait: boolean;
  /** Wake this session straight away with this text, without waiting (the nudge). */
  wake?: string;
  /** Activity log entries to append. */
  log: NewActivityEntry[];
}

/**
 * Decides what a finished reply means: hand it off, return control to
 * Dennis, or ignore it. Then, if this session should wait for an answer,
 * makes this hook its only waiter.
 */
export function decideOnStop(state: RelayState, ctx: StopContext): StopDecision {
  const { role, config, reply, now } = ctx;
  const me = state.sessions[role];
  const project = config.name;
  const log: NewActivityEntry[] = [];
  const time = now.toISOString();

  // The turn is over, so the session is idle. This happens in the same state
  // update as becoming the waiter below, so an older waiter can't see "idle"
  // and deliver in between (spike 009).
  me.busy = false;

  if (state.stopped) {
    me.waiter = null;
    me.rearmPending = false;
    return { wait: false, log };
  }

  if (me.rearmPending) {
    // This reply answers our own re-arm ("WAITING"). It is not a message:
    // no handoff, no round, nothing for Dennis. Just wait again.
    // Detected by the marker, never by the text (ADR 0002 amendment).
    me.rearmPending = false;
  } else if (role === 'lead') {
    const parsed = parseTag(reply);
    // One nudge per reply: the reply after a nudge is never nudged again.
    const alreadyNudged = me.nudgePending === true;
    me.nudgePending = false;
    if (!parsed.tagged && !alreadyNudged && hasBuriedCodeTag(reply)) {
      // The lead wrote something before its TO CODE: line. Instead of ending
      // the run, ask it to resend. The parser itself stays strict.
      me.nudgePending = true;
      me.busy = true;
      me.waiter = null;
      log.push({ time, project, kind: 'nudge', from: 'lead', to: 'lead', message: parsed.body });
      return { wait: false, wake: NUDGE_MESSAGE, log };
    }
    if (parsed.to === 'dennis') {
      state.rounds = 0;
      me.waiter = null;
      log.push({
        time,
        project,
        kind: 'to-dennis',
        from: 'lead',
        to: 'dennis',
        message: parsed.body,
      });
      return { wait: false, log };
    }
    if (!startRound(state, config.maxRounds)) {
      // Limit reached: hand control back to Dennis instead of delivering.
      state.rounds = 0;
      me.waiter = null;
      log.push({
        time,
        project,
        kind: 'max-rounds',
        from: 'lead',
        to: 'dennis',
        message: `Stopped after ${config.maxRounds} rounds. Not delivered: ${parsed.body}`,
      });
      return { wait: false, log };
    }
    enqueueMessage(state, 'lead', 'builder', parsed.body, now);
    log.push({ time, project, kind: 'handoff', from: 'lead', to: 'builder', message: parsed.body });
  } else if (me.owesReply) {
    // The builder finished a task Relay gave it: its reply is the report.
    me.owesReply = false;
    const report = reply.trim() || '(The builder replied with no text.)';
    enqueueMessage(state, 'builder', 'lead', report, now);
    log.push({ time, project, kind: 'handoff', from: 'builder', to: 'lead', message: report });
  }
  // Otherwise: a builder reply nobody is waiting for (Dennis chatting with it
  // directly, or its first "ready" turn). Nothing to send; just wait.

  registerWaiter(state, role, {
    sessionId: ctx.sessionId,
    pid: ctx.pid,
    startedAt: time,
    deadline: new Date(now.getTime() + ctx.timeoutSeconds * 1000).toISOString(),
  });
  return { wait: true, log };
}

// ---------------------------------------------------------------------------
// While waiting (checked every half second)
// ---------------------------------------------------------------------------

export type TickResult =
  | { action: 'keep-waiting' }
  /** Stop waiting without waking the session (a newer waiter took over, or Relay stopped). */
  | { action: 'retire' }
  /** Wake the session with this text. */
  | { action: 'deliver'; text: string }
  /** No message before the deadline: ask for a tiny "WAITING" turn so a fresh waiter starts. */
  | { action: 'rearm'; text: string };

/**
 * One check of the waiting loop. `rearmAt` is when to give up waiting and
 * re-arm, a little before the hook's timeout would kill it.
 */
export function decideOnTick(
  state: RelayState,
  role: Role,
  pid: number,
  now: Date,
  rearmAt: Date,
): TickResult {
  const me = state.sessions[role];

  // One waiter per session: if a newer one registered, step aside quietly.
  if (!isCurrentWaiter(state, role, pid)) return { action: 'retire' };

  if (state.stopped) {
    clearWaiter(state, role, pid);
    return { action: 'retire' };
  }

  // Dennis is using this session. Waking it now would hijack his turn
  // (spike 005). When his turn ends, its Stop hook becomes the new waiter.
  if (me.busy) return { action: 'keep-waiting' };

  // While paused, messages stay queued.
  const message = state.paused ? undefined : takeMessageFor(state, role);
  if (message) {
    me.busy = true;
    clearWaiter(state, role, pid);
    // The builder's next reply answers this message. (Every lead reply is
    // read for its tag anyway, so the lead never needs the flag.)
    if (role === 'builder') me.owesReply = true;
    return { action: 'deliver', text: formatDelivery(message.from, message.text) };
  }

  if (now.getTime() >= rearmAt.getTime()) {
    me.busy = true;
    me.rearmPending = true;
    clearWaiter(state, role, pid);
    return { action: 'rearm', text: REARM_MESSAGE };
  }
  return { action: 'keep-waiting' };
}

/**
 * When a waiter should re-arm: before the timeout, leaving a safety margin of
 * a quarter of the timeout, at most 60 s.
 */
export function rearmTime(start: Date, timeoutSeconds: number): Date {
  const marginSeconds = Math.min(60, timeoutSeconds / 4);
  return new Date(start.getTime() + (timeoutSeconds - marginSeconds) * 1000);
}
