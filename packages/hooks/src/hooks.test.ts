import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
  enqueueMessage,
  readActivity,
  readState,
  type RelayConfig,
  type RelayState,
  updateState,
} from '@relay/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { HookDeps } from './deps.js';
import { runHook } from './main.js';

let home: string;
let configPath: string;
let stateDir: string;

async function writeConfig(overrides: Partial<RelayConfig> = {}) {
  const config = {
    name: 'app1',
    builderPath: path.join(home, 'app1'),
    leadPath: path.join(home, 'app1-lead'),
    maxRounds: 5,
    delivery: 'rewake',
    ...overrides,
  };
  await writeFile(configPath, JSON.stringify(config));
}

beforeEach(async () => {
  home = await mkdtemp(path.join(os.tmpdir(), 'relay-hooks-'));
  configPath = path.join(home, 'relay.config.json');
  stateDir = path.join(home, 'app1');
  await writeConfig();
});
afterEach(async () => {
  await rm(home, { recursive: true, force: true });
});

/**
 * Fake outside world. Time starts at 10:00 and only moves when the hook
 * "sleeps". `onSleep` runs on every sleep, so a test can make things happen
 * while a waiter waits.
 */
function fakeDeps(pid: number, onSleep: (sleeps: number) => Promise<void> = async () => {}) {
  let clock = new Date('2026-10-13T10:00:00.000Z').getTime();
  let sleeps = 0;
  const deps: HookDeps = {
    now: () => new Date(clock),
    sleep: async (ms) => {
      clock += ms;
      sleeps++;
      if (sleeps > 10_000) throw new Error('waited too long');
      await onSleep(sleeps);
    },
    pid,
    env: { RELAY_HOME: home },
    pollMs: 500,
  };
  return deps;
}

const args = (role: 'lead' | 'builder', timeout = 3600) => [
  '--config',
  configPath,
  '--role',
  role,
  '--timeout',
  String(timeout),
];
const stopInput = (reply: string, session = 'session-1') =>
  JSON.stringify({ session_id: session, hook_event_name: 'Stop', last_assistant_message: reply });
const promptInput = JSON.stringify({ session_id: 'session-1', prompt: 'hi' });

const change = (fn: (s: RelayState) => void) => updateState(stateDir, fn);

