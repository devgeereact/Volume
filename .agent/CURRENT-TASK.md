# Current task

## State on 23 October 2026 (uncommitted, not deployed)

- Local work on `main`, not committed: Writing page shows a paused rebuild properly (the freeze the owner saw on "How To Hand Over"), no book or monthly spending cap (D-057), Anthropic key first with OpenRouter fallback (D-058). Typecheck, lint, format, all unit tests and e2e 20 of 20 pass. Needs the owner's OK to commit and deploy, and `ANTHROPIC_API_KEY` in `.env` (local and host).

## State on 22 October 2026

- Live at <https://volume.gakinz.com> on release `20261022T105038Z` (main `db8b50b`, PR #50 merged). Rollback target `20261022T103226Z` (`npm run deploy -- --rollback`). Deployed by the owner with `npm run deploy -- --no-ci-check`; local checks (typecheck, lint, format, test, e2e 20 of 20) passed first. No new migrations (0001 to 0011 up to date).
- Whole-book rebuild from a new title (D-056), book bar cover fix and Library row fix are live. Checked live: `/`, `/library`, `/sign-in`, `/api/health` return 200; home page has 0 console errors; the `RebuildBook` chunk is served. Still to do by the owner: try one rebuild on a test book (it spends AI budget).
- Git consolidated 22 October: only `main` (in sync with origin). `ci/run-check` (one empty commit) was deleted locally and on origin at the owner's request; make a new branch to start a CI run once Actions is back. No worktrees, no stashes. Backup bundle: `~/repo-backups/Volume-2026-10-22-1137/`.

## State on 21 October 2026 (evening)

- Live at <https://volume.gakinz.com> on release `20261021T201339Z` (main `d1aceb0`, PRs up to #49). Rollback target `20261021T200148Z` (`npm run deploy -- --rollback`). Git cleaned 21 October: only `main` and `ci/run-check`, local and on GitHub; no worktrees.

## State on 20 October 2026

- Live at <https://volume.gakinz.com> on release `20261020T035644Z` (main `072dec3`). Rollback target `20261020T021731Z` (`npm run deploy -- --rollback`). Migrations 0001 to 0011 applied in production.
- Merged to main on 19 and 20 October (PRs #7 to #20): picture-book e2e fix, web polish, server hardening (D-050), own cover upload and listing preflight, acceptance fixes, move a book by project zip (D-051), claim fixes and autosave (D-052), public landing and branded sign-in (D-053), landing as the front with the Library at `/library` (D-054).
- Local evidence on `072dec3`: typecheck, lint and format PASS; Vitest 1,176 passed and 4 skipped; e2e 17 of 17.
- GitHub Actions creates no runs: GitHub's spam filter flagged the owner's account on 18 October 2026 (run #38 says "owner marked spammy"; profile and repo 404 when signed out). Only GitHub can lift it. Deploys use `npm run deploy -- --no-ci-check` with the owner's OK.
- Git cleaned: only `main` remains (plus `ci/run-check`, kept to start a run once Actions is back). PR #21 merged 20 October. Dead code removed and every guide brought up to date (PR #22, merged and deployed 20 October 2026).
- Live acceptance from 18 October 2026 is FAIL: no book has yet gone through to a postable pack end to end.

## Next

1. Humanizer edits (143) applied to Harni's 15 live books on 21 October 2026, version 1 kept in Versions. Clean production done 21 October 2026 (PRs #37 to #45). Harni has 17 published books on the live site (16 from Booksss.zip, "The Honest Truth About Nurses" from Drive). Three live test books kept for real use (owner): "Calm on the Night Shift", "Your First Website with AI", "Handover That Holds" (preflight 27 pass, legal claims verified with sources), about $8.40 spent. Owner decisions taken 21 October: page numbers stay on; Volume mode gate counts only needs-check claims (PR #45); test books kept; Harni's publish dates set to 21 September 2026; fix The Honest Truth About Nurses chapters 7 and 8; graphify the project. Follow-ups: `docs/08-change-management/plans/2026-10-21-clean-production-follow-ups.md`. Checked live 22 October 2026: all five follow-ups are done (publish dates 21 September 2026 on all 17 books; Nurses chapter 8 repeat removed by the owner on 21 October, version 2, 6,513 to 5,915 words, version 1 kept; no repeated paragraph left anywhere in the book; chapter 8 title "The Healer’s Heart" is right, "The Bonds We Build" is chapter 5).
2. Simpler Editor, AI run messages, Cover studio steps and real cover thumbnails: merged (PR #26) and live on 21 October 2026 as release `20261020T231731Z` (main `0700b69`), rollback `20261020T035644Z`. Owner to test live. 21 October: Fix the whole book and one-click model fallback live as release `20261021T000422Z` (main `98bfcd3`, PR #27). Withdrawn-model fix (PR #28) live as release `20261021T072506Z` (main `09acba1`), rollback `20261021T000422Z`. Pending: merge `chore/prune-old-releases` (release pruning, host inode cap).
3. Owner: get the GitHub account flag lifted (account reinstatement request); then push `ci/run-check` and check CI on `main`.
4. Until then: deploy with `npm run deploy -- --no-ci-check`, which now runs typecheck, lint, format:check, test and e2e on this computer first and stops on any failure.
5. Owner: hold the phase 5 to 8 gates by trying each book type on the live site.
6. One free live run with the new prompts (`LIVE_AI=1`, budget zero), only with the owner's authorisation, then a fresh live acceptance pass.
7. Owner: OpenRouter `data_collection` setting and privacy contact facts.

## Open owner decisions

- How to run CI while GitHub is blocked (local checks only, the Ubuntu machine, or a mirror on another host).
- OpenRouter `data_collection` setting. Setting it may remove free models.
- Privacy contact address, retention periods, lawful bases and transfer safeguards (see KNOWN-ISSUES.md).
- Phase 5 to 8 owner gates, and whether to offer accounts to other self-publishers (phase 8).

Older dated sections are in `.agent/HANDOFF.md`.
