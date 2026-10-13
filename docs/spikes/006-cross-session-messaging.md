# 006 — Cross-session messaging between two native-Windows sessions

**Date:** 2026-10-13 · **Claude Code:** 2.1.296 · **OS:** Windows 11 (native, not WSL), Node 24.19 · **Model:** Haiku 5.5 (interactive) · **Code:** `spikes/006/` (git-ignored)

## Question
Claude Code sessions on the same machine can message each other with the `ListAgents` and `SendMessage` tools, and *"when the receiving session is idle, Claude Code starts a new turn with the message"* ([docs](https://code.claude.com/docs/en/cross-session-messaging)). Native Windows needs v2.1.234+.
1. Does it work between two native-Windows sessions? Does an idle session wake up on a message?
2. Over several rounds, with only instructions (no hooks), does Claude reliably forward every message? Could Relay rely on it?
3. Does sending need a permission prompt, which would stall an unattended run?

## What I tried
Two interactive sessions through the pty harness, each in its own sandbox folder, named with `--name`:
- **Test A:** sessions `spike-lead` and `spike-builder`. I typed into the lead: *"Use SendMessage to send this exact text to the session named spike-builder: TO CODE: Create a file named hello.txt containing exactly HELLO-FROM-LEAD, then reply to the sender with only: BUILDER-DONE"*.
- **Test B:** sessions `spike-lead2` and `spike-builder2`, each started with `--append-system-prompt` holding a Relay-style protocol, as a lead `CLAUDE.md` would (`spikes/006/lead-prompt.txt`, `builder-prompt.txt`). The lead had to get 5 files created, one per round, waiting for each report. Then I typed only `Start the task now.` and watched.
- **Test C:** a session in the **default (manual) permission mode** (`spike-default`). I messaged it from my own session and asked it to reply.

## What happened

### A. One round trip works, and idle sessions wake up
The builder was idle at its prompt. When the message arrived, it started a turn by itself:
```
› Message from @spike-lead: TO CODE: Create a file named hello.txt containing exactly HELLO-FROM-LEAD, then reply to the sender with only:
BUILDER-… (ctrl+o to expand)
● Write(hello.txt)
  ⎿  Wrote 1 line to hello.txt
      1 HELLO-FROM-LEAD
  ⎿  “Reply to spike-lead: hello.txt created” → uds:\\.\pipe\LOCAL\cc-msg-efe924366a93c909dd736205ec5bb434
  ⎿  Allowed by auto mode classifier
```
The lead, idle by then, woke up on the reply:
```
› Message from @spike-builder: BUILDER-DONE (ctrl+o to expand)
● spike-builder replied with BUILDER-DONE, so it says it finished the task.
```
`hello.txt` contained `HELLO-FROM-LEAD`. On Windows the inbox is a named pipe (`\\.\pipe\LOCAL\cc-msg-...`).

### B. Five rounds ran unattended in under a minute
All 5 steps ran, each with a report, ending in:
```
› Message from @spike-builder2: Step 5 done: created C:\Users\denni\relay-sandbox\006-lead\step5.txt containing exactly "5". ...
● TO DENNIS: all 5 steps done
```
The files contained `1 2 3 4 5`. But three things matter for Relay:
- **Claude writes the message itself; it doesn't forward its reply.** The protocol said "send that entire reply". Instead, the lead's visible reply was a status line (`TO CODE: Step 3 is confirmed done. Step 4 ... has been sent to spike-builder2`), and the real task went in a separately written `SendMessage`:
  ```
  SEND: {"to":"spike-builder2","summary":"Step 4: create step4.txt","message":"TO CODE: Step 4. Create a file named step4.txt in the working directory (C:\\Users\\denni\\relay-sandbox\\006-lead) containing exactly the text \"4\". ..."}
  ```
  So a Stop hook reading `last_assistant_message` would **not** see what was actually sent. The `TO CODE:` tag on the visible reply was there, but it labelled a status line, not the message.
- **The builder followed a wrong path from the lead.** The lead told it to work in *the lead's* folder, and the builder did. That's the lead's assumption, not the mechanism. A Relay lead `CLAUDE.md` must name the builder's project folder explicitly.
- Every round depended on Claude choosing to call `SendMessage`. Haiku did so 10 out of 10 times here, with a clear instruction. One short run with one model proves nothing about long runs, context compaction (see `docs/BACKLOG.md`) or a model that "forgets" once. If Claude doesn't send, nothing notices and the relay just stops.

### C. No permission prompt, even in manual mode
```
› Message from @relay-27: Relay spike test: please reply to this message ... with only the text: DEFAULT-MODE-REPLY
  ⎿  “Reply to relay spike test with requested text” → uds:\\.\pipe\LOCAL\cc-msg-af9aa3a58a8e0b2baafd48fe723420c6
● I sent DEFAULT-MODE-REPLY back to the relay session.
  ⏸ manual mode on · ? for shortcuts
```
`DEFAULT-MODE-REPLY` reached my session. Per the docs, messages are only **held for approval** when one side bypasses permissions and the other doesn't, so both Relay sessions should use the same permission-mode class.

### Not tested: posting into the inbox from a script
The docs say hooks and Bash commands get `CLAUDE_CODE_MESSAGING_SOCKET` and `CLAUDE_CODE_MESSAGING_TOKEN`, and that *"a script posting to its own session's socket"* opens with `{"type":"auth","token":"<token>"}` (required on native Windows). That could let a Relay hook inject a message into a session without Claude deciding anything. But **the message format after the auth line isn't documented**. Reverse-engineering an internal format would be building on guesses, so I didn't.

## Conclusion
- **Cross-session messaging works on native Windows.** Idle sessions wake on a message, replies come back, and there are no permission prompts within the same permission class.
- **Relay shouldn't rely on it as the only delivery path.** Delivery depends on Claude *choosing* to send, Claude rewrites the content, and a missed send fails silently. Relay's core promise ("every handoff happens, and is logged") needs a mechanism that runs as code every time, and hooks do.
- **Useful as a complement:** for example, a `notify_when_idle` subscription or a nudge to a session whose waiter died (spike 004). A `PreToolUse`/`PostToolUse` hook on `SendMessage` could log any messages Claude does send.
- **Worth a later spike:** the inbox socket's message format (if Anthropic documents it) and Channels (a research-preview way to push events into a session from an MCP server; needs `--channels` and Bun). Both noted in the backlog.
