/**
 * Things a hook needs from the outside world, passed in so tests can fake
 * them: the clock, waiting, the process ID and environment variables.
 */
import { setTimeout as sleep } from 'node:timers/promises';

import { relayHome } from '@relay/core';

export interface HookDeps {
  now: () => Date;
  sleep: (ms: number) => Promise<void>;
  pid: number;
  env: Record<string, string | undefined>;
  /** How often a waiter checks for a message. */
  pollMs: number;
}

/** The real world, used by the scripts in `bin/`. */
export function realDeps(): HookDeps {
  return {
    now: () => new Date(),
    sleep: (ms) => sleep(ms),
    pid: process.pid,
    env: process.env,
    pollMs: 500,
  };
}

/**
 * Relay's home folder. The `RELAY_HOME` environment variable overrides the
 * default `~/.relay`, which keeps test runs out of the real one.
 */
export function relayHomeFrom(env: HookDeps['env']): string {
  return env.RELAY_HOME || relayHome();
}
