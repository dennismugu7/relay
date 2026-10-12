Paste everything below the line into Claude Code, opened in this folder.

---

You're the builder for a new project called Relay. Before doing anything:

1. Read `CLAUDE.md` (your standing rules), `docs/PROJECT_BRIEF.md`, `docs/research/claude-code-mechanics.md` and `docs/plans/stage-1.md`.
2. Run `claude --version`, `node --version`, `npm --version` and `git --version` and report them.
3. In 5–8 bullet points, tell me what Relay is and what Stage 1 delivers, in your own words, so I can check we understand it the same way.
4. List any questions or risks you see in the plan.

Then start **M0 — Repo foundation** from `docs/plans/stage-1.md`:
- `git init` if this isn't a repo yet, and make the first commit with the existing docs.
- Build M0, run lint, typecheck and tests, and commit in small steps.
- Write ADR 0001 and the first journal entry, and fill in `REPO_TOUR.md` and `GLOSSARY.md`.

Stop after M0. Report what you did, the test results, and anything under **Needs Dennis** (for example creating the GitHub repo). Don't start M1 until I say so.
