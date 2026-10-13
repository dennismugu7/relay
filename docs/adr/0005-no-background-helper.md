# 0005 — No background Relay Helper in Stage 1

**Date:** 2026-10-13 · **Status:** accepted

## Context
The brief and the stage plan describe a **Relay Helper**: a background process on the PC that "holds the baton per project, keeps an append-only activity log, enforces Pause, Stop, a max-rounds limit, and later sends phone notifications". `relay start` was meant to start it.

That plan predates the spikes. With ADR 0002 and M3, the hooks already do all of it:
- **Hold the baton:** each session's Stop hook queues messages in `state.json`, and that session's waiter delivers them.
- **Log activity:** the hooks append to `activity.jsonl`.
- **Pause, Stop, max rounds:** the hooks read the flags and the counter from `state.json` before every handoff and every delivery.
- **Recover from a dead waiter:** a waiter that dies leaves its message queued. The session's next Stop starts a new waiter that delivers it (spike 004).

Spike 010 ran three rounds in two real sessions with no Helper process at all.

## Options considered
1. **Build the Helper anyway**, as a long-running process started by `relay start`.
   - Pros: matches the original plan; a natural home for Stage 2 phone alerts.
   - Cons: nothing in Stage 1 needs it; it would duplicate rules the hooks already enforce; and it's one more thing that can crash, needs starting after a reboot, and has to be tested on Windows.
2. **No background process.** The `relay` CLI only reads and changes the state file, the same way the hooks do.
   - Pros: nothing to keep running; Relay works the moment `relay init` is done; every command is a short-lived process that's easy to test.
   - Cons: nobody notices a dead waiter until someone runs `relay status`. Stage 2's alerts will need *something* to send them.

## Decision
**Option 2.** Stage 1 has no background process. The package keeps its name, `packages/helper`, but it holds the `relay` CLI and the `init` templates.

**What `relay start` does:** it makes a project ready for a run.
- It clears the `stopped` and `paused` flags and resets the round counter.
- It logs a `started` entry.
- It prints the two steps that begin a run: run `/relay-start` in the builder, then give the lead a goal.

`relay init` leaves a new project ready, so `start` is mostly for after `relay stop`.

`relay status` checks whether each recorded waiter's PID is still alive and its deadline hasn't passed. That's how a dead waiter shows up.

## Consequences
- **Easier:** nothing to start after a reboot or to crash in the background; fewer moving parts to explain and test.
- **Harder:** nothing watches the run by itself. A dead waiter is only noticed by `relay status`, or when a handoff doesn't arrive.
- **To watch:** Stage 2 (phone alerts) needs a sender. The simplest version may still need no daemon: the Stop hook can send the alert itself when it logs `to-dennis` or `max-rounds`. Decide that in Stage 2's own ADR. The brief's "Relay Helper" wording is updated to point here.
