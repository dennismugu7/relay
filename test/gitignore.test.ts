import { spawnSync } from 'node:child_process';

import { describe, expect, it } from 'vitest';

// Asks Git itself whether a path is ignored. `git check-ignore -q` exits
// with 0 when the path is ignored and 1 when it is not.
function isIgnored(path: string): boolean {
  const result = spawnSync('git', ['check-ignore', '-q', '--no-index', path]);
  return result.status === 0;
}

describe('.gitignore', () => {
  it('ignores throwaway spike folders at the repo root', () => {
    expect(isIgnored('spikes/001/hook.cjs')).toBe(true);
  });

  it('keeps spike write-ups in docs/spikes/', () => {
    expect(isIgnored('docs/spikes/001-example.md')).toBe(false);
  });

  it('never tracks real .env files but keeps .env.example', () => {
    expect(isIgnored('.env')).toBe(true);
    expect(isIgnored('.env.example')).toBe(false);
  });
});
