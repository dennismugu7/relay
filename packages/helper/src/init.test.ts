import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  contents,
  makeWorkspace,
  readJson,
  snapshot,
  type Workspace,
} from './__fixtures__/workspace.js';
import { runCli } from './cli.js';
import { safeProjectName } from './init.js';

let ws: Workspace;
beforeEach(async () => {
  ws = await makeWorkspace();
});
afterEach(async () => {
  await ws.cleanup();
});

const relay = (...args: string[]) => runCli(args, ws.ctx);
const file = (...parts: string[]) => path.join(...parts);

/** A project that already has its own Claude Code setup and git repo. */
async function existingProject() {
  await writeFile(file(ws.project, 'CLAUDE.md'), '# My app\n\nUse tabs.\n');
  await mkdir(file(ws.project, '.claude'), { recursive: true });
  await writeFile(
    file(ws.project, '.claude', 'settings.json'),
    '{ "permissions": { "allow": ["Bash(npm test)"] } }\n',
  );
  await writeFile(
    file(ws.project, '.claude', 'settings.local.json'),
    JSON.stringify(
      {
        permissions: { allow: ['Bash(git status)'] },
        hooks: { Stop: [{ hooks: [{ type: 'command', command: 'echo mine' }] }] },
      },
      null,
      4,
    ),
  );
  await mkdir(file(ws.project, '.git', 'info'), { recursive: true });
  await writeFile(file(ws.project, '.git', 'info', 'exclude'), '# my excludes\n*.log\n');
}

