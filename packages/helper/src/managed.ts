/**
 * Every file `relay init` writes is a "managed file". Before touching one,
 * init records what was there (the original content, or that there was no
 * file) in an install manifest kept in Relay's own folder, never in the
 * project. `relay init --undo` uses that record to put everything back.
 *
 * Three kinds of managed file (ADR 0006):
 * - `owned`:    Relay writes the whole file (the lead's CLAUDE.md, the
 *               builder's rules file, the skill, relay.config.json).
 * - `settings`: a Claude Code settings file; Relay adds its own entries and
 *               keeps everything else.
 * - `block`:    a text file; Relay adds a marked block of lines.
 */
import { existsSync } from 'node:fs';
import { mkdir, readFile, rm, rmdir } from 'node:fs/promises';
import path from 'node:path';

import { writeFileAtomic } from '@relay/core';

import { formatSettings, parseSettings, removeRelaySettings } from './settings.js';
import { removeBlock } from './textblock.js';

export type ManagedKind = 'owned' | 'settings' | 'block';

/** One file in the install manifest. */
export interface ManagedFile {
  path: string;
  kind: ManagedKind;
  /** Did the file exist before Relay first touched it? */
  existedBefore: boolean;
  /** Its content before Relay first touched it (null if it didn't exist). */
  original: string | null;
  /** What Relay last wrote. If the file still holds exactly this, undo can restore `original` byte for byte. */
  written: string;
  /** For the lead's settings: the project folder Relay granted read access to. */
  builderPath?: string;
}

export interface Manifest {
  version: 1;
  project: string;
  builderPath: string;
  leadPath: string;
  files: ManagedFile[];
  /** Folders Relay created, in the order it created them. */
  createdDirs: string[];
}

/** What one file should become, given what's there now. */
export interface FilePlan {
  path: string;
  kind: ManagedKind;
  desired: (current: string | undefined) => string;
  builderPath?: string;
}

export async function readText(file: string): Promise<string | undefined> {
  try {
    return await readFile(file, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
}

/** Creates `dir` and any missing parents, and returns the ones it created, outermost first. */
async function makeDirs(dir: string): Promise<string[]> {
  const missing: string[] = [];
  for (let d = dir; !existsSync(d); d = path.dirname(d)) {
    missing.unshift(d);
    if (path.dirname(d) === d) break;
  }
  await mkdir(dir, { recursive: true });
  return missing;
}

/**
 * Brings every planned file to its desired content, writing only the files
 * that differ. Updates `manifest` in place, keeping the original content
 * recorded the first time, and calls `save` before writing any file, so
 * undo works even if init stops half-way. Returns the paths that changed.
 */
export async function applyPlans(
  plans: FilePlan[],
  manifest: Manifest,
  save: (manifest: Manifest) => Promise<void>,
): Promise<string[]> {
  // Read everything and work out every desired content first, so an error
  // (such as a broken settings file) stops init before anything is written.
  const steps = [];
  for (const plan of plans) {
    const current = await readText(plan.path);
    steps.push({ plan, current, desired: plan.desired(current) });
  }

  const toWrite: { path: string; desired: string }[] = [];
  for (const { plan, current, desired } of steps) {
    let entry = manifest.files.find((f) => f.path === plan.path);
    if (!entry) {
      entry = {
        path: plan.path,
        kind: plan.kind,
        existedBefore: current !== undefined,
        original: current ?? null,
        written: desired,
        ...(plan.builderPath ? { builderPath: plan.builderPath } : {}),
      };
      manifest.files.push(entry);
    }
    entry.written = desired;
    if (desired !== current) toWrite.push({ path: plan.path, desired });
  }
  if (toWrite.length === 0) return [];

  await save(manifest);
  for (const { path: file, desired } of toWrite) {
    const created = await makeDirs(path.dirname(file));
    if (created.length > 0) {
      manifest.createdDirs.push(...created);
      await save(manifest);
    }
    await writeFileAtomic(file, desired);
  }
  return toWrite.map((w) => w.path);
}

/** What undo did to one file, for the report. */
export interface UndoResult {
  path: string;
  action: 'restored' | 'deleted' | 'cleaned' | 'already gone';
}

/** Puts one managed file back the way it was before Relay. */
export async function undoFile(file: ManagedFile): Promise<UndoResult> {
  const current = await readText(file.path);
  const restore = async (): Promise<UndoResult> => {
    if (file.original === null) {
      await rm(file.path, { force: true });
      return { path: file.path, action: 'deleted' };
    }
    await writeFileAtomic(file.path, file.original);
    return { path: file.path, action: 'restored' };
  };

  if (current === undefined) {
    if (file.original === null) return { path: file.path, action: 'already gone' };
    return restore();
  }
  // Unchanged since Relay wrote it: put the original back exactly.
  // Owned files are Relay's entirely, so they go back even if edited.
  if (current === file.written || file.kind === 'owned') return restore();

  // Changed since (for example, Claude Code saved a permission approval in
  // settings.local.json): remove only Relay's parts and keep the rest.
  const cleaned =
    file.kind === 'settings'
      ? formatSettings(removeRelaySettings(parseSettings(current, file.path), file.builderPath))
      : removeBlock(current);
  const empty = file.kind === 'settings' ? cleaned.trim() === '{}' : cleaned.trim() === '';
  if (!file.existedBefore && empty) {
    await rm(file.path, { force: true });
    return { path: file.path, action: 'deleted' };
  }
  await writeFileAtomic(file.path, cleaned);
  return { path: file.path, action: 'cleaned' };
}

/** Removes the folders Relay created, newest first, but only if they're empty. */
export async function removeCreatedDirs(dirs: string[]): Promise<string[]> {
  const removed: string[] = [];
  for (const dir of [...new Set(dirs)].reverse()) {
    try {
      await rmdir(dir);
      removed.push(dir);
    } catch {
      // Not empty (someone put other files there) or already gone: leave it.
    }
  }
  return removed;
}
