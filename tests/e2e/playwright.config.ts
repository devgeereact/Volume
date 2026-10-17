/*
 * Playwright config for the end-to-end tests. Run them with `npm run e2e` from the repo root, which builds
 * first (see run.mjs). Two server pairs start, each a test server (mock AI, fresh SQLite file and DATA_DIR in
 * the temp folder) and a vite preview of the web build; Playwright stops all four when the run ends, even
 * after a failure.
 *
 *   full-book  server 127.0.0.1:5315, web 5316. The mock AI fails the third writing call once
 *              (MOCK_FAIL_NEXT_WRITING=3). Only full-book.spec.ts uses this pair, so the failure it expects is
 *              always there and never lands on another spec, whatever order the specs run in.
 *   main       server 127.0.0.1:5311, web 5312. No injected failure. Every other spec.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "@playwright/test";
import { dataDir, failServerDataDir, failServerSqlitePath, sqlitePath, webOutDir } from "./paths.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SERVER_PORT = 5311;
const WEB_PORT = 5312;
const FAIL_SERVER_PORT = 5315;
const FAIL_WEB_PORT = 5316;

/** The nth writing call the mock AI fails once on the full-book server. 3 lets two sections succeed before the failure. */
export const FAIL_WRITING_CALL = "3";

interface ServerOptions {
  port: number;
  webPort: number;
  sqlite: string;
  data: string;
  failWritingCall?: string;
}

const viteBin = path.join(root, "node_modules/vite/bin/vite.js");

/** One test server. It never loads the env file; every setting that matters is pinned here. */
function server(o: ServerOptions) {
  return {
    command: "node apps/server/dist/index.js",
    cwd: root,
    url: `http://127.0.0.1:${o.port}/api/v1/health`,
    reuseExistingServer: false,
    timeout: 60_000,
    gracefulShutdown: { signal: "SIGTERM" as const, timeout: 5_000 },
    env: {
      VOLUME_LOAD_ENV: "false",
      OPENROUTER_API_KEY: "",
      AI_PROVIDER: "mock",
      EXPORT_PROVIDER: "volume",
      DB_CLIENT: "sqlite",
      SQLITE_PATH: o.sqlite,
      DATA_DIR: o.data,
      RESOLVE_SOURCE_REDIRECTS: "false",
      HOST: "127.0.0.1",
      PORT: String(o.port),
      WEB_ORIGINS: `http://127.0.0.1:${o.webPort}`,
      MOCK_STREAM_DELAY_MS: "5",
      ...(o.failWritingCall ? { MOCK_FAIL_NEXT_WRITING: o.failWritingCall } : {}),
      LOG_LEVEL: "warn",
    },
  };
}

/** A vite preview of the web build that proxies /api to the given server port. */
function preview(webPort: number, apiPort: number) {
  return {
    command: `node ${viteBin} preview --host 127.0.0.1 --port ${webPort} --strictPort --outDir ${webOutDir}`,
    cwd: path.join(root, "apps/web"),
    url: `http://127.0.0.1:${webPort}/`,
    reuseExistingServer: false,
    timeout: 60_000,
    gracefulShutdown: { signal: "SIGTERM" as const, timeout: 5_000 },
    env: { VOLUME_API_PORT: String(apiPort) },
  };
}

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
  projects: [
    { name: "full-book", testMatch: "full-book.spec.ts", use: { baseURL: `http://127.0.0.1:${FAIL_WEB_PORT}` } },
    { name: "main", testIgnore: "full-book.spec.ts", use: { baseURL: `http://127.0.0.1:${WEB_PORT}` } },
  ],
  use: {
    viewport: { width: 1440, height: 900 },
    colorScheme: "light",
    acceptDownloads: true,
    actionTimeout: 15_000,
    navigationTimeout: 20_000,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: [
    server({ port: SERVER_PORT, webPort: WEB_PORT, sqlite: sqlitePath, data: dataDir }),
    preview(WEB_PORT, SERVER_PORT),
    server({ port: FAIL_SERVER_PORT, webPort: FAIL_WEB_PORT, sqlite: failServerSqlitePath, data: failServerDataDir, failWritingCall: FAIL_WRITING_CALL }),
    preview(FAIL_WEB_PORT, FAIL_SERVER_PORT),
  ],
});
