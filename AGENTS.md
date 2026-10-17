# Volume: rules for every AI assistant

Volume is a book production app, hosted for the owner at https://volume.gakinz.com and developed locally: author profiles and pen names, research, titles, blueprint, fully automatic writing, editing, covers and a KDP-ready export pack. Owner: Gideon (Gakinz, London). Claude Code, Codex, Gemini CLI and any other assistant follow this file. CLAUDE.md and GEMINI.md only point here.

## GEE OS adoption

This application adopts GEE OS 1.4.5 on the `cpanel` profile (D-040), keeping the Full Product document hierarchy. Read the project card and current task, then load the shared constitution, one primary mode and the Change Safety workflow through the gee-os skill. Recorded profile deviations: Node runs on the host under Passenger and the backend is the Fastify server, not a PHP API (D-038). Keep project facts here, not in global machine rules. This repository must restore independently on macOS and Linux. Runtime contracts in config/, prompts/, assets/ and the database stay stable during migration.

## Start of every session

1. Read `.agent/CURRENT-TASK.md` (where the work is and the next step) and the last entries of `.agent/HANDOFF.md`.
2. Read `.agent/PROJECT.yml` and only the docs the task needs (index below). Do not preload everything.
3. Say in one line what you will do, then do one step at a time.

## End of every session

- Update `.agent/CURRENT-TASK.md` (status, next step, blockers).
- Append a dated entry to `.agent/HANDOFF.md`: who (which AI), what changed, files, checks run with results, what is next.
- Record decisions in `docs/08-change-management/DECISIONS.md` and user-visible changes in `CHANGELOG.md`.

## Where things live (one fact, one file)

| What | File |
|---|---|
| The approved plan | `docs/08-change-management/plans/GEE-OS-REBUILD.md` |
| Product, features, phases and acceptance | `docs/01-product/PRODUCT-SPEC.md`, `docs/01-product/ROADMAP.md` |
| Architecture, folders, stack | `docs/02-architecture/ARCHITECTURE.md` |
| Database tables | `docs/02-architecture/DATA-MODEL.md` |
| AI stages, models, guardrails | `docs/02-architecture/AI-PIPELINE.md`, `config/models.defaults.json` |
| Prompts | `prompts/<stage>/<name>.v<N>.md`, index `docs/book-production/PROMPTS.md` |
| Book structure and templates | `config/book-templates/`, `docs/book-production/EXPORT-SPEC.md` |
| KDP facts and limits | `config/kdp-rules/`, `docs/book-production/KDP-RULES.md` (never from memory) |
| Look and feel | `docs/03-design/DESIGN-SYSTEM.md`, `packages/ui` |
| Screens and flows | `docs/03-design/UX-SPEC.md` |
| House writing style for books | `config/house-style.json` |
| Security and privacy | `docs/05-security/SECURITY.md`, sign-in `docs/05-security/AUTH-MODEL.md` |
| Hosting, deploy contract, Passenger settings | `docs/07-operations/DEPLOYMENT.md`, `deploy/`, `.env.example` (names only) |
| Tests | `docs/06-quality/TEST-STRATEGY.md` |
| Decisions and open issues | `docs/08-change-management/DECISIONS.md`, `KNOWN-ISSUES.md` |
| AI test fixtures (mock provider) | `packages/ai/test/fixtures/` |
| Owner's original drafts, nine notes (source material, not rules) | `docs/source-drafts/` |

If two files disagree, stop and ask which is right, then fix both.

## Stack (do not change without a docs/08-change-management/DECISIONS.md entry and the owner's OK)

- npm workspaces monorepo, TypeScript strict everywhere (no `any`, no `@ts-ignore`). Node 26 for development (Mise), Node 24.21 in production; code must run on Node 24.11+ (D-037).
- `apps/web`: Vite, React, React Router, Tailwind v4, motion/react, TanStack Query, TipTap (free extensions only), Clerk (`@clerk/react`) when built with `VITE_CLERK_PUBLISHABLE_KEY`.
- `apps/server`: Fastify, zod, Kysely (SQLite locally, MariaDB/MySQL on the cPanel host) with migrations, in-process job queue, SSE, Clerk session checks (`@clerk/backend`), and in the release layout the built web app. Binds to 127.0.0.1 only; Passenger and Cloudflare sit in front on the host (D-038, D-039).
- `packages/core` (book model, parser, rules, checkers, KDP maths), `packages/ai` (OpenRouter client, registry, prompt loader), `packages/export` (PDF via Paged.js in Playwright, DOCX, EPUB, TXT, MD, covers, preflight, pack), `packages/ui` (design tokens and components).
- AI: OpenRouter only, one key `OPENROUTER_API_KEY`, server side only. Model per stage from `config/models.defaults.json`, changeable by the owner in Settings.
- Tests: Vitest, Playwright, golden files. Lint: ESLint and Prettier (D-023): `npm run lint` (ESLint flat config in `eslint.config.js`), `npm run format` and `npm run format:check` (`.prettierrc.json`, `.prettierignore`).

