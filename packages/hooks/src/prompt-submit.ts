/**
 * The UserPromptSubmit hook: runs when a turn starts, before Claude sees the
 * prompt. It marks the session busy, so no waiter delivers into the middle of
 * the turn (ADR 0002, spike 009).
 *
 * Spike 009 found it also runs for turns a Relay waiter started. Marking those
 * busy is correct too, so it doesn't need to tell the two apart.
 */
import { type RelayConfig, type Role, stateDir, updateState } from '@relay/core';

import { type HookDeps, relayHomeFrom } from './deps.js';
import { ALLOW_STOP, type HookOutput } from './output.js';

export async function runPromptSubmit(
  options: { config: RelayConfig; role: Role },
  deps: HookDeps,
): Promise<HookOutput> {
  const dir = stateDir(options.config.name, relayHomeFrom(deps.env));
  await updateState(dir, (state) => {
    state.sessions[options.role].busy = true;
  });
  // Exit 0 with no output: the prompt goes ahead unchanged.
  return ALLOW_STOP;
}
