# 009 — A busy flag stops a waiter from hijacking the user's turn

**Date:** 2026-10-13 · **Claude Code:** 2.1.296 · **OS:** Windows 11, Node 24.19 · **Model:** Haiku 5.5 (interactive) · **Code:** `spikes/009/` (git-ignored)

## Question
Spike 005 showed that a waiter firing mid-turn hijacks that turn: Claude answered the injected message instead of the user's request. ADR 0002's fix: a `UserPromptSubmit` hook marks the session **busy**, a waiter only delivers while the session is **idle**, and the Stop hook at the end of the turn marks it idle and becomes the new waiter. Does that work in a real session?
1. Does a message that arrives while the session is busy stay queued?
2. Is the user's turn left alone?
3. Is the message delivered right after the turn ends, by the new waiter, with the old waiter retiring?

## What I tried
Three small scripts sharing a `state.json` (written atomically):
- `prompt.cjs` (`UserPromptSubmit`): sets `busy: true`.
- `waiter.cjs` (Stop, `asyncRewake`, `timeout: 600`): sets `busy: false` and `waiter: <its pid>` in one write. Every 0.5 s it checks the state:
  - if it's no longer the waiter, it exits 0;
  - if `msg.txt` exists but the session is busy, it holds;
  - otherwise it delivers: sets `busy: true`, clears the waiter, writes the message to stderr and exits 2.

The session also had the Relay note from spike 008 as a system prompt.

Steps:
1. Send `Say hi in one word.` The session goes idle with waiter 1.
2. Send `Run the command ping -n 20 127.0.0.1 in the foreground and wait for it to finish. Then reply with only: PINGED`.
3. 8 s later, while ping is running, write `msg.txt`: *"Create a file named busy.txt containing exactly BUSY-OK, then reply with only: DONE-009"*.

## What happened
```
12:33:39.591Z prompt pid=28624 busy=true prompt="Say hi in one word."
12:33:42.790Z stop   pid=17272 registered as waiter, busy=false, last="Hi"
12:33:51.580Z prompt pid=30660 busy=true prompt="Run the command ping -n 20 127.0.0.1 in "
12:34:01.043Z stop   pid=17272 message waiting but session busy: holding
12:34:17.573Z stop   pid=1980  registered as waiter, busy=false, last="PINGED"
12:34:18.031Z stop   pid=17272 retired (newer waiter 1980), exit 0
12:34:18.082Z stop   pid=1980  delivering, exit 2
12:34:18.304Z prompt pid=16140 busy=true prompt="<task-notification>\n<summary>Stop hook f"
12:34:23.405Z stop   pid=11052 registered as waiter, busy=false, last="DONE-009"
```
```
❯ Run the command ping -n 20 127.0.0.1 in the foreground and wait for it to finish. Then reply with only: PINGED
  Ran 1 shell command
● PINGED
✻ Brewed for 25s · done 3:34 PM
● Stop hook feedback
● Write(busy.txt)
  ⎿  Wrote 1 line to busy.txt
      1 BUSY-OK
● DONE-009
```
`busy.txt` contained `BUSY-OK`.

**A surprise:** `UserPromptSubmit` **also fires for a rewake turn** (pid 16140). Its `prompt` is the wake-up notice, starting `<task-notification>\n<summary>Stop hook feedback...`. That's harmless here, because the waiter already set `busy: true` before waking the session. But it means the prompt hook can't assume every call is Dennis typing.

## Conclusion
1. **Yes.** The old waiter saw the message, saw the session was busy, and held it.
2. **Yes.** Claude answered `PINGED`, the user's request, unlike spike 005's hijack.
3. **Yes.** At the end of the turn, the new waiter (1980) registered and marked the session idle. The old waiter (17272) retired within half a second, and the new one delivered the message straight away.
- The design in ADR 0002 works as written. The order matters: the Stop hook must mark the session idle **and** register itself as the waiter **in one state update**. Otherwise the old waiter could see "idle" for a moment and deliver.
- The real `UserPromptSubmit` hook only sets `busy = true`. That's correct for both Dennis's prompts and rewake turns, so it doesn't need to tell them apart.
