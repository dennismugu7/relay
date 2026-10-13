/**
 * `relay status`: a snapshot of one project, read from its state file.
 */
import { readState, type RelayState, type Role, type SessionState } from '@relay/core';

import type { CliContext } from './context.js';
import { findProject } from './project.js';

/** Who is expected to act next, in plain words. */
export function batonHolder(state: RelayState): string {
  const forBuilder = state.queue.filter((m) => m.to === 'builder').length;
  const forLead = state.queue.filter((m) => m.to === 'lead').length;
  if (forBuilder > 0) return 'builder (a task is waiting to be delivered)';
  if (forLead > 0) return 'lead (a report is waiting to be delivered)';
  if (state.sessions.builder.owesReply) return 'builder (working on a task)';
  if (state.sessions.lead.busy) return 'lead (working)';
  return 'Dennis (no task in progress)';
}

export type WaiterHealth = 'none' | 'alive' | 'dead' | 'expired';

/** Is the session's waiter still able to deliver? */
export function waiterHealth(
  session: SessionState,
  ctx: Pick<CliContext, 'now' | 'isAlive'>,
): WaiterHealth {
  const waiter = session.waiter;
  if (!waiter) return 'none';
  if (!ctx.isAlive(waiter.pid)) return 'dead';
  if (Date.parse(waiter.deadline) <= ctx.now().getTime()) return 'expired';
  return 'alive';
}

function time(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-GB');
}

function describeSession(role: Role, state: RelayState, ctx: CliContext): string {
  const s = state.sessions[role];
  const health = waiterHealth(s, ctx);
  const waiter =
    s.waiter === null
      ? 'not waiting'
      : `waiter pid ${s.waiter.pid} ${health}` +
        (health === 'alive' ? `, re-arms before ${time(s.waiter.deadline)}` : '');
  return `${s.busy ? 'busy' : 'idle'}, ${waiter}`;
}

export async function status(ctx: CliContext, folder?: string) {
  const project = await findProject(ctx, folder);
  const { config } = project;
  const state = await readState(project.stateDir);

  const run = state.stopped ? 'stopped' : state.paused ? 'paused' : 'active';
  ctx.print(`Project:  ${config.name}`);
  ctx.print(`Config:   ${project.configPath}`);
  ctx.print(
    `Delivery: ${config.delivery}, max ${config.maxRounds} rounds, hook timeout ${config.timeoutSeconds} s`,
  );
  ctx.print(`Run:      ${run}`);
  ctx.print(`Baton:    ${batonHolder(state)}`);
  ctx.print(
    `Rounds:   ${state.rounds} of ${config.maxRounds} since control last returned to Dennis`,
  );
  const count = (role: Role) => state.queue.filter((m) => m.to === role).length;
  ctx.print(
    `Queue:    ${state.queue.length === 0 ? 'empty' : `${count('lead')} for the lead, ${count('builder')} for the builder`}`,
  );
  ctx.print(`Lead:     ${describeSession('lead', state, ctx)}`);
  ctx.print(`Builder:  ${describeSession('builder', state, ctx)}`);

  for (const role of ['lead', 'builder'] as const) {
    const health = waiterHealth(state.sessions[role], ctx);
    const waiting = state.queue.some((m) => m.to === role);
    if (health === 'dead' || health === 'expired') {
      ctx.print('');
      ctx.print(
        `Warning: the ${role}'s waiter is ${health}, so nothing will be delivered to the ${role}.`,
      );
      ctx.print(`Type anything into the ${role} session to start a new waiter.`);
    } else if (health === 'none' && waiting && !state.sessions[role].busy && !state.paused) {
      ctx.print('');
      ctx.print(`Warning: a message is waiting for the ${role}, but no waiter is running there.`);
      ctx.print(`Type anything into the ${role} session to start one.`);
    }
  }
}
