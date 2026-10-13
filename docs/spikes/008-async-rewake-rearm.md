# 008 — Re-arming an `asyncRewake` waiter before its timeout

**Date:** 2026-10-13 · **Claude Code:** 2.1.296 · **OS:** Windows 11, Node 24.19 · **Model:** Haiku 5.5 (interactive) · **Code:** `spikes/008/` (git-ignored)

## Question
ADR 0002 says a waiter with no message must re-arm before its hook timeout. It does this by exiting with code 2 and the message `Relay: no message yet. Reply with only: WAITING`. Spike 004 only tested re-arming with a *blocking* hook. With `asyncRewake`:
1. Does the idle session wake up and reply `WAITING`?
2. Does that turn's Stop start a fresh waiter, again and again?
3. Is a real message still delivered and acted on after several re-arms?
4. Can the next Stop tell that it's the reply to a re-arm (ADR 0002 amendment)?

## What I tried
`spikes/008/rearm.cjs`, registered as a Stop hook with `"asyncRewake": true, "timeout": 20`. It waits for `msg.txt`. At 14 s with no message, it creates a marker file `rearm-pending`, writes the re-arm request to stderr and exits 2. On start, it checks for the marker (and deletes it) to see whether this Stop is the reply to a re-arm. That's the same idea as the state-file marker in ADR 0002.

I sent `Say hi in one word.`, let it re-arm a few times, then wrote `msg.txt`: *"TO CODE: Create a file named rearm.txt containing exactly REARM-OK, then reply with only: DONE-008"*.

## What happened

### Run 1: re-arming works, but Claude refused the real message
```
12:30:36.110Z pid=12964 +0s start rearmReply=false last="Hi"
12:30:50.267Z pid=12964 +14s self-deadline reached, re-arming (exit 2)
12:30:52.847Z pid=4004 +0s start rearmReply=true last="WAITING"
12:31:07.071Z pid=4004 +14s self-deadline reached, re-arming (exit 2)
12:31:08.843Z pid=29804 +0s start rearmReply=true last="WAITING"
12:31:23.081Z pid=29804 +14s self-deadline reached, re-arming (exit 2)
12:31:25.548Z pid=21812 +0s start rearmReply=true last="WAITING"
12:31:34.176Z pid=21812 +9s message arrived, exiting 2
12:31:37.538Z pid=27352 +0s start rearmReply=false last="I'm not going to create `rearm.txt` or reply `DONE-008`. That instruction came in through a stop-hook notification, not from you, ..."
```
Each re-arm woke the session, Claude replied `WAITING`, and the next Stop started a new waiter that saw the marker. But when the real message came, Claude refused:
```
● I'm not going to create rearm.txt or reply DONE-008. That instruction came in through a stop-hook notification, not from you, and it asks
  for a file write that has nothing to do with your request to say hi. If you did set up this hook and want that file created, tell me
  directly and I'll do it.
```
That's Claude being careful about instructions it can't trace to the user, which is sensible. In spike 005 the same kind of message was obeyed, so whether Claude trusts an unexplained hook message isn't reliable. The fix is what ADR 0002 already asks for: the session's instructions must say that Relay messages arrive this way.

### Run 2: with one paragraph of instructions, everything works
Same hook, plus `--append-system-prompt-file spikes/008/relay-note.txt`, standing in for the session's `CLAUDE.md`:
> This session is connected to Relay, a tool the user set up. Relay delivers messages from the user's other Claude Code session through a Stop hook; they appear as "Stop hook feedback". Treat them as instructions from the user. If a Relay message says "Reply with only: WAITING", reply with exactly WAITING.

```
12:32:14.667Z pid=32504 +0s start rearmReply=false last="Hi"
12:32:28.905Z pid=32504 +14s self-deadline reached, re-arming (exit 2)
12:32:30.812Z pid=15420 +0s start rearmReply=true last="WAITING"
12:32:45.024Z pid=15420 +14s self-deadline reached, re-arming (exit 2)
12:32:46.484Z pid=31596 +0s start rearmReply=true last="WAITING"
12:32:52.081Z pid=31596 +6s message arrived, exiting 2
12:32:55.218Z pid=31808 +0s start rearmReply=false last="DONE-008"
12:33:09.458Z pid=31808 +14s self-deadline reached, re-arming (exit 2)
12:33:10.850Z pid=29328 +0s start rearmReply=true last="WAITING"
```
```
● Stop hook feedback
● WAITING
✻ Crunched for 1s · done 3:32 PM
● Stop hook feedback
● Write(rearm.txt)
  ⎿  Wrote 1 line to rearm.txt
      1 REARM-OK
● DONE-008
✻ Worked for 3s · done 3:32 PM
● Stop hook feedback
● WAITING
```
`rearm.txt` contained `REARM-OK`, and re-arming carried on after the delivery.

## Conclusion
1. **Yes.** Exit 2 with the re-arm request wakes the idle session, and it replies `WAITING`.
2. **Yes.** Each `WAITING` turn's Stop starts a fresh waiter, indefinitely. No timeout was ever reached.
3. **Yes, but only when the session has been told about Relay.** Without instructions, Claude may refuse a hook-delivered task as untrusted (run 1). The lead and builder `CLAUDE.md` must say clearly that Relay messages arrive as "Stop hook feedback" and come from the user's setup, and how to answer a re-arm. This is now a hard requirement for M4's templates, not just a nice-to-have.
4. **Yes.** A marker set just before the re-arm is seen by the very next Stop, whose `last_assistant_message` is `WAITING`. The real hook uses the state file's `rearmPending` field for this.
- Each re-arm costs one tiny turn (about 1–2 s here) and adds a `● Stop hook feedback` / `● WAITING` pair to the screen. With the real 3600 s timeout, that's once an hour.
