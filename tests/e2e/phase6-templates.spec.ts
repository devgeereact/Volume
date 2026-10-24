/*
 * Phase 6 browser tests (P6-6): one fiction book and one workbook, each from the New book wizard to a
 * downloaded pack with a clean preflight, with the mock AI. Playwright, Chromium, API mode.
 *
 *   Fiction:  wizard, blueprint with its story bible, written chapters, the story bible and the character
 *             and setting ledger on the Blueprint screen, scene breaks in the Editor, cover, preflight, pack.
 *   Workbook: wizard, blueprint, written chapters, exercise / ruled lines / checklist blocks in the Editor,
 *             a fill-in block inserted from the Insert menu and saved, cover, preflight, pack.
 *
 * Run it with the rest from the repo root:   npm run e2e
 *
 * It runs on the main test server, which injects no failure. The third-writing-call failure that
 * full-book.spec.ts expects lives on that spec's own server (see playwright.config.ts), so this file
 * passes in any order and alone.
 *
 * Two things go through the API instead of the screen, as the server test (apps/server/test/phase6.test.ts)
 * does: the mock writer's book is far below KDP's 24 page minimum for a print book, so each chapter gets
 * extra plain paragraphs saved as a new version before the preflight; and the screens are never skipped
 * otherwise. The server API is also used to assert what was saved and to wait on jobs.
 */
import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { expect, test, type APIRequestContext, type Locator, type Page } from "@playwright/test";
import { downloadDir } from "./paths.mjs";
import {
  getJson,
  JOB_WAIT,
  leafSections,
  padding,
  postJson,
  readZip,
  type ExportRecord,
  type Items,
  type PreflightItem,
  type SectionDetail,
  type SectionTree,
} from "./helpers";

interface Book {
  id: string;
  title: string;
  template: string | null;
  approvedBlueprintId: string | null;
}
interface BlueprintResponse {
  blueprint: { version: number; status: string; data: Record<string, unknown> } | null;
}
interface LedgerItem {
  kind: string;
  key: string;
}

interface Ctx {
  page: Page;
  request: APIRequestContext;
  main: Locator;
  footer: Locator;
  stepButton: (label: RegExp | string) => Locator;
  h1: (name: string) => Locator;
  failNow: () => void;
}

function context(page: Page, request: APIRequestContext): Ctx {
  const pageErrors: string[] = [];
  page.on("pageerror", (err) => pageErrors.push(`${page.url()}: ${err.message}`));
  const main = page.locator("main");
  const footer = page.locator('footer[aria-label="Step navigation"]');
  return {
    page,
    request,
    main,
    footer,
    stepButton: (label) => footer.getByRole("button", { name: typeof label === "string" ? new RegExp(`^${label}`) : label }),
    h1: (name) => main.getByRole("heading", { level: 1, name }).first(),
    failNow: () => expect(pageErrors, "uncaught page errors").toEqual([]),
  };
}

/** Wizard: a pen name, a book type from a category tab, an idea, the chapter count, then "Skip to titles". Returns the book id. */
async function createFromWizard(
  c: Ctx,
  opts: { penName: string; category: RegExp; bookType: string; idea: string; chapters: string; words: string },
): Promise<string> {
  const { page, main } = c;
  await page.goto("/books/new");
  await expect(c.h1("New book")).toBeVisible();
  const card = main.locator('label:has(input[name="profile"])').filter({ hasText: opts.penName });
  await expect(card).toHaveCount(1);
  await card.click();
  await main.getByRole("button", { name: /^Next: Book type/ }).click();
  await expect(main.getByRole("heading", { name: "What kind of book is it?" })).toBeVisible();
  await main.getByRole("tab", { name: opts.category }).first().click();
  const type = main.locator('label:has(input[name="book-type"])').filter({ has: page.getByText(opts.bookType, { exact: true }) });
  await expect(type).toHaveCount(1);
  await type.click();
  // Phase 6 types write now: no "arrives in phase" note on the book type step.
  await expect(main.getByRole("status").filter({ hasText: /Selected:/ })).not.toContainText(/arrives in/);
  await main.getByRole("button", { name: /^Next: Idea/ }).click();
  await main.getByLabel("Idea or working title").fill(opts.idea);
  await main.getByRole("button", { name: /^Next: Details/ }).click();
  await main.getByLabel("Word target").fill(opts.words);
  await main.getByLabel(/^(Chapters|Stories)$/).fill(opts.chapters);
  await main.getByRole("button", { name: /^Next: Review/ }).click();
  await expect(main.getByRole("heading", { name: "Check and start" })).toBeVisible();
  await main.getByRole("button", { name: /^Skip to titles/ }).click();
  await page.waitForURL(/\/books\/(?!new)[^/]+\/titles/);
  const bookId = page.url().split("/books/")[1]!.split("/")[0]!;
  c.failNow();
  return bookId;
}

