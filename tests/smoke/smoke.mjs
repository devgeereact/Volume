#!/usr/bin/env node
/*
 * Volume smoke test: plain node + Playwright, headless Chromium, its own browser.
 *
 *   BASE_URL=http://127.0.0.1:5222 node tests/smoke/smoke.mjs
 *
 * BASE_URL is a running web app (vite dev or preview) whose /api reaches a server started with
 * VOLUME_LOAD_ENV=false AI_PROVIDER=mock DB_CLIENT=sqlite and a scratch SQLITE_PATH and DATA_DIR
 * (the same settings as tests/e2e/playwright.config.ts), with WEB_ORIGINS set to BASE_URL.
 * It creates data (a profile, books, a batch) through the UI and the API: use a scratch database only.
 * Prints one PASS or FAIL line per check, a summary, and exits 1 on any FAIL.
 * Optional: SMOKE_SHOTS=<folder> saves a screenshot per failed check; SMOKE_ONLY=<regex> runs only the
 * phases whose names match (server, shell-desktop, shell-mobile, profiles, wizard, book, bookpages-*, hub,
 * links, themes, keyboard, offline); SMOKE_BOOK=<id> reuses a finished book for phases after "book".
 * The offline checks (D-061) block /api in the browser after the app loaded and assert that no Demo badge or sample figure
 * appears, the Not connected banner does, and everything recovers when /api is unblocked; no process is stopped.
 * SMOKE_PACK=1 adds the "pack" phase (off by default, about two minutes): it makes its own long-enough book with two parts
 * through the API, builds the real KDP pack and checks the zip file by file (needs the server on the real exporter,
 * EXPORT_PROVIDER=volume as in tests/e2e/playwright.config.ts). Run it alone with SMOKE_PACK=1 SMOKE_ONLY=^pack$.
 * SMOKE_PACK_UI=1 adds the "pack-ui" phase (about two minutes, same server needs): the same kind of book, then the Export page in
 * the browser: preflight list, tick the warnings, Build pack, "Pack ready", Download, unzip the file, "Exported", then an edit through
 * the API and "Changed since export". Run it alone with SMOKE_PACK_UI=1 SMOKE_ONLY=^pack-ui$.
 */
/* global window, document, getComputedStyle, location, innerHeight, history, dispatchEvent, PopStateEvent */
import { createRequire } from "node:module";
import { mkdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { inflateRawSync } from "node:zlib";
import path from "node:path";

const require = createRequire(import.meta.url);
const { chromium } = require("@playwright/test");

const BASE = (process.env.BASE_URL ?? "http://127.0.0.1:5222").replace(/\/$/, "");
const SHOTS = process.env.SMOKE_SHOTS ?? "";
const VIEWPORTS = { desktop: { width: 1440, height: 900 }, mobile: { width: 390, height: 844 } };
const SLOW_MS = 1000;
const JOB = 90_000;

let pass = 0;
let fail = 0;
const failures = [];

function report(ok, name, detail = "") {
  if (ok) pass++;
  else {
    fail++;
    failures.push(name);
  }
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${!ok && detail ? `  -- ${detail}` : ""}`);
}

/** Runs one check; a thrown error is a FAIL with its first line. */
async function check(name, fn, page) {
  try {
    const r = await fn();
    if (r === false) report(false, name);
    else if (typeof r === "string") report(false, name, r);
    else report(true, name);
  } catch (err) {
    report(
      false,
      name,
      String(err instanceof Error ? err.message : err)
        .split("\n")[0]
        .slice(0, 300),
    );
    if (SHOTS && page) {
      mkdirSync(SHOTS, { recursive: true });
      await page.screenshot({ path: path.join(SHOTS, `${name.replace(/\W+/g, "-").slice(0, 80)}.png`) }).catch(() => {});
    }
  }
}

/** Opens a context with listeners that collect console errors, page errors and failed requests. */
async function open(browser, vpName, scheme = "light") {
  const context = await browser.newContext({ viewport: VIEWPORTS[vpName], colorScheme: scheme, baseURL: BASE });
  await context.addInitScript(() => {
    window.__long = 0;
    try {
      new PerformanceObserver((l) => {
        for (const e of l.getEntries()) window.__long = Math.max(window.__long, e.duration);
      }).observe({ entryTypes: ["longtask"] });
    } catch {
      // Long task timing is not available in this browser: the speed check then passes by default.
    }
  });
  const page = await context.newPage();
  const log = { console: [], pageErrors: [], requests: [] };
  page.on("console", (m) => {
    if (m.type() === "error") log.console.push(m.text().slice(0, 200));
  });
  page.on("pageerror", (e) => log.pageErrors.push(e.message.slice(0, 200)));
  page.on("response", (r) => {
    const u = r.url();
    if (u.startsWith(BASE) && r.status() >= 400 && !log.expectErrors) log.requests.push(`${r.status()} ${new URL(u).pathname}`);
  });
  page.on("requestfailed", (r) => {
    if (r.url().startsWith(BASE) && !log.expectErrors && !/ERR_ABORTED/.test(r.failure()?.errorText ?? ""))
      log.requests.push(`failed ${new URL(r.url()).pathname}`);
  });
  return { context, page, log };
}

/** Page-level health: no overflow sideways, no unnamed controls, images with alt, one h1, a main landmark. */
async function audit(page) {
  return page.evaluate(() => {
    const problems = [];
    const doc = document.documentElement;
    if (doc.scrollWidth > window.innerWidth + 1) problems.push(`horizontal scroll (${doc.scrollWidth} > ${window.innerWidth})`);
    const visible = (el) => {
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none";
    };
    const name = (el) =>
      (
        el.getAttribute("aria-label") ||
        el.getAttribute("aria-labelledby") ||
        el.getAttribute("title") ||
        el.textContent ||
        el.querySelector("img[alt]")?.getAttribute("alt") ||
        ""
      ).trim();
    for (const el of document.querySelectorAll("button, a[href], [role=button]")) {
      if (visible(el) && !name(el)) problems.push(`unnamed ${el.tagName.toLowerCase()} ${el.outerHTML.slice(0, 80)}`);
    }
    for (const el of document.querySelectorAll("input:not([type=hidden]), select, textarea")) {
      if (el.closest("[hidden]") || (el.type === "file" && el.tabIndex === -1)) continue;
      const labelled = el.labels?.length || el.getAttribute("aria-label") || el.getAttribute("aria-labelledby") || el.getAttribute("title");
      if (!labelled) problems.push(`unlabelled ${el.tagName.toLowerCase()}[name=${el.getAttribute("name") ?? ""}] ${el.getAttribute("placeholder") ?? ""}`);
    }
    for (const img of document.querySelectorAll("img")) if (visible(img) && !img.hasAttribute("alt")) problems.push(`img without alt ${img.src.slice(-40)}`);
    if (!document.querySelector("main")) problems.push("no main landmark");
    const h1 = [...document.querySelectorAll("h1")].filter(visible).length;
    if (h1 !== 1) problems.push(`${h1} visible h1`);
    // Text clipped by its own box (single-line truncation is allowed when text-overflow is ellipsis).
    let clipped = 0;
    for (const el of document.querySelectorAll("main *")) {
      if (el.children.length || !el.textContent?.trim() || !visible(el)) continue;
      const s = getComputedStyle(el);
      if (s.textOverflow === "ellipsis" || s.overflow === "visible" || s.overflowX === "auto" || s.overflowX === "scroll") continue;
      if (el.scrollWidth > el.clientWidth + 2 && el.clientWidth > 2) clipped++;
    }
    if (clipped) problems.push(`${clipped} text elements clipped`);
    const text = document.body.innerText;
    if (/\bundefined\b|\[object Object\]|\bNaN\b|\bnull\b/.test(text))
      problems.push(`stray token in copy: ${(text.match(/.{20}(\bundefined\b|\[object Object\]|\bNaN\b|\bnull\b).{20}/s) ?? [""])[0].replace(/\s+/g, " ")}`);
    if (/—/.test(text)) problems.push("em dash in copy");
    const banned = text.match(
      /\b(leverage|empower\w*|showcase|transformative|impactful|cutting-edge|revolutionise|synergy|groundbreaking|utilise|elevate|unlock\w*|seamless\w*)\b/i,
    );
    if (banned) problems.push(`banned word in copy: ${banned[0]}`);
    return problems;
  });
}

async function settle(page) {
  await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
}

/** Visit a route and run the standard checks for it. */
async function visit(page, log, label, url, extra) {
  const t0 = Date.now();
  await check(
    `${label}: loads`,
    async () => {
      const r = await page.goto(url, { waitUntil: "domcontentloaded" });
      if (r && r.status() >= 400) throw new Error(`HTTP ${r.status()}`);
      await page.locator("main h1, h1").first().waitFor({ timeout: 15_000 });
      await settle(page);
      const ms = Date.now() - t0;
      if (ms > 4000) return `slow load ${ms}ms`;
    },
    page,
  );
  await check(
    `${label}: nothing blocks the UI for a second`,
    async () => {
      const long = await page.evaluate(() => window.__long ?? 0);
      if (long > SLOW_MS) return `a main-thread task ran ${Math.round(long)}ms`;
    },
    page,
  );
  if (extra) await extra();
  await check(
    `${label}: layout and accessibility basics`,
    async () => {
      const p = await audit(page);
      if (p.length) return p.slice(0, 4).join("; ");
    },
    page,
  );
  await check(
    `${label}: no console errors, page errors or failed requests`,
    async () => {
      const all = [...log.console, ...log.pageErrors, ...log.requests];
      log.console.length = log.pageErrors.length = log.requests.length = 0;
      if (all.length) return [...new Set(all)].slice(0, 4).join(" | ");
    },
    page,
  );
}

/* ------------------------------------------------------------------ the run ------------------------------------------------------------------ */
const STAMP = new Date().toISOString().slice(11, 19).replace(/:/g, "");
const PEN = `Smoke Tester ${STAMP}`;
const TITLE = `Smoke Night Shifts ${STAMP}`;
const browser = await chromium.launch({ headless: true });
const state = { bookId: process.env.SMOKE_BOOK ?? "" };

async function main() {
  const only = process.env.SMOKE_ONLY ? new RegExp(process.env.SMOKE_ONLY) : null;
  const phases = [
    ["server", () => phaseServer()],
    ["shell-desktop", () => phaseShell("desktop")],
    ["shell-mobile", () => phaseShell("mobile")],
    ["profiles", () => phaseProfiles()],
    ["wizard", () => phaseWizard()],
    ["book", () => phaseBook()],
    ["bookpages-desktop", () => phaseBookPages("desktop")],
    ["bookpages-mobile", () => phaseBookPages("mobile")],
    ["hub", () => phaseHub()],
    ["links", () => phaseLinks()],
    ["themes", () => phaseThemes()],
    ["keyboard", () => phaseKeyboard()],
    ["offline", () => phaseOffline()],
    ...(process.env.SMOKE_PACK === "1" ? [["pack", () => phasePack()]] : []),
    ...(process.env.SMOKE_PACK_UI === "1" ? [["pack-ui", () => phasePackUi()]] : []),
  ];
  for (const [name, fn] of phases) {
    if (only && !only.test(name)) continue;
    try {
      await fn();
    } catch (err) {
      report(
        false,
        `phase ${name} stopped early`,
        String(err instanceof Error ? err.message : err)
          .split("\n")[0]
          .slice(0, 300),
      );
    }
  }
}

async function phaseServer() {
  await check("server: health answers through the web proxy with mock AI", async () => {
    const r = await fetch(`${BASE}/api/v1/health`);
    const j = await r.json();
    if (j.database?.status !== "ok") return "database not ok";
    if (j.ai?.provider !== "mock") return `AI provider is ${j.ai?.provider}, the smoke test needs mock`;
  });
}

/** Library, Published, Profiles, wizard, Settings, Archive, Volume, schedule, 404, public pages. */
async function phaseShell(vp) {
  const { context, page, log } = await open(browser, vp);
  const routes = [
    ["landing", "/"],
    ["how it works", "/how-it-works"],
    ["sign in", "/sign-in"],
    ["library", "/library"],
    ["published", "/published"],
    ["profiles", "/profiles"],
    ["new profile", "/profiles/new"],
    ["new book wizard", "/books/new"],
    ["settings", "/settings"],
    ["archive", "/archive"],
    ["volume mode", "/volume"],
    ["release schedule", "/volume/schedule"],
    ["not found", "/this-page-does-not-exist"],
    ["style guide", "/components"],
  ];
  for (const [name, url] of routes) await visit(page, log, `${vp} ${name}`, url);
  for (const tab of ["key", "models", "budgets", "book-defaults", "appearance", "backups", "house-style", "kdp-rules", "account", "about"]) {
    await check(
      `${vp} settings/${tab}: opens with a heading`,
      async () => {
        await page.goto(`/settings/${tab}`);
        await page.locator("main h1").first().waitFor({ timeout: 10_000 });
        await settle(page);
        if (new URL(page.url()).pathname !== `/settings/${tab}`) return `redirected to ${new URL(page.url()).pathname}`;
        const t = (await page.locator("main").innerText()).trim();
        if (t.length < 40) return "page looks empty";
        if (/Page not found/.test(t)) return "route not found";
      },
      page,
    );
  }
  await check(
    `${vp} not found: title is not the previous screen's`,
    async () => {
      await page.goto("/library");
      await page.locator("h1").first().waitFor();
      await page.goto("/this-page-does-not-exist");
      await page.getByRole("heading", { name: "Page not found" }).waitFor();
      const t = await page.title();
      if (/Library/.test(t)) return `title is "${t}"`;
    },
    page,
  );
  await context.close();
}

