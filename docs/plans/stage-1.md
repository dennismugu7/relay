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

## M2 — Core
- Tag parser: `TO CODE:` / `TO DENNIS:` / none (→ Dennis). Handles leading whitespace, markdown, mixed case. Thorough unit tests.
- Project config: `relay.config.json` per project (name, builder path, lead path, max rounds).
- State and log files under `%USERPROFILE%\.relay\<project>\`: current baton holder, round count, paused/stopped flags, append-only `activity.jsonl`.

## M3 — Hooks
- The Stop hook script per the mechanism chosen in ADR 0002.
- Reads hook input from stdin, writes the outgoing message for the helper, waits for the reply, returns the right JSON.
- Respects Pause/Stop and max rounds; on stop, lets the session end and logs why.
- Loop guard independent of `stop_hook_active`.
- Tests with fake stdin/stdout.

## M4 — Helper and CLI
- `relay init <project-path>`: creates the sibling lead folder, writes the lead `CLAUDE.md` (from a template in `packages/helper/templates/`), writes both sessions' `.claude/settings.json` hook entries and the `/relay-start` skill, writes `relay.config.json`.
- `relay status`, `relay log`, `relay pause`, `relay resume`, `relay stop`.
- Tests for each command against a temp folder.

## M5 — End-to-end on a test project
- Create `C:\Users\denni\projects\relay-playground` (a tiny Node app).
- `relay init`, open both sessions, run `/relay-start` in the builder, give the lead a small goal (e.g. "add a /health endpoint with a test").
- Record the run in `docs/spikes/` or a journal entry, with the activity log.
- Fix what breaks, with bug journal entries.

**Stage 1 is done** when M5 runs at least 5 rounds unattended and the README shows how to set it up.
