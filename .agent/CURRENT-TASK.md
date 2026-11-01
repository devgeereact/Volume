# Current task

Current state only. Dated history is in `.agent/HANDOFF.md`; audits in `docs/AUDIT.md`; the live release in `docs/07-operations/DEPLOYMENT.md`.

## State on 1 November 2026

- **Branch `golive/2026-11`:** go-live audit and SEO work, committed locally, not pushed or deployed (owner approval needed). See the 1 November go-live section of docs/AUDIT.md.

- **Live:** release `20261101T081309Z` (main `138aaf0`): design gap fixes (#87), sign-in heading and 3D book gilt (#88, checked live: one line, "studio." 13.7:1 light and 13.1:1 dark), CI lint memory and exact e2e title match (#89), clean-up (#90). Rollback target `20261101T075221Z`.
- **Clean-up done:** dead code, merged branches, worktrees, build output and outdated docs (docs/AUDIT.md, 1 November). Only `main` remains on GitHub (`docs/release-20261030` deleted on the owner's word, 1 November 2026).
- **To check by hand:** signed-in Blueprint and Titles on a real book (owner).

## Open owner decisions

- **Clerk sign-in methods:** owner decided on 1 November 2026 to leave Password on (email code still works through Continue).
- **Go-live security (branch `golive/2026-11`, not pushed):** two High findings fixed (export Chromium injection, negative price past the guest cap). Five Medium findings open in docs/AUDIT.md; recommended next: M1 (fail closed when `AUTH_MODE` is not explicit on a hosted build), then M2 (models owner-only).
- **Public page indexing:** decided 1 November 2026 (D-068): `/` and `/how-it-works` indexed, sitemap and robots built on `golive/2026-11`. Live after the owner approves push and deploy; then run Google's Rich Results Test and submit the sitemap in Search Console.
- **Unconfirmed since 25 October:** the pack gate blocks only on needs-check claims; the loosened house-style and invented-content rules (see that PR's audit table).
- **Origin lock:** `CLOUDFLARE_ONLY` ships off; the one-off host steps (`report`, read the log, then `on`) are in DEPLOYMENT.md and not recorded as done.
- **Book claims:** the 34 for-the-record claims on "AI For Everyday People" and the remaining clinical claims on Harni's books need a qualified reader.
- **Privacy and providers:** OpenRouter `data_collection` setting; privacy contact address, retention periods, lawful bases and transfer safeguards (KNOWN-ISSUES.md).
- **Phase 5 to 8 gates:** try each book type on the live site; whether to offer accounts to other self-publishers (phase 8).
- **Hook:** bring back the stop-time handoff hook (commit 5ef1177)?
