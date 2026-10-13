/**
 * The Stop hook: runs every time Claude finishes a reply.
 *
 *   1. Decide what the reply means and record it (decideOnStop).
 *   2. If this session should wait, poll the state until there is a message
 *      to deliver, a reason to retire, or it's time to re-arm (decideOnTick).
 *   3. Hand the result to Claude Code in the form the delivery mode needs.
 *
 * Steps 1 and 2 are the same for both delivery modes. Only step 3 differs.
 */
import {
  appendActivity,
  readState,
  type RelayConfig,
  type Role,
  stateDir,
  updateState,
} from '@relay/core';

import {
  decideOnStop,
  decideOnTick,
  rearmTime,
  type StopDecision,
  type TickResult,
} from './decide.js';
import { type HookDeps, relayHomeFrom } from './deps.js';
import type { HookInput } from './input.js';
import { ALLOW_STOP, deliveryOutput, type HookOutput } from './output.js';

export interface StopOptions {
  config: RelayConfig;
  role: Role;
  timeoutSeconds: number;
  input: HookInput;
}

export async function runStop(options: StopOptions, deps: HookDeps): Promise<HookOutput> {
  const { config, role, timeoutSeconds, input } = options;
  const dir = stateDir(config.name, relayHomeFrom(deps.env));
  const startedAt = deps.now();

  // 1. Decide, under the state lock.
  let decision: StopDecision = { wait: false, log: [] };
  await updateState(dir, (state) => {
    decision = decideOnStop(state, {
      role,
      config,
      reply: input.lastAssistantMessage,
      sessionId: input.sessionId,
      pid: deps.pid,
      now: startedAt,
      timeoutSeconds,
    });
  });
  for (const entry of decision.log) await appendActivity(dir, entry);
  if (decision.wake) return deliveryOutput(config.delivery, decision.wake);
  if (!decision.wait) return ALLOW_STOP;

  // 2. Wait.
  const result = await waitForTurn(dir, role, rearmTime(startedAt, timeoutSeconds), deps);

  // 3. Answer Claude Code.
  if (result.action === 'deliver' || result.action === 'rearm') {
    return deliveryOutput(config.delivery, result.text);
  }
  return ALLOW_STOP;
}

/**
 * The shared waiting loop. Most checks find nothing to do, so each check
 * first looks at an unlocked copy of the state. Only when something should
 * happen does it take the lock and decide again on the latest state.
 */
async function waitForTurn(
  dir: string,
  role: Role,
  rearmAt: Date,
  deps: HookDeps,
): Promise<Exclude<TickResult, { action: 'keep-waiting' }>> {
  for (;;) {
    const peek = await peekTick(dir, role, rearmAt, deps);
    if (peek !== 'keep-waiting') {
      let result: TickResult = { action: 'keep-waiting' };
      await updateState(dir, (state) => {
        result = decideOnTick(state, role, deps.pid, deps.now(), rearmAt);
      });
      if (result.action !== 'keep-waiting') return result;
    }
    await deps.sleep(deps.pollMs);
  }
}

/** Would a check do anything right now? Decides on a throwaway copy of the state. */
async function peekTick(
  dir: string,
  role: Role,
  rearmAt: Date,
  deps: HookDeps,
): Promise<TickResult['action']> {
  try {
    const copy = await readState(dir);
    return decideOnTick(copy, role, deps.pid, deps.now(), rearmAt).action;
  } catch {
    // On Windows a read can fail for a moment while another process renames
    // the file into place. Treat it as "nothing yet" and check again.
    return 'keep-waiting';
  }
}
