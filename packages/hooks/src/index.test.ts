import { describe, expect, it } from 'vitest';

import { PACKAGE_NAME } from './index.js';

describe('@relay/hooks', () => {
  it('exports its package name', () => {
    expect(PACKAGE_NAME).toBe('@relay/hooks');
  });
});
