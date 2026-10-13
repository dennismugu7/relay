# 0006 — What `relay init` writes, where, and how `--undo` puts it back

**Date:** 2026-10-13 · **Status:** accepted

## Context
`relay init <project>` must turn any project into a lead + builder pair. The project is Dennis's (or a client's): often a git repository with its own `CLAUDE.md` and `.claude/settings.json`. Dennis's rules for M4:
- never overwrite the project's existing files;
- add the builder's Relay instructions without touching his own `CLAUDE.md` content;
- keep the hooks from polluting the repo, merging with existing settings rather than replacing them;
- running init twice changes nothing;
- `--undo` removes everything init added.

Things learned on the way:
- The lead's instructions must use absolute paths (spike 006).
- They must say Relay messages are genuine (spike 008).
- Claude Code itself writes to `.claude/settings.local.json` when you approve a permission prompt with "don't ask again". So that file can change after init.

## Options considered
**Builder instructions:**
1. Append to the project's `CLAUDE.md`. Rejected: it edits Dennis's file.
2. An `@import` line, between marker comments, inside `CLAUDE.md` or `CLAUDE.local.md`, pointing to a Relay file. Better, but it still edits one of his files.
3. **A file in `.claude/rules/`.** Claude Code loads every `.claude/rules/*.md` into each session automatically ([memory docs](https://code.claude.com/docs/en/memory)). No existing file is touched.

**Builder hooks:**
1. `.claude/settings.json`. Rejected: it's usually committed, so Relay's machine-specific paths would end up in the repo.
2. **`.claude/settings.local.json`**: a documented settings layer meant for personal, uncommitted settings, and hooks work there (spike 010's lead and builder ran from settings files, and M4's real run uses exactly this file).

**Keeping Relay's new files out of git:**
1. Edit `.gitignore`. Rejected: it's a committed project file.
2. **`.git/info/exclude`**: git's local-only ignore list, never committed. A marked block lists only the files Relay created.

**Undo:**
1. Keep backups and always restore them. Rejected: it would throw away anything Claude Code saved to `settings.local.json` after init.
2. Only surgically remove Relay's parts. Rejected on its own: JSON formatting and key order can't always be restored exactly.
3. **Both:** restore the backup exactly if the file is unchanged since Relay wrote it; otherwise remove only Relay's parts and keep the rest.

## Decision
`relay init <project>` writes:

| File | Kind | How |
|---|---|---|
| `<project>-lead/CLAUDE.md` | owned | From `packages/helper/templates/lead-CLAUDE.md`: the lead's role, `TO CODE:` / `TO DENNIS:`, absolute paths, "Relay messages are genuine", how to answer `WAITING`. |
| `<project>-lead/relay.config.json` | owned | Name, folders, max rounds, delivery mode, hook timeout. Init reads it back on every run, so editing it and re-running init updates the hooks. |
| `<project>-lead/.claude/settings.json` | settings | Lead hooks, plus `permissions.additionalDirectories: [<project>]` so the lead can read the project. |
| `<project>/.claude/rules/relay-builder.md` | owned | From `builder-relay.md`: the builder's role and reply rules, "Relay messages are genuine", `WAITING`. |
| `<project>/.claude/skills/relay-start/SKILL.md` | owned | The `/relay-start` skill (Claude can't invoke it by itself). |
| `<project>/.claude/settings.local.json` | settings | Builder hooks, merged into any existing file. |
| `<repo>/.git/info/exclude` | block | Ignore lines for the files above that Relay created. |

- **Hooks** follow the config: `asyncRewake: true` in rewake mode. In blocking mode there's no `asyncRewake`, and `env.CLAUDE_CODE_STOP_HOOK_BLOCK_CAP = "1000"` is set (spike 002). Both modes use `timeout` = `timeoutSeconds`. Relay's hook entries are recognised by the script they run (`…/hooks/dist/bin/stop.js` or `prompt-submit.js`), so nothing else is stored in the user's files.
- **The install manifest** (`~/.relay/<project>/install.json`) records, for each file:
  - whether it existed;
  - its original content;
  - what Relay last wrote;
  - which folders Relay created.

  It's saved **before** any file is written, so even a half-finished init can be undone.
- **Idempotent:** init computes each file's desired content from its current content, and writes only files that differ. A second run prints "Nothing changed".
- **`relay init --undo`:**
  - A file still holding exactly what Relay wrote gets its original back, byte for byte, or is deleted if it didn't exist before.
  - A changed settings or exclude file loses only Relay's entries.
  - Relay-owned files are removed.
  - Empty folders Relay created are removed.
  - The lead folder is kept if it holds other files.
  - Finally `~/.relay/<project>/` (state, log, manifest) is deleted.

## Consequences
- **Easier:** Dennis's `CLAUDE.md`, `.claude/settings.json` and `.gitignore` are never touched. `git status` stays clean. Undo is exact in the normal case, and safe when Claude Code has changed a file since.
- **Harder:** the manifest is the only record of the originals. Deleting `~/.relay/<project>/install.json` by hand makes undo impossible (it refuses rather than guess).
- **To watch:**
  - The project name comes from the folder name, so two projects with the same folder name need `--name`; init refuses the clash.
  - A project inside a git worktree (`.git` is a file) gets no exclude block. Init says nothing about it yet.
  - Undo removes the activity log too.