async function phaseProfiles() {
  const { context, page, log } = await open(browser, "desktop");
  const mainEl = page.locator("main");
  await check(
    "profiles: create a pen name with a bio, it appears in the list",
    async () => {
      await page.goto("/profiles/new");
      await page.getByLabel("Name on the book").fill(PEN);
      await mainEl
        .locator("textarea")
        .first()
        .fill("Smoke Tester writes plain, practical guides for people who work nights. This bio is checked word for word.");
      await page
        .getByRole("button", { name: /^Add profile/ })
        .first()
        .click();
      await page.waitForURL(/\/profiles\/(?!new)[^/]+/, { timeout: 15_000 });
      await page.goto("/profiles");
      await mainEl.getByRole("link", { name: new RegExp(PEN) }).waitFor({ timeout: 10_000 });
    },
    page,
  );
  await check(
    "profiles: edit the bio, save, reload and it stays",
    async () => {
      await mainEl.getByRole("link", { name: new RegExp(PEN) }).click();
      await mainEl.locator("textarea").first().waitFor();
      const bio = "Smoke Tester writes plain guides for night-shift workers. Edited by the smoke test.";
      await mainEl.locator("textarea").first().fill(bio);
      await page.getByRole("button", { name: /^Save/ }).first().click();
      await page.getByText(/Saved/i).first().waitFor({ timeout: 10_000 });
      await page.reload();
      const v = await mainEl.locator("textarea").first().inputValue();
      if (v !== bio) return `bio after reload: "${v.slice(0, 60)}"`;
    },
    page,
  );
  for (const tab of ["Identity", "Voice DNA", "Publishing defaults", "Models", "Memory"]) {
    await check(
      `profile editor: ${tab} tab opens without errors`,
      async () => {
        await page.getByRole("tab", { name: tab }).click();
        await page.getByRole("tabpanel").first().waitFor();
        const p = await audit(page);
        const bad = p.filter((x) => !/h1/.test(x));
        if (bad.length) return bad.slice(0, 3).join("; ");
      },
      page,
    );
  }
  await check("profiles: console, page errors and failed requests", async () => {
    const all = [...log.console, ...log.pageErrors, ...log.requests];
    if (all.length) return [...new Set(all)].slice(0, 4).join(" | ");
  });
  await context.close();
}

async function phaseWizard() {
  const { context, page, log } = await open(browser, "desktop");
  const mainEl = page.locator("main");
  await page.goto("/books/new");
  await mainEl.locator('label:has(input[name="profile"])').first().waitFor();
  await check(
    "wizard: the profile step lists every profile as a choice",
    async () => {
      const n = await mainEl.locator('label:has(input[name="profile"])').count();
      if (n < 5) return `only ${n} profiles`;
    },
    page,
  );
  await mainEl.locator('label:has(input[name="profile"])').filter({ hasText: PEN }).click();
  await mainEl.getByRole("button", { name: /^Next: Book type/ }).click();
  const tabs = await mainEl.getByRole("tab").count();
  let types = 0;
  for (let t = 0; t < tabs; t++) {
    await mainEl.getByRole("tab").nth(t).click();
    const cards = mainEl.locator('label:has(input[name="book-type"])');
    const n = await cards.count();
    const tabName = (await mainEl.getByRole("tab").nth(t).innerText()).replace(/\s+\d+$/, "").trim();
    for (let i = 0; i < n; i++) {
      const label = ((await cards.nth(i).innerText()).split("\n")[0] ?? "").trim();
      types++;
      await check(
        `wizard: book type "${label}" (${tabName}) can be chosen and moves on`,
        async () => {
          await cards.nth(i).click();
          const next = mainEl.getByRole("button", { name: /^Next: Idea/ });
          if (!(await next.isEnabled())) return "Next is disabled after choosing";
          const summary = await mainEl.getByText(/^Selected:/).innerText();
          if (!summary.includes(label)) return `summary says "${summary}"`;
        },
        page,
      );
    }
  }
  report(types === 36, `wizard: ${types} book types found`);
  // Pick one non-fiction type for the real run.
  await mainEl.getByRole("tab", { name: /^Non-fiction/ }).click();
  await mainEl.locator('label:has(input[name="book-type"])').filter({ hasText: "Self-help and personal growth" }).click();
  await check(
    "wizard: Next stays blocked until there is an idea",
    async () => {
      await mainEl.getByRole("button", { name: /^Next: Idea/ }).click();
      await mainEl.getByRole("button", { name: /^Next: Details/ }).click();
      await mainEl.getByText(/Add a sentence about the book/).waitFor({ timeout: 3000 });
      if (!(await mainEl.getByLabel("Idea or working title").isVisible())) return "left the idea step with an empty idea";
    },
    page,
  );
  await mainEl.getByLabel("Idea or working title").fill(`A practical guide for night-shift nurses on sleeping and eating well. Working title: ${TITLE}.`);
  await mainEl.getByRole("button", { name: /^Next: Details/ }).click();
  await check(
    "wizard: details step audit",
    async () => {
      const p = await audit(page);
      if (p.length) return p.slice(0, 3).join("; ");
    },
    page,
  );
  await mainEl.getByRole("button", { name: /^Next: Review/ }).click();
  await mainEl.getByRole("heading", { name: "Check and start" }).waitFor();
  await check(
    "wizard: Start research creates the book and opens Research",
    async () => {
      await mainEl.getByRole("button", { name: /^Start research/ }).click();
      await page.waitForURL(/\/books\/(?!new)[^/]+\/research/, { timeout: 30_000 });
      state.bookId = page.url().split("/books/")[1].split("/")[0];
      // The wizard starts the first research run by itself; the ?run=new mark leaves the URL once it has.
      await page.waitForFunction(() => !location.search.includes("run=new"), null, { timeout: 30_000 });
    },
    page,
  );
  await check("wizard: no console errors, page errors or failed requests", async () => {
    const all = [...log.console, ...log.pageErrors, ...log.requests];
    if (all.length) return [...new Set(all)].slice(0, 4).join(" | ");
  });
  await context.close();
}

