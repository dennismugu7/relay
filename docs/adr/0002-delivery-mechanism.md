# 0002 — Delivery mechanism: an `asyncRewake` Stop hook with one waiter per session

**Date:** 2026-10-13 · **Status:** accepted 2026-10-13 by Dennis, with one amendment (see "Re-arm replies don't end the run")

## Context
Relay's core move: when one session (lead or builder) finishes a reply, its text must arrive in the other session as that session's next instruction. This happens with nobody typing, round after round, and every handoff is logged. The waiting session might wait minutes or over an hour while the other one works. Dennis must still be able to type into either session, from the PC or from his phone, without breaking anything.

The M1 spikes tested every candidate on Claude Code 2.1.296, native Windows 11 (`docs/spikes/001` to `007`). The facts that decide this:

- A Stop hook can hand Claude an instruction, and Claude acts on it (001).
- A **blocking** Stop hook that keeps a turn going is limited to **8 continuations in a row** unless `CLAUDE_CODE_STOP_HOOK_BLOCK_CAP` is raised (002). While it waits, the session looks busy (`running Stop hook`), and Dennis has to press Esc to type (003).
- Any waiting hook is **killed silently at its timeout**, which drops the baton (004). Leaving early and **re-arming** avoids this.
- An **`asyncRewake`** Stop hook waits in the background. The session is idle, and exit code 2 wakes it with the message. There's no continuation cap and it re-arms every turn. But old waiters aren't stopped when a new turn starts, and one that fires mid-turn **hijacks the turn** (005).
- **Cross-session messaging** works, but Claude decides whether and what to send. A missed send fails silently (006).
- Both hook styles work when the prompt came from the phone via Remote Control (007).

## Options considered
1. **Blocking Stop-hook baton.** The Stop hook waits in the foreground for the reply and returns it as `additionalContext`.
   - Pros: simple; proven (001, 003, 004); one hook process at a time per session, so no pile-up or hijack.
   - Cons: the waiting session looks stuck for the whole wait; Dennis must press Esc before typing, and Esc with nothing typed drops the baton (003); needs the continuation cap raised; each re-arm adds a visible `WAITING` exchange to the transcript.
2. **`asyncRewake` Stop hook.** The Stop hook hands off the outgoing message, then waits in the background and wakes the idle session with the reply.
   - Pros: the waiting session is idle and normal, so Dennis can type any time; no continuation cap; one tidy `● Stop hook feedback` line per handoff; proven from the phone (007).
   - Cons: waiter pile-up and mid-turn hijack (005), which Relay's own code must prevent; a newer feature, so it's more likely to change; re-arming by exit 2 is not yet tested.
3. **Built-in cross-session messaging only.** The lead's `CLAUDE.md` tells Claude to `SendMessage` each `TO CODE:` to the builder.
   - Pros: no hooks at all; Claude Code wakes idle sessions itself.
   - Cons: delivery depends on Claude choosing to send; Claude rewrites the content; a missed send fails silently, so "every handoff happens, and is logged" can't be promised.
4. **Headless resume** (`claude -p --resume`). Rejected in research: it interleaves with a session that's open in a terminal (`docs/research/claude-code-mechanics.md`, item 9).
5. **A mix:** option 2 as the main path, option 1 as a ready fallback, option 3 as an optional extra.

## Decision
**Option 5**, with option 2 doing the real work:

**Main path: an `asyncRewake` Stop hook in both sessions**, registered with `"timeout": 3600`.
1. When Claude finishes a reply, the hook reads `last_assistant_message`, parses the tag (`TO CODE:` / `TO DENNIS:` / none), writes the outgoing message to the project's state folder and logs it.
2. If the message is for the other session, this session becomes the **waiter**: it polls for the reply. When the reply arrives, it writes the reply to stderr and exits with code 2, which wakes the session with the reply.
3. A message for Dennis (or no tag) ends the run. The hook exits 0 and nobody waits.

