# Portable development scripts

- setup.mjs: clean npm lockfile install, pinned Playwright browser installation and prerequisite checks.
- doctor.mjs: runtime/native/browser prerequisites; --ports checks explicit loopback sockets. Never reads .env or data/.
- runtime.mjs: shared root, runtime and port validation.
- dev.mjs: standalone web/API startup with process-group shutdown and failure propagation.
- deploy.mjs: one-command production deploy and rollback to the cPanel host (`npm run deploy`); host facts in deploy/production.json, steps in docs/07-operations/DEPLOYMENT.md. Never reads the settings file or data/.
- pages-convert.mjs: `npm run pages -- <pack.zip|folder>` adds an Apple Pages copy of `manuscript/*.docx` on a Mac (never quits Pages); conversion shared with the server in packages/export/src/pages.ts. See docs/07-operations/DEPLOYMENT.md.
- check-docs.mjs: local Markdown file-link validation, excluding protected paths and source drafts. Links into ../reports/volume are checked only when that folder exists, so fresh clones and CI still pass.

Use the root npm scripts through Mise. See [setup](../docs/07-operations/SETUP.md), [development](../docs/07-operations/DEVELOPMENT.md) and [recovery](../docs/07-operations/BACKUP-RECOVERY.md). No new root seed/backup command is introduced; use existing server workspace migrations and Settings recovery controls.
