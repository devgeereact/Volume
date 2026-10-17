#!/usr/bin/env node
/*
 * Runs the full-book end-to-end test (tests/e2e/full-book.spec.ts): `npm run e2e` from the repo root.
 *
 *   1. Builds the server (npm run build -w apps/server).
 *   2. Builds the web app with vite into <tmp>/volume-e2e/web, so apps/web/dist (used by the smoke
 *      script) is never touched.
 *   3. Runs Playwright with tests/e2e/playwright.config.ts, which starts two test servers
 *      (127.0.0.1:5311 and 5315, the second injects the writing failure full-book expects) and a
 *      `vite preview` for each (5312 and 5316), and stops all four when it ends.
 *   4. Removes <tmp>/volume-e2e (the SQLite file, DATA_DIR, the web build and the download folder).
 *
 * <tmp> is os.tmpdir(), so TMPDIR moves it. Exit code is Playwright's, or 1 if a build fails.
 */
import { spawn, spawnSync } from "node:child_process";
import { rmSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { e2eDir, webOutDir } from "./paths.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const npm = process.platform === "win32" ? "npm.cmd" : "npm";

function cleanup() {
  rmSync(e2eDir, { recursive: true, force: true });
}

function run(command, args, cwd = root) {
  const r = spawnSync(command, args, { cwd, stdio: "inherit", env: process.env });
  return r.status ?? 1;
}

let code = 1;
try {
  cleanup();
  mkdirSync(e2eDir, { recursive: true });

  console.log("Building the server...");
  if (run(npm, ["run", "build", "-w", "apps/server"]) !== 0) throw new Error("Server build failed.");

  console.log(`Building the web app into ${webOutDir}...`);
  const viteBin = path.join(root, "node_modules/vite/bin/vite.js");
  const built = run(process.execPath, [viteBin, "build", "--logLevel", "warn", "--outDir", webOutDir, "--emptyOutDir"], path.join(root, "apps/web"));
  if (built !== 0) throw new Error("Web build failed.");

  const playwrightCli = path.join(root, "node_modules/@playwright/test/cli.js");
  code = await new Promise((resolve) => {
    const child = spawn(process.execPath, [playwrightCli, "test", "-c", "tests/e2e/playwright.config.ts", ...process.argv.slice(2)], {
      cwd: root,
      stdio: "inherit",
      env: process.env,
    });
    const forward = (sig) => () => child.kill(sig);
    process.once("SIGINT", forward("SIGINT"));
    process.once("SIGTERM", forward("SIGTERM"));
    child.on("exit", (c) => resolve(c ?? 1));
  });
} catch (err) {
  console.error(String(err instanceof Error ? err.message : err));
} finally {
  cleanup();
}
process.exit(code);
