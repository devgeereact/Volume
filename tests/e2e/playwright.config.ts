/*
 * Playwright config for the full-book end-to-end test. Run it with `npm run e2e` from the repo root,
 * which builds first (see run.mjs). The two webServer entries start the test server on 127.0.0.1:5311
 * (mock AI, fresh SQLite file and DATA_DIR in the temp folder) and a vite preview of the web build on
 * 127.0.0.1:5312; Playwright stops both when the run ends, even after a failure.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "@playwright/test";
import { dataDir, sqlitePath, webOutDir } from "./paths.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SERVER_PORT = 5311;
const WEB_PORT = 5312;

/** The nth writing call the mock AI fails once. 3 lets two sections succeed before the failure. */
export const FAIL_WRITING_CALL = "3";

export default defineConfig({
  testDir: ".",
  testMatch: "*.spec.ts",
  outputDir: path.join(root, "test-results", "e2e"),
  timeout: 170_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: true,
  reporter: [["list"]],
  use: {
    baseURL: `http://127.0.0.1:${WEB_PORT}`,
    viewport: { width: 1440, height: 900 },
    colorScheme: "light",
    acceptDownloads: true,
    actionTimeout: 15_000,
    navigationTimeout: 20_000,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: [
    {
      command: "node apps/server/dist/index.js",
      cwd: root,
      url: `http://127.0.0.1:${SERVER_PORT}/api/v1/health`,
      reuseExistingServer: false,
      timeout: 60_000,
      gracefulShutdown: { signal: "SIGTERM", timeout: 5_000 },
      // The test server never loads .env; every setting that matters is pinned here.
      env: {
        VOLUME_LOAD_ENV: "false",
        OPENROUTER_API_KEY: "",
        AI_PROVIDER: "mock",
        EXPORT_PROVIDER: "volume",
        DB_CLIENT: "sqlite",
        SQLITE_PATH: sqlitePath,
        DATA_DIR: dataDir,
        RESOLVE_SOURCE_REDIRECTS: "false",
        HOST: "127.0.0.1",
        PORT: String(SERVER_PORT),
        WEB_ORIGINS: `http://127.0.0.1:${WEB_PORT}`,
        MOCK_STREAM_DELAY_MS: "5",
        MOCK_FAIL_NEXT_WRITING: FAIL_WRITING_CALL,
        LOG_LEVEL: "warn",
      },
    },
    {
      command: `node ${path.join(root, "node_modules/vite/bin/vite.js")} preview --host 127.0.0.1 --port ${WEB_PORT} --strictPort --outDir ${webOutDir}`,
      cwd: path.join(root, "apps/web"),
      url: `http://127.0.0.1:${WEB_PORT}/`,
      reuseExistingServer: false,
      timeout: 60_000,
      gracefulShutdown: { signal: "SIGTERM", timeout: 5_000 },
      env: { VOLUME_API_PORT: String(SERVER_PORT) },
    },
  ],
});
