import { existsSync } from 'node:fs';
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { runWorkers } from './__fixtures__/run-workers.js';
import {
  clearWaiter,
  enqueueMessage,
  initialState,
  isCurrentWaiter,
  readState,
  registerWaiter,
  startRound,
  StateError,
  takeMessageFor,
  updateState,
  type WaiterRecord,
} from './state.js';

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), 'relay-state-'));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const waiter = (pid: number): WaiterRecord => ({
  sessionId: 'session-1',
  pid,
  startedAt: '2026-10-13T10:00:00.000Z',
  deadline: '2026-10-13T11:00:00.000Z',
});

describe('readState', () => {
  it('returns the initial state when there is no file yet', async () => {
    expect(await readState(dir)).toEqual(initialState());
  });

  it('starts with both sessions idle and nothing queued', () => {
    expect(initialState()).toEqual({
      version: 1,
      queue: [],
      sessions: {
        lead: { busy: false, waiter: null, rearmPending: false },
        builder: { busy: false, waiter: null, rearmPending: false },
      },
      rounds: 0,
      paused: false,
      stopped: false,
    });
  });

  it('rejects a file that is not valid JSON', async () => {
    await writeFile(path.join(dir, 'state.json'), '{ "version": 1, ');
    await expect(readState(dir)).rejects.toThrow(StateError);
    await expect(readState(dir)).rejects.toThrow('is not valid JSON');
  });

  it.each([
    ['another version', { ...initialState(), version: 2 }],
    ['a missing session', { ...initialState(), sessions: { lead: {} } }],
    ['rounds as text', { ...initialState(), rounds: '3' }],
    ['an array', []],
  ])('rejects a file with %s', async (_name, value) => {
    await writeFile(path.join(dir, 'state.json'), JSON.stringify(value));
    await expect(readState(dir)).rejects.toThrow('is not a Relay version 1 state file');
  });
});

describe('updateState', () => {
  it('creates the folder and saves the change', async () => {
    const projectDir = path.join(dir, 'app1');
    const returned = await updateState(projectDir, (s) => {
      s.paused = true;
      s.sessions.builder.busy = true;
    });
    const saved = await readState(projectDir);
    expect(saved).toEqual(returned);
    expect(saved.paused).toBe(true);
    expect(saved.sessions.builder.busy).toBe(true);
  });

  it('builds on the previous change', async () => {
    await updateState(dir, (s) => void s.rounds++);
    await updateState(dir, (s) => void s.rounds++);
    expect((await readState(dir)).rounds).toBe(2);
  });

  it('writes nothing and releases the lock when the change throws', async () => {
    await updateState(dir, (s) => void (s.rounds = 1));
    await expect(
      updateState(dir, (s) => {
        s.rounds = 99;
        throw new Error('changed my mind');
      }),
    ).rejects.toThrow('changed my mind');
    expect((await readState(dir)).rounds).toBe(1);
    expect(existsSync(path.join(dir, 'state.lock'))).toBe(false);
  });

  it('leaves only state.json behind', async () => {
    await updateState(dir, (s) => void (s.stopped = true));
    expect(await readdir(dir)).toEqual(['state.json']);
  });

  it('loses no updates when two processes change the state at the same time', async () => {
    const results = await runWorkers(dir, 50, 'state', ['A', 'B']);
    for (const r of results) expect(r, r.stderr).toMatchObject({ code: 0 });

    const state = await readState(dir);
    expect(state.rounds).toBe(100);
    expect(state.queue).toHaveLength(100);
    // Every message from both processes is there, in each process's order.
    for (const name of ['A', 'B']) {
      const texts = state.queue.map((m) => m.text).filter((t) => t.startsWith(name));
      expect(texts).toEqual(Array.from({ length: 50 }, (_, i) => `${name} #${i}`));
    }
  }, 60_000);
});

describe('message queue', () => {
  it('delivers messages to the right session, oldest first', () => {
    const s = initialState();
    const now = new Date('2026-10-13T10:00:00.000Z');
    const first = enqueueMessage(s, 'lead', 'builder', 'TO CODE: step 1', now);
    enqueueMessage(s, 'builder', 'lead', 'step 1 done', now);
    enqueueMessage(s, 'lead', 'builder', 'TO CODE: step 2', now);

    expect(first).toMatchObject({ from: 'lead', to: 'builder', queuedAt: now.toISOString() });
    expect(takeMessageFor(s, 'builder')?.text).toBe('TO CODE: step 1');
    expect(takeMessageFor(s, 'builder')?.text).toBe('TO CODE: step 2');
    expect(takeMessageFor(s, 'builder')).toBeUndefined();
    expect(takeMessageFor(s, 'lead')?.text).toBe('step 1 done');
    expect(s.queue).toEqual([]);
  });

  it('gives every message its own id', () => {
    const s = initialState();
    const a = enqueueMessage(s, 'lead', 'builder', 'x');
    const b = enqueueMessage(s, 'lead', 'builder', 'x');
    expect(a.id).not.toBe(b.id);
  });
});

describe('waiter record', () => {
  it('keeps one waiter per session: a newer one replaces the older', () => {
    const s = initialState();
    registerWaiter(s, 'lead', waiter(100));
    registerWaiter(s, 'lead', waiter(200));
    expect(isCurrentWaiter(s, 'lead', 200)).toBe(true);
    expect(isCurrentWaiter(s, 'lead', 100)).toBe(false);
  });

  it('keeps each session separate', () => {
    const s = initialState();
    registerWaiter(s, 'lead', waiter(100));
    expect(isCurrentWaiter(s, 'builder', 100)).toBe(false);
    expect(s.sessions.builder.waiter).toBeNull();
  });

  it('lets a waiter clear only its own record', () => {
    const s = initialState();
    registerWaiter(s, 'builder', waiter(200));
    expect(clearWaiter(s, 'builder', 100)).toBe(false);
    expect(s.sessions.builder.waiter?.pid).toBe(200);
    expect(clearWaiter(s, 'builder', 200)).toBe(true);
    expect(s.sessions.builder.waiter).toBeNull();
  });

  it('saves the full record to the file', async () => {
    await updateState(dir, (s) => registerWaiter(s, 'builder', waiter(4242)));
    expect((await readState(dir)).sessions.builder.waiter).toEqual(waiter(4242));
  });
});

describe('startRound', () => {
  it('counts rounds up to the limit, then refuses', () => {
    const s = initialState();
    expect(startRound(s, 2)).toBe(true);
    expect(startRound(s, 2)).toBe(true);
    expect(startRound(s, 2)).toBe(false);
    expect(s.rounds).toBe(2);
  });

  it('starts counting again after a reset', () => {
    const s = initialState();
    startRound(s, 1);
    s.rounds = 0; // control returned to Dennis
    expect(startRound(s, 1)).toBe(true);
  });
});

describe('flags', () => {
  it('saves the busy flag, re-arm marker, paused and stopped', async () => {
    await updateState(dir, (s) => {
      s.sessions.lead.busy = true;
      s.sessions.lead.rearmPending = true;
      s.paused = true;
      s.stopped = true;
    });
    const s = await readState(dir);
    expect(s.sessions.lead).toMatchObject({ busy: true, rearmPending: true });
    expect(s.sessions.builder).toMatchObject({ busy: false, rearmPending: false });
    expect(s).toMatchObject({ paused: true, stopped: true });
  });
});
