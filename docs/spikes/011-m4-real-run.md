# 011 — M4 real run: `relay init` on a fresh project, then 3 automatic rounds

**Date:** 2026-10-13 · **Claude Code:** 2.1.296 · **OS:** Windows 11, Node 24.19 · **Model:** Haiku 5.5 (interactive) · **Relay:** commits `916170e` (run 1) and `a0e1440` (run 2), installed with `npm link`

## Question
M3 proved the hooks with hand-written config. Does the real `relay` command, installed on the PC, turn an ordinary project into a working lead + builder pair, with **no hand-written config at all**? And does it leave the project's own files alone?

## Setup
A fresh throwaway project outside the Relay repo, set up like a real one: a git repository with its own committed `CLAUDE.md` and `.claude/settings.json`.
```
C:\Users\denni\relay-sandbox\m4-app\
  CLAUDE.md               "# m4-app  A tiny test project for Relay M4."
  .claude\settings.json   { "permissions": { "allow": ["Bash(node --version)"] } }
  package.json            { "name": "m4-app", "version": "1.0.0" }
```
Then, from `C:\Users\denni\relay-sandbox`, using the globally linked command:
```
> relay init m4-app
Relay is set up for m4-app.

  wrote C:\Users\denni\relay-sandbox\m4-app-lead\relay.config.json
  wrote C:\Users\denni\relay-sandbox\m4-app-lead\CLAUDE.md
  wrote C:\Users\denni\relay-sandbox\m4-app-lead\.claude\settings.json
  wrote C:\Users\denni\relay-sandbox\m4-app\.claude\rules\relay-builder.md
  wrote C:\Users\denni\relay-sandbox\m4-app\.claude\skills\relay-start\SKILL.md
  wrote C:\Users\denni\relay-sandbox\m4-app\.claude\settings.local.json
  wrote C:\Users\denni\relay-sandbox\m4-app\.git\info\exclude

Next:
  1. Open Claude Code in C:\Users\denni\relay-sandbox\m4-app (the builder) and run /relay-start.
  2. Open Claude Code in C:\Users\denni\relay-sandbox\m4-app-lead (the lead) and give it a goal.
  Check on it any time with "relay status" and "relay log".
```
Checks straight after:
- `git status --short` printed nothing: Relay's new files are hidden by `.git/info/exclude`.
- `md5sum -c` on `CLAUDE.md` and `.claude/settings.json` gave `OK` for both: unchanged.
- A second `relay init m4-app` printed `Relay is already set up for m4-app. Nothing changed.`

Then I followed the printed steps exactly:
1. Builder session in `m4-app`: `/relay-start`. It replied `Relay builder ready. Waiting for the lead.`, and `relay status` showed `Builder:  idle, waiter pid 32728 alive, ...`. So the hooks in `settings.local.json` and the skill both work.
2. Lead session in `m4-app-lead`, with the goal:
   > Goal: in the project, have the builder do these one per round, reviewing each report before the next: 1) create greet.js exporting a function greet(name) that returns "Hello, NAME!"; 2) add greet.test.js that tests greet with the built-in node:test module; 3) add an npm "test" script that runs node --test, and run it. When all three are done and the tests pass, tell Dennis.

## Run 1: stopped after one round (bug 002)
```
16:31:15  lead → builder   In the project folder `C:\Users\denni\relay-sandbox\m4-app`, create the file ...
16:31:20  builder → lead   Created `greet.js` in the project folder. ...
16:31:24  lead → Dennis    The builder's report on task 1 checks out: ... Moving on to task 2.  TO CODE: ...
```
The lead wrote its review **before** `TO CODE:`. Relay only reads a tag at the very start, so the reply went to Dennis and the run ended. Details and fix: `docs/learning/bugs/002-lead-wrote-before-the-tag.md`. The lead template now states the rule with an example.

