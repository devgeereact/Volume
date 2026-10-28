# Current task

## State on 28 October 2026 (prompt caching, local only, nothing committed)

- Anthropic reported a low prompt cache hit rate. Cause: direct Anthropic calls (D-058) sent no `cache_control`. Built (D-063): system part marked `ephemeral` in `packages/ai/src/provider/anthropic.ts`, Fable 5.1 cache read price fixed ($0.25), guard test `packages/ai/test/prompt-caching.test.ts`. Gate: typecheck, lint, format, docs PASS; ai 261 and server 559 tests PASS. Not tested live (needs `LIVE_AI=1` and a budget).
- Prompt reorder built (D-064, owner OK): `# Per call` split in prompt User parts, `cachePrefix` on the user message, second cache mark in `AnthropicClient`. New versions writing.chapter v10, chapter-fiction v2, chapter-workbook v3, chapter-reference v2, extend-section v7, extend-section-fiction v2. Gate: typecheck, lint, format, docs PASS; unit tests core 185, ai 265, export 206, server 559, web 240 PASS; e2e see HANDOFF.
- Live check PASS (28 October): chapters 2 and 3 read 94% of their input from the cache, $0.081 for three chapters, quality checks fine (details in D-064). Script: `LIVE_AI=1 npx tsx packages/ai/scripts/live-cache.ts <out folder>`.
- Next: owner asks to commit, PR, merge and deploy (with the 27 October work). After deploy, watch the hit rate in the Anthropic Console.

## State on 27 October 2026 (originality and audit, local only, nothing committed)

- Same branch `feat/smoke-test-and-polish`, uncommitted on top of `9517aa7`: originality preflight warning (step 9 of the eBook process), audit quick wins, NotFound title and noindex, failed-job notice clears after a later success. Audit 84/100: `../reports/volume/WEBSITE-AUDIT-2026-10-27.md`.
- Owner said yes to all three held items (27 October, late), all built locally: dependency fixes (zod 4.6.7, fastify 5.12.7, fast-uri, vite 8.3.5; `npm audit` 0), origin lock by Cloudflare IP ranges `CLOUDFLARE_ONLY` (D-062, ships off), public pages draw before Clerk with a lazy signed-in frame (308.5 to 125.3 kB gzipped up front). HTTPS redirect confirmed live (Cloudflare 301).
- Gate green: typecheck, lint, format, docs, hooks, unit tests (core 185, ai 258, export 206, server 559, web 240), e2e 20, smoke 416/0 with both pack phases, `npm audit` 0.
- Next: owner asks to commit, PR, merge, deploy; then live check; then on the host `CLOUDFLARE_ONLY=report`, read the log, then `on` (DEPLOYMENT.md one-off steps). Then the open decisions and book moves below.
- Closed from the gap list below: NotFound title and noindex; SECURITY.md robots line was accurate; guardrails properNames gap was not real.

## State on 25 October 2026 (smoke test and polish, local only)

- Branch `feat/smoke-test-and-polish` (not merged, not deployed, owner asked for push only). Four engineers' work: editor and export completeness (3f7c334, 513bdd9), claims gate and house-style false positives (11bf667, b4401c4), SEO and public pages (d950900, dbbb271), smoke script and UX fixes (78312af). Local gate green: typecheck, lint, format:check, unit tests in every workspace, e2e 20 passed.
- Owner decisions to confirm: (1) the pack gate now blocks only on needs-check claims (it counted every open claim before); (2) indexing the public pages is a proposal, D-053 item 5 keeps noindex (flip INDEXABLE in apps/web/src/site/seo.ts and INDEXABLE_KEYS in apps/server/src/http/seo.ts, then record a superseding decision); (3) the house-style and invented-content rules were loosened for legitimate uses, review the audit table in the PR.
- Known gaps: the app swaps to sample data under a small Demo badge when the server dies mid-session (D-016); `HostedAuth` shows a blank loader until Clerk loads, so crawlers get only the no-script copy; in-app NotFound has no title or noindex; docs/05-security/SECURITY.md still says robots.txt disallows everything; packages/ai guardrails do not use the properNames list; mock books are 20 pages so the pack build is refused in the smoke script (e2e covers a real build).

