/**
 * Finding a Relay project from a folder.
 *
 * `relay init <project>` creates the lead folder `<project>-lead` next to the
 * project and puts `relay.config.json` in it. So from either folder we can
 * find the config:
 *   - in the lead folder:     ./relay.config.json
 *   - in the project folder:  ../<name>-lead/relay.config.json
 */
import { existsSync } from 'node:fs';
import path from 'node:path';

import { CONFIG_FILE_NAME, loadConfig, type RelayConfig, stateDir } from '@relay/core';

import type { CliContext } from './context.js';

export interface Project {
  config: RelayConfig;
  configPath: string;
  /** Where the project's state and activity log live. */
  stateDir: string;
}

/** The lead folder Relay uses for a project folder: a sibling named `<name>-lead`. */
export function leadFolderFor(projectPath: string): string {
  return path.join(path.dirname(projectPath), `${path.basename(projectPath)}-lead`);
}

/** Finds the project for `folder` (default: where the command was run). */
export async function findProject(ctx: CliContext, folder?: string): Promise<Project> {
  const start = path.resolve(ctx.cwd, folder ?? '.');
  const candidates = [
    path.join(start, CONFIG_FILE_NAME),
    path.join(leadFolderFor(start), CONFIG_FILE_NAME),
  ];
  const configPath = candidates.find((c) => existsSync(c));
  if (!configPath) {
    throw new Error(
      `No Relay project found for ${start}. Run "relay init <project-path>" first, ` +
        'or run this command from the project or its lead folder.',
    );
  }
  const config = await loadConfig(configPath);
  return { config, configPath, stateDir: stateDir(config.name, ctx.relayHome) };
}