Then `relay init --undo m4-app` gave this (a real-world test of undo):
```
Removing Relay from m4-app:
  restored     C:\Users\denni\relay-sandbox\m4-app\.git\info\exclude
  deleted      C:\Users\denni\relay-sandbox\m4-app\.claude\settings.local.json
  deleted      C:\Users\denni\relay-sandbox\m4-app\.claude\skills\relay-start\SKILL.md
  deleted      C:\Users\denni\relay-sandbox\m4-app\.claude\rules\relay-builder.md
  deleted      C:\Users\denni\relay-sandbox\m4-app-lead\.claude\settings.json
  deleted      C:\Users\denni\relay-sandbox\m4-app-lead\CLAUDE.md
  deleted      C:\Users\denni\relay-sandbox\m4-app-lead\relay.config.json
  deleted      C:\Users\denni\.relay\m4-app (state and activity log)
Done. Your own files are as they were before relay init.
```
Afterwards:
- the lead folder was gone;
- `.claude\` held only the project's own `settings.json`;
- both checksums were still `OK`;
- `git status` listed only `greet.js`. That's the builder's work from round 1, not Relay's file, so undo rightly left it. I deleted it by hand before run 2.

## Run 2: 3 rounds in 32 seconds, nobody typing
`relay init m4-app` again (with the fixed template), then the same two steps and the same goal.

Lead screen (review now comes after the tag):
```
● Stop hook feedback
● TO CODE: Review of task 1 is fine. C:\Users\denni\relay-sandbox\m4-app\greet.js matches the spec. ...
  Next, in C:\Users\denni\relay-sandbox\m4-app, create C:\Users\denni\relay-sandbox\m4-app\greet.test.js. ...
● Stop hook feedback
● TO CODE: Task 2 checks out. greet.test.js covers both cases and the builder reports 2 passing tests.
  Last task. In C:\Users\denni\relay-sandbox\m4-app\package.json, add a "test" script set to "node --test". ...
● Stop hook feedback
● TO DENNIS: All three tasks are done and npm test passes.
  - greet.js: exports greet(name), which returns Hello, NAME!.
  - greet.test.js: uses node:test and node:assert/strict, with two tests (World and Dennis).
  - package.json: has "test": "node --test".
  npm test ran 2 tests, with 2 passing and 0 failing, and exited with code 0.
```
`relay log`:
```
2026-10-13
16:34:49  lead → builder   In the project at `C:\Users\denni\relay-sandbox\m4-app`, create the file `C:\Users\denni\relay-sand…
16:34:56  builder → lead   Created `C:\Users\denni\relay-sandbox\m4-app\greet.js`: ```js function greet(name) { return `Hello,…
16:34:59  lead → builder   Review of task 1 is fine. `C:\Users\denni\relay-sandbox\m4-app\greet.js` matches the spec. Leave th…
16:35:05  builder → lead   Created `C:\Users\denni\relay-sandbox\m4-app\greet.test.js`: ```js const { test } = require('node:t…
16:35:09  lead → builder   Task 2 checks out. `greet.test.js` covers both cases and the builder reports 2 passing tests. Last …
16:35:18  builder → lead   I added a `"test"` script set to `"node --test"` in `package.json`, keeping the existing `name` and…
16:35:21  lead → Dennis    All three tasks are done and `npm test` passes. - **greet.js**: exports `greet(name)`, which return…
```
Checks afterwards:
```
> npm test           (in m4-app)
✔ greet("World") returns "Hello, World!"
✔ greet("Dennis") returns "Hello, Dennis!"
ℹ tests 2  ℹ pass 2  ℹ fail 0

> git status --short
 M package.json
?? greet.js
?? greet.test.js
```
Only the builder's work shows up. Relay's files stay hidden, and `CLAUDE.md` and `.claude/settings.json` were still unchanged.

`relay status` after the run:
```
Project:  m4-app
Config:   C:\Users\denni\relay-sandbox\m4-app-lead\relay.config.json
Delivery: rewake, max 20 rounds, hook timeout 3600 s
Run:      active
Baton:    Dennis (no task in progress)
Rounds:   0 of 20 since control last returned to Dennis
Queue:    empty
Lead:     idle, not waiting
Builder:  idle, waiter pid 32736 alive, re-arms before 17:35:18
```
The control commands on the same project, run from the lead folder:
```
> relay pause      m4-app is paused. Messages are kept until "relay resume".
> relay status     Run:      paused
> relay resume     m4-app is running again. Kept messages will be delivered.
> relay stop       m4-app is stopped. Waiting hooks end on their next check; queued messages were dropped.
> relay status     Run:      stopped
                   Builder:  idle, not waiting        ← the builder's waiter retired within 2 s
> relay start      m4-app is ready for a run.
```

## Conclusion
- **`relay init` works end to end with no hand-written config.** One command, then `/relay-start` and a goal, gave three automatic rounds with a correct, tested result.
- **The project is left clean:** its own `CLAUDE.md` and `settings.json` were byte-identical before and after, `git status` showed none of Relay's files, init was idempotent, and undo restored everything exactly.
- **Hooks work from `.claude/settings.local.json`**, and builder instructions load from `.claude/rules/`, as ADR 0006 assumed.
- **Real runs keep finding things unit tests can't:** the lead put text before its tag (bug 002). The template fix worked in run 2. M5's longer run will show whether it holds.
