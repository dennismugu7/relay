import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

// Runs the built `relay` command as a real process, as it runs on Dennis's
// PC. Needs `npm run build` first (`npm run check` and CI do that).
const relayJs = path.resolve(fileURLToPath(import.meta.url), '../../../dist/bin/relay.js');

let root: string;
beforeAll(() => {
  if (!existsSync(relayJs)) throw new Error(`Run "npm run build" first: ${relayJs} is missing.`);
});
beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), 'relay-bin-'));
  await mkdir(path.join(root, 'app1'));
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

function relay(...args: string[]) {
  return spawnSync(process.execPath, [relayJs, ...args], {
    cwd: root,
    env: { ...process.env, RELAY_HOME: path.join(root, 'home') },
    encoding: 'utf8',
  });
}

describe('relay (built)', () => {
  it('sets up a project with hooks that point at the real, built hook scripts', async () => {
    const r = relay('init', 'app1');
    expect(r.status, r.stdout + r.stderr).toBe(0);
    const settings = JSON.parse(
      await readFile(path.join(root, 'app1-lead', '.claude', 'settings.json'), 'utf8'),
    ) as { hooks: { Stop: { hooks: { args: string[] }[] }[] } };
    const stopScript = settings.hooks.Stop[0]?.hooks[0]?.args[0] ?? '';
    expect(stopScript.replace(/\\/g, '/')).toMatch(/packages\/hooks\/dist\/bin\/stop\.js$/);
    expect(existsSync(stopScript)).toBe(true);
  });

  it('runs status and undo, and exits 1 on errors', () => {
    relay('init', 'app1');
    const status = relay('status', 'app1');
    expect(status.status).toBe(0);
    expect(status.stdout).toContain('Baton:    Dennis (no task in progress)');

    expect(relay('init', '--undo', 'app1').status).toBe(0);
    expect(existsSync(path.join(root, 'app1-lead'))).toBe(false);

    const bad = relay('status', 'app1');
    expect(bad.status).toBe(1);
    expect(bad.stdout).toContain('No Relay project found');
  });
});
