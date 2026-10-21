# Clean production implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A freshly written book needs only unavoidable fixes, reads and looks like Harni Muharami's NHS Boundary Handbook, exports a Pages file for final retouching, and Harni's 16 past books sit on her pen name.

**Architecture:** Three independent workstreams merged into `main` one concern at a time. (1) Pipeline: narrower claims checker, cleaner writing prompts (new versions only), voice samples wired into the writer, summaries that fit short pages and a retry before a missing-step flag. (2) Export: a `clean-handbook` interior theme matching the handbook, and a Mac `npm run pages` command plus an opt-in local pack step that adds a `.pages` file. (3) Catalogue: a DOCX importer script that turns Harni's Pages books into Volume Markdown, then a live import under her pen name with writing samples.

**Tech Stack:** TypeScript strict, Fastify, Kysely, Vitest, Playwright, Paged.js, docx, JSZip, osascript with Apple Pages (`com.apple.Pages`, Mac only).

**Spec:** the owner's goal of 21 October 2026 (chat), the style spec at `../reports/volume/2026-10-21-harni-style-spec.md` (copied from the session scratchpad), and three research reports summarised in `.agent/HANDOFF.md` (21 October 2026).

## Global Constraints

- Prompts are files; a change is a new version file `prompts/<stage>/<name>.v<N>.md`. Never edit an existing version. The loader picks the highest version.
- No live AI calls in tests (mock provider only). No package installs. No `.env` or `data/` reads.
- British English, no em dashes, none of the banned words in AGENTS.md, in prompts, docs and UI copy.
- KDP numbers only from `config/kdp-rules/`.
- Every task: `npm run typecheck`, `npm run lint`, the relevant Vitest suite; the merge gate is the full `npm run deploy -- --no-ci-check` check run.
- Fonts must be SIL OFL files already in the repo (Graphik is commercial and is not used; use the closest bundled sans, Libre Franklin).

## Review Focus

1. A real medical, legal or financial statement in a chapter must still be filed as a claim after the checker is narrowed (test in Task 1).
2. A sentence fixed by claim-fix must not be filed again on the next check, even though its text changed (test in Task 1).
3. A book whose profile has no writing samples must write exactly as before (test in Task 3).
4. `npm run pages` must refuse cleanly on a machine without Pages and never quit a Pages session the owner already had open (test in Task 5).
5. The importer must not invent sections or lose a chapter when a book uses unusual style names (e.g. The 30 Days uses Heading/Subheading) (test in Task 6).

---

### Task 1: Narrow the claims checker and stop re-filing fixed sentences

