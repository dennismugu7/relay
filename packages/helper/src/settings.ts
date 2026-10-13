/**
 * Adding Relay's entries to a Claude Code settings file, and taking them out
 * again, without touching anything else in the file.
 *
 * Relay's hook entries are recognised by the hook script they run (a path
 * ending in `hooks/dist/bin/stop.js` or `prompt-submit.js`), so nothing extra
 * needs to be stored in the user's file. See ADR 0006.
 */
import type { DeliveryMode, Role } from '@relay/core';

/** The block-cap value Relay sets in blocking mode (spike 002). */
export const RELAY_BLOCK_CAP = '1000';
const BLOCK_CAP_KEY = 'CLAUDE_CODE_STOP_HOOK_BLOCK_CAP';

/** A settings file is any JSON object. We only look at the keys we own. */
export type Settings = Record<string, unknown>;

export interface HookSpec {
  role: Role;
  delivery: DeliveryMode;
  timeoutSeconds: number;
  configPath: string;
  stopScript: string;
  promptScript: string;
}

interface HookCommand {
  type: 'command';
  command: string;
  args: string[];
  asyncRewake?: boolean;
  timeout?: number;
}
interface HookGroup {
  hooks: HookCommand[];
}

/** The `Stop` and `UserPromptSubmit` entries Relay wants for one session. */
export function relayHookGroups(spec: HookSpec): { Stop: HookGroup; UserPromptSubmit: HookGroup } {
  const common = ['--config', spec.configPath, '--role', spec.role];
  const stop: HookCommand = {
    type: 'command',
    command: 'node',
    args: [spec.stopScript, ...common, '--timeout', String(spec.timeoutSeconds)],
    // rewake: the hook waits in the background and wakes the idle session.
    // blocking: no asyncRewake, so the session waits for the hook (ADR 0002).
    ...(spec.delivery === 'rewake' ? { asyncRewake: true } : {}),
    timeout: spec.timeoutSeconds,
  };
  const prompt: HookCommand = {
    type: 'command',
    command: 'node',
    args: [spec.promptScript, ...common],
  };
  return { Stop: { hooks: [stop] }, UserPromptSubmit: { hooks: [prompt] } };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** True if a hook group runs one of Relay's hook scripts. */
export function isRelayGroup(group: unknown): boolean {
  if (!isObject(group) || !Array.isArray(group.hooks)) return false;
  return group.hooks.some((hook) => {
    if (!isObject(hook) || !Array.isArray(hook.args)) return false;
    const script = String(hook.args[0] ?? '').replace(/\\/g, '/');
    return /hooks\/dist\/bin\/(stop|prompt-submit)\.js$/.test(script);
  });
}

/** Returns a copy of `settings` without any of Relay's entries. */
export function removeRelaySettings(settings: Settings, builderPath?: string): Settings {
  const result: Settings = structuredClone(settings);

  if (isObject(result.hooks)) {
    const hooks = result.hooks;
    for (const event of ['Stop', 'UserPromptSubmit']) {
      const groups = hooks[event];
      if (!Array.isArray(groups)) continue;
      const kept = groups.filter((g) => !isRelayGroup(g));
      if (kept.length > 0) hooks[event] = kept;
      else delete hooks[event];
    }
    if (Object.keys(hooks).length === 0) delete result.hooks;
  }

  if (isObject(result.env) && result.env[BLOCK_CAP_KEY] === RELAY_BLOCK_CAP) {
    delete result.env[BLOCK_CAP_KEY];
    if (Object.keys(result.env).length === 0) delete result.env;
  }

  if (builderPath && isObject(result.permissions)) {
    const permissions = result.permissions;
    const dirs = permissions.additionalDirectories;
    if (Array.isArray(dirs)) {
      const kept = dirs.filter((d) => d !== builderPath);
      if (kept.length > 0) permissions.additionalDirectories = kept;
      else delete permissions.additionalDirectories;
    }
    if (Object.keys(permissions).length === 0) delete result.permissions;
  }
  return result;
}

/**
 * Returns a copy of `settings` with Relay's entries for one session.
 * Any older Relay entries are replaced, so running it twice gives the same
 * result. Everything else in the file is kept as it was.
 */
export function addRelaySettings(
  settings: Settings,
  spec: HookSpec,
  options: { readProjectFrom?: string } = {},
): Settings {
  const result = removeRelaySettings(settings, options.readProjectFrom);
  const groups = relayHookGroups(spec);

  const hooks = isObject(result.hooks) ? result.hooks : {};
  for (const event of ['Stop', 'UserPromptSubmit'] as const) {
    const existing = Array.isArray(hooks[event]) ? (hooks[event] as unknown[]) : [];
    hooks[event] = [...existing, groups[event]];
  }
  result.hooks = hooks;

  if (spec.delivery === 'blocking') {
    const env = isObject(result.env) ? result.env : {};
    env[BLOCK_CAP_KEY] = RELAY_BLOCK_CAP;
    result.env = env;
  }

  // The lead may read the project, to plan and to review the builder's work.
  if (options.readProjectFrom) {
    const permissions = isObject(result.permissions) ? result.permissions : {};
    const dirs = Array.isArray(permissions.additionalDirectories)
      ? (permissions.additionalDirectories as unknown[])
      : [];
    permissions.additionalDirectories = [...dirs, options.readProjectFrom];
    result.permissions = permissions;
  }
  return result;
}

/** Parses a settings file's text. An empty or missing file is `{}`. */
export function parseSettings(text: string | undefined, file: string): Settings {
  if (text === undefined || text.trim() === '') return {};
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (error) {
    throw new Error(
      `${file} is not valid JSON, so Relay won't change it: ${(error as Error).message}`,
      { cause: error },
    );
  }
  if (!isObject(value)) throw new Error(`${file} must contain a JSON object.`);
  return value;
}

/** The text Relay writes for a settings file: 2-space JSON with a final newline. */
export function formatSettings(settings: Settings): string {
  return JSON.stringify(settings, null, 2) + '\n';
}
