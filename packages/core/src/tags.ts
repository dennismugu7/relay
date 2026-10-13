/**
 * Message tag parsing.
 *
 * The lead starts every reply with a tag that says where it goes:
 * - `TO CODE:`   → deliver the rest of the reply to the builder.
 * - `TO DENNIS:` → hand control back to Dennis.
 * - no tag       → treated as `TO DENNIS:` (the safe default).
 *
 * See docs/PROJECT_BRIEF.md, "The message protocol".
 */

/** Where a reply should go. */
export type Destination = 'code' | 'dennis';

export interface ParsedReply {
  /** Where the reply goes. */
  to: Destination;
  /** True if the reply started with a recognised tag. */
  tagged: boolean;
  /** The message without its tag, trimmed. For an untagged reply, the whole reply. */
  body: string;
}

// Read left to right, the pattern allows:
//   ^\s*              any leading whitespace or blank lines
//   (?:#{1,6}\s+)?    an optional markdown heading marker, e.g. "## "
//   (?:>\s*)?         an optional quote marker, e.g. "> "
//   [*_`]*\s*         optional bold/italic/code markers, e.g. "**"
//   to\s+(code|dennis) the tag words, any case, any spacing between them
//   \s*[*_`]*\s*:     the colon, with markers allowed before it ("**TO CODE**:")
//   [*_`]*            markers allowed after it too ("**TO CODE:**")
// The `i` flag makes it case-insensitive, so "To Code:" works.
const TAG_PATTERN = /^\s*(?:#{1,6}\s+)?(?:>\s*)?[*_`]*\s*to\s+(code|dennis)\s*[*_`]*\s*:[*_`]*/i;

/**
 * Works out where a reply should go.
 *
 * Only a tag at the very start of the reply counts. A `TO CODE:` with nothing
 * after it goes to Dennis, because there is nothing to deliver.
 */
export function parseTag(reply: string): ParsedReply {
  const match = TAG_PATTERN.exec(reply);
  if (!match) {
    return { to: 'dennis', tagged: false, body: reply.trim() };
  }

  const body = reply.slice(match[0].length).trim();
  const to: Destination = match[1]?.toLowerCase() === 'code' ? 'code' : 'dennis';
  if (to === 'code' && body === '') {
    return { to: 'dennis', tagged: true, body };
  }
  return { to, tagged: true, body };
}