**Files:**
- Create: `prompts/checks/claims.v5.md` (copy of v4 with a "Do not list" block, "date or measurement stated as a fact about the world", "instruction" narrowed to steps where a mistake could cause physical, financial, legal or data harm, product mentions only when a fact about the product is stated)
- Modify: `apps/server/src/adapters/openrouter-ai.ts` (claims mapping near line 1248: drop items with `risk: "low"` and `harmIfWrong: false`; pass `suggestion` through as `suggestedSoftening`)
- Modify: `apps/server/src/jobs/handlers/writing.ts` (near line 545: no model claims for kinds `review_request`, `also_by`, `how_to_use`; glossary keeps claims only for categories medical and legal)
- Modify: `apps/server/src/repos/manuscript.ts` (`addClaims`: also skip a sentence equal to a settled claim's replacement text; store the replacement on resolve as `resolvedSentence`; migration not allowed, so keep it in the existing `ownerNote`/`location` JSON: `location.replacement`)
- Fixtures: `packages/ai/test/fixtures/checks/` for the v5 prompt id if the mock needs one
- Test: `apps/server/test/claims-autosave.test.ts`

**Interfaces:** Produces `claims.v5` prompt id `checks.claims` version 5.

- [ ] Write failing tests: (a) a low-risk, harmless item from the mock is not filed; (b) a medical item is filed; (c) after `/claims/:id/apply` with new text, `addClaims` with that new text files nothing; (d) no claims filed for a `review_request` section.
- [ ] Run, see them fail. Implement. Run server Vitest, see them pass. Commit `fix(claims): file only claims that could cause harm if wrong`.

### Task 2: Cleaner writing prompts (v7) with the humanizer rules and Harni-proof defaults

**Files:**
- Create: `prompts/writing/chapter.v7.md`, `introduction.v7.md`, `conclusion.v7.md`, `back-matter.v7.md`, `extend-section.v5.md`, `prompts/checks/summarise-and-ledger.v6.md`
- Modify: `apps/server/src/config/book-structure.ts` (render `genreRules.mustHaves` and `avoid` as a plain-text `bookTypeRules` variable) and the variable plumbing in `apps/server/src/adapters/openrouter-ai.ts`
- Modify: `config/book-types.json` ai-tech-howto must-have to "Name only tools that appear in the research sources"
- Modify: `docs/book-production/PROMPTS.md` (index the new versions)
- Test: `packages/ai/test/` prompt-render test for `{{bookTypeRules}}`; server `writing` tests still pass

Rules every v7 writing prompt adds (exact wording, from the research and humanizer):
- "Example prompts and templates the reader copies are written fully filled in with a realistic, clearly invented detail, never square-bracket placeholders."
- "Illustrations use 'you' or a generic description such as 'a small food brand'; never invent a brand, company, product or named case-study person with a backstory."
- "Every list item has text. Prefer prose; use a list only for real steps."
- "Never write 'guarantee' in any form; say what the reader can expect."
- "No statistics, percentages, 'studies show' or 'research suggests' unless the research sources give them, cited with [[Sn]]."
<!-- house-style:off -->
- Humanizer block: no "not X but Y" contrasts except once at a section opening; no one-line closers that repeat the point; no forced threes; no em or en dashes; none of: delve, crucial, pivotal, landscape, testament, showcase, underscore, vibrant, robust, seamless, tapestry, journey; no staged openers ("Let's dive in"); use is, are, has; vary sentence length (mean 18 to 21 words).
<!-- house-style:on -->
- summarise-and-ledger v6: front and back matter may have a 1 to 3 sentence summary and 0 to 6 key points.
- Retry: in `writing.ts` summary and checks steps, retry once with the stage's next fallback before raising `summary_missing` or `checks_missing`.

- [ ] Write failing tests (render contains the new rules and `bookTypeRules`; summary of a glossary with 1 sentence is accepted; a summary step that fails once then succeeds raises no flag). Implement. Pass. Commit `feat(prompts): cleaner first drafts (writing v7, summaries v6)`.

### Task 3: Writing samples reach the writer

**Files:** `apps/server/src/jobs/book-data.ts` (`profileSummary` loads up to two `sounds_like` or `writing_sample` samples, each cut to its first 600 words at a paragraph end), `apps/server/src/adapters/openrouter-ai.ts` (`profileInput` maps them to `voiceDna.soundsLike`), test in `apps/server/test/`.

- [ ] Failing test: a profile with two samples sends both (trimmed) as `soundsLike`; a profile with none sends none. Implement. Pass. Commit `feat(voice): send the pen name's writing samples to the writer`.

### Task 4: `clean-handbook` interior theme

**Files:** `config/interior-themes.json` (new theme `clean-handbook`: 6x9, Libre Franklin body 11.5/16 pt, block paragraphs with one line space, no indent, ragged right, no hyphenation, margins 0.78 in, opener `number` with "CHAPTER N" in navy #10315B and title in black caps, chapter starts after a blank page allowed (not recto-only), sections start on a new page, no running heads, quiet centred folios, no drop caps, no ornaments), `packages/export/src/print-html.ts` and `docx.ts` only where a theme token is not yet honoured (section page break, folio-only footer), `config/book-types.json` (no change of defaults), test `packages/export/test/`.

- [ ] Failing test: rendering the mini book with `clean-handbook` gives HTML with `page-break-before` on h2 sections, the navy chapter label and no running head content. Implement. Pass. Commit `feat(export): clean-handbook interior theme`.

### Task 5: Pages export

**Files:** create `scripts/pages-convert.mjs` and root script `"pages": "node scripts/pages-convert.mjs"`; modify `packages/export/src/pack.ts` (`PackFiles.pages?: Buffer`, written as `manuscript/<slug>.pages`; README line), `apps/server/src/adapters/volume-export.ts` (`buildPack` adds it only when `process.platform === 'darwin'` and `VOLUME_PAGES=1`), docs `docs/07-operations/DEPLOYMENT.md` and `README.md`.

- `npm run pages -- <pack.zip|folder>`: finds `manuscript/*.docx`, runs osascript (`open`, `save d in POSIX file "<out>.pages"`, `close d saving no`), adds the `.pages` beside it or into the zip. Times out at 90 s. Never quits Pages. Exits with a plain message on a non-Mac or when Pages is missing.

- [ ] Failing tests: pack with `pages` contains `manuscript/<slug>.pages` and the README names it; without it the README tells the reader how to make one. Implement. Manual run on this Mac against a built pack. Commit `feat(export): Pages file for final retouching`.

### Task 6: Import Harni's Pages books

**Files:** create `scripts/pages-docx-to-md.mjs` (DOCX to Volume Markdown by paragraph style: Chapter Number + Chapter/Chapter 2 to `#` chapter, Title 2/Sub Title/Subheading to `##`, Body/Body 2/Default to paragraphs, Dedication and ABOUT AUTHOR to their sections, Table of Content dropped, KDP metadata tails such as "Amazon Categories" dropped), test `tests/` or `scripts/` with a tiny DOCX fixture built in the test.

- [ ] Failing test on a generated fixture DOCX. Implement. Run on the 16 exported DOCX files in the scratchpad; check every book's chapter count against its PDF contents. Commit `feat(scripts): import Pages books as Volume Markdown`.
- [ ] Live (owner-requested): import the 16 books under Harni Muharami with `POST /books/import-manuscript`, mark each published, and add two `writing_sample` samples (one Boundary Handbook section and one Triage Mindset section, about 1,600 words each). Record ids in the handoff.

### Task 7: Ship

- [ ] Merge each task's branch with its own PR, run `npm run deploy -- --no-ci-check`, check the live site, update CHANGELOG, DECISIONS (D-055 claims scope and clean-handbook), CURRENT-TASK and HANDOFF.