## Commands

Run each one through Mise (`mise exec -- <command>`) from the repo root. Scripts come from the root `package.json`; there is no root build script, so build per workspace.

```sh
npm run setup                 # setup
npm run dev                   # dev: web 127.0.0.1:5180, API 127.0.0.1:5181
npm run typecheck             # typecheck every workspace
npm run lint                  # ESLint, whole repo
npm run test                  # Vitest in every workspace
npm run e2e                   # builds, then Playwright on 127.0.0.1:5311 and 5312
npm run build -w apps/server  # build the API
npm run build -w apps/web     # build the web app
npm run doctor                # runtime, native modules, pinned Chromium
npm run docs:check            # Markdown link check
npm run build:release         # release folder for the host (build/release); see docs/07-operations/DEPLOYMENT.md
npm run migrate -w apps/server         # apply migrations (MYSQL_MIGRATE_USER on MySQL)
```

## Working rules

1. Plan before large changes; show the plan and wait for the owner's OK. Small fixes may go ahead.
2. Smallest change that solves the problem. One concern per change. Respect folder ownership when several agents run at once.
3. After each change: typecheck, lint and the relevant tests. Report PASS, FAIL, PARTIAL, NOT TESTED or BLOCKED with the command and result. Never claim done without evidence.
4. Never read, print, copy or commit `.env`, anything in `data/` or the host's `~/apps/volume/shared/`. Never put a key in code, prompts, logs or the web bundle.
5. Ask before: deploying, touching the host, Clerk, Cloudflare or the production database, installing packages not named in the docs, deleting files, changing the stack, network calls other than OpenRouter, anything that costs money (live AI runs need `LIVE_AI=1` and a budget).
6. Prompts are files in `prompts/`, never strings in code. Changing a prompt means a new version file.
7. KDP numbers come only from `config/kdp-rules/`. If a rule is missing, add it with its official source and date, or mark it unverified.
8. Do not start or stop servers you did not start. Stop what you start.
9. Commit only when the owner asks. Conventional commit messages.

## Book rules (enforced by the app, also by you when writing prompts or samples)

- Every book follows the full structure in `config/book-templates/` (front matter, body with chapters and subheadings, back matter, publishing package, marketing package).
- British English by default, no em dashes, no banned phrases (`config/house-style.json`).
- Never invent ISBNs, statistics, studies, quotes, testimonials, reviews, awards or sources. Medical, clinical, legal and safety statements go to the claims-to-verify report.
- About the author is the profile bio word for word. KDP AI disclosure is set to AI-generated when AI wrote the text or made the images.

## Writing for people (docs, UI copy, messages)

Plain British English, short sentences, no em dashes.
<!-- house-style:off -->
Avoid: leverage, empower, showcase, transformative, impactful, cutting-edge, revolutionise, synergy, groundbreaking, utilise, elevate, unlock, seamless.
<!-- house-style:on -->

## Assistant-specific tooling

- Claude Code: subagents in `.claude/agents/`, skills in `.claude/skills/`, hooks in `.claude/settings.json`.
- Codex and Gemini CLI: no hooks here, so follow the same rules by hand. The agent roles are: architect, frontend, backend, ai-prompts, export, reviewer, qa. Their scopes are listed in `.claude/agents/*.md`; read the one matching your task and follow it as instructions.


## TypeScript requirement
Application code must use TypeScript (.ts/.tsx), with React and Tailwind. Keep HTML limited to required build entries, generated output and archived design references. Preserve approved behaviour when migrating source.

## Report location

Keep audit, validation and completion reports in `../reports/volume/`, outside the project. Keep project instructions and setup guides here.