async function phaseBook() {
  const { context, page, log } = await open(browser, "desktop");
  const mainEl = page.locator("main");
  const footer = page.locator('footer[aria-label="Step navigation"]');
  const step = (label) => footer.getByRole("button", { name: new RegExp(`^${label}`) });
  const id = state.bookId;
  if (!id) throw new Error("no book was created, cannot run the book steps");
  const errorsNow = async (label) =>
    check(`${label}: no console errors, page errors or failed requests`, async () => {
      const all = [...log.console, ...log.pageErrors, ...log.requests];
      log.console.length = log.pageErrors.length = log.requests.length = 0;
      if (all.length) return [...new Set(all)].slice(0, 4).join(" | ");
    });
  const auditNow = async (label) =>
    check(
      `${label}: layout and accessibility basics`,
      async () => {
        const p = await audit(page);
        if (p.length) return p.slice(0, 4).join("; ");
      },
      page,
    );

  await page.goto(`/books/${id}/research`);
  await check(
    "research: the mock dossier arrives",
    async () => {
      await mainEl.getByRole("heading", { name: "Audience", level: 2 }).waitFor({ timeout: JOB });
      await mainEl.getByRole("heading", { name: "Reader pains" }).waitFor();
      if (!(await step("Continue to titles").isEnabled())) return "Continue to titles is disabled";
    },
    page,
  );
  await auditNow("research");
  await errorsNow("research");

  await check(
    "titles: generate, pick a title, it is saved on the book",
    async () => {
      await step("Continue to titles").click();
      await page.waitForURL(/\/titles$/);
      await step("Generate titles").click();
      await mainEl.getByRole("heading", { name: "Topic directions" }).waitFor({ timeout: JOB });
      await mainEl.getByRole("button", { name: "Use this title" }).first().click();
      await page.getByRole("complementary", { name: "Titles details" }).waitFor();
      await step("Continue to blueprint").isEnabled();
    },
    page,
  );
  await auditNow("titles");
  await errorsNow("titles");

  await check(
    "blueprint: build it, approve it in the dialog, Writing opens",
    async () => {
      await step("Continue to blueprint").click();
      await page.waitForURL(/\/blueprint$/);
      await step("Build the blueprint").click();
      await mainEl.getByRole("heading", { name: "Chapters" }).waitFor({ timeout: JOB });
      await auditNowQuiet(page);
      await step("Approve blueprint").click();
      const dialog = page.getByRole("dialog", { name: /Approve blueprint version/ });
      await dialog.waitFor();
      await dialog.getByRole("button", { name: "Approve blueprint" }).click();
      await page.waitForURL(/\/writing$/, { timeout: 30_000 });
    },
    page,
  );
  await errorsNow("blueprint");

  await check(
    "writing: Write book finishes every section",
    async () => {
      await step("Write book").click();
      await step("Open editor").waitFor({ timeout: 180_000 });
      await mainEl.getByText(/Every section is written/).waitFor();
    },
    page,
  );
  await check(
    "writing: the summary does not claim everything is written while Acknowledgements still need names",
    async () => {
      const sections = page.getByRole("navigation", { name: "Sections" });
      const ack = sections.getByRole("button", { name: /^Acknowledgements/ });
      const placeholder = /Needs a look/.test(await ack.innerText());
      if (placeholder && (await mainEl.getByText("Every section is written.").count()) > 0)
        return "says 'Every section is written.' but Acknowledgements shows 'Needs a look' and Marketing stays locked";
    },
    page,
  );
  await check(
    "writing: names for Acknowledgements can be added and the section is written again",
    async () => {
      const sections = page.getByRole("navigation", { name: "Sections" });
      const ack = sections.getByRole("button", { name: /^Acknowledgements/ });
      if (!/Needs a look/.test(await ack.innerText())) return;
      await ack.click();
      await mainEl.getByRole("textbox", { name: "People to thank" }).fill("My sister Ada\nThe Tuesday writing group");
      await mainEl.getByRole("button", { name: "Save and write it again" }).click();
      await sections.getByRole("button", { name: /^Acknowledgements.*Done/s }).waitFor({ timeout: JOB });
    },
    page,
  );
  await auditNow("writing");
  await errorsNow("writing");

  await check(
    "editor: the first section opens and is editable",
    async () => {
      await step("Open editor").click();
      await page.waitForURL(/\/editor/);
      await page.locator('[contenteditable="true"][data-block-id]').first().waitFor({ timeout: 30_000 });
    },
    page,
  );
  await auditNow("editor");
  await errorsNow("editor");

  await check(
    "editor: Mark edit done opens a dialog that Escape closes",
    async () => {
      await step("Mark edit done").click();
      const dialog = page.getByRole("dialog", { name: "Mark the edit done?" });
      await dialog.waitFor();
      await page.keyboard.press("Escape");
      await dialog.waitFor({ state: "hidden", timeout: 3000 });
      await step("Mark edit done").click();
      await page.getByRole("dialog", { name: "Mark the edit done?" }).getByRole("button", { name: "Mark edit done" }).click();
      await page.waitForURL(/\/cover$/, { timeout: 30_000 });
    },
    page,
  );

  await check(
    "cover: make concepts, choose one, build covers",
    async () => {
      await step("Make concepts").click();
      const concepts = page
        .getByRole("group")
        .filter({ has: page.locator("label") })
        .first();
      await page.locator("main label").first().waitFor({ timeout: JOB });
      await page.locator("main label").first().click();
      await step("Use this concept").click();
      await step("Build covers").click();
      await footer.getByRole("link", { name: /^Next: Marketing/ }).waitFor({ timeout: JOB });
      void concepts;
    },
    page,
  );
  await auditNow("cover");
  await errorsNow("cover");

  await check(
    "marketing: generate the scripts",
    async () => {
      await footer.getByRole("link", { name: /^Next: Marketing/ }).click();
      await page.waitForURL(/\/marketing$/);
      await step("Generate scripts").click();
      await footer.getByRole("link", { name: /^(Next: |Skip to )Export/ }).waitFor({ timeout: JOB });
    },
    page,
  );
  await auditNow("marketing");
  await errorsNow("marketing");

  await check(
    "export: the step opens with the preflight list",
    async () => {
      await footer.getByRole("link", { name: /^(Next: |Skip to )Export/ }).click();
      await page.waitForURL(/\/export$/);
      await mainEl.getByRole("heading", { level: 1, name: "Export" }).waitFor();
      await settle(page);
    },
    page,
  );
  await auditNow("export");
  await errorsNow("export");
  await phaseExport(page, log, mainEl, footer);
  await context.close();
}

async function auditNowQuiet(page) {
  const p = await audit(page);
  if (p.length) throw new Error(`blueprint audit: ${p.slice(0, 3).join("; ")}`);
}

