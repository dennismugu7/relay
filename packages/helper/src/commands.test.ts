import {
  appendActivity,
  enqueueMessage,
  readActivity,
  readState,
  registerWaiter,
  updateState,
} from '@relay/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { makeWorkspace, type Workspace } from './__fixtures__/workspace.js';
import { HELP, runCli } from './cli.js';
import { formatLog, oneLine } from './log.js';
import { batonHolder } from './status.js';

let ws: Workspace;
let stateDir: string;
beforeEach(async () => {
  ws = await makeWorkspace();
  await runCli(['init', 'app1'], ws.ctx);
  stateDir = `${ws.home}/app1`;
  ws.ctx.cwd = ws.project; // commands find the project from its folder
  ws.output.length = 0;
});
afterEach(async () => {
  await ws.cleanup();
});

const relay = (...args: string[]) => runCli(args, ws.ctx);

describe('start, pause, resume, stop', () => {
  it('pause and resume flip the flag and are logged', async () => {
    expect(await relay('pause')).toBe(0);
    expect((await readState(stateDir)).paused).toBe(true);
    expect(await relay('resume')).toBe(0);
    expect((await readState(stateDir)).paused).toBe(false);
    expect((await readActivity(stateDir)).map((e) => e.kind)).toEqual(['paused', 'resumed']);
  });

  it('stop sets the flag and drops queued messages', async () => {
    await updateState(stateDir, (s) => void enqueueMessage(s, 'lead', 'builder', 'x'));
    expect(await relay('stop')).toBe(0);
    const s = await readState(stateDir);
    expect(s).toMatchObject({ stopped: true, queue: [] });
    expect(ws.output.join('\n')).toContain('relay start');
  });

  it('start clears stopped/paused, resets rounds and owed replies, and says what to do next', async () => {
    await updateState(stateDir, (s) => {
      s.stopped = true;
      s.paused = true;
      s.rounds = 4;
      s.sessions.builder.owesReply = true;
    });
    expect(await relay('start')).toBe(0);
    const s = await readState(stateDir);
    expect(s).toMatchObject({ stopped: false, paused: false, rounds: 0 });
    expect(s.sessions.builder.owesReply).toBe(false);
    expect(ws.output).toContain('  1. In the builder session, run /relay-start.');
    expect((await readActivity(stateDir)).at(-1)).toMatchObject({
      kind: 'started',
      time: '2026-10-13T12:00:00.000Z',
    });
  });

  it('work from the lead folder or with a path too', async () => {
    ws.ctx.cwd = ws.lead;
    expect(await relay('pause')).toBe(0);
    ws.ctx.cwd = ws.root;
    expect(await relay('resume', 'app1')).toBe(0);
    expect(await relay('stop', 'app1-lead')).toBe(0);
  });

  it('fail clearly outside a Relay project', async () => {
    ws.ctx.cwd = ws.root;
    expect(await relay('pause')).toBe(1);
    expect(ws.output.at(-1)).toContain('No Relay project found');
  });
});

describe('status', () => {
  it('shows a fresh project', async () => {
    expect(await relay('status')).toBe(0);
    expect(ws.output).toEqual([
      'Project:  app1',
      `Config:   ${ws.lead}${ws.lead.includes('\\') ? '\\' : '/'}relay.config.json`,
      'Delivery: rewake, max 20 rounds, hook timeout 3600 s',
      'Run:      active',
      'Baton:    Dennis (no task in progress)',
      'Rounds:   0 of 20 since control last returned to Dennis',
      'Queue:    empty',
      'Lead:     idle, not waiting',
      'Builder:  idle, not waiting',
    ]);
  });

  it('shows the baton, rounds, flags and a live waiter during a run', async () => {
    ws.alive.add(4242);
    await updateState(stateDir, (s) => {
      s.rounds = 2;
      s.paused = true;
      s.sessions.builder.owesReply = true;
      s.sessions.builder.busy = true;
      registerWaiter(s, 'lead', {
        sessionId: 'x',
        pid: 4242,
        startedAt: '2026-10-13T11:30:00.000Z',
        deadline: '2026-10-13T12:30:00.000Z',
      });
    });
    await relay('status');
    const text = ws.output.join('\n');
    expect(text).toContain('Run:      paused');
    expect(text).toContain('Baton:    builder (working on a task)');
    expect(text).toContain('Rounds:   2 of 20');
    expect(text).toMatch(/Lead: {5}idle, waiter pid 4242 alive, re-arms before/);
    expect(text).toContain('Builder:  busy, not waiting');
    expect(text).not.toContain('Warning');
  });

  it('warns about a dead waiter', async () => {
    await updateState(stateDir, (s) =>
      registerWaiter(s, 'builder', {
        sessionId: 'x',
        pid: 999,
        startedAt: '2026-10-13T11:30:00.000Z',
        deadline: '2026-10-13T12:30:00.000Z',
      }),
    );
    await relay('status');
    const text = ws.output.join('\n');
    expect(text).toContain('Builder:  idle, waiter pid 999 dead');
    expect(text).toContain("Warning: the builder's waiter is dead");
  });

  it('warns about an expired waiter', async () => {
    ws.alive.add(4242);
    await updateState(stateDir, (s) =>
      registerWaiter(s, 'builder', {
        sessionId: 'x',
        pid: 4242,
        startedAt: '2026-10-13T10:00:00.000Z',
        deadline: '2026-10-13T11:00:00.000Z',
      }),
    );
    await relay('status');
    expect(ws.output.join('\n')).toContain("the builder's waiter is expired");
  });

  it('warns when a message waits but nobody is waiting to deliver it', async () => {
    await updateState(stateDir, (s) => void enqueueMessage(s, 'lead', 'builder', 'x'));
    await relay('status');
    const text = ws.output.join('\n');
    expect(text).toContain('Queue:    0 for the lead, 1 for the builder');
    expect(text).toContain('a message is waiting for the builder, but no waiter is running there');
  });
});

