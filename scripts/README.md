# scripts

`dev.mjs` starts the server on 127.0.0.1:5181 and web app on 127.0.0.1:5180; `npm run dev` invokes it. Ctrl C stops both processes it started.

There are no root seed, backup or verify-env helper scripts. Use server workspace commands for migration and profile seeding, and the Settings backup controls. See [server commands](../apps/server/README.md) and [backup/restore](../docs/BACKUP-RESTORE.md). Do not print environment values.
