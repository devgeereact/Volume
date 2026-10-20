# Volume

Volume is a book production app. It takes a rough idea or a working title and turns it into a finished, KDP-ready book: research with real sources, title options, an approved blueprint, a fully written manuscript in the author's voice, editing passes, covers, and an upload pack with print PDF, Word, EPUB, plain text, covers, listing copy and a claims-to-verify report.

Each book belongs to an author profile (a pen name or a real person), with its own voice, bio, brand and model choices. All AI work goes through one OpenRouter account, and the owner picks the model for every job.

Owner: Gideon (Gakinz, London). Hosted for the owner at https://volume.gakinz.com (cPanel, Passenger, MariaDB, Clerk sign-in; see [deployment](docs/07-operations/DEPLOYMENT.md)) and developed on macOS or Linux. Built so other self-publishers can have accounts later.

## Start here

For a new session, read this file, then [AGENTS.md](AGENTS.md) (every rule) and `.agent/CURRENT-TASK.md` (where the work is now). Then read the last entries of `.agent/HANDOFF.md`.

### New machine

1. Clone the repository, then run `git pull --ff-only` before any work.
2. Run `mise trust mise.toml` and `mise install`. Node comes from `mise.toml` (26.10.0 for development; production runs Node 24.21).
3. Run `mise exec -- npm run setup`, then `mise exec -- npm run doctor`.
4. On the Mac only, copy `.env.example` to `.env` and fill it in privately. Without an OpenRouter key the app uses the mock AI and spends nothing. Never move the settings file or any key between computers, and never commit one.
5. Run `mise exec -- npm run dev`. Web: http://127.0.0.1:5180. API: http://127.0.0.1:5181. Local sign-in is off, `/` shows the landing page, and "Open library" leads to `/library`.
6. To move a book between Volumes, open the book and go to Export > Move this book > Download project. On the other copy, go to Library > Import project. Never copy the database.
7. Then read `AGENTS.md` and `.agent/CURRENT-TASK.md`.

## Status

20 October 2026: live at https://volume.gakinz.com on release `20261020T035644Z` (main `072dec3`), with rollback target `20261020T021731Z`. Phases 0 to 8 are built; phases 6 to 8 were built on 17 October 2026 (D-041 to D-047). The owner gates for phases 5 to 8 are open. The live acceptance run of 18 October 2026 is not passed: no book has yet gone through to a postable pack end to end.

GitHub Actions creates no runs because GitHub's spam filter flagged the owner's account on 18 October 2026 (see [known issues](KNOWN-ISSUES.md)), so deploys use `--no-ci-check` with the owner's OK. Open issues are in [known issues](KNOWN-ISSUES.md). The current release, deploy and rollback steps are in [deployment](docs/07-operations/DEPLOYMENT.md).

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

If another process, including an SSH tunnel, owns port 5180, leave it running and explicitly choose a free web port:

```bash
VOLUME_WEB_PORT=5182 npm run dev
```

The launcher forwards this port to Vite and allows its loopback origin on the local API. If you set `WEB_ORIGINS` yourself, include the chosen origin there. The API port remains unchanged.

Checks before you hand work on:

```bash
npm run typecheck     # every workspace
npm run lint          # ESLint, type-aware, whole repo
npm run format:check  # Prettier; npm run format rewrites the files
npm run test          # Vitest in every workspace
npm run test:coverage # measured core, AI, export and server thresholds
npm run e2e           # 17 browser tests in 9 specs, mock AI; Playwright uses ports 5311 to 5318 (not 5314), and 5313 must be free
npm run build:release # release folder for the cPanel host (docs/07-operations/DEPLOYMENT.md)
mise exec -- npm run deploy -- --dry-run  # host preflight only; a real `npm run deploy` needs the owner's approval
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
| `apps/web/` | App screens (Vite, React, Tailwind v4). `src/app/` holds the routes and shell, `src/features/` the screens, `src/site/` the public pages (landing, How it works, sign-in; GSAP and Lenis, D-053), and `src/demo/` the demo data. Moved from prototype/ on 5 October |
| `apps/server/` | Fastify API, job queue, SSE, SQLite locally and MariaDB on the host, phase 1 onwards |
| `packages/core/` | Book model, Markdown parser, house style, checkers, KDP maths |
| `packages/ai/` | OpenRouter client, mock provider, model registry, prompt loader, guardrails |
| `packages/export/` | PDF, DOCX, EPUB, TXT, MD, covers, preflight, upload pack |
| `packages/ui/` | Design tokens and shared components |
| `design/directions/` | Original design boards; fused direction lives in design/final/ (D-014 accepted) |
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
| `docs/07-operations/SETUP.md` | Restoring Volume on macOS or Linux, and the `.env` rules |
| `docs/07-operations/DEVELOPMENT.md` | Running and developing locally |
| `docs/07-operations/DEPLOYMENT.md` | Current release, `npm run deploy`, rollback, post-deploy checks, moving books between Volumes |
| `../reports/volume/qa/reports/LOCAL-VALIDATION-2026-10-06.md` | Automated checks, coverage and export evidence |
| `../reports/volume/qa/reports/FREE-AI-VALIDATION-2026-10-06.md` | Free live tests and publishing application checks |
| `../reports/volume/qa/reports/DOCUMENTATION-AUDIT-2026-10-06.md` | Documentation scope, corrections and remaining decisions |

## Owner decisions (4 October 2026)

- Local first on the owner’s macOS or Linux computer; multi-user ready for later accounts.
- Several author profiles and pen names, each with its own voice, bio and brand.
- Fully automatic writing in the first person from the profile, with guardrails: no invented ISBNs, statistics, studies, quotes, testimonials, awards or sources, and a claims-to-verify report.
- One AI account: OpenRouter, one key. The owner picks the model per job in Settings.
- Every book follows the full structure: front matter, body, back matter, publishing package, marketing package.
- KDP AI disclosure is set automatically when AI wrote the text or made the images.
- Volume mode (many books at once) comes later, with KDP's weekly title limit built in.
- The fused Volume direction is implemented and accepted (D-014, 7 October 2026).

The full log is in `docs/08-change-management/DECISIONS.md`.
