import { describe, expect, it } from 'vitest';

import {
  addRelaySettings,
  type HookSpec,
  isRelayGroup,
  parseSettings,
  removeRelaySettings,
} from './settings.js';

const spec: HookSpec = {
  role: 'builder',
  delivery: 'rewake',
  timeoutSeconds: 3600,
  configPath: 'C:\\work\\app1-lead\\relay.config.json',
  stopScript: 'C:\\relay\\packages\\hooks\\dist\\bin\\stop.js',
  promptScript: 'C:\\relay\\packages\\hooks\\dist\\bin\\prompt-submit.js',
};
const userSettings = {
  model: 'sonnet',
  env: { MY_VAR: '1' },
  permissions: { allow: ['Bash(npm test)'], additionalDirectories: ['C:\\shared'] },
  hooks: {
    Stop: [{ hooks: [{ type: 'command', command: 'say done' }] }],
    PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'check' }] }],
  },
};

describe('isRelayGroup', () => {
  it.each([
    ['a Windows path', 'C:\\relay\\packages\\hooks\\dist\\bin\\stop.js'],
    ['a forward-slash path', '/home/d/relay/packages/hooks/dist/bin/prompt-submit.js'],
  ])("recognises Relay's hook by its script, with %s", (_n, script) => {
    expect(isRelayGroup({ hooks: [{ type: 'command', command: 'node', args: [script] }] })).toBe(
      true,
    );
  });

  it.each([
    ['a user hook', { hooks: [{ type: 'command', command: 'say done' }] }],
    ['another node script', { hooks: [{ command: 'node', args: ['C:\\tools\\stop.js'] }] }],
    ['junk', 'not a group'],
  ])('ignores %s', (_n, group) => {
    expect(isRelayGroup(group)).toBe(false);
  });
});

describe('addRelaySettings', () => {
  it('adds the hooks and keeps everything else', () => {
    const result = addRelaySettings(userSettings, spec);
    expect(result.model).toBe('sonnet');
    expect(result.env).toEqual({ MY_VAR: '1' });
    expect(result.permissions).toEqual(userSettings.permissions);
    const hooks = result.hooks as Record<string, unknown[]>;
    expect(hooks.PreToolUse).toEqual(userSettings.hooks.PreToolUse);
    expect(hooks.Stop).toHaveLength(2);
    expect(hooks.Stop?.[0]).toEqual(userSettings.hooks.Stop[0]);
    expect(hooks.UserPromptSubmit).toHaveLength(1);
  });

  it('does not change the object it was given', () => {
    const copy = structuredClone(userSettings);
    addRelaySettings(userSettings, spec);
    expect(userSettings).toEqual(copy);
  });

  it('gives the same result when applied twice', () => {
    const once = addRelaySettings(userSettings, spec);
    expect(addRelaySettings(once, spec)).toEqual(once);
  });

  it('uses asyncRewake only in rewake mode, and the block cap only in blocking mode', () => {
    const rewake = addRelaySettings({}, spec);
    const blocking = addRelaySettings(rewake, { ...spec, delivery: 'blocking' });
    const stopHook = (s: Record<string, unknown>) =>
      (s.hooks as Record<string, { hooks: Record<string, unknown>[] }[]>).Stop?.[0]?.hooks[0];
    expect(stopHook(rewake)).toMatchObject({ asyncRewake: true, timeout: 3600 });
    expect(rewake.env).toBeUndefined();
    expect(stopHook(blocking)).not.toHaveProperty('asyncRewake');
    expect(blocking.env).toEqual({ CLAUDE_CODE_STOP_HOOK_BLOCK_CAP: '1000' });
    // ...and back again removes the cap.
    expect(addRelaySettings(blocking, spec).env).toBeUndefined();
  });

  it('grants the lead read access to the project, once', () => {
    const once = addRelaySettings(
      userSettings,
      { ...spec, role: 'lead' },
      { readProjectFrom: 'C:\\work\\app1' },
    );
    const twice = addRelaySettings(
      once,
      { ...spec, role: 'lead' },
      { readProjectFrom: 'C:\\work\\app1' },
    );
    expect((twice.permissions as Record<string, unknown>).additionalDirectories).toEqual([
      'C:\\shared',
      'C:\\work\\app1',
    ]);
  });
});

describe('removeRelaySettings', () => {
  it('takes out exactly what addRelaySettings put in', () => {
    const added = addRelaySettings(
      userSettings,
      { ...spec, delivery: 'blocking' },
      { readProjectFrom: 'C:\\work\\app1' },
    );
    expect(removeRelaySettings(added, 'C:\\work\\app1')).toEqual(userSettings);
  });

  it('leaves an empty object when only Relay was there', () => {
    expect(removeRelaySettings(addRelaySettings({}, spec))).toEqual({});
  });

  it('keeps a block cap the user set to their own value', () => {
    const s = { env: { CLAUDE_CODE_STOP_HOOK_BLOCK_CAP: '50' } };
    expect(removeRelaySettings(s)).toEqual(s);
  });
});

describe('parseSettings', () => {
  it('treats a missing or empty file as {}', () => {
    expect(parseSettings(undefined, 'f')).toEqual({});
    expect(parseSettings('  \n', 'f')).toEqual({});
  });

  it('refuses broken JSON and non-objects with the file name', () => {
    expect(() => parseSettings('{ nope', 'settings.local.json')).toThrow(
      'settings.local.json is not valid JSON',
    );
    expect(() => parseSettings('[1]', 'f.json')).toThrow('f.json must contain a JSON object');
  });
});