**Rules that fix spike 005's problems**, enforced through the state file:
- **One waiter per session.** A waiter records its session, PID, start time and deadline. When a newer waiter starts for the same session, the older one sees it's no longer the current waiter and exits with code 0 without delivering.
- **Deliver only to an idle session.** A `UserPromptSubmit` hook marks the session **busy** when Dennis types (from the PC or the phone). The Stop hook marks it **idle** again. A waiter only delivers while its session is idle. Otherwise the message stays queued and is delivered by the waiter that starts at the end of Dennis's turn. This closes a gap spike 005 didn't cover: when Dennis types into an idle session, the newest waiter is still the one from the turn before.
- **Re-arm before the timeout.** Shortly before its deadline (about 3500 s), a waiter with no message exits 2 with `Relay: no message yet. Reply with only: WAITING`. That costs one small turn per hour of waiting, and the next Stop starts a fresh waiter. This needs a quick check at the start of M3, because spike 005 only tested re-arming in the blocking style (004b).
- **Re-arm replies don't end the run.** *(Amendment from Dennis's review.)* The re-arm turn's reply (`WAITING`) has no tag, so the normal rule would treat it as `TO DENNIS:`. The run would end, and Dennis would be notified every hour. To prevent this, the waiter sets a **re-arm marker** in the state file just before it sends the re-arm. The next Stop hook checks the marker, **not the reply text**. If the marker is set, the hook clears it and re-arms again. It doesn't log a handoff, count a round, or notify Dennis. Checking the marker rather than the text means a real reply that happens to say `WAITING` is still handled normally. M3's tests must cover this.
- **Dead-waiter detection.** A waiter can still die without warning, for example when its terminal is closed (005). `relay status` checks the recorded PID and deadline. If the waiter is gone, the undelivered message stays queued and status tells Dennis what happened and how to resume (type anything into that session; its next Stop starts a new waiter and delivers).
- **Our own loop guard and round counter** in the state file. `stop_hook_active` stays `true` after the first rewake and can't count anything (002, 005).

**Fallback: the blocking baton (option 1)**, using `additionalContext`, `CLAUDE_CODE_STOP_HOOK_BLOCK_CAP` raised in the sessions' settings `env` block, and the same re-arm. The hook is written so the waiting logic is shared and only the final "deliver" step differs:

| | main (asyncRewake) | fallback (blocking) |
|---|---|---|
| Deliver | message on stderr, exit 2 | `{"hookSpecificOutput":{"hookEventName":"Stop","additionalContext":...}}` on stdout, exit 0 |
| Settings | `"asyncRewake": true` | cap raised in `env` |

Switching is a settings change written by `relay init`, not a rewrite.

**Not now: cross-session messaging (option 3).** It may later serve as a nudge for a session whose waiter died, or for logging messages Claude sends itself. Noted in the backlog, not built in Stage 1.

## Consequences
- **Easier:** Dennis sees normal, idle sessions while Relay works, and can talk to either one at any time, including from his phone. Long runs don't hit the 8-continuation cap. Delivery is code that runs every time, not a request to Claude.
- **Harder:** Relay owns more state. It needs waiter records, a busy/idle flag, a message queue and dead-waiter checks, so `packages/core`'s state helpers need careful tests, especially for two processes touching the state file at once. Each session needs two hooks (`Stop` and `UserPromptSubmit`) instead of one.
- **To watch:**
  - `asyncRewake` is a newer feature, and its message reaches Claude labelled "Stop hook blocking error". The lead and builder `CLAUDE.md` templates must say plainly that messages arriving this way come from Relay.
  - Re-arming by exit 2 and the busy flag are design choices not yet proven by a spike. M3 tests them first and reports back if either fails. If the fallback is needed, this ADR gets superseded.
  - Polling the state folder every 0.5 s is cheap but not free. Fine for two sessions.
  - Every Claude Code upgrade can change any of this. Each spike recorded its version (2.1.296), so M5's end-to-end run is the regression check.
