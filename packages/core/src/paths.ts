/**
 * Where Relay keeps its files on this machine.
 *
 * Each project gets one folder: `%USERPROFILE%\.relay\<project>\` on Windows
 * (`~/.relay/<project>/` elsewhere). See ADR 0003.
 */
import os from 'node:os';
import path from 'node:path';

import { isValidProjectName } from './config.js';

/** The shared state file: queue, waiters, flags, round counter. */
export const STATE_FILE = 'state.json';
/** Lock file that guards `state.json` while it is being updated. */
export const STATE_LOCK_FILE = 'state.lock';
/** The append-only activity log, one JSON object per line. */
export const ACTIVITY_FILE = 'activity.jsonl';
/** Lock file that guards `activity.jsonl` while a line is appended. */
export const ACTIVITY_LOCK_FILE = 'activity.lock';

/** Relay's home folder: `.relay` inside the user's home folder. */
export function relayHome(): string {
  return path.join(os.homedir(), '.relay');
}

/**
 * The folder holding one project's state and log.
 * `home` can be changed so tests use a temporary folder.
 */
export function stateDir(project: string, home: string = relayHome()): string {
  if (!isValidProjectName(project)) {
    throw new Error(`Invalid project name: ${JSON.stringify(project)}`);
  }
  return path.join(home, project);
}
