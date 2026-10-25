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
 * The offline checks block /api in the browser; no process is stopped.
 */
/* global window, document, getComputedStyle, location, innerHeight */
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
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

async function phaseOffline() {
  const { context, page } = await open(browser, "desktop");
  await page.goto("/library");
  await page.locator("main h1").first().waitFor();
  await settle(page);
  await context.route("**/api/**", (r) => r.abort());
  await check(
    "offline: a screen that cannot load says so in plain words with a Retry",
    async () => {
      await page.getByRole("link", { name: "Published" }).first().click();
      await page
        .getByText(/Could not load/)
        .first()
        .waitFor({ timeout: 15_000 });
      await page.getByRole("button", { name: "Retry" }).waitFor();
      const t = await page.locator("main").innerText();
      if (!/Check your connection/.test(t)) return "no hint about the connection";
    },
    page,
  );
  await check(
    "offline: after the next health check a visible notice says the server is unreachable (up to 40s)",
    async () => {
      await page.waitForFunction(() => /Demo|Not connected/.test(document.body.innerText), null, { timeout: 40_000 });
    },
    page,
  );
  await check(
    "offline: the notice says the data on screen is sample data",
    async () => {
      const t = await page.locator("body").innerText();
      if (/Demo/.test(t) && !/sample data/i.test(t)) return "Demo badge without the sample-data wording";
    },
    page,
  );
  await context.unroute("**/api/**");
  await context.close();
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
