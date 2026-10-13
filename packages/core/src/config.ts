/**
 * Project config: `relay.config.json`.
 *
 * One file per project, written by `relay init` (M4). It names the project,
 * says where the two sessions' folders are, and sets the safety limits.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';

/** The config file's name. */
export const CONFIG_FILE_NAME = 'relay.config.json';

/**
 * How messages are delivered (ADR 0002):
 * - `rewake`: an `asyncRewake` Stop hook wakes the idle session (main path).
 * - `blocking`: the Stop hook waits in the foreground (fallback).
 */
export type DeliveryMode = 'rewake' | 'blocking';

export interface RelayConfig {
  /** Project name. Also the folder name under `~/.relay/`. */
  name: string;
  /** Absolute path of the builder session's folder (the project itself). */
  builderPath: string;
  /** Absolute path of the lead session's folder. */
  leadPath: string;
  /** Rounds allowed before Relay stops and hands control to Dennis. */
  maxRounds: number;
  delivery: DeliveryMode;
  /**
   * The hook timeout in seconds. `relay init` writes it into both sessions'
   * settings; a waiter re-arms shortly before it runs out (ADR 0002).
   */
  timeoutSeconds: number;
}

/** Used when the config file leaves a setting out. */
export const DEFAULTS = { maxRounds: 20, delivery: 'rewake', timeoutSeconds: 3600 } as const;

const DELIVERY_MODES: readonly string[] = ['rewake', 'blocking'];

/**
 * True if `name` is safe to use as a folder name: letters, digits, `.`, `_`
 * and `-`, starting with a letter or digit. This rules out slashes and `..`,
 * so a project name can never point outside `~/.relay/`.
 */
export function isValidProjectName(name: string): boolean {
  return /^[a-z0-9][a-z0-9._-]{0,63}$/i.test(name) && !name.includes('..');
}

/** Thrown when a config file is missing, unreadable or has invalid values. */
export class ConfigError extends Error {
  override name = 'ConfigError';
}

/**
 * Checks a parsed JSON value and returns a complete config.
 * Collects every problem, so one error message lists them all.
 */
export function parseConfig(value: unknown): RelayConfig {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new ConfigError('Config must be a JSON object.');
  }
  const raw = value as Record<string, unknown>;
  const problems: string[] = [];

  const { name, builderPath, leadPath } = raw;
  if (typeof name !== 'string' || !isValidProjectName(name)) {
    problems.push(
      '"name" must be 1–64 letters, digits, ".", "_" or "-", starting with a letter or digit.',
    );
  }
  for (const [key, p] of [
    ['builderPath', builderPath],
    ['leadPath', leadPath],
  ] as const) {
    if (typeof p !== 'string' || !path.isAbsolute(p)) {
      problems.push(`"${key}" must be an absolute folder path.`);
    }
  }
  if (typeof builderPath === 'string' && builderPath === leadPath) {
    problems.push('"builderPath" and "leadPath" must be different folders.');
  }

  const maxRounds = raw.maxRounds ?? DEFAULTS.maxRounds;
  if (typeof maxRounds !== 'number' || !Number.isInteger(maxRounds) || maxRounds < 1) {
    problems.push('"maxRounds" must be a whole number of at least 1.');
  }
  const delivery = raw.delivery ?? DEFAULTS.delivery;
  if (typeof delivery !== 'string' || !DELIVERY_MODES.includes(delivery)) {
    problems.push('"delivery" must be "rewake" or "blocking".');
  }
  const timeoutSeconds = raw.timeoutSeconds ?? DEFAULTS.timeoutSeconds;
  if (
    typeof timeoutSeconds !== 'number' ||
    !Number.isInteger(timeoutSeconds) ||
    timeoutSeconds < 60
  ) {
    problems.push('"timeoutSeconds" must be a whole number of at least 60.');
  }

  if (problems.length > 0) {
    throw new ConfigError(`Invalid config:\n- ${problems.join('\n- ')}`);
  }
  return {
    name: name as string,
    builderPath: builderPath as string,
    leadPath: leadPath as string,
    maxRounds: maxRounds as number,
    delivery: delivery as DeliveryMode,
    timeoutSeconds: timeoutSeconds as number,
  };
}

/** Reads and checks a `relay.config.json` file. */
export async function loadConfig(file: string): Promise<RelayConfig> {
  let text: string;
  try {
    text = await readFile(file, 'utf8');
  } catch (error) {
    throw new ConfigError(`Cannot read ${file}: ${(error as Error).message}`);
  }
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (error) {
    throw new ConfigError(`${file} is not valid JSON: ${(error as Error).message}`);
  }
  try {
    return parseConfig(value);
  } catch (error) {
    throw new ConfigError(`${file}: ${(error as Error).message}`);
  }
}
