# Claude Code mechanics Relay depends on

Researched 2026-10-12 from the official docs. **Verify each "To test" item with a spike before building on it.** Docs change; re-check the linked pages.

| # | Topic | What the docs say | Status |
|---|---|---|---|
| 1 | Stop hook input | All hooks get `session_id`, `transcript_path`, `cwd`, `hook_event_name`. Stop also offers `last_assistant_message` — use it instead of parsing the transcript, which is written asynchronously and whose format is internal. [hooks](https://code.claude.com/docs/en/hooks#common-input-fields) | Partly — read the Stop section yourself |
| 2 | Making Claude continue | Stop hook can output `{"decision":"block","reason":"..."}` (or exit code 2 with stderr) to prevent stopping; the conversation continues so Claude can act on the reason. `hookSpecificOutput.additionalContext` also exists. [decision control](https://code.claude.com/docs/en/hooks#decision-control) | To test: does Claude treat `reason` as a full new instruction? Loop guard: do not rely on `stop_hook_active` until tested; keep our own state file |
| 3 | Timeouts | Command hooks default to 600 s. `timeout` is in seconds; no maximum documented. On timeout the hook is cancelled and output discarded. [timeouts](https://code.claude.com/docs/en/hooks#timeouts) | To test: is `timeout: 3600` honoured? |
| 4 | Esc during a waiting hook | Not documented for Stop. | To test |
| 5 | Windows | Settings precedence: managed › `--settings` › `.claude/settings.local.json` › `.claude/settings.json` › `~/.claude/settings.json`. Hook shell defaults to bash, or PowerShell when Git Bash is absent. Exec form (`command` + `args`) needs a real `.exe` — `node` works. Use `${CLAUDE_PROJECT_DIR}`. [settings](https://code.claude.com/docs/en/settings), [command hook fields](https://code.claude.com/docs/en/hooks#command-hook-fields) | Confirmed |
| 6 | `/relay-start` | Define as a skill in `.claude/skills/relay-start/SKILL.md` (older `.claude/commands/*.md` still works). [skills](https://code.claude.com/docs/en/skills) | Confirmed |
| 7 | Other hooks | `SessionStart` can inject `additionalContext`. `UserPromptSubmit` can block or add context but not replace the prompt. `Notification` has no decision control. [hooks](https://code.claude.com/docs/en/hooks) | Confirmed |
| 8 | Remote Control | `claude --rc` / `/rc` connects the local session to the Claude app; session keeps running on the PC; needs claude.ai login. [remote-control](https://code.claude.com/docs/en/remote-control) | To test: do hooks fire for turns started from the phone? |
| 9 | Headless resume | `claude -p --resume <id>` works, but resuming a session that's open in another terminal interleaves both into one transcript. Headless runs still fire project hooks. [headless](https://code.claude.com/docs/en/headless), [sessions](https://code.claude.com/docs/en/sessions) | Fallback only; avoid touching a session that's open interactively |
| 10 | CLAUDE.md loading | Parent-folder `CLAUDE.md` files load at launch; subfolders on demand. `--add-dir` / `permissions.additionalDirectories` grants access to other folders without loading their `CLAUDE.md`. [memory](https://code.claude.com/docs/en/memory) | Confirmed — why the lead folder sits next to the project |
| 11 | Built-in cross-session messaging | Sessions on the same machine can message each other with `ListAgents` / `SendMessage`; an idle session starts a new turn when a message arrives. Native Windows needs v2.1.234+. Claude decides when to send, so it is not guaranteed for every reply. [cross-session messaging](https://code.claude.com/docs/en/cross-session-messaging) | Evaluate in a spike as an alternative or complement to the baton |

## Spikes to run first (Stage 1)
1. Stop hook that blocks with a `reason` — does Claude continue and act on it as an instruction?
2. A Stop hook that waits 15 minutes with `timeout: 3600` — honoured? What does the terminal show? Does Esc interrupt it?
3. Same two tests with the session driven from the phone via Remote Control.
4. Cross-session messaging between two native-Windows sessions — does an idle session wake up on a message? Could Relay rely on it?
5. Record `claude --version` in every spike.
