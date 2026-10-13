# 004 — What happens when a waiting Stop hook hits its timeout?

**Date:** 2026-10-13 · **Claude Code:** 2.1.296 · **OS:** Windows 11, Node 24.19 · **Model:** Haiku 5.5 (interactive) · **Code:** `spikes/003/hook.cjs`, `spikes/004/` (git-ignored)

## Question
A baton hook might wait longer than its `timeout` (the builder takes over an hour, or Dennis is away). When that happens:
1. Is anything shown on screen?
2. Does the session stop cleanly?
3. What happens to the hook process?
4. What would the helper need in order to recover the baton?

## What I tried
- **004a:** the waiting hook from spike 003 (heartbeat every 5 s), registered with `"timeout": 20` and told to wait 60 s.
- **004b:** a "re-arm" idea (`spikes/004/rearm.cjs`). The hook leaves on its own after 15 s, before the 20 s timeout. If no message has arrived, it continues the turn with `Relay: no message yet. Reply with only: WAITING`. Claude's tiny reply ends the turn, which fires a fresh Stop hook that waits again. The "message" arrives when the file `msg.txt` appears, written after 45 s.

## What happened

### 004a: timeout expiry
Hook log, ending at the timeout:
```
06:35:39.812Z pid=31572 +0s start stop_hook_active=false last="Hi"
06:35:44.820Z pid=31572 +5s heartbeat
...
06:35:59.845Z pid=31572 +20s heartbeat
```
After that: no more lines, no `got SIGTERM`, no `exit code=...`. `tasklist` showed the process gone, so it was **terminated outright** and its cleanup code never ran.

Screen, just before and just after:
```
● Hi
* Finagling… (running Stop hook · 15s · ↓ 5 tokens)
```
```
● Hi
✻ Cooked for 21s · done 9:36 AM
❯
```
**Nothing on screen says the hook timed out.** The turn just ends as if nothing happened. The only trace is in the session transcript:
```json
{"type":"hook_cancelled","hookName":"Stop","hookEvent":"Stop",
 "command":"node C:/Users/denni/projects/relay/spikes/003/hook.cjs",
 "durationMs":20295,"timedOut":true,"timeoutMs":20000}
```
followed by a `stop_hook_summary` with `"preventedContinuation":false`. The session is then idle and ready, and nothing is waiting for the next message.

### 004b: re-arming before the timeout
```
06:37:24 +0s start last="Hi"
06:37:39 +15s self-deadline reached, re-arming
06:37:40 +0s start last="WAITING"
06:37:55 +15s self-deadline reached, re-arming
06:37:57 +0s start last="WAITING"
06:38:06 +10s message arrived, delivering
06:38:07 +0s start last="DELIVERED-AFTER-REARM"
06:38:07 +0s already delivered, allow stop
```
Screen:
```
● Hi
● Ran 1 stop hook
  ⎿  Stop hook feedback: Relay: no message yet. Reply with only: WAITING
● WAITING
● Ran 1 stop hook
  ⎿  Stop hook feedback: Relay: no message yet. Reply with only: WAITING
● WAITING
● Ran 1 stop hook
  ⎿  Stop hook feedback: Reply with only: DELIVERED-AFTER-REARM
● DELIVERED-AFTER-REARM
```

## Conclusion
1. **Nothing is shown.** A timed-out Stop hook is cancelled silently, and the turn ends normally.
2. **The session stops cleanly** and is idle, but **the baton is dropped**: nobody is waiting for the next message any more.
3. **The hook process is killed without warning**, as with Esc in spike 003, so it can't say goodbye. Its output is thrown away (as the docs say).
4. **To recover, the helper needs:**
   - a record of the current waiter (session, pid, start time and deadline) so it can **notice a dead waiter** by checking the pid or the deadline;
   - to **keep the undelivered message queued** instead of losing it;
   - a way to deliver it later. Options: wait for the session's next Stop (only happens if Dennis types something), wake it another way (spike 005 `asyncRewake`, spike 006 cross-session messaging), or alert Dennis.
   - **Best of all, avoid the timeout entirely by re-arming (004b).** The hook leaves before its own deadline and asks for a tiny "WAITING" turn, which starts a fresh hook. With `timeout: 3600` that's one tiny turn per hour of waiting. Costs: each re-arm is a small model call, adds two lines to the transcript and screen, and counts toward the 8-continuation cap (spike 002), so the cap must be raised.