/** Colour contrast of visible text against the nearest opaque background (WCAG AA, 4.5 or 3 for large text). */
async function contrast(page) {
  return page.evaluate(() => {
    const parse = (c) => {
      const m = c.match(/rgba?\(([^)]+)\)/);
      if (!m) return null;
      const [r, g, b, a = 1] = m[1]
        .split(/[ ,/]+/)
        .filter(Boolean)
        .map(Number);
      return { r, g, b, a };
    };
    const lum = ({ r, g, b }) => {
      const f = (v) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    const bgOf = (el) => {
      for (let e = el; e; e = e.parentElement) {
        const c = parse(getComputedStyle(e).backgroundColor);
        if (c && c.a > 0.95) return c;
        if (getComputedStyle(e).backgroundImage !== "none") return null;
      }
      return { r: 255, g: 255, b: 255, a: 1 };
    };
    const bad = [];
    for (const el of document.querySelectorAll("body *")) {
      if (el.children.length || !el.textContent?.trim()) continue;
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      if (
        r.width < 4 ||
        r.height < 4 ||
        s.visibility === "hidden" ||
        s.display === "none" ||
        Number(s.opacity) < 0.5 ||
        el.closest("[aria-hidden=true], [disabled]")
      )
        continue;
      if (el.closest("button[disabled], [aria-disabled=true]")) continue;
      const fg = parse(s.color);
      const bg = bgOf(el);
      if (!fg || !bg || fg.a < 0.95) continue;
      const l1 = lum(fg),
        l2 = lum(bg);
      const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
      const large = parseFloat(s.fontSize) >= 24 || (parseFloat(s.fontSize) >= 18.66 && Number(s.fontWeight) >= 700);
      if (ratio < (large ? 3 : 4.5)) bad.push(`${ratio.toFixed(2)} "${el.textContent.trim().slice(0, 24)}"`);
    }
    return [...new Set(bad)].slice(0, 5);
  });
}

async function phaseExport(page, log, mainEl, footer) {
  const id = state.bookId;
  await check(
    "export: ticking warnings, then Build pack asks first and Escape closes the dialog",
    async () => {
      await page.goto(`/books/${id}/export`);
      const preflight = mainEl.locator('section[aria-labelledby="preflight-title"]');
      await preflight
        .getByRole("status")
        .getByText(/passed/)
        .waitFor({ timeout: JOB });
      const labels = preflight.getByText("I have checked this");
      for (let i = (await labels.count()) - 1; i >= 0; i--) await labels.nth(i).click();
      const build = footer.getByRole("button", { name: /^Build pack/ });
      await page
        .waitForFunction(() => [...document.querySelectorAll("footer button")].some((b) => /^Build pack/.test(b.textContent ?? "") && !b.disabled), null, {
          timeout: 8000,
        })
        .catch(() => {});
      if (!(await build.isEnabled())) return "Build pack stays disabled after every warning is ticked";
      await build.click();
      const dialog = page.getByRole("dialog", { name: "Build pack" });
      await dialog.waitFor();
      await page.keyboard.press("Escape");
      await dialog.waitFor({ state: "hidden", timeout: 3000 });
      await build.click();
      await dialog.getByRole("button", { name: "Build pack" }).click();
      // The mock book is short (20 pages, KDP needs 24), so the pack is refused with a reason. Either end is fine;
      // what matters is that the screen says which.
      const ready = mainEl.getByRole("heading", { name: "Pack ready" });
      const refused = mainEl.getByText(/The upload pack was not built\. .+/);
      await ready.or(refused).first().waitFor({ timeout: 180_000 });
    },
    page,
  );
  await check(
    "export: a built file downloads with content",
    async () => {
      const dl = page.waitForEvent("download", { timeout: 20_000 });
      await mainEl.getByRole("link", { name: "Download", exact: true }).first().click();
      const d = await dl;
      const p = await d.path();
      const { statSync } = await import("node:fs");
      if (statSync(p).size < 1000) return `${d.suggestedFilename()} is tiny`;
    },
    page,
  );
  await check("export: no console errors, page errors or failed requests", async () => {
    const all = [...log.console, ...log.pageErrors, ...log.requests];
    log.console.length = log.pageErrors.length = log.requests.length = 0;
    if (all.length) return [...new Set(all)].slice(0, 4).join(" | ");
  });
  await check(
    "claims report: opens, lists claims, links back",
    async () => {
      await page.goto(`/books/${id}/claims`);
      await page.locator("main h1").first().waitFor();
      await settle(page);
      const t = await mainEl.innerText();
      if (/Page not found/.test(t)) return "route not found";
      if (t.length < 80) return "report looks empty";
      const p = await audit(page);
      if (p.length) return p.slice(0, 3).join("; ");
    },
    page,
  );
  await check(
    "published: Mark as published dialog (date default, Escape), then the shelf lists the book",
    async () => {
      await page.goto(`/books/${id}/export`);
      await mainEl.getByRole("button", { name: "Mark as published", exact: true }).click();
      const dialog = page.getByRole("dialog", { name: "Mark as published" });
      await dialog.waitFor();
      if (!(await dialog.getByLabel("Date published").inputValue()).match(/^\d{4}-\d{2}-\d{2}$/)) return "no default date";
      await page.keyboard.press("Escape");
      await dialog.waitFor({ state: "hidden", timeout: 3000 });
      await mainEl.getByRole("button", { name: "Mark as published", exact: true }).click();
      await dialog.getByRole("button", { name: "Mark as published", exact: true }).click();
      await dialog.waitFor({ state: "hidden", timeout: 10_000 });
      await page.goto("/published");
      await page
        .getByRole("heading", { name: new RegExp(TITLE) })
        .first()
        .waitFor({ timeout: 10_000 });
    },
    page,
  );
}

async function phaseBookPages(vp) {
  const { context, page, log } = await open(browser, vp);
  const id = state.bookId;
  if (!id) throw new Error("no book to visit");
  const pages = ["research", "titles", "blueprint", "writing", "editor", "claims", "cover", "marketing", "export"];
  for (const p of pages) await visit(page, log, `${vp} book ${p}`, `/books/${id}/${p}`);
  await visit(page, log, `${vp} published (with a book)`, "/published");
  await visit(page, log, `${vp} library (with books)`, "/library");
  await context.close();
}