describe('Stop hook — handoffs and waiting', () => {
  it('lead TO CODE: queues and logs the handoff, waits, then wakes with the report (rewake)', async () => {
    const deps = fakeDeps(100, async (n) => {
      if (n === 3) await change((s) => void enqueueMessage(s, 'builder', 'lead', 'test added'));
    });
    const out = await runHook('stop', args('lead'), stopInput('TO CODE: add a test'), deps);

    expect(out).toEqual({
      exitCode: 2,
      stdout: '',
      stderr: 'Relay: report from the builder.\n\ntest added',
    });
    const s = await readState(stateDir);
    expect(s.rounds).toBe(1);
    expect(s.queue).toMatchObject([{ from: 'lead', to: 'builder', text: 'add a test' }]);
    expect(s.sessions.lead).toMatchObject({ busy: true, waiter: null });
    expect(await readActivity(stateDir)).toMatchObject([
      { project: 'app1', kind: 'handoff', from: 'lead', to: 'builder', message: 'add a test' },
    ]);
  });

  it('blocking mode delivers the same message as additionalContext on stdout', async () => {
    await writeConfig({ delivery: 'blocking' });
    await change((s) => void enqueueMessage(s, 'lead', 'builder', 'add a test'));
    const out = await runHook('stop', args('builder'), stopInput('ready'), fakeDeps(200));

    expect(out.exitCode).toBe(0);
    expect(out.stderr).toBe('');
    expect(JSON.parse(out.stdout)).toEqual({
      hookSpecificOutput: {
        hookEventName: 'Stop',
        additionalContext: 'Relay: message from the lead.\n\nadd a test',
      },
    });
  });

  it('builder: delivers a task, then sends its next reply back to the lead', async () => {
    await change((s) => void enqueueMessage(s, 'lead', 'builder', 'add a test'));
    const first = await runHook('stop', args('builder'), stopInput('ready'), fakeDeps(200));
    expect(first.stderr).toBe('Relay: message from the lead.\n\nadd a test');

    // The builder works on the task, finishes, and its Stop hook runs again.
    const deps = fakeDeps(201, async (n) => {
      if (n === 2) await change((s) => void enqueueMessage(s, 'lead', 'builder', 'next step'));
    });
    const second = await runHook('stop', args('builder'), stopInput('Done: test added.'), deps);
    expect(second.stderr).toBe('Relay: message from the lead.\n\nnext step');

    expect(await readActivity(stateDir)).toMatchObject([
      { kind: 'handoff', from: 'builder', to: 'lead', message: 'Done: test added.' },
    ]);
    expect((await readState(stateDir)).queue).toMatchObject([
      { to: 'lead', text: 'Done: test added.' },
    ]);
  });

  it('lead TO DENNIS: logs it, resets rounds, and lets the session stop at once', async () => {
    await change((s) => void (s.rounds = 4));
    const out = await runHook(
      'stop',
      args('lead'),
      stopInput('TO DENNIS: all done'),
      fakeDeps(100),
    );
    expect(out).toEqual({ exitCode: 0, stdout: '', stderr: '' });
    expect((await readState(stateDir)).rounds).toBe(0);
    expect(await readActivity(stateDir)).toMatchObject([
      { kind: 'to-dennis', message: 'all done' },
    ]);
  });

  it('max rounds: logs it and lets the lead stop without delivering', async () => {
    await writeConfig({ maxRounds: 2 });
    await change((s) => void (s.rounds = 2));
    const out = await runHook('stop', args('lead'), stopInput('TO CODE: more'), fakeDeps(100));
    expect(out.exitCode).toBe(0);
    expect((await readState(stateDir)).queue).toEqual([]);
    expect(await readActivity(stateDir)).toMatchObject([{ kind: 'max-rounds' }]);
  });

  it('stopped: lets the session stop and records nothing', async () => {
    await change((s) => void (s.stopped = true));
    const out = await runHook('stop', args('lead'), stopInput('TO CODE: x'), fakeDeps(100));
    expect(out.exitCode).toBe(0);
    expect(await readActivity(stateDir)).toEqual([]);
  });

  it('a waiter retires when Relay is stopped while it waits', async () => {
    const deps = fakeDeps(200, async (n) => {
      if (n === 2) await change((s) => void (s.stopped = true));
    });
    const out = await runHook('stop', args('builder'), stopInput('ready'), deps);
    expect(out).toEqual({ exitCode: 0, stdout: '', stderr: '' });
  });

  it('paused: holds the message until resumed', async () => {
    await change((s) => {
      s.paused = true;
      enqueueMessage(s, 'lead', 'builder', 'held');
    });
    let sleepsWhenResumed = 0;
    const deps = fakeDeps(200, async (n) => {
      if (n === 5) {
        sleepsWhenResumed = n;
        await change((s) => void (s.paused = false));
      }
    });
    const out = await runHook('stop', args('builder'), stopInput('ready'), deps);
    expect(out.stderr).toBe('Relay: message from the lead.\n\nheld');
    expect(sleepsWhenResumed).toBe(5);
  });
});

describe('Stop hook — one waiter per session', () => {
  it('an older waiter retires without delivering when a newer one starts', async () => {
    const older = runHook(
      'stop',
      args('builder'),
      stopInput('ready'),
      fakeDeps(200, async (n) => {
        if (n === 2) {
          // Meanwhile: Dennis chats with the builder; its turn ends, a new Stop runs.
          const newer = runHook('stop', args('builder'), stopInput('chat reply'), fakeDeps(201));
          await change((s) => void enqueueMessage(s, 'lead', 'builder', 'task'));
          expect((await newer).stderr).toBe('Relay: message from the lead.\n\ntask');
        }
      }),
    );
    expect(await older).toEqual({ exitCode: 0, stdout: '', stderr: '' });
  });
});

describe('busy flag', () => {
  it('UserPromptSubmit marks the session busy', async () => {
    const out = await runHook('prompt-submit', args('builder'), promptInput, fakeDeps(300));
    expect(out).toEqual({ exitCode: 0, stdout: '', stderr: '' });
    expect((await readState(stateDir)).sessions.builder.busy).toBe(true);
    expect((await readState(stateDir)).sessions.lead.busy).toBe(false);
  });

  it('a waiter holds a message while Dennis is using the session', async () => {
    let busySleeps = 0;
    const deps = fakeDeps(200, async (n) => {
      if (n === 1) {
        // Dennis types into the builder, and a message arrives mid-turn.
        await runHook('prompt-submit', args('builder'), promptInput, fakeDeps(300));
        await change((s) => void enqueueMessage(s, 'lead', 'builder', 'task'));
      }
      if (n > 1 && n < 20) {
        expect((await readState(stateDir)).queue).toHaveLength(1);
        busySleeps++;
      }
      if (n === 20) {
        // His turn ends; that Stop hook takes over and delivers.
        const newer = await runHook('stop', args('builder'), stopInput('answer'), fakeDeps(201));
        expect(newer.stderr).toBe('Relay: message from the lead.\n\ntask');
      }
    });
    const older = await runHook('stop', args('builder'), stopInput('ready'), deps);
    expect(older.exitCode).toBe(0); // retired, never delivered
    expect(busySleeps).toBe(18);
  });
});

