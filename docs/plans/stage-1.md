# Stage 1 plan — the engine on the PC

**Goal:** two Claude Code sessions on a test project complete several lead↔builder rounds with no copy-paste, controlled by the `relay` CLI.

Work through the milestones in order. Finish each with tests passing, docs updated (see `CLAUDE.md`), and a commit. Stop at the end of each milestone and report to Dennis with a short summary and anything under **Needs Dennis**.

## M0 — Repo foundation
- npm workspaces, TypeScript strict, ESLint, Prettier, Vitest.
- `packages/core`, `packages/hooks`, `packages/helper` skeletons, each with one passing test.
- GitHub Actions CI on Windows and Ubuntu.
- `README.md` first draft, `LICENSE` (MIT), `CHANGELOG.md`, `.gitignore`, `.env.example`.
- Docs scaffolding already in `docs/` — keep it, fill `REPO_TOUR.md` and `GLOSSARY.md`.
- ADR 0001: why TypeScript + npm workspaces.
- Journal entry for the session.

## M1 — Spikes (prove before building)
Run the spikes listed in `docs/research/claude-code-mechanics.md` using two throwaway folders under `spikes/` (git-ignored except their write-ups). Write each up in `docs/spikes/`. Dennis may need to help with the Remote Control spike from his phone — ask under **Needs Dennis**.

At the end, write ADR 0002: **the delivery mechanism** — the blocking Stop-hook baton, cross-session messaging, or a mix — based on the evidence. Get Dennis's OK before M2.

**M1 result:** [ADR 0002](../adr/0002-delivery-mechanism.md), accepted 2026-10-13. Delivery uses an `asyncRewake` Stop hook with one waiter per session, a busy/idle flag, re-arm before the timeout (re-arm replies never end the run), and the blocking baton as a settings-only fallback. M2–M4 below are updated for it.

## M2 — Core
One goal: `packages/core`, fully tested. Pure library code and tests only: no hooks, no CLI, no Claude Code sessions.
- Tag parser: `TO CODE:` / `TO DENNIS:` / none (→ Dennis). Handles leading whitespace, markdown such as `**TO CODE:**`, and mixed case. Thorough unit tests.
- Project config: `relay.config.json` per project (name, builder path, lead path, max rounds, delivery mode `"rewake"` | `"blocking"`).
- State helpers under `%USERPROFILE%\.relay\<project>\`: message queue, waiter record (session, PID, start, deadline), busy/idle flag, re-arm marker, round counter, paused/stopped flags, and an append-only `activity.jsonl`.
- State writes are atomic (write a temp file, then rename). A test has two processes updating the state at the same time.

## M3 — Hooks
- First, a quick check that re-arming by exit 2 works with `asyncRewake`, and that the busy flag behaves as designed (see ADR 0002).
- The Stop hook script per ADR 0002 (`asyncRewake` main path, blocking fallback), plus a `UserPromptSubmit` hook that marks the session busy.
- Reads hook input from stdin, writes the outgoing message for the helper, waits for the reply, returns the right JSON.
- Respects Pause/Stop and max rounds; on stop, lets the session end and logs why.
- Loop guard independent of `stop_hook_active`.
- Tests with fake stdin/stdout. They must cover:
  - one waiter per session (older waiters exit 0 without delivering);
  - delivering only while the session is idle;
  - re-arm before the timeout;
  - **a reply to the hook's own re-arm**, detected by the state-file re-arm marker (not the text), re-arms again without logging a handoff, counting a round, or notifying Dennis.

## M4 — Helper and CLI
- `relay init <project-path>`: creates the sibling lead folder, writes the lead `CLAUDE.md` (from a template in `packages/helper/templates/`), writes both sessions' `.claude/settings.json` hook entries (`Stop` and `UserPromptSubmit`, set up for the config's delivery mode) and the `/relay-start` skill, writes `relay.config.json`.
- `relay start`: makes a project ready for a run (clears stopped/paused, resets rounds). There is no background Helper process in Stage 1 ([ADR 0005](../adr/0005-no-background-helper.md)).
- `relay status`, `relay log`, `relay pause`, `relay resume`, `relay stop`.
- Tests for each command against a temp folder.

## M5 — End-to-end on a test project
- Create `C:\Users\denni\projects\relay-playground` (a tiny Node app).
- `relay init`, open both sessions, run `/relay-start` in the builder, give the lead a small goal (e.g. "add a /health endpoint with a test").
- Record the run in `docs/spikes/` or a journal entry, with the activity log.
- Fix what breaks, with bug journal entries.

**Stage 1 is done** when M5 runs at least 5 rounds unattended and the README shows how to set it up.

**M5 result:** done 2026-10-13. On `relay-playground`, the lead and builder ran 7 rounds unattended in under 10 minutes ([spike 012](../spikes/012-m5-end-to-end.md)). Before M5, Dennis added the one-time nudge ([ADR 0007](../adr/0007-nudge-for-a-late-tag.md)). **Stage 1 is done**, released as v0.1.0. Retrospective: [docs/learning/stage-1-retrospective.md](../learning/stage-1-retrospective.md).
