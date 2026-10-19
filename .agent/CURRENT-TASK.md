## Public landing, how it works and sign-in, 19 October 2026 (Claude Code)

Branch `feat/landing-hero`, rebuilt on main d0c66c3 (three commits cherry-picked; the first build sat on `review/integration-2026-10-19`). Decision D-053 (D-051 is move-a-book, D-052 is draft PR #14). PR opened for owner review; not deployed.

Done: signed-out visitors on a hosted build see the landing hero at `/`, How it works at `/how-it-works` and a branded sign-in at `/sign-in` (and any other path). Signed-in and local builds reach the pages at `/welcome` and `/how-it-works`. Built with GSAP 3.15 (SplitText, ScrambleText), Lenis 1.3.27 and adapted React Bits components in `apps/web/src/site/`.

Proven on the rebased branch (Node 26.8.1): typecheck, lint, format:check PASS; Vitest 1,095 passed, 4 skipped; web build PASS; e2e 17 of 17. Browser at 1440 and 390, dark, reduced motion (first build). Screenshots: `../reports/volume/screenshots/landing-hero/`.

Next: owner reviews and merges the PR, then deploy; check the themed Clerk form on the host (NOT TESTED locally, sign-in is off there). Owner: restore GitHub Actions (no runs are created for any push; account-level).

## Production hub, 18 October 2026 (Claude Code, lead with subagents)

Branch `feat/production-hub` (from main 91011b6). Owner chose the hub and delegated the open choices; recorded as D-048 (stage advances) and D-049 (one marketing gate, writing complete; counts 5 and 5 from the template; pack blurb and short bio). Back-cover blurb is 120 to 200 words everywhere (`matter/back-cover.v6`).

Done: stage to `blueprint` on title choice and to `editor` when writing is complete (placeholders and empty bodies do not count); marketing gate on server and web (items stay visible, only Generate locks); `writingComplete` and `marketingCounts` on books; publish with a date (any time zone's today) and archive with Undo on Export and Library cards; AI disclosure preflight from version sources and AI assets; `listing/back-cover-blurb.txt` and `listing/short-bio.txt` in the pack; models config and AI-PIPELINE, PROMPTS, UX-SPEC, EXPORT-SPEC drift fixed. Reviewer: 0 high, 5 medium, 8 low, all fixed.

Proven (Node 26.8.1): doctor, typecheck, lint, format, docs, hooks, Vitest 898 passed and 2 skipped (core 151, AI 202, export 132, server 322, web 91), both builds, e2e 17 of 17 (new `tests/e2e/production-hub.spec.ts`). Screenshots: `../reports/volume/screenshots/production-hub/`.

Merged as PR #5 (main 404ce0e) and live on 18 October 2026 (release `20261018T131543Z`; rollback `20261018T105443Z`). Live checks: health 200, unsigned API 401, bypass 401, new bundle `index-DmS0ok80.js`.

Next: owner tries Mark as published, Archive and the marketing gate on the live site; phase 6, 7, 8 gates; deploys go through `npm run deploy` (PR #6). Behaviour change: an acknowledgements placeholder keeps a book out of `editor` and marketing until the owner fills it.

## Production deploy, 18 October 2026 (Claude Code)

Main at aa5eb67 is live at https://volume.gakinz.com (release `20261018T105443Z`, rollback `20261016T224127Z`). Migrations 0006, 0008, 0009 applied after a cPanel backup. Auth bypass closed (`/%61pi/v1/health` 401). Owner confirmed sign-in, library, Settings (MySQL) and PDF export. Restart on this host means stopping the `lsnode` process (DEPLOYMENT.md).

Next: phase 6, 7, 8 owner gates; point `PassengerNodejs` at `/opt/alt/alt-nodejs24/root/usr/bin/node`; origin lock and cron checks; CI on main.

## Phases 6 to 8 built, 17 October 2026 (Claude Code, lead with subagents)

Branch `feat/phases-6-8` (pushed; worktree `../Volume-phases` on the owner's Mac). Plan: `docs/08-change-management/plans/PHASES-6-8.md`. Decisions D-041 to D-047 accepted by the owner as built (17 October 2026). The audit branch (auth fix 11e848b) is merged to main (54a788a) and merged into this branch.

Done: fiction and workbook templates (P6-1 to P6-6), picture books (P7-1 to P7-6), Volume mode and accounts (P8-1 to P8-4), reviewer findings (1 high, 7 medium, 9 low) fixed. Migrations 0006 picture books, 0008 volume mode, 0009 invitations ship together (0007 unused).

Proven (Node 26.8.1, no Mise): doctor, typecheck, lint, format, docs (88), hooks 83, all Vitest suites 854 passed and 2 skipped, both builds, e2e 14 of 14 twice, compare:pdf, build:release, MySQL test on local MariaDB 12.3. Screenshots: Settings budgets, batch detail, schedule, picture-book run (progress never decreases), no console errors.

Not tested: live AI per template, MySQL concurrency races, EPUBCheck, Linux goldens for new samples, real host, printed proof, KDP upload.

Next:
1. Done 18 October 2026: main at aa5eb67 deployed (release `20261018T105443Z`, migrations 0006, 0008, 0009 applied, auth bypass closed). Owner confirmed the signed-in library, Settings (MySQL) and a PDF export. Open: origin lock and cron checks; point `PassengerNodejs` in the docroot `.htaccess` at a stable Node path before old releases are removed (DEPLOYMENT.md).
2. Owner holds the phase 6, 7, 8 gates (try each book type).
3. Owner adds `ACCOUNTS_MODE=owner-only` to `.env.example`.
4. One free live run per template (`LIVE_AI=1`, budget zero): authorised, not run. The key lives only in the main checkout settings file, so run it there.
5. GitHub Actions did not start on PR #4 (account billing or spending limit). The 18 October record commit on main shows whether billing is fixed.
## Production, privacy and hub audit, 17 October 2026 (Claude Code)

Saved on branch `fix/hosted-auth-privacy-audit` (pushed, not merged, not deployed). Live auth bypass found: `https://volume.gakinz.com/%61pi/v1/health` answered 200 without sign-in. Fixed locally with a regression test (decoded path check plus a context guard in the `/api/v1` scope). The hosted web app no longer falls back to demo data; noindex, robots.txt and `X-Robots-Tag` added; tab titles; style guide local only; command menu uses server books. Privacy inventory and a draft privacy notice in `docs/05-security/`. Report: `../reports/volume/PRODUCTION-PRIVACY-AUDIT-2026-10-17.md`.

Next: (1) owner merges the branch to main and approves a deploy of the auth fix (urgent), or splits the first commit out if the rest needs more review; (2) owner decisions: OpenRouter `data_collection`, prompt run output on book delete, `job_events` retention, legal name in project zips, privacy contact facts; (3) owner OK for the production hub plan in the report (publish and archive from the web, stage advances, marketing gate and counts, AI disclosure preflight, blurb in the pack). The phases 6-8 lead works in `../Volume-phases` on `feat/phases-6-8` and will rebase onto the auth fix.

## cPanel hosting restructure, 16 October 2026 (Claude Code)

Branch `chore/gee-os-cpanel` (pushed, not merged). Volume is ready to host at https://volume.gakinz.com as one Passenger Node.js app on Node 24.21 with MariaDB on localhost and Clerk sign-in (D-037 to D-040, GEE OS 1.4.5 `cpanel` profile). Release folder: `npm run build:release`; deploy contract, Passenger settings and checks: `docs/07-operations/DEPLOYMENT.md`.

Proven locally (16 October 2026): every gate on Node 26 (doctor, typecheck, lint, format, docs, tooling, hooks 83, all Vitest suites, both builds, e2e 7 of 7); doctor, tooling, typecheck and all suites on Node 24.21 including the MySQL test; the release installs with `npm ci --omit=dev` on Node 24 without better-sqlite3, migrates as a migration user, refuses to start with pending migrations, and boots on a runtime-only MariaDB user (health 200, unsigned API 401, page with CSP); SQLite to MySQL copy on scratch data (3.5 MB blob byte-equal); docroot `.htaccess` on Apache 2.4 (403 without CF-RAY).

Not tested: the real host (Passenger listen hook, idle stop, LiteSpeed), a real Clerk instance, Chromium export on the host, the new CI job remotely.

Next: lead agent creates the Clerk application, database users, shared settings and Chromium on the host, then deploys with owner approval and runs the post-deploy checks. Owner: review `.env.example`, run the one-off library copy, decide on merging the branch.

## macOS gate, 14 October 2026 (Claude Code)

Main is clean at 8fc591e; PRs #1 and #2 merged, so the summary-missing work is now in main. macOS gate PASS on the owner's Mac (Homebrew Node 26.8.1; Mise not installed, repo pins 26.10.0): doctor, typecheck, lint, format, docs, hooks 83, core 75, AI 161, export 87 (1 skip), server 195 (1 skip), `compare:pdf` 4 of 4 on darwin references, both builds, e2e 7 of 7. Remote CI run 37995263944 on main PASS on macos-latest and ubuntu-latest. `../reports/volume` does not exist on this Mac.

Next: owner (1) records the decision on save-chapter-when-summary-fails, already merged without a D entry, and the `checks.maxTokens` 16000 change; (2) authorises a free-model live writing run (`LIVE_AI=1`, budget zero) to close Live AI acceptance; (3) owner-book and KDP draft acceptance. MySQL stays deferred.

## Fix pass, 8 October 2026 (Claude Code)

Supersedes the lint and Chromium lines in the audit status below. Lint now PASSES: the unused `all` was dropped from one destructure at `apps/server/src/jobs/handlers/writing.ts:357`; nothing else in the in-progress summary-missing work changed, and that behaviour is still an owner decision. Chromium 1243 is installed, so export and PDF suites run again: export 87 PASS (1 skip), including the 4-page Linux golden comparison; server 195 PASS (1 MySQL skip); doctor PASS; e2e 7 of 7 PASS. Also: title "Volume" in `apps/web/index.html`, `minimum_version` and `mcp_profile: "none"` in PROJECT.yml, a Commands block in AGENTS.md, and stale wording in README, KNOWN-ISSUES and TEST-STRATEGY. Report: `../reports/volume/FIX-PASS-2026-10-08.md`. Next: owner decides on the summary-missing work and the `checks.maxTokens` change, then record them.

## Workspace audit status, 8 October 2026

Status at this date supersedes the "every local check passes" line below. Lint FAILS on `apps/server/src/jobs/handlers/writing.ts:357` (unused `all`), in uncommitted edits made after the 7 October handoff. Those edits (`writing.ts`, `jobs/book-data.ts`, `routes/manuscript.ts`, `config/models.defaults.json` `checks.maxTokens` 8000 to 16000, untracked `summary-missing.test.ts` and `SummaryMissingNotice.tsx`) look like the "save chapter when summary fails" work, which is still an owner decision. They are unrecorded and were left untouched. Export, PDF and cover rendering are BLOCKED on this computer because Playwright's `chromium_headless_shell-1243` is missing from the shared browser cache. Report: `../reports/volume/AUDIT-AND-POLISH-2026-10-08.md`.

## Fix sweep, 7 October 2026 (Claude Code)

Linux PDF parity fixed (D-034), summary truncation fixed in mock (D-035), docs link check made CI-safe. Every local check passes on Linux: typecheck, lint, format, docs, 83 hook tests, tooling, core 75, AI 161, export 87 (1 optional skip), server 189 (1 skip), web and server builds, e2e 7 of 7. Still open and not fixable locally: macOS run of `npm run compare:pdf` and tests, remote CI, authorised free-model writing rerun, KDP draft upload, cPanel MySQL, owner decisions (D-014, D-020, profile facts, save chapter when summary fails).

## Fix follow-up, 7 October 2026

Test reliability fixes and fresh evidence are in ../reports/volume/qa/reports/FOLLOW-UP-2026-10-07.md. Core rerun 75 PASS, AI 155 PASS, server 189 PASS, export 86 PASS with PDF visual FAIL. Restart scenario PASS after matching the existing 60-second startup allowance. PDF references/threshold remain unchanged; full acceptance PARTIAL/NO-GO. Actual Mac and owner/external gates remain open.

## Latest: PDF parity investigation
Added a typed read-only comparison command that reports all four existing PDF references and environment/font hashes. Linux comparison: title PASS, contents/opener/body FAIL. Font-hinting experiments improved the match but none passed all pages, so production rendering, golden files and tolerance are unchanged. Exact cause remains unresolved. Typecheck, diagnostic lint/format and docs checks PASS. See ../reports/volume/qa/reports/PDF-INVESTIGATION-2026-10-07.md. Actual Mac access was not supplied; use ../MAC-LINUX.md (workspace root) and run the same diagnostic there.

# Current task

- Task: approved Volume GEE OS rebuild, local isolated candidate.
- Mode: Build. Workflow: Change Safety. Profile: Full Product.
- Status: implementation complete for documentation structure, portable tooling and React/Tailwind application composition. Linux candidate validation finished, with the preserved PDF failure. Feature-by-feature full reconstruction/acceptance remains outstanding; current features are ported implementations. Release acceptance remains PARTIAL.
- Plan: docs/08-change-management/plans/GEE-OS-REBUILD.md.
- Evidence: ../reports/volume/qa/reports/GEE-REBUILD-2026-10-07.md.

## Implemented

GEE document hierarchy and move manifest; standalone Mise/npm clean restore and runtime doctor; guarded process launcher; React providers/router under src/app and feature slices under src/features. Public demo fixtures are now included under src/demo: the old unanchored data/ ignore excluded them from fresh Git checkouts. Private root data remains ignored and untouched. Existing backends, schemas, prompts, assets, design and user workflows are retained.

## Boundaries and remaining work

No environment file or private root data read or copied. No original checkout cutover, commit, push, deployment, live AI call or destructive retirement. Mac execution and remote CI require a real Mac/authorised remote run. Linux PDF visual reference discrepancy remains unresolved, with golden and tolerance unchanged. Existing publishing and live AI acceptance blockers remain in KNOWN-ISSUES.md.

Use npm run setup, npm run doctor and npm run dev through Mise. Volume remains owner-only on loopback, web 5180 and API 5181. Safe LAN access requires a separately designed authentication/origin change.

Prior task history: ../reports/volume/qa/reports/TASK-BEFORE-GEE-REBUILD-2026-10-07.md.


## 7 October 2026: running-header correction

Corrected suppressed small capitals in PDF running headers and added a rendered-PDF regression. Full visual parity remains FAIL; reference images and tolerance remain unchanged. Ornament rendering is intact, correcting the initial diagnostic suspicion. See ../reports/volume/qa/reports/PDF-SMALLCAPS-2026-10-07.md. Release remains PARTIAL/NO-GO; actual Mac execution is NOT TESTED.


## Active promotion, 7 October 2026
Owner requested promotion and push. Current directory: /home/mr-gee/Work/Projects/active/volume. Original preserved at /home/mr-gee/Work/Projects/archive/pre-rebrand-2026-10-07/volume. Branch: rebrand/gee-os-typescript-20261007. See ../reports/volume/qa/reports/ACTIVE-PROMOTION-2026-10-07.md. Earlier release gates remain open; no production merge/deployment performed.
