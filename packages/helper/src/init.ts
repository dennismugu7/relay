/**
 * `relay init <project>` and `relay init --undo <project>`.
 *
 * Init turns a project folder into a lead + builder pair (ADR 0006):
 *
 *   <project>-lead/                     created by Relay, owned by Relay
 *     CLAUDE.md                         the lead's instructions (template)
 *     relay.config.json                 the project's Relay settings
 *     .claude/settings.json             lead hooks + read access to the project
 *   <project>/                          yours: Relay only adds files
 *     .claude/rules/relay-builder.md    the builder's Relay instructions
 *     .claude/skills/relay-start/SKILL.md
 *     .claude/settings.local.json       builder hooks, merged into any existing file
 *     .git/info/exclude                 keeps Relay's files out of git (local only)
 *
 * Your CLAUDE.md and .claude/settings.json are never touched. Running init
 * again changes nothing unless relay.config.json changed.
 */
import { existsSync, statSync } from 'node:fs';
import { mkdir, readFile, rm } from 'node:fs/promises';
import path from 'node:path';

import {
  CONFIG_FILE_NAME,
  DEFAULTS,
  type DeliveryMode,
  isValidProjectName,
  loadConfig,
  type RelayConfig,
  type Role,
  stateDir,
  writeFileAtomic,
} from '@relay/core';

import type { CliContext } from './context.js';
import {
  applyPlans,
  type FilePlan,
  type Manifest,
  readText,
  removeCreatedDirs,
  undoFile,
} from './managed.js';
import { findProject, leadFolderFor } from './project.js';
import { addRelaySettings, formatSettings, type HookSpec, parseSettings } from './settings.js';
import { setBlock } from './textblock.js';

export const MANIFEST_FILE = 'install.json';

export interface InitOptions {
  name?: string;
  delivery?: DeliveryMode;
  maxRounds?: number;
}

/** A folder name made safe for use as a project name, e.g. "My App" → "My-App". */
export function safeProjectName(folderName: string): string {
  return folderName
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/\.{2,}/g, '.')
    .replace(/^[^a-zA-Z0-9]+/, '')
    .slice(0, 64);
}

/** Finds the git repository a folder belongs to, if any. */
function findGitExclude(folder: string): { repoRoot: string; excludeFile: string } | undefined {
  for (let dir = folder; ; dir = path.dirname(dir)) {
    const git = path.join(dir, '.git');
    if (existsSync(git)) {
      // A `.git` file (not folder) means a worktree or submodule: skip it.
      if (!statSync(git).isDirectory()) return undefined;
      return { repoRoot: dir, excludeFile: path.join(git, 'info', 'exclude') };
    }
    if (path.dirname(dir) === dir) return undefined;
  }
}

async function fillTemplate(ctx: CliContext, name: string, values: Record<string, string>) {
  const text = await readFile(path.join(ctx.templatesDir, name), 'utf8');
  return text.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => values[key] ?? `{{${key}}}`);
}

async function readManifest(dir: string): Promise<Manifest | undefined> {
  const text = await readText(path.join(dir, MANIFEST_FILE));
  return text === undefined ? undefined : (JSON.parse(text) as Manifest);
}

/** Works out the config: the existing file if there is one, with any options applied. */
async function resolveConfig(
  projectPath: string,
  leadPath: string,
  options: InitOptions,
): Promise<RelayConfig> {
  const configPath = path.join(leadPath, CONFIG_FILE_NAME);
  if (existsSync(configPath)) {
    const existing = await loadConfig(configPath);
    if (path.resolve(existing.builderPath) !== projectPath) {
      throw new Error(`${configPath} belongs to another project (${existing.builderPath}).`);
    }
    if (options.name && options.name !== existing.name) {
      throw new Error(
        `This project is already set up as "${existing.name}". Undo first to rename it.`,
      );
    }
    return {
      ...existing,
      ...(options.delivery ? { delivery: options.delivery } : {}),
      ...(options.maxRounds ? { maxRounds: options.maxRounds } : {}),
    };
  }
  const name = options.name ?? safeProjectName(path.basename(projectPath));
  if (!isValidProjectName(name)) {
    throw new Error(`Can't make a project name from "${path.basename(projectPath)}". Use --name.`);
  }
  return {
    name,
    builderPath: projectPath,
    leadPath,
    maxRounds: options.maxRounds ?? DEFAULTS.maxRounds,
    delivery: options.delivery ?? DEFAULTS.delivery,
    timeoutSeconds: DEFAULTS.timeoutSeconds,
  };
}

