#!/usr/bin/env node
/*
 * Screenshot the prototype in light and dark at 1440 x 900 and 390 x 844.
 *
 *   npm run screenshot -w prototype                       # default route list
 *   npm run screenshot -w prototype -- /library /components
 *   npm run screenshot -w prototype -- --no-build /library
 *
 * It builds the app (unless --no-build), starts its own `vite preview` on 127.0.0.1:5182 (strict, it
 * never uses another port), visits each route, saves PNGs to prototype/screenshots/, prints console
 * errors and horizontal overflow, then stops the server. Exit code 1 if any route had either.
 */
import { spawn, spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

// SCREENSHOT_PORT and SCREENSHOT_OUTDIR let several agents run this at once without sharing a port or build folder.
const PORT = Number(process.env.SCREENSHOT_PORT || 5182);
const OUT_DIR = process.env.SCREENSHOT_OUTDIR || "dist";
const HOST = "127.0.0.1";
const BASE = `http://${HOST}:${PORT}`;
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const outDir = path.join(root, "screenshots");
const viteBin = path.resolve(root, "../../node_modules/vite/bin/vite.js");

// Every screen, a few states, the /new-book redirect and a not-found route.
const DEFAULT_ROUTES = [
  "/library",
  "/library?view=ledger",
  "/profiles",
  "/profiles/harni-muharami",
  "/profiles/new",
  "/books/new",
  "/new-book",
  "/books/night-shift-survival/research",
  "/books/the-calm-ward/research",
  "/books/the-calm-ward/titles",
  "/books/the-calm-ward/blueprint",
  "/books/handover/writing",
  "/books/the-new-charge-nurse/editor",
  "/books/speaking-up-safely/cover",
  "/books/sourdough-on-a-weeknight/export",
  "/books/handover/marketing",
  "/settings",
  "/settings/models",
  "/archive",
  "/components",
  "/nope",
];
const VIEWPORTS = [
  { name: "1440", width: 1440, height: 900 },
  { name: "390", width: 390, height: 844 },
];
const THEMES = ["light", "dark"];

const args = process.argv.slice(2);
const skipBuild = args.includes("--no-build");
const routes = args.filter((a) => a.startsWith("/"));
const list = routes.length ? routes : DEFAULT_ROUTES;

function slug(route) {
  const s = route.replace(/^\/+|\/+$/g, "").replace(/[^a-z0-9]+/gi, "-");
  return s || "root";
}

function portInUse(port) {
  return new Promise((resolve) => {
    const sock = net.connect({ port, host: HOST });
    sock.once("connect", () => {
      sock.destroy();
      resolve(true);
    });
    sock.once("error", () => resolve(false));
  });
}

async function waitForServer(url, timeoutMs = 20000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`Preview server did not answer on ${url} within ${timeoutMs / 1000} s`);
}

if (!skipBuild) {
  console.log("Building the prototype...");
  const b = spawnSync(process.execPath, [viteBin, "build", "--logLevel", "warn", "--outDir", OUT_DIR], { cwd: root, stdio: "inherit" });
  if (b.status !== 0) {
    console.error("Build failed. No screenshots taken.");
    process.exit(1);
  }
}

if (await portInUse(PORT)) {
  console.error(`Port ${PORT} is already in use. This script only uses ${PORT}; stop whatever is there and run it again.`);
  process.exit(1);
}

const server = spawn(process.execPath, [viteBin, "preview", "--host", HOST, "--port", String(PORT), "--strictPort", "--outDir", OUT_DIR], {
  cwd: root,
  stdio: ["ignore", "pipe", "pipe"],
});
let serverLog = "";
server.stdout.on("data", (d) => (serverLog += d));
server.stderr.on("data", (d) => (serverLog += d));

let stopped = false;
function stopServer() {
  if (stopped) return;
  stopped = true;
  if (server.exitCode === null) server.kill("SIGTERM");
}
process.on("exit", stopServer);
for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => {
    stopServer();
    process.exit(130);
  });
}