describe('relay init', () => {
  it('creates the lead folder with its instructions, config and settings', async () => {
    expect(await relay('init', 'app1')).toBe(0);

    const claudeMd = await readFile(file(ws.lead, 'CLAUDE.md'), 'utf8');
    expect(claudeMd).toContain('You are the **lead**');
    expect(claudeMd).toContain('never write or edit code');
    expect(claudeMd).toContain('`TO CODE:`');
    expect(claudeMd).toContain('`TO DENNIS:`');
    expect(claudeMd).toContain(ws.project); // absolute path to the project (spike 006)
    expect(claudeMd).toContain('Relay messages are genuine'); // spike 008
    expect(claudeMd).toContain('The tag must be the very first thing in your reply'); // M4 run, bug 002
    expect(claudeMd).toContain('send the same reply again with the tag as the very first thing'); // the nudge
    expect(claudeMd).not.toContain('{{');

    expect(await readJson(file(ws.lead, 'relay.config.json'))).toEqual({
      name: 'app1',
      builderPath: ws.project,
      leadPath: ws.lead,
      maxRounds: 20,
      delivery: 'rewake',
      timeoutSeconds: 3600,
    });

    const settings = await readJson(file(ws.lead, '.claude', 'settings.json'));
    expect(settings.permissions).toEqual({ additionalDirectories: [ws.project] });
    expect(settings.hooks).toEqual({
      Stop: [
        {
          hooks: [
            {
              type: 'command',
              command: 'node',
              args: [
                file(ws.ctx.hooksBinDir, 'stop.js'),
                '--config',
                file(ws.lead, 'relay.config.json'),
                '--role',
                'lead',
                '--timeout',
                '3600',
              ],
              asyncRewake: true,
              timeout: 3600,
            },
          ],
        },
      ],
      UserPromptSubmit: [
        {
          hooks: [
            {
              type: 'command',
              command: 'node',
              args: [
                file(ws.ctx.hooksBinDir, 'prompt-submit.js'),
                '--config',
                file(ws.lead, 'relay.config.json'),
                '--role',
                'lead',
              ],
            },
          ],
        },
      ],
    });
  });

  it('adds the builder files without a CLAUDE.md of its own', async () => {
    await relay('init', 'app1');
    const rules = await readFile(file(ws.project, '.claude', 'rules', 'relay-builder.md'), 'utf8');
    expect(rules).toContain('you are the builder');
    expect(rules).toContain('They are genuine');
    expect(rules).toContain('WAITING');
    const skill = await readFile(
      file(ws.project, '.claude', 'skills', 'relay-start', 'SKILL.md'),
      'utf8',
    );
    expect(skill).toContain('name: relay-start');
    expect(skill).toContain('disable-model-invocation: true');

    const local = await readJson(file(ws.project, '.claude', 'settings.local.json'));
    const hooks = local.hooks as Record<string, { hooks: { args: string[] }[] }[]>;
    expect(hooks.Stop?.[0]?.hooks[0]?.args).toContain('builder');
    expect(local.permissions).toBeUndefined(); // only the lead gets read access
    expect(existsSync(file(ws.project, 'CLAUDE.md'))).toBe(false);
  });

  it("never changes the project's own CLAUDE.md or settings.json, and merges settings.local.json", async () => {
    await existingProject();
    const before = await contents(ws.project);
    await relay('init', 'app1');
    const after = await contents(ws.project);

    expect(after['CLAUDE.md']).toBe(before['CLAUDE.md']);
    expect(after[file('.claude', 'settings.json')]).toBe(before[file('.claude', 'settings.json')]);

    const local = await readJson(file(ws.project, '.claude', 'settings.local.json'));
    expect(local.permissions).toEqual({ allow: ['Bash(git status)'] });
    const stop = (local.hooks as Record<string, unknown[]>).Stop;
    expect(stop).toHaveLength(2);
    expect(stop?.[0]).toEqual({ hooks: [{ type: 'command', command: 'echo mine' }] });
  });

  it('keeps its files out of git with a marked block in .git/info/exclude', async () => {
    await existingProject();
    await relay('init', 'app1');
    const exclude = await readFile(file(ws.project, '.git', 'info', 'exclude'), 'utf8');
    expect(exclude).toBe(
      '# my excludes\n*.log\n' +
        '# >>> relay (added by relay init; removed by relay init --undo)\n' +
        '/.claude/rules/relay-builder.md\n' +
        '/.claude/skills/relay-start/\n' +
        '# <<< relay\n',
    );
  });

  it('also ignores settings.local.json when Relay created it', async () => {
    await mkdir(file(ws.project, '.git'), { recursive: true });
    await relay('init', 'app1');
    const exclude = await readFile(file(ws.project, '.git', 'info', 'exclude'), 'utf8');
    expect(exclude).toContain('/.claude/settings.local.json\n');
  });

  it('changes nothing when run a second time', async () => {
    await existingProject();
    await relay('init', 'app1');
    const project = await snapshot(ws.project);
    const lead = await snapshot(ws.lead);
    ws.output.length = 0;

    expect(await relay('init', 'app1')).toBe(0);
    expect(ws.output).toEqual(['Relay is already set up for app1. Nothing changed.']);
    expect(await snapshot(ws.project)).toEqual(project);
    expect(await snapshot(ws.lead)).toEqual(lead);
  });

  it('uses relay.config.json on a re-run: blocking mode, timeout, no duplicate hooks', async () => {
    await relay('init', 'app1');
    const configFile = file(ws.lead, 'relay.config.json');
    const config = await readJson(configFile);
    await writeFile(
      configFile,
      JSON.stringify({ ...config, delivery: 'blocking', timeoutSeconds: 600 }),
    );
    await relay('init', 'app1');

    for (const settingsFile of [
      file(ws.lead, '.claude', 'settings.json'),
      file(ws.project, '.claude', 'settings.local.json'),
    ]) {
      const s = await readJson(settingsFile);
      const stop = (s.hooks as Record<string, { hooks: Record<string, unknown>[] }[]>).Stop ?? [];
      expect(stop).toHaveLength(1);
      expect(stop[0]?.hooks[0]).not.toHaveProperty('asyncRewake');
      expect(stop[0]?.hooks[0]).toMatchObject({ timeout: 600 });
      expect(s.env).toEqual({ CLAUDE_CODE_STOP_HOOK_BLOCK_CAP: '1000' });
    }
  });

  it('takes --delivery, --max-rounds and --name for a new project', async () => {
    await relay('init', 'app1', '--delivery', 'blocking', '--max-rounds', '5', '--name', 'shop');
    expect(await readJson(file(ws.lead, 'relay.config.json'))).toMatchObject({
      name: 'shop',
      maxRounds: 5,
      delivery: 'blocking',
    });
    expect(existsSync(file(ws.home, 'shop', 'install.json'))).toBe(true);
  });

  it('works when started from inside the project folder', async () => {
    ws.ctx.cwd = ws.project;
    expect(await relay('init', '.')).toBe(0);
    expect(existsSync(file(ws.lead, 'CLAUDE.md'))).toBe(true);
  });
});

