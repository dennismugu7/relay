/**
 * `relay log`: the activity log in plain, readable lines.
 *
 *   2026-10-13
 *   15:45:07  lead → builder   Create one.txt containing 1.
 *   15:45:13  builder → lead   Created one.txt.
 *   15:45:29  lead → Dennis    All three files are done.
 */
import { type ActivityEntry, readActivity } from '@relay/core';

import type { CliContext } from './context.js';
import { findProject } from './project.js';

export interface LogOptions {
  /** Show only the last N entries. */
  limit?: number;
  /** Show whole messages instead of one shortened line. */
  full?: boolean;
}

const WIDTH = 100;

function label(entry: ActivityEntry): string {
  if (entry.kind === 'handoff') return `${entry.from} → ${entry.to}`;
  if (entry.kind === 'to-dennis') return `${entry.from ?? 'lead'} → Dennis`;
  if (entry.kind === 'max-rounds') return 'max rounds';
  if (entry.kind === 'error') return 'ERROR';
  return entry.kind;
}

/** One message squeezed onto one line, cut short with "…" if it's too long. */
export function oneLine(message: string, width = WIDTH): string {
  const flat = message.replace(/\s+/g, ' ').trim();
  return flat.length <= width ? flat : flat.slice(0, width - 1) + '…';
}

/** Formats log entries as lines, with a date line whenever the day changes. */
export function formatLog(entries: ActivityEntry[], options: LogOptions = {}): string[] {
  const lines: string[] = [];
  let lastDay = '';
  for (const entry of entries) {
    const when = new Date(entry.time);
    const day = when.toLocaleDateString('en-CA'); // YYYY-MM-DD
    if (day !== lastDay) {
      lines.push(day);
      lastDay = day;
    }
    const prefix = `${when.toLocaleTimeString('en-GB')}  ${label(entry).padEnd(15)}`;
    const message = entry.message ?? '';
    if (!options.full || message === '') {
      lines.push(`${prefix}  ${oneLine(message)}`.trimEnd());
    } else {
      lines.push(prefix.trimEnd());
      for (const line of message.split('\n')) lines.push(`    ${line}`);
    }
  }
  return lines;
}

export async function log(ctx: CliContext, folder?: string, options: LogOptions = {}) {
  const project = await findProject(ctx, folder);
  let entries = await readActivity(project.stateDir);
  if (entries.length === 0) {
    ctx.print(`No activity yet for ${project.config.name}.`);
    return;
  }
  if (options.limit) entries = entries.slice(-options.limit);
  for (const line of formatLog(entries, options)) ctx.print(line);
}
