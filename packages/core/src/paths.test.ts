import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { relayHome, stateDir } from './paths.js';

describe('relayHome', () => {
  it('is .relay inside the home folder', () => {
    expect(relayHome()).toBe(path.join(os.homedir(), '.relay'));
  });
});

describe('stateDir', () => {
  it('is the project folder inside Relay home', () => {
    expect(stateDir('app1')).toBe(path.join(os.homedir(), '.relay', 'app1'));
  });

  it('can use another home folder', () => {
    const home = path.join(os.tmpdir(), 'relay-home');
    expect(stateDir('app1', home)).toBe(path.join(home, 'app1'));
  });

  it.each(['..', '../evil', 'a/b', 'a\\b', ''])('refuses the unsafe name %j', (name) => {
    expect(() => stateDir(name)).toThrow('Invalid project name');
  });
});
