# Backlog

Ideas and side issues noticed while working. Not part of the current milestone. One line each: date, idea, where it came from.

- 2026-10-12 — Move to TypeScript 7 once typescript-eslint supports it (M0, see ADR 0001).
- 2026-10-13 — Context growth: long runs may compact the lead's context and weaken the tagging protocol. Consider re-injecting the protocol via a hook. (M0 review, Dennis)
- 2026-10-13 — Spike Channels (MCP server pushing events into a session, research preview, needs `--channels` + Bun) as a delivery path. (M1, spike 006)
- 2026-10-13 — If Anthropic documents the inbox socket message format, spike a hook posting directly into a session's inbox. (M1, spike 006)
- 2026-10-13 — Manually check "ctrl+x ctrl+s to send now" during a waiting Stop hook; the pty harness couldn't send it. (M1, spike 003)
