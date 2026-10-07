# Portable development scripts

- setup.mjs: clean npm lockfile install, pinned Playwright browser installation and prerequisite checks.
- doctor.mjs: runtime/native/browser prerequisites; --ports checks explicit loopback sockets. Never reads .env or data/.
- runtime.mjs: shared root, runtime and port validation.
- dev.mjs: standalone web/API startup with process-group shutdown and failure propagation.
- check-docs.mjs: local Markdown file-link validation, excluding protected paths and source drafts.

Use the root npm scripts through Mise. See [setup](../docs/07-operations/SETUP.md), [development](../docs/07-operations/DEVELOPMENT.md) and [recovery](../docs/07-operations/BACKUP-RECOVERY.md). No new root seed/backup command is introduced; use existing server workspace migrations and Settings recovery controls.
