# 2026-10-12 — Repo foundation (M0)

## What I built
The empty "skeleton" of the Relay repo. There is no Relay feature yet. Instead, everything around the code is set up so later work is quick and safe: three packages (`core`, `hooks`, `helper`), strict TypeScript, a linter, a formatter, a test runner, and CI that runs every check on Windows and Linux whenever code is pushed. Each package has one tiny test, which proves the whole toolchain works from start to finish.

## Why it's built this way
- **TypeScript + npm workspaces.** The full reasoning is in [ADR 0001](../../adr/0001-typescript-and-npm-workspaces.md). In short: Node is already on any PC that runs Claude Code, types catch message-shape bugs early, and workspaces are built into npm, so there are no extra tools to learn.
- **Pinned versions.** The newest tools didn't all fit together. TypeScript 7 was just released, but typescript-eslint doesn't support it yet, so TypeScript is pinned to 6.0. Vitest 5 dropped Node 20, which we still support, so Vitest is pinned to 4.1. Lesson: "latest" isn't always "compatible". Check each tool's `peerDependencies` and `engines` (see New concepts) before upgrading.
- **Tests next to the code** (`src/index.test.ts` beside `src/index.ts`). This is easy to find, and one root Vitest config covers all packages. The alternative, a separate `test/` folder per package, means more navigating for no gain at this size.
- **Small commits.** Each step (workspace, lint, packages, CI, README, docs) is its own commit, so `git log` tells the story and any step can be undone on its own.

### Bumps along the way (not code bugs, so no bug journal entry)
- The first `npm install` failed with `ECONNRESET` while downloading `@types/node` metadata. The npm debug log showed a network reset mid-download, not a proxy or config problem, and a retry worked. Lesson: read the debug log before changing settings.
- `npx tsc --version`, run before TypeScript was installed, downloaded an unrelated old package called `tsc`. Use `npx --no-install` so `npx` only runs tools that are already installed.

## Code walkthrough
- `package.json` (lines 11–13): `"workspaces": ["packages/*"]` tells npm that every folder under `packages/` is its own package. `npm install` links them into `node_modules/@relay/...`, so one package can `import ... from '@relay/core'` without publishing anything.
- `package.json` (lines 14–23): the scripts. `npm run check` (line 22) runs format check → lint → typecheck → tests, in the same order as CI. `--workspaces --if-present` (lines 15–16) means "run this script in every package that has it".
- `package.json` (lines 8–10): `engines` documents the minimum Node version (20.19, required by ESLint 10).
- `tsconfig.base.json` (lines 10–14): the strictness settings. `strict` turns on all the main type checks. `noUncheckedIndexedAccess` makes `array[0]` have type `T | undefined`, because the array might be empty. That will matter when we parse the lines of a message.
- `tsconfig.base.json` (lines 6–7): `NodeNext` means "behave exactly like modern Node.js ES modules". It's why imports end in `.js` even in `.ts` files (see `packages/core/src/index.test.ts` line 3): Node needs the real file name of the compiled output.
- `packages/core/tsconfig.json` (whole file): each package extends the base and only says where its source (`src`) and output (`dist`) live. `tsconfig.build.json` next to it excludes `*.test.ts`, so tests are never shipped in `dist/`.
- `eslint.config.js` (lines 16–28): `recommendedTypeChecked` uses the TypeScript compiler to lint with real type information. Its best rule for us is `no-floating-promises`: it flags a Promise you forgot to `await`. The hook will wait on other processes, so that bug would be easy to make. `projectService` (line 21) finds each file's `tsconfig.json` automatically.
- `eslint.config.js` (line 37): `prettierConfig` comes last and switches off any ESLint rule about style, so ESLint (bugs) and Prettier (formatting) never argue.
- `vitest.config.ts` (line 7): one glob picks up every package's tests.
- `packages/*/src/index.ts`: each exports `PACKAGE_NAME`. It's a placeholder, but the test that imports it proves TypeScript, ESM imports and Vitest all work.
- `.github/workflows/ci.yml` (lines 19–24): a **matrix** runs the job four times: Windows and Ubuntu, each on Node 20 and 24. `fail-fast: false` means one failure doesn't cancel the others, so you see every broken combination at once.
- `.github/workflows/ci.yml` (line 34): `npm ci` installs exactly the versions in `package-lock.json`, so CI tests the same code you ran locally.
- `.gitattributes` (line 4): forces LF line endings. When the repo was first created, Git warned `LF will be replaced by CRLF` for every file. Without this line, a Windows checkout could turn every file to CRLF and `prettier --check` (which expects LF) would fail on the Windows CI runner.

