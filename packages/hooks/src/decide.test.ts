import { enqueueMessage, initialState, type RelayConfig, type RelayState } from '@relay/core';
import { describe, expect, it } from 'vitest';

import {
  decideOnStop,
  decideOnTick,
  formatDelivery,
  REARM_MESSAGE,
  rearmTime,
  type StopContext,
} from './decide.js';

const config: RelayConfig = {
  name: 'app1',
  builderPath: '/work/app1',
  leadPath: '/work/app1-lead',
  maxRounds: 3,
  delivery: 'rewake',
};
const now = new Date('2026-10-13T10:00:00.000Z');
const later = new Date('2026-10-13T10:30:00.000Z');
const rearmAt = new Date('2026-10-13T10:59:00.000Z');

function ctx(overrides: Partial<StopContext>): StopContext {
  return {
    role: 'lead',
    config,
    reply: '',
    sessionId: 'session-lead',
    pid: 100,
    now,
    timeoutSeconds: 3600,
    ...overrides,
  };
}

/** A state where `pid` is the current waiter for `role`. */
function waiting(role: 'lead' | 'builder', pid: number, state: RelayState = initialState()) {
  decideOnStop(state, ctx({ role, pid, reply: role === 'lead' ? 'TO CODE: x' : 'ready' }));
  state.queue = [];
  state.rounds = 0;
  return state;
}

describe('decideOnStop — lead', () => {
  it('hands a TO CODE: reply to the builder, counts a round, and waits', () => {
    const s = initialState();
    s.sessions.lead.busy = true;
    const d = decideOnStop(s, ctx({ reply: '**TO CODE:** add a test' }));

    expect(d.wait).toBe(true);
    expect(s.queue).toMatchObject([{ from: 'lead', to: 'builder', text: 'add a test' }]);
    expect(s.rounds).toBe(1);
    expect(s.sessions.lead.busy).toBe(false);
    expect(s.sessions.lead.waiter).toEqual({
      sessionId: 'session-lead',
      pid: 100,
      startedAt: '2026-10-13T10:00:00.000Z',
      deadline: '2026-10-13T11:00:00.000Z',
    });
    expect(d.log).toEqual([
      {
        time: now.toISOString(),
        project: 'app1',
        kind: 'handoff',
        from: 'lead',
        to: 'builder',
        message: 'add a test',
      },
    ]);
  });

  it.each([
    ['TO DENNIS:', 'TO DENNIS: all done', 'all done'],
    ['an untagged reply', 'Here is my plan.', 'Here is my plan.'],
    ['an empty TO CODE:', 'TO CODE:', ''],
  ])('returns control to Dennis on %s, resets rounds, and does not wait', (_n, reply, body) => {
    const s = initialState();
    s.rounds = 2;
    s.sessions.lead.waiter = { sessionId: 'old', pid: 1, startedAt: '', deadline: '' };
    const d = decideOnStop(s, ctx({ reply }));

    expect(d.wait).toBe(false);
    expect(s.queue).toEqual([]);
    expect(s.rounds).toBe(0);
    expect(s.sessions.lead.waiter).toBeNull();
    expect(d.log).toMatchObject([{ kind: 'to-dennis', from: 'lead', to: 'dennis', message: body }]);
  });

  it('stops at max rounds: nothing delivered, rounds reset, Dennis takes over', () => {
    const s = initialState();
    s.rounds = 3;
    const d = decideOnStop(s, ctx({ reply: 'TO CODE: one more' }));

    expect(d.wait).toBe(false);
    expect(s.queue).toEqual([]);
    expect(s.rounds).toBe(0);
    expect(d.log).toMatchObject([
      { kind: 'max-rounds', message: 'Stopped after 3 rounds. Not delivered: one more' },
    ]);
  });

  it('still queues a handoff while paused (it is delivered after resume)', () => {
    const s = initialState();
    s.paused = true;
    const d = decideOnStop(s, ctx({ reply: 'TO CODE: later' }));
    expect(d.wait).toBe(true);
    expect(s.queue).toHaveLength(1);
  });
});

