import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm, utimes, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { LockTimeoutError, withLock } from './lock.js';

let dir: string;
let lockPath: string;
beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), 'relay-lock-'));
  lockPath = path.join(dir, 'state.lock');
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('withLock', () => {
  it('holds the lock file while fn runs, then removes it', async () => {
    const result = await withLock(lockPath, async () => {
      expect(existsSync(lockPath)).toBe(true);
      expect(await readFile(lockPath, 'utf8')).toContain(String(process.pid));
      return 'done';
    });
    expect(result).toBe('done');
    expect(existsSync(lockPath)).toBe(false);
  });

  it('releases the lock when fn throws', async () => {
    await expect(withLock(lockPath, () => Promise.reject(new Error('boom')))).rejects.toThrow(
      'boom',
    );
    expect(existsSync(lockPath)).toBe(false);
  });

  it('lets only one caller in at a time', async () => {
    let inside = 0;
    let mostInside = 0;
    const work = () =>
      withLock(lockPath, async () => {
        inside++;
        mostInside = Math.max(mostInside, inside);
        await sleep(5);
        inside--;
      });
    await Promise.all([work(), work(), work(), work()]);
    expect(mostInside).toBe(1);
  });

  it('gives up with a clear error when a fresh lock is held', async () => {
    await writeFile(lockPath, '999 someone-else');
    const attempt = withLock(lockPath, () => Promise.resolve(), { timeoutMs: 100 });
    await expect(attempt).rejects.toThrow(LockTimeoutError);
    await expect(withLock(lockPath, () => Promise.resolve(), { timeoutMs: 100 })).rejects.toThrow(
      'held by: 999 someone-else',
    );
  });

  it('removes a stale lock left by a crashed process', async () => {
    await writeFile(lockPath, '999 crashed');
    const oneMinuteAgo = new Date(Date.now() - 60_000);
    await utimes(lockPath, oneMinuteAgo, oneMinuteAgo);
    await expect(
      withLock(lockPath, () => Promise.resolve('got it'), { staleMs: 1_000, timeoutMs: 2_000 }),
    ).resolves.toBe('got it');
  });

  it('does not delete a lock that is no longer its own', async () => {
    await withLock(lockPath, async () => {
      // Simulate another process having broken our lock and taken it.
      await writeFile(lockPath, '999 new-owner');
    });
    expect(await readFile(lockPath, 'utf8')).toBe('999 new-owner');
  });
});
