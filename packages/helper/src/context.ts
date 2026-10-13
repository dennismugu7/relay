/**
 * What every `relay` command needs from the outside world, passed in so
 * tests can use temporary folders, a fixed clock and captured output.
 */
import { realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { relayHome } from '@relay/core';

export interface CliContext {
  /** The folder the command was run from. */
  cwd: string;
  /** Relay's home folder (normally ~/.relay). */
  relayHome: string;
  /** Where the built hook scripts are (packages/hooks/dist/bin). */
  hooksBinDir: string;
  /** Where init's templates are (packages/helper/templates). */
  templatesDir: string;
  now: () => Date;
  /** Is a process with this PID still running? */
  isAlive: (pid: number) => boolean;
  /** Prints one line of output. */
  print: (line: string) => void;
}

/** True if a process with this PID exists. Signal 0 checks without sending anything. */
export function processIsAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // EPERM means it exists but belongs to someone else.
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}

/** The real world, used by bin/relay.js. */
export function realContext(): CliContext {
  const require = createRequire(import.meta.url);
  // Follow npm link's symlinks to the real folder inside this repo.
  const hooksPackage = realpathSync(path.dirname(require.resolve('@relay/hooks/package.json')));
  const here = path.dirname(fileURLToPath(import.meta.url));
  return {
    cwd: process.cwd(),
    relayHome: process.env.RELAY_HOME || relayHome(),
    hooksBinDir: path.join(hooksPackage, 'dist', 'bin'),
    templatesDir: path.resolve(here, '..', 'templates'),
    now: () => new Date(),
    isAlive: processIsAlive,
    print: (line) => console.log(line),
  };
}
