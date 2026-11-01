# Current task

Current state only. Dated history is in `.agent/HANDOFF.md`; audits in `docs/AUDIT.md`; the live release in `docs/07-operations/DEPLOYMENT.md`.

## State on 1 November 2026

- **Live:** design gap fixes (PR #87). The sign-in heading and 3D book gilt fix (PR #88) is merged but not yet deployed: "Check Volume" on main failed on the macOS runner (ESLint out of memory, then a full-book e2e substring match). PR #89 (`ci/lint-memory`) fixes both; merging it deploys main with #88 included.
- **Clean-up (in progress, uncommitted on `ci/lint-memory`'s working tree):** dead code removed (`BlueprintInspector.tsx`, nine unused exports, the unused Schibsted Grotesk font package); 37 merged remote branches and 2 local ones deleted; agent worktrees and regenerable build output removed; docs being brought up to date. Next: gate, PR, merge.
- **Checks to run after deploy:** live `/sign-in` heading on one line and "studio." visible; signed-in Blueprint and Titles on a real book (owner).

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
