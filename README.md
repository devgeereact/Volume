# Volume

Volume is a local-first book production app. It takes a rough idea or a working title and turns it into a finished, KDP-ready book: research with real sources, title options, an approved blueprint, a fully written manuscript in the author's voice, editing passes, covers, and an upload pack with print PDF, Word, EPUB, plain text, covers, listing copy and a claims-to-verify report.

Each book belongs to an author profile (a pen name or a real person), with its own voice, bio, brand and model choices. All AI work goes through one OpenRouter account, and the owner picks the model for every job.

Owner: Gideon (Gakinz, London). Runs on the owner's Mac. Built so other self-publishers can have accounts later.

## Status

**Phase 0: workspace, rules, agents, design guide and demo.** Started 4 October 2026.

- Done: workspace, plan, rules for every AI, source drafts, KDP facts, fonts, specification docs.
- Waiting on: the owner's pick of one of three design directions in `design/directions/`.
- Then: the full design guide and the clickable prototype.
- No production code yet. No OpenRouter key is needed until phase 2.

See `.agent/CURRENT-TASK.md` for the live status and `docs/12-ROADMAP.md` for every phase.

## How to start

**As a person:** read this file, then `docs/00-VISION.md` and `docs/01-PRD.md`. The approved plan is `docs/PLAN.md`.

**As an AI assistant (Claude Code, Codex, Gemini CLI or any other):**

1. Read `AGENTS.md`. It holds every rule. `CLAUDE.md` and `GEMINI.md` only point to it.
2. Read `.agent/CURRENT-TASK.md` and the last entries of `.agent/HANDOFF.md`.
3. Read only the docs your task needs, using the index below.
4. At the end of the session, update `.agent/CURRENT-TASK.md`, append to `.agent/HANDOFF.md`, and record decisions in `DECISIONS.md`.

## Run Volume

```bash
nvm use            # Node 26, from .nvmrc
npm install
npm run dev        # server on 127.0.0.1:5181, app on http://127.0.0.1:5180
```

Checks before you hand work on:

```bash
npm run typecheck     # every workspace (tsc 7)
npm run lint          # ESLint, type-aware, whole repo
npm run format:check  # Prettier; npm run format rewrites the files
npm run test          # Vitest in every workspace
npm run e2e           # one full book in the browser, mock AI
```

Settings live in `.env` at the root (template in `.env.example`). With no OpenRouter key the app uses the mock AI and spends nothing. The web app falls back to its built-in demo data when the server is not running.

## Folder map

| Folder | What lives there |
|---|---|
| `.agent/` | Project card, current task and handoff log, for any AI |
| `.claude/` | Claude Code agents, skills and hooks |
| `docs/` | Specifications (index below), the plan, KDP facts, owner's source drafts |
| `config/` | KDP rules, model defaults, house style, book templates |
| `prompts/` | Versioned prompt files, one folder per pipeline stage |
| `apps/web/` | The app screens (Vite, React, Tailwind v4), phase 1 onwards |
| `apps/server/` | Fastify API, job queue, SSE, SQLite, phase 1 onwards |
| `packages/core/` | Book model, Markdown parser, house style, checkers, KDP maths |
| `packages/ai/` | OpenRouter client, mock provider, model registry, prompt loader, guardrails |
| `packages/export/` | PDF, DOCX, EPUB, TXT, MD, covers, preflight, upload pack |
| `packages/ui/` | Design tokens and shared components |
| `apps/web/` | The app screens (moved from `prototype/` on 5 October 2026); demo data in `src/data/` is the fallback when the server is off |
| `design/directions/` | Three design direction boards for the owner to choose from |
| `assets/fonts/` | OFL fonts with their licence files |
| `tests/` | Unit, golden and end-to-end tests |
| `scripts/` | Seed, backup and environment check helpers |
| `data/` | Database, project files, exports and backups (git-ignored, never read by AI) |

## Documentation index

| Doc | Covers |
|---|---|
| `docs/PLAN.md` | The approved plan (source of truth) |
| `docs/00-VISION.md` | Problem, audience, principles, long-term direction, v1 scope |
| `docs/01-PRD.md` | Features per module, user stories, acceptance criteria, book structure |
| `docs/02-ARCHITECTURE.md` | Monorepo, request flow, jobs, SSE, OpenRouter, backups |
| `docs/03-DATA-MODEL.md` | Every table, column, relation and index |
| `docs/04-AI-PIPELINE.md` | The nine stages, schemas, models, guardrails, budgets |
| `docs/05-PROMPTS.md` | Prompt index |
| `docs/06-EXPORT-SPEC.md` | Book structure, manuscript dialect, every export, preflight, pack |
| `docs/07-KDP-RULES.md` | KDP facts and limits used by the app |
| `docs/08-DESIGN-GUIDE.md` | Product feel, layout, accessibility, motion, states, UI copy |
| `docs/09-UX-FLOWS.md` | Every screen and the main flows |
| `docs/10-SECURITY-PRIVACY.md` | Threats, key handling, local binding, privacy |
| `docs/11-TESTING.md` | Unit, golden, end-to-end, live AI and hook tests |
| `docs/12-ROADMAP.md` | Phases 0 to 8 with deliverables and acceptance |
| `docs/GLOSSARY.md` | Terms used across the project |
| `DECISIONS.md` | Decision log |
| `CHANGELOG.md` | User-visible changes |
| `KNOWN-ISSUES.md` | Open questions and things to verify |

## Owner decisions (4 October 2026)

- Local first on the owner's Mac; multi-user ready for later accounts.
- Several author profiles and pen names, each with its own voice, bio and brand.
- Fully automatic writing in the first person from the profile, with guardrails: no invented ISBNs, statistics, studies, quotes, testimonials, awards or sources, and a claims-to-verify report.
- One AI account: OpenRouter, one key. The owner picks the model per job in Settings.
- Every book follows the full structure: front matter, body, back matter, publishing package, marketing package.
- KDP AI disclosure is set automatically when AI wrote the text or made the images.
- Volume mode (many books at once) comes later, with KDP's weekly title limit built in.
- The design direction is still to be chosen.

The full log is in `DECISIONS.md`.
