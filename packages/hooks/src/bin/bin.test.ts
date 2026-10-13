import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { enqueueMessage, readActivity, readState, updateState } from '@relay/core';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

// These tests run the built scripts exactly as Claude Code does: a separate
// `node` process, JSON on stdin, and the answer in the exit code and output.
// They need `npm run build` first (`npm run check` and CI do that).
const dist = path.resolve(fileURLToPath(import.meta.url), '../../../dist/bin');
const stopScript = path.join(dist, 'stop.js');
const promptScript = path.join(dist, 'prompt-submit.js');

let home: string;
let configPath: string;
let stateDir: string;

beforeAll(() => {
  if (!existsSync(stopScript))
    throw new Error(`Run "npm run build" first: ${stopScript} is missing.`);
});
beforeEach(async () => {
  home = await mkdtemp(path.join(os.tmpdir(), 'relay-bin-'));
  configPath = path.join(home, 'relay.config.json');
  stateDir = path.join(home, 'app1');
  await writeFile(
    configPath,
    JSON.stringify({
      name: 'app1',
      builderPath: path.join(home, 'b'),
      leadPath: path.join(home, 'l'),
    }),
  );
});
afterEach(async () => {
  await rm(home, { recursive: true, force: true });
});

function run(script: string, role: string, input: object) {
  return spawnSync(process.execPath, [script, '--config', configPath, '--role', role], {
    input: JSON.stringify(input),
    env: { ...process.env, RELAY_HOME: home },
    encoding: 'utf8',
    timeout: 20_000,
  });
}

describe('hook scripts', () => {
  it('stop.js lets the lead stop on TO DENNIS: and logs it', async () => {
    const r = run(stopScript, 'lead', {
      session_id: 's1',
      last_assistant_message: 'TO DENNIS: done',
    });
    expect(r.status).toBe(0);
    expect(r.stdout).toBe('');
    expect(await readActivity(stateDir)).toMatchObject([{ kind: 'to-dennis', message: 'done' }]);
  });

  it('stop.js wakes the builder with a queued message: exit 2, message on stderr', async () => {
    await updateState(stateDir, (s) => void enqueueMessage(s, 'lead', 'builder', 'add a test'));
    const r = run(stopScript, 'builder', { session_id: 's2', last_assistant_message: 'ready' });
    expect(r.status).toBe(2);
    expect(r.stderr).toBe('Relay: message from the lead.\n\nadd a test');
  });

  it('prompt-submit.js marks the session busy', async () => {
    const r = run(promptScript, 'lead', { session_id: 's1', prompt: 'hello' });
    expect(r.status).toBe(0);
    expect((await readState(stateDir)).sessions.lead.busy).toBe(true);
  });

  it('exits 1 with a message on bad input', () => {
    const r = spawnSync(process.execPath, [stopScript], { input: '{}', encoding: 'utf8' });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('Missing --config');
  });
});
