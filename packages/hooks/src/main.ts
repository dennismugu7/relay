/**
 * The entry point both hook scripts share: parse arguments and input, load
 * the config, run the hook, and turn any failure into a clear result.
 *
 * A hook that crashes in the background shows nothing on screen (spike 004),
 * so failures are also written to the activity log when possible.
 */
import { appendActivity, loadConfig, type RelayConfig, stateDir } from '@relay/core';

import { parseHookArgs } from './args.js';
import { type HookDeps, relayHomeFrom } from './deps.js';
import { parseHookInput } from './input.js';
import type { HookOutput } from './output.js';
import { runPromptSubmit } from './prompt-submit.js';
import { runStop } from './stop.js';

export type HookEvent = 'stop' | 'prompt-submit';

export async function runHook(
  event: HookEvent,
  argv: string[],
  stdin: string,
  deps: HookDeps,
): Promise<HookOutput> {
  let config: RelayConfig | undefined;
  try {
    const args = parseHookArgs(argv);
    config = await loadConfig(args.configPath);
    const input = parseHookInput(stdin);
    if (event === 'prompt-submit') {
      return await runPromptSubmit({ config, role: args.role }, deps);
    }
    return await runStop(
      { config, role: args.role, timeoutSeconds: args.timeoutSeconds, input },
      deps,
    );
  } catch (error) {
    const message = `Relay ${event} hook failed: ${(error as Error).message}`;
    if (config) {
      const dir = stateDir(config.name, relayHomeFrom(deps.env));
      await appendActivity(dir, { project: config.name, kind: 'error', message }).catch(() => {});
    }
    // Exit code 1 is a non-blocking error: Claude Code carries on as normal.
    return { exitCode: 1, stdout: '', stderr: message };
  }
}
