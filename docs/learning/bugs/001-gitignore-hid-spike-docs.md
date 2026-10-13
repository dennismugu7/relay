# 001 — `.gitignore` rule `spikes/` also hid `docs/spikes/`

**Date:** 2026-10-13 · **Area:** `.gitignore` · **Severity:** medium

## Symptom
After writing the first spike write-up, `git add docs/spikes/001-stop-hook-continue-with-instruction.md` refused:
```
The following paths are ignored by one of your .gitignore files:
docs/spikes
hint: Use -f if you really want to add them.
```
Every spike write-up, which M1 exists to produce, would silently have stayed out of the repo.

## How to reproduce
1. Have `spikes/` (no leading slash) in `.gitignore`.
2. Create any file in `docs/spikes/`, e.g. `docs/spikes/x.md`.
3. Run `git add docs/spikes/x.md` and it's rejected. Or run `git status` and the file doesn't show up as untracked at all, which is the sneakier version.

## Investigation
1. Checked whether the file existed and was spelled right. It was, so this wasn't a typo.
2. Asked Git which rule was responsible:
   ```
   $ git check-ignore -v docs/spikes/001-stop-hook-continue-with-instruction.md
   .gitignore:31:spikes/	docs/spikes/001-stop-hook-continue-with-instruction.md
   ```
   Line 31 was the rule I'd added in M0 to ignore the throwaway spike folders at the repo root.
3. Checked why `docs/spikes/.gitkeep` was in the repo anyway: `git ls-files docs/spikes` lists it because it was committed *before* `.gitignore` existed. Git keeps tracking files it already tracks, even if they match an ignore rule. That hid the bug during M0.

## Root cause
In `.gitignore`, a pattern **without a slash at the start or in the middle** matches at *any depth*. `spikes/` therefore means "any folder named `spikes`, anywhere", which includes `docs/spikes/`. A pattern that **starts with `/`** is anchored to the folder holding the `.gitignore`, here the repo root. So `/spikes/` matches only `relay/spikes/`.

## The fix
Changed the rule from `spikes/` to `/spikes/` and added a comment explaining why the slash matters (`.gitignore`, "Spike experiments" block).

## How it's guarded now
`test/gitignore.test.ts` asks Git directly with `git check-ignore -q --no-index <path>` and checks that:
- `spikes/001/hook.cjs` **is** ignored,
- `docs/spikes/001-example.md` is **not** ignored,
- `.env` is ignored and `.env.example` is not.

Against the old rule, the test fails:
```
× keeps spike write-ups in docs/spikes/
Tests  1 failed | 5 passed (6)
```
With the fix: `Tests  6 passed (6)`. The test runs in CI on every push.

## Lesson
- **Ignore patterns match at any depth unless anchored.** When you mean "this folder at the root", write `/name/`.
- **Files committed before an ignore rule hide the rule's mistakes.** `.gitkeep` stayed tracked, so `docs/spikes/` looked fine. When you add an ignore rule, test it on a *new* file with `git check-ignore -v <path>`.
- **Config can have bugs too.** A one-line test turns a config assumption into something CI checks forever.
