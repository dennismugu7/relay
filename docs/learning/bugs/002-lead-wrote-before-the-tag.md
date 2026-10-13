# 002 — The lead wrote a sentence before `TO CODE:`, and the run stopped after one round

**Date:** 2026-10-13 · **Area:** `packages/helper/templates/lead-CLAUDE.md` · **Severity:** high (silently ends a run)

## Symptom
In the first real M4 run (`relay init` on a fresh project, goal: three tasks), round 1 went fine. Then, instead of round 2, the activity log showed control going back to Dennis:
```
16:31:15  lead → builder   In the project folder `C:\Users\denni\relay-sandbox\m4-app`, create the file ...
16:31:20  builder → lead   Created `greet.js` in the project folder. Its contents: ...
16:31:24  lead → Dennis    The builder's report on task 1 checks out: `greet.js` returns `Hello, ${name}!`, ...
```
Nothing was delivered to the builder after that, and nothing on screen said why.

## How to reproduce
1. `relay init` a project with the M4 template as it was in commit `916170e`.
2. Give the lead a goal with several tasks, "reviewing each report before the next".
3. Watch `relay log`. Sometimes the lead opens with a review sentence and puts `TO CODE:` on a later line.

## Investigation
1. **Was it the hooks?** `relay log --full` showed the lead's whole reply:
   ```
   The builder's report on task 1 checks out: ... Moving on to task 2.

   TO CODE: In the project folder ..., create ...greet.test.js. ...
   ```
   So the lead *did* write a task. It just wasn't at the start.
2. **What does the parser do with that?** `parseTag` only accepts a tag at the very start of a reply (M2, `packages/core/src/tags.ts`). Its tests even say so: `does not count a tag later in the reply`. So the reply was untagged, which means "to Dennis". The hook did exactly what it was designed to do.
3. **Why did the lead do it?** The template said "Start every reply with exactly one tag" but also "review each report before you send the next task". The model reasonably wrote the review first. Nothing in the instructions said what happens if it does.

## Root cause
A gap in the instructions, not in the code. The lead template asked for two things, a review and a tag at the start, without saying how to combine them. It also didn't explain that text before the tag silently ends the run.

## The fix
`lead-CLAUDE.md` now says (commit `a0e1440`):
> The tag must be the very first thing in your reply, before any other words. Relay only reads a tag at the very start: a reply like "Looks good. TO CODE: ..." counts as having no tag, so it goes to Dennis and stops the run. Put any review of the last report inside your message, after the tag.

In the rerun, the lead put its review after the tag every time (`TO CODE: Review of task 1 is fine. ...`), and all three rounds passed.

I didn't change the parser. Accepting a tag anywhere in the reply would change the protocol Dennis accepted in M2, and would risk acting on a `TO CODE:` that's only quoted in a review. That's a decision for Dennis, noted in `docs/BACKLOG.md`.

## How it's guarded now
- `packages/helper/src/init.test.ts` checks that the lead's `CLAUDE.md` contains "The tag must be the very first thing in your reply".
- The real behaviour is model-dependent, so it can't be fully unit-tested. Spike 011's rerun is the evidence, and every future real run (M5) re-checks it.

## Lesson
When a strict rule in the code meets instructions for a language model, **state the rule and its consequence in the instructions**, with an example of the mistake. "Start with a tag" isn't enough if the model also wants to say something first. And a silent failure ("goes to Dennis") is easy to mistake for success, which is why `relay log --full` matters.
