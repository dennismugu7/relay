# 003 — `relay init` failed: the install manifest was saved before its folder existed

**Date:** 2026-10-13 · **Area:** `packages/helper/src/init.ts` · **Severity:** high (init never worked), caught by tests before any commit

## Symptom
The first run of the init tests: 14 of 27 failed. The first one only said `expected 1 to be +0`, meaning `relay init` exited with code 1. The others failed further down because files were missing.

## How to reproduce
Before the fix: `relay init <any project>` with no `~/.relay/<project>/` folder yet. In other words, every first init.

## Investigation
1. The test only checked the exit code, so the actual error message was hidden in the captured output. A throwaway test printed it by asserting the output was empty, so the failure diff showed it:
   ```
   relay: ENOENT: no such file or directory, open '...\relay-home\app1\install.json.21268.107fddb1.tmp'
   ```
2. `ENOENT` on a `.tmp` file inside `relay-home\app1\` means the folder didn't exist. `writeFileAtomic` writes a temp file next to the target, and `writeFile` doesn't create folders.
3. Why no folder? To make undo safe, I had just changed `applyPlans` to save the manifest **before** writing any project file. That moved the first write into Relay's state folder earlier than anything that created it.

## Root cause
An ordering change. The manifest save became the very first write, but the code that creates `~/.relay/<project>/` (`updateState`, which calls `mkdir`) only runs later, from the hooks or the control commands.

## The fix
The save callback in `init.ts` now creates the folder first:
```ts
const changed = await applyPlans(plans, manifest, async (m) => {
  await mkdir(dir, { recursive: true });
  await writeFileAtomic(path.join(dir, MANIFEST_FILE), JSON.stringify(m, null, 2) + '\n');
});
```

## How it's guarded now
Every init test starts with no Relay folder at all (`makeWorkspace` creates a fresh temp folder), so all 27 would fail again.

## Lesson
1. **When you reorder steps, re-check what each step assumes already exists.** "Save the record first" was a good safety change, but it broke an assumption no test name mentioned.
2. **A test that only checks an exit code hides the reason.** For a CLI, also look at the printed error when a test fails. Several init tests now check `ws.output.at(-1)` for the expected message.
