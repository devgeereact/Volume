# 12 Roadmap

Nine phases, 0 to 8. Each ends with an **owner review gate**: the owner sees the result, tries it, and says go or fix before the next phase starts. No phase starts on top of an unreviewed one. Acceptance lines for phases 1 to 5 are taken from the approved plan.

## Current checkpoint, 6 October 2026

Implementation is at phase 5 with local corrections verified, not a completed v1 release gate. Free titles and blueprint pass, full free writing failed, sampled Word layouts pass, Kindle/KDP acceptance is outstanding and cPanel is deferred by the owner. Later phases 6 to 8 remain outside this pass. See KNOWN-ISSUES.md and the local/free validation reports for current evidence. Deliverables and acceptance below remain the approved targets, not a claim that every gate passed.

## Phase 0: workspace, rules, agents, design guide and demo

- **Deliverables:** workspace and git repo (no commits until asked); `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, `.agent/` files; all docs in `docs/`, `docs/08-change-management/DECISIONS.md`, `CHANGELOG.md`, `KNOWN-ISSUES.md`; `config/` (KDP rules, model defaults, house style, book templates); `prompts/` v1 for all stages; `.claude/` agents, skills and hooks with tests; three design direction boards; after the owner's pick, the full design guide and a clickable prototype of every main screen with mock data (a Harni book and Windowsill Herbs).
- **Acceptance:** any AI can read `AGENTS.md` and `.agent/CURRENT-TASK.md` and know the next step; hooks pass `npm run hooks:test`; the prototype covers Library, Profiles, New book wizard, Research, Titles, Blueprint, Writing, Editor, Cover studio, Export, Marketing and Settings; Playwright screenshots at 1440 and 390 wide; no console errors; keyboard navigation works.
- **Owner gate:** pick a design direction (mid-phase), then review the prototype.

## Phase 1: foundation, no AI

- **Deliverables:** `apps/server` (Fastify, Kysely migrations for every table in `docs/02-architecture/DATA-MODEL.md`, auth stub, repositories, job queue, SSE, backups); `apps/web` shell from the prototype; profiles and pen names; library and archive; projects with template sections; editor with versions, compare, restore, find and replace; Markdown import; exports PDF (Paged.js), DOCX, EPUB, TXT, MD; KDP rules loader and calculator; serif book fonts with OFL files; SQLite driver decision.
- **Acceptance:** the Windowsill Herbs manuscript imports and its exports match the Python build (page count, trim, embedded fonts, text); TXT and MD golden files exact; calculator matches the FACTS worked examples.
- **Owner gate:** import his own sample, export all formats, open them in Word, Kindle Previewer and a PDF reader.

## Phase 2: research, titles, blueprint

- **Deliverables:** `packages/ai` (OpenRouter client, mock provider, registry from `GET /api/v1/models`, prompt loader, context packer, guardrails), Settings (key check, model picker with prices, budgets), cost meter, research with clickable sources, title picker, blueprint editor with part regeneration and approval.
- **Before starting:** re-verify OpenRouter endpoints, headers, web search and model slugs; the owner adds his key and sets a spending limit on OpenRouter.
- **Acceptance:** a live run gives 3 or more working sources, 10 valid titles and a complete approved blueprint; cost recorded.
- **Owner gate:** run one real idea from his own list end to end to an approved blueprint.

## Phase 3: automatic writing

- **Deliverables:** write-book and write-section jobs, live preview over SSE, summarise and ledger, checker gate, claims report, editor passes (structure, line, voice), selection rewrite, profile memory from accepted edits, matter and metadata stage.
- **Acceptance:** a 3-chapter test book completes with zero em dashes and banned phrases, chapters within 15% of target, and resumes after a restart.
- **Owner gate:** reads the 3-chapter book and the claims report; judges voice against the profile samples.

## Phase 4: covers and images

- **Deliverables:** cover brief, Gemini image concepts through OpenRouter, app-set typography, eBook JPEG 1600 x 2560, paperback wrap PDF with spine.
- **Before starting:** re-verify the images endpoint and default image model.
- **Acceptance:** wrap sizes match KDP's cover calculator for 3 page counts on white and cream.
- **Owner gate:** picks a cover for a real book and checks it in KDP's previewer.

## Phase 5: publishing pack and marketing

- **Deliverables:** full preflight, zip pack, metadata sheet, AI disclosure note, claims report export, TikTok scripts, Instagram captions, launch email, marketing archive.
- **Acceptance:** the owner uploads one pack to a KDP draft and it is accepted (manual check).
- **Owner gate:** this is the v1 release decision.

## Phase 6: fiction and workbook templates

- **Deliverables:** fiction template (no takeaways, scene breaks, chapters without subheadings, character and setting notes in the ledger); workbook template (`::: exercise`, `::: lines N`, fill-in pages); template-specific checks and prompts.
- **Acceptance:** one short book per template from idea to pack with the mock provider and one live run each; preflight passes; golden files for the new blocks.
- **Owner gate:** reviews one book of each.

## Phase 7: picture books

- **Deliverables:** picture book template from the Bedtime Story Writer rules (age range, one new word, gentle conflict, nothing scary), spreads, scene-by-scene image prompts, full-colour interior with bleed (FACTS 3.7), consistent character look across images.
- **Acceptance:** a 24-page picture book exports with correct bleed size; every spread has an image and text within the safe area; disclosure covers images.
- **Owner gate:** reads the book against the Bedtime Story rules and checks a printed proof.

## Phase 8: Volume mode and accounts

- **Deliverables:** batch planning across pen names; a scheduler that refuses a third new title per format per week (FACTS 5.7: 2 per format each week); quality gates (no batch book skips preflight or claims review); real logins, sessions and roles; per-account OpenRouter keys if hosted.
- **Acceptance:** a batch of 5 books across 3 pen names runs with the scheduler blocking the third weekly title; workspace isolation tests pass; login, logout and role checks pass.
- **Owner gate:** decides whether to offer accounts to other self-publishers.

## Later (not scheduled)

Series management, business dashboard (royalties and launches), genre engines, world building and characters from BOOK.md, hardcover wraps (FACTS 3.11), other platforms (IngramSpark, Draft2Digital, Kobo, Apple, Google; FACTS 7.x).