## New concepts
### Monorepo and npm workspaces
A monorepo is one Git repo holding several packages. npm workspaces is npm's built-in support for this: list the package folders in the root `package.json`, and `npm install` links them together.
```json
"workspaces": ["packages/*"]
```
After that, `import { PACKAGE_NAME } from '@relay/core'` works from any other package.

### Strict mode (TypeScript)
`"strict": true` turns on a group of checks, the most important being "null and undefined are not allowed unless you say so". It catches the classic "cannot read property of undefined" crash at compile time.
```ts
// Error with noUncheckedIndexedAccess: xs[0] may be undefined.
function first(xs: string[]) { return xs[0].toUpperCase(); }
```

### Linter vs formatter
A **linter** (ESLint) finds likely bugs and bad patterns, like an unused variable or an un-awaited Promise. A **formatter** (Prettier) only rewrites layout: quotes, indentation, line breaks. Letting each do one job avoids conflicts and style debates.

### Continuous integration (CI)
CI is a server that runs your checks on every push. Here it's GitHub Actions, configured in `.github/workflows/ci.yml`. It proves the code works on a clean machine and on an OS you didn't test on yourself, which for Relay means Windows *and* Linux.

### `engines` and `peerDependencies`
`engines` in a package's `package.json` says which Node versions it supports. `peerDependencies` says which versions of *another* package it works with. Checking them is how we found the version problems in this session:
```
npm view typescript-eslint peerDependencies   → typescript: '>=4.8.4 <6.1.0'
npm view vitest engines                       → node: '^22.12.0 || ^24.0.0 || >=26.0.0'
```

### Line endings (LF vs CRLF)
Windows traditionally ends text lines with two characters (CR LF, `\r\n`). Linux and macOS use one (LF, `\n`). Tools that compare files byte by byte, like Prettier's check, treat the two as different. `.gitattributes` makes Git use LF everywhere.

## Tests
- Run everything: `npm run check`. Tests only: `npm test`.
- Each package has one test checking `PACKAGE_NAME`. If it fails, the toolchain is broken (an import path, the TypeScript config, or Vitest itself), not Relay logic.
- Result of this session:
```
 Test Files  3 passed (3)
      Tests  3 passed (3)
```
Format check, lint and typecheck also passed with no errors.

## Self-check
1. Why does `index.test.ts` import `./index.js` when the file on disk is `index.ts`?
2. What would go wrong on the Windows CI runner without `.gitattributes`?
3. Why is TypeScript pinned to 6.0 instead of the newest version, 7?
4. What's the difference between `npm install` and `npm ci`, and why does CI use `npm ci`?
5. Which ESLint rule makes type-aware linting especially useful for Relay's hook code?

<details><summary>Answers</summary>

1. With `module: NodeNext`, TypeScript makes you write the import the way Node will see it after compiling. Node runs `index.js`, not `index.ts`, so the import says `.js`. TypeScript maps it back to the `.ts` file while type checking.
2. Git could check files out with CRLF line endings. Prettier expects LF, so `prettier --check` would report every file as badly formatted and CI would fail.
3. typescript-eslint, which powers type-aware linting, only supports TypeScript below 6.1. We'd lose type-aware lint rules if we upgraded.
4. `npm install` may update `package-lock.json` to newer allowed versions. `npm ci` installs exactly what the lock file says and fails if it doesn't match `package.json`. CI uses `npm ci` so it tests exactly the versions you used locally.
5. `@typescript-eslint/no-floating-promises`: it flags Promises that are never awaited. The hook waits on files and processes, so a missing `await` could make it return too early.

</details>

## What to read next
- npm workspaces: https://docs.npmjs.com/cli/using-npm/workspaces
- TypeScript `strict` and friends: https://www.typescriptlang.org/tsconfig#strict
- typescript-eslint typed linting: https://typescript-eslint.io/getting-started/typed-linting
- GitHub Actions matrix builds: https://docs.github.com/actions/using-jobs/using-a-matrix-for-your-jobs
- Next milestone, M1 (spikes): `docs/plans/stage-1.md` and `docs/research/claude-code-mechanics.md`
