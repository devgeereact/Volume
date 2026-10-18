# Known issues and open questions

Updated 17 October 2026 (rows rechecked; first written 6 October after the local correction pass). Evidence and original findings: [project review](../reports/volume/qa/reports/PROJECT-REVIEW-2026-10-06.md).

| Item | Remaining work | Status |
|---|---|---|
| Humanizer live acceptance | New versions of all 32 prompts pass mock integration, server and browser checks. Actual prose quality needs a fresh authorised live run after the owner reloads/restarts the existing server. Earlier free-route errors remain unresolved. | NOT TESTED live |
| Live AI acceptance | Owner approved free-only testing. Live titles and three-chapter blueprint pass on Nvidia; full writing failed on summary truncation with both tested Nvidia summary models (fix in D-035: larger summary budget and prompt v4, mock tests PASS, live rerun NOT TESTED). Both requested Gemma routes returned upstream invalid-key errors. Recorded cost zero. Production-model quality, research citations and AI covers remain unverified. [Free validation](../reports/volume/qa/reports/FREE-AI-VALIDATION-2026-10-06.md). | PARTIAL |
| MySQL on cPanel | Production database from 16 October 2026 (D-038). Migrations, repos, a 3.5 MB blob copy and the release on a runtime-only user PASS against a local throwaway MariaDB 12.3; CI repeats this on MariaDB 11.4. The host database, its users and a restore drill are NOT TESTED until the lead deploys. | PARTIAL |
| Hosted deploy (volume.gakinz.com) | Main at aa5eb67 live on 18 October 2026 (release `20261018T105443Z`, migrations 0006, 0008, 0009 applied). Read-only checks: health 200 `{"status":"ok"}`, unsigned `/api/v1/books` 401, page 200 with CSP, HSTS, `X-Robots-Tag` and noindex, `robots.txt` 200. Owner confirmed signed in on 18 October 2026: library loads, Settings shows MySQL, PDF export works (Chromium on the host). Origin lock PASS (direct request to 185.61.152.45 without Cloudflare answers 403) and keep-alive cron PASS (every 5 minutes), checked 18 October 2026. LiteSpeed ignores `tmp/restart.txt` after the link flip; see DEPLOYMENT.md. | PARTIAL |
| Auth bypass on the live host | Found 17 October 2026: `/%61pi/v1/health` answered 200 without sign-in. Fix deployed 18 October 2026: `/%61pi/v1/health`, `/%61pi/v1/books` and `/api/%761/books` now answer 401. `/%2fapi/v1/health` answers 200 with the web page only (SPA fallback, no data). | Closed |
| OpenRouter data policy | `docs/05-security/SECURITY.md` intends to exclude providers that keep or train on data; the client does not send `data_collection: "deny"`. Setting it may remove free models. | Owner decision |
| Prompt run output after book delete | Raw AI output stays in `prompt_runs` when a book is deleted; `job_events` are never pruned. Proposed retention in `docs/05-security/PRIVACY-INVENTORY.md`. | Owner decision |
| Legal name in project zip | Project zip exports the profile's `legal_name`, location and real-person flag; DATA-MODEL says the legal name is never exported. | Owner decision |
| Request logs | Fastify logs the full URL (manuscript search text in `?q=`) and the visitor IP; 500 logs carry `err.message`. | Open, P3 |
| Privacy and legal | Privacy inventory and draft notice written 17 October 2026. Contact address, retention periods, lawful bases and transfer safeguards need the owner and legal review before invited users. Terms of use BLOCKED (no commercial rules). Account deletion, full export and a data request route are needed before invited users or public sign-ups. | Owner and legal review |
| Library move to MySQL | `npm run db:copy-to-mysql -w apps/server` is ready and tested on scratch data only. Owner runs it once, before the hosted app first starts. | Owner task |
| Publishing acceptance | Sampled Windowsill Herbs DOCX layouts pass in Word. Kindle installer verification passes outside the sandbox; licence approval pending. Browser surfaces unavailable for template/draft interaction. Owner-book and KDP acceptance remain unverified. [Free validation](../reports/volume/qa/reports/FREE-AI-VALIDATION-2026-10-06.md). | PARTIAL |
| Barcode placement | Dimensions and supplied-barcode clearance are checked; automatic position still needs the generated cover template. Dated rules retain a partial warning. | PARTIAL |
| KDP wording | Spine text at 79 pages and the printing-cost overlap at 110 remain ambiguous in official guidance. Safe defaults and warnings remain. | PARTIAL |
| Production hub (D-048, D-049) | Built on `feat/production-hub` 18 October 2026: stage advances, one marketing gate (writing complete), template counts 5 and 5, publish with a date and archive with Undo from Export and Library cards, AI disclosure from evidence, blurb and short bio in the pack. Copied versions (`copy`) keep their source but not a link to the original, so evidence relies on the copied source. Merged as PR #5 (404ce0e) and live on 18 October 2026 (release `20261018T131543Z`, no migrations). Not tested: live AI, signed-in use of the new buttons on the host. | Deployed, owner check pending |
| Picture-book e2e on macOS CI | Run 39129581839 (18 October 2026): `tests/e2e/picture-book.spec.ts:171` waited 60 s for the "Making the picture book" panel and never saw it; the same commit passed on Ubuntu, locally and in run 39130081202 on macOS. Likely a fast mock run ending before the panel renders. | Flaky, watch |
| GitHub checks | Run 39122313892 on main (18 October 2026, commit 91011b6): checks on macos-latest and ubuntu-latest and node24-host all succeeded after billing was restored. ubuntu-latest moves to Ubuntu 26 from 19 October 2026. | PASS |
| Visual direction, D-014 | Accepted by the owner on 7 October 2026. | Closed |
| Profile facts | Owner confirms Gideon's imprint/credentials and Harni's personal details. Do not invent or silently amend them. | Owner decision |
| Redirect lookups, D-020 | Default is now off. Explicit approval is still needed before enabling non-OpenRouter lookups for book research. | Owner decision |
| Environment examples | `.env.example` rewritten on 16 October 2026 at the lead's request with every setting name (names only). The agent guard blocks reading it, so earlier comments in that file were not carried over; Git history holds the previous version. Owner to review. | Owner review |
| TypeScript lint compatibility, D-023 | Root TypeScript 6 alias remains necessary for the current ESLint parser. Workspaces use TypeScript 7. | Existing workaround |

