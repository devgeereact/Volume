/*
 * Phase 7 browser test (P7-7): one picture book from the New book wizard to a downloaded print PDF, with the
 * mock AI and the real exporter. Playwright, Chromium, API mode.
 *
 *   Wizard:    a picture book with a reader age, one new word and a gentle problem.
 *   Story run: "Write the story" shows live progress (a progress bar and the three steps) until the spreads
 *              board and the character sheet appear.
 *   Board:     edit one spread's text and see it saved; paint one spread again, which asks for confirmation
 *              with the picture's cost first, then replaces only that picture and raises the book's spend.
 *   Export:    a cover is built, the print PDF is built, preflight has nothing blocked, the interior PDF is
 *              downloaded and its page count (24) and page size (trim plus bleed from config/kdp-rules,
 *              rule print.bleed) are read from the file itself.
 *
 * Run it with the rest from the repo root:   npm run e2e
 *
 * It runs on its own server pair (slow mock AI, own database; see playwright.config.ts), so it passes in any order
 * and alone, and shares no jobs, profiles or settings with another spec. The profile
 * is made through the API (setup, not the thing under test); everything else goes through the screens. The
 * API is read only to assert what was saved and to wait on jobs.
 */
import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test, type APIRequestContext, type Locator } from "@playwright/test";
import { downloadDir } from "./paths.mjs";
import {
  getJson as getFrom,
  JOB_WAIT,
  pdfPages,
  PICTURE_API,
  PICTURE_ORIGIN,
  postJson as postTo,
  type ExportRecord,
  type Items,
  type PreflightItem,
} from "./helpers";

/* This spec runs on the picture-book server pair (playwright.config.ts), so these two read and write there. */
const getJson = <T>(request: APIRequestContext, route: string): Promise<T> => getFrom<T>(request, route, PICTURE_API);
const postJson = <T>(request: APIRequestContext, route: string, data: unknown): Promise<T> =>
  postTo<T>(request, route, data, [200, 201, 202], { api: PICTURE_API, origin: PICTURE_ORIGIN });

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

interface Book {
  id: string;
  title: string;
  bookTypeId: string | null;
  template: string | null;
  settings: { genre?: { ageRange?: string; newWord?: string | null; problem?: string | null } };
  costToDateUsd: number | null;
  aiDisclosure: { text: string; images: string };
}
interface Spread {
  sectionId: string;
  n: number;
  text: string;
  imageUrl: string | null;
  imagePrompt: string | null;
}
interface SpreadsView {
  pageCount: number;
  pageSizeIn: { widthIn: number; heightIn: number };
  newWord: string | null;
  safety: { passed: boolean } | null;
  spreads: Spread[];
}
interface PictureExport extends ExportRecord {
  pageCount: number | null;
  preflight: { items: PreflightItem[] } | null;
}

/** The trim and the bleed from config/kdp-rules, so no size is typed in this file. */
function expectedPageSizeIn(): { widthIn: number; heightIn: number } {
  const rules = JSON.parse(readFileSync(path.join(ROOT, "config/kdp-rules/2026-10-17.json"), "utf8")) as {
    rules: { id: string; values: Record<string, unknown> }[];
  };
  const bleed = rules.rules.find((r) => r.id === "print.bleed")?.values;
  expect(bleed, "rule print.bleed in config/kdp-rules").toBeTruthy();
  // Picture books print on the 8.5 x 8.5 in trim (config/book-types.json, defaultTrim).
  return { widthIn: 8.5 + Number(bleed?.["addWidthIn"]), heightIn: 8.5 + Number(bleed?.["addHeightIn"]) };
}

