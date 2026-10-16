# Deploy files

- `passenger/app.cjs`: the Passenger startup file, copied to the release root by `npm run build:release`.
- `htaccess.volume`: the docroot `.htaccess` for `~/volume.gakinz.com/` (origin lock first; the Node.js selector appends its block).

Steps, settings and checks: [docs/07-operations/DEPLOYMENT.md](../docs/07-operations/DEPLOYMENT.md).
