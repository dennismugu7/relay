import { appendFile, mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { runWorkers } from './__fixtures__/run-workers.js';
import { appendActivity, readActivity } from './activity.js';

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), 'relay-activity-'));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('appendActivity', () => {
  it('writes one JSON line per entry', async () => {
    await appendActivity(dir, {
      time: '2026-10-13T10:00:00.000Z',
      project: 'app1',
      kind: 'handoff',
      from: 'lead',
      to: 'builder',
      message: 'TO CODE: add a test',
    });
    await appendActivity(dir, {
      time: '2026-10-13T10:05:00.000Z',
      project: 'app1',
      kind: 'paused',
    });

    const text = await readFile(path.join(dir, 'activity.jsonl'), 'utf8');
    expect(text).toBe(
      '{"time":"2026-10-13T10:00:00.000Z","project":"app1","kind":"handoff","from":"lead","to":"builder","message":"TO CODE: add a test"}\n' +
        '{"time":"2026-10-13T10:05:00.000Z","project":"app1","kind":"paused"}\n',
    );
  });

  it('fills in the current time when none is given', async () => {
    const before = Date.now();
    const entry = await appendActivity(dir, { project: 'app1', kind: 'resumed' });
    expect(Date.parse(entry.time)).toBeGreaterThanOrEqual(before);
    expect(Date.parse(entry.time)).toBeLessThanOrEqual(Date.now());
  });

  it('keeps a message with line breaks on one line', async () => {
    await appendActivity(dir, { project: 'app1', kind: 'to-dennis', message: 'line 1\nline 2' });
    const text = await readFile(path.join(dir, 'activity.jsonl'), 'utf8');
    expect(text.trimEnd().split('\n')).toHaveLength(1);
    expect((await readActivity(dir))[0]?.message).toBe('line 1\nline 2');
  });

  it('never mixes lines when two processes append at the same time', async () => {
    const results = await runWorkers(dir, 50, 'activity', ['A', 'B']);
    for (const r of results) expect(r, r.stderr).toMatchObject({ code: 0 });

    const text = await readFile(path.join(dir, 'activity.jsonl'), 'utf8');
    const lines = text.trimEnd().split('\n');
    expect(lines).toHaveLength(100);
    // Every line is whole, valid JSON.
    const messages = lines.map((l) => (JSON.parse(l) as { message: string }).message);
    expect(new Set(messages).size).toBe(100);
  }, 60_000);
});

describe('readActivity', () => {
  it('returns an empty list when there is no log yet', async () => {
    expect(await readActivity(dir)).toEqual([]);
  });

  it('returns entries oldest first', async () => {
    await appendActivity(dir, { project: 'app1', kind: 'paused' });
    await appendActivity(dir, { project: 'app1', kind: 'resumed' });
    expect((await readActivity(dir)).map((e) => e.kind)).toEqual(['paused', 'resumed']);
  });

  it('skips a damaged line instead of failing', async () => {
    await appendActivity(dir, { project: 'app1', kind: 'paused' });
    await appendFile(path.join(dir, 'activity.jsonl'), '{"project":"app1","ki\n');
    await appendActivity(dir, { project: 'app1', kind: 'resumed' });
    expect((await readActivity(dir)).map((e) => e.kind)).toEqual(['paused', 'resumed']);
  });
});
