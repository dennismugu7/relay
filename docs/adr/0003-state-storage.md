# 0003 — State storage: a JSON file per project, guarded by a lock file and written atomically

**Date:** 2026-10-13 · **Status:** accepted

## Context
ADR 0002 gives Relay shared state that several processes read and change:
- the message queue;
- one waiter record per session (session ID, PID, start, deadline);
- each session's busy/idle flag and re-arm marker;
- the round counter;
- the paused and stopped flags.

The writers are the lead's hooks, the builder's hooks and the `relay` CLI. They are separate processes and can run at the same moment. For example, the builder's Stop hook queues a report while the lead's old waiter checks the queue. Every handoff also has to be logged.

Two things can go wrong:
- **A torn file.** A process dies halfway through writing, or a reader reads a half-written file. The state is then broken JSON.
- **A lost update.** Two processes both read the old state, each changes it, and the second write silently undoes the first. A queued message vanishes, or a waiter record is overwritten.

It must work on Windows 11 and Linux (CI), and stay simple enough for Dennis to read and debug by hand.

## Options considered
1. **One JSON file, a lock file, and atomic writes (temp file + rename).**
   - Pros: no dependencies; the state is a readable file Dennis can open; each piece is small enough to explain.
   - Cons: we write the lock ourselves. A lock left by a crashed process has to be recognised as stale, which is done by age.
2. **SQLite** (built into Node 22 as `node:sqlite`, or via a package).
   - Pros: real transactions; no lost updates by design.
   - Cons: `node:sqlite` is still marked experimental in Node 22, and native packages add install steps on Windows; the state is no longer a file you can just read; much more than a few small fields need.
3. **A lock library** such as `proper-lockfile`.
   - Pros: well tested, handles stale locks.
   - Cons: a dependency for about 60 lines of code; hides exactly the concepts this repo is meant to teach.
4. **No lock, only atomic writes.**
   - Pros: simplest.
   - Cons: prevents torn files but not lost updates, which is the more likely failure here.
5. **Let only the Relay Helper write the state**, with hooks sending it requests.
   - Pros: a single writer means no races.
   - Cons: every hook then depends on a running helper process; if the helper is down, nothing works. Possible later, but not needed to be correct.

## Decision
**Option 1.**
- Each project has a folder `%USERPROFILE%\.relay\<project>\` holding `state.json` and `activity.jsonl` (`packages/core/src/paths.ts`). The project name is validated so it can't point outside that folder.
- **Every change** to `state.json` goes through `updateState(dir, change)`. It takes the lock, reads the state, applies the change, writes it atomically, then releases the lock (`state.ts`).
- **The lock** is a file created with the `wx` flag, which fails if the file exists (`lock.ts`). It holds a unique token, so a process only deletes a lock that is still its own. A lock older than 10 s is treated as left by a crashed process and removed; normal updates hold it for milliseconds. Waiting gives up after 15 s with an error naming the holder.
- **Atomic writes** go to a temporary file in the same folder, which is then renamed over `state.json` (`atomic.ts`). Renames that fail briefly with `EPERM`/`EBUSY`/`EACCES` are retried, because on Windows an antivirus scanner or a reader can hold the file open for a moment.
- **Reads** (`readState`) don't take the lock. Thanks to the rename, a reader always sees a whole file.
- **`activity.jsonl`** is append-only, one JSON object per line. Each append takes its own lock (`activity.lock`), so lines from different processes never mix. A line that can't be parsed, such as one cut short by a crash, is skipped when reading.

## Consequences
- **Easier:** no lost or torn updates between hooks and the CLI, shown by a test where two processes each update the state 50 times at once. Dennis can open `state.json` and read it. No native dependencies.
- **Harder:** callers must use `updateState` for every change; writing `state.json` directly would bypass the lock. The `change` function is synchronous on purpose, so nobody holds the lock while waiting on something slow.
- **To watch:**
  - Stale-lock removal by age has a small race: two processes could both judge the same lock stale. It only matters after a crash in the middle of an update, which takes milliseconds, so we accept it.
  - A clock change of more than 10 s could make a live lock look stale. Also accepted.
  - We don't call `fsync`, so a power cut right after a write could lose the last change. Acceptable for Relay's state; revisit if it ever matters.