test("a picture book goes from the wizard to a downloaded 24 page print PDF", async ({ page, request }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (err) => pageErrors.push(`${page.url()}: ${err.message}`));
  const failNow = () => expect(pageErrors, "uncaught page errors").toEqual([]);

  const main: Locator = page.locator("main");
  const footer: Locator = page.locator('footer[aria-label="Step navigation"]');
  const stepButton = (label: RegExp | string): Locator => footer.getByRole("button", { name: typeof label === "string" ? new RegExp(`^${label}`) : label });
  const h1 = (name: string): Locator => main.getByRole("heading", { level: 1, name }).first();
  const stamp = String(Date.now()).slice(-6);
  const penName = `Nell Ashby ${stamp}`;
  const NEW_WORD = "patient";
  const PROBLEM = "the kite will not fly";
  let bookId = "";
  let spendBefore = 0;

  const spreadsView = (): Promise<SpreadsView> => getJson<SpreadsView>(request, `/books/${bookId}/spreads`);

  await test.step("Setup: a pen name for the picture book author", async () => {
    await postJson(request, "/profiles", {
      penName,
      bioThirdPerson: "Nell Ashby writes gentle bedtime stories about small animals and big feelings. She lives by the sea with a sleepy cat.",
    });
  });

  await test.step("Wizard: a picture book with an age range, a new word and a gentle problem", async () => {
    await page.goto("/books/new");
    await expect(h1("New book")).toBeVisible();
    const card = main.locator('label:has(input[name="profile"])').filter({ hasText: penName });
    await expect(card).toHaveCount(1);
    await card.click();
    await main.getByRole("button", { name: /^Next: Book type/ }).click();
    await expect(main.getByRole("heading", { name: "What kind of book is it?" })).toBeVisible();
    await main.getByRole("tab", { name: /^Children/ }).click();
    await main
      .locator('label:has(input[name="book-type"])')
      .filter({ has: page.getByText("Picture book", { exact: true }) })
      .click();
    await expect(main.getByRole("status").filter({ hasText: /^Selected: Picture book/ })).toBeVisible();
    await main.getByRole("button", { name: /^Next: Idea/ }).click();
    await main
      .getByLabel("Idea or working title")
      .fill("A small rabbit called Pip learns to be patient while her paper kite waits for the wind. Working title: Pip and the Patient Kite.");
    await main.getByRole("button", { name: /^Next: Details/ }).click();
    await expect(main.getByRole("heading", { name: /^Shape the picture book/i })).toBeVisible();

    await main.getByLabel("Reader age", { exact: true }).click();
    await page.getByRole("option", { name: "Ages 2 to 5" }).click();
    // Picture books teach a new word by default; the switch is already on.
    await expect(main.getByRole("switch", { name: /Teach one new word/ })).toBeChecked();
    await main.getByLabel("New word (optional)").fill(NEW_WORD);
    await main.getByLabel("Gentle problem (optional)").fill(PROBLEM);

    await main.getByRole("button", { name: /^Next: Review/ }).click();
    await expect(main.getByRole("heading", { name: "Check and start" })).toBeVisible();
    await expect(main.getByText("Reader age").first()).toBeVisible();
    await expect(main.getByText("2 to 5").first()).toBeVisible();
    await expect(main.getByText(NEW_WORD).first()).toBeVisible();
    await expect(main.getByText(PROBLEM).first()).toBeVisible();
    await main.getByRole("button", { name: /^Create picture book/ }).click();
    await page.waitForURL(/\/books\/(?!new)[^/]+\/writing$/);
    bookId = page.url().split("/books/")[1]!.split("/")[0]!;

    const book = await getJson<Book>(request, `/books/${bookId}`);
    expect(book.bookTypeId).toBe("picture-book");
    expect(book.template).toBe("picture-book");
    expect(book.settings.genre).toMatchObject({ ageRange: "2 to 5", newWord: NEW_WORD, problem: PROBLEM });
    failNow();
  });

  await test.step("Story run: live progress, then the spreads board and the character sheet", async () => {
    await expect(h1("Story and spreads")).toBeVisible();
    await expect(main.getByLabel("Story idea")).toHaveValue(/Pip/);
    await expect(main.getByLabel("Reader age", { exact: true })).toContainText("Ages 2 to 5");
    await expect(main.getByLabel("New word (optional)")).toHaveValue(NEW_WORD);
    await expect(main.getByLabel("Gentle problem (optional)")).toHaveValue(PROBLEM);
    // Ten spreads print as the shortest premium colour book on the trim: 24 pages.
    await main.locator("#story-spreads").fill("10");
    // Watch the run panel from inside the page, so a fast run cannot slip between two polls: every progress value and
    // every step line the bar shows is recorded as it changes.
    await page.evaluate(() => {
      const seen = { values: [] as number[], lines: [] as string[], steps: 0, states: [] as string[], heading: "", barLabel: "" };
      (window as unknown as { __runSeen: typeof seen }).__runSeen = seen;
      const read = () => {
        const panel = document.querySelector('section[aria-labelledby="run-title"]');
        if (!panel) return;
        seen.heading ||= panel.querySelector("h2#run-title")?.textContent?.trim() ?? "";
        const bar = panel.querySelector('[role="progressbar"]');
        seen.barLabel ||= bar?.getAttribute("aria-label") ?? "";
        const v = Number(bar?.getAttribute("aria-valuenow"));
        if (bar && Number.isFinite(v) && seen.values[seen.values.length - 1] !== v) seen.values.push(v);
        const line = panel.querySelector("p.text-body span")?.textContent?.trim();
        if (line && seen.lines[seen.lines.length - 1] !== line) seen.lines.push(line);
        const items = [...panel.querySelectorAll("ol > li")];
        seen.steps = Math.max(seen.steps, items.length);
        const states = items.map((li) => li.querySelector("span.num")?.textContent?.trim() ?? "").join(" / ");
        if (states && seen.states[seen.states.length - 1] !== states) seen.states.push(states);
      };
      new MutationObserver(read).observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true });
      read();
    });
    await stepButton("Write the story").click();

    // Live progress: the run panel, its bar and the three steps show while the server works. On the main e2e server the
    // whole run takes about 80 ms, so the panel is on screen for well under a tenth of a second: a slow runner (GitHub
    // macOS) finishes the run before the browser draws it. This server adds a delay to every mock AI call so the run lasts
    // a couple of seconds. The check reads what the in-page watcher recorded, which sees every change as it happens.
    const run = main.locator('section[aria-labelledby="run-title"]');
    await expect
      .poll(() => page.evaluate(() => (window as unknown as { __runSeen: { heading: string } }).__runSeen.heading), {
        timeout: JOB_WAIT,
        message: "the run panel showed at least once",
      })
      .toBe("Making the picture book");
    const shown = await page.evaluate(() => (window as unknown as { __runSeen: { barLabel: string } }).__runSeen);
    expect(shown.barLabel, "the progress bar is named").toBe("Picture book progress");

    // The run ends: the board has ten spreads, each with a picture, and the character sheet is filled in.
    await expect(run).toBeHidden({ timeout: 150_000 });
    const seen = await page.evaluate(
      () => (window as unknown as { __runSeen: { values: number[]; lines: string[]; steps: number; states: string[] } }).__runSeen,
    );
    console.log(`Picture run progress seen: ${seen.values.join(", ")}%; line: ${seen.lines.join(" | ")}; steps: ${seen.states.join(" -> ")}`);
    expect(seen.steps, "the three steps (story, references, pictures)").toBe(3);
    expect(seen.values.length, "the bar moved while the run went").toBeGreaterThan(1);
    expect(Math.max(...seen.values), "the bar showed real progress").toBeGreaterThan(0);
    const board = main.locator('section[aria-labelledby="board-title"]');
    await expect(board.getByRole("heading", { name: "Spreads" })).toBeVisible();
    await expect(board.getByRole("article")).toHaveCount(10);
    await expect(board.getByRole("img", { name: /^Picture for spread/ })).toHaveCount(10, { timeout: JOB_WAIT });

    const view = await spreadsView();
    expect(view.pageCount).toBe(24);
    expect(view.spreads).toHaveLength(10);
    expect(view.safety?.passed).toBe(true);
    for (const s of view.spreads) {
      expect(s.imageUrl, `spread ${s.n} has a picture`).toBeTruthy();
      expect(s.text.trim(), `spread ${s.n} has text`).not.toBe("");
    }
    const jobs = await getJson<Items<{ kind: string; status: string }>>(request, `/books/${bookId}/jobs`);
    expect(jobs.items.find((j) => j.kind === "picture_book")?.status).toBe("succeeded");

    const sheet = page.getByRole("complementary", { name: "Picture book details" });
    await expect(sheet.getByRole("heading", { name: "Character sheet" })).toBeVisible();
    const characters = await getJson<{ characters: { name: string; sheet: string; main: boolean; referenceUrl: string | null }[] }>(
      request,
      `/books/${bookId}/characters`,
    );
    expect(characters.characters.length).toBeGreaterThan(0);
    const first = characters.characters[0]!;
    await expect(sheet.getByText(first.name).first()).toBeVisible();
    await expect(sheet.getByText(first.sheet, { exact: false }).first()).toBeVisible();
    const mains = characters.characters.filter((c) => c.main);
    expect(mains.length, "a main character").toBeGreaterThan(0);
    await expect(sheet.getByRole("img", { name: /^Reference picture of / })).toHaveCount(mains.length);
    // The story names its word. The mock AI always answers "Brave" whatever word was asked for, so only that a word is
    // shown (and explained on its own page) is asserted here; the word the owner asked for is checked in the settings above.
    expect(view.newWord, "the story's new word").toBeTruthy();
    await expect(main.getByText(`new word: ${view.newWord}`, { exact: false }).first()).toBeVisible();
    failNow();
  });

  await test.step("Board: edit one spread's text", async () => {
    const before = await spreadsView();
    const target = before.spreads[2]!;
    const card = main.getByRole("article").filter({ has: page.getByRole("heading", { name: `Spread ${target.n}`, exact: true }) });
    await card.getByRole("button", { name: "Edit text" }).click();
    const box = card.getByLabel(`Text for spread ${target.n}`);
    const edited = `${target.text.trim()} Pip waited, and waited, and was patient.`;
    await box.fill(edited);
    await card.getByRole("button", { name: "Save text" }).click();
    await expect(card.getByRole("status")).toHaveText("Text saved");
    // The text shows under the picture (and, hidden from screen readers, inside it where it prints).
    await expect(card.locator("p.text-prose-sm")).toHaveText(edited);
    const after = await spreadsView();
    expect(after.spreads[2]!.text.trim()).toBe(edited);
    // Only that spread changed.
    expect(after.spreads.filter((s, i) => i !== 2).map((s) => s.text)).toEqual(before.spreads.filter((s, i) => i !== 2).map((s) => s.text));
    failNow();
  });

  await test.step("Board: paint one spread again, with the cost confirmed first", async () => {
    const before = await spreadsView();
    spendBefore = (await getJson<Book>(request, `/books/${bookId}`)).costToDateUsd ?? 0;
    const target = before.spreads[4]!;
    const card = main.getByRole("article").filter({ has: page.getByRole("heading", { name: `Spread ${target.n}`, exact: true }) });
    // The button already shows what one picture costs; clicking it asks first and makes nothing yet.
    const paintAgain = card.getByRole("button", { name: /^Paint again/ });
    await expect(paintAgain).toContainText(/\$/);
    await paintAgain.click();
    const dialog = page.getByRole("dialog", { name: `Paint spread ${target.n} again` });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText("This picture")).toBeVisible();
    await expect(dialog.getByText(/\$\d/).first()).toBeVisible();
    await expect(dialog.getByText("Spent on this book")).toBeVisible();
    const midway = await spreadsView();
    expect(midway.spreads[4]!.imageUrl, "nothing is painted before the owner confirms").toBe(before.spreads[4]!.imageUrl);
    await dialog.getByRole("button", { name: new RegExp(`^Paint spread ${target.n}`) }).click();
    await expect(dialog).toBeHidden({ timeout: JOB_WAIT });

    await expect
      .poll(async () => (await spreadsView()).spreads[4]!.imageUrl, { timeout: JOB_WAIT, message: "the repainted spread gets a new picture" })
      .not.toBe(before.spreads[4]!.imageUrl);
    const after = await spreadsView();
    // Every other spread keeps its picture.
    expect(after.spreads.filter((_, i) => i !== 4).map((s) => s.imageUrl)).toEqual(before.spreads.filter((_, i) => i !== 4).map((s) => s.imageUrl));
    await expect.poll(async () => (await getJson<Book>(request, `/books/${bookId}`)).costToDateUsd ?? 0, { timeout: JOB_WAIT }).toBeGreaterThan(spendBefore);
    await expect(card.getByRole("img", { name: /^Picture for spread/ })).toBeVisible();
    failNow();
  });

  await test.step("Cover: a concept is chosen and the covers are built", async () => {
    await page.goto(`/books/${bookId}/cover`);
    await expect(main.getByRole("heading", { name: "Cover studio" }).first()).toBeVisible();
    await stepButton("Make concepts").click();
    const concepts = main.getByRole("radiogroup", { name: "Concepts" });
    await expect(concepts.locator("label").first()).toBeVisible({ timeout: JOB_WAIT });
    await concepts.locator("label").first().click();
    await stepButton("Use this concept").click();
    await expect(concepts.getByText("In use")).toBeVisible();
    await stepButton("Build covers").click();
    await expect(main.getByRole("heading", { name: "Covers built" })).toBeVisible({ timeout: JOB_WAIT });
    failNow();
  });

  let pdfBuffer: Buffer | undefined;
  await test.step("Export: build the print PDF, preflight passes, download the interior PDF", async () => {
    await page.goto(`/books/${bookId}/export`);
    await expect(h1("Export")).toBeVisible();
    const facts = main.locator('section[aria-labelledby="print-title"]');
    await expect(facts.getByText("8.5 x 8.5 in")).toBeVisible();
    await expect(facts.getByText("24 (10 spreads, 4 other pages)")).toBeVisible();
    await stepButton("Build print PDF").click();

    const preflight = main.locator('section[aria-labelledby="pf-title"]');
    await expect(preflight.getByText(/\d+ passed, \d+ to check, 0 blocked/)).toBeVisible({ timeout: 150_000 });

    const exports = (await getJson<Items<PictureExport>>(request, `/books/${bookId}/exports`)).items;
    const pdf = exports.find((e) => e.kind === "pdf_print" && e.status === "done");
    expect(pdf, "a finished print PDF export").toBeTruthy();
    expect(
      exports.find((e) => e.kind === "pack" && e.status === "done"),
      "a finished KDP pack",
    ).toBeTruthy();
    const items = pdf?.preflight?.items ?? [];
    expect(
      items.filter((i) => i.severity === "block").map((i) => `${i.id}: ${i.message}`),
      "blocking preflight items",
    ).toEqual([]);
    const byId = Object.fromEntries(items.map((i) => [i.id, i]));
    for (const id of ["interior.bleed", "picture.spread-images", "picture.safe-area", "kdp.ai-disclosure"])
      expect(byId[id]?.severity, `${id}: ${byId[id]?.message ?? "missing"}`).toBe("pass");
    await expect(preflight.getByText("Blocked", { exact: true })).toHaveCount(0);

    // KDP disclosure covers the pictures.
    const book = await getJson<Book>(request, `/books/${bookId}`);
    expect(book.aiDisclosure.images).toBe("ai_generated");
    await expect(page.getByRole("complementary", { name: "Export details" }).getByText("AI-generated").first()).toBeVisible();

    // Download the interior PDF through its Download link.
    const row = main.locator("li").filter({ hasText: "Print interior PDF" });
    await expect(row).toBeVisible();
    const [download] = await Promise.all([page.waitForEvent("download"), row.getByRole("link", { name: "Download" }).click()]);
    mkdirSync(downloadDir, { recursive: true });
    const saved = path.join(downloadDir, `picture-book-${stamp}-${download.suggestedFilename()}`);
    await download.saveAs(saved);
    pdfBuffer = readFileSync(saved);
    expect(pdfBuffer.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    failNow();
  });

  await test.step("PDF: 24 pages, each exactly trim plus bleed", async () => {
    expect(pdfBuffer, "the downloaded interior PDF").toBeTruthy();
    const info = await pdfPages(pdfBuffer!);
    expect(info.count).toBe(24);
    const want = expectedPageSizeIn();
    // The size the app shows and the rules agree.
    const view = await spreadsView();
    expect(view.pageSizeIn.widthIn).toBeCloseTo(want.widthIn, 3);
    expect(view.pageSizeIn.heightIn).toBeCloseTo(want.heightIn, 3);
    // And so does the file itself: every page, one size.
    expect(info.sizesPt).toHaveLength(24);
    for (const s of info.sizesPt) {
      expect(s.widthPt / 72).toBeCloseTo(want.widthIn, 1);
      expect(s.heightPt / 72).toBeCloseTo(want.heightIn, 1);
    }
    expect(new Set(info.sizesPt.map((s) => `${s.widthPt.toFixed(1)}x${s.heightPt.toFixed(1)}`)).size, "one page size").toBe(1);
  });
});