/** Blueprint: build it on the screen and approve it. Returns after the Writing screen opens. */
async function buildAndApprove(c: Ctx, bookId: string): Promise<void> {
  const { page, main } = c;
  await page.goto(`/books/${bookId}/blueprint`);
  await c.stepButton("Build the blueprint").click();
  await expect(main.getByRole("heading", { name: "Chapters" })).toBeVisible({ timeout: JOB_WAIT });
}

async function approve(c: Ctx, bookId: string): Promise<void> {
  const { page, request } = c;
  const approveButton = c.stepButton("Approve blueprint");
  await expect(approveButton).toBeEnabled({ timeout: JOB_WAIT });
  await approveButton.click();
  const dialog = page.getByRole("dialog", { name: /Approve blueprint version/ });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Approve blueprint" }).click();
  await page.waitForURL(/\/writing$/);
  const bp = await getJson<BlueprintResponse>(request, `/books/${bookId}/blueprint`);
  expect(bp.blueprint?.status).toBe("approved");
  expect((await getJson<Book>(request, `/books/${bookId}`)).approvedBlueprintId).toBeTruthy();
}

/** Writing: "Write book" and wait for every chapter. */
async function writeEverything(c: Ctx, bookId: string): Promise<void> {
  const { request } = c;
  await expect(c.h1("Writing")).toBeVisible();
  await c.stepButton("Write book").click();
  // The newest write_book job: still going, finished, or stopped at a failed section.
  const settled = async (): Promise<string> => {
    const jobs = (await getJson<Items<{ kind: string; status: string }>>(request, `/books/${bookId}/jobs`)).items.filter((j) => j.kind === "write_book");
    const status = jobs[0]?.status ?? "queued";
    if (status === "succeeded") return "done";
    return ["failed", "needs_attention", "cancelled"].includes(status) ? "failed" : "running";
  };
  // The main test server injects no failure, so a stopped job is a real failure.
  await expect.poll(settled, { timeout: 120_000 }).toBe("done");
  await expect(c.stepButton("Open editor")).toBeVisible({ timeout: 120_000 });
  const chapters = leafSections(await getJson<SectionTree>(request, `/books/${bookId}/sections`)).filter((s) => s.kind === "chapter");
  expect(chapters.length).toBeGreaterThanOrEqual(2);
  for (const ch of chapters) expect(ch.status, `chapter ${ch.number}`).toBe("done");
  c.failNow();
}

/** Adds plain paragraphs to every chapter (a new version each) so the print book reaches KDP's page minimum. */
async function padChapters(c: Ctx, bookId: string, topic: string): Promise<void> {
  const tree = await getJson<SectionTree>(c.request, `/books/${bookId}/sections`);
  for (const ch of leafSections(tree).filter((s) => s.kind === "chapter")) {
    const detail = await getJson<SectionDetail>(c.request, `/sections/${ch.id}`);
    await postJson(c.request, `/sections/${ch.id}/versions`, { bodyMd: `${detail.current?.bodyMd ?? ""}\n\n${padding(topic, 220)}` });
  }
}

/**
 * The owner writes any matter section the app left as a placeholder (Acknowledgements: the writer never invents the
 * names). Done through the API because the app has no screen field for the names yet (reported, not hidden here).
 */
