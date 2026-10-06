---
name: volume-phase-gate
description: Close a Volume phase and prepare the owner review. Use when the last item of a phase in docs/12-ROADMAP.md is done, when the owner asks "is phase N done", "ready for review" or "phase gate", or before starting the next phase. Checks every acceptance item with evidence, updates CHANGELOG.md, DECISIONS.md and the .agent files, writes the owner review message, then stops and waits.
---

# Volume phase gate

The owner reviews at the end of every phase (`.agent/PROJECT.yml`, `review_gate`). No work on the next phase starts until the owner says yes.

## 1. Collect the acceptance list

1. Read the phase in `docs/12-ROADMAP.md` (acceptance criteria) and `docs/01-PRD.md` for the features it promised. `docs/PLAN.md` "Phases" has the one-line "Done when" for each phase.
2. Copy every criterion into a checklist. Do not merge or soften them.

## 2. Gather evidence for each item

For each criterion, run the check that proves it and record the command, the result and where the evidence lives:

- `npm run typecheck`, `npm run lint`, `npm run test`, the e2e suite with the mock AI provider, `npm run hooks:test`.
- Golden and export checks for export phases; preflight output for the sample book.
- Screenshots at 1440 and 390 for UI phases (paths under `test-results/screens/`).
- For AI phases, the one budgeted live run (`LIVE_AI=1`, owner's OK) with its cost.
- House style on new prompts, templates and UI copy (`volume-house-style` skill).
- A `volume-reviewer` pass over the phase's changes, with no open critical or high findings.

Mark each criterion PASS, FAIL, PARTIAL, NOT TESTED or BLOCKED. Anything not PASS is listed with the reason and what would close it. The `volume-qa` subagent can run the test steps.

## 3. Update the records

- `CHANGELOG.md`: a section for the phase with the user-visible changes.
- `DECISIONS.md`: every decision made in the phase has an ADR; mark superseded ones.
- `KNOWN-ISSUES.md`: anything left open.
- `.agent/CURRENT-TASK.md`: Status "awaiting owner review of phase N", next step "owner review", blockers.
- `.agent/HANDOFF.md`: append the gate entry with the evidence summary.
- `.agent/PROJECT.yml`: leave `phase` unchanged until the owner approves.

## 4. Send the owner review message

Plain British English, no em dashes, short. Template:

```
Phase N (<name>) is ready for your review.

What you can try:
- <how to run or open it, one line each>

Acceptance:
- <criterion>: PASS (<evidence: command or file>)
- <criterion>: PARTIAL (<what is missing>)

Not tested: <list and why, or none>
Known issues: <top three, or none>
Decisions for you: <questions that need a yes or no>

Reply "approve phase N" to start phase N+1, or tell me what to change.
```

## 5. Stop

Do not start the next phase, change `PROJECT.yml` or commit until the owner replies. Commits happen only when the owner asks.