## Phases 6 to 8, 17 October 2026

Built on branch `feat/phases-6-8`. Plan: [PHASES-6-8](docs/08-change-management/plans/PHASES-6-8.md).

| Item | Remaining work | Status |
|---|---|---|
| Owner decisions D-041 to D-047 | Accepted by the owner as built on 17 October 2026. Phase 6, 7 and 8 owner gates (try each book type) still to hold. | Owner gate |
| Live AI per template | Fiction, workbook and picture-book prompts and image references pass with the mock provider only. One free-model run per template needs `LIVE_AI=1` and the owner's budget. The image seed is sent only when the model list shows `seed`. | NOT TESTED live |
| Picture-book ink and paper | Premium colour, 8.5 x 8.5. Colour costs, page limits and spine are confirmed on kdp.amazon.com (FACTS 12.1 to 12.5); white-only paper for colour stays partial. No printed proof yet. | PARTIAL |
| `.env.example` | Needs `ACCOUNTS_MODE=owner-only`. Agents cannot read or edit it; the setting is listed in DEPLOYMENT.md. | Owner task |
| Concurrency on MySQL | The MySQL test passes on local MariaDB 12.3 (migrations 0001 to 0009). The weekly-limit lock and duplicate-invitation race are tested on SQLite only. | PARTIAL |
| EPUBCheck and Linux goldens for new samples | `EPUBCHECK_JAR` is not set on this Mac; fiction, workbook and picture-book page images exist for macOS only (Linux runs the layout guard). | NOT TESTED |

Closed locally: atomic project imports, row/ZIP validation, internal AI budget checks and concurrent reservations, Markdown import, API blueprint comparison/restoration, TipTap editor, photo upload/export, writing cost confirmation, prices before publication, stale project metadata, migration any alias, backup documentation, EPUBCheck, the long-book benchmark and measured coverage targets. See the review's correction ledger for exact checks and limitations.

## GEE OS rebuild candidate, 7 October 2026

- PASS (fixed 7 October 2026, D-034): Linux PDF reference parity. Root cause was default font hinting in headless Linux Chromium; export now renders unhinted and Linux has its own visual references at the unchanged 1.5 threshold, with a layout guard against the macOS originals. macOS rerun PASS on 14 October 2026 (`compare:pdf` 4 of 4 pages, darwin references). Evidence: ../reports/volume/qa/reports/PDF-PARITY-FIX-2026-10-07.md.
- PASS, 14 October 2026: local macOS run (Homebrew Node 26.8.1, Mise not installed): doctor, typecheck, lint, format, docs, 83 hook tests, core 75, AI 161, export 87 (1 skip), server 195 (1 skip), both builds, e2e 7 of 7. Remote CI matrix (macos-latest, ubuntu-latest) PASS on main.
- PARTIAL: structural rebuild candidate was promoted to the active checkout on 7 October 2026 (a linked Git worktree); validation/review and merge remain pending. Existing publishing and live AI issues above remain open.
- PASS locally: offline profile entry health-request loop and design generation in paths with spaces are corrected; browser recovery acceptance is recorded in the rebuild report.
- PASS: previously ignored frontend demo source is restored under src/demo; private root /data/ stays ignored. Fresh install and Linux typecheck/lint/build succeed.
- NOT APPLICABLE: direct LAN exposure in this candidate. Existing owner-only authentication and origin guards require loopback binding.
