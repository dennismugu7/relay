/**
 * The activity log, `activity.jsonl`: one JSON object per line, append-only.
 *
 * Every handoff and every control change is recorded here, with time,
 * project, direction and message (docs/PROJECT_BRIEF.md, Safety rules).
 * `relay log` (M4) reads it back.
 */
import { appendFile, mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import { type LockOptions, withLock } from './lock.js';
import { ACTIVITY_FILE, ACTIVITY_LOCK_FILE } from './paths.js';
import type { Role } from './state.js';

/** What happened. */
export type ActivityKind =
  | 'handoff' // a message was passed from one session to the other (queued for delivery)
  | 'to-dennis' // control returned to Dennis
  | 'started' // `relay start`: ready for a new run
  | 'paused'
  | 'resumed'
  | 'stopped'
  | 'max-rounds' // the round limit was reached
  | 'error'; // a hook failed; `message` says why

export interface ActivityEntry {
  /** When it happened (ISO 8601 time). */
  time: string;
  project: string;
  kind: ActivityKind;
  from?: Role;
  to?: Role | 'dennis';
  message?: string;
}

/** An entry to log. `time` is filled in with the current time if left out. */
export type NewActivityEntry = Omit<ActivityEntry, 'time'> & { time?: string };

/**
 * Adds one entry to the end of the log and returns it.
 * A lock keeps lines from two processes from mixing.
 */
export async function appendActivity(
  dir: string,
  entry: NewActivityEntry,
  options: LockOptions = {},
): Promise<ActivityEntry> {
  // `time` goes first so each log line starts with when it happened.
  const full: ActivityEntry = { time: new Date().toISOString(), ...entry };
  await mkdir(dir, { recursive: true });
  await withLock(
    path.join(dir, ACTIVITY_LOCK_FILE),
    () => appendFile(path.join(dir, ACTIVITY_FILE), JSON.stringify(full) + '\n', 'utf8'),
    options,
  );
  return full;
}

/**
 * Reads the whole log, oldest first. Returns an empty list if there is no log.
 * Lines that aren't valid JSON (for example one cut short by a crash) are skipped.
 */
export async function readActivity(dir: string): Promise<ActivityEntry[]> {
  let text: string;
  try {
    text = await readFile(path.join(dir, ACTIVITY_FILE), 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
  const entries: ActivityEntry[] = [];
  for (const line of text.split('\n')) {
    if (line.trim() === '') continue;
    try {
      entries.push(JSON.parse(line) as ActivityEntry);
    } catch {
      // Skip a damaged line rather than lose the whole log.
    }
  }
  return entries;
}
