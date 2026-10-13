# 0007 — A one-time nudge when the lead's tag isn't first

**Date:** 2026-10-13 · **Status:** accepted (decided by Dennis after M4)

## Context
Relay only reads a tag at the very start of the lead's reply (M2). In the M4 real run, the lead wrote "The builder's report checks out…" and only then `TO CODE: …`. The reply counted as untagged, so it went to Dennis and the run quietly ended after one round ([bug 002](../learning/bugs/002-lead-wrote-before-the-tag.md)). A sentence in the lead's template fixed that run, but a model can still slip, especially late in a long run.

## Options considered
1. **Keep the template rule only.** Simple, but one slip ends an unattended run, and nobody notices until they look.
2. **Relax the parser: accept a tag anywhere.** Forgiving, but it changes the protocol, and Relay could act on a `TO CODE:` the lead only quoted (for example while reviewing the builder's report or explaining the protocol).
3. **Keep the parser strict, but nudge.** If an untagged reply has a line that *starts* with `TO CODE:` (outside code blocks and quotes), don't end the run. Wake the lead once and ask it to resend with the tag first. The decision about where a message goes is still made only by the strict parser.

## Decision
Option 3, as Dennis specified:
- **When:** a lead reply with no tag at the start, where `hasBuriedCodeTag` finds a line beginning with `TO CODE:` (bold and heading markers allowed). Lines inside ```` ``` ```` or `~~~` fences, quoted lines (`> …`), indented code and inline `` `TO CODE:` `` don't count. A reply that starts with `TO DENNIS:` is tagged, so it's never nudged.
- **What:** the Stop hook wakes the lead straight away (same channel as a delivery, so it works in both delivery modes) with:
  > Relay: your reply didn't start with a tag. Resend it with the tag as the very first thing.
- **Only once per reply.** A `nudgePending` marker on the lead's session state is set by the nudge and cleared by the next reply. If that reply is still wrong, it goes to Dennis as normal.
- **Not a round, not a handoff.** Nothing is queued, the round counter is untouched, and the activity log gets a `nudge` entry (with the original reply) instead of a `handoff`.
- The lead template also says what to do when nudged.

Code: `packages/core/src/tags.ts` (`hasBuriedCodeTag`), `packages/hooks/src/decide.ts` (`decideOnStop`, `NUDGE_MESSAGE`), `packages/hooks/src/stop.ts` (`decision.wake`).

## Evidence
A real lead session (Claude Code 2.1.296, Haiku 5.5, rewake mode) asked to break the rule on purpose:
```
● Looks good.
  TO CODE: create C:\Users\denni\relay-sandbox\m4-app\nudge.txt containing ok
● Stop hook feedback
● TO CODE: create C:\Users\denni\relay-sandbox\m4-app\nudge.txt containing ok
  Looks good.
```
`relay log`:
```
18:29:45  nudge            Looks good. TO CODE: create C:\Users\denni\relay-sandbox\m4-app\nudge.txt containing ok
18:29:47  lead → builder   create C:\Users\denni\relay-sandbox\m4-app\nudge.txt containing ok Looks good.
```
The hook exiting at once (rather than after a wait, like a re-arm) still woke the session, two seconds later.

## Consequences
- One slip no longer ends an unattended run, and the protocol stays strict: a quoted `TO CODE:` is never acted on.
- A resend costs one extra short turn for the lead. It's visible in `relay log` as `nudge`.
- If a lead mentions the tag at the start of a line outside a quote or code block while meaning to talk to Dennis, it gets one nudge. It can answer with `TO DENNIS:`, so the cost is one turn.