describe('re-arm', () => {
  it('re-arms before the timeout when nothing arrives, then ignores the WAITING reply', async () => {
    await change((s) => void (s.rounds = 1));
    // 20 s timeout: re-arm at 15 s, i.e. after 30 sleeps of 500 ms.
    const out = await runHook('stop', args('builder', 20), stopInput('ready'), fakeDeps(200));
    expect(out).toEqual({
      exitCode: 2,
      stdout: '',
      stderr: 'Relay: no message yet. Reply with only: WAITING',
    });
    expect((await readState(stateDir)).sessions.builder.rearmPending).toBe(true);

    // The session replies WAITING; its Stop hook must re-arm again, not log or count.
    const again = await runHook('stop', args('builder', 20), stopInput('WAITING'), fakeDeps(201));
    expect(again.stderr).toBe('Relay: no message yet. Reply with only: WAITING');
    const s = await readState(stateDir);
    expect(s.rounds).toBe(1);
    expect(s.queue).toEqual([]);
    expect(await readActivity(stateDir)).toEqual([]);
  });

  it('a lead re-arm reply is not treated as TO DENNIS', async () => {
    await change((s) => void (s.sessions.lead.rearmPending = true));
    const deps = fakeDeps(100, async (n) => {
      if (n === 1) await change((s) => void enqueueMessage(s, 'builder', 'lead', 'report'));
    });
    const out = await runHook('stop', args('lead'), stopInput('WAITING'), deps);
    expect(out.stderr).toBe('Relay: report from the builder.\n\nreport');
    expect(await readActivity(stateDir)).toEqual([]);
  });

  it('blocking mode re-arms with additionalContext', async () => {
    await writeConfig({ delivery: 'blocking' });
    const out = await runHook('stop', args('builder', 20), stopInput('ready'), fakeDeps(200));
    expect(out.exitCode).toBe(0);
    expect(JSON.parse(out.stdout)).toMatchObject({
      hookSpecificOutput: { additionalContext: 'Relay: no message yet. Reply with only: WAITING' },
    });
  });
});

describe('errors', () => {
  it.each([
    ['no --config', ['--role', 'lead'], 'Missing --config'],
    ['a bad role', ['--config', 'x', '--role', 'boss'], '--role must be'],
    ['a bad timeout', ['--config', 'x', '--role', 'lead', '--timeout', '5'], '--timeout must'],
    ['an unknown option', ['--config', 'x', '--role', 'lead', '--fast'], "Unknown option '--fast'"],
  ])('fails clearly on %s', async (_n, argv, expected) => {
    const out = await runHook('stop', argv, stopInput('x'), fakeDeps(100));
    expect(out.exitCode).toBe(1);
    expect(out.stderr).toContain('Relay stop hook failed:');
    expect(out.stderr).toContain(expected);
  });

  it('fails clearly on a missing config file', async () => {
    const argv = ['--config', path.join(home, 'nope.json'), '--role', 'lead'];
    const out = await runHook('stop', argv, stopInput('x'), fakeDeps(100));
    expect(out.exitCode).toBe(1);
    expect(out.stderr).toContain('Cannot read');
  });

  it.each([
    ['not JSON', 'not json', 'not valid JSON'],
    ['no session_id', '{"last_assistant_message":"x"}', 'no session_id'],
  ])('fails on input that is %s, and logs the error', async (_n, stdin, expected) => {
    const out = await runHook('stop', args('lead'), stdin, fakeDeps(100));
    expect(out.exitCode).toBe(1);
    expect(out.stderr).toContain(expected);
    expect(await readActivity(stateDir)).toMatchObject([
      { kind: 'error', message: expect.stringContaining(expected) as string },
    ]);
  });

  it('treats a missing last_assistant_message as an empty reply', async () => {
    const stdin = JSON.stringify({ session_id: 's' });
    const out = await runHook('stop', args('lead'), stdin, fakeDeps(100));
    expect(out.exitCode).toBe(0);
    expect(await readActivity(stateDir)).toMatchObject([{ kind: 'to-dennis', message: '' }]);
  });
});