async function phaseHub() {
  const { context, page, log } = await open(browser, "desktop");
  const mainEl = page.locator("main");
  const api = context.request;
  const hdr = { Origin: BASE };
  const profiles = await (await api.get(`${BASE}/api/v1/profiles`)).json();
  const pid = profiles.items.find((p) => p.penName === PEN)?.id ?? profiles.items[0].id;
  const made = [];
  for (let i = 1; i <= 2; i++) {
    const r = await api.post(`${BASE}/api/v1/books`, {
      headers: hdr,
      data: {
        profileId: pid,
        bookTypeId: "self-help",
        template: "nonfiction",
        idea: `Smoke seed idea ${i} ${STAMP}`,
        title: `Smoke Seed ${i} ${STAMP}`,
        settings: { acknowledgements: "Sam" },
      },
    });
    if (!r.ok()) throw new Error(`seeding a book answered ${r.status()}`);
    made.push((await r.json()).id);
  }
  page.on("dialog", async (d) => {
    await d.dismiss();
    report(false, `no native dialog (${d.type()}: ${d.message().slice(0, 60)})`);
  });
  await visit(page, log, "library with books", "/library?view=covers");
  await check(
    "library: cards show the new books and the Ledger view lists them",
    async () => {
      // The Library shows six cards per group, so narrow it with the filter box first.
      await page.getByPlaceholder("Filter by title or profile").fill(`Smoke Seed 1 ${STAMP}`);
      await mainEl.getByText(`Smoke Seed 1 ${STAMP}`).first().waitFor();
      await page.goto("/library?view=ledger");
      await mainEl.getByText(`Smoke Seed 2 ${STAMP}`).first().waitFor({ timeout: 10_000 });
    },
    page,
  );
  await check(
    "library: search in the command menu finds a book, Escape closes it",
    async () => {
      await page.goto("/library");
      await page.locator("main h1").first().waitFor();
      await page.keyboard.press("Control+k");
      const dlg = page.getByRole("dialog").first();
      await dlg.waitFor({ timeout: 5000 });
      await page.keyboard.type(`Smoke Seed 1 ${STAMP}`);
      await dlg.getByText(`Smoke Seed 1 ${STAMP}`).first().waitFor({ timeout: 5000 });
      await page.keyboard.press("Escape");
      await dlg.waitFor({ state: "hidden", timeout: 3000 });
    },
    page,
  );
  await check(
    "library: pen name switcher filters the books",
    async () => {
      await page.goto("/library");
      await page.locator("main h1").first().waitFor();
      const sw = page.getByRole("button", { name: /All profiles/ }).first();
      await sw.click();
      await page
        .getByRole("option", { name: new RegExp(PEN) })
        .or(page.getByRole("menuitemradio", { name: new RegExp(PEN) }))
        .or(page.getByRole("button", { name: new RegExp(PEN) }))
        .first()
        .click();
      await page.getByText(`Smoke Seed 1 ${STAMP}`).first().waitFor({ timeout: 5000 });
      if ((await mainEl.getByText(/Elena/).count()) > 0) return "books of another pen name still show";
    },
    page,
  );
  await check(
    "archive: a Library card asks in a dialog, Undo restores, archiving again shows it in Archive",
    async () => {
      await page.goto("/library?view=covers");
      const t = `Smoke Seed 2 ${STAMP}`;
      await page.getByPlaceholder("Filter by title or profile").fill(t);
      const btn = page.getByRole("button", { name: `Archive ${t}`, exact: true });
      await btn.click();
      const dlg = page.getByRole("dialog", { name: `Archive ${t}?` });
      await dlg.waitFor();
      await page.keyboard.press("Escape");
      await dlg.waitFor({ state: "hidden", timeout: 3000 });
      await btn.click();
      await dlg.getByRole("button", { name: "Archive book" }).click();
      await page.getByRole("button", { name: "Undo" }).click({ timeout: 5000 });
      await btn.waitFor({ timeout: 10_000 });
      await btn.click();
      await dlg.getByRole("button", { name: "Archive book" }).click();
      await page.goto("/archive");
      await page.getByText(t).first().waitFor({ timeout: 10_000 });
    },
    page,
  );
  await visit(page, log, "archive with a book", "/archive");
  await check(
    "volume mode: a batch of two books is created from the dialog",
    async () => {
      await page.goto("/volume");
      await mainEl.getByRole("button", { name: "New batch" }).first().click();
      const dlg = page.getByRole("dialog", { name: "New batch" });
      await dlg.waitFor();
      await dlg.getByLabel("Name", { exact: true }).fill(`Smoke batch ${STAMP}`);
      await dlg.locator("label", { hasText: `Smoke Seed 1 ${STAMP}` }).click();
      await dlg.getByRole("button", { name: "Create batch" }).click();
      await page.waitForURL(/\/volume\/batches\/[^/]+$/, { timeout: 15_000 });
      await mainEl.getByRole("heading", { level: 1, name: `Smoke batch ${STAMP}` }).waitFor();
      const p = await audit(page);
      if (p.length) return p.slice(0, 3).join("; ");
    },
    page,
  );
  await check(
    "volume mode: the batch is listed and New batch dialog closes with Escape",
    async () => {
      await page.goto("/volume");
      await mainEl.getByText(`Smoke batch ${STAMP}`).first().waitFor();
      await mainEl.getByRole("button", { name: "New batch" }).first().click();
      const dlg = page.getByRole("dialog", { name: "New batch" });
      await dlg.waitFor();
      await page.keyboard.press("Escape");
      await dlg.waitFor({ state: "hidden", timeout: 3000 });
    },
    page,
  );
  await check(
    "release schedule: Plan a release opens a dialog that Escape closes",
    async () => {
      await page.goto("/volume/schedule");
      await mainEl.getByRole("button", { name: "Plan a release" }).click();
      const dlg = page.getByRole("dialog").first();
      await dlg.waitFor({ timeout: 5000 });
      await page.keyboard.press("Escape");
      await dlg.waitFor({ state: "hidden", timeout: 3000 });
      await mainEl.getByRole("button", { name: "Next 7 days" }).click();
      await mainEl.getByRole("button", { name: "Today" }).click();
    },
    page,
  );
  await check("hub: no console errors, page errors or failed requests", async () => {
    const all = [...log.console, ...log.pageErrors, ...log.requests];
    if (all.length) return [...new Set(all)].slice(0, 4).join(" | ");
  });
  await context.close();
}

/** Every internal link on the main screens leads somewhere that is not Page not found. */
async function phaseLinks() {
  const { context, page } = await open(browser, "desktop");
  const seen = new Set();
  for (const start of [
    "/library",
    "/published",
    "/profiles",
    "/settings",
    "/volume",
    "/archive",
    `/books/${state.bookId}/export`,
    `/books/${state.bookId}/writing`,
  ]) {
    await page.goto(start);
    await page.locator("main h1").first().waitFor({ timeout: 15_000 });
    await settle(page);
    const hrefs = await page.evaluate(() =>
      [...document.querySelectorAll("a[href]")]
        .map((a) => a.getAttribute("href"))
        .filter((h) => h && h.startsWith("/") && !h.startsWith("//") && !h.includes("/api/")),
    );
    for (const h of hrefs) seen.add(h.split("#")[0]);
  }
  for (const h of seen) {
    await check(
      `link ${h} leads to a real screen`,
      async () => {
        await page.goto(h);
        await page.locator("h1").first().waitFor({ timeout: 15_000 });
        const t = await page.locator("h1").first().innerText();
        if (/not found/i.test(t)) return `shows "${t}"`;
      },
      page,
    );
  }
  await context.close();
}

async function phaseThemes() {
  for (const scheme of ["light", "dark"]) {
    const { context, page, log } = await open(browser, "desktop", scheme);
    await page.goto("/library");
    await page.locator("main h1").first().waitFor();
    await check(
      `${scheme} theme follows the system setting`,
      async () => {
        const t = await page.evaluate(() => document.documentElement.getAttribute("data-theme"));
        if (t !== scheme) return `data-theme is ${t}`;
      },
      page,
    );
    const urls = [
      "/library",
      "/profiles",
      "/books/new",
      "/settings",
      "/volume",
      "/published",
      `/books/${state.bookId}/writing`,
      `/books/${state.bookId}/export`,
    ];
    for (const u of urls) {
      await page.goto(u);
      await page.locator("main h1").first().waitFor({ timeout: 15_000 });
      await settle(page);
      await check(
        `${scheme} theme ${u.replace(state.bookId, ":book")}: text contrast`,
        async () => {
          const bad = await contrast(page);
          if (bad.length) return bad.join("; ");
        },
        page,
      );
      await check(
        `${scheme} theme ${u.replace(state.bookId, ":book")}: layout basics`,
        async () => {
          const p = await audit(page);
          if (p.length) return p.slice(0, 3).join("; ");
        },
        page,
      );
    }
    if (scheme === "light") {
      await check(
        "theme toggle switches to dark and the choice survives a reload",
        async () => {
          await page.goto("/library");
          await page
            .getByRole("radio", { name: "Dark" })
            .or(page.getByRole("button", { name: /Dark/ }))
            .first()
            .click();
          if ((await page.evaluate(() => document.documentElement.getAttribute("data-theme"))) !== "dark") return "did not switch";
          await page.reload();
          await page.locator("main h1").first().waitFor();
          if ((await page.evaluate(() => document.documentElement.getAttribute("data-theme"))) !== "dark") return "choice lost on reload";
        },
        page,
      );
    }
    await check(`${scheme} theme: no console errors or failed requests`, async () => {
      const all = [...log.console, ...log.pageErrors, ...log.requests];
      if (all.length) return [...new Set(all)].slice(0, 4).join(" | ");
    });
    await context.close();
  }
}

async function phaseKeyboard() {
  const { context, page } = await open(browser, "desktop");
  await page.goto("/library");
  await page.locator("main h1").first().waitFor();
  await settle(page);
  await check(
    "keyboard: the first Tab stop is the skip link, Enter moves focus to main",
    async () => {
      await page.keyboard.press("Tab");
      const t = await page.evaluate(() => document.activeElement?.textContent?.trim());
      if (t !== "Skip to content") return `first stop is "${t}"`;
      const box = await page.evaluate(() => document.activeElement.getBoundingClientRect().top);
      if (box < 0) return "skip link is not on screen when focused";
      await page.keyboard.press("Enter");
      if (!(await page.evaluate(() => document.activeElement?.id === "main"))) return "focus did not land on main";
    },
    page,
  );
  await check(
    "keyboard: every Tab stop in the first 25 has a visible focus ring and a name",
    async () => {
      await page.goto("/library");
      await page.locator("main h1").first().waitFor();
      await settle(page);
      const problems = [];
      for (let i = 0; i < 25; i++) {
        await page.keyboard.press("Tab");
        const r = await page.evaluate(() => {
          const el = document.activeElement;
          if (!el || el === document.body) return null;
          const s = getComputedStyle(el);
          const ring = (s.outlineStyle !== "none" && parseFloat(s.outlineWidth) > 0) || (s.boxShadow && s.boxShadow !== "none");
          const name = (
            el.getAttribute("aria-label") ||
            el.textContent ||
            el.getAttribute("title") ||
            [...(el.labels ?? [])].map((l) => l.textContent).join(" ") ||
            ""
          ).trim();
          const r = el.getBoundingClientRect();
          return { ring, name: name.slice(0, 30), tag: el.tagName, onScreen: r.bottom > 0 && r.top < innerHeight && r.right > 0 };
        });
        if (!r) continue;
        if (!r.ring) problems.push(`no focus ring on ${r.tag} "${r.name}"`);
        if (!r.name) problems.push(`unnamed ${r.tag}`);
        if (!r.onScreen) problems.push(`focus off screen on ${r.tag} "${r.name}"`);
      }
      if (problems.length) return [...new Set(problems)].slice(0, 4).join("; ");
    },
    page,
  );
  await context.close();
  const m = await open(browser, "mobile");
  await m.page.goto("/library");
  await m.page.locator("main h1").first().waitFor();
  await check(
    "keyboard (mobile): the menu dialog opens, traps focus, and Escape returns focus",
    async () => {
      const open = m.page.getByRole("button", { name: "Open menu", exact: true });
      await open.focus();
      await m.page.keyboard.press("Enter");
      const menu = m.page.getByRole("dialog", { name: "Menu", exact: true });
      await menu.waitFor();
      for (let i = 0; i < 12; i++) {
        await m.page.keyboard.press("Tab");
        if (!(await menu.evaluate((e) => e.contains(document.activeElement)))) return "focus left the menu";
      }
      await m.page.keyboard.press("Escape");
      await menu.waitFor({ state: "hidden", timeout: 3000 });
      if (!(await open.evaluate((e) => e === document.activeElement))) return "focus did not return to the menu button";
    },
    m.page,
  );
  await m.context.close();
}