describe('decideOnStop — builder', () => {
  it('sends its reply back to the lead when it owes one, then waits', () => {
    const s = initialState();
    s.sessions.builder.owesReply = true;
    const d = decideOnStop(s, ctx({ role: 'builder', reply: '  Done: test added.  ', pid: 200 }));

    expect(d.wait).toBe(true);
    expect(s.queue).toMatchObject([{ from: 'builder', to: 'lead', text: 'Done: test added.' }]);
    expect(s.sessions.builder.owesReply).toBe(false);
    expect(s.sessions.builder.waiter?.pid).toBe(200);
    expect(s.rounds).toBe(0);
    expect(d.log).toMatchObject([{ kind: 'handoff', from: 'builder', to: 'lead' }]);
  });

  it('sends a placeholder when the report is empty', () => {
    const s = initialState();
    s.sessions.builder.owesReply = true;
    decideOnStop(s, ctx({ role: 'builder', reply: '' }));
    expect(s.queue[0]?.text).toBe('(The builder replied with no text.)');
  });

  it('forwards nothing when no reply is owed (Dennis chatting directly), but waits', () => {
    const s = initialState();
    const d = decideOnStop(s, ctx({ role: 'builder', reply: 'TO CODE: looks like a tag' }));
    expect(d).toEqual({ wait: true, log: [] });
    expect(s.queue).toEqual([]);
  });
});

describe('decideOnStop — re-arm replies (ADR 0002 amendment)', () => {
  it('treats the reply to its own re-arm as nothing: no handoff, no round, no log', () => {
    const s = initialState();
    s.rounds = 2;
    s.sessions.lead.rearmPending = true;
    const d = decideOnStop(s, ctx({ reply: 'WAITING' }));

    expect(d).toEqual({ wait: true, log: [] });
    expect(s.rounds).toBe(2);
    expect(s.queue).toEqual([]);
    expect(s.sessions.lead.rearmPending).toBe(false);
    expect(s.sessions.lead.waiter?.pid).toBe(100);
  });

  it('goes by the marker, not the text: a re-arm reply that says anything is still ignored', () => {
    const s = initialState();
    s.sessions.lead.rearmPending = true;
    const d = decideOnStop(s, ctx({ reply: 'TO DENNIS: hmm' }));
    expect(d).toEqual({ wait: true, log: [] });
  });

  it('goes by the marker, not the text: "WAITING" without a marker is a normal reply', () => {
    const s = initialState();
    const d = decideOnStop(s, ctx({ reply: 'WAITING' }));
    expect(d.wait).toBe(false);
    expect(d.log).toMatchObject([{ kind: 'to-dennis', message: 'WAITING' }]);
  });

  it('does not count a builder re-arm reply as a report', () => {
    const s = initialState();
    s.sessions.builder.rearmPending = true;
    s.sessions.builder.owesReply = true; // a task is still in progress
    decideOnStop(s, ctx({ role: 'builder', reply: 'WAITING' }));
    expect(s.queue).toEqual([]);
    expect(s.sessions.builder.owesReply).toBe(true);
  });
});

describe('decideOnStop — stopped', () => {
  it.each(['lead', 'builder'] as const)('lets the %s stop and does not wait', (role) => {
    const s = initialState();
    s.stopped = true;
    s.sessions[role].rearmPending = true;
    const d = decideOnStop(s, ctx({ role, reply: 'TO CODE: x' }));
    expect(d).toEqual({ wait: false, log: [] });
    expect(s.queue).toEqual([]);
    expect(s.sessions[role]).toMatchObject({ waiter: null, rearmPending: false, busy: false });
  });
});

