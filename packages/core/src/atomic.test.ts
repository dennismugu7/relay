import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { renameWithRetry, writeFileAtomic } from './atomic.js';

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), 'relay-atomic-'));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

function errno(code: string): NodeJS.ErrnoException {
  return Object.assign(new Error(code), { code });
}

describe('writeFileAtomic', () => {
  it('creates a new file', async () => {
    const file = path.join(dir, 'state.json');
    await writeFileAtomic(file, '{"a":1}');
    expect(await readFile(file, 'utf8')).toBe('{"a":1}');
  });

  it('replaces an existing file and leaves no temp files behind', async () => {
    const file = path.join(dir, 'state.json');
    await writeFile(file, 'old');
    await writeFileAtomic(file, 'new');
    expect(await readFile(file, 'utf8')).toBe('new');
    expect(await readdir(dir)).toEqual(['state.json']);
  });

  it('cleans up its temp file when the write fails', async () => {
    const file = path.join(dir, 'missing-folder', 'state.json');
    await expect(writeFileAtomic(file, 'x')).rejects.toThrow();
    expect(await readdir(dir)).toEqual([]);
  });
});

describe('renameWithRetry', () => {
  it('retries a rename that fails for a moment on Windows', async () => {
    let calls = 0;
    const flaky = () => {
      calls++;
      return calls < 3 ? Promise.reject(errno('EPERM')) : Promise.resolve();
    };
    await renameWithRetry('a', 'b', flaky);
    expect(calls).toBe(3);
  });

  it('gives up after the last attempt', async () => {
    let calls = 0;
    const alwaysBusy = () => {
      calls++;
      return Promise.reject(errno('EBUSY'));
    };
    await expect(renameWithRetry('a', 'b', alwaysBusy, 3)).rejects.toThrow('EBUSY');
    expect(calls).toBe(3);
  });

  it('does not retry other errors', async () => {
    let calls = 0;
    const missing = () => {
      calls++;
      return Promise.reject(errno('ENOENT'));
    };
    await expect(renameWithRetry('a', 'b', missing)).rejects.toThrow('ENOENT');
    expect(calls).toBe(1);
  });
});
