#!/usr/bin/env node
/*
 * Smoke test: walks the web app's main flow in Chromium and fails on any console error.
 *
 *   npm run smoke -w apps/web                  # builds, then runs (demo mode)
 *   npm run smoke -w apps/web -- --no-build    # uses the existing build
 *   npm run smoke -w apps/web -- --headed      # watch it
 *   SMOKE_API_PORT=5261 npm run smoke -w apps/web   # API mode against a server you started
 *
 * Like scripts/screenshot.mjs it starts its own `vite preview` on 127.0.0.1:5182 (SMOKE_PORT to change;
 * strict, it refuses to run if the port is busy and never uses another one) and stops it at the end.
 * SMOKE_OUT_DIR builds into another folder (default dist), so two runs never share one build.
 *
 * Demo mode (default): the preview's /api proxy points at a closed port, so the app falls back to its
 * demo data whatever runs on the default server port. Failed /api requests are expected there and are
 * not counted as console errors. Flow: Library, open The Calm Ward, Research, Titles (choose a title),
 * Blueprint (select chapter 4, Approve dialog), Writing (pause, resume), Editor (select text, Expand,
 * Accept), Cover (page count changes the spine width), Export (royalty calculator), Marketing (copy
 * shows a toast), Settings (theme to dark), command menu (Ctrl K, type, Enter, then Escape).
 *
 * API mode (SMOKE_API_PORT set): the server must already be running on 127.0.0.1:<SMOKE_API_PORT>, with
 * AI_PROVIDER=mock and http://127.0.0.1:<SMOKE_PORT> in WEB_ORIGINS. Flow: Library loads from the
 * server, the New book wizard creates a book (profile, type, idea, details, review, Start research), the
 * app opens that book, and the book is in the Library. The script never starts or stops the server.
 *
 * Exit code 1 on any failure.
 */
import { spawn, spawnSync } from "node:child_process";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const PORT = Number(process.env.SMOKE_PORT || 5182);
const API_PORT = process.env.SMOKE_API_PORT ? Number(process.env.SMOKE_API_PORT) : null;
const HOST = "127.0.0.1";
const BASE = `http://${HOST}:${PORT}`;
const OUT_DIR = process.env.SMOKE_OUT_DIR || "dist";
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const viteBin = path.resolve(root, "../../node_modules/vite/bin/vite.js");

const args = process.argv.slice(2);
const skipBuild = args.includes("--no-build");
const headed = args.includes("--headed");

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

function assert(cond, message) {
  if (!cond) throw new Error(message);
}

