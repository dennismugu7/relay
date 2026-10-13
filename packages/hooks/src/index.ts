/**
 * @relay/hooks — the Stop and UserPromptSubmit hooks each Relay-managed
 * Claude Code session runs. The scripts Claude Code starts are in `bin/`;
 * this entry point exports the logic for tests and the helper (M4).
 */

/** The npm name of this package. Lets tests prove the package builds and loads. */
export const PACKAGE_NAME = '@relay/hooks';

export { DEFAULT_TIMEOUT_SECONDS, parseHookArgs, type HookArgs } from './args.js';
export { decideOnStop, decideOnTick, NUDGE_MESSAGE, REARM_MESSAGE } from './decide.js';
export { runHook, type HookEvent } from './main.js';
export type { HookOutput } from './output.js';
