# Glossary

_Plain-English definitions of every technical term used in this repo, in alphabetical order. The builder adds terms as they appear._

**`additionalContext`** — A field a hook can return to add text to Claude's context. From a Stop hook, it makes Claude keep going and act on the text. Relay's preferred way to hand Claude a message (spike 001).

**ADR (Architecture Decision Record)** — A short document recording one design decision: the situation, the options, what was chosen and why. Kept in `docs/adr/`. It helps future readers understand *why* the code is the way it is.

**`asyncRewake`** — A hook setting. The hook runs in the background instead of holding up the session. If it later exits with code 2, Claude Code wakes the session, even an idle one, and shows Claude the hook's stderr. See spike 005.

**Atomic write** — Writing a file so readers see either all of the old content or all of the new, never a mix. Relay writes a temporary file and then renames it over the real one (`packages/core/src/atomic.ts`).

**Background process** — A program that keeps running without a window or a terminal you type into, such as the Relay Helper.

**Baton** — Relay's name for "whose turn it is". Only the session holding the baton works; the other waits. See `docs/PROJECT_BRIEF.md`.

**Builder** — The Claude Code session that writes the code, opened in the project folder.

**Busy flag** — A per-session value in Relay's state file. The UserPromptSubmit hook sets it when a turn starts; while it's set, no waiter delivers, so Relay never interrupts Dennis. See spike 009.

**CI (Continuous Integration)** — A server that automatically runs checks (lint, typecheck, tests) on every push. Relay uses GitHub Actions.

**`claudeMdExcludes`** — A Claude Code setting listing CLAUDE.md files a session should not load. Used in the M3 test folders so Relay's own instructions stay out.

**CLI (Command-Line Interface)** — A program you control by typing commands in a terminal, such as `relay status`.

**Commit** — A saved snapshot of changes in Git, with a message explaining it.

**Continuation cap** — Claude Code's limit on how many times in a row a Stop hook may make Claude keep going in one turn: 8 by default, raised with `CLAUDE_CODE_STOP_HOOK_BLOCK_CAP`. It protects against endless loops. See spike 002.

**Conventional Commits** — A rule for commit messages: start with a type such as `feat:`, `fix:`, `docs:`, `test:`, `refactor:` or `chore:`, so history is easy to scan.

**CRLF / LF** — The invisible characters that end a line of text. Windows traditionally uses CRLF (`\r\n`); Linux and macOS use LF (`\n`). This repo uses LF everywhere (see `.gitattributes`).

**Cross-session messaging** — A Claude Code feature that lets sessions on the same machine send each other messages with the `SendMessage` tool. Claude decides when to send. See spike 006.

**Delivery mode** — How Relay hands a message to a session: `rewake` (a background hook wakes the idle session, the default) or `blocking` (the Stop hook waits and continues the turn, the fallback). Set in `relay.config.json`.

**Dependency injection** — Passing a function the things it needs (a clock, a sleep function) instead of letting it reach for them itself, so tests can pass fakes.

**Dev dependency** — A package needed only while developing (tests, linting), not when the program runs. Listed under `devDependencies` in `package.json`.

**End of life (EOL)** — The date after which a software version gets no more fixes, including security fixes.

**`engines`** — A field in `package.json` stating which Node.js versions a package supports.

**Environment variable** — A named value a program inherits from whatever started it, such as `PATH`. A child process gets a copy of its parent's. Example: `CLAUDE_CODE_STOP_HOOK_BLOCK_CAP=50`.

**ES modules (ESM)** — The modern JavaScript module system, using `import` and `export`. Turned on for this repo by `"type": "module"` in `package.json`.

**ESLint** — A linter for JavaScript and TypeScript.

**Exit code** — A number a program returns when it ends. `0` means success; anything else means failure. CI fails a step whose command exits with non-zero.

**Fixture (test fixture)** — Code or data that exists only to support tests, such as `packages/core/src/__fixtures__/concurrent-worker.ts`.

**Formatter** — A tool that rewrites code layout (spacing, quotes, line breaks) without changing what it does. This repo uses Prettier.

**GitHub Actions** — GitHub's built-in CI service. Workflows live in `.github/workflows/`.

**Harness (test harness)** — Helper code that runs the thing under test and controls or watches it. Relay's spikes used `spikes/_pty/pty.cjs` to drive real Claude Code sessions.

**Heartbeat** — A small "I'm still alive" signal written at regular intervals, such as a log line every 5 seconds. When the heartbeats stop, you know the process died.

**Hook (Claude Code)** — A script Claude Code runs automatically at certain moments, such as when Claude finishes a reply (the Stop hook). Relay is built on hooks.

**Idle (session)** — A Claude Code session that has finished its reply and is waiting at the prompt with nothing running.

**JSON Lines (`.jsonl`)** — A text file with one complete JSON object per line. Easy to append to. Relay's activity log uses it.

**Lead** — The session that plans and reviews, opened in a sibling folder such as `app1-lead`. It sends work to the builder with `TO CODE:`.

**Linter** — A tool that reads code and warns about likely bugs and bad patterns without running it.

**Lock file** — `package-lock.json`. Records the exact version of every installed package so every machine gets the same ones.

**Lost update** — When two processes read the same data, both change it, and the second save silently wipes out the first. Prevented in Relay by a lock.

