> Historical approved plan. Preserved for provenance. Current architecture: ../../02-architecture/ARCHITECTURE.md. Current rebuild: GEE-OS-REBUILD.md. Historical stack/provider statements are not current instructions.

# Plan: Volume, a book production app (local first, multi-user ready)

This is the approved historical plan. Later recorded amendments, including Kysely replacing Drizzle and moving prototype/ into apps/web, are in docs/08-change-management/DECISIONS.md and the amendments below. Current implementation and acceptance are recorded in .agent/CURRENT-TASK.md and KNOWN-ISSUES.md.

## Context

The owner liked the P02 demo book ("Windowsill Herbs") and wants his own tool to produce finished books like it, with covers and images. He shared six drafts (nine related notes are saved in docs/source-drafts/) (BOOK.md "Volume" vision, Book Blueprint Architect Pro, Book Architect Pro, New Book Prompting blueprint template, BOOK CREATION title/script prompts, Children's Bedtime Story Writer). They describe one flow: idea or title, research, polished title, blueprint with summary, approval, full book, review, download. Today that flow lives in long prompts tied to one author (Harni Muharami). This plan turns it into a proper app with several author profiles and pen names, a real backend, and a finished export pack (Word, print PDF, EPUB, TXT, covers, KDP listing).

Owner decisions (4 October 2026):
- Runs on his Mac now; designed so other self-publishers can have accounts later.
- Several author profiles and pen names, each with its own voice, bio and brand.
- Writing mode: fully automatic (AI writes the whole book in first person from the profile), with guardrails below.
- One AI account: **OpenRouter** (one API key). The owner picks the model for each job in Settings from OpenRouter's live model list (Claude, Gemini, GPT, others). Defaults: a Claude model to write, a Gemini model with web search for research, a Gemini image model for covers. (Updated 4 October 2026; replaces separate Claude and Gemini keys.)
- Volume mode (many books at once) comes later, with KDP limits built in.
- Supersedes `~/.claude/plans/book-studio.md` (same app, now with the drafts folded in).

## What the drafts give the app (kept, polished)

- **Flow (Book Architect Pro):** rough idea or title, analysis, 5 refined topic directions, 10 title and subtitle options, blueprint, approve or change, chapter-by-chapter writing with live progress, review, download. Every stage can go back and regenerate.
- **Blueprint (New Book Prompting + templates):** title, subtitle, summary (200 to 500 words), target audience, unique selling points, tone notes, contents with optional Parts, chapters with 3 or more subheadings, 200 to 300 word chapter summaries, word targets, front matter (title page, copyright, dedication, acknowledgements, introduction, preface optional), back matter (conclusion, about the author, also by, review request), back cover blurb, Amazon description, 3 categories, 7 keywords.
- **House style (all drafts):** British English, no em dashes, flowing novel-like prose, first person, varied sentence length, contractions, banned AI phrases list, natural transitions, optional chapter key takeaways, chapter-to-chapter bridges. Stored per profile and per book template, not hard-coded.
- **Author profile (Harni block):** name, third-person bio, credentials, links, copyright and disclaimer templates. The year is filled automatically, not fixed at 2025.
- **Marketing (Rewrite Request):** TikTok scripts with hooks, saved per book, plus Instagram captions and launch email.
- **TXT export (Book Architect Pro spec):** clean UTF-8 file with `====` section separators, kept as one of the export formats.
- **Children's stories (Bedtime Story Writer):** the age range, new-word, gentle-conflict, "nothing scary" rules and scene-by-scene image prompts become the picture book template (later phase).
- **Volume vision (BOOK.md):** pen names, genre engines, specialist AI roles, pipeline stages, series and Volume mode. Kept as the long-term direction; v1 builds the core only.

## Dropped or fixed from the drafts

- **"Generate a realistic ISBN":** never. ISBN is a field the owner fills from Nielsen or KDP, or left empty.
- **"Readers never suspect AI":** the app writes in a natural human style, but KDP's AI-generated disclosure is set automatically for text and images (FACTS 5.5).
- **60 AI agents, microservices, marketplace, 2,500 pages of specs:** replaced by 9 pipeline stages in one Node server.
- **Invented statistics, studies, quotes, testimonials, awards:** blocked by the checker even in fully automatic mode. Medical, clinical, legal and safety statements go to a "claims to verify" report.
- **Copyright © 2025 hard-coded, "MSC in business" vs "MSc in Management and Leadership":** profile data has one source of truth, edited by the owner.

## The book structure every book follows (from the drafts, made complete)

Every book is stored as an ordered list of sections. Each section can be switched off or reordered, but the template ships complete:

1. **Front matter:** half title (optional); title page (title, subtitle, author, imprint); copyright page (© year and name, all rights reserved, reproduction notice, disclaimer, edition, ISBN only if the owner entered one, "stories are illustrative" line when chosen); dedication; epigraph (optional); contents (chapters with their subheadings, as in the drafts); foreword (optional, only from a real named person the owner adds); preface (optional); acknowledgements; introduction.
2. **Body:** optional Parts (Part I, Part II...), each with a title; chapters numbered and titled in title case; each chapter has an opening hook (quote, question or scene, consistent across the book), 3 or more subheadings in title case, flowing prose, optional "Key Takeaways" (3 to 5) and a bridge to the next chapter.
3. **Back matter:** conclusion or epilogue; appendix, resources, glossary and references (optional, references only from real sources); about the author (third person, the profile bio); also by (only published books under the pen name); a polite review request with no incentive; newsletter or social links.
4. **Publishing package (with every book):** back cover blurb and short author bio; Amazon description (up to 4,000 characters including HTML); 3 categories; 7 keywords; title and subtitle check (under 200 characters); KDP AI disclosure note; claims to verify report.
5. **Marketing package:** TikTok scripts with hooks, Instagram captions, a launch email.

Book templates set the defaults: non-fiction (as above, 10 chapters, 25,000 to 50,000 words), fiction (no takeaways, scene breaks, chapters without subheadings), workbook (exercises and fill-in pages), picture book (spreads, a new word, gentle conflict, nothing scary).

## Guardrails for fully automatic writing

- Each profile has a "real person" flag. For real people, a default "stories are illustrative" line is offered for the copyright page (owner can switch it off).
- The claims report lists every medical, clinical, legal, safety or statistical statement with its chapter, for the owner to verify, soften or remove before export. Preflight warns while any stay open.
- About the author is the profile bio word for word; "Also by" lists only books marked Published under that pen name.
- Every AI change is a new version that can be compared and rolled back.

## Architecture

- **Location:** `~/Projects/volume` (outside Google Drive). Data in `data/` (SQLite and files), backed up nightly.
- **Stack:** npm workspaces monorepo, TypeScript strict.
  - `apps/web`: Vite, React, React Router, Tailwind v4, motion/react, TanStack Query, TipTap (free extensions).
  - `apps/server`: Node 26, Fastify, zod, bound to 127.0.0.1, serves API, SSE progress stream and the built web app.
  - `packages/core`: book model (sections and blocks), Markdown parser ported from `PROOF/p02-book/tools/book.py`, house-style rules, deterministic checkers, KDP maths (spine, wrap, royalties, printing cost).
  - `packages/ai`: one OpenRouter client (OpenAI SDK with OpenRouter base URL) plus a mock provider for tests, model registry filled from OpenRouter's model list with prices and per-stage defaults and fallbacks, prompts as versioned files (`prompts/<stage>/<name>.v1.md`) adapted from P02 BOK-01 to BOK-25 and the drafts, context packer, guardrails.
  - `packages/export`: print PDF (Paged.js in Playwright Chromium, pdf-lib metadata), DOCX (`docx` package, ported from `build_docx.py`), EPUB 3, TXT, Markdown, covers (Playwright plus sharp), preflight, zip pack.
- **Database:** SQLite with Drizzle and migrations; every row has `workspace_id`; an auth stub now, real sessions later. IDs are ULIDs.
- **Jobs:** SQLite-backed queue in the same process, retries with backoff, one child job per chapter, resumes after a restart, budget cap per book.
- **AI through OpenRouter only** (checked on openrouter.ai/docs, 4 October 2026):
  - One key, `OPENROUTER_API_KEY`, in server `.env` only; a test checks the web bundle holds no keys. Optional `HTTP-Referer` and `X-OpenRouter-Title` headers name the app.
  - Text: `POST https://openrouter.ai/api/v1/chat/completions` through the official OpenAI SDK with `baseURL` set to OpenRouter (streaming, structured JSON output where the chosen model supports it, usage and cost per call).
  - Research: the chosen model with OpenRouter's web search (`:online` suffix or the `web` plugin; native search for Anthropic, Google and OpenAI models, Exa for others). Sources come only from the `url_citation` annotations, never from text the model types.
  - Images: `POST /api/v1/images` (base64 results, aspect ratio and resolution options, no charge on failure). Default `google/gemini-2.5-flash-image`; the title text on covers is always set by the app.
  - Model picker: `GET /api/v1/models` fills a list per job (research, titles, blueprint, writing, editing, checks, metadata, cover, marketing), with price per million tokens shown. Choices are saved per workspace, per profile and per book, so a pen name can use a different writer. Defaults (verify slugs before phase 2): a top Claude model for blueprint, a mid Claude model for writing and editing, a small fast model for checks, a Gemini model with web search for research.
  - Fallbacks: if a chosen model is unavailable or rate-limited, retry, then offer the next model in the stage's fallback list; never switch silently.
- **KDP rules:** `config/kdp-rules/2026-10-03.json` built from `PROOF/p02-book/FACTS.md` (royalties 10.1, 3.1; printing 3.3; bleed 3.7; spine 3.9, 3.10; eBook cover 10.5; listing limits 5.1 to 5.5; title limit 5.7; go-live 10.15), each with fact ID, date and source, and a re-check reminder after 90 days.
- **Fonts:** OFL fonts from `AI-STARTER-LIBRARY/_engine/fonts` plus serif book fonts (Literata, EB Garamond, Source Serif 4) with their OFL files.

## Project structure (`~/Projects/volume`)

```
volume/
  AGENTS.md  CLAUDE.md  GEMINI.md  README.md  docs/08-change-management/DECISIONS.md  CHANGELOG.md  KNOWN-ISSUES.md
  package.json (npm workspaces)  tsconfig.base.json  .gitignore  .env.example  .editorconfig  .nvmrc
  .agent/            PROJECT.yml  CURRENT-TASK.md  HANDOFF.md        (where the work is, for any AI)
  .claude/           settings.json  agents/  skills/  hooks/          (Claude Code tooling)
  docs/              00-VISION ... 12-ROADMAP, GLOSSARY, source-drafts/ (owner's six drafts, verbatim)
  config/            kdp-rules/  models.defaults.json  house-style.json  book-templates/
  prompts/           research/ titles/ blueprint/ writing/ checks/ editing/ matter/ cover/ marketing/ children/
  apps/
    web/             Vite, React, TypeScript, Tailwind v4 (the app screens)
    server/          Node, Fastify, zod (API, jobs, SSE, files)
  packages/
    core/            book model, Markdown parser, house style, checkers, KDP maths, shared zod schemas
    ai/              OpenRouter client, model registry, prompt loader, context packer, guardrails
    export/          PDF, DOCX, EPUB, TXT, MD, covers, preflight, upload pack
    ui/              design tokens and shared components (from the design guide)
  prototype/         clickable demo of every screen with mock data (phase 0)
  assets/fonts/      OFL fonts with licence files
  tests/             unit, golden files, end-to-end
  scripts/           dev helpers (seed, backup, verify-env)
  data/              (git-ignored) SQLite database, projects, exports, backups
```

Standards: TypeScript strict, ESLint and Prettier, Vitest and Playwright, conventional commits, one owner per folder when several agents work at once, every decision in docs/08-change-management/DECISIONS.md, every change in CHANGELOG.md, `.agent/CURRENT-TASK.md` updated at the end of every session.

## Pipeline stages (the app's "AI team", each with its own model choice through OpenRouter)

1. **Researcher** (default: Gemini with web search): idea and profile in; audience, angles, competing themes, keyword ideas and real cited sources out.
2. **Title strategist** (default: mid Claude): 5 directions and 10 title and subtitle options, checked under 200 characters, British English.
3. **Blueprint architect** (default: top Claude): full blueprint as structured data, any part regenerated on its own, owner approves.
4. **Chapter writer** (default: mid Claude, streamed): writes each chapter from voice, blueprint, earlier chapter summaries and a "used already" ledger so examples do not repeat.
5. **Checkers** (code plus a small fast model): em dashes, US spellings, banned phrases, word count, repetition, consistency, claims to verify; automatic fixes, then one rewrite, then "needs attention".
6. **Editor passes** (default: mid Claude): structure, line edit in British English, voice; accepted edits feed the profile's memory.
7. **Matter and metadata writer** (default: mid Claude): front and back matter, Amazon description, 7 keywords, 3 categories.
8. **Cover director** (default: mid Claude, then Gemini image): brief, 3 to 4 concepts, pick, typography added by the app.
9. **Marketing writer** (default: mid Claude): TikTok scripts with hooks, Instagram captions, launch email.

## Main screens

Library (books by pen name and status), Profiles and pen names, New book wizard (profile, book type, idea or title), Research, Titles, Blueprint, Writing (live progress and preview), Editor (chapters, versions, suggestions, find and replace), Cover studio, Export (preflight, calculator, pack download), Marketing, Settings (keys check, budgets, defaults).

## Phases (owner review after each)

1. **Foundation, no AI:** repo, database, profiles and pen names, projects and library, editor with versions, Markdown import, exports (PDF, DOCX, EPUB, TXT, MD), KDP rules and calculator. Done when the Windowsill Herbs manuscript imports and exports match the Python build.
2. **Research, titles, blueprint:** providers, cost meter, research with clickable sources, title picker, blueprint editor. Done when a live run gives 3 or more working sources, 10 valid titles and a complete approved blueprint.
3. **Automatic writing:** chapter jobs, live preview, checkers, claims report, editor passes, selection rewrite. Done when a 3-chapter test book completes with zero em dashes and banned phrases, chapters within 15% of target, and resumes after a restart.
4. **Covers and images:** Gemini concepts, typography, eBook JPEG 1600 x 2560, paperback wrap PDF with spine. Done when wrap sizes match KDP's cover calculator for 3 page counts on white and cream.
5. **Publishing pack and marketing:** full preflight, zip pack, metadata sheet, AI disclosure note, claims report, TikTok archive. Done when the owner uploads one pack to a KDP draft and it is accepted (manual check).
6. **Fiction and workbook templates.**
7. **Picture books** (Bedtime Story rules, spreads, full colour, interior bleed).
8. **Volume mode and accounts:** batch books across pen names with a scheduler that refuses a third new title per format per week, quality gates, real logins.

## Verification

- Vitest: parser round trip, spine and wrap sizes, royalty and printing cost (FACTS worked examples), checkers over the full banned list and spelling map, queue retry and resume.
- Golden files: TXT and MD exact; DOCX normalised XML; PDF page count, size, embedded fonts and text via pdfjs-dist, plus a pixel comparison of 4 pages; EPUBCheck when Java is present.
- Playwright end to end with the mock AI provider: profile, new book, research, blueprint, writing, cover, export pack.
- One budgeted live run per AI phase (`LIVE_AI=1`), cost recorded.
- Owner review gate at the end of every phase, as with the library products.

## Risks

- Fully automatic first-person stories under a real person's name can mislead readers and touch patient confidentiality (healthcare topics); handled by the real-person flag, the claims report and the owner's final say.
- KDP AI and quality rules at volume; handled by disclosure always on, quality gates and the weekly title limit.
- API changes (model IDs, grounding and image APIs); handled by the registry config and a docs check before phases 2 and 4.
- Paged.js speed on long books; fallback PDF engine ported from `build_pdf.py`.
- SQLite driver on Node 26; `node:sqlite` fallback decided in phase 1.

## Reused files

- `AI-STARTER-LIBRARY/PROOF/p02-book/tools/book.py`, `build_pdf.py`, `build_docx.py`, `build_cover.py`, `verify.py` (ported to TypeScript).
- `AI-STARTER-LIBRARY/A-BUILD-AND-PUBLISH/P02-ai-book-kdp-toolkit/product.md` (prompt templates BOK-01 to BOK-25).
- `AI-STARTER-LIBRARY/PROOF/p02-book/FACTS.md` (KDP rules config).
- `AI-STARTER-LIBRARY/_engine/fonts` (OFL fonts).
- The six owner drafts (flow, blueprint template, house style, Harni profile, TXT format, children's story rules).

## Phase 0 (this approval): project workspace, rules, agents, design guide and demo

Owner request (4 October 2026): save the plan and create the whole project workspace (file structure, agents, skills, hooks, rules, design guide, look and feel) plus a demo website, so any AI (Claude Code, Codex, Gemini CLI) can see where the work is and continue. No production features yet.

### 0a. Workspace and cross-AI rules (`~/Projects/volume`, `git init`, no commit until asked)

- `AGENTS.md` (single rule source for every AI, under 120 lines), `CLAUDE.md` (`@AGENTS.md` plus Claude notes), `GEMINI.md` (points to AGENTS.md). GEE OS adoption: `.agent/PROJECT.yml`, `.agent/CURRENT-TASK.md` (where the work is, next step), `.agent/HANDOFF.md` (dated log any AI appends to).
- `README.md`, `.gitignore` (data/, .env, node_modules, dist), `.env.example` (key names only), `package.json` (npm workspaces), empty `apps/web`, `apps/server`, `packages/core|ai|export` with a README each saying what goes there and in which phase.
- `docs/`: 00-VISION, 01-PRD (features, phases, acceptance), 02-ARCHITECTURE, 03-DATA-MODEL, 04-AI-PIPELINE (9 stages, models, guardrails), 05-PROMPTS (index), 06-EXPORT-SPEC (PDF, DOCX, EPUB, TXT, covers, pack, preflight), 07-KDP-RULES, 08-DESIGN-GUIDE, 09-UX-FLOWS (every screen and flow), 10-SECURITY-PRIVACY, 11-TESTING, 12-ROADMAP, GLOSSARY; `docs/08-change-management/DECISIONS.md` (ADR log starting with this plan's decisions), `CHANGELOG.md`, `docs/KNOWN-ISSUES.md`.
- `docs/source-drafts/`: the owner's six drafts saved verbatim, marked as source material, not rules.

### 0b. Config and prompt library

- `config/kdp-rules/2026-10-03.json` (from FACTS.md with fact IDs), `config/models.defaults.json` (OpenRouter slugs per stage with fallbacks, to verify against `GET /api/v1/models` before phase 2), `config/house-style.json` (banned phrases from all drafts, US to UK spelling seed, em dash rule), `config/book-templates/` (nonfiction, fiction, workbook, picture-book: sections, word targets, rules).
- `prompts/<stage>/<name>.v1.md` for the 9 stages plus the children's story template, each with front matter (id, version, model tier, inputs, output schema, derived_from) and guardrails. Built from the drafts and P02 BOK-01 to BOK-25.

### 0c. AI tooling for the project

- `.claude/agents/`: volume-architect (plans and reviews structure), volume-frontend, volume-backend, volume-ai-prompts, volume-export, volume-reviewer (code review against AGENTS.md), volume-qa (tests and screenshots). Each with scope, owned folders and done criteria.
- `.claude/skills/`: volume-next-task (read CURRENT-TASK, do one step, update handoff), volume-house-style (check book text), volume-design-system (UI rules), volume-kdp-rules (use the config, never memory), volume-phase-gate (end-of-phase checks and owner review message).
- `.claude/settings.json` hooks with scripts in `.claude/hooks/`: block reading or writing `.env` and `data/`; warn on em dashes and banned phrases in prompts and docs; remind to update `.agent/CURRENT-TASK.md` and `HANDOFF.md` at session end. Scripts are small, tested and fail open with a message, never silently.
- Codex and Gemini CLI read the same AGENTS.md; their equivalents of agents and skills are described there as plain instructions.

### 0d. Design guide and demo website

- Following the huashu-design rule for a new visual identity: three quick direction boards (static HTML screenshots of the Library and Blueprint screens), one built from the palette in the owner's drafts (deep navy, rich gold, warm cream), two alternatives. **Stop for the owner to pick.**
- Then `docs/03-design/DESIGN-SYSTEM.md` (tokens, type, spacing, components, motion, states, accessibility, do and don't) and a clickable demo in `prototype/` (Vite, React, TypeScript, Tailwind, mock data: a Harni book and Windowsill Herbs) covering every main screen: Library, Profiles, New book wizard, Research, Titles, Blueprint, Writing progress, Editor, Cover studio, Export, Marketing, Settings. Its components become the start of `apps/web` in phase 1.
- Checked with Playwright screenshots at 1440 and 390 wide, no console errors, keyboard navigation.

### How it is built

Parallel agents with fixed file ownership (docs; config and prompts; agents, skills and hooks; design directions), then the prototype after the owner picks a direction. Memory and the old plan file updated to point here.

## Still needed from the owner before phase 2

- One OpenRouter API key (openrouter.ai/keys), added to `.env` by the owner, with a spending limit set on the OpenRouter account.
- The first profiles to load (for example Harni Muharami's corrected bio and credentials).
## Round 2 (owner feedback, 4 October 2026): polish, then make it real

Owner reviewed the prototype ("brilliant work") and asked for:
- Blueprint: less empty space. Editor: cards and canvas fill the editing area, not half the screen.
- User-friendly UI, clean professional navigation, forward and back on every step, a place in the navigation for Published books, no duplicates (one search, one stepper, one New book).
- Editor: the author can type anywhere, or write a note, and the AI turns it into content ("weave in").
- Fix every defect found (audit list: model slugs, cancel icon, cover clipping, dev rule ids shown, over-target words with no warning, mock placeholders, stage track showing the book stage not the page, and more).
- Five solid profiles: Gideon Akinlotan (AI and digital side hustles, tech how-to, business and personal growth, faith and life), Harni Muharami (polished), plus three pen names for Romance, Children's, and Thriller and mystery, each with defaults that produce publishable books.
- Every book looks different (own interior theme and cover style), readable and within KDP guidance.
- Many book types grouped by category (fiction genres, children's, non-fiction kinds, workbooks and journals), not four.
- cPanel: all work saved in the owner's cPanel MySQL database and pulled when needed; the app runs on the Mac (print PDFs need the browser engine). Owner adds the OpenRouter key to .env.
- Pace: keep going phase by phase, report progress, stop only when blocked.

Decisions for round 2:
- Data layer: Kysely (one query builder, two dialects): SQLite for local development and tests, MySQL for the owner's cPanel database (Remote MySQL, IP allow-listed, TLS if offered). Files (covers, exports, images) stored in the database as chunked BLOBs so everything lives on cPanel. Supersedes "SQLite with Drizzle" (D-005-ish); recorded as a new decision.
- Single sources of truth in config/: profiles/*.json (5 profiles), book-types catalogue (about 30 types in 4 categories), interior-themes (about 12 themes, KDP readable), cover styles. Prototype and server both read them.
- OFL display fonts for covers and interiors approved by the owner's request for distinct book styles (Fontsource, licences recorded).

Build order (parallel where folders do not overlap):
1. Config and navigation foundation (config/profiles, book types, themes; prototype shell, nav, stepper, Published, de-duplication).
2. In parallel: apps/server (Fastify, Kysely, migrations, blob store, API, jobs, SSE); packages/core and packages/export (manuscript model and parser, checkers, KDP maths, DOCX, PDF, EPUB, TXT, MD with Windowsill Herbs golden test); packages/ai (OpenRouter client, prompt loader, nine stages, mock provider).
3. Screen polish (Blueprint spacing, Editor full width and weave-in, defect list).
4. Wire the web app to the server (real profiles, books, blueprint, writing jobs, editor saves, exports, covers), move prototype to apps/web.
5. Live checks once the OpenRouter key is in .env (budgeted run) and cPanel MySQL once the owner gives host details.
