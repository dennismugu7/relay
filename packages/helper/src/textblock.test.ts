import { describe, expect, it } from 'vitest';

import { BLOCK_END, BLOCK_START, removeBlock, setBlock } from './textblock.js';

const block = (...lines: string[]) => [BLOCK_START, ...lines, BLOCK_END].join('\n') + '\n';

describe('setBlock', () => {
  it('creates a file holding only the block', () => {
    expect(setBlock(undefined, ['/a'])).toBe(block('/a'));
  });

  it('appends after existing content, adding a missing final newline', () => {
    expect(setBlock('*.log\n', ['/a'])).toBe('*.log\n' + block('/a'));
    expect(setBlock('*.log', ['/a'])).toBe('*.log\n' + block('/a'));
  });

  it('replaces an older block instead of adding a second one', () => {
    const once = setBlock('*.log\n', ['/a']);
    expect(setBlock(once, ['/b'])).toBe('*.log\n' + block('/b'));
    expect(setBlock(once, ['/a'])).toBe(once);
  });
});

describe('removeBlock', () => {
  it('removes the block and nothing else', () => {
    expect(removeBlock('*.log\n' + block('/a') + 'tmp/\n')).toBe('*.log\ntmp/\n');
    expect(removeBlock(block('/a'))).toBe('');
  });

  it('leaves text without a block alone', () => {
    expect(removeBlock('*.log\n')).toBe('*.log\n');
  });
});
