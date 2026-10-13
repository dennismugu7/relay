/**
 * A block of lines that Relay adds to a plain text file (such as
 * `.git/info/exclude`) between two marker lines, so it can be found and
 * removed again later.
 */

export const BLOCK_START = '# >>> relay (added by relay init; removed by relay init --undo)';
export const BLOCK_END = '# <<< relay';

const BLOCK_PATTERN = /(^|\n)# >>> relay[^\n]*\n[\s\S]*?# <<< relay(\n|$)/;

/** Returns `text` without Relay's block. */
export function removeBlock(text: string): string {
  return text.replace(BLOCK_PATTERN, '$1');
}

/** Returns `text` with Relay's block (holding `lines`) at the end, replacing any old one. */
export function setBlock(text: string | undefined, lines: string[]): string {
  const base = removeBlock(text ?? '');
  const separator = base === '' || base.endsWith('\n') ? '' : '\n';
  return base + separator + [BLOCK_START, ...lines, BLOCK_END].join('\n') + '\n';
}
