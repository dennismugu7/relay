# 001 — Can a Stop hook hand Claude a new instruction?

**Date:** 2026-10-13 · **Claude Code:** 2.1.296 · **OS:** Windows 11, Node 24.19 · **Code:** `spikes/001/` (git-ignored)

## Question
When Claude finishes a reply, can a Stop hook stop it from ending the turn and give it a message that Claude then treats as a **full new instruction**, like a `TO CODE:` prompt from the lead? And what exactly does the hook receive as input?

## What I tried
A Stop hook (`spikes/001/hook.cjs`, about 20 lines of Node) that:
1. Appends its stdin (the hook input JSON) to `inputs.jsonl`.
2. On the first Stop only, returns a message: `TO CODE: Create a file named banana.txt ... containing exactly the word BANANA. Then reply with exactly: DONE-BANANA`.
3. On the second Stop, returns nothing, so Claude may stop.

The hook is registered with `--settings spikes/001/settings.json`:
```json
{ "hooks": { "Stop": [ { "hooks": [ { "type": "command", "command": "node",
  "args": ["C:/Users/denni/projects/relay/spikes/001/hook.cjs"], "timeout": 60 } ] } ] } }
```
Two ways of returning the message were compared:
- **A:** `{"decision":"block","reason":"<message>"}`
- **B:** `{"hookSpecificOutput":{"hookEventName":"Stop","additionalContext":"<message>"}}`

Each was run headless (`claude -p "Say hello in one word." --permission-mode acceptEdits --output-format json`) and interactively in a pseudo-terminal (see "How the interactive runs work" below). Sessions ran in a clean folder outside the repo (`C:\Users\denni\relay-sandbox\...`), so Relay's own `CLAUDE.md` didn't affect them.

## What happened

**Both A and B work.** Claude wrote the file and replied with the exact text it was asked for.

Headless, variant A:
```
{ "result": "DONE-BANANA", "num_turns": 3, "is_error": false }
$ cat banana.txt
BANANA
```
Headless, variant B: `DONE-BANANA 2` (result, number of turns), and `banana.txt` contained `BANANA`.

**The hook input** (first Stop, variant A, real output):
```json
{"session_id":"6a9a666f-...","transcript_path":"C:\\Users\\denni\\.claude\\projects\\C--Users-denni-relay-sandbox-001\\6a9a666f-....jsonl",
 "cwd":"C:\\Users\\denni\\relay-sandbox\\001","prompt_id":"43eae640-...","permission_mode":"acceptEdits",
 "effort":{"level":"medium"},"hook_event_name":"Stop","stop_hook_active":false,
 "last_assistant_message":"Hello.","background_tasks":[],"session_crons":[]}
```
On the second Stop, `stop_hook_active` was `true` and `last_assistant_message` was `"DONE-BANANA"`.

**How Claude sees the message** (from the session transcript):
- A: as a user message, `"Stop hook feedback:\nTO CODE: Create a file named banana.txt ..."`, logged as a `hook_blocking_error`.
- B: as a `hook_additional_context` attachment, logged as `hook_success`.

**What the terminal shows** (interactive, real screen):
```
● Hello
● Ran 1 stop hook
  ⎿  Stop hook error: TO CODE: Create a file named banana.txt in the current directory containing exactly the word BANANA. Then
  reply with exactly: DONE-BANANA
● Write(banana.txt)
  ⎿  Wrote 1 line to banana.txt
● DONE-BANANA
```
With B, the same screen says `Stop hook feedback: TO CODE: ...` instead of `Stop hook error: ...`.

## Side findings
- **Hooks inherit the session's environment variables.** `SPIKE_MODE=ctx`, set when launching `claude`, reached the hook.
- **Sessions started from inside another Claude Code session inherit its `CLAUDE_*` variables.** The first interactive run showed `⚠ Transcript saving is off — inherited CLAUDE_CODE_CHILD_SESSION marker`. The spike harness now strips `CLAUDE*` variables. **For Relay:** the helper must never launch Claude sessions with these variables set, or they'd act as "child" sessions.
- **The repo's `"type": "module"` turns any `.js` file under `relay/` into an ES module**, so `require()` fails. Spike scripts use `.cjs`.
- **The docs describe a cap of 8 continuations in a row:** after 8 Stop-hook continuations without a tool call, Claude Code ends the turn anyway. This is tested in spike 002.

## Conclusion
- **Yes.** A Stop hook can hand Claude a new instruction, and Claude acts on it fully, tools included. This is the core of the baton approach.
- **`last_assistant_message` is present** and holds the final reply text, so the hook never needs to parse the transcript.
- **Prefer `additionalContext` (B) over `decision: "block"` (A) for Relay.** Both work the same, but A shows every handoff to Dennis as a red "Stop hook error", which is misleading for normal operation. Both forms count toward the same loop protections (see spike 002).

## How the interactive runs work
`spikes/_pty/pty.cjs` runs the real `claude.exe` inside a pseudo-terminal (`@lydell/node-pty`) and renders its screen with `@xterm/headless`. It writes the screen to `screen.txt` every second and logs every change to `screen.log` with a timestamp. Keys are sent by appending lines like `send:hello`, `enter` or `esc` to `cmd.txt`. This lets the builder run interactive spikes without Dennis at the keyboard.