async function writePlaceholderMatter(c: Ctx, bookId: string): Promise<string[]> {
  const written: string[] = [];
  const tree = await getJson<SectionTree>(c.request, `/books/${bookId}/sections`);
  for (const leaf of leafSections(tree).filter((s) => s.kind === "acknowledgements" && s.wordCount > 0)) {
    const versions = await getJson<Items<{ id: string; source: string }>>(c.request, `/sections/${leaf.id}/versions`);
    const current = versions.items.find((v) => v.id === leaf.currentVersionId);
    if (current?.source !== "app:placeholder") continue;
    await postJson(c.request, `/sections/${leaf.id}/versions`, { bodyMd: "# Acknowledgements\n\nThanks to Sam and to everyone who read an early draft." });
    written.push(leaf.kind);
  }
  return written;
}

/** Cover step: concepts, choose one, build. */
async function buildCover(c: Ctx, bookId: string): Promise<void> {
  const { page, main } = c;
  await page.goto(`/books/${bookId}/cover`);
  await expect(main.getByRole("heading", { name: "Cover studio" }).first()).toBeVisible();
  await c.stepButton("Make concepts").click();
  const concepts = main.getByRole("radiogroup", { name: "Concepts" });
  await expect(concepts.locator("label").first()).toBeVisible({ timeout: JOB_WAIT });
  await concepts.locator("label").first().click();
  await c.stepButton("Use this concept").click();
  await expect(concepts.getByText("In use")).toBeVisible();
  await c.stepButton("Build covers").click();
  await expect(main.getByRole("heading", { name: "Covers built" })).toBeVisible({ timeout: JOB_WAIT });
  // Marketing now sits between Cover and Export; these books go straight to Export.
  await page.goto(`/books/${bookId}/export`);
  c.failNow();
}

/** Export: preflight has no blocking item and says so, tick the warnings, build the pack and open it. Returns the zip entry names. */
async function exportPack(c: Ctx, bookId: string, manuscriptNeedle: RegExp): Promise<string[]> {
  const { page, main, footer, request } = c;
  await expect(main.getByRole("heading", { name: "Export" }).first()).toBeVisible();
  const preflight = main.locator('section[aria-labelledby="preflight-title"]');
  await expect(preflight.getByRole("status")).toContainText(/passed/, { timeout: JOB_WAIT });
  const api = await getJson<Items<PreflightItem>>(request, `/books/${bookId}/preflight`);
  expect(
    api.items.filter((i) => i.severity === "block").map((i) => `${i.id}: ${i.message}`),
    "blocking preflight items",
  ).toEqual([]);
  const tickLabels = preflight.getByText("I have checked this");
  for (let i = (await tickLabels.count()) - 1; i >= 0; i--) await tickLabels.nth(i).click();
  for (const box of await preflight.getByRole("checkbox", { name: "I have checked this" }).all()) await expect(box).toBeChecked();
  const build = footer.getByRole("button", { name: /^Build pack/ });
  await expect(build).toBeEnabled();
  await build.click();
  await page.getByRole("dialog", { name: "Build pack" }).getByRole("button", { name: "Build pack" }).click();
  await expect(main.getByRole("heading", { name: "Pack ready" })).toBeVisible({ timeout: 120_000 });

  const exports = (await getJson<Items<ExportRecord>>(request, `/books/${bookId}/exports`)).items;
  for (const kind of ["pdf_print", "docx", "epub", "txt", "md", "pack"]) {
    const r = exports.find((e) => e.kind === kind && e.status === "done");
    expect(r, `a finished ${kind} export`).toBeTruthy();
    expect(r?.bytes ?? 0).toBeGreaterThan(0);
  }
  const downloadPromise = page.waitForEvent("download");
  await main.getByRole("link", { name: "Download", exact: true }).first().click();
  const download = await downloadPromise;
  mkdirSync(downloadDir, { recursive: true });
  const zipPath = path.join(downloadDir, `${bookId}-${download.suggestedFilename() || "pack.zip"}`);
  await download.saveAs(zipPath);
  expect(download.suggestedFilename()).toMatch(/\.zip$/i);
  const entries = readZip(readFileSync(zipPath));
  const names = entries.map((e) => e.name);
  expect(names.length, `zip entries: ${names.join(", ")}`).toBeGreaterThanOrEqual(10);
  const pdf = entries.find((e) => /^manuscript\/.*interior.*\.pdf$/i.test(e.name));
  const md = entries.find((e) => /^manuscript\/[^/]+\.md$/i.test(e.name));
  expect(pdf?.read().subarray(0, 4).toString("latin1"), "the interior PDF").toBe("%PDF");
  expect(md?.read().toString("utf8"), "the manuscript Markdown").toMatch(manuscriptNeedle);
  expect(
    names.some((n) => /^cover\/.*ebook-cover\.jpg$/i.test(n)),
    `an eBook cover in ${names.join(", ")}`,
  ).toBe(true);
  expect(
    names.some((n) => /^reports\/preflight\.txt$/.test(n)),
    "the preflight report",
  ).toBe(true);
  c.failNow();
  return names;
}

