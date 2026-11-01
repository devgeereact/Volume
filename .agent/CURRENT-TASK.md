# Current task

Current state only. Dated history is in `.agent/HANDOFF.md`; audits in `docs/AUDIT.md`; the live release in `docs/07-operations/DEPLOYMENT.md`.

## State on 1 November 2026

- **Live:** release `20261101T081309Z` (main `138aaf0`): design gap fixes (#87), sign-in heading and 3D book gilt (#88, checked live: one line, "studio." 13.7:1 light and 13.1:1 dark), CI lint memory and exact e2e title match (#89), clean-up (#90). Rollback target `20261101T075221Z`.
- **Clean-up done:** dead code, merged branches, worktrees, build output and outdated docs (docs/AUDIT.md, 1 November). Only `main` and the owner's `docs/release-20261030` remain on GitHub.
- **To check by hand:** signed-in Blueprint and Titles on a real book (owner).

## Open owner decisions

- **Clerk sign-in methods:** production has Password on and required, but the owner's account has no password, so the form shows a Password box that cannot be used (email code still works through Continue). Recommended: turn Password off in Clerk, leaving email code and Google.
- **Branch `docs/release-20261030`:** two commits not in main: a superseded 30 October release record and six screenshots committed by mistake under `.claude/worktrees/reports/`. Delete it, or keep the screenshots somewhere first?
- **Public page indexing:** D-053 keeps noindex (`INDEXABLE` is empty in `apps/web/src/site/seo.ts`); indexing was proposed on 25 October and is not decided.
- **Unconfirmed since 25 October:** the pack gate blocks only on needs-check claims; the loosened house-style and invented-content rules (see that PR's audit table).
- **Origin lock:** `CLOUDFLARE_ONLY` ships off; the one-off host steps (`report`, read the log, then `on`) are in DEPLOYMENT.md and not recorded as done.
- **Book claims:** the 34 for-the-record claims on "AI For Everyday People" and the remaining clinical claims on Harni's books need a qualified reader.
- **Privacy and providers:** OpenRouter `data_collection` setting; privacy contact address, retention periods, lawful bases and transfer safeguards (KNOWN-ISSUES.md).
- **Phase 5 to 8 gates:** try each book type on the live site; whether to offer accounts to other self-publishers (phase 8).
- **Hook:** bring back the stop-time handoff hook (commit 5ef1177)?
