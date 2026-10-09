# Restore Volume on macOS or Linux

Copy/clone the source and committed npm lockfile. Exclude node_modules, dist, caches, private .env and owner data from ordinary code transfers. Preserve private data separately through the existing recovery procedure. Do not copy Mac native binaries to Linux or Linux binaries to the Mac.

From the repository root, inspect the project configuration, then run:

```sh
mise trust mise.toml
mise install
mise exec -- npm run setup
mise exec -- npm run doctor
mise exec -- npm run dev
```

Node is pinned locally to 26.10.0. The global runtime is unchanged. Setup runs npm ci with optional native dependencies and installs the project's pinned Playwright Chromium, then checks runtime/native modules. The lockfile is not rewritten. Do not substitute Yarn or pnpm. An existing dependency folder is replaced by npm ci; keep source edits outside node_modules.

macOS and Linux use the same commands. On Linux, Chromium may require system libraries. The script does not install system packages or run sudo. If browser launch fails, follow Playwright's current Linux prerequisites or have the administrator provision those libraries, then rerun the browser tests. On macOS, use the supported Chromium package for that machine's architecture.

OpenRouter credentials are optional for mock development. This repository does not read or create a private .env during setup/doctor. Configure secrets privately when needed; the owner-reserved .env.example is not overwritten. Production/live AI checks require separate approval and budget. See [development](DEVELOPMENT.md) for fixture-only startup and [backup recovery](BACKUP-RECOVERY.md) for owner data.

Validation on this workstation is Linux only. A committed macOS CI job is a planned verification path, not proof of execution. Record actual platform results in ../reports/volume/qa/reports/ (outside the repository).
