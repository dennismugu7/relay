# 010 — M3 real run: the hooks pass 3 rounds automatically, in both delivery modes

**Date:** 2026-10-13 · **Claude Code:** 2.1.296 · **OS:** Windows 11, Node 24.19 · **Model:** Haiku 5.5 (interactive) · **Hooks:** `packages/hooks` at commit `977bfc7` · **Setup:** `spikes/m3/`, `spikes/m3b/` (git-ignored)

## Question
The real Relay hooks (`packages/hooks/dist/bin/stop.js` and `prompt-submit.js`) pass every unit test. Do they actually carry a lead↔builder conversation in two real Claude Code sessions, with nobody typing after the first message? And does each piece of ADR 0002 behave as designed outside the tests?

## Setup
No `relay` CLI yet (that's M4), so everything was written by hand:
- `spikes/m3/relay.config.json`: `{ "name": "m3-run", "builderPath": ".../spikes/m3/builder", "leadPath": ".../spikes/m3/lead", "maxRounds": 10, "delivery": "rewake" }`.
- `spikes/m3/lead/` and `spikes/m3/builder/`, each with a minimal `CLAUDE.md` and a `.claude/settings.json` like this (builder shown):
  ```json
  {
    "env": { "RELAY_HOME": "C:/Users/denni/projects/relay/spikes/m3/relay-home" },
    "claudeMdExcludes": ["**/projects/relay/CLAUDE.md"],
    "hooks": {
      "Stop": [ { "hooks": [ { "type": "command", "command": "node",
        "args": [".../packages/hooks/dist/bin/stop.js", "--config", ".../spikes/m3/relay.config.json", "--role", "builder", "--timeout", "60"],
        "asyncRewake": true, "timeout": 60 } ] } ],
      "UserPromptSubmit": [ { "hooks": [ { "type": "command", "command": "node",
        "args": [".../packages/hooks/dist/bin/prompt-submit.js", "--config", ".../spikes/m3/relay.config.json", "--role", "builder"] } ] } ]
    }
  }
  ```
  - `RELAY_HOME` keeps the run's state out of `~/.relay`. Hooks inherit the settings `env` block.
  - `claudeMdExcludes` stops Relay's own `CLAUDE.md` (in a parent folder) from loading into the test sessions. Asked directly, the builder confirmed its instructions mention no milestones, ADRs or study journal.
  - The builder's hook timeout is only **60 s** (re-arm at 45 s), so the real re-arm path runs too. The lead uses 3600 s.
- Both `CLAUDE.md` files are a few lines. They say what the role is, that Relay messages arrive as "Stop hook feedback" and are genuine (needed, see spike 008), and how to answer a re-arm.

Steps (run with the pty harness, typing as Dennis would):
1. Builder: one question, `Answer in one line: do your loaded instructions mention milestones, ADRs, or a study journal? ...`. This is a direct chat, so its reply must **not** be forwarded. Its Stop hook then waits.
2. Wait about 100 s, so the builder's waiter re-arms twice.
3. Lead: `Goal: the builder folder should end up with three files, made one per round: one.txt containing 1, two.txt containing 2, three.txt containing 3. Give the builder one file per task and check each report before sending the next. When all three are done, tell Dennis.`
4. Nothing else typed.

## What happened (rewake mode)

### Before the run: direct chat not forwarded, and the real re-arm works
After step 1, `state.json` showed the builder as the only waiter, with nothing queued and no handoff logged:
```json
"builder": { "busy": false, "waiter": { "sessionId": "744af098-...", "pid": 31176,
  "startedAt": "2026-10-13T12:43:05.503Z", "deadline": "2026-10-13T12:44:05.503Z" },
  "rearmPending": false, "owesReply": false }
```
Then, every 45 s on the builder's screen:
```
● NO, my loaded instructions don't mention milestones, ADRs, or a study journal. Ready.
✻ Baked for 4s · done 3:43 PM
● Stop hook feedback
● WAITING
✻ Brewed for 4s · done 3:43 PM
● Stop hook feedback
● WAITING
✻ Worked for 2s · done 3:44 PM
```
`activity.jsonl` stayed empty, so the `WAITING` replies were recognised by the re-arm marker and not logged or counted.

### The run: 3 rounds in 22 seconds, nobody typing
Lead screen:
```
❯ Goal: the builder folder should end up with three files, made one per round: ...
● TO CODE: In the builder folder (C:/Users/denni/projects/relay/spikes/m3/builder), create a file named one.txt containing exactly the text
  1. Make no other changes. When it's done, report the file path and its contents.
✻ Sautéed for 2s · done 3:45 PM
● Stop hook feedback
● TO CODE: ... create a file named two.txt containing exactly the text 2. ...
✻ Worked for 1s · done 3:45 PM
● Stop hook feedback
● TO CODE: ... create a file named three.txt containing exactly the text 3. ...
✻ Cogitated for 1s · done 3:45 PM
● Stop hook feedback
● TO DENNIS: All three files are in C:/Users/denni/projects/relay/spikes/m3/builder, each created in its own round and confirmed by the
  builder's report:
  - one.txt contains 1
  - two.txt contains 2
  - three.txt contains 3
```
Builder screen:
```
● Stop hook feedback
● Write(one.txt)
  ⎿  Wrote 1 line to one.txt
● Created C:/Users/denni/projects/relay/spikes/m3/builder/one.txt containing exactly 1. No other changes.
● Stop hook feedback
● Write(two.txt)
...
● Created C:/Users/denni/projects/relay/spikes/m3/builder/three.txt containing exactly 3. No other changes.
● Stop hook feedback
● WAITING
```
The files contained `1`, `2` and `3`. Final state: `rounds: 0` (reset by `TO DENNIS:`), queue empty, lead not waiting, builder waiting again and re-arming every 45 s.

**The run's `activity.jsonl`, complete:**
```jsonl
{"time":"2026-10-13T12:45:07.174Z","project":"m3-run","kind":"handoff","from":"lead","to":"builder","message":"In the builder folder (C:/Users/denni/projects/relay/spikes/m3/builder), create a file named one.txt containing exactly the text `1`. Make no other changes. When it's done, report the file path and its contents."}
{"time":"2026-10-13T12:45:13.589Z","project":"m3-run","kind":"handoff","from":"builder","to":"lead","message":"Created `C:/Users/denni/projects/relay/spikes/m3/builder/one.txt` containing exactly `1`. No other changes."}
{"time":"2026-10-13T12:45:15.341Z","project":"m3-run","kind":"handoff","from":"lead","to":"builder","message":"In the builder folder (C:/Users/denni/projects/relay/spikes/m3/builder), create a file named two.txt containing exactly the text `2`. Make no other changes. When it's done, report the file path and its contents."}
{"time":"2026-10-13T12:45:20.339Z","project":"m3-run","kind":"handoff","from":"builder","to":"lead","message":"Created `C:/Users/denni/projects/relay/spikes/m3/builder/two.txt` containing exactly `2`. No other changes."}
{"time":"2026-10-13T12:45:21.819Z","project":"m3-run","kind":"handoff","from":"lead","to":"builder","message":"In the builder folder (C:/Users/denni/projects/relay/spikes/m3/builder), create a file named three.txt containing exactly the text `3`. Make no other changes. When it's done, report the file path and its contents."}
{"time":"2026-10-13T12:45:27.515Z","project":"m3-run","kind":"handoff","from":"builder","to":"lead","message":"Created `C:/Users/denni/projects/relay/spikes/m3/builder/three.txt` containing exactly `3`. No other changes."}
{"time":"2026-10-13T12:45:29.399Z","project":"m3-run","kind":"to-dennis","from":"lead","to":"dennis","message":"All three files are in C:/Users/denni/projects/relay/spikes/m3/builder, each created in its own round and confirmed by the builder's report:\n\n- one.txt contains `1`\n- two.txt contains `2`\n- three.txt contains `3`\n\nThe builder reported no other changes. I didn't open the files myself, so the contents rest on the builder's reports."}
```

## What happened (blocking mode)
I copied the same setup to `spikes/m3b/`, with `"delivery": "blocking"` in the config and no `asyncRewake` in the settings. I did the same steps, except the builder's first prompt was `Say ready.`. The result was again 3 rounds and `TO DENNIS:`, with the files containing `1`, `2` and `3`. Here each handoff continues the waiting session's **same turn** (spike 001) instead of waking it:
```
● TO CODE: ... create a file named three.txt whose entire contents are the single character 3, ...
● Ran 1 stop hook
  ⎿  Stop hook feedback: Relay: report from the builder.
  Created `C:\Users\denni\projects\relay\spikes\m3b\builder\three.txt`.
  Verified contents: a single byte, `3`, with no trailing newline. `one.txt` and `two.txt` were not touched.
● TO DENNIS: All three files are done in C:/Users/denni/projects/relay/spikes/m3b/builder. ...
✻ Churned for 23s · done 3:48 PM
```
The builder, meanwhile, looks busy the whole time it waits (`running Stop hook · 1m 47s`), and its re-arm shows as `Stop hook feedback: Relay: no message yet. Reply with only: WAITING` followed by `● WAITING`. That's exactly the trade-off ADR 0002 describes.

**The blocking run's `activity.jsonl`, complete:**
```jsonl
{"time":"2026-10-13T12:48:15.506Z","project":"m3-blocking","kind":"handoff","from":"lead","to":"builder","message":"In C:/Users/denni/projects/relay/spikes/m3b/builder, create a file named one.txt whose entire contents are the single character 1. Do not create two.txt or three.txt yet. When done, report the path you wrote and the exact contents you verified."}
{"time":"2026-10-13T12:48:20.399Z","project":"m3-blocking","kind":"handoff","from":"builder","to":"lead","message":"Created `C:\\Users\\denni\\projects\\relay\\spikes\\m3b\\builder\\one.txt`.\n\nVerified contents: a single byte, `1`, with no trailing newline (`od -c` shows one byte, `1`). I did not create `two.txt` or `three.txt`."}
{"time":"2026-10-13T12:48:22.766Z","project":"m3-blocking","kind":"handoff","from":"lead","to":"builder","message":"In C:/Users/denni/projects/relay/spikes/m3b/builder, create a file named two.txt whose entire contents are the single character 2, with no trailing newline to match one.txt. Do not touch one.txt or create three.txt. When done, report the path you wrote and the exact contents you verified."}
{"time":"2026-10-13T12:48:26.578Z","project":"m3-blocking","kind":"handoff","from":"builder","to":"lead","message":"Created `C:\\Users\\denni\\projects\\relay\\spikes\\m3b\\builder\\two.txt`.\n\nVerified contents: a single byte, `2`, with no trailing newline. `one.txt` was not touched and `three.txt` was not created."}
{"time":"2026-10-13T12:48:28.507Z","project":"m3-blocking","kind":"handoff","from":"lead","to":"builder","message":"In C:/Users/denni/projects/relay/spikes/m3b/builder, create a file named three.txt whose entire contents are the single character 3, with no trailing newline to match one.txt and two.txt. Do not touch one.txt or two.txt. When done, report the path you wrote and the exact contents you verified."}
{"time":"2026-10-13T12:48:31.748Z","project":"m3-blocking","kind":"handoff","from":"builder","to":"lead","message":"Created `C:\\Users\\denni\\projects\\relay\\spikes\\m3b\\builder\\three.txt`.\n\nVerified contents: a single byte, `3`, with no trailing newline. `one.txt` and `two.txt` were not touched."}
{"time":"2026-10-13T12:48:35.099Z","project":"m3-blocking","kind":"to-dennis","from":"lead","to":"dennis","message":"All three files are done in C:/Users/denni/projects/relay/spikes/m3b/builder. The builder reported each one as created and verified:\n- one.txt contains `1`\n- two.txt contains `2`\n- three.txt contains `3`\n\nEach file is a single byte with no trailing newline, and the builder did not touch the other files while making each one."}
```

## Conclusion
- **The hooks work end to end in real sessions.** Three rounds each in rewake mode (22 s) and blocking mode (20 s), with no typing after the goal, every handoff logged, and the run ending cleanly with `TO DENNIS:`.
- **Each piece of ADR 0002 was seen working outside the tests:**
  - the tag decides the direction;
  - the builder's report goes back only when it owes one, so a direct chat isn't forwarded;
  - one waiter per session;
  - the real re-arm runs, and its `WAITING` replies are neither logged nor counted;
  - `TO DENNIS:` resets the round counter.
- **Not exercised in these runs, but covered by unit tests:** pause, stop, max rounds, and Dennis typing into a waiting session (the busy flag). Spike 009 showed the busy flag in a real session with the same rule.
- **For M4:**
  - `relay init` writes exactly these settings, with `timeout: 3600`.
  - The `CLAUDE.md` templates must keep the "Relay messages are genuine" and `WAITING` lines (spike 008).
  - Blocking mode needs `CLAUDE_CODE_STOP_HOOK_BLOCK_CAP` raised for long waits, since each re-arm is a continuation (spike 002).