export async function init(ctx: CliContext, projectArg: string, options: InitOptions = {}) {
  const projectPath = path.resolve(ctx.cwd, projectArg);
  if (!existsSync(projectPath) || !statSync(projectPath).isDirectory()) {
    throw new Error(`${projectPath} is not a folder.`);
  }
  const stopScript = path.join(ctx.hooksBinDir, 'stop.js');
  const promptScript = path.join(ctx.hooksBinDir, 'prompt-submit.js');
  if (!existsSync(stopScript) || !existsSync(promptScript)) {
    throw new Error(
      `Relay's hooks aren't built (${stopScript} is missing). Run "npm run build" in the Relay repo.`,
    );
  }

  const leadPath = leadFolderFor(projectPath);
  const config = await resolveConfig(projectPath, leadPath, options);
  const configPath = path.join(leadPath, CONFIG_FILE_NAME);
  const dir = stateDir(config.name, ctx.relayHome);

  const manifest: Manifest = (await readManifest(dir)) ?? {
    version: 1,
    project: config.name,
    builderPath: projectPath,
    leadPath,
    files: [],
    createdDirs: [],
  };
  if (path.resolve(manifest.builderPath) !== projectPath) {
    throw new Error(
      `The name "${config.name}" is already used by ${manifest.builderPath}. Use --name to pick another.`,
    );
  }

  const spec = (role: Role): HookSpec => ({
    role,
    delivery: config.delivery,
    timeoutSeconds: config.timeoutSeconds,
    configPath,
    stopScript,
    promptScript,
  });
  const values = { name: config.name, builderPath: projectPath, leadPath };
  const leadClaudeMd = await fillTemplate(ctx, 'lead-CLAUDE.md', values);
  const builderRules = await fillTemplate(ctx, 'builder-relay.md', values);
  const skill = await fillTemplate(ctx, 'relay-start-SKILL.md', values);

  const rulesFile = path.join(projectPath, '.claude', 'rules', 'relay-builder.md');
  const skillFile = path.join(projectPath, '.claude', 'skills', 'relay-start', 'SKILL.md');
  const builderSettings = path.join(projectPath, '.claude', 'settings.local.json');
  const leadSettings = path.join(leadPath, '.claude', 'settings.json');

  const plans: FilePlan[] = [
    { path: configPath, kind: 'owned', desired: () => JSON.stringify(config, null, 2) + '\n' },
    { path: path.join(leadPath, 'CLAUDE.md'), kind: 'owned', desired: () => leadClaudeMd },
    {
      path: leadSettings,
      kind: 'settings',
      builderPath: projectPath,
      desired: (current) =>
        formatSettings(
          addRelaySettings(parseSettings(current, leadSettings), spec('lead'), {
            readProjectFrom: projectPath,
          }),
        ),
    },
    { path: rulesFile, kind: 'owned', desired: () => builderRules },
    { path: skillFile, kind: 'owned', desired: () => skill },
    {
      path: builderSettings,
      kind: 'settings',
      desired: (current) =>
        formatSettings(addRelaySettings(parseSettings(current, builderSettings), spec('builder'))),
    },
  ];

  // Keep the files Relay creates in your project out of git, without
  // changing your .gitignore: .git/info/exclude is local to this machine.
  const git = findGitExclude(projectPath);
  if (git) {
    const settingsEntry = manifest.files.find((f) => f.path === builderSettings);
    const createdSettings = settingsEntry
      ? !settingsEntry.existedBefore
      : !existsSync(builderSettings);
    // Git patterns: "/" at the start anchors to the repo root; "/" at the end means a folder.
    const pattern = (p: string) => '/' + path.relative(git.repoRoot, p).split(path.sep).join('/');
    const lines = [
      pattern(rulesFile),
      pattern(path.dirname(skillFile)) + '/',
      ...(createdSettings ? [pattern(builderSettings)] : []),
    ];
    plans.push({
      path: git.excludeFile,
      kind: 'block',
      desired: (current) => setBlock(current, lines),
    });
  }

  const changed = await applyPlans(plans, manifest, async (m) => {
    await mkdir(dir, { recursive: true });
    await writeFileAtomic(path.join(dir, MANIFEST_FILE), JSON.stringify(m, null, 2) + '\n');
  });

  if (changed.length === 0) {
    ctx.print(`Relay is already set up for ${config.name}. Nothing changed.`);
    return;
  }
  ctx.print(`Relay is set up for ${config.name}.`);
  ctx.print('');
  for (const file of changed) ctx.print(`  wrote ${file}`);
  ctx.print('');
  ctx.print('Next:');
  ctx.print(`  1. Open Claude Code in ${projectPath} (the builder) and run /relay-start.`);
  ctx.print(`  2. Open Claude Code in ${leadPath} (the lead) and give it a goal.`);
  ctx.print('  Check on it any time with "relay status" and "relay log".');
}

export async function undo(ctx: CliContext, projectArg?: string) {
  const project = await findProject(ctx, projectArg);
  const manifest = await readManifest(project.stateDir);
  if (!manifest) {
    throw new Error(
      `No install record for ${project.config.name}, so there's nothing Relay can undo safely.`,
    );
  }

  ctx.print(`Removing Relay from ${project.config.name}:`);
  for (const file of [...manifest.files].reverse()) {
    const result = await undoFile(file);
    ctx.print(`  ${result.action.padEnd(12)} ${result.path}`);
  }
  await removeCreatedDirs(manifest.createdDirs);
  if (existsSync(manifest.leadPath)) {
    ctx.print(`  Kept ${manifest.leadPath}: it holds files Relay didn't create.`);
  }
  await rm(project.stateDir, { recursive: true, force: true });
  ctx.print(`  deleted      ${project.stateDir} (state and activity log)`);
  ctx.print('Done. Your own files are as they were before relay init.');
}
