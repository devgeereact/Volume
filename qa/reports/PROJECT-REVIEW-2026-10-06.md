# Volume project review, 6 October 2026

Status: PARTIAL for release acceptance. Local corrections are implemented; see the correction ledger below. The numbered findings preserve the original review and are not the current open-issue list.

## Scope and evidence

Reviewed the current task, handoff, project rules, roadmap, PRD acceptance criteria, decision records, testing and architecture documents, plus source for web flows, server routes, job budgets, project transfer, backups, authentication, Markdown parsing and export preflight. This is a cross-project review, not a line-by-line audit of all 623 tracked files or a penetration test.

Earlier today on the same application source: typecheck, lint, formatting and web build PASS. Tests: core 75, AI 147, export 87 and server 176 passed, 485 total. MySQL and EPUBCheck skipped. Browser smoke/e2e previously recorded PASS on 5 October, not rerun today. No live AI, remote database or account credit checked. No .env or project data read.

Targeted runtime reproduction: a temporary script in /tmp used an in-memory SQLite database, mock providers and dotenv disabled. A malformed child row in an exported project caused import rejection, but the project count rose from 1 to 2. The failed import left a partial project. No real user data was touched.

## Priority 1: correctness and release blockers

1. **PASS locally after fix: project import rollback.** `apps/server/src/repos/transfer.ts:199` commits the profile/book before files and child rows are imported in a later transaction at line 239. A later failure leaves partial work. Reproduced locally, then fixed using one transaction for all imported rows and file chunks. Four regression/success tests pass, and the original reproduction no longer leaves a partial book. Full manifest validation remains item 13; live MySQL rollback is not yet tested.
2. **PARTIAL: budget enforcement stops at the stage boundary.** `apps/server/src/jobs/runner.ts:259` checks a stage estimate. The adapter constructs package options at `apps/server/src/adapters/openrouter-ai.ts:783` without a remaining budget; `apps/server/src/ports/ai.ts:220` exposes no budget field. Internal retries, JSON repairs and style rewrites therefore have no book/monthly-cap check supplied by the server. Source finding, no paid calls attempted. Carry the remaining allowance through and account for each extra call, including concurrent jobs.
3. **NOT TESTED: current AI quality fixes live.** The handoff records run 3 and r6 fixes, but live confirmation with covers remains outstanding. Credit depletion is a recorded blocker, not freshly checked. Run a budgeted non-fiction book and review invented facts, resources, glossary, repetition, word targets, claims, marketing and covers.
4. **NOT TESTED: cPanel MySQL acceptance.** Run all migrations and the integration test against an empty test database; verify TLS, blob files, jobs, interruption/recovery and backup restoration before migrating real work. The existing MySQL test is one migration/repository/blob check, not the complete production flow.
5. **PARTIAL: KDP configuration.** `config/kdp-rules/2026-10-03.json` still marks trim lists, interior margins, barcode area and cover safe distances unverified. Verify from official sources and date the new configuration before treating print packs as upload-ready. No live KDP guidance was checked during this review.
6. **NOT TESTED: final export acceptance.** EPUBCheck, 300-page/80,000-word PDF performance, Word/Kindle Previewer checks, wrap comparison and a manual KDP draft upload remain release checks.

## Priority 2: missing or incomplete product features

7. **PARTIAL: Markdown manuscript import.** Core parsing and asset upload exist, but no server route or web workflow was found that parses a .md upload into a new book and saved section versions (PRD AC2.6). Project ZIP import is a separate feature.
8. **PARTIAL: blueprint version tools.** Server history endpoints exist, but the API-mode UI at `apps/web/src/routes/blueprint/BlueprintApi.tsx:572` lists versions without compare/restore controls. Demo mode has restoration behaviour. Complete AC6.3 for real books.
9. **PARTIAL: editor stack.** `apps/web/src/routes/editor/EditorCanvas.tsx:503` uses contenteditable blocks, while AGENTS.md specifies TipTap. Owner must decide whether to implement TipTap or formally accept the current approach. Verify paste, undo, selection, input methods and saving whichever editor is retained.
10. **FAIL: profile photo action is a placeholder.** `apps/web/src/routes/profiles/IdentityTab.tsx:49` explicitly says upload comes later. Implement upload, persist the asset and verify its use in author pages, or remove the promise from the current release.
11. **PARTIAL: writing cost confirmation.** `apps/web/src/routes/writing/WritingApi.tsx:149` starts writing immediately. PRD AC7.1 requires confirmation when the high estimate exceeds half the remaining book budget. An estimate is shown, but that conditional confirmation is missing from this path.
12. **PARTIAL: pricing before publication.** The API README records that prices are entered only on Published, so Export royalties are unavailable beforehand. Provide price entry while preparing a book if pre-publication royalty planning is intended.
13. **PARTIAL: import robustness.** The project manifest is cast from JSON with shallow checks (`transfer.ts:156`). Schema-check rows, required arrays, references and supported versions before mutation. ZIP reading allows 512 MB per entry with no aggregate expansion limit (`apps/server/src/lib/zip.ts:13`), using synchronous decompression. Add aggregate limits and check responsiveness. Memory exhaustion was not attempted.

## Priority 3: verification, maintenance and documentation

