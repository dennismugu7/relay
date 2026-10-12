# Glossary

_Plain-English definitions of every technical term used in this repo, in alphabetical order. The builder adds terms as they appear._

**ADR (Architecture Decision Record)** — A short document recording one design decision: the situation, the options, what was chosen and why. Kept in `docs/adr/`. It helps future readers understand *why* the code is the way it is.

**Baton** — Relay's name for "whose turn it is". Only the session holding the baton works; the other waits. See `docs/PROJECT_BRIEF.md`.

**Builder** — The Claude Code session that writes the code, opened in the project folder.

**CI (Continuous Integration)** — A server that automatically runs checks (lint, typecheck, tests) on every push. Relay uses GitHub Actions.

**CLI (Command-Line Interface)** — A program you control by typing commands in a terminal, such as `relay status`.

**Commit** — A saved snapshot of changes in Git, with a message explaining it.

**Conventional Commits** — A rule for commit messages: start with a type such as `feat:`, `fix:`, `docs:`, `test:`, `refactor:` or `chore:`, so history is easy to scan.

**CRLF / LF** — The invisible characters that end a line of text. Windows traditionally uses CRLF (`\r\n`); Linux and macOS use LF (`\n`). This repo uses LF everywhere (see `.gitattributes`).

**Dev dependency** — A package needed only while developing (tests, linting), not when the program runs. Listed under `devDependencies` in `package.json`.

**`engines`** — A field in `package.json` stating which Node.js versions a package supports.

**End of life (EOL)** — The date after which a software version gets no more fixes, including security fixes.

**ES modules (ESM)** — The modern JavaScript module system, using `import` and `export`. Turned on for this repo by `"type": "module"` in `package.json`.

**ESLint** — A linter for JavaScript and TypeScript.

**Exit code** — A number a program returns when it ends. `0` means success; anything else means failure. CI fails a step whose command exits with non-zero.

**Formatter** — A tool that rewrites code layout (spacing, quotes, line breaks) without changing what it does. This repo uses Prettier.

**GitHub Actions** — GitHub's built-in CI service. Workflows live in `.github/workflows/`.

**Hook (Claude Code)** — A script Claude Code runs automatically at certain moments, such as when Claude finishes a reply (the Stop hook). Relay is built on hooks.

**Lead** — The session that plans and reviews, opened in a sibling folder such as `app1-lead`. It sends work to the builder with `TO CODE:`.

**Linter** — A tool that reads code and warns about likely bugs and bad patterns without running it.

**Lock file** — `package-lock.json`. Records the exact version of every installed package so every machine gets the same ones.

**Matrix (CI)** — A way to run the same CI job with different settings, such as each operating system and Node version.

**Monorepo** — One Git repository that holds several packages.

**Node.js** — A program that runs JavaScript outside the browser. Claude Code and Relay both run on it.

**npm** — Node's package manager: it installs libraries and runs project scripts (`npm run ...`).

**`npm ci`** — Installs exactly what `package-lock.json` lists, from scratch. Used in CI.

**npm workspaces** — npm's built-in monorepo support: several packages in one repo, linked together by one `npm install`.

**`npx`** — Runs a command from an npm package. Use `npx --no-install <tool>` so it never downloads an unexpected package.

**Peer dependency** — A package's statement of which versions of *another* package it works with, for example typescript-eslint needing TypeScript below 6.1.

**Pinning (a version)** — Restricting a dependency to a version range on purpose, such as `~6.0.3` (any 6.0.x from 6.0.3 up), to avoid an incompatible upgrade.

**Prettier** — A code formatter.

**Remote Control** — A Claude Code feature that connects a session running on the PC to the Claude mobile app, so it can be used from a phone.

**Session (Claude Code)** — One running Claude Code conversation in a terminal.

**Spike** — A small, throwaway experiment that answers one "will this work?" question before real code depends on it. Written up in `docs/spikes/`.

**Stop hook** — A Claude Code hook that runs every time Claude finishes a reply. It can let Claude stop, or tell Claude to keep going with a reason. Relay's core mechanism.

**Strict mode (TypeScript)** — A group of compiler checks (`"strict": true`) that catch more mistakes, especially values that might be `null` or `undefined`.

**tsconfig** — A `tsconfig.json` file: settings telling the TypeScript compiler how to check and build code.

**Type checking / typecheck** — Having the TypeScript compiler check that values are used consistently with their types, without running the code.

**Type-aware linting** — Linting that uses the TypeScript compiler's type information to find more bugs, such as an un-awaited Promise.

**TypeScript** — JavaScript plus types. A compiler checks the types and outputs plain JavaScript.

**Vitest** — The test runner used in this repo. Test files end in `.test.ts`.

**Workspace** — One package inside an npm workspaces monorepo, such as `packages/core`.