/** A port nothing listens on, for the demo run's /api proxy. */
function closedPort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.once("error", reject);
    srv.listen(0, HOST, () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

if (API_PORT !== null) {
  try {
    const res = await fetch(`http://${HOST}:${API_PORT}/api/v1/health`);
    const body = await res.json();
    if (body?.database?.status !== "ok") throw new Error(`database ${body?.database?.status}`);
    if (body?.ai?.provider !== "mock") {
      console.error(`The server on ${API_PORT} uses the ${body?.ai?.provider} AI provider. Run the smoke test against AI_PROVIDER=mock only.`);
      process.exit(1);
    }
  } catch (err) {
    console.error(`No healthy Volume server on 127.0.0.1:${API_PORT} (${String(err?.message ?? err)}). Start one first; this script does not.`);
    process.exit(1);
  }
}

if (!skipBuild) {
  console.log("Building the web app...");
  const b = spawnSync(process.execPath, [viteBin, "build", "--logLevel", "warn", "--outDir", OUT_DIR, "--emptyOutDir"], { cwd: root, stdio: "inherit" });
  if (b.status !== 0) {
    console.error("Build failed. Smoke test not run.");
    process.exit(1);
  }
}

if (await portInUse(PORT)) {
  console.error(`Port ${PORT} is already in use. This script only uses ${PORT}; stop whatever is there and run it again.`);
  process.exit(1);
}

const proxyPort = API_PORT ?? (await closedPort());
console.log(API_PORT !== null ? `API mode: /api goes to 127.0.0.1:${API_PORT}.` : `Demo mode: /api goes to the closed port ${proxyPort}.`);
const server = spawn(process.execPath, [viteBin, "preview", "--host", HOST, "--port", String(PORT), "--strictPort", "--outDir", OUT_DIR], {
  cwd: root,
  env: { ...process.env, VOLUME_API_PORT: String(proxyPort) },
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

const errors = [];
const ignored = [];
const steps = [];
let failed = false;
let browser;

try {
  await waitForServer(`${BASE}/`);
  browser = await chromium.launch({ headless: !headed });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    colorScheme: "light",
    reducedMotion: "no-preference",
  });
  await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: BASE });
  await context.addInitScript(() => {
    try {
      window.localStorage.setItem("volume.theme", "light");
    } catch {
      // storage blocked; colorScheme still applies
    }
  });
  const page = await context.newPage();
  page.setDefaultTimeout(8000);
  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    // Demo mode: the health check and other /api calls fail on purpose (nothing listens there).
    if (API_PORT === null && (msg.location()?.url ?? "").includes("/api/v1/")) {
      ignored.push(msg.text());
      return;
    }
    errors.push(`${page.url()}: ${msg.text()}`);
  });
  page.on("pageerror", (err) => errors.push(`${page.url()}: ${err.message}`));

  const main = page.locator("main");
  const h1 = (name) => main.getByRole("heading", { level: 1, name }).first();

  async function step(name, fn) {
    const start = Date.now();
    const before = errors.length;
    await fn();
    const newErrors = errors.length - before;
    steps.push(name);
    console.log(`${newErrors ? "FAIL" : "PASS"}  ${name}  (${Date.now() - start} ms)${newErrors ? `  ${newErrors} console error(s)` : ""}`);
  }

  if (API_PORT !== null) {
    await apiWalk();
  } else {
    await demoWalk();
  }

  async function apiWalk() {
    const stamp = new Date().toISOString().slice(11, 19).replace(/:/g, "");
    const workingTitle = `Smoke Test Night Shifts ${stamp}`;

    await step("API: Library loads from the server", async () => {
      await page.goto(`${BASE}/library`, { waitUntil: "networkidle" });
      await h1("Library").waitFor();
      await main
        .getByText(/^\d+ books?/)
        .first()
        .waitFor();
    });

    await step("API: New book wizard creates a book", async () => {
      await main.getByRole("button", { name: "New book" }).first().click();
      await page.waitForURL(/\/books\/new$/);
      await h1("New book").waitFor();
      // Profile: the first server profile.
      // The radios are visually hidden inside their cards; click the card.
      const profiles = main.locator('label:has(input[name="profile"])');
      await profiles.first().waitFor();
      await profiles.first().click();
      await main.getByRole("button", { name: /^Next: Book type/ }).click();
      // Book type: the profile's default, or the first non-fiction type.
      await main.getByRole("heading", { name: "What kind of book is it?" }).waitFor();
      if ((await main.locator('input[name="book-type"]:checked').count()) === 0) {
        await main
          .getByRole("tab", { name: /Non-fiction|Nonfiction/i })
          .first()
          .click();
        await main.locator('label:has(input[name="book-type"])').first().click();
      }
      await main.getByRole("button", { name: /^Next: Idea/ }).click();
      await main
        .getByLabel("Idea or working title")
        .fill(`A practical guide for night-shift nurses on sleeping and eating well. Working title: ${workingTitle}.`);
      await main.getByRole("button", { name: /^Next: Details/ }).click();
      await main.getByRole("button", { name: /^Next: Review/ }).click();
      await main.getByRole("heading", { name: "Check and start" }).waitFor();
      await main.getByRole("button", { name: /^Start research/ }).click();
      await page.waitForURL(/\/books\/(?!new)[^/]+\/research/, { timeout: 15000 });
    });

    const bookId = page.url().split("/books/")[1].split("/")[0];

    await step("API: the server has the book with the wizard's choices", async () => {
      const res = await fetch(`http://${HOST}:${API_PORT}/api/v1/books/${bookId}`);
      assert(res.ok, `GET /books/${bookId} answered ${res.status}`);
      const b = await res.json();
      assert(b.title === workingTitle, `Title is "${b.title}", expected "${workingTitle}"`);
      assert(b.bookTypeId && b.interiorThemeId && b.coverStyleId, "Book type, interior theme or cover style missing");
      assert(typeof b.wordTarget === "number" && b.wordTarget > 0, "Word target missing");
      assert(b.settings?.models?.writing, "Writing model missing from settings");
    });

    await step("API: the new book is in the Library and its Today strip", async () => {
      await page.goto(`${BASE}/library`, { waitUntil: "networkidle" });
      await h1("Library").waitFor();
      await main
        .getByRole("link", { name: new RegExp(workingTitle) })
        .first()
        .waitFor();
      await main.locator('section[aria-labelledby="today-heading"]').getByText(workingTitle).first().waitFor();
    });

    await step("API: the spine lists server profiles and the Demo badge is gone", async () => {
      const switcher = page.getByRole("button", { name: /^Profile: .*Change profile$/ });
      await switcher.click();
      const list = page.getByRole("listbox", { name: "Profiles" });
      await list.waitFor();
      const res = await fetch(`http://${HOST}:${API_PORT}/api/v1/profiles`);
      const first = (await res.json()).items[0]?.penName;
      assert(first, "The server has no profiles");
      await list.getByRole("option", { name: new RegExp(first) }).waitFor();
      await page.keyboard.press("Escape");
      assert((await page.getByText("Demo", { exact: true }).count()) === 0, "The Demo badge shows in API mode");
    });

    await step("API: Published shelf sets list prices and the store", async () => {
      const res = await fetch(`http://${HOST}:${API_PORT}/api/v1/books/${bookId}/publish`, { method: "POST", headers: { Origin: BASE } });
      assert(res.ok, `POST /books/${bookId}/publish answered ${res.status}`);
      await page.goto(`${BASE}/published`, { waitUntil: "networkidle" });
      await h1("Published").waitFor();
      await main.getByRole("button", { name: `Set prices for ${workingTitle}` }).click();
      const dialog = page.getByRole("dialog", { name: `Prices for ${workingTitle}` });
      await dialog.getByLabel("Marketplace").fill("amazon.com");
      await dialog.getByLabel("Kindle eBook, pounds").fill("4.99");
      await dialog.getByRole("button", { name: "Save prices" }).click();
      await dialog.waitFor({ state: "detached" });
      await main.getByText(`Saved the prices and store for ${workingTitle}.`).waitFor();
      const b = await (await fetch(`http://${HOST}:${API_PORT}/api/v1/books/${bookId}`)).json();
      assert(b.listPrices?.ebook === 4.99 && b.marketplace === "amazon.com", `Server has ${JSON.stringify(b.listPrices)} on ${b.marketplace}`);
      await main.getByText("£4.99").first().waitFor();
      const back = await fetch(`http://${HOST}:${API_PORT}/api/v1/books/${bookId}/unpublish`, { method: "POST", headers: { Origin: BASE } });
      assert(back.ok, `POST /books/${bookId}/unpublish answered ${back.status}`);
    });

    await step("API: Archive, then restore from the Archive", async () => {
      const res = await fetch(`http://${HOST}:${API_PORT}/api/v1/books/${bookId}/archive`, { method: "POST", headers: { Origin: BASE } });
      assert(res.ok, `POST /books/${bookId}/archive answered ${res.status}`);
      await page.goto(`${BASE}/archive`, { waitUntil: "networkidle" });
      await h1("Archive").waitFor();
      await main.getByRole("button", { name: `Restore ${workingTitle}` }).click();
      await main.getByText(`Restored ${workingTitle}.`, { exact: false }).waitFor();
      const after = await (await fetch(`http://${HOST}:${API_PORT}/api/v1/books/${bookId}`)).json();
      assert(after.status === "active", `Book status is ${after.status} after restore`);
    });

    await step("API: Archive again, then delete for good after typing the title", async () => {
      const res = await fetch(`http://${HOST}:${API_PORT}/api/v1/books/${bookId}/archive`, { method: "POST", headers: { Origin: BASE } });
      assert(res.ok, `POST /books/${bookId}/archive answered ${res.status}`);
      await page.goto(`${BASE}/archive`, { waitUntil: "networkidle" });
      await main.getByRole("button", { name: `Delete ${workingTitle}` }).click();
      const dialog = page.getByRole("dialog", { name: `Delete ${workingTitle}?` });
      await dialog.waitFor();
      await dialog.getByLabel(/^Type/).fill(workingTitle);
      await dialog.getByRole("button", { name: "Delete book" }).click();
      await dialog.waitFor({ state: "detached" });
      await main.getByText(`Deleted ${workingTitle} for good.`).waitFor();
      const gone = await fetch(`http://${HOST}:${API_PORT}/api/v1/books/${bookId}`);
      assert(gone.status === 404, `GET /books/${bookId} answered ${gone.status} after delete`);
    });

    await step("API: Settings shows the key status from the server", async () => {
      await page.goto(`${BASE}/settings`, { waitUntil: "networkidle" });
      await main.getByText("Key on the server").waitFor();
    });
  }

  async function demoWalk() {
    await step("Library loads", async () => {
      await page.goto(`${BASE}/library`, { waitUntil: "networkidle" });
      await h1("Library").waitFor();
    });

    await step("Open The Calm Ward from the Library", async () => {
      await main
        .getByRole("link", { name: /The Calm Ward/ })
        .first()
        .click();
      await page.waitForURL(/\/books\/the-calm-ward\//);
    });

    await step("Research", async () => {
      await main
        .getByRole("link", { name: /^Research/ })
        .first()
        .click();
      await page.waitForURL(/\/books\/the-calm-ward\/research$/);
      await h1("Research").waitFor();
    });

    await step("Titles: choose a title", async () => {
      await main.getByRole("button", { name: "Continue to titles" }).click();
      await page.waitForURL(/\/titles$/);
      await h1("Titles").waitFor();
      const use = main.getByRole("button", { name: "Use this title" }).first();
      const card = use.locator("xpath=ancestor::*[.//h3 or .//h2][1]");
      // The heading holds "Title: Subtitle"; the inspector shows the title on its own line.
      const chosenTitle = ((await card.getByRole("heading").first().textContent()) ?? "").split(":")[0].trim();
      assert(chosenTitle.length > 0, "Could not read the title on the first unchosen card");
      await use.click();
      // The inspector's "Chosen title" section names the title on its own.
      await page.getByRole("complementary", { name: "Titles details" }).getByText(chosenTitle, { exact: true }).first().waitFor();
    });

    await step("Blueprint: select chapter 4", async () => {
      await main.getByRole("button", { name: "Continue to blueprint" }).click();
      await page.waitForURL(/\/blueprint$/);
      const ch5 = main.getByRole("button", { name: /Addressing Horizontal Violence/ }).first();
      await ch5.click();
      await main.locator('[aria-current="true"]', { hasText: "Addressing Horizontal Violence" }).first().waitFor();
      const ch4 = main.getByRole("button", { name: /The Art Of Verbal De-escalation/ }).first();
      await ch4.click();
      await main.locator('[aria-current="true"]', { hasText: "The Art Of Verbal De-escalation" }).first().waitFor();
    });

    await step("Blueprint: Approve dialog, then approve", async () => {
      await main.getByRole("button", { name: "Approve blueprint" }).first().click();
      const dialog = page.getByRole("dialog", { name: /Approve blueprint version/ });
      await dialog.waitFor();
      await dialog.getByRole("button", { name: "Approve blueprint" }).click();
      await page.waitForURL(/\/books\/the-calm-ward\/writing$/);
    });

    await step("Writing: pause and resume", async () => {
      await page.getByRole("link", { name: "Open", exact: true }).click();
      await page.waitForURL(/\/books\/handover\/writing$/);
      await main.getByRole("button", { name: "Pause", exact: true }).click();
      await main.getByRole("button", { name: "Resume", exact: true }).click();
      await main.getByRole("button", { name: "Pause", exact: true }).waitFor();
    });

    await step("Editor: select text, Expand, Accept", async () => {
      await page.goto(`${BASE}/books/the-new-charge-nurse/editor`, { waitUntil: "networkidle" });
      const block = main.locator("[data-block-id]").first();
      await block.waitFor();
      const before = (await block.textContent()) ?? "";
      await block.evaluate((el) => {
        const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
        const node = walker.nextNode();
        if (!node || !node.textContent) throw new Error("No text in the first paragraph");
        const text = node.textContent;
        const end = text.indexOf(".") > 10 ? text.indexOf(".") : Math.min(text.length, 40);
        const range = document.createRange();
        range.setStart(node, 0);
        range.setEnd(node, end);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
      });
      const toolbar = main.getByRole("toolbar", { name: "Rewrite the selection" });
      await toolbar.getByRole("button", { name: "Expand" }).click();
      const suggestion = main.getByRole("dialog", { name: "Expand suggestion" });
      await suggestion.getByRole("button", { name: "Accept" }).click();
      await suggestion.waitFor({ state: "detached" });
      await page.waitForFunction(([sel, prev]) => (document.querySelector(sel)?.textContent ?? "") !== prev, ["main [data-block-id]", before]);
    });

    await step("Editor: command menu opens Find across the book", async () => {
      const menu = page.getByRole("dialog", { name: "Command menu" });
      await page.keyboard.press("Control+k");
      await menu.waitFor();
      await page.keyboard.type("Find across");
      await page.keyboard.press("Enter");
      await menu.waitFor({ state: "detached" });
      const find = main.getByRole("region", { name: "Find and replace" });
      await find.waitFor();
      assert(await find.getByRole("radio", { name: "Whole book" }).isChecked(), "Find opened, but not across the whole book");
      await find.getByRole("button", { name: "Close find and replace" }).click();
      await find.waitFor({ state: "detached" });
    });

    await step("Cover: page count changes the spine width", async () => {
      await page.goto(`${BASE}/books/speaking-up-safely/cover`, { waitUntil: "networkidle" });
      const maths = main.getByText(/^Spine = \d+ pages/).first();
      const before = (await maths.textContent()) ?? "";
      await main.locator("#pages").fill("300");
      await main
        .getByText(/^Spine = 300 pages/)
        .first()
        .waitFor();
      const after =
        (await main
          .getByText(/^Spine = 300 pages/)
          .first()
          .textContent()) ?? "";
      const inchesOf = (s) => s.match(/=\s*([\d.]+)\s*in\s*$/)?.[1];
      assert(inchesOf(after) && inchesOf(after) !== inchesOf(before), `Spine width did not change (${before} then ${after})`);
    });

    await step("Export: royalty calculator", async () => {
      await page.goto(`${BASE}/books/sourdough-on-a-weeknight/export`, { waitUntil: "networkidle" });
      const calc = main.locator('section[aria-labelledby="calc-title"]');
      await calc.waitFor();
      const before = (await calc.textContent()) ?? "";
      await calc.getByLabel("Pages").fill("250");
      await calc.getByLabel("List price").first().fill("12.99");
      await page.waitForFunction((prev) => (document.querySelector('section[aria-labelledby="calc-title"]')?.textContent ?? "") !== prev, before);
      const after = (await calc.textContent()) ?? "";
      assert(after.includes("250"), "The calculator does not show the new page count");
    });

    await step("Marketing: copy shows a toast", async () => {
      // Handover is still being written, so its marketing is gated; The New Charge Nurse has a pack.
      await page.goto(`${BASE}/books/the-new-charge-nurse/marketing`, { waitUntil: "networkidle" });
      await main.getByRole("button", { name: "Copy", exact: true }).first().click();
      await page
        .getByText(/copied$/)
        .first()
        .waitFor();
    });

    await step("Settings: theme switches to dark", async () => {
      await page.goto(`${BASE}/settings/appearance`, { waitUntil: "networkidle" });
      await main.getByRole("radiogroup", { name: "Theme" }).getByRole("radio", { name: "Dark" }).click();
      await page.waitForFunction(() => document.documentElement.getAttribute("data-theme") === "dark");
    });

    await step("Command menu: Ctrl K, type, Enter, Escape", async () => {
      const menu = page.getByRole("dialog", { name: "Command menu" });
      await page.keyboard.press("Control+k");
      await menu.waitFor();
      await page.keyboard.type("Archive");
      await page.keyboard.press("Enter");
      await page.waitForURL(/\/archive$/);
      await menu.waitFor({ state: "detached" });
      await page.keyboard.press("Control+k");
      await menu.waitFor();
      await page.keyboard.press("Escape");
      await menu.waitFor({ state: "detached" });
    });
  }

  await context.close();
} catch (err) {
  failed = true;
  console.error(`FAIL  after "${steps.at(-1) ?? "start"}": ${String(err?.message ?? err)}`);
  if (serverLog && !String(err).includes("locator")) console.error(`Preview server output:\n${serverLog}`);
} finally {
  if (browser) await browser.close();
  stopServer();
  if (server.exitCode === null && server.signalCode === null) {
    const exited = await Promise.race([new Promise((r) => server.once("exit", () => r(true))), new Promise((r) => setTimeout(() => r(false), 3000))]);
    if (!exited) server.kill("SIGKILL");
  }
}

for (const e of errors) console.log(`        console: ${e}`);
if (ignored.length) console.log(`(${ignored.length} expected /api error(s) ignored in demo mode)`);
const ok = !failed && errors.length === 0;
console.log(
  ok
    ? `\nSmoke test passed: ${steps.length} steps, no console errors.`
    : `\nSmoke test failed: ${steps.length} steps passed, ${errors.length} console error(s).`,
);
process.exit(ok ? 0 : 1);
