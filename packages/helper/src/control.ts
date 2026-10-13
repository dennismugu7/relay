/**
 * `relay start`, `relay pause`, `relay resume`, `relay stop`.
 *
 * Each one flips flags in the project's state file and logs it. The hooks
 * read those flags before every handoff and every delivery, so no background
 * process is needed (ADR 0005).
 */
import { type ActivityKind, appendActivity, type RelayState, updateState } from '@relay/core';

import type { CliContext } from './context.js';
import { findProject } from './project.js';

async function change(
  ctx: CliContext,
  folder: string | undefined,
  kind: ActivityKind,
  apply: (state: RelayState) => void,
): Promise<string> {
  const project = await findProject(ctx, folder);
  await updateState(project.stateDir, apply);
  await appendActivity(project.stateDir, {
    time: ctx.now().toISOString(),
    project: project.config.name,
    kind,
  });
  return project.config.name;
}

export async function start(ctx: CliContext, folder?: string) {
  const name = await change(ctx, folder, 'started', (s) => {
    s.stopped = false;
    s.paused = false;
    s.rounds = 0;
    // A fresh start: nothing is owed from an earlier, stopped run.
    for (const session of Object.values(s.sessions)) session.owesReply = false;
  });
  ctx.print(`${name} is ready for a run.`);
  ctx.print('  1. In the builder session, run /relay-start.');
  ctx.print('  2. In the lead session, give the lead a goal.');
}

export async function pause(ctx: CliContext, folder?: string) {
  const name = await change(ctx, folder, 'paused', (s) => void (s.paused = true));
  ctx.print(`${name} is paused. Messages are kept until "relay resume".`);
}

export async function resume(ctx: CliContext, folder?: string) {
  const name = await change(ctx, folder, 'resumed', (s) => void (s.paused = false));
  ctx.print(`${name} is running again. Kept messages will be delivered.`);
}

export async function stop(ctx: CliContext, folder?: string) {
  const name = await change(ctx, folder, 'stopped', (s) => {
    s.stopped = true;
    s.queue = [];
  });
  ctx.print(
    `${name} is stopped. Waiting hooks end on their next check; queued messages were dropped.`,
  );
  ctx.print('Run "relay start" to begin again.');
}
