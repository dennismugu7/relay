/**
 * The shared state file, `state.json`, for one project.
 *
 * Holds everything the hooks and the CLI must agree on (ADR 0002):
 * the message queue, each session's waiter, busy flag and re-arm marker,
 * the round counter, and the paused/stopped flags.
 *
 * Read it with `readState`. Change it only with `updateState`, which locks
 * the file so two processes can't overwrite each other (ADR 0003).
 */
import { randomUUID } from 'node:crypto';
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import { writeFileAtomic } from './atomic.js';
import { type LockOptions, withLock } from './lock.js';
import { STATE_FILE, STATE_LOCK_FILE } from './paths.js';

/** The two sessions Relay connects. */
export type Role = 'lead' | 'builder';

/** The hook process currently waiting to deliver the next message to a session. */
export interface WaiterRecord {
  /** Claude Code's session ID, from the hook input. */
  sessionId: string;
  /** The waiter's process ID, used to check that it is still alive. */
  pid: number;
  /** When it started waiting (ISO 8601 time). */
  startedAt: string;
  /** When its hook timeout runs out (ISO 8601 time). It must re-arm before this. */
  deadline: string;
}

export interface SessionState {
  /** True while the session is working on a turn; messages are only delivered when false. */
  busy: boolean;
  /** The current waiter, or null if nobody is waiting for this session. */
  waiter: WaiterRecord | null;
  /**
   * The re-arm marker: true from the moment a waiter sends a re-arm until the
   * next Stop hook sees it. That Stop must re-arm again, not treat the reply
   * ("WAITING") as a message for Dennis. See ADR 0002's amendment.
   */
  rearmPending: boolean;
  /**
   * True after Relay delivered a message to this session: its next reply is
   * the answer and goes back to the other session. Used for the builder, so a
   * chat Dennis has with the builder directly is not forwarded as a report.
   */
  owesReply: boolean;
  /**
   * The nudge marker (lead only): true after Relay asked the lead to resend a
   * reply with its tag first. The next reply is never nudged again, so a
   * wrong resend goes to Dennis as normal. Older state files may lack it.
   */
  nudgePending?: boolean;
}

/** A message waiting to be delivered. */
export interface QueuedMessage {
  id: string;
  from: Role;
  to: Role;
  text: string;
  /** When it was queued (ISO 8601 time). */
  queuedAt: string;
}

export interface RelayState {
  /** File format version, so a future change can be detected. */
  version: 1;
  /** Messages waiting for delivery, oldest first. */
  queue: QueuedMessage[];
  sessions: Record<Role, SessionState>;
  /** Rounds since control last returned to Dennis. */
  rounds: number;
  /** Set by `relay pause`: no handoffs until `relay resume`. */
  paused: boolean;
  /** Set by `relay stop`: the run is over. */
  stopped: boolean;
}

/** Thrown when `state.json` exists but can't be used. */
export class StateError extends Error {
  override name = 'StateError';
}

/** The state of a project that has never run. */
export function initialState(): RelayState {
  const idle = (): SessionState => ({
    busy: false,
    waiter: null,
    rearmPending: false,
    owesReply: false,
  });
  return {
    version: 1,
    queue: [],
    sessions: { lead: idle(), builder: idle() },
    rounds: 0,
    paused: false,
    stopped: false,
  };
}

/**
 * Reads a project's state. Returns the initial state if there is no file yet.
 * No lock is needed: writes are atomic, so the file is always complete.
 */
export async function readState(dir: string): Promise<RelayState> {
  const file = path.join(dir, STATE_FILE);
  let text: string;
  try {
    text = await readFile(file, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return initialState();
    throw error;
  }
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (error) {
    throw new StateError(`${file} is not valid JSON: ${(error as Error).message}`);
  }
  if (!looksLikeState(value)) {
    throw new StateError(`${file} is not a Relay version 1 state file.`);
  }
  return value;
}

/** A quick shape check, enough to catch a wrong or hand-damaged file. */
function looksLikeState(value: unknown): value is RelayState {
  const v = value as Partial<RelayState> | null;
  return (
    typeof v === 'object' &&
    v !== null &&
    v.version === 1 &&
    Array.isArray(v.queue) &&
    typeof v.sessions?.lead === 'object' &&
    typeof v.sessions?.builder === 'object' &&
    typeof v.rounds === 'number' &&
    typeof v.paused === 'boolean' &&
    typeof v.stopped === 'boolean'
  );
}

/**
 * The only way to change the state. Locks the file, reads the latest state,
 * lets `change` modify it, writes it back atomically, and unlocks.
 *
 * `change` is synchronous on purpose: nobody should hold the lock while
 * waiting for something slow. If it throws, nothing is written.
 */
export async function updateState(
  dir: string,
  change: (state: RelayState) => void,
  options: LockOptions = {},
): Promise<RelayState> {
  await mkdir(dir, { recursive: true });
  return withLock(
    path.join(dir, STATE_LOCK_FILE),
    async () => {
      const state = await readState(dir);
      change(state);
      await writeFileAtomic(path.join(dir, STATE_FILE), JSON.stringify(state, null, 2) + '\n');
      return state;
    },
    options,
  );
}

// ---------------------------------------------------------------------------
// Helpers for use inside `updateState`. Each one changes the state it's given.
// Simple flags (busy, rearmPending, owesReply, paused, stopped) are set directly, e.g.
//   await updateState(dir, (s) => { s.sessions.lead.busy = true; });
// ---------------------------------------------------------------------------

/** Adds a message to the end of the queue and returns it. */
export function enqueueMessage(
  state: RelayState,
  from: Role,
  to: Role,
  text: string,
  now: Date = new Date(),
): QueuedMessage {
  const message = { id: randomUUID(), from, to, text, queuedAt: now.toISOString() };
  state.queue.push(message);
  return message;
}

/** Removes and returns the oldest message for `role`, or undefined if there is none. */
export function takeMessageFor(state: RelayState, role: Role): QueuedMessage | undefined {
  const index = state.queue.findIndex((m) => m.to === role);
  if (index === -1) return undefined;
  return state.queue.splice(index, 1)[0];
}

/**
 * Makes `waiter` the session's only waiter. Any older waiter is replaced;
 * it will notice with `isCurrentWaiter` and exit without delivering.
 */
export function registerWaiter(state: RelayState, role: Role, waiter: WaiterRecord): void {
  state.sessions[role].waiter = waiter;
}

/** True if the process `pid` is the session's current waiter. */
export function isCurrentWaiter(state: RelayState, role: Role, pid: number): boolean {
  return state.sessions[role].waiter?.pid === pid;
}

/**
 * Removes the session's waiter record, but only if it belongs to `pid`.
 * Returns false if a newer waiter has taken over (its record is kept).
 */
export function clearWaiter(state: RelayState, role: Role, pid: number): boolean {
  if (!isCurrentWaiter(state, role, pid)) return false;
  state.sessions[role].waiter = null;
  return true;
}

/**
 * Starts a new round if the limit allows it.
 * Returns false, and changes nothing, once `maxRounds` rounds have run.
 */
export function startRound(state: RelayState, maxRounds: number): boolean {
  if (state.rounds >= maxRounds) return false;
  state.rounds++;
  return true;
}
