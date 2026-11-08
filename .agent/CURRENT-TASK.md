# Current task

Current state only. Dated history is in `.agent/HANDOFF.md`; audits in `docs/AUDIT.md`; the live release in `docs/07-operations/DEPLOYMENT.md`.

## State on 8 November 2026

- **Phase 1 (land the go-live work), in progress:** `golive/2026-11` is verified locally and waits for the owner. Work branch `phase-1/evidence` (from `golive/2026-11`) holds only the evidence records. `npm run verify` PASS (exit 0, 20 e2e), web unit tests PASS (43 files), migrations and MySQL test PASS on a throwaway MariaDB 11.4.13. **CI on the first push FAILED** (`node24-host`: `build:release` could not find `docx`, which the branch's lockfile nests under `packages/export`). Fixed locally in `2c500a1` with a test first; `npm run build:release` now passes. The fix is not pushed; CI has not re-run. See the 8 November section of docs/AUDIT.md. The live site and the PDF export on the host are NOT TESTED.
- **Waiting for the owner, in order (merging is the deploy, because `deploy.yml` deploys `main` once CI passes):** (1) done with the owner's OK: `git fetch` (main unmoved at `b86c9e3`) and push of `phase-1/evidence` (CI ran: failed, see above); (2) approve pushing the fix commit `2c500a1` so CI re-runs; (3) check no AI job is running, then merge the pull request with a merge commit; (4) the host session after the deploy: the `.htaccess` lines from `deploy/htaccess.volume`, `CLOUDFLARE_ONLY=report`, restart; (5) public checks, a short PDF export and a sign-in test; (6) `CLOUDFLARE_ONLY=on` if the log is clean; (7) a `[skip ci]` record commit of the new release; (8) delete the go-live branches so only `main` remains. Only `phase-1/evidence` is on origin; `main` is untouched.
- **Found, not changed:** `npm run verify` does not run the 43 web unit-test files (`apps/web` has no `test:coverage` script), and it does not run `build:release` either, which is how the CI failure was missed locally.

## Earlier state, 1 November 2026

- **Branch `golive/2026-11`:** go-live audit and SEO work, committed locally, not pushed or deployed (owner approval needed). See the 1 November go-live section of docs/AUDIT.md.

- **Live:** release `20261101T081309Z` (main `138aaf0`): design gap fixes (#87), sign-in heading and 3D book gilt (#88, checked live: one line, "studio." 13.7:1 light and 13.1:1 dark), CI lint memory and exact e2e title match (#89), clean-up (#90). Rollback target `20261101T075221Z`.
- **Clean-up done:** dead code, merged branches, worktrees, build output and outdated docs (docs/AUDIT.md, 1 November). Only `main` remains on GitHub (`docs/release-20261030` deleted on the owner's word, 1 November 2026).
- **To check by hand:** signed-in Blueprint and Titles on a real book (owner).

## Open owner decisions

- **Clerk sign-in methods:** owner decided on 1 November 2026 to leave Password on (email code still works through Continue).
- **Go-live security (branch `golive/2026-11`, not pushed):** all code-closable findings fixed (High S1 and S2, Medium M1 to M4, Low L1 to L5, L7, L9). Owner steps left: `CLOUDFLARE_ONLY` report then on (M5, L8); copy the new header lines from `deploy/htaccess.volume` into the docroot `.htaccess`, or add a Cloudflare rule removing `X-Turbo-Charged-By`; review `docx` 9.15 (adds a default table style) and the Clerk SDK minors before upgrading them.
- **Public page indexing:** decided 1 November 2026 (D-068): `/` and `/how-it-works` indexed, sitemap and robots built on `golive/2026-11`. Live after the owner approves push and deploy; then run Google's Rich Results Test and submit the sitemap in Search Console.
- **Unconfirmed since 25 October:** the pack gate blocks only on needs-check claims; the loosened house-style and invented-content rules (see that PR's audit table).
- **Origin lock:** `CLOUDFLARE_ONLY` ships off; the one-off host steps (`report`, read the log, then `on`) are in DEPLOYMENT.md and not recorded as done.
- **Book claims:** the 34 for-the-record claims on "AI For Everyday People" and the remaining clinical claims on Harni's books need a qualified reader.
- **Privacy and providers:** OpenRouter `data_collection` setting; privacy contact address, retention periods, lawful bases and transfer safeguards (KNOWN-ISSUES.md).
- **Phase 5 to 8 gates:** try each book type on the live site; whether to offer accounts to other self-publishers (phase 8).
- **Hook:** bring back the stop-time handoff hook (commit 5ef1177)?
