# Stage 1 retrospective: the engine on the PC

**Dates:** 2026-10-12 to 2026-10-13 · **Release:** v0.1.0 · **Milestones:** M0 to M5

Stage 1 had one goal: two Claude Code sessions, a lead and a builder, pass work back and forth for several rounds with no copy-paste, controlled by a `relay` command. It's done. In the final test, the lead and builder ran **7 rounds unattended** on a small but realistic project ([spike 012](../spikes/012-m5-end-to-end.md)).

## What was built

| Package | What it is | Read it in |
|---|---|---|
| `packages/core` | The shared library: the tag parser (`TO CODE:` / `TO DENNIS:`), the project config, and a state file plus activity log that several processes can update safely. | [M2 journal](journal/2026-10-13-m2-core.md) |
| `packages/hooks` | The two hook scripts Claude Code runs. The **Stop hook** reads each finished reply, queues it for the other session and waits to wake its own session with the answer. The **UserPromptSubmit hook** marks a session busy, so Relay never interrupts you. | [M3 journal](journal/2026-10-13-m3-hooks.md) |
| `packages/helper` | The `relay` command: `init` (and `--undo`), `start`, `status`, `log`, `pause`, `resume`, `stop`, plus the templates `init` writes. | [M4 journal](journal/2026-10-13-m4-cli.md) |

The flow of one round, in plain words:
1. The lead finishes a reply starting with `TO CODE:`. Its Stop hook puts the message in the queue (`~/.relay/<project>/state.json`), logs a handoff, and starts waiting.
2. The builder's waiting Stop hook sees a message for it, and the builder is idle, so it exits with the message. Claude Code wakes the builder with it (`asyncRewake`).
3. The builder does the work. When it finishes, its Stop hook queues the report for the lead and starts waiting.
4. The lead's waiter wakes the lead with the report, and the lead reviews it and replies. Back to step 1, until the lead says `TO DENNIS:`.

## The key decisions

| ADR | Decision | Why it matters |
|---|---|---|
| [0001](../adr/0001-typescript-and-npm-workspaces.md) | TypeScript and npm workspaces | Types catch mistakes early; three small packages keep each part easy to understand. |
| [0002](../adr/0002-delivery-mechanism.md) | Deliver with an `asyncRewake` Stop hook, one waiter per session, a busy flag, and re-arm before the timeout | The heart of Relay. Chosen from seven spikes, not from guesses. The waiting session is idle, so it looks normal and you can type into it at any time. |
| [0003](../adr/0003-state-storage.md) | One JSON state file per project, a lock file, and atomic writes | Two hook processes can change the state at the same moment. The lock makes them take turns, and the atomic rename means nobody ever reads a half-written file. |
| [0004](../adr/0004-hook-launch.md) | Hooks run as built JavaScript with `node` | Fast and dependable on Windows; no TypeScript tooling at run time. |
| [0005](../adr/0005-no-background-helper.md) | No background Helper process | The hooks already do the work, so there's nothing to keep running or restart after a reboot. |
| [0006](../adr/0006-init-layout-and-undo.md) | What `relay init` writes, and an exact undo | Relay never edits your own files. Its instructions live in `.claude/rules/`, its hooks in `settings.local.json`, and its files are hidden with `.git/info/exclude`. |
| [0007](../adr/0007-nudge-for-a-late-tag.md) | A one-time nudge when the lead's tag isn't first | One slip no longer ends an unattended run, but the protocol stays strict. |

## What the spikes taught

Eleven spikes ran before or during building ([docs/spikes/](../spikes/)). The ones that changed the design:
- **A Stop hook can hand Claude a new task** (001). That's the whole idea.
- **The blocking approach has a silent cap of 8 continuations** (002), and **Esc or a timeout kills a waiting hook without warning** (003, 004). So Relay keeps its own round counter, and records each waiter's PID and deadline so `relay status` can spot a dead one.
- **`asyncRewake` wakes an idle session** (005). But waiters piled up and one hijacked a turn, which led to "one waiter per session" and the busy flag (009).
- **Claude may refuse a hook-delivered task** unless its instructions say Relay messages are genuine (008). Every template now says so.
- **Cross-session messaging works but depends on Claude choosing to send** (006), so it isn't reliable enough to carry every handoff.

## Bugs and lessons

| Bug | What happened | Lesson |
|---|---|---|
| [001](bugs/001-gitignore-hid-spike-docs.md) | The `.gitignore` rule `spikes/` also hid `docs/spikes/`. | Anchor ignore rules (`/spikes/`), and check `git status` after adding one. |
| [002](bugs/002-lead-wrote-before-the-tag.md) | The lead wrote a review before `TO CODE:`, so the run quietly ended. | When strict code meets a language model, state the rule *and* its consequence in the instructions, then add a safety net (ADR 0007). |
| [003](bugs/003-manifest-saved-before-folder-existed.md) | `relay init` saved its undo record before the folder existed. | Tests that start from an empty home folder catch setup-order bugs that a developer's machine hides. |

M5 found no new Relay bugs. Its first run finished correctly in 4 rounds because the goal fit in four tasks. A second, longer goal gave 7. The one real-world gap it showed, a misleading recovery hint in `relay status` for the lead, is in the backlog.

Bigger lessons from the whole stage:
- **Spike first, then build.** Several "obvious" designs (a background helper, the blocking baton as the main path) changed once a 20-minute experiment showed how Claude Code really behaves.
- **Real runs find what unit tests can't.** Bug 002 only showed up with a real model in the loop. Each milestone ended with a real run for this reason.
- **Pure functions make rules testable.** All of the Stop hook's rules live in `decide.ts` as functions that take a state and return a decision. The tests check hundreds of situations without starting Claude Code.
- **Check that tests really guard the code.** Breaking the code on purpose (mutation checks) proved the key tests fail when they should.

## By the numbers
- 3 packages, 273 tests, CI on Windows and Ubuntu with Node 22 and 24.
- 7 ADRs, 12 spikes, 3 bug entries, a journal entry for every session.

## What to study first

Read in this order. Each step builds on the last.

1. **`packages/core/src/tags.ts`** and its tests. A short, complete module: a regular expression, a function, and tests that pin every rule. The smallest piece of the protocol.
2. **`packages/core/src/state.ts`**, then `lock.ts` and `atomic.ts`. How several processes share one file safely. Read ADR 0003 alongside.
3. **`packages/hooks/src/decide.ts`** and `decide.test.ts`. The most important file in the repo: every rule about handoffs, rounds, waiting, re-arming and the nudge. Read ADR 0002 first.
4. **`packages/hooks/src/stop.ts`**. How the pure decisions are wired to real files, a clock and a waiting loop.
5. **`packages/helper/src/init.ts`** and `managed.ts`. Idempotent setup and exact undo, a pattern you'll reuse in other tools. Read ADR 0006.
6. **The real runs:** spikes 010, 011 and 012. They show what all of the above looks like from the outside.

Concepts worth looking up on their own after that: child processes and exit codes, JSON over stdin, file locking, atomic rename, idempotence, and dependency injection (the `deps` and `CliContext` objects that let tests fake the outside world).

## What's next
Stage 2 sends `TO DENNIS:` and "stuck" alerts to Dennis's phone. See [PROJECT_BRIEF.md](../PROJECT_BRIEF.md). Open ideas are in [BACKLOG.md](../BACKLOG.md).
