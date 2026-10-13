import { describe, expect, it } from 'vitest';

import { hasBuriedCodeTag, parseTag } from './tags.js';

describe('parseTag', () => {
  describe('TO CODE:', () => {
    it('sends a plain tagged reply to the builder', () => {
      expect(parseTag('TO CODE: Add a /health endpoint.')).toEqual({
        to: 'code',
        tagged: true,
        body: 'Add a /health endpoint.',
      });
    });

    it.each([
      ['mixed case', 'To Code: do it'],
      ['lower case', 'to code: do it'],
      ['leading spaces', '   TO CODE: do it'],
      ['leading blank lines', '\n\n  \nTO CODE: do it'],
      ['Windows line endings', '\r\n\r\nTO CODE: do it'],
      ['bold, colon inside', '**TO CODE:** do it'],
      ['bold, colon outside', '**TO CODE**: do it'],
      ['underscore bold', '__TO CODE:__ do it'],
      ['italic', '*TO CODE:* do it'],
      ['inline code', '`TO CODE:` do it'],
      ['heading', '## TO CODE: do it'],
      ['quote', '> TO CODE: do it'],
      ['extra spaces', 'TO   CODE  : do it'],
      ['no space after colon', 'TO CODE:do it'],
    ])('accepts %s', (_name, reply) => {
      expect(parseTag(reply)).toEqual({ to: 'code', tagged: true, body: 'do it' });
    });

    it('keeps a multi-line body intact', () => {
      const reply = 'TO CODE:\nStep 1: write a test.\nStep 2: make it pass.\n';
      expect(parseTag(reply).body).toBe('Step 1: write a test.\nStep 2: make it pass.');
    });

    it('sends an empty TO CODE: to Dennis, since there is nothing to deliver', () => {
      expect(parseTag('TO CODE:   \n')).toEqual({ to: 'dennis', tagged: true, body: '' });
      expect(parseTag('**TO CODE:**')).toEqual({ to: 'dennis', tagged: true, body: '' });
    });
  });

  describe('TO DENNIS:', () => {
    it('sends a tagged reply to Dennis', () => {
      expect(parseTag('TO DENNIS: Which database should we use?')).toEqual({
        to: 'dennis',
        tagged: true,
        body: 'Which database should we use?',
      });
    });

    it('handles markdown and mixed case', () => {
      expect(parseTag('  **to dennis:** all done')).toEqual({
        to: 'dennis',
        tagged: true,
        body: 'all done',
      });
    });
  });

  describe('no tag', () => {
    it('sends an untagged reply to Dennis, keeping the whole text', () => {
      expect(parseTag('  Here is my plan.  ')).toEqual({
        to: 'dennis',
        tagged: false,
        body: 'Here is my plan.',
      });
    });

    it('treats an empty reply as untagged', () => {
      expect(parseTag('')).toEqual({ to: 'dennis', tagged: false, body: '' });
    });

    it.each([
      ['a tag later in the reply', 'Plan ready.\nTO CODE: do it'],
      ['a tag mid-sentence', 'I will say TO CODE: soon'],
      ['a missing colon', 'TO CODE do it'],
      ['a longer word', 'TO CODEX: do it'],
      ['no space between the words', 'TOCODE: do it'],
      ['an unknown destination', 'TO BUILDER: do it'],
      ['a list marker', '- TO CODE: do it'],
    ])('does not count %s', (_name, reply) => {
      const parsed = parseTag(reply);
      expect(parsed.to).toBe('dennis');
      expect(parsed.tagged).toBe(false);
      expect(parsed.body).toBe(reply.trim());
    });
  });
});

describe('hasBuriedCodeTag', () => {
  it.each([
    ['review text, then the tag (bug 002)', 'Task 1 checks out.\n\nTO CODE: now add a test'],
    ['a bold tag', 'Looks good.\n**TO CODE:** next step'],
    ['a heading tag', 'Looks good.\n## TO CODE: next step'],
    ['mixed case', 'Looks good.\nTo Code: next step'],
    ['Windows line endings', 'Looks good.\r\nTO CODE: next step'],
    ['a tag after a closed code block', 'Like this:\n```\nx = 1\n```\nTO CODE: do it'],
  ])('finds %s', (_name, reply) => {
    expect(hasBuriedCodeTag(reply)).toBe(true);
  });

  it.each([
    ['a plain untagged reply', 'All done, nothing more to do.'],
    ['a quoted tag', 'The builder wrote:\n> TO CODE: do it'],
    ['a tag inside a ``` code block', 'Example:\n```\nTO CODE: do it\n```'],
    ['a tag inside a ~~~ code block', 'Example:\n~~~\nTO CODE: do it\n~~~'],
    ['a tag in an unclosed code block', 'Example:\n```\nTO CODE: do it'],
    ['an indented code line', 'Example:\n\n    TO CODE: do it'],
    ['an inline code tag', 'Start replies with `TO CODE:` please.\n`TO CODE:` like that.'],
    ['a tag mid-sentence', 'I will say TO CODE: later'],
    ['a list item', 'Steps:\n- TO CODE: do it'],
    ['a longer word', 'Hmm.\nTO CODEX: do it'],
    ['TO DENNIS: further down', 'Done.\nTO DENNIS: all good'],
  ])('ignores %s', (_name, reply) => {
    expect(hasBuriedCodeTag(reply)).toBe(false);
  });
});
