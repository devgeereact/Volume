# Current task

Current state only. Dated history is in `.agent/HANDOFF.md`; audits in `docs/AUDIT.md`; the live release in `docs/07-operations/DEPLOYMENT.md`.

## State on 8 November 2026

- **Live (9 November 2026):** release `20261109T000812Z` from main `4b00fd2`: the go-live security fixes and public-page indexing (PR #91), the sign-in fix (PR #92) and the corrected deploy live check (PR #93). Rollback target `20261108T230459Z`. Checked with public GETs after the deploy: `/` and `/how-it-works` are `index, follow`; `/sign-in` and `/library` are `noindex, nofollow`; the sitemap lists only those two public pages; `/api/v1/books` answers 401 signed out; `X-Powered-By` is gone. The sign-in fix was confirmed working live by the owner.
- **Waiting for the owner (host, by hand), then Claude checks:** (1) add the header lines from `deploy/htaccess.volume` to the docroot `.htaccess` (the live site still sends `X-Turbo-Charged-By: LiteSpeed`); (2) set `CLOUDFLARE_ONLY=report` in the shared settings file on the host, restart, visit the site, read the app log for "request did not come through Cloudflare", then set `on` if clean (leave off and log an issue otherwise); (3) sign in, open a book and build a short PDF export (proves the isolated Chromium; no AI credit); (4) Google's Rich Results Test and sitemap submission in Search Console. Then Claude runs the public checks again.
- **Finding:** the live `robots.txt` is Cloudflare's managed block (`User-agent: *` with `Allow: /` and AI-crawler blocks) followed by Volume's own allow-list and the sitemap line. Private pages stay out of search through their `noindex` meta tag and header, but `robots.txt` alone does not keep crawlers off them. Decide in Cloudflare whether to keep "Manage robots.txt".
- **CI flake:** `packages/export/test/cover-layers.test.ts` failed 4 times with "Unable to capture screenshot" (Ubuntu and node24-host); each passed on re-run. It once blocked a deploy. Fix with the cover work (retry, browser flags).
- **Reported by the owner, not started:** the error-fixing section says "cleared" but the issue returns after a refresh (causes found: house-style fix skips banned phrases that preflight blocks; soften and remove mark a claim resolved when its sentence is not found; "Fix everything" works from a stale snapshot); the cover generator misaligns (spine text unreadable on 22 of 51 palettes, long titles cut off on the spine, off-centre front, three layout engines that disagree); originality checks. Agreed order: errors, then cover, then quality.
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
