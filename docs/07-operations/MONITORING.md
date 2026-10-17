# Monitoring

- Public: `GET /api/health` answers `{"status":"ok"}` (200) or `{"status":"unavailable"}` (503, database unreachable) and nothing else. The cPanel cron keep-alive hits it every 4 minutes (see [deployment](DEPLOYMENT.md)); the same URL suits an uptime checker.
- Signed in: `GET /api/v1/health` adds the database client, AI provider, exporter and uptime (used by the web app).
- Logs: structured, redacted JSON (pino) on stdout and stderr, which Passenger writes to its application log on the host. Jobs and their states are in the database.
- Remote alerting and telemetry are not configured; do not claim production monitoring.