/** D-061: once the API has answered, a dead server must never bring back sample data. Blocks /api after the app loaded. */
async function phaseOffline() {
  const { context, page } = await open(browser, "desktop");
  const nudge = () => page.evaluate(() => document.dispatchEvent(new Event("visibilitychange"))).catch(() => {});
  const bodyText = () => page.locator("body").innerText();
  const books = await fetch(`${BASE}/api/v1/books`)
    .then((r) => r.json())
    .catch(() => ({ items: [] }));
  const realTitle = (books.items ?? []).map((b) => b.title).find((t) => typeof t === "string" && t.length > 3) ?? "";
  await page.goto("/library");
  await page.locator("main h1").first().waitFor();
  await settle(page);
  await check(
    "offline: before the drop the app shows real data, no Demo badge and no sample spend",
    async () => {
      const t = await bodyText();
      if (/\bDemo\b/.test(t)) return "Demo badge while the server is up";
      if (/\$4\.82/.test(t)) return "sample spend ($4.82) while the server is up";
      if (realTitle && !t.includes(realTitle)) return `real book "${realTitle}" not on screen`;
    },
    page,
  );
  await context.route("**/api/**", (r) => r.abort());
  await check(
    "offline: after the drop the Not connected banner appears (up to 40s)",
    async () => {
      const banner = page.getByTestId("not-connected-banner");
      const end = Date.now() + 40_000;
      while (Date.now() < end && !(await banner.isVisible().catch(() => false))) {
        await nudge();
        await page.waitForTimeout(1000);
      }
      await banner.waitFor({ timeout: 2000 });
      const t = await banner.innerText();
      if (!/Not connected\. Showing your last saved view\. Reconnecting\.\.\./.test(t)) return `banner words: ${t.slice(0, 120)}`;
    },
    page,
  );
  await check(
    "offline: no Demo badge and no invented spend ($4.82), and the real data is still there",
    async () => {
      const t = await bodyText();
      if (/\bDemo\b/.test(t)) return "Demo badge appeared";
      if (/\$4\.82/.test(t)) return "invented spend ($4.82 of $40) appeared";
      if (/sample data/i.test(t)) return "sample-data wording appeared";
      if (realTitle && !t.includes(realTitle)) return `real book "${realTitle}" disappeared`;
    },
    page,
  );
  await check(
    "offline: waiting does not bring the sample data back (two more health checks)",
    async () => {
      for (let i = 0; i < 2; i++) {
        await nudge();
        await page.waitForTimeout(2500);
      }
      const t = await bodyText();
      if (/\bDemo\b|\$4\.82/.test(t)) return "sample data appeared after a later health check";
      if (!(await page.getByTestId("not-connected-banner").isVisible())) return "banner went away while still offline";
    },
    page,
  );
  await context.unroute("**/api/**");
  await check(
    "offline: when the API returns the banner clears and the data is refetched (up to 45s)",
    async () => {
      const banner = page.getByTestId("not-connected-banner");
      const end = Date.now() + 45_000;
      while (Date.now() < end && (await banner.isVisible().catch(() => false))) {
        await nudge();
        await page.waitForTimeout(1000);
      }
      if (await banner.isVisible()) return "banner still showing 45s after the API returned";
      const t = await bodyText();
      if (/\bDemo\b|\$4\.82/.test(t)) return "sample data after recovery";
      if (realTitle && !t.includes(realTitle)) return `real book "${realTitle}" missing after recovery`;
    },
    page,
  );
  await context.close();
}

/* ------------------------------------------------------------------ pack (SMOKE_PACK=1) ------------------------------------------------------------------ */

/** A tiny zip reader (central directory plus raw inflate), so no package is needed. Entries: { name, size, method, read() }. */
function readZip(buf) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 70_000); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("not a zip file");
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const entries = [];
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error("bad central directory");
    const method = buf.readUInt16LE(p + 10);
    const compressed = buf.readUInt32LE(p + 20);
    const size = buf.readUInt32LE(p + 24);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.toString("utf8", p + 46, p + 46 + nameLen);
    entries.push({
      name,
      size,
      method,
      read: () => {
        const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
        const raw = buf.subarray(start, start + compressed);
        return method === 0 ? Buffer.from(raw) : inflateRawSync(raw);
      },
    });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

