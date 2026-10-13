# 0004 — Launching the hooks: built JavaScript run with `node`

**Date:** 2026-10-13 · **Status:** accepted

## Context
Claude Code runs a hook by starting a command and piping JSON into it, after **every** reply in both sessions. Relay's hooks are written in TypeScript (`packages/hooks/src/`), which Node can't run directly in every supported version. So we must decide what command each session's `.claude/settings.json` runs. Whatever we pick must:
- start fast, since it runs on every turn;
- work on Windows without a shell (spike 001 used the exec form: `"command": "node", "args": [...]`);
- use the same `@relay/core` code the tests cover;
- be something `relay init` (M4) can write into settings.json.

## Options considered
1. **Compile with `tsc` and run the JavaScript in `dist/`:** `node <relay>/packages/hooks/dist/bin/stop.js --config ... --role ...`.
   - Pros: plain Node, no runtime tools; fastest start (measured about 120–140 ms per run on this PC, including Node itself); the same compiler as the rest of the repo.
   - Cons: needs `npm run build` after every change, and `dist/` must exist where the hooks point.
2. **Run the TypeScript source through `tsx`:** `node --import tsx .../src/bin/stop.ts`.
   - Pros: no build step.
   - Cons: slower (about 180–310 ms per run); `tsx` and esbuild become runtime dependencies of every session; it transpiles on every turn.
3. **Bundle everything into one file** (esbuild or similar): `node relay-hook.js`.
   - Pros: one self-contained file, easy to copy anywhere.
   - Cons: another build tool and config; the bundled file is hard for Dennis to read; not needed while Relay runs from this repo.
4. **A global `relay` command** (`relay hook stop`), installed by M4.
   - Pros: short settings entries; no repo path inside them.
   - Cons: depends on the CLI, which doesn't exist yet; the CLI's own startup would add time. Can wrap option 1 later.

## Decision
**Option 1.** Hooks run as built JavaScript:
```json
{ "type": "command", "command": "node",
  "args": ["<relay>/packages/hooks/dist/bin/stop.js", "--config", "<project>/relay.config.json", "--role", "builder", "--timeout", "3600"],
  "asyncRewake": true, "timeout": 3600 }
```
- `npm run build` compiles every package (core first, so hooks can import it). `npm run check` and CI build before linting, type-checking and testing.
- Tests import `@relay/core` from its **source** through a Vitest alias, so they never run against a stale build. The few tests that start `dist/bin/*.js` as real processes check that the build exists and say so if it doesn't.
- `RELAY_HOME` (an environment variable) can move Relay's state folder away from `~/.relay`, for tests and throwaway runs.

## Consequences
- **Easier:** fast, dependency-free hooks; what runs in a session is exactly what `tsc` produced from the tested code.
- **Harder:** forgetting `npm run build` after a change means sessions run old code. `relay init` (M4) should check that `dist/` exists, and the README must say to build.
- **To watch:** if Relay is later installed from npm instead of run from this repo, option 3 or 4 may become the better fit. This ADR would then be superseded.
