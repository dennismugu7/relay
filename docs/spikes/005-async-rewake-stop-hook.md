# 005 — `asyncRewake` Stop hook: wake an idle session with the next message

**Date:** 2026-10-13 · **Claude Code:** 2.1.296 · **OS:** Windows 11, Node 24.19 · **Model:** Haiku 5.5 (interactive) · **Code:** `spikes/005/` (git-ignored)

## Question
This candidate wasn't in the original research list. I found it while reading the hooks docs for spike 001. The docs say a command hook with `"asyncRewake": true` *"runs in the background and wakes Claude on exit code 2. The hook's stderr ... is shown to Claude as a system reminder"*, and that such a hook *"wakes Claude immediately even when the session is idle"*. The timeout is still enforced.

If that works for Stop hooks, the waiting session would be **idle** (Dennis can type freely, nothing looks "busy") instead of stuck inside a blocking hook. So:
1. Does an `asyncRewake` Stop hook wake an idle session, and does Claude act on the message as an instruction?
2. Does it re-arm by itself after each turn?
3. What if Dennis types while the hook waits in the background?
4. What if the message arrives while the session is busy?
5. Do background waiters survive their session?
6. Do rewakes count toward the 8-continuation cap (spike 002)?
7. What happens at the timeout?

## What I tried
`spikes/005/hook.cjs` checks every 0.5 s for a file `msg.txt`. When the file appears, the hook prints its contents to stderr and exits with code 2. Registered with:
```json
{ "type": "command", "command": "node", "args": [".../spikes/005/hook.cjs"], "asyncRewake": true, "timeout": 3600 }
```
Sessions ran interactively through the pty harness (spike 001). Messages were "sent" by writing `msg.txt`.

## What happened

### 1–2. It wakes an idle session, Claude acts, and it re-arms
After `Say hi in one word.`, the session showed `done` and an empty prompt: **idle**, while the hook waited in the background. Then `msg.txt` was written with `TO CODE: Create a file named relay.txt containing exactly RELAYED, then reply with only: DONE-005`:
```
● Hi
✻ Cogitated for 1s · done 9:40 AM
● Stop hook feedback
● Write(relay.txt)
  ⎿  Wrote 1 line to relay.txt
      1 RELAYED
● DONE-005
✻ Cooked for 5s · done 9:41 AM
```
```
06:41:10.646Z pid=23900 +19s message arrived, exiting 2
06:41:10.649Z pid=23900 +19s exit code=2
06:41:16.372Z pid=12040 +0s start stop_hook_active=true last="DONE-005"
```
`relay.txt` contained `RELAYED`. The new turn's Stop started a **new** background waiter (12040) by itself.

In the transcript, the message reaches Claude as a queued command:
```
<task-notification><summary>Stop hook feedback</summary></task-notification>
<system-reminder>
Stop hook blocking error from command "Stop": TO CODE: Reply with only: MIDTURN-MSG-6
</system-reminder>
```

### 3. Typing while a waiter runs: old waiters are NOT stopped
Dennis-style prompt `What is 3+3?` while waiter 12040 was running. Claude answered `6`, and that turn's Stop started waiter 12572, **but 12040 kept running**:
```
06:41:41.978Z pid=12572 +0s start stop_hook_active=false last="6"
06:41:46.825Z pid=12040 +30s heartbeat
06:41:47.049Z pid=12572 +5s heartbeat
```
After a few more turns, three waiters were alive at once (28976, 30620, 30668). Whichever one sees a message first delivers it. The others keep waiting, and could later grab a message meant for a different moment.

### 4. A message that arrives mid-turn hijacks that turn
Session with a waiter already running. Prompt: `Run the command ping -n 25 127.0.0.1 in the foreground ... Then reply with only: PINGED`. While ping was running, `msg.txt` = `TO CODE: Reply with only: MIDTURN-MSG-6`:
```
❯ Run the command ping -n 25 127.0.0.1 in the foreground and wait for it to finish. Then reply with only: PINGED
  Ran 1 shell command
● Stop hook feedback
● MIDTURN-MSG-6
✻ Brewed for 30s · done 9:48 AM
```
The old waiter exited 2 in the middle of the turn (`+16s message arrived`). Claude finished the ping, but its final answer followed the injected message (`MIDTURN-MSG-6`), **not** the user's request (`PINGED`).

In a fresh session with no waiter yet, the same mid-turn message simply waited in `msg.txt` until the turn ended, and was then delivered by the turn's own Stop hook. That's the desired behaviour.

### 5. Waiters die with their session
```
alive before quit: 28976 30620 30668
alive after quit:  (none)
```
Caveat: the harness kills the session process, which isn't quite the same as typing `/exit`.

### 6. Rewakes don't hit the 8-continuation cap
11 messages delivered back to back, no tool calls, default cap:
```
pid=32004 +0s start stop_hook_active=false last="R0"
pid=29800 +0s start stop_hook_active=true last="R1"
...
pid=13552 +0s start stop_hook_active=true last="R11"
```
Each rewake is its own turn (`done` between each), not a continuation, so the cap doesn't apply. `stop_hook_active` is still `true` after the first one.

### 7. At the timeout: killed silently, no rewake
With `"timeout": 20` and no message, the log stopped at `+15s heartbeat`, the process was gone, and the screen showed nothing new (`✻ Brewed for 1s · done`). It's the same as spike 004: the baton is dropped. Re-arming before the deadline should work here too (exit 2 with "no message yet, reply WAITING" just before the timeout), but **I didn't test it**.

## Conclusion
- **`asyncRewake` works as a delivery mechanism.** The waiting session is idle, the message wakes it and is acted on as an instruction, and the next Stop re-arms automatically. Compared with the blocking baton:
  - **Better:** the session doesn't look stuck. Dennis can type at any time without Esc. There's no 8-continuation cap. The screen shows a single tidy `● Stop hook feedback` line per handoff.
  - **Worse:** waiters pile up when Dennis talks to a session directly, and a waiter that fires mid-turn **hijacks Dennis's own task**.
- **Both problems can be fixed in Relay's own code:**
  - **One waiter per session.** Each waiter registers itself in the state file. When a newer waiter starts for the same session, older ones exit with code 0 (no wake) without delivering.
  - **Deliver only to an idle session.** Only the **newest** waiter may deliver, and it's created at the end of a turn, so the session is idle by definition. Older waiters must never deliver.
- **The timeout still applies.** Use `"timeout": 3600` and re-arm before the deadline, or let the helper notice the dead waiter (as in spike 004).
- The message is framed to Claude as "Stop hook blocking error" in a system reminder. Claude acted on it every time, but a lead `CLAUDE.md` should still say plainly that messages arriving this way come from Relay.
