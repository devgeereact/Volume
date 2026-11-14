# Current task

Current state only. Dated history is in `.agent/HANDOFF.md`; audits in `docs/AUDIT.md`; the live release in `docs/07-operations/DEPLOYMENT.md`.

## State on 14 November 2026 (house-standard rollout, stages 0 to 3)

- **Git:** `main` = `origin/main` = `9850698`, clean. PRs #96 and #97 are merged (the "PR #96 waiting" and "three cover branches waiting for push" notes below are done). "Check Volume" run 43518906300 and Deploy run 43521018610 are green on that commit. Backup bundle: `~/Backups/projects/Volume/Volume-20261113-2352.bundle` (verified).
- **Branch `chore/house-standard` (local, not pushed):** working-method gaps closed in AGENTS.md (review points, Sonnet-first, GSD optional, `approved:` for push and merge), D-071, stale notes corrected. Tailwind v4 already adopted (4.3.3, Vite plugin, `.flex` in built CSS); bump to 4.3.5 not done (needs a green gate).
- **Gate:** `npm run verify` stops at `tests/integration/runtime.test.mjs` "standalone dev starts from another cwd" (API not up within 16 s) while other Claude sessions keep the load average at 25 to 38 on 8 cores. Green in CI on the same commit, so treated as load, not code. Steps after it were run one by one; results in `docs/AUDIT.md`. Re-run the full gate when the machine is quiet, or on the Mac.
- **Owner list:** remote branches `docs/record-release-20261109`, `feat/v0-base-and-covers`, `fix/claims-honest-results`, `fix/e2e-title-set-race` are merged and can be deleted on GitHub (needs "approved:"). `graphify` is not installed on this Ubuntu machine, so `graphify-out/` is absent here; rebuild on the Mac.
- **Next:** owner reviews `chore/house-standard` and says "approved: push Volume" (a merge to `main` starts the Deploy workflow), then `/finish-app` for V1.

## State on 13 November 2026

