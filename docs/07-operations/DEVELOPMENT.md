# Development

Run commands from this repository with its Mise runtime:

```sh
mise exec -- npm run doctor -- --ports
mise exec -- npm run dev
```

Web: http://127.0.0.1:5180. API: http://127.0.0.1:5181. The web proxy keeps requests and SSE on the same origin. Both listen only on IPv4 loopback. Use these explicit addresses rather than IPv6 localhost. LAN/public access remains disabled while authentication is an owner-only local stub.

The launcher resolves its own repository root, checks runtime/native prerequisites and ports, and stops only its own process groups on Ctrl+C/SIGTERM. It reports an unexpected child exit as failure and closes the sibling process. It never terminates a pre-existing listener to free a port. Choose alternate ports deliberately with PORT and VOLUME_WEB_PORT; VOLUME_API_PORT, if supplied, must match PORT. Keep WEB_ORIGINS consistent when changing the frontend port. No environment values are printed by prerequisite checks.

Normal startup uses the application's existing private configuration and data handling. For isolated mock validation, set VOLUME_LOAD_ENV=false, AI_PROVIDER=mock, OPENROUTER_API_KEY to an empty value, DATA_DIR to a new disposable directory and SQLITE_PATH to a database inside it. Do not point tests at owner data. The tooling tests and end-to-end harness already create disposable fixtures.

```sh
mise exec -- npm run typecheck
mise exec -- npm run lint
mise exec -- npm run format:check
mise exec -- npm run docs:check
mise exec -- npm run test:tooling
mise exec -- npm test
mise exec -- npm run build -w apps/server
mise exec -- npm run build -w apps/web
mise exec -- npm run e2e
```

A passing dev server is not publishing acceptance. Known PDF, live AI and cPanel limitations remain in [known issues](../KNOWN-ISSUES.md). External/live runs and deployment are separately authorised operations. The parent workspace launcher is optional and is not needed to restore or run this repository.
