# Deploy files

- `passenger/app.cjs`: the Passenger startup file, copied to the release root by `npm run build:release`.
- `production.json`: host alias, URL, app folder, Node 24 path and the public Clerk publishable key, read by `npm run deploy` (no secrets).
- `htaccess.volume`: the docroot `.htaccess` for `~/volume.gakinz.com/` (origin lock first; the Node.js selector appends its block).

Steps, settings and checks: [docs/07-operations/DEPLOYMENT.md](../docs/07-operations/DEPLOYMENT.md).