- **Method (owner approved 13 November 2026, D-070):** superpowers plans and builds; GSD is retired. Plan: `docs/08-change-management/plans/VERSIONS-PLAN.md` (V0 clean base, V1 live and proven, V2 trust, V3 faster daily work, V4 conditional). Approved: the plan, the core value sentence, the root-folder proposals and the paid docs graph run (each deletion and the paid run still get a one-line check).
- **V0 progress (merged in PR #96):** all six items done. GSD content merged into `docs/KNOWN-ISSUES.md` and the `GSD-2026-11/` folder deleted; `npm run verify` now includes web tests and `build:release` and passed (exit 0, 20 e2e); `qa/` moved to `docs/06-quality/evidence/`; `.nvmrc` deleted (`mise.toml` is the Node source); `local-live.json`, `CODEX.md`, `GEMINI.md` kept; all seven agents default to Sonnet; AGENTS.md carries method, models and graph rule; graph in `graphify-out/` now covers code, docs and prompts (9,267 nodes, 287 communities).
- **Open question for V1 (owner):** what "finished" looks like, and what would make them wince. V1 starts with a brainstorm to freeze its finish line (max 10 items), then a task plan.
- **Still blocked on the owner:** the host steps below (the cover branches are merged, PRs #96 and #97).

## State on 8 November 2026

- **Live (9 November 2026):** release `20261109T010629Z` from main `3e18b1f`: the claim and house-style fixes (PR #94), on top of the go-live security fixes and public-page indexing (PR #91), the sign-in fix (PR #92) and the corrected deploy live check (PR #93). Rollback target `20261109T000812Z`. Checked with public GETs after the deploy: `/` and `/how-it-works` are `index, follow`; `/sign-in` and `/library` are `noindex, nofollow`; the sitemap lists only those two public pages; `/api/v1/books` answers 401 signed out; `X-Powered-By` is gone. The sign-in fix was confirmed working live by the owner.
- **Waiting for the owner (host, by hand), then Claude checks:** (1) add the header lines from `deploy/htaccess.volume` to the docroot `.htaccess` (the live site still sends `X-Turbo-Charged-By: LiteSpeed`); (2) set `CLOUDFLARE_ONLY=report` in the shared settings file on the host, restart, visit the site, read the app log for "request did not come through Cloudflare", then set `on` if clean (leave off and log an issue otherwise); (3) sign in, open a book and build a short PDF export (proves the isolated Chromium; no AI credit); (4) Google's Rich Results Test and sitemap submission in Search Console. Then Claude runs the public checks again.
- **Finding:** the live `robots.txt` is Cloudflare's managed block (`User-agent: *` with `Allow: /` and AI-crawler blocks) followed by Volume's own allow-list and the sitemap line. Private pages stay out of search through their `noindex` meta tag and header, but `robots.txt` alone does not keep crawlers off them. Decide in Cloudflare whether to keep "Manage robots.txt".
- **CI flake:** `packages/export/test/cover-layers.test.ts` failed 4 times with "Unable to capture screenshot" (Ubuntu and node24-host); each passed on re-run. It once blocked a deploy. Fix with the cover work (retry, browser flags).
- **Error fixing (reported by the owner), fixed and live (PR #94):** soften on a sentence that is no longer in the section is refused instead of called done; remove on a gone sentence says no text changed; "Fix house style" reports what the pack check still blocks on; claims follow the house-style fix, so they are no longer retired and filed again. Still open: "Fix everything" queues summary and check reruns before the claim fixes create new versions (read from the code, not reproduced); a save sets a section to "done" even while blocking placeholders remain; an acknowledgement is lost when its message text changes; the bigger "one issues ledger" design needs a migration (backup and approval first).
- **Cover generator, reported by the owner (9 November 2026). The three branches below are merged into `feat/v0-base-and-covers` (13 November 2026, `npm run verify` PASS, exit 0, 20 e2e) and pushed with a PR for the owner to merge (merging deploys):** `fix/cover-screenshot-retry` (retry for the flaky screenshot), `fix/cover-spine-contrast` (spine text always readable, all 51 palettes tested) and `fix/cover-spine-fit` (eb4b326: long spine titles shrink, then drop the author, then end with an ellipsis; `npm run verify` exit 0, web tests 284 pass). Still open: front content about 0.08 in right of centre; title and author positions relative to cover width, so they differ between eBook and wrap; web preview, `DemoWrap.tsx` and `Cover.tsx` use their own layout maths (0.375 in barcode inset against 0.25 in in the build); back-cover author block and barcode box share no baseline.
- **Quality checks, not started:** prose-metrics check, per-genre banned-phrase lists, Style report card, voice fingerprint.
- **Found, not changed:** `npm run verify` does not run the web unit tests (`apps/web` has no `test:coverage` script) or `build:release`, and CI cannot see deploy-time checks.

## Still true from 1 November 2026

- **Clean-up done:** dead code, merged branches, worktrees, build output and outdated docs (docs/AUDIT.md, 1 November). Only `main` remains on GitHub apart from short work branches (`docs/release-20261030` deleted on the owner's word, 1 November 2026).
- **To check by hand:** signed-in Blueprint and Titles on a real book (owner).

## Open owner decisions

- **Clerk sign-in methods:** owner decided on 1 November 2026 to leave Password on (email code still works through Continue).
- **Go-live security (PR #91, live):** all code-closable findings fixed (High S1 and S2, Medium M1 to M4, Low L1 to L5, L7, L9). Owner steps left: `CLOUDFLARE_ONLY` report then on (M5, L8); copy the new header lines from `deploy/htaccess.volume` into the docroot `.htaccess`, or add a Cloudflare rule removing `X-Turbo-Charged-By`; review `docx` 9.15 (adds a default table style) and the Clerk SDK minors before upgrading them.
- **Public page indexing:** decided 1 November 2026 (D-068): `/` and `/how-it-works` indexed, sitemap and robots are live (PR #91); the owner still runs then run Google's Rich Results Test and submit the sitemap in Search Console.
- **Unconfirmed since 25 October:** the pack gate blocks only on needs-check claims; the loosened house-style and invented-content rules (see that PR's audit table).
- **Origin lock:** `CLOUDFLARE_ONLY` ships off; the one-off host steps (`report`, read the log, then `on`) are in DEPLOYMENT.md and not recorded as done.
- **Book claims:** the 34 for-the-record claims on "AI For Everyday People" and the remaining clinical claims on Harni's books need a qualified reader.
- **Privacy and providers:** OpenRouter `data_collection` setting; privacy contact address, retention periods, lawful bases and transfer safeguards (KNOWN-ISSUES.md).
- **Phase 5 to 8 gates:** try each book type on the live site; whether to offer accounts to other self-publishers (phase 8).
- **Hook:** bring back the stop-time handoff hook (commit 5ef1177)?
