# Relay — project brief

## The problem
Dennis builds apps with two AI sessions: a **lead** that plans and reviews, and a **builder** (Claude Code) that writes the code. Today Dennis is the messenger: he copies the lead's prompt into the builder, waits, then copies the builder's report back to the lead. Every round trip costs time and attention, and work stops when he steps away.

## The solution
Relay passes messages between the two sessions automatically. Dennis still does all his talking in Claude itself. Relay only watches, relays, shows status, and tells Dennis when it's his turn.

**Relay never becomes a third place to type instructions.** All of Dennis's input goes into the Claude sessions directly.

## How it works
Per project there are two Claude Code sessions on Dennis's Windows PC:

| Session | Opened in | Instructions |
|---|---|---|
| Builder | the project folder, e.g. `C:\Users\denni\projects\app1` | the project's own `CLAUDE.md` |
| Lead | a sibling folder, e.g. `C:\Users\denni\projects\app1-lead` | a lead `CLAUDE.md` that Relay generates |

The lead folder is **next to** the project, not inside it, because Claude Code loads `CLAUDE.md` files from parent folders and the roles would mix. The lead gets read access to the project through `permissions.additionalDirectories`.

Both sessions usually have Remote Control on, so Dennis can talk to them from the Claude mobile app.

### The message protocol
The lead tags every reply:
- `TO CODE:` followed by a prompt for the builder → Relay delivers it to the builder.
- `TO DENNIS:` followed by a question or callout → Relay notifies Dennis and lets the lead stop. Dennis answers in the lead session.
- No tag → treated as `TO DENNIS:` (safe default).

The builder's replies always go back to the lead.

### Rounds
One **round** = one `TO CODE:` message delivered to the builder, plus the builder's report returned to the lead. The round counter **resets whenever control returns to Dennis**, that is, whenever the lead sends a `TO DENNIS:` or untagged reply. The max-rounds limit (see Safety rules) counts rounds since the last reset.

### The baton (main approach — to be proven in Stage 1 spikes)
> **Update 2026-10-13:** the M1 spikes refined this. The accepted design is an `asyncRewake` Stop hook that wakes the idle session, with this blocking baton as the fallback. See [ADR 0002](adr/0002-delivery-mechanism.md).

Each session has a **Stop hook**: a script Claude Code runs whenever Claude finishes a reply. The hook reads `last_assistant_message` from its input.
- Lead finishes with `TO CODE:` → hook hands the message to the Relay Helper, then **waits** until the builder's report arrives, and returns it with `{"decision":"block","reason":"<report>"}` so the lead continues with the report.
- Builder finishes → hook hands the report to the Helper, then waits for the next `TO CODE:` message and returns it the same way.
- `/relay-start` in the builder makes it finish a turn immediately so its hook starts waiting for the first message.

Only one session works at a time. The waiting one is paused, not spending usage.

### Pieces
- **Hooks** (`packages/hooks`) — the Stop hook script.
- **Relay Helper** (`packages/helper`) — originally planned as a background process. **Update 2026-10-13:** the hooks do this work themselves, so in Stage 1 `packages/helper` is just the `relay` CLI and its templates ([ADR 0005](adr/0005-no-background-helper.md)).
- **Relay app** (Stage 3) — Android app (Expo) showing status, an activity timeline, a persistent "what's running" notification, alerts, and Pause/Stop. No chat, no typing instructions.

## Stages
1. **Engine on the PC.** Spikes to prove the hook mechanics, then core, hooks, helper, CLI, lead `CLAUDE.md` generator. Done when a test project runs several lead↔builder rounds with no copy-paste.
2. **Phone alerts.** `TO DENNIS:` and "stuck" alerts reach Dennis's phone through a simple push service (e.g. ntfy).
3. **Relay Android app** plus a small cloud piece so the phone sees the PC from anywhere. Multiple projects side by side.

## Safety rules
- Relay never handles secrets. The builder names what's needed; Dennis enters values himself.
- Max rounds per task (default 20), then stop and notify. A "task" is the stretch between two returns of control to Dennis (see Rounds).
- Pause and Stop always work and are checked before every handoff.
- Every handoff is logged with timestamp, project, direction and message.

## Background research
See `docs/research/claude-code-mechanics.md` for what the official Claude Code docs say about hooks, timeouts, Remote Control, headless mode and cross-session messaging, and what still needs testing.