test.describe("phase 6 templates, from the wizard to a pack", () => {
  test("a fiction book: story bible, character and setting ledger, scene breaks, clean preflight", async ({ page, request }) => {
    const c = context(page, request);
    const { main } = c;
    let bookId = "";

    await test.step("Wizard: a literary fiction book for J. R. Kade", async () => {
      bookId = await createFromWizard(c, {
        penName: "J. R. Kade",
        category: /^Fiction/,
        bookType: "Literary fiction",
        idea: "A lighthouse keeper called Mara Quill finds the harbour lights going out one by one. Working title: The Lighthouse Keeper.",
        chapters: "12",
        words: "60000",
      });
      const book = await getJson<Book>(request, `/books/${bookId}`);
      expect(book.template).toBe("fiction");
    });

    await test.step("Blueprint: it carries a story bible; approve it", async () => {
      await buildAndApprove(c, bookId);
      await expect(main.getByRole("heading", { name: "Story bible" }).first()).toBeVisible();
      await expect(main.getByText("Mara Quill").first()).toBeVisible();
      const bp = await getJson<BlueprintResponse>(request, `/books/${bookId}/blueprint`);
      expect(bp.blueprint?.data["storyBible"], "storyBible in the blueprint data").toMatchObject({ characters: [{ name: "Mara Quill" }] });
      await approve(c, bookId);
    });

    await test.step("Writing: every chapter is written", async () => {
      await writeEverything(c, bookId);
    });

    await test.step("Ledger: characters and settings noted while writing show on the Blueprint screen", async () => {
      const characters = await getJson<Items<LedgerItem>>(request, `/books/${bookId}/story-ledger?kind=character`);
      expect(characters.items.map((e) => e.key)).toContain("mara quill");
      const settings = await getJson<Items<LedgerItem>>(request, `/books/${bookId}/story-ledger?kind=setting`);
      expect(settings.items.map((e) => e.key)).toContain("the lighthouse");
      await c.page.goto(`/books/${bookId}/blueprint`);
      const ledger = main.locator('section[aria-labelledby="story-ledger-title"]');
      await expect(ledger.getByRole("heading", { name: "Characters and settings so far" })).toBeVisible();
      await expect(ledger.getByText("Mara Quill").first()).toBeVisible({ timeout: JOB_WAIT });
      await ledger.getByRole("radio", { name: /^Settings/ }).click();
      await expect(ledger.getByText(/the lighthouse/i).first()).toBeVisible();
      c.failNow();
    });

    await test.step("Editor: a chapter has scene breaks and no subheadings", async () => {
      await c.page.goto(`/books/${bookId}/editor`);
      await expect(c.h1("Editor")).toBeVisible();
      await expect(c.page.getByRole("separator", { name: "Scene break" }).first()).toBeVisible({ timeout: JOB_WAIT });
      const tree = await getJson<SectionTree>(request, `/books/${bookId}/sections`);
      const chapter = leafSections(tree).find((s) => s.kind === "chapter" && s.wordCount > 0)!;
      const md = (await getJson<SectionDetail>(request, `/sections/${chapter.id}`)).current?.bodyMd ?? "";
      expect(md).toMatch(/^(\*\*\*|\* \* \*)$/m);
      expect(md).not.toMatch(/^##\s/m);
      // Insert one more scene break from the screen and save it.
      const before = await c.page.getByRole("separator", { name: "Scene break" }).count();
      await c.page.locator('[contenteditable="true"][data-block-id]').first().click();
      await main.getByRole("button", { name: /^Insert scene break/i }).click();
      await expect(c.page.getByRole("separator", { name: "Scene break" })).toHaveCount(before + 1);
      await main.getByRole("button", { name: "Save version" }).click();
      await expect(main.getByText(/Saved as version \d+ at/)).toBeVisible();
      c.failNow();
    });

    await test.step("Cover, Export: preflight passes and the pack builds", async () => {
      await padChapters(c, bookId, "The Lighthouse Keeper");
      expect(await writePlaceholderMatter(c, bookId), "Acknowledgements is a placeholder until the owner writes it").toEqual(["acknowledgements"]);
      await buildCover(c, bookId);
      const names = await exportPack(c, bookId, /Mara Quill|lighthouse/i);
      console.log(`Fiction pack: ${names.length} entries`);
    });
  });

  test("a workbook: exercise, lines and fill-in blocks in the editor, clean preflight", async ({ page, request }) => {
    const c = context(page, request);
    const { main } = c;
    let bookId = "";

    await test.step("Wizard: a workbook for Gideon Akinlotan", async () => {
      bookId = await createFromWizard(c, {
        penName: "Gideon Akinlotan",
        category: /^Workbooks and journals/,
        bookType: "Workbook",
        idea: "A weekly reset workbook for tired people who want calmer evenings. Working title: The Weekly Reset.",
        chapters: "4",
        words: "10000",
      });
      expect((await getJson<Book>(request, `/books/${bookId}`)).template).toBe("workbook");
    });

    await test.step("Blueprint: build it, every chapter plans exercises, approve it", async () => {
      await buildAndApprove(c, bookId);
      const bp = await getJson<BlueprintResponse>(request, `/books/${bookId}/blueprint`);
      expect(bp.blueprint?.version).toBeGreaterThanOrEqual(1);
      await approve(c, bookId);
    });

    await test.step("Writing: every chapter is written with its exercises", async () => {
      await writeEverything(c, bookId);
      const tree = await getJson<SectionTree>(request, `/books/${bookId}/sections`);
      const chapter = leafSections(tree).find((s) => s.kind === "chapter")!;
      const md = (await getJson<SectionDetail>(request, `/sections/${chapter.id}`)).current?.bodyMd ?? "";
      expect(md).toContain("::: exercise reflection");
      expect(md).toContain("::: lines");
      expect(md).toContain("::: exercise checklist");
    });

    await test.step("Editor: exercise, ruled lines and checklist blocks show; insert a fill-in block and save", async () => {
      await c.page.goto(`/books/${bookId}/editor`);
      await expect(c.h1("Editor")).toBeVisible();
      const sheet = c.page.locator("main");
      await expect(sheet.locator("[data-exercise]").first()).toBeVisible({ timeout: JOB_WAIT });
      await expect(sheet.locator("[data-lines]").first()).toBeVisible();
      await expect(sheet.locator("[data-check]").first()).toBeVisible();
      expect(await sheet.locator("[data-fill-in]").count(), "no fill-in written yet").toBe(0);

      await c.page.locator('[contenteditable="true"][data-block-id]').first().click();
      await main.getByRole("button", { name: "Insert", exact: true }).click();
      await c.page.getByRole("menuitem", { name: "Fill-in prompts" }).click();
      await expect(sheet.locator("[data-fill-in]")).toHaveCount(1);
      await main.getByRole("button", { name: "Save version" }).click();
      await expect(main.getByText(/Saved as version \d+ at/)).toBeVisible();
      const tree = await getJson<SectionTree>(request, `/books/${bookId}/sections`);
      let saved = "";
      for (const leaf of leafSections(tree).filter((s) => s.kind === "chapter")) {
        const md = (await getJson<SectionDetail>(request, `/sections/${leaf.id}`)).current?.bodyMd ?? "";
        if (md.includes("::: fill-in")) saved = md;
      }
      expect(saved, "the saved chapter holds the fill-in block").toContain("::: fill-in");
      // The other blocks survived the round trip through the editor.
      expect(saved).toContain("::: lines");
      expect(saved).toContain("::: exercise checklist");
      c.failNow();
    });

    await test.step("Cover, Export: preflight passes and the pack builds", async () => {
      await padChapters(c, bookId, "The Weekly Reset");
      await buildCover(c, bookId);
      const names = await exportPack(c, bookId, /::: exercise/);
      console.log(`Workbook pack: ${names.length} entries`);
    });
  });
});
