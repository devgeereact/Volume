# Volume

Volume is a local-first book production app. It takes a rough idea or a working title and turns it into a finished, KDP-ready book: research with real sources, title options, an approved blueprint, a fully written manuscript in the author's voice, editing passes, covers, and an upload pack with print PDF, Word, EPUB, plain text, covers, listing copy and a claims-to-verify report.

Each book belongs to an author profile (a pen name or a real person), with its own voice, bio, brand and model choices. All AI work goes through one OpenRouter account, and the owner picks the model for every job.

Owner: Gideon (Gakinz, London). Runs on the owner’s macOS or Linux computer. Built so other self-publishers can have accounts later.

## Status

GEE OS rebuild approved 7 October 2026, implemented in an isolated checkout. Release acceptance remains PARTIAL. Existing book-production functionality and data contracts are preserved while contracts, portable tooling and the application shell are migrated. macOS execution remains NOT TESTED until an actual Mac/CI run. The Linux PDF reference mismatch and existing live AI/publishing blockers remain visible in [known issues](KNOWN-ISSUES.md).

## Restore and run on macOS or Linux

```sh
mise trust mise.toml
mise install
mise exec -- npm run setup
mise exec -- npm run dev
```

Web: http://127.0.0.1:5180. API: http://127.0.0.1:5181. Ctrl+C stops this launcher's processes. No parent workspace script is required. See [setup](docs/07-operations/SETUP.md), [development](docs/07-operations/DEVELOPMENT.md), [documentation index](docs/README.md) and the [approved rebuild](docs/08-change-management/plans/GEE-OS-REBUILD.md).

## How to start

**As a person:** read this file, then `docs/00-foundation/PROJECT-CONTEXT.md` and `docs/01-product/PRODUCT-SPEC.md`. The active approved plan is `docs/08-change-management/plans/GEE-OS-REBUILD.md`. The earlier implementation plan is retained as history.

**As an AI assistant (Claude Code, Codex, Gemini CLI or any other):**

1. Read `AGENTS.md`. It holds every rule. `CLAUDE.md` and `GEMINI.md` only point to it.
2. Read `.agent/CURRENT-TASK.md` and the last entries of `.agent/HANDOFF.md`.
3. Read only the docs your task needs, using the index below.
4. At the end of the session, update `.agent/CURRENT-TASK.md`, append to `.agent/HANDOFF.md`, and record decisions in `docs/08-change-management/DECISIONS.md`.

## Run Volume

```bash
mise exec -- npm run doctor
mise exec -- npm run dev  # API 5181, web 5180, loopback only
```

Checks before you hand work on:

```bash
npm run typecheck     # every workspace
npm run lint          # ESLint, type-aware, whole repo
npm run format:check  # Prettier; npm run format rewrites the files
npm run test          # Vitest in every workspace
npm run test:coverage # measured core, AI, export and server thresholds
npm run e2e           # five browser scenarios, mock AI
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
| `apps/web/` | App screens and demo fallback data (Vite, React, Tailwind v4); moved from prototype/ on 5 October |
| `apps/server/` | Fastify API, job queue, SSE, SQLite, phase 1 onwards |
| `packages/core/` | Book model, Markdown parser, house style, checkers, KDP maths |
| `packages/ai/` | OpenRouter client, mock provider, model registry, prompt loader, guardrails |
| `packages/export/` | PDF, DOCX, EPUB, TXT, MD, covers, preflight, upload pack |
| `packages/ui/` | Design tokens and shared components |
| `design/directions/` | Original design boards; fused direction lives in design/final/ (D-014 remains proposed) |
| `assets/fonts/` | OFL fonts with their licence files |
| `tests/` | Unit, golden and end-to-end tests |
| `scripts/` | Portable setup, runtime checks, development launcher and documentation checks |
| `data/` | Database, project files, exports and backups (git-ignored, never read by AI) |

## Documentation index

| Doc | Covers |
|---|---|
| `docs/08-change-management/plans/GEE-OS-REBUILD.md` | The active approved rebuild plan |
| `docs/00-foundation/PROJECT-CONTEXT.md` | Problem, audience, principles, long-term direction, v1 scope |
| `docs/01-product/PRODUCT-SPEC.md` | Features per module, user stories, acceptance criteria, book structure |
| `docs/02-architecture/ARCHITECTURE.md` | Monorepo, request flow, jobs, SSE, OpenRouter, backups |
| `docs/02-architecture/DATA-MODEL.md` | Every table, column, relation and index |
| `docs/02-architecture/AI-PIPELINE.md` | The nine stages, schemas, models, guardrails, budgets |
| `docs/book-production/PROMPTS.md` | Prompt index |
| `docs/book-production/EXPORT-SPEC.md` | Book structure, manuscript dialect, every export, preflight, pack |
| `docs/book-production/KDP-RULES.md` | KDP facts and limits used by the app |
| `docs/03-design/DESIGN-SYSTEM.md` | Product feel, layout, accessibility, motion, states, UI copy |
| `docs/03-design/UX-SPEC.md` | Every screen and the main flows |
| `docs/05-security/SECURITY.md` | Threats, key handling, local binding, privacy |
| `docs/06-quality/TEST-STRATEGY.md` | Unit, golden, end-to-end, live AI and hook tests |
| `docs/01-product/ROADMAP.md` | Phases 0 to 8 with deliverables and acceptance |
| `docs/00-foundation/GLOSSARY.md` | Terms used across the project |
| `docs/08-change-management/DECISIONS.md` | Decision log |
| `CHANGELOG.md` | User-visible changes |
| `KNOWN-ISSUES.md` | Open questions and things to verify |
| `docs/07-operations/BACKUP-RECOVERY.md` | Actual backup retention, restore and rollback procedure |
| `qa/reports/LOCAL-VALIDATION-2026-10-06.md` | Automated checks, coverage and export evidence |
| `qa/reports/FREE-AI-VALIDATION-2026-10-06.md` | Free live tests and publishing application checks |
| `qa/reports/DOCUMENTATION-AUDIT-2026-10-06.md` | Documentation scope, corrections and remaining decisions |

## Owner decisions (4 October 2026)

- Local first on the owner’s macOS or Linux computer; multi-user ready for later accounts.
- Several author profiles and pen names, each with its own voice, bio and brand.
- Fully automatic writing in the first person from the profile, with guardrails: no invented ISBNs, statistics, studies, quotes, testimonials, awards or sources, and a claims-to-verify report.
- One AI account: OpenRouter, one key. The owner picks the model per job in Settings.
- Every book follows the full structure: front matter, body, back matter, publishing package, marketing package.
- KDP AI disclosure is set automatically when AI wrote the text or made the images.
- Volume mode (many books at once) comes later, with KDP's weekly title limit built in.
- The fused Volume direction is implemented; formal D-014 approval remains proposed.

The full log is in `docs/08-change-management/DECISIONS.md`.
