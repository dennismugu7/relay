/**
 * Command-line arguments for the hook scripts.
 *
 * Each session's `.claude/settings.json` runs a hook like this:
 *   node <relay>/packages/hooks/dist/bin/stop.js --config <relay.config.json> --role lead --timeout 3600
 * `--timeout` must match the hook's `timeout` in settings.json, so the waiter
 * knows when to re-arm (ADR 0002).
 */
import { parseArgs } from 'node:util';

import type { Role } from '@relay/core';

export interface HookArgs {
  /** Path to the project's relay.config.json. */
  configPath: string;
  /** Which session this hook runs in. */
  role: Role;
  /** The hook's timeout in seconds, as set in settings.json. */
  timeoutSeconds: number;
}

/** The default hook timeout: one hour. */
export const DEFAULT_TIMEOUT_SECONDS = 3600;

/** Thrown when the hook was started with wrong arguments. */
export class UsageError extends Error {
  override name = 'UsageError';
}

export function parseHookArgs(argv: string[]): HookArgs {
  let values;
  try {
    ({ values } = parseArgs({
      args: argv,
      options: {
        config: { type: 'string' },
        role: { type: 'string' },
        timeout: { type: 'string' },
      },
    }));
  } catch (error) {
    throw new UsageError((error as Error).message);
  }

  const { config, role, timeout } = values;
  if (!config) throw new UsageError('Missing --config <path to relay.config.json>.');
  if (role !== 'lead' && role !== 'builder') {
    throw new UsageError('--role must be "lead" or "builder".');
  }
  const timeoutSeconds = timeout === undefined ? DEFAULT_TIMEOUT_SECONDS : Number(timeout);
  if (!Number.isInteger(timeoutSeconds) || timeoutSeconds < 10) {
    throw new UsageError('--timeout must be a whole number of seconds, at least 10.');
  }
  return { configPath: config, role, timeoutSeconds };
}
