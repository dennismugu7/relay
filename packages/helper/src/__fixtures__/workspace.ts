/**
 * Test helpers: a temporary workspace with a project folder, a fake Relay
 * home, fake (empty) hook scripts and a CliContext that records output.
 */
import { mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { CliContext } from '../context.js';

const templatesDir = path.resolve(fileURLToPath(import.meta.url), '../../../templates');

export interface Workspace {
  root: string;
  project: string;
  lead: string;
  home: string;
  ctx: CliContext;
  output: string[];
  /** Processes the fake `isAlive` reports as running. */
  alive: Set<number>;
  cleanup: () => Promise<void>;
}

export async function makeWorkspace(projectName = 'app1'): Promise<Workspace> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'relay-cli-'));
  const project = path.join(root, projectName);
  const home = path.join(root, 'relay-home');
  const hooksBinDir = path.join(root, 'relay-repo', 'packages', 'hooks', 'dist', 'bin');
  await mkdir(project, { recursive: true });
  await mkdir(hooksBinDir, { recursive: true });
  await writeFile(path.join(hooksBinDir, 'stop.js'), '');
  await writeFile(path.join(hooksBinDir, 'prompt-submit.js'), '');

  const output: string[] = [];
  const alive = new Set<number>();
  const ctx: CliContext = {
    cwd: root,
    relayHome: home,
    hooksBinDir,
    templatesDir,
    now: () => new Date('2026-10-13T12:00:00.000Z'),
    isAlive: (pid) => alive.has(pid),
    print: (line) => output.push(line),
  };
  return {
    root,
    project,
    lead: path.join(root, `${projectName}-lead`),
    home,
    ctx,
    output,
    alive,
    cleanup: () => rm(root, { recursive: true, force: true }),
  };
}

/**
 * Every file under `dir` with its content and modification time, so a test
 * can check that nothing changed at all.
 */
export async function snapshot(
  dir: string,
): Promise<Record<string, { content: string; mtimeMs: number }>> {
  const result: Record<string, { content: string; mtimeMs: number }> = {};
  async function walk(current: string) {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        result[path.relative(dir, full) + path.sep] = { content: '', mtimeMs: 0 };
        await walk(full);
      } else {
        result[path.relative(dir, full)] = {
          content: await readFile(full, 'utf8'),
          mtimeMs: (await stat(full)).mtimeMs,
        };
      }
    }
  }
  await walk(dir);
  return result;
}

/** Just the paths and contents (ignoring times). */
export async function contents(dir: string): Promise<Record<string, string>> {
  const snap = await snapshot(dir);
  return Object.fromEntries(Object.entries(snap).map(([k, v]) => [k, v.content]));
}

export async function readJson(file: string): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(file, 'utf8')) as Record<string, unknown>;
}
