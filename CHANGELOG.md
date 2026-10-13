# Changelog

All notable user-visible changes to Relay are listed here, newest first.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Changed
- Minimum Node.js version is now 22.12 (Node 20 is end of life).

### Added
- Core library (``relay/core`): reply tag parser, `relay.config.json` loading, and a shared state file and activity log that several processes can update safely.
- Repo foundation: npm workspaces with `core`, `hooks` and `helper` packages, strict TypeScript, ESLint, Prettier, Vitest, and CI on Windows and Ubuntu.
