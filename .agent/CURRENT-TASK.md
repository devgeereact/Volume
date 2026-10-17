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
