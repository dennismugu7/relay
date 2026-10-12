# 0001 — TypeScript and npm workspaces

**Date:** 2026-10-12 · **Status:** accepted

## Context
Relay has three parts that must share code:

- **core**: types, the `TO CODE:` / `TO DENNIS:` tag parser and state file helpers. Both other parts use it.
- **hooks**: the Stop hook script Claude Code runs after every reply.
- **helper**: a background process plus the `relay` CLI.

All three run on Dennis's Windows 11 PC, next to Claude Code, which is itself a Node.js program. The code moves messages between processes and files, where one wrong field name or one missing `await` silently breaks the relay. The repo is also a portfolio piece and study material, so the setup should be common, well documented and easy to read.

We need to choose a language and a way to organise the three parts.

## Options considered

**Language**

1. **TypeScript on Node.js.** Pros: Node is already installed wherever Claude Code is; hook input and output are JSON, which maps naturally to JavaScript objects; the type checker catches wrong field names and missing awaits before the code runs; very common in freelance work. Cons: a compile step and some config.
2. **Plain JavaScript on Node.js.** Pros: no compile step. Cons: mistakes in message shapes only show up at runtime, often as a silently stuck relay.
3. **Python.** Pros: simple scripts. Cons: another runtime to install on Windows; less natural for a future Expo (React Native) app in Stage 3, which will want to share types with core.
4. **PowerShell scripts.** Pros: native on Windows. Cons: Windows only (CI on Linux would be pointless), hard to unit test, a weak portfolio signal.

**Repo organisation**

1. **npm workspaces monorepo.** One repo, one `npm install`, packages under `packages/*` that import each other by name (`@relay/core`). Built into npm, so nothing extra to learn or install.
2. **Separate repos per package.** Cleaner borders, but changes to core need publishing and version bumps before hooks can use them. Far too heavy for one developer.
3. **One package with folders.** Simplest, but hooks and helper would ship each other's code, and the borders between parts would blur.
4. **pnpm, Yarn, Turborepo or Nx.** More features (faster installs, task caching), but each is one more tool to install and learn. Our three small packages don't need them.

## Decision
**TypeScript (strict mode) on Node.js, organised as an npm workspaces monorepo** with `packages/core`, `packages/hooks` and `packages/helper`.

Version notes from setting this up on 2026-10-12:

- **TypeScript is pinned to 6.0.x.** TypeScript 7 (the native rewrite) is out, but typescript-eslint 8.71 only supports TypeScript `<6.1`. Type-aware linting is worth more to us than the faster compiler. Revisit when typescript-eslint supports 7.
- **Vitest is pinned to 4.1.x.** Vitest 5 needs Node 22.12+, and `CLAUDE.md` says Node 20+. Vitest 4.1 supports Node 20.
- **Minimum Node is 20.19.0**, because ESLint 10 needs it. CI tests on Node 20 and 24.

## Consequences
- Easier: sharing types between packages; catching message-shape bugs at compile time; one command (`npm run check`) for all quality checks; CI on Windows and Linux is straightforward.
- Harder: a build step before the hook script can run (`npm run build`), and some config files to understand (see the 2026-10-12 journal entry).
- Watch: how Claude Code will run the hook script (a built `dist/` file? a linked `relay` command?). That is decided in M3/M4. Also watch Node 20 being past its end of life (April 2026): moving the minimum to Node 22 would let us upgrade Vitest.