/** Letters and digits only, lower case, so line wraps, hyphens, curly quotes and entities do not matter. */
const squash = (s) =>
  s
    .replace(/&amp;/g, "&")
    .replace(/&#x27;|&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "");

/** Calls the server API directly (the same one the web app proxies). */
async function packApi(method, route, body) {
  const r = await fetch(`${BASE}/api/v1${route}`, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`${method} ${route} answered ${r.status}: ${text.slice(0, 200)}`);
  return text ? JSON.parse(text) : null;
}

/** Waits for an accepted job; a job that ends any way but done is an error carrying its message. */
async function packDone(accepted) {
  const id = accepted.id ?? accepted.jobId;
  for (let i = 0; i < 240; i++) {
    const j = await packApi("GET", `/jobs/${id}`);
    if (j.status === "succeeded" || j.status === "done") return j;
    if (["failed", "cancelled", "paused", "needs_attention"].includes(j.status))
      throw new Error(
        `job ${j.kind} ${j.status}: ${j.error ?? ""} ${JSON.stringify((j.result?.preflight?.items ?? []).filter((x) => x.severity === "block").map((x) => x.message)).slice(0, 300)}`,
      );
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error("a job took longer than four minutes");
}

/**
 * A long-enough book with two parts, made through the API up to (and including) marketing, cover and claims:
 * everything the pack needs except the preflight ticks and the build itself. Returns { id, bio, chapterIds }.
 */
async function makeLongPackBook(bio, titleTag) {
  const api = packApi;
  const done = packDone;
  const profile = await api("POST", "/profiles", { penName: `Pack Tester ${titleTag}`, bioThirdPerson: bio });
  const book = await api("POST", "/books", {
    profileId: profile.id,
    bookTypeId: "self-help",
    idea: "Calm mornings for people on shifts.",
    title: `Smoke Pack ${titleTag}`,
    settings: { acknowledgements: ["The reading group at the library"] },
  });
  const id = book.id;
  await done(await api("POST", `/books/${id}/research`, {}));
  await done(await api("POST", `/books/${id}/title-sets`, {}));
  const [set] = (await api("GET", `/books/${id}/title-sets`)).items;
  await api("POST", `/title-sets/${set.id}/choose`, { index: 0 });
  await done(await api("POST", `/books/${id}/blueprints`, { chapterCount: 6 }));
  // Two parts: the first three chapters in Part I, the rest in Part II.
  const bp = (await api("GET", `/books/${id}/blueprint`)).blueprint.data;
  const chapters = bp.chapters.map((c, i) => ({ ...c, part: i < bp.chapters.length / 2 ? 1 : 2 }));
  await api("PATCH", `/books/${id}/blueprint`, {
    parts: {
      parts: [
        { number: 1, title: "Foundations" },
        { number: 2, title: "Putting it to work" },
      ],
      chapters,
    },
  });
  await api("POST", `/books/${id}/blueprint/approve`, {});
  await done(await api("POST", `/books/${id}/write`, {}));
  // The mock AI writes about 1,000 words in all and KDP needs 24 pages: add text of our own to every chapter, as an author would.
  const tree = await api("GET", `/books/${id}/sections`);
  const chapterSections = tree.body.flatMap((b) => (b.kind === "part" ? b.children : [b])).filter((x) => x.kind === "chapter");
  for (const ch of chapterSections) {
    const cur = await api("GET", `/sections/${ch.id}`);
    const sentences = Array.from(
      { length: 150 },
      (_, i) => `On shift number ${i + 1} I slept for seven hours in a dark room and felt calmer for the next one.`,
    );
    const paras = [];
    for (let i = 0; i < sentences.length; i += 6) paras.push(sentences.slice(i, i + 6).join(" "));
    await api("POST", `/sections/${ch.id}/versions`, { bodyMd: `${cur.current?.bodyMd ?? ""}\n\n${paras.join("\n\n")}` });
  }
  // A scratch database: every claim the mock writer raised is the author's own experience.
  for (const c of (await api("GET", `/books/${id}/claims`)).items.filter((x) => x.status === "open"))
    await api("POST", `/claims/${c.id}/verify`, { authorExperience: true });
  await done(await api("POST", `/books/${id}/listing`, {}));
  await done(await api("POST", `/books/${id}/cover/concepts`, {}));
  const { cover } = await api("GET", `/books/${id}/cover`);
  await api("POST", `/books/${id}/cover/choose`, { assetId: cover.concepts[0].assetId });
  await done(await api("POST", `/books/${id}/cover/build`, {}));
  await done(await api("POST", `/books/${id}/marketing`, {}));
  return { id, chapterIds: chapterSections.map((c) => c.id) };
}

async function phasePack() {
  const api = packApi;
  const done = packDone;

  const bio = `Pat Packer writes plain books for busy people. ${STAMP} is the proof that this bio is printed word for word.`;
  let id = "";
  let zip = [];
  let record = null;
  let pdfPages = 0;
  await check("pack: a long-enough book with two parts goes from idea to a built KDP pack", async () => {
    id = (await makeLongPackBook(bio, STAMP)).id;
    const pf = await api("GET", `/books/${id}/preflight`);
    for (const w of pf.items.filter((x) => x.severity === "warn")) await api("PUT", `/books/${id}/preflight/acknowledgements`, { itemId: w.id, on: true });
    await done(await api("POST", `/books/${id}/exports`, {}));
    const list = (await api("GET", `/books/${id}/exports`)).items;
    record = list.find((e) => e.kind === "pack" && e.status === "done");
    if (!record) return "no finished pack export";
    const res = await fetch(`${BASE}/api/v1/exports/${record.id}/download`);
    zip = readZip(Buffer.from(await res.arrayBuffer()));
    const pdfRecord = list.find((e) => e.kind === "pdf_print" && e.status === "done");
    pdfPages = pdfRecord?.pageCount ?? 0;
    if (pdfPages < 24) return `the interior PDF has ${pdfRecord?.pageCount} pages, KDP needs 24`;
  });
  if (!zip.length) return;

  const names = zip.map((e) => e.name);
  const entry = (re) => zip.find((e) => re.test(e.name));
  await check("pack: every file the export spec names is in the zip and none is empty", async () => {
    const need = [
      /^README\.txt$/,
      /^manuscript\/[^/]+-interior-[^/]+\.pdf$/,
      /^manuscript\/[^/]+\.epub$/,
      /^manuscript\/[^/]+\.docx$/,
      /^manuscript\/[^/]+\.txt$/,
      /^manuscript\/[^/]+\.md$/,
      /^cover\/[^/]+-ebook-cover\.jpg$/,
      /^cover\/[^/]+-paperback-wrap-[^/]+\.pdf$/,
      /^listing\/(metadata|back-cover-blurb|short-bio|ai-disclosure)\.txt$/,
      /^listing\/description\.html$/,
      /^reports\/preflight\.txt$/,
      /^reports\/claims-to-verify\.csv$/,
      /^reports\/kdp-rules-used\.txt$/,
      /^marketing\/00-START-HERE\.txt$/,
      /^marketing\/tiktok\/tiktok-01-.+\.txt$/,
      /^marketing\/tiktok\/all-tiktok-scripts\.txt$/,
      /^marketing\/instagram\/instagram-01-.+\.txt$/,
      /^marketing\/instagram\/all-instagram-captions\.txt$/,
      /^marketing\/email\/launch-email-01-.+\.txt$/,
      /^marketing\/email\/all-launch-emails\.txt$/,
    ];
    const missing = need.filter((re) => !names.some((n) => re.test(n))).map(String);
    if (missing.length) return `missing: ${missing.join(" ")}`;
    const empty = zip.filter((e) => !e.name.endsWith("/") && e.size === 0).map((e) => e.name);
    if (empty.length) return `empty: ${empty.join(", ")}`;
  });
  await check("pack: the marketing posts are real text, not placeholders", async () => {
    const bad = zip
      .filter((e) => /^marketing\/.+\.txt$/.test(e.name))
      .filter((e) => {
        const t = e.read().toString("utf8");
        return t.trim().length < 40 || /\bundefined\b|\[object|\{\w+\}|\bNaN\b/.test(t);
      })
      .map((e) => e.name);
    if (bad.length) return bad.join(", ");
  });

  const md =
    entry(/^manuscript\/[^/]+\.md$/)
      ?.read()
      .toString("utf8") ?? "";
  const headings = [...md.matchAll(/^# (.+)$/gm)].map((m) => m[1].trim());
  const sections = md.split(/^# .+$/m).slice(1);
  const chapterHeadings = headings.filter((h) => /^Chapter \d+:/.test(h));
  await check("pack: MD has every chapter, no empty section and no placeholder junk", async () => {
    if (chapterHeadings.length !== 6) return `${chapterHeadings.length} chapters in the MD, expected 6`;
    const empty = headings.filter((h, i) => sections[i].replace(/^::: [\s\S]*?^:::$/gm, "").trim() === "" && !/::: contents/.test(sections[i]));
    if (empty.length) return `empty sections: ${empty.join(", ")}`;
    const junk = md.match(/.{0,30}(\{[A-Za-z_ ]+\}|\bundefined\b|\[object|\bNaN\b|\bTODO\b).{0,30}/);
    if (junk) return `junk: ${junk[0]}`;
  });
  await check("pack: each part divider is followed by its own chapters (never two parts in a row)", async () => {
    if (/^::: part\n.+\n.+\n:::\n+::: part/m.test(md)) return "Part I and Part II back to back";
    const at = (needle) => md.indexOf(needle);
    const ok =
      at("Part I\nFoundations") < at("# Chapter 1:") &&
      at("# Chapter 3:") < at("Part II\nPutting it to work") &&
      at("Part II\nPutting it to work") < at("# Chapter 4:");
    if (!ok) return "the parts are not around their chapters";
  });
  await check("pack: About the author is the profile bio word for word in MD and TXT", async () => {
    const txt =
      entry(/^manuscript\/[^/]+\.txt$/)
        ?.read()
        .toString("utf8") ?? "";
    if (!squash(md).includes(squash(bio))) return "MD";
    if (!squash(txt).includes(squash(bio))) return "TXT";
    if (txt.includes("\r") || !txt.endsWith("\n")) return "TXT line endings";
  });
  await check("pack: EPUB opens, mimetype is first and stored, the cover is declared, the nav lists parts and chapters", async () => {
    const epub = entry(/^manuscript\/[^/]+\.epub$/);
    const inner = readZip(epub.read());
    if (inner[0].name !== "mimetype" || inner[0].method !== 0) return "mimetype is not the first stored entry";
    const opf =
      inner
        .find((e) => e.name.endsWith(".opf"))
        ?.read()
        .toString("utf8") ?? "";
    if (!/properties="cover-image"/.test(opf)) return "no cover-image in the package";
    const nav = (
      inner
        .find((e) => /nav\.xhtml$/.test(e.name))
        ?.read()
        .toString("utf8") ?? ""
    ).replace(/<[^>]+>/g, " ");
    const missing = ["Foundations", "Putting it to work", ...chapterHeadings.map((h) => h.replace(/^Chapter \d+: /, ""))].filter((t) => !nav.includes(t));
    if (missing.length) return `nav misses: ${missing.join(", ")}`;
    const text = inner.filter((e) => /text\/.+\.x?html$/.test(e.name) && !/cover\.xhtml$/.test(e.name));
    const blank = text
      .filter(
        (e) =>
          e
            .read()
            .toString("utf8")
            .replace(/<head>[\s\S]*?<\/head>/, "")
            .replace(/<[^>]+>/g, "")
            .trim() === "",
      )
      .map((e) => e.name);
    if (blank.length) return `empty pages: ${blank.join(", ")}`;
    const all = squash(
      text
        .map((e) =>
          e
            .read()
            .toString("utf8")
            .replace(/<[^>]+>/g, " "),
        )
        .join(" "),
    );
    if (!all.includes(squash(bio))) return "bio is not word for word";
  });
  await check("pack: DOCX opens and has a Heading 1 for every chapter and part", async () => {
    const docx = readZip(entry(/^manuscript\/[^/]+\.docx$/).read());
    const xml =
      docx
        .find((e) => e.name === "word/document.xml")
        ?.read()
        .toString("utf8") ?? "";
    const h1 = [...xml.matchAll(/<w:p[ >][\s\S]*?<\/w:p>/g)]
      .filter((m) => /<w:pStyle w:val="Heading1"/.test(m[0]))
      .map((m) => [...m[0].matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((x) => x[1]).join(""));
    const missing = chapterHeadings.map((h) => h.replace(/^Chapter \d+: /, "")).filter((t) => !h1.some((x) => x.includes(t)));
    if (missing.length) return `no Heading 1 for: ${missing.join(", ")}`;
    if (!squash(xml.replace(/<\/w:p>/g, " ").replace(/<[^>]+>/g, "")).includes(squash(bio))) return "bio is not word for word";
  });
  await check("pack: the print PDF has the title page, contents, every heading, the bio and no blank page after a heading", async () => {
    const pdf = entry(/^manuscript\/[^/]+-interior-[^/]+\.pdf$/).read();
    const dir = path.join(process.env.TMPDIR ?? "/tmp", `volume-smoke-pack-${STAMP}`);
    mkdirSync(dir, { recursive: true });
    const file = path.join(dir, "interior.pdf");
    writeFileSync(file, pdf);
    const run = spawnSync("pdftotext", ["-layout", file, "-"], { maxBuffer: 1 << 28 });
    if (run.error) {
      console.log("SKIP  pack: PDF text checks need pdftotext (poppler), which is not installed");
      return;
    }
    const pages = run.stdout.toString("utf8").split("\f");
    pages.length = Math.min(pages.length, pdfPages);
    const flat = pages.map(squash);
    if (!flat[0].includes(squash(`Smoke Pack ${STAMP}`).slice(0, 12))) return "title page does not carry the title";
    const contents = flat.findIndex((t, i) => i < 8 && t.startsWith("contents"));
    if (contents < 0) return "no contents page";
    const wanted = ["foundations", "puttingittowork", ...chapterHeadings.map((h) => squash(h.replace(/^Chapter \d+: /, "")))];
    const missing = wanted.filter(
      (w) =>
        !flat
          .slice(0, contents + 3)
          .join("")
          .includes(w) || flat.slice(contents + 1).filter((t) => t.includes(w)).length === 0,
    );
    if (missing.length) return `contents or body misses: ${missing.join(", ")}`;
    if (!flat.join("").includes(squash(bio))) return "bio is not word for word";
    const blankAfter = [];
    for (let i = 0; i < pages.length - 1; i++) if (pages[i].trim() && pages[i].trim().length < 120 && !pages[i + 1].trim()) blankAfter.push(i + 1);
    if (blankAfter.length) return `a heading page is followed by a blank page: page ${blankAfter.join(", ")}`;
  });
}

try {
  await main();
} catch (err) {
  report(false, "smoke run crashed", String(err instanceof Error ? err.message : err).split("\n")[0]);
} finally {
  await browser.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
if (fail) console.log(`Failed:\n  ${failures.join("\n  ")}`);
process.exit(fail ? 1 : 0);

/* ------------------------------------------------------------------ pack through the browser (SMOKE_PACK_UI=1) ------------------------------------------------------------------ */

async function phasePackUi() {
  const bio = `Una Browser writes plain books for busy people. ${STAMP} is the proof that this bio is printed word for word.`;
  let book = null;
  await check("pack-ui: a long-enough book with two parts is made through the API", async () => {
    book = await makeLongPackBook(bio, `UI ${STAMP}`);
  });
  if (!book) return;
  const { context, page, log } = await open(browser, "desktop");
  const mainEl = page.locator("main");
  const footer = page.locator("footer");
  await page.goto(`/books/${book.id}/export`);
  await check(
    "pack-ui: the preflight list renders with its checks",
    async () => {
      const preflight = mainEl.locator('section[aria-labelledby="preflight-title"]');
      await preflight.waitFor({ timeout: JOB });
      await preflight
        .getByRole("status")
        .getByText(/passed|warning|fail/i)
        .first()
        .waitFor({ timeout: JOB });
      const rows = await preflight.locator("li").count();
      if (rows < 5) return `only ${rows} preflight rows`;
      if (
        !(await mainEl
          .getByText(/Not built/)
          .first()
          .isVisible())
      )
        return "no 'Not built' file status before the first build";
      if (await mainEl.getByRole("heading", { name: "Pack ready" }).count()) return "Pack ready shown before any build";
    },
    page,
  );
  await check(
    "pack-ui: ticking every warning enables Build pack, which asks first, builds and shows Pack ready",
    async () => {
      const labels = mainEl.locator('section[aria-labelledby="preflight-title"]').getByText("I have checked this");
      for (let i = (await labels.count()) - 1; i >= 0; i--) await labels.nth(i).click();
      const build = footer.getByRole("button", { name: /^Build pack/ });
      await page
        .waitForFunction(() => [...document.querySelectorAll("footer button")].some((b) => /^Build pack/.test(b.textContent ?? "") && !b.disabled), null, {
          timeout: 10_000,
        })
        .catch(() => {});
      if (!(await build.isEnabled())) return `Build pack stays disabled: ${(await mainEl.innerText()).slice(0, 200).replace(/\s+/g, " ")}`;
      await build.click();
      const dialog = page.getByRole("dialog", { name: "Build pack" });
      await dialog.waitFor();
      await dialog.getByRole("button", { name: "Build pack" }).click();
      const ready = mainEl.getByRole("heading", { name: "Pack ready" });
      const refused = mainEl.getByText(/The upload pack was not built\. .+|The final preflight blocked the upload pack/).first();
      await ready.or(refused).first().waitFor({ timeout: 240_000 });
      if (!(await ready.isVisible())) return `the build was refused: ${(await refused.innerText()).slice(0, 200)}`;
    },
    page,
  );
  let zip = [];
  await check(
    "pack-ui: Download delivers a zip that unzips with the expected files",
    async () => {
      const dl = page.waitForEvent("download", { timeout: 30_000 });
      await mainEl.getByRole("heading", { name: "Pack ready" }).locator("xpath=ancestor::section").getByRole("link", { name: "Download", exact: true }).click();
      const d = await dl;
      if (!/\.zip$/i.test(d.suggestedFilename())) return `file is ${d.suggestedFilename()}, not a zip`;
      const file = await d.path();
      const { readFileSync } = await import("node:fs");
      zip = readZip(readFileSync(file));
      const names = zip.map((e) => e.name);
      const need = [
        /^README\.txt$/,
        /^manuscript\/[^/]+-interior-[^/]+\.pdf$/,
        /^manuscript\/[^/]+\.epub$/,
        /^manuscript\/[^/]+\.docx$/,
        /^cover\/[^/]+-ebook-cover\.jpg$/,
        /^cover\/[^/]+-paperback-wrap-[^/]+\.pdf$/,
        /^listing\/metadata\.txt$/,
        /^reports\/preflight\.txt$/,
        /^marketing\/00-START-HERE\.txt$/,
      ];
      const missing = need.filter((re) => !names.some((n) => re.test(n))).map(String);
      if (missing.length) return `missing: ${missing.join(" ")}`;
      const empty = zip.filter((e) => !e.name.endsWith("/") && e.size === 0).map((e) => e.name);
      if (empty.length) return `empty: ${empty.join(", ")}`;
    },
    page,
  );
  await check(
    "pack-ui: the page then says Exported",
    async () => {
      await mainEl
        .getByText(/^Exported .*Nothing in it has changed since\./)
        .first()
        .waitFor({ timeout: 15_000 });
      if (await mainEl.getByText(/Changed since export/).count()) return "also says Changed since export";
      await page.reload();
      await mainEl
        .getByText(/^Exported .*Nothing in it has changed since\./)
        .first()
        .waitFor({ timeout: 15_000 });
      const label = await footer.getByRole("button", { name: /^Build pack/ }).innerText();
      if (!/again/i.test(label)) return `footer button says "${label}" while Exported, not Build pack again`;
    },
    page,
  );
  /** Moves inside the app with no reload (React Router listens to popstate). */
  const goInApp = async (to) => {
    await page.evaluate((t) => {
      history.pushState({}, "", t);
      dispatchEvent(new PopStateEvent("popstate"));
    }, to);
  };
  await check(
    "pack-ui: after an edit elsewhere, coming back to Export in the app (no reload) says Changed since export at once",
    async () => {
      await goInApp(`/books/${book.id}/cover`);
      await page.locator("main h1").first().waitFor();
      const id = book.chapterIds[0];
      const cur = await packApi("GET", `/sections/${id}`);
      await packApi("POST", `/sections/${id}/versions`, { bodyMd: `${cur.current?.bodyMd ?? ""}\n\nOne more line added after the export.` });
      await goInApp(`/books/${book.id}/export`);
      await mainEl
        .getByText(/Changed since export/)
        .first()
        .waitFor({ timeout: 8000 });
      if (await mainEl.getByText(/Nothing in it has changed since/).count()) return "still says Exported";
      const label = await footer.getByRole("button", { name: /^Build pack/ }).innerText();
      if (/again/i.test(label)) return `footer button still says "${label}" when the pack is out of date`;
    },
    page,
  );
  await check(
    "pack-ui: a reload also says Changed since export",
    async () => {
      await page.reload();
      await mainEl
        .getByText(/Changed since export/)
        .first()
        .waitFor({ timeout: 15_000 });
    },
    page,
  );
  await check("pack-ui: no console errors, page errors or failed requests", async () => {
    const all = [...log.console, ...log.pageErrors, ...log.requests];
    if (all.length) return [...new Set(all)].slice(0, 4).join(" | ");
  });
  await context.close();
}
