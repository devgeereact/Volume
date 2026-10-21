# Clean production follow-ups implementation plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the five items left open by the clean production work of 21 October 2026, each only after the owner's answer.

**Architecture:** Two small code changes (the Volume mode quality gate and, if chosen, the clean-handbook folio default) and three owner-led data tasks on the live site (test books, publish dates, one manuscript edit). Code changes ship as their own PRs; data changes are done in the app by the owner or, with the owner's word, by the agent through the owner's signed-in browser.

**Tech Stack:** TypeScript, Vitest, config JSON, the live Volume app.

**Spec:** the owner's goal of 21 October 2026 and `.agent/HANDOFF.md` (21 October 2026 entries).

---

## Chunk 1: Decisions to ask the owner (no code until answered)

- [ ] Page numbers in the clean-handbook design: keep quiet centred numbers (current) or match the handbook's bare pages.
- [ ] Volume mode batch gate: count only claims that need a check (as preflight now does), or keep failing on any open claim.
- [ ] The three test books ("Calm on the Night Shift", "Your First Website with AI", "Handover That Holds"): keep, archive or delete.
- [ ] Real publish dates for Harni's 17 books (today's date was used on import).
- [ ] "The Honest Truth About Nurses": chapter 8 repeats about eight paragraphs from the end of chapter 7; the contents list named chapter 8 "The Bonds We Build" while the text says "The Healer's Heart". Which is right?

## Chunk 2: Volume mode gate counts only needs-check claims (if the owner says yes)

### Task 1: Gate uses claimNeedsCheck

**Files:**
- Modify: `apps/server/src/jobs/quality-gate.ts:19` (filter `openClaims` with `claimNeedsCheck` from `@volume/core`)
- Test: `apps/server/test/claims-tier.test.ts`

- [ ] **Step 1: Write the failing test** `quality gate passes a batch book whose only open claims are for the record`: file one open claim with `location.risk: 'low', harmIfWrong: false` and category `medical`, call the gate, expect no `claims.open` block.
- [ ] **Step 2: Run** `npm run test -w apps/server -- claims-tier`. Expected: FAIL.
- [ ] **Step 3: Implement** `openClaims.filter(claimNeedsCheck)` in the gate; keep the message `${n} claims still need checking.`
- [ ] **Step 4: Run** the same command. Expected: PASS. Then `npm run typecheck`, `npm run lint`.
- [ ] **Step 5: Commit** `fix(gate): Volume mode counts only claims that need a check`, PR, deploy with `npm run deploy -- --no-ci-check`.

## Chunk 3: Clean-handbook folios (only if the owner wants bare pages)

### Task 2: Folios off by default in clean-handbook

**Files:**
- Modify: `config/interior-themes.json:1183-1186` (`"enabled": false`)
- Test: `packages/export/test/clean-handbook.test.ts` (the folio assertion flips to none)

- [ ] **Step 1:** Change the assertion to expect no page number on a body page. Run `npm run test -w packages/export -- clean-handbook`. Expected: FAIL.
- [ ] **Step 2:** Set `folios.enabled` to false. Run again. Expected: PASS.
- [ ] **Step 3: Commit** `feat(theme): clean-handbook pages without numbers`, PR, deploy.

## Chunk 4: Owner data tasks on the live site

- [ ] Test books: archive or delete as the owner says (Library, book menu). Delete only on the owner's explicit word.
- [ ] Publish dates: for each of Harni's 17 books, Published shelf, Set date (or `POST /books/:id/publish` with `publishedAt` through the owner's session).
- [ ] The Honest Truth About Nurses: owner edits chapter 8 in the Editor (remove the repeat, set the title); Versions keeps the old text.
- [ ] Record each step in `.agent/HANDOFF.md` and `CHANGELOG.md` where user-visible.
