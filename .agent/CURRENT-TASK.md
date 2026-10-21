# Current task

## State on 20 October 2026

- Live at https://volume.gakinz.com on release `20261020T035644Z` (main `072dec3`). Rollback target `20261020T021731Z` (`npm run deploy -- --rollback`). Migrations 0001 to 0011 applied in production.
- Merged to main on 19 and 20 October (PRs #7 to #20): picture-book e2e fix, web polish, server hardening (D-050), own cover upload and listing preflight, acceptance fixes, move a book by project zip (D-051), claim fixes and autosave (D-052), public landing and branded sign-in (D-053), landing as the front with the Library at `/library` (D-054).
- Local evidence on `072dec3`: typecheck, lint and format PASS; Vitest 1,176 passed and 4 skipped; e2e 17 of 17.
- GitHub Actions creates no runs: GitHub's spam filter flagged the owner's account on 18 October 2026 (run #38 says "owner marked spammy"; profile and repo 404 when signed out). Only GitHub can lift it. Deploys use `npm run deploy -- --no-ci-check` with the owner's OK.
- Git cleaned: only `main` remains (plus `ci/run-check`, kept to start a run once Actions is back). PR #21 merged 20 October. Dead code removed and every guide brought up to date (PR #22, merged and deployed 20 October 2026).
- Live acceptance from 18 October 2026 is FAIL: no book has yet gone through to a postable pack end to end.

## Next

0. Clean production done 21 October 2026 (PR #37 to #42; live release `20261021T175454Z`, main `1f8128c`, rollback `20261021T173320Z`; PR #44 Mac-only). Harni's 16 books imported and published; two live test books with packs and .pages files ("Calm on the Night Shift", Harni; "Your First Website with AI", Gideon), three test books, about $8.40 spent. Owner decisions: page numbers on or off in clean-handbook; Volume mode quality gate counting only needs-check claims; delete or keep the two test books.
0. Simpler Editor, AI run messages, Cover studio steps and real cover thumbnails: merged (PR #26) and live on 21 October 2026 as release `20261020T231731Z` (main `0700b69`), rollback `20261020T035644Z`. Owner to test live. 21 October: Fix the whole book and one-click model fallback live as release `20261021T000422Z` (main `98bfcd3`, PR #27). Withdrawn-model fix (PR #28) live as release `20261021T072506Z` (main `09acba1`), rollback `20261021T000422Z`. Pending: merge `chore/prune-old-releases` (release pruning, host inode cap).
1. Owner: get the GitHub account flag lifted (account reinstatement request); then push `ci/run-check` and check CI on `main`.
2. Until then: deploy with `npm run deploy -- --no-ci-check`, which now runs typecheck, lint, format:check, test and e2e on this computer first and stops on any failure.
3. Owner: hold the phase 5 to 8 gates by trying each book type on the live site.
4. One free live run with the new prompts (`LIVE_AI=1`, budget zero), only with the owner's authorisation, then a fresh live acceptance pass.
5. Owner: OpenRouter `data_collection` setting and privacy contact facts.

## Open owner decisions

- How to run CI while GitHub is blocked (local checks only, the Ubuntu machine, or a mirror on another host).
- OpenRouter `data_collection` setting. Setting it may remove free models.
- Privacy contact address, retention periods, lawful bases and transfer safeguards (see KNOWN-ISSUES.md).
- Phase 5 to 8 owner gates, and whether to offer accounts to other self-publishers (phase 8).

Older dated sections are in `.agent/HANDOFF.md`.
