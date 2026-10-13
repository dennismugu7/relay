/**
 * A simple lock between processes, using a lock file.
 *
 * The lead's hook, the builder's hook and the `relay` CLI all update the same
 * state file. Without a lock, two of them could read the same old state, each
 * change it, and the second write would wipe out the first ("lost update").
 *
 * Creating a file with the `wx` flag fails if the file already exists, and the
 * operating system guarantees only one process can win. Whoever creates the
 * lock file holds the lock; deleting it releases the lock. See ADR 0003.
 */
import { randomUUID } from 'node:crypto';
import { open, readFile, rm, stat } from 'node:fs/promises';
import { setTimeout as sleep } from 'node:timers/promises';

export interface LockOptions {
  /** Give up after waiting this long. Default 15 s. */
  timeoutMs?: number;
  /** A lock file older than this is from a crashed process and may be removed. Default 10 s. */
  staleMs?: number;
  /** Wait about this long between attempts. Default 10 ms. */
  retryMs?: number;
}

/** Thrown when the lock could not be taken in time. */
export class LockTimeoutError extends Error {
  override name = 'LockTimeoutError';
}

// Error codes that mean "someone else has the lock right now". On Windows a
// file that is being deleted can't be opened for a moment and gives EPERM.
const BUSY_CODES = new Set(['EEXIST', 'EPERM', 'EACCES', 'EBUSY']);

function errorCode(error: unknown): string | undefined {
  return (error as NodeJS.ErrnoException).code;
}

/**
 * Runs `fn` while holding the lock at `lockPath`, and always releases it,
 * even if `fn` throws.
 */
export async function withLock<T>(
  lockPath: string,
  fn: () => Promise<T>,
  options: LockOptions = {},
): Promise<T> {
  const token = await acquire(lockPath, options);
  try {
    return await fn();
  } finally {
    await release(lockPath, token);
  }
}

async function acquire(lockPath: string, options: LockOptions): Promise<string> {
  const { timeoutMs = 15_000, staleMs = 10_000, retryMs = 10 } = options;
  // A unique token, so on release we only delete a lock that is still ours.
  const token = `${process.pid} ${randomUUID()}`;
  const startedAt = Date.now();

  for (;;) {
    try {
      const handle = await open(lockPath, 'wx');
      try {
        await handle.writeFile(token);
      } finally {
        await handle.close();
      }
      return token;
    } catch (error) {
      if (!BUSY_CODES.has(errorCode(error) ?? '')) throw error;
    }

    await removeIfStale(lockPath, staleMs);
    if (Date.now() - startedAt > timeoutMs) {
      const owner = await readFile(lockPath, 'utf8').catch(() => 'unknown');
      throw new LockTimeoutError(
        `Timed out after ${timeoutMs} ms waiting for ${lockPath} (held by: ${owner})`,
      );
    }
    // A little randomness stops two waiting processes from retrying in step.
    await sleep(retryMs + Math.random() * retryMs);
  }
}

/** Removes a lock file left behind by a process that crashed while holding it. */
async function removeIfStale(lockPath: string, staleMs: number): Promise<void> {
  try {
    const { mtimeMs } = await stat(lockPath);
    if (Date.now() - mtimeMs > staleMs) {
      await rm(lockPath, { force: true });
    }
  } catch {
    // The lock was released while we looked. Just try again.
  }
}

async function release(lockPath: string, token: string): Promise<void> {
  const current = await readFile(lockPath, 'utf8').catch(() => undefined);
  if (current === token) {
    await rm(lockPath, { force: true });
  }
}
