# Changelog

All notable user-visible changes to Relay are listed here, newest first.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

## [0.1.0] - 2026-10-13

Stage 1: the engine on the PC. A lead and a builder Claude Code session pass work back and forth with no copy-paste.

### Changed
- Minimum Node.js version is now 22.12 (Node 20 is end of life).

### Added
- `docs/learning/stage-1-retrospective.md` and a "Using Relay day to day" section in the README.
- If the lead writes something before its `TO CODE:` line, Relay asks it once to resend with the tag first, instead of ending the run (`nudge` in `relay log`).
- The `relay` command: `relay init <project>` sets up a lead + builder pair without changing your own files (`--undo` removes it exactly), plus `start`, `status`, `log`, `pause`, `resume` and `stop`.
- Hooks (`@relay/hooks`): a Stop hook that passes tagged replies between the lead and builder sessions (with round limit, pause/stop, re-arm and both delivery modes) and a UserPromptSubmit hook that keeps Relay from interrupting a turn.
- Core library (`@relay/core`): reply tag parser, `relay.config.json` loading, and a shared state file and activity log that several processes can update safely.
- Repo foundation: npm workspaces with `core`, `hooks` and `helper` packages, strict TypeScript, ESLint, Prettier, Vitest, and CI on Windows and Ubuntu.

[Unreleased]: https://github.com/dennismugu7/relay/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/dennismugu7/relay/releases/tag/v0.1.0
