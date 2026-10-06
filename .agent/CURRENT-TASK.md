# Current task

**Phase:** round 2 build complete on the Mac (5 October 2026). Next: owner review, live run 4, then cPanel MySQL.
**Status:** built and verified locally; waiting on the owner for OpenRouter credit and cPanel details.

## Where the build stands
- Every screen in apps/web runs on apps/server (Fastify, Kysely, SQLite now, MySQL ready) with the demo data as a fallback when the server is off.
- Real AI through OpenRouter (packages/ai) and real exports (packages/core, packages/export): Word, print PDF, EPUB, TXT, MD, eBook cover, paperback wrap, preflight, KDP pack.
- Checks, all PASS on 5 October 2026: `npm run typecheck`, `npm run test` (core 75, ai 147, export 87 plus 1 skipped, server 176 plus 1 skipped), `npm run lint`, `npm run format:check`, `npm run build -w apps/web`, `npm run smoke -w apps/web`, `npm run e2e`.
- Live books on the owner's key: run 2 and run 3 wrote complete books end to end; run 3 needed no hand edits. Fixes from run 3 are in (r6-polish) but not yet confirmed live.
- Run it: `npm run dev` at the root, then open http://127.0.0.1:5180.

## Next steps
1. Live run 4 (budgeted, about $3) to confirm the run 3 fixes and build covers. Blocked: OpenRouter credit used up.
2. cPanel MySQL (D-015): owner gives host, port, database, user and password, and enables Remote MySQL for the Mac's IP; then run the MySQL test (MYSQL_TEST_URL) and migrate. The owner chose to finish the local build first.
3. Owner review of the app and the run 3 book.

## Waiting on the owner
- Top up OpenRouter credit.
- D-020: keep the Google redirect lookups on (research sources become real links)?
- Gideon Akinlotan: imprint (GAkinz or Real Mr Gee) and any credentials to print; the GAkinz site does not name him.
- Harni Muharami: the personal line (wife and mother, hobbies) comes from the drafts, not harni.uk; keep or drop.
- Add to .env.example by hand (agents cannot write it): MYSQL_SSL_CA, MYSQL_CONNECTION_LIMIT, WEB_ORIGINS, LOG_LEVEL, MAX_JSON_BYTES, MAX_UPLOAD_BYTES, JOBS_ENABLED, AUTO_MIGRATE, AI_PROVIDER, VOLUME_ROOT, RESOLVE_SOURCE_REDIRECTS, EXPORT_PROVIDER, DATA_DIR, MOCK_STREAM_DELAY_MS, MOCK_FAIL_NEXT_WRITING.
- Git: owner authorised the initial project commit and push to the private devgeereact/Volume repository on 6 October 2026.

## Backup
- Phase 0 files archived at the session scratchpad (volume-phase0-backup.tgz). Initial project commit authorised on 6 October 2026.

## Review, 6 October 2026 (Codex)
- Verification PASS: typecheck, lint, format:check, web build; 485 tests passed, 2 skipped (MySQL and EPUBCheck). Tests completed outside the sandbox for temporary localhost servers and Chromium.
- Release checks remain: live confirmation of r6 fixes, cPanel MySQL, four unverified KDP rules, long-book benchmark and owner export/KDP review. Live credit and database details are recorded blockers, not checked against accounts today.
- Records need reconciliation: PROJECT.yml still says phase 0 and Drizzle; KNOWN-ISSUES includes already completed work; TipTap is specified but EditorCanvas uses contenteditable; MigrationDb uses a documented any alias despite the strict rule; redirect lookups default on while D-020 remains proposed. No implementation or rule changes made.
- Global rules reviewed and committed separately: ~/.agents/gee-os, main, 6233c13 (GLOBAL.md only). Volume initial commit and GitHub push subsequently authorised on 6 October 2026.
- Next: resolve release checks and documentation choices before calling v1 ready.

## GitHub project repository, 6 October 2026
- Owner requested the full project in a private repository named Volume under devgeereact.
- Initial commit includes source, config, prompts, tests, assets and project records. Secrets, local data, dependencies and generated outputs remain excluded by .gitignore.
- Pre-commit scan: 623 candidate files, no recognised credential patterns, no sensitive paths or symlinks, no files over 50 MB. This is a targeted scan, not proof that every possible credential format is absent.
- Next: verify the pushed commit and continue the release checks listed above.