describe('batonHolder', () => {
  it.each([
    [
      'a task queued',
      (s: Parameters<typeof batonHolder>[0]) => void enqueueMessage(s, 'lead', 'builder', 'x'),
      'builder (a task',
    ],
    [
      'a report queued',
      (s: Parameters<typeof batonHolder>[0]) => void enqueueMessage(s, 'builder', 'lead', 'x'),
      'lead (a report',
    ],
    [
      'the lead busy',
      (s: Parameters<typeof batonHolder>[0]) => void (s.sessions.lead.busy = true),
      'lead (working)',
    ],
  ])('with %s', async (_n, setup, expected) => {
    const s = await readState(stateDir);
    setup(s);
    expect(batonHolder(s)).toContain(expected);
  });
});

describe('log', () => {
  it('prints readable lines, with a date line', async () => {
    const entries = [
      {
        time: '2026-10-13T12:45:07.000Z',
        project: 'app1',
        kind: 'handoff' as const,
        from: 'lead' as const,
        to: 'builder' as const,
        message: 'Create one.txt\ncontaining 1.',
      },
      {
        time: '2026-10-13T12:45:29.000Z',
        project: 'app1',
        kind: 'to-dennis' as const,
        from: 'lead' as const,
        to: 'dennis' as const,
        message: 'All done.',
      },
      { time: '2026-10-13T12:46:00.000Z', project: 'app1', kind: 'paused' as const },
      {
        time: '2026-10-13T12:47:00.000Z',
        project: 'app1',
        kind: 'error' as const,
        message: 'boom',
      },
    ];
    for (const e of entries) await appendActivity(stateDir, e);
    expect(await relay('log')).toBe(0);

    const t = (iso: string) => new Date(iso).toLocaleTimeString('en-GB');
    expect(ws.output).toEqual([
      new Date(entries[0]!.time).toLocaleDateString('en-CA'),
      `${t(entries[0]!.time)}  lead → builder   Create one.txt containing 1.`,
      `${t(entries[1]!.time)}  lead → Dennis    All done.`,
      `${t(entries[2]!.time)}  paused`,
      `${t(entries[3]!.time)}  ERROR            boom`,
    ]);
  });

  it('--limit shows the last entries, --full shows whole messages', async () => {
    await appendActivity(stateDir, { project: 'app1', kind: 'paused' });
    await appendActivity(stateDir, {
      project: 'app1',
      kind: 'handoff',
      from: 'builder',
      to: 'lead',
      message: 'line 1\nline 2',
    });
    await relay('log', '--limit', '1', '--full');
    expect(ws.output.slice(1)).toEqual([
      expect.stringMatching(/builder → lead$/) as string,
      '    line 1',
      '    line 2',
    ]);
  });

  it('says so when there is no activity yet', async () => {
    await relay('log');
    expect(ws.output).toEqual(['No activity yet for app1.']);
  });

  it('starts a new date line when the day changes', () => {
    const lines = formatLog([
      { time: '2026-10-13T10:00:00.000Z', project: 'a', kind: 'paused' },
      { time: '2026-10-15T10:00:00.000Z', project: 'a', kind: 'resumed' },
    ]);
    expect(lines.filter((l) => /^\d{4}-\d{2}-\d{2}$/.test(l))).toHaveLength(2);
  });

  it('labels a nudge as such, not as a handoff', () => {
    const [, line] = formatLog([
      {
        time: '2026-10-13T10:00:00.000Z',
        project: 'a',
        kind: 'nudge',
        from: 'lead',
        to: 'lead',
        message: 'Looks good. TO CODE: x',
      },
    ]);
    expect(line).toMatch(/^\S+ {2}nudge {12}Looks good\. TO CODE: x$/);
  });

  it('shortens long messages to one line', () => {
    expect(oneLine('a  b\n\nc')).toBe('a b c');
    expect(oneLine('x'.repeat(150))).toHaveLength(100);
    expect(oneLine('x'.repeat(150)).endsWith('…')).toBe(true);
  });
});

describe('the command line', () => {
  it('prints help', async () => {
    expect(await relay('help')).toBe(0);
    expect(ws.output).toEqual([HELP]);
  });

  it.each([
    [['dance'], 'Unknown command "dance"'],
    [['status', 'a', 'b'], 'Unexpected argument: b'],
    [['log', '--limit', 'x'], '--limit must be'],
    [['status', '--fast'], "Unknown option '--fast'"],
  ])('rejects %j', async (args, message) => {
    expect(await relay(...args)).toBe(1);
    expect(ws.output.at(-1)).toContain(message);
  });
});