**Matrix (CI)** — A way to run the same CI job with different settings, such as each operating system and Node version.

**Monorepo** — One Git repository that holds several packages.

**Mutation testing** — Breaking the code on purpose to check that the tests notice. If nothing fails, the tests don't really guard that code.

**Named pipe** — A Windows way for two programs on the same machine to talk, through a path like `\\.\pipe\name` that behaves like a file. Claude Code uses one as each session's message inbox on Windows.

**Node.js** — A program that runs JavaScript outside the browser. Claude Code and Relay both run on it.

**npm** — Node's package manager: it installs libraries and runs project scripts (`npm run ...`).

**`npm ci`** — Installs exactly what `package-lock.json` lists, from scratch. Used in CI.

**npm workspaces** — npm's built-in monorepo support: several packages in one repo, linked together by one `npm install`.

**`npx`** — Runs a command from an npm package. Use `npx --no-install <tool>` so it never downloads an unexpected package.

**owesReply** — A flag in Relay's state: set when a message is delivered to the builder, so its next reply goes back to the lead as the report.

**Path traversal** — Using `..` or slashes in text that becomes a file path, to reach files outside the intended folder. Relay blocks it by allowing only safe characters in project names.

**Peer dependency** — A package's statement of which versions of *another* package it works with, for example typescript-eslint needing TypeScript below 6.1.

**PID (process ID)** — The number the operating system gives a running program. With it you can check whether the program is still alive, or stop it. `tasklist` shows them on Windows.

**Pinning (a version)** — Restricting a dependency to a version range on purpose, such as `~6.0.3` (any 6.0.x from 6.0.3 up), to avoid an incompatible upgrade.

**Prettier** — A code formatter.

**Pseudo-terminal (pty)** — A fake terminal created by software. A program running inside it behaves as if a person were at a real terminal, while a script reads its screen and sends keystrokes.

**Pure function** — A function whose result depends only on its inputs and that has no other effects (no files, clock or network). Easy to test.

**Race condition** — A bug that depends on timing: the result changes depending on which of two simultaneous actions happens first.

**Re-arm** — Starting a fresh waiting hook before the old one's timeout runs out, so the session never stops waiting for the next message. See spike 004.

**Re-arm marker** — `rearmPending` in Relay's state: set just before a waiter asks for a `WAITING` turn, so the next Stop hook knows that reply isn't a real message.

**Regular expression (regex)** — A small pattern language for matching text. `/^to\s+code:/i` matches "to code:" at the start of a string, in any case.

**Remote Control** — A Claude Code feature that connects a session running on the PC to the Claude mobile app, so it can be used from a phone.

**Round** — One `TO CODE:` message delivered to the builder plus its report returned to the lead. The count resets whenever control returns to Dennis. See `docs/PROJECT_BRIEF.md`.

**Session (Claude Code)** — One running Claude Code conversation in a terminal.

**Spike** — A small, throwaway experiment that answers one "will this work?" question before real code depends on it. Written up in `docs/spikes/`.

**Stale lock** — A lock file left behind by a process that crashed while holding it. Relay treats a lock older than 10 seconds as stale and removes it.

**State file** — Relay's `state.json`: the shared record of the message queue, waiters, flags and round counter for one project.

**Stdin / stdout / stderr** — A program's three standard streams: input (stdin), normal output (stdout) and error output (stderr). Claude Code sends a hook its input as JSON on stdin and reads its answer from stdout or stderr.

**Stop hook** — A Claude Code hook that runs every time Claude finishes a reply. It can let Claude stop, or tell Claude to keep going with a reason. Relay's core mechanism.

**Strict mode (TypeScript)** — A group of compiler checks (`"strict": true`) that catch more mistakes, especially values that might be `null` or `undefined`.

**System reminder** — Text Claude Code adds to the conversation for Claude to read, as opposed to text typed by the user. An `asyncRewake` hook's message reaches Claude this way.

**Timeout (hook)** — How many seconds Claude Code lets a hook run before killing it, set per hook with `timeout`. A killed hook's output is thrown away (spike 004).

**Transcript** — The file where Claude Code records a session's conversation and events, one JSON object per line (`.jsonl`), under `~/.claude/projects/`.

**tsconfig** — A `tsconfig.json` file: settings telling the TypeScript compiler how to check and build code.

**tsx** — A tool that lets Node.js run TypeScript files directly, without building them first. Relay's tests use it to start TypeScript child processes.

**Type checking / typecheck** — Having the TypeScript compiler check that values are used consistently with their types, without running the code.

**Type guard** — A TypeScript function returning `value is SomeType`. When it returns true, TypeScript treats the value as that type afterwards.

**Type-aware linting** — Linting that uses the TypeScript compiler's type information to find more bugs, such as an un-awaited Promise.

**TypeScript** — JavaScript plus types. A compiler checks the types and outputs plain JavaScript.

**UserPromptSubmit hook** — A Claude Code hook that runs when a turn starts, before Claude sees the prompt. Relay uses it to set the busy flag.

**Vitest** — The test runner used in this repo. Test files end in `.test.ts`.

**Waiter** — In Relay's spikes, a hook process that sits waiting for the next message for its session, then delivers it.

**Workspace** — One package inside an npm workspaces monorepo, such as `packages/core`.