describe('decideOnTick', () => {
  it('keeps waiting while there is nothing to do', () => {
    const s = waiting('builder', 200);
    expect(decideOnTick(s, 'builder', 200, later, rearmAt)).toEqual({ action: 'keep-waiting' });
  });

  it('delivers the message for its session and marks the session busy', () => {
    const s = waiting('builder', 200);
    enqueueMessage(s, 'lead', 'builder', 'add a test');
    const r = decideOnTick(s, 'builder', 200, later, rearmAt);

    expect(r).toEqual({ action: 'deliver', text: 'Relay: message from the lead.\n\nadd a test' });
    expect(s.queue).toEqual([]);
    expect(s.sessions.builder).toMatchObject({ busy: true, waiter: null, owesReply: true });
  });

  it('does not set owesReply when delivering a report to the lead', () => {
    const s = waiting('lead', 100);
    enqueueMessage(s, 'builder', 'lead', 'done');
    const r = decideOnTick(s, 'lead', 100, later, rearmAt);
    expect(r).toEqual({ action: 'deliver', text: 'Relay: report from the builder.\n\ndone' });
    expect(s.sessions.lead.owesReply).toBe(false);
  });

  it('ignores messages for the other session', () => {
    const s = waiting('builder', 200);
    enqueueMessage(s, 'builder', 'lead', 'for the lead');
    expect(decideOnTick(s, 'builder', 200, later, rearmAt).action).toBe('keep-waiting');
    expect(s.queue).toHaveLength(1);
  });

  it('retires quietly when a newer waiter has taken over (one waiter per session)', () => {
    const s = waiting('builder', 200);
    waiting('builder', 201, s);
    enqueueMessage(s, 'lead', 'builder', 'x');
    expect(decideOnTick(s, 'builder', 200, later, rearmAt)).toEqual({ action: 'retire' });
    expect(s.queue).toHaveLength(1); // left for the newer waiter
    expect(s.sessions.builder.waiter?.pid).toBe(201);
  });

  it('holds a message while the session is busy (no hijacking)', () => {
    const s = waiting('builder', 200);
    s.sessions.builder.busy = true; // Dennis typed into the builder
    enqueueMessage(s, 'lead', 'builder', 'x');
    expect(decideOnTick(s, 'builder', 200, later, rearmAt).action).toBe('keep-waiting');
    expect(s.queue).toHaveLength(1);
  });

  it('does not re-arm while busy either', () => {
    const s = waiting('builder', 200);
    s.sessions.builder.busy = true;
    expect(decideOnTick(s, 'builder', 200, rearmAt, rearmAt).action).toBe('keep-waiting');
  });

  it('holds messages while paused, but still re-arms so it keeps its place', () => {
    const s = waiting('builder', 200);
    s.paused = true;
    enqueueMessage(s, 'lead', 'builder', 'x');
    expect(decideOnTick(s, 'builder', 200, later, rearmAt).action).toBe('keep-waiting');
    expect(decideOnTick(s, 'builder', 200, rearmAt, rearmAt).action).toBe('rearm');
    expect(s.queue).toHaveLength(1);
  });

  it('retires and clears its record when Relay is stopped', () => {
    const s = waiting('lead', 100);
    s.stopped = true;
    expect(decideOnTick(s, 'lead', 100, later, rearmAt)).toEqual({ action: 'retire' });
    expect(s.sessions.lead.waiter).toBeNull();
  });

  it('re-arms at the deadline: sets the marker, marks busy, and gives up its record', () => {
    const s = waiting('lead', 100);
    const r = decideOnTick(s, 'lead', 100, rearmAt, rearmAt);
    expect(r).toEqual({ action: 'rearm', text: REARM_MESSAGE });
    expect(s.sessions.lead).toMatchObject({ rearmPending: true, busy: true, waiter: null });
  });

  it('prefers delivering a message over re-arming', () => {
    const s = waiting('lead', 100);
    enqueueMessage(s, 'builder', 'lead', 'done');
    expect(decideOnTick(s, 'lead', 100, rearmAt, rearmAt).action).toBe('deliver');
  });
});

describe('helpers', () => {
  it('re-arms a minute before an hour-long timeout', () => {
    expect(rearmTime(now, 3600).toISOString()).toBe('2026-10-13T10:59:00.000Z');
  });

  it('keeps a quarter of a short timeout as margin', () => {
    expect(rearmTime(now, 20).toISOString()).toBe('2026-10-13T10:00:15.000Z');
  });

  it('labels where a delivered message came from', () => {
    expect(formatDelivery('lead', 'x')).toBe('Relay: message from the lead.\n\nx');
    expect(formatDelivery('builder', 'y')).toBe('Relay: report from the builder.\n\ny');
  });
});