const problems = [];
let browser;
try {
  await waitForServer(`${BASE}/`);
  mkdirSync(outDir, { recursive: true });
  browser = await chromium.launch();

  for (const theme of THEMES) {
    for (const vp of VIEWPORTS) {
      const context = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        deviceScaleFactor: 1,
        colorScheme: theme,
        reducedMotion: "no-preference",
      });
      await context.addInitScript((t) => {
        try {
          window.localStorage.setItem("volume.theme", t);
        } catch {
          // storage blocked; colorScheme still applies
        }
      }, theme);

      for (const route of list) {
        const page = await context.newPage();
        const errors = [];
        page.on("console", (msg) => {
          if (msg.type() === "error") errors.push(msg.text());
        });
        page.on("pageerror", (err) => errors.push(err.message));

        await page.goto(`${BASE}${route}`, { waitUntil: "networkidle" });
        await page.evaluate(() => document.fonts.ready);
        await page.waitForTimeout(900);

        const overflow = await page.evaluate(() => {
          const vw = document.documentElement.clientWidth;
          const sw = document.documentElement.scrollWidth;
          if (sw <= vw) return null;
          const offenders = [];
          for (const el of document.querySelectorAll("body *")) {
            const r = el.getBoundingClientRect();
            if (r.width === 0 || r.right <= vw + 1) continue;
            // Skip anything clipped by a scroll or overflow-hidden ancestor that itself fits.
            let clipped = false;
            for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
              const ox = getComputedStyle(a).overflowX;
              if (ox !== "visible" && a.getBoundingClientRect().right <= vw + 1) {
                clipped = true;
                break;
              }
            }
            if (clipped) continue;
            // Report where the overflow starts: the element sticks out but its parent does not.
            const pr = el.parentElement ? el.parentElement.getBoundingClientRect() : null;
            if (!pr || pr.right <= vw + 1 || el.parentElement === document.body) {
              const name =
                el.tagName.toLowerCase() +
                (el.id ? `#${el.id}` : "") +
                (typeof el.className === "string" && el.className ? `.${el.className.trim().split(/\s+/).slice(0, 3).join(".")}` : "");
              offenders.push(`${name} (right ${Math.round(r.right)} px)`);
              if (offenders.length >= 5) break;
            }
          }
          return { scrollWidth: sw, viewport: vw, offenders };
        });

        const file = path.join(outDir, `${slug(route)}-${theme}-${vp.name}.png`);
        await page.screenshot({ path: file, fullPage: true });
        const rel = path.relative(process.cwd(), file);
        const flags = [];
        if (errors.length) flags.push(`${errors.length} console error(s)`);
        if (overflow) flags.push(`horizontal overflow ${overflow.scrollWidth} > ${overflow.viewport}`);
        console.log(`${flags.length ? "FAIL" : "PASS"}  ${route}  ${theme}  ${vp.width}x${vp.height}  ${rel}${flags.length ? "  " + flags.join(", ") : ""}`);
        for (const e of errors) console.log(`        console: ${e}`);
        if (overflow) for (const o of overflow.offenders) console.log(`        overflow: ${o}`);
        if (flags.length) problems.push({ route, theme, viewport: vp.name, errors, overflow });
        await page.close();
      }
      await context.close();
    }
  }
} catch (err) {
  console.error(String(err?.stack ?? err));
  if (serverLog) console.error(`Preview server output:\n${serverLog}`);
  problems.push({ fatal: true });
} finally {
  if (browser) await browser.close();
  stopServer();
  // Make sure the preview server is gone before exiting; force it if SIGTERM was ignored.
  if (server.exitCode === null && server.signalCode === null) {
    const exited = await Promise.race([new Promise((r) => server.once("exit", () => r(true))), new Promise((r) => setTimeout(() => r(false), 3000))]);
    if (!exited) server.kill("SIGKILL");
  }
}

console.log(problems.length ? `\n${problems.length} problem(s) found.` : "\nAll screenshots clean: no console errors, no horizontal overflow.");
process.exit(problems.length ? 1 : 0);
