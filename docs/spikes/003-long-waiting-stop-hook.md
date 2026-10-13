# 003 — A Stop hook that waits 15 minutes: timeout, screen, typing and Esc

**Date:** 2026-10-13 · **Claude Code:** 2.1.296 · **OS:** Windows 11, Node 24.19 · **Model:** Haiku 5.5 (interactive) · **Code:** `spikes/003/` (git-ignored)

## Question
The baton design needs a Stop hook that waits a long time (while the other session works) before handing over the next message.
1. Is `"timeout": 3600` honoured, so a hook can wait longer than the 600 s default?
2. What does the terminal show while the hook waits?
3. What happens if Dennis **types** into the session while the hook waits?
4. Does **Esc** interrupt the waiting hook? What happens to the hook process?

## What I tried
`spikes/003/hook.cjs`: on the first Stop, it waits `SPIKE_WAIT` seconds, logging a heartbeat line every 5 s with its process ID (pid), then continues the turn with `additionalContext` ("The wait is over. Reply with only: WOKE-UP"). It also logs any signal it receives and its exit. Registered with `"timeout": 3600`.

The sessions ran interactively through the pseudo-terminal harness (`spikes/_pty/`, described in spike 001), which records the screen every second and can press keys.
- **003a:** wait 900 s (15 minutes), no interaction.
- **003b:** wait 600 s; after 15 s type a new prompt, then try "send now", then press Esc; then Esc again with nothing queued.

## What happened

### 1. The 15-minute wait is honoured
```
06:35:10 pid=27848 +0s start stop_hook_active=false last="Hi"
06:49:51 pid=27848 +881s heartbeat
06:50:10 pid=27848 +900s wait finished, continuing turn
06:50:10 pid=27848 +900s exit code=0
06:50:12 pid=32540 +0s start stop_hook_active=true last="WOKE-UP"
```
The final screen:
```
● Hi
● Ran 1 stop hook
  ⎿  Stop hook feedback: The wait is over. Reply with only: WOKE-UP
● WOKE-UP
✻ Churned for 15m 4s · done 9:50 AM
```

### 2. The screen while waiting
A spinner line with a running timer, `esc to interrupt` in the footer, and the input box still available:
```
● Hi
✻ Philosophizing… (running Stop hook · 15m 2s · ↓ 5 tokens)
────────────────────────────
❯
────────────────────────────
  ⏵⏵ auto mode on (shift+tab to cycle) · esc to interrupt · ← for agents
```
It looks like Claude is still busy. Nothing tells Dennis *why* it's waiting (for example "waiting for the builder").

### 3. Typing while the hook waits: the message is queued
```
● Hi
❯ What is 2+2? Reply with only the number.
  ctrl+x ctrl+s to send now
✢ Proofing… (running Stop hook · 25s · ↓ 5 tokens)
❯ Press up to edit queued messages
```
The hook keeps running (heartbeats continued). I couldn't trigger "send now" (Ctrl+X then Ctrl+S) through the harness, even with the two keys sent 1.5 s apart, probably because Ctrl+S is swallowed as a terminal flow-control key. **Not verified;** worth a manual check later.

### 4. Esc kills the waiting hook immediately; any queued message is then sent
After Esc, with the 2+2 message queued:
```
❯ What is 2+2? Reply with only the number.
  ⎿  Interrupted · What should Claude do instead?
● 4
✻ Flummoxing… (running Stop hook · 13s · ↓ 3 tokens)
```
Hook log:
```
06:39:55.754Z pid=31804 +75s heartbeat
06:39:57.061Z pid=22404 +0s start stop_hook_active=false last="4"
```
Process 31804 stopped with **no signal and no exit line logged**: it was terminated outright, so its cleanup code never ran. The queued prompt was then sent, Claude answered `4`, and that turn's Stop started a **new** waiting hook (22404).

Esc again, with nothing queued: the hook (22404) was killed the same way, and the session went idle at the prompt (`Interrupted · What should Claude do instead?`). `tasklist` confirmed both hook processes were gone.

## Conclusion
- **Long waits work.** `"timeout": 3600` is honoured; a 15-minute wait completed and the turn continued normally.
- **Dennis can always take over with Esc.** That's good for safety, but Esc **kills the hook without warning**, so the hook can't tell the helper "I've been interrupted". The helper must detect a dead waiter itself, for example by recording the hook's pid and checking it is still alive, and treat the baton as dropped.
- **Typing during a wait is queued, not lost.** It's sent when the hook finishes or is interrupted.
- **Every new turn ends in a new Stop hook.** After Dennis talks to a session directly, its hook starts waiting again, which is what Relay wants.
- **The waiting screen is unclear for Dennis.** It just looks busy. `relay status` (and later the phone app) must show what each session is waiting for.
