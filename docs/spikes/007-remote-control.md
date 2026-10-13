# 007 — Do Relay's hooks still work when Dennis drives a session from his phone?

**Date:** 2026-10-13 · **Claude Code:** 2.1.296 · **OS:** Windows 11, Node 24.19 · **Model:** Haiku 5.5 (interactive) · **Code:** `spikes/007/` (git-ignored)

## Question
Dennis wants to start or steer a Relay run from the Claude app on his phone, using **Remote Control**. Remote Control connects a session running on this PC to claude.ai, so a prompt typed on the phone goes into the local session. The session, its hooks and its files all stay on the PC.

Both delivery candidates (spike 001 blocking baton, spike 005 `asyncRewake`) depend on Stop hooks. So:
1. Does a Stop hook fire when the turn was started by a prompt from the phone?
2. Does a **blocking** Stop hook's `additionalContext` continue that turn?
3. Does an **`asyncRewake`** Stop hook wake that session later with a new message?
4. How does a phone prompt look to the session?

## What I tried
Two interactive sessions through the pty harness, each in its own sandbox folder, started with Remote Control on:
```
--name relay-spike-blocking --remote-control relay-spike-blocking --model haiku --settings spikes/007/settings-blocking.json
--name relay-spike-rewake   --remote-control relay-spike-rewake   --model haiku --settings spikes/007/settings-rewake.json
```
Both screens showed `/remote-control is active · Continue here, on your phone, or at https://claude.ai/code/session_...`.

- **007a, blocking:** `blocking.cjs` (`timeout: 3600`). On the first Stop it waits 60 s, then returns `additionalContext`: *"TO CODE: Create a file named rc-blocking.txt containing exactly RC-BLOCKING-OK, then reply with only: DONE-RC-BLOCKING"*.
- **007b, asyncRewake:** `rewake.cjs` (`asyncRewake: true`, `timeout: 3600`), the same file-watching waiter as spike 005. A background script waited for the first Stop, then 20 s later wrote `msg.txt`: *"TO CODE: Create a file named rc-rewake.txt containing exactly RC-REWAKE-OK, then reply with only: DONE-RC-REWAKE"*.

Dennis sent `Say hi in one word` to each session **from the Claude app on his phone**. Nobody typed anything on the PC.

## What happened

### 1–2. Blocking baton: the hook fires and continues the turn
```
09:30:50.174Z pid=27952 start stop_hook_active=false last="Hi"
09:31:50.179Z pid=27952 continuing turn
09:31:50.182Z pid=27952 exit code=0
09:31:55.052Z pid=24448 start stop_hook_active=true last="DONE-RC-BLOCKING"
```
On the PC screen, the session sat at `running Stop hook` for the 60 s wait, then:
```
  ⎿  Stop hook feedback: TO CODE: Create a file named rc-blocking.txt containing exactly RC-BLOCKING-OK, then reply with only:
● Write(rc-blocking.txt)
  ⎿  Wrote 1 line to rc-blocking.txt
      1 RC-BLOCKING-OK
● DONE-RC-BLOCKING
✻ Sautéed for 1m 8s · done 12:31 PM
```
`rc-blocking.txt` contained `RC-BLOCKING-OK`.

### 3. asyncRewake: the idle session wakes up
```
09:35:17.623Z pid=32544 +0s start stop_hook_active=false last="Hi"
09:35:37.973Z pid=32544 +20s message arrived, exiting 2
09:35:41.363Z pid=27188 +0s start stop_hook_active=true last="DONE-RC-REWAKE"
```
PC screen:
```
❯ Say hi in one word
● Hi
✻ Crunched for 1s · done 12:35 PM
● Stop hook feedback
● Write(rc-rewake.txt)
  ⎿  Wrote 1 line to rc-rewake.txt
      1 RC-REWAKE-OK
● DONE-RC-REWAKE
```
`rc-rewake.txt` contained `RC-REWAKE-OK`. The next Stop started a fresh waiter (27188) on its own, as in spike 005.

### 4. A phone prompt looks the same as a typed one
In both transcripts the phone prompt is an ordinary user entry with `"origin":{"kind":"human"}`, exactly like a prompt typed on the PC. The rewake message arrived as `"origin":{"kind":"task-notification"}` carrying `Stop hook blocking error from command "Stop": TO CODE: ...`, as in spike 005. The hook input has no field that says "this came from the phone", so Relay doesn't need to treat phone turns differently (and can't tell them apart anyway).

### Not checked: what the phone displayed
I can only see the PC side. Dennis didn't report what the app showed during the 60 s wait, or whether the replies `DONE-RC-BLOCKING` and `DONE-RC-REWAKE` appeared on the phone. That's a display question, not a delivery question: both turns ran in the local session, which is the one Remote Control mirrors.

## Conclusion
- **Remote Control doesn't change anything for Relay's hooks.** The phone only supplies the prompt. The session, its Stop hooks and the files all run on the PC, so both the blocking baton and `asyncRewake` work unchanged.
- **Dennis can start a Relay run from his phone** by sending the first message to the lead session. Every handoff after that is done by hooks on the PC.
- Relay needs no phone-specific code. A later stage might use Remote Control (or push notifications) to tell Dennis when a `TO DENNIS:` message is waiting, but that's outside Stage 1.
- Open: how the waiting hook and the replies look in the app. Worth a quick look the next time Dennis uses it; it doesn't affect the delivery design.