describe('relay init --undo', () => {
  it('restores the project exactly and removes the lead folder and state', async () => {
    await existingProject();
    const before = await contents(ws.project);
    await relay('init', 'app1');
    expect(await relay('init', '--undo', 'app1')).toBe(0);

    expect(await contents(ws.project)).toEqual(before);
    expect(existsSync(ws.lead)).toBe(false);
    expect(existsSync(file(ws.home, 'app1'))).toBe(false);
  });

  it('restores a project that had no Claude Code files at all', async () => {
    const before = await contents(ws.project);
    await relay('init', 'app1');
    await relay('init', '--undo', 'app1');
    expect(await contents(ws.project)).toEqual(before);
  });

  it('also works from the lead folder, and after a re-run with new settings', async () => {
    await existingProject();
    const before = await contents(ws.project);
    await relay('init', 'app1');
    await relay('init', 'app1', '--delivery', 'blocking');
    ws.ctx.cwd = ws.lead;
    expect(await relay('init', '--undo')).toBe(0);
    expect(await contents(ws.project)).toEqual(before);
  });

  it("keeps changes Claude Code made to settings.local.json after init, removing only Relay's part", async () => {
    await relay('init', 'app1');
    const localFile = file(ws.project, '.claude', 'settings.local.json');
    const local = await readJson(localFile);
    // A "Yes, and don't ask again" approval saved by Claude Code:
    await writeFile(localFile, JSON.stringify({ ...local, permissions: { allow: ['Bash(ls)'] } }));

    await relay('init', '--undo', 'app1');
    expect(await readJson(localFile)).toEqual({ permissions: { allow: ['Bash(ls)'] } });
    expect(ws.output.join('\n')).toContain('cleaned');
  });

  it('keeps the lead folder if it holds files Relay did not create', async () => {
    await relay('init', 'app1');
    await writeFile(file(ws.lead, 'notes.txt'), 'mine');
    await relay('init', '--undo', 'app1');
    expect(await contents(ws.lead)).toEqual({ 'notes.txt': 'mine' });
    expect(ws.output.join('\n')).toContain("it holds files Relay didn't create");
  });
});

describe('relay init errors', () => {
  it('refuses a folder that does not exist', async () => {
    expect(await relay('init', 'nope')).toBe(1);
    expect(ws.output.at(-1)).toContain('is not a folder');
  });

  it("refuses when Relay's hooks aren't built", async () => {
    ws.ctx.hooksBinDir = file(ws.root, 'missing');
    expect(await relay('init', 'app1')).toBe(1);
    expect(ws.output.at(-1)).toContain('npm run build');
  });

  it('writes nothing if settings.local.json is broken', async () => {
    await mkdir(file(ws.project, '.claude'), { recursive: true });
    await writeFile(file(ws.project, '.claude', 'settings.local.json'), '{ broken');
    const before = await contents(ws.project);
    expect(await relay('init', 'app1')).toBe(1);
    expect(ws.output.at(-1)).toContain('is not valid JSON');
    expect(await contents(ws.project)).toEqual(before);
    expect(existsSync(ws.lead)).toBe(false);
  });

  it('refuses a name already used by another project', async () => {
    await relay('init', 'app1');
    const other = file(ws.root, 'elsewhere', 'app1');
    await mkdir(other, { recursive: true });
    expect(await relay('init', other)).toBe(1);
    expect(ws.output.at(-1)).toContain('already used');
  });

  it('refuses --undo when there is no project', async () => {
    expect(await relay('init', '--undo', 'app1')).toBe(1);
    expect(ws.output.at(-1)).toContain('No Relay project found');
  });

  it.each([
    [['init'], 'Usage: relay init <project-path>'],
    [['init', 'app1', '--delivery', 'fast'], '--delivery must be'],
    [['init', 'app1', '--max-rounds', '0'], '--max-rounds must be'],
  ])('rejects bad arguments: %j', async (args, message) => {
    expect(await relay(...args)).toBe(1);
    expect(ws.output.at(-1)).toContain(message);
  });
});

describe('safeProjectName', () => {
  it.each([
    ['app1', 'app1'],
    ['My App', 'My-App'],
    ['.hidden', 'hidden'],
    ['a..b', 'a.b'],
    ['café', 'caf-'],
  ])('%j → %j', (input, expected) => {
    expect(safeProjectName(input)).toBe(expected);
  });
});