14. Expand browser acceptance coverage: current permanent E2E is one broad scenario. It does not exercise every item in docs/06-quality/TEST-STRATEGY.md, including a real mid-writing server restart, blueprint restoration, backup restoration and a dedicated keyboard/accessibility pass. Queue crash recovery and SSE replay do have lower-level tests.
15. Measure the documented coverage targets. Passing tests do not demonstrate the 90% core and 80% AI/export/server targets. No coverage evidence was reviewed.
16. Add automated GitHub checks if desired. No .github workflow currently exists. This is a maintenance recommendation, not a missing v1 acceptance requirement.
17. Reduce initial web payload. Today's build warned about a roughly 1.47 MB main JavaScript bundle before compression. Measure load behaviour and split heavy screens where useful.
18. Reconcile PROJECT.yml (phase 0, Drizzle), stale KNOWN-ISSUES entries and proposed decision statuses with the built application. Reconcile the strict no-any rule with the documented migration alias. docs/06-quality/TEST-STRATEGY.md names a test:live script absent from package scripts; align the instructions with the actual live runner.
19. Align backup documentation with implementation. The architecture describes 14 daily plus 8 weekly backups and npm run backup; code keeps the newest 14 SQLite snapshots, and root scripts have no backup command. MySQL backups rely on cPanel. Document and test the actual restore path.
20. Resolve D-020: redirect resolution defaults on despite the proposed approval status and the non-OpenRouter network permission rule. Owner should approve it explicitly or choose default off.
21. Confirm profile facts: Gideon's imprint/credentials and Harni's personal details remain listed as owner decisions. Complete the documented environment examples without exposing secrets.

## Later roadmap

- Phase 6: complete and validate fiction/workbook writing, story continuity, exercise/fill-in layout and genre-specific golden exports. Templates and generic blocks already exist, so these are not blank-slate features.
- Phase 7: illustrated spread production, consistent characters, age-appropriate checks and full-colour bleed export. A picture-book configuration file is not proof of a working illustrated pipeline.
- Phase 8: batch scheduling, publication limits, real authentication/sessions/roles and account isolation. The current provider is explicitly a single-owner auth stub.
- Unscheduled: series tools, royalties/launch dashboard, hardcover wraps and other publishing platforms.

## Original recommended order (historical)

Import rollback is fixed locally. Address budget propagation next. Complete Markdown import, real blueprint compare/restore, the editor decision, photo upload and cost confirmation. Reconcile rules/docs and verify KDP configuration. Run the remaining automated and manual acceptance checks, then the budgeted live confirmation and MySQL validation. Keep later roadmap features separate from the v1 release decision.

## Correction ledger, 6 October 2026

| Findings | Local correction and evidence | Status |
|---|---|---|
| 1, 13 | Single import transaction; migrated-column schemas, ID/reference checks, missing-file rejection, duplicate/path ZIP rejection, 128 MiB entry and 256 MiB total expansion limits. Photo assets also round-trip. Transfer tests pass. | PASS locally |
| 2 | A server callback checks every package-level provider attempt, repair, rewrite and adapter task. Shared budget reservations serialise overlapping jobs. Prior paid usage is preserved on failure. Mock regression tests cover retries, multi-task spend and concurrency. Estimates still depend on provider pricing/usage. | PASS locally, no live spend |
| 5 | New dated KDP rules. Trim lists, white/cream page limits, large-trim threshold, margins and safe text distances verified from official pages. Barcode size/clearance is partial; automatic placement needs the generated template. | PARTIAL |
| 6 | EPUBCheck 5.4.0 passes. Synthetic 83,815-word PDF has 326 pages, embedded fonts and no warnings. Sampled Word fixture layouts now pass; Kindle licence approval and KDP interaction remain outstanding. [Evidence](LOCAL-VALIDATION-2026-10-06.md). | PARTIAL |
| 7 | Library imports a .md file into a new book and imported section versions atomically. API and browser edit/reload tests pass. | PASS |
| 8 | API history fetches full versions, compares side by side and restores as a new draft with version-conflict protection. Browser restore passes. | PASS |
| 9 | TipTap with approved free packages replaces the hand-written editable blocks. Typing, undo/redo, plain paste, save/reload and author-note workflow pass browser checks. Full input-method/device acceptance is not exhaustive. | PASS for tested flows |
| 10 | Saved profiles upload JPEG/PNG portraits; persist in brand data and export on About the Author pages. Browser persistence, EPUB/DOCX inclusion and project round-trip tests pass. | PASS |
| 11, 12 | Writing requires a cost estimate and confirms when high cost exceeds half remaining budget. Export accepts list prices before publication. Browser checks pass. | PASS |
| 14 | Added import/undo/paste/reload, blueprint restore, cost confirmation, pricing and photo browser checks. An actual temporary server process is interrupted and restarted; writing recovery passes after simulating the stale-heartbeat grace period. Backup copies pass integrity checks. Full accessibility/device/manual restore acceptance is not exhaustive. | PARTIAL |
| 15 | Owner approved Vitest V8 coverage. All four line thresholds pass; source scope and measurements in [local validation](LOCAL-VALIDATION-2026-10-06.md). CI enforces them locally. | PASS locally; remote CI NOT TESTED |
| 16 | GitHub CI workflow prepared for mock-only checks; native dependency script allowlist recorded. No remote run yet. | NOT TESTED remotely |
| 17 | Heavy routes load on demand. Main index 373 kB, shared UI 423 kB, editor 528 kB on demand. Build passes. No cold-load timing claim. | PASS for splitting |
| 18, 19, 20 | Current metadata uses Kysely/phase 5. Known issues reconciled. Migration handle uses unknown instead of any. Missing live-script instruction removed. Backup docs reflect actual 14-snapshot retention and include rollback/restore verification. Redirect resolution defaults off pending D-020 approval. | PASS locally |
| 3, 4, 21 | Free titles/blueprint pass; full writing failed on summary truncation and both Gemma routes returned upstream invalid-key errors, recorded cost zero. Production-model quality remains unverified. cPanel deferred by owner; profile facts and environment examples remain owner decisions. See [free validation](FREE-AI-VALIDATION-2026-10-06.md). | PARTIAL; MySQL deferred |

Changes are committed locally at the owner’s request. Later roadmap phases remain outside this correction pass.
