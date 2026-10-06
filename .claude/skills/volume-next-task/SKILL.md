---
name: volume-next-task
description: Continue work on the Volume project from where the last session stopped. Use at the start of any Volume session, or when the owner says "continue", "next step", "carry on", "what's next" or "pick up where we left off". Reads .agent/CURRENT-TASK.md and the last HANDOFF.md entries, does one step, runs checks, updates CURRENT-TASK.md and appends to HANDOFF.md, and stops for owner review at phase gates.
---

# Volume: do the next task

One step per run. Evidence before claims. Stop at phase gates.

## 1. Find where the work is

1. Read `.agent/CURRENT-TASK.md` in full.
2. Read the last two or three entries of `.agent/HANDOFF.md` (newest at the bottom). Use `tail -n 60 .agent/HANDOFF.md` rather than the whole file once it grows.
3. Read `.agent/PROJECT.yml` for the phase and the review gate.
4. Read only the docs the next step needs (index in `AGENTS.md`, "Where things live"). Do not preload everything.

If CURRENT-TASK.md and HANDOFF.md disagree, or a doc contradicts the plan, stop and ask the owner which is right.

## 2. Pick the step

- Take the "Next step" from CURRENT-TASK.md. If it is blocked, say why and pick the first unblocked item from "In progress", or ask.
- If the step is large (several folders, a new dependency, a stack change), write a short plan and wait for the owner's OK (AGENTS.md working rule 1). The `volume-architect` subagent can draft it.
- Say in one line what you will do.

## 3. Do it

- Delegate work inside an owned folder to the matching subagent: `volume-frontend` (apps/web, packages/ui), `volume-backend` (apps/server), `volume-ai-prompts` (packages/ai, prompts/, config/models.defaults.json), `volume-export` (packages/export, config/book-templates), `volume-qa` (tests/). Use `volume-reviewer` for a read-only review.
- Smallest change that solves the problem. One concern per change.
- Never read `.env` or `data/`. Ask before installing packages, deleting files, network calls other than OpenRouter, or anything that costs money.

## 4. Check it

Run what applies and record each result as PASS, FAIL, PARTIAL, NOT TESTED or BLOCKED with the command:

- `npm run typecheck`
- `npm run lint`
- `npm run test` (or the workspace test for the area)
- `npm run hooks:test` if `.claude/` changed
- House style on changed prompts, docs, templates or UI copy: the `volume-house-style` skill

Never claim done without evidence. If a check cannot run yet (for example no workspaces exist in phase 0), mark it NOT TESTED and say why.

## 5. Record it

1. Update `.agent/CURRENT-TASK.md`: Phase, Status, Done, In progress, Next step, Blockers. Keep it short; it is a pointer, not a log.
2. Append one entry to the bottom of `.agent/HANDOFF.md`:

   ```
   ## YYYY-MM-DD, Claude Code (<model>)
   - What changed: <one or two lines>
   - Files: <list>
   - Checks: <command>: PASS | FAIL | NOT TESTED, ...
   - Next: <one line>
   ```
3. Decisions go to `DECISIONS.md` (ADR format, see `volume-architect`). User-visible changes go to `CHANGELOG.md`.

## 6. Stop at phase gates

If this step finishes the last item of a phase in `docs/12-ROADMAP.md`, do not start the next phase. Use the `volume-phase-gate` skill, send the owner the review message and wait.

## Done means

One step finished or clearly blocked, checks reported with evidence, CURRENT-TASK.md updated, HANDOFF.md appended.