## State on 25 October 2026 (export last)

- Branch `perf/cover-preview-cache-and-polling` also holds D-060: Export is the last step, the pack carries named marketing files, and a pack is Exported until something in it changes. Tested locally on a mock book; not deployed. Owner opens one PR, merges and deploys; then check the live Export page.

## State on 25 October 2026 (local build checked)

- PRs #65 and #66 are merged and deployed. Branch `perf/cover-preview-cache-and-polling` (not yet a PR, not deployed) now holds: slower shelf polling when idle, concept previews load after the main one, the title's position is sent so Move up and drag work, the title keeps its size at any position and is lifted clear of the author in every design, a Build again button, and honest budget copy. Tested on a local book built with the mock AI (no OpenRouter calls): create, titles, blueprint, write, concepts, edit, build, rebuild.
- Next: owner opens one PR for the branch, merges and deploys; then check the studio live in Chrome (Build again on Steady On Your Feet, compare preview and build, title size and Move up), and speed. Owner still decides the 34 and 8 for-the-record claims on AI For Everyday People and How To Hand Over.

## State on 25 October 2026

- PR #65 (cover preview is the build, untouched art with adaptive ink, four distinct concepts, new cover prompts) is open and not deployed. After deploy: check the Cover studio live (eBook, thumbnail, wrap, cards, pickers), rebuild covers and packs. Still with the owner: claims (37, 63, 34), imprints and social links.

## State on 24 October 2026 (end)

- Live release `20261023T150002Z` (PRs #58 and #59). Both Harni nursing books have built upload packs, 0 preflight blocks. Owner confirmed Steady On Your Feet is the second book and has reviewed the remaining claims. Open with the owner: tick or resolve those claims in the app, the 34 for-the-record claims on AI For Everyday People, imprints and social links.

## State on 24 October 2026 (late)

- Main is `0eb6694` (PRs #55 to #58 merged). Whether PR #58 is deployed is not confirmed: check the host release name. Owner decisions open: confirm the second book (Steady On Your Feet or Life Lessons as a Nurse), imprints and social links, the 34 for-the-record claims on AI For Everyday People.
- Both Harni nursing books written with covers and claims researched against official sources. Steady On Your Feet (103 pages): pack built. Read Fast, Write Safe (67 pages): FIXED and live (PR #59, pack built, 0 blocks). It had failed preflight `Fonts embedded, no Type 3` because the micro sign in "µg" is missing from Atkinson Hyperlegible Next (found by reading the interior PDF's Type 3 ToUnicode map). Fixed in branch `fix/micro-sign-print-font` (print-glyphs maps µ to the Greek mu); needs merge, deploy, then rebuild the pack. Claims still for a qualified person: 37 and 63, plus 72 and 58 for the record.
- Full detail: `../reports/volume/WORK-REPORT-2026-10-24.md`.

## State on 24 October 2026 (early)

- Live on main `615f800` (PR #55). Two Harni books in progress: "Steady On Your Feet" (writing, new prompts) and the abbreviations guide (titles). Owner: run one deploy at a time; confirm the second book title; decide on the 34 for-the-record claims on AI For Everyday People. Details in HANDOFF.md (24 October entry).

## State on 23 October 2026 (night)

- Live on release `20261023T080607Z` (main `bacd365`, PRs #51 to #53). Rollback target `20261023T065808Z`. "AI For Everyday People" is finished with its upload pack and marketing. "How To Hand Over": rebuild text done, Chapter 1 flag cleared, 64 clinical claims left for qualified human review, no pack. Owner to confirm: imprints SoulRefresh and Everyday Essentials, theme substitutions, social links. The new Build covers again button (PR #53) has no live or automated test of its own path.

## State on 23 October 2026 (evening)

- Live on release `20261023T065808Z` (main `67651e5`, PRs #51 and #52). Rollback target `20261023T053832Z`. Anthropic key live; no book or monthly cap; out of credit pauses with a top-up notice. Start research now runs research by itself. Five profiles set up from the owner's briefs. "AI For Everyday People" is mid-writing; "How To Hand Over" rebuild text is done (claims to verify open).

## State on 23 October 2026 (earlier, now deployed)

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
