import { describe, expect, it } from 'vitest';

import * as core from './index.js';

describe('@relay/core', () => {
  it('exports its package name', () => {
    expect(core.PACKAGE_NAME).toBe('@relay/core');
  });

  it('exports the public API from one place', () => {
    for (const name of [
      'parseTag',
      'parseConfig',
      'loadConfig',
      'stateDir',
      'readState',
      'updateState',
      'enqueueMessage',
      'takeMessageFor',
      'registerWaiter',
      'isCurrentWaiter',
      'clearWaiter',
      'startRound',
      'appendActivity',
      'readActivity',
    ]) {
      expect(core, name).toHaveProperty(name, expect.any(Function));
    }
  });
});
