# Portable development scripts

- setup.mjs: clean npm lockfile install, pinned Playwright browser installation and prerequisite checks.
- doctor.mjs: runtime/native/browser prerequisites; --ports checks explicit loopback sockets. Never reads .env or data/.
- runtime.mjs: shared root, runtime and port validation.
- dev.mjs: standalone web/API startup with process-group shutdown and failure propagation.
- deploy.mjs: one-command production deploy and rollback to the cPanel host (`npm run deploy`); host facts in deploy/production.json, steps in docs/07-operations/DEPLOYMENT.md. Never reads the settings file or data/.
- pages-docx-to-md.mjs: converts DOCX files exported from Apple Pages into Volume Markdown for `POST /books/import-manuscript` (`node scripts/pages-docx-to-md.mjs <in.docx|folder> <outFolder> [--author "Name"]`). Chapters, parts and front and back matter come from the text (CHAPTER N, Day N, Part One, INTRODUCTION, ABOUT THE AUTHOR, the contents page) and then the paragraph style; headers, footers, the contents page and any KDP metadata tail are dropped. Prints chapter and section counts checked with parseManuscript. Test: packages/export/test/pages-docx-to-md.test.ts.
- check-docs.mjs: local Markdown file-link validation, excluding protected paths and source drafts. Links into ../reports/volume are checked only when that folder exists, so fresh clones and CI still pass.

Use the root npm scripts through Mise. See [setup](../docs/07-operations/SETUP.md), [development](../docs/07-operations/DEVELOPMENT.md) and [recovery](../docs/07-operations/BACKUP-RECOVERY.md). No new root seed/backup command is introduced; use existing server workspace migrations and Settings recovery controls.
