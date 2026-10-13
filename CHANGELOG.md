# Changelog

All notable user-visible changes to Relay are listed here, newest first.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Changed
- Minimum Node.js version is now 22.12 (Node 20 is end of life).

### Added
- The `relay` command: `relay init <project>` sets up a lead + builder pair without changing your own files (`--undo` removes it exactly), plus `start`, `status`, `log`, `pause`, `resume` and `stop`.
- Hooks (`@relay/hooks`): a Stop hook that passes tagged replies between the lead and builder sessions (with round limit, pause/stop, re-arm and both delivery modes) and a UserPromptSubmit hook that keeps Relay from interrupting a turn.
- Core library (`@relay/core`): reply tag parser, `relay.config.json` loading, and a shared state file and activity log that several processes can update safely.
- Repo foundation: npm workspaces with `core`, `hooks` and `helper` packages, strict TypeScript, ESLint, Prettier, Vitest, and CI on Windows and Ubuntu.
