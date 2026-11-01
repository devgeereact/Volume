# Portable development scripts

- setup.mjs: clean npm lockfile install, pinned Playwright browser installation and prerequisite checks.
- doctor.mjs: runtime/native/browser prerequisites; --ports checks explicit loopback sockets. Never reads .env or data/.
- runtime.mjs: shared root, runtime and port validation.
- dev.mjs: standalone web/API startup with process-group shutdown and failure propagation.
- build-release.mjs: `npm run build:release` builds the self-contained release folder for the host in `build/release/` (Passenger start file, one esbuild bundle of the server, the migrate command, the built web app).
- deploy.mjs: one-command production deploy and rollback to the cPanel host (`npm run deploy`); host facts in deploy/production.json, steps in docs/07-operations/DEPLOYMENT.md. Never reads the settings file or data/.
- pages-docx-to-md.mjs: converts DOCX files exported from Apple Pages into Volume Markdown for `POST /books/import-manuscript` (`node scripts/pages-docx-to-md.mjs <in.docx|folder> <outFolder> [--author "Name"]`). Chapters, parts and front and back matter come from the text (CHAPTER N, Day N, Part One, INTRODUCTION, ABOUT THE AUTHOR, the contents page) and then the paragraph style; headers, footers, the contents page and any KDP metadata tail are dropped. Prints chapter and section counts checked with parseManuscript. Test: packages/export/test/pages-docx-to-md.test.ts.
- pages-convert.mjs: `npm run pages -- <pack.zip|folder>` adds an Apple Pages copy of `manuscript/*.docx` on a Mac (never quits Pages); conversion shared with the server in packages/export/src/pages.ts. See docs/07-operations/DEPLOYMENT.md.
- agent_guard.py: GEE OS agent guard, a Claude Code PreToolUse hook wired in `.claude/settings.json`; answers allow, ask or deny and never prints file contents or secrets.
- guard.py: staged-file guard run by `.githooks/pre-commit` (enable once per clone with `git config core.hooksPath .githooks`).
- verify.py: GEE OS contract check (`python3 scripts/verify.py`): required project files and guards are present. Not a test of the app, and not the same as `npm run verify`, which runs every Check Volume step.
- check-docs.mjs: local Markdown file-link validation, excluding protected paths and source drafts. Links into ../reports/volume are checked only when that folder exists, so fresh clones and CI still pass.

Use the root npm scripts through Mise. See [setup](../docs/07-operations/SETUP.md), [development](../docs/07-operations/DEVELOPMENT.md) and [recovery](../docs/07-operations/BACKUP-RECOVERY.md). No new root seed/backup command is introduced; use existing server workspace migrations and Settings recovery controls.
