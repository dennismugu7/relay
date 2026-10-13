# 002 — The 8-continuation cap on Stop hooks

**Date:** 2026-10-13 · **Claude Code:** 2.1.296 · **OS:** Windows 11, Node 24.19 · **Model:** Haiku 5.5 (headless) · **Code:** `spikes/002/` (git-ignored)

## Question
The hooks docs say: *"after stop hooks have continued the turn eight times in a row, Claude Code overrides the next block and ends the turn. The count of consecutive continuations resets each time Claude calls a tool. To raise the cap, set `CLAUDE_CODE_STOP_HOOK_BLOCK_CAP`."*

In the baton design, every round continues the lead's turn once (the builder's report comes back as a hook continuation). A lead that only reads reports and writes `TO CODE:` replies, **without calling any tool**, would be cut off after 8 rounds. Is that true? Does a tool call reset the count? Can Relay raise the cap?

## What I tried
A Stop hook (`spikes/002/hook.cjs`) that always continues the turn with `additionalContext` ("Round N: reply with only: RN"), until a limit (`SPIKE_LIMIT`). With `SPIKE_TOOL=1`, each round also asks Claude to run `echo roundN` first, which is a tool call. Every Stop is logged with its round number and `stop_hook_active`. Run headless:
```
claude -p "Reply with only: R0" --model haiku --permission-mode bypassPermissions \
  --settings spikes/002/settings.json --output-format json
```

## What happened

**A: default cap, no tool calls.** The turn was forced to end after 8 continuations:
```
result: "R8" turns: 1
stop #1 stop_hook_active=false last="R0"
stop #2 stop_hook_active=true last="R1"
...
stop #8 stop_hook_active=true last="R7"
stop #9 stop_hook_active=true last="R8"
```
On stop #9 the hook asked for round 9 again, but Claude Code ignored it and ended the turn. No error was reported (`EXIT=0`, `is_error` false).

**B: default cap, a tool call every round (limit 12).** All 12 rounds ran:
```
result: "R12" turns: 13
stop #13 stop_hook_active=true last="R12"
```

**C: `CLAUDE_CODE_STOP_HOOK_BLOCK_CAP=50` as an environment variable, no tool calls (limit 12).** All 12 rounds ran: `result: "R12" turns: 1`.

**D: the same cap set in the settings file's `env` block, no tool calls (limit 12).** All 12 rounds ran: `result: "R12" turns: 1`.
```json
{ "env": { "CLAUDE_CODE_STOP_HOOK_BLOCK_CAP": "50" }, "hooks": { "Stop": [ ... ] } }
```

Also seen: `stop_hook_active` is `true` on every Stop after the first continuation, so it says "we're in a hook loop", not "how many times". It can't serve as a round counter.

## Conclusion
- **The cap is real and silent.** A lead that never calls a tool gets its turn ended after 8 baton rounds, with no error. With the baton, that would look like Relay stalling for no reason.
- **Any tool call resets the count.** In practice the builder always calls tools, and a reviewing lead usually does (reading files). Relay can't rely on that, though.
- **Relay can raise the cap itself.** `relay init` can write `"env": { "CLAUDE_CODE_STOP_HOOK_BLOCK_CAP": "<n>" }` into each session's `.claude/settings.json`, with no change to how Dennis starts Claude. A sensible value is a bit above Relay's own max rounds (default 20), so Relay's limit always triggers first and is logged properly.
- **This confirms the plan's rule** to keep Relay's own round counter in a state file rather than relying on `stop_hook_active`.
