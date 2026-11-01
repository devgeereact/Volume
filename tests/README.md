# tests

Cross-workspace tests. Unit tests do not live here: each workspace keeps its Vitest suite in its own `test/` folder or next to the code (`*.test.ts`), and `npm run test` runs them all. Export golden files are in `packages/export/test/golden/`; AI mock answers in `packages/ai/test/fixtures/`.

| Folder | What | Command |
|---|---|---|
| `e2e/` | Playwright, 20 tests in 10 specs, against the built server and web app with the mock AI provider. `run.mjs` builds, then starts its own servers on 127.0.0.1:5311 to 5318 (5313 and 5314 are started by the restart and batch-failure specs, so they must be free too) | `npm run e2e` |
| `integration/` | `runtime.test.mjs`, Node's test runner: unsupported Node and bad native bindings fail clearly, busy ports fail safely, `npm run dev` starts and stops cleanly | `npm run test:tooling` |
| `smoke/` | `smoke.mjs`, a long Playwright walk through the app and API on a scratch database (see the comment at the top of the file for its settings and phases) | `BASE_URL=... node tests/smoke/smoke.mjs` |

See [test strategy](../docs/06-quality/TEST-STRATEGY.md).
