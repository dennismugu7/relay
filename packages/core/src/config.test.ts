import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ConfigError, isValidProjectName, loadConfig, parseConfig } from './config.js';

// Absolute paths that are valid on the machine running the tests (Windows or Linux).
const builderPath = path.join(os.tmpdir(), 'app1');
const leadPath = path.join(os.tmpdir(), 'app1-lead');
const valid = {
  name: 'app1',
  builderPath,
  leadPath,
  maxRounds: 5,
  delivery: 'blocking',
  timeoutSeconds: 600,
};

describe('parseConfig', () => {
  it('accepts a complete config', () => {
    expect(parseConfig(valid)).toEqual(valid);
  });

  it('fills in defaults for maxRounds and delivery', () => {
    expect(parseConfig({ name: 'app1', builderPath, leadPath })).toEqual({
      name: 'app1',
      builderPath,
      leadPath,
      maxRounds: 20,
      delivery: 'rewake',
      timeoutSeconds: 3600,
    });
  });

  it.each([null, [], 'app1', 42])('rejects %j, which is not an object', (value) => {
    expect(() => parseConfig(value)).toThrow('Config must be a JSON object.');
  });

  it.each([
    ['a missing name', { ...valid, name: undefined }, '"name"'],
    ['a name with a slash', { ...valid, name: 'a/b' }, '"name"'],
    ['a name with ..', { ...valid, name: 'a..b' }, '"name"'],
    ['a relative builder path', { ...valid, builderPath: 'app1' }, '"builderPath"'],
    ['a missing lead path', { ...valid, leadPath: undefined }, '"leadPath"'],
    ['the same folder twice', { ...valid, leadPath: builderPath }, 'must be different'],
    ['zero max rounds', { ...valid, maxRounds: 0 }, '"maxRounds"'],
    ['fractional max rounds', { ...valid, maxRounds: 2.5 }, '"maxRounds"'],
    ['max rounds as text', { ...valid, maxRounds: '5' }, '"maxRounds"'],
    ['a short timeout', { ...valid, timeoutSeconds: 30 }, '"timeoutSeconds"'],
    ['an unknown delivery mode', { ...valid, delivery: 'pipe' }, '"delivery"'],
  ])('rejects %s', (_name, value, expected) => {
    expect(() => parseConfig(value)).toThrow(ConfigError);
    expect(() => parseConfig(value)).toThrow(expected);
  });

  it('lists every problem in one error', () => {
    expect(() => parseConfig({})).toThrow(/"name"[\s\S]*"builderPath"[\s\S]*"leadPath"/);
  });
});

describe('isValidProjectName', () => {
  it.each(['app1', 'my-app', 'my_app.v2', 'A'])('accepts %s', (name) => {
    expect(isValidProjectName(name)).toBe(true);
  });

  it.each(['', '.hidden', '-x', 'a b', 'a\\b', '..', 'x'.repeat(65)])('rejects %j', (name) => {
    expect(isValidProjectName(name)).toBe(false);
  });
});

describe('loadConfig', () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), 'relay-config-'));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('reads a config file', async () => {
    const file = path.join(dir, 'relay.config.json');
    await writeFile(file, JSON.stringify(valid));
    await expect(loadConfig(file)).resolves.toEqual(valid);
  });

  it('names the file when it is missing', async () => {
    const file = path.join(dir, 'missing.json');
    await expect(loadConfig(file)).rejects.toThrow(`Cannot read ${file}`);
  });

  it('names the file when it is not valid JSON', async () => {
    const file = path.join(dir, 'relay.config.json');
    await writeFile(file, '{ "name": ');
    await expect(loadConfig(file)).rejects.toThrow(`${file} is not valid JSON`);
  });

  it('names the file when a value is invalid', async () => {
    const file = path.join(dir, 'relay.config.json');
    await writeFile(file, JSON.stringify({ ...valid, maxRounds: -1 }));
    await expect(loadConfig(file)).rejects.toThrow(`${file}: Invalid config`);
  });
});
