/*
 * Production hub browser tests (D-048, D-049): the stage follows the work, marketing opens when writing is
 * complete, the pack carries the back-cover blurb and short bio, Mark as published and Archive confirm in
 * labelled dialogs. Playwright, Chromium, API mode, mock AI, main test server (no injected failure).
 *
 *   Nonfiction:   title chosen -> stage blueprint; marketing locked (screen line and 409 writing_incomplete);
 *                 the mock writes every chapter -> stage editor or later, marketing opens, 5 TikTok scripts and
 *                 5 Instagram captions; pack with listing/back-cover-blurb.txt and listing/short-bio.txt;
 *                 Mark as published dialog (default date, keyboard, past date) and the Published shelf.
 *   Archive:      a Library card opens a labelled confirm dialog (not window.confirm), Undo restores, and the
 *                 book shows in the Archive.
 *   Picture book: marketing is locked until the story is saved, then opens with 5 and 5.
 *
 * Setup and long jobs go through the API (as the other specs do); the screens under test are driven in the browser.
 * Screenshots (1440x900 and 390x844) go to ../reports/volume/screenshots/production-hub/, outside the repo.
 * Run it with the rest from the repo root:   npm run e2e
 */
import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { downloadDir } from "./paths.mjs";
import {
  API,
  getJson,
  JOB_WAIT,
  leafSections,
  ORIGIN,
  padding,
  postJson,
  readZip,
  type ExportRecord,
  type Items,
  type SectionDetail,
  type SectionTree,
} from "./helpers";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SHOTS = path.resolve(ROOT, "../reports/volume/screenshots/production-hub");
const STAGES = ["idea", "research", "titles", "blueprint", "writing", "editor", "cover", "export", "marketing"];

interface Book {
  id: string;
  title: string | null;
  stage: string;
  status: string;
  template: string | null;
  writingComplete?: boolean;
  publishedAt: number | null;
  approvedBlueprintId: string | null;
}
interface Job {
  kind: string;
  status: string;
  error?: unknown;
}
interface TitleSet {
  id: string;
  options: { title: string; subtitle?: string }[];
}
interface MarketingItem {
  kind: string;
  status: string;
  body: string;
}
interface Profile {
  id: string;
  penName: string;
}

const stageAtLeast = (stage: string, min: string): boolean => STAGES.indexOf(stage) >= STAGES.indexOf(min);
const book = (request: APIRequestContext, id: string): Promise<Book> => getJson<Book>(request, `/books/${id}`);

/** Local calendar date, the way the dialog's date field reads it. */
function isoDay(offsetDays: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Waits for the nth finished job of a kind. A failed job of that kind fails the wait with its status. */
async function waitForJob(request: APIRequestContext, bookId: string, kind: string, nth = 1, timeout = 150_000): Promise<void> {
  await expect
    .poll(
      async () => {
        const jobs = (await getJson<Items<Job>>(request, `/books/${bookId}/jobs`)).items.filter((j) => j.kind === kind);
        const bad = jobs.find((j) => ["failed", "needs_attention", "cancelled"].includes(j.status));
        if (bad) return `${kind} ${bad.status}: ${JSON.stringify(bad.error ?? "")}`;
        return jobs.filter((j) => j.status === "succeeded").length >= nth ? "done" : "running";
      },
      { timeout, message: `waiting for ${kind} job ${nth}` },
    )
    .toBe("done");
}

async function newProfile(request: APIRequestContext, stamp: string, shortBio: string | null): Promise<Profile> {
  return postJson<Profile>(request, "/profiles", {
    penName: `Hub Author ${stamp}`,
    bioThirdPerson: "Hub Author writes plain, practical books for people who are short of time.",
    ...(shortBio ? { shortBio } : {}),
  });
}

/** Saves a screenshot of the open screen at 1440x900 and at 390x844, then puts the viewport back. */
async function shoot(page: Page, name: string): Promise<void> {
  mkdirSync(SHOTS, { recursive: true });
  for (const [label, width, height] of [
    ["1440x900", 1440, 900],
    ["390x844", 390, 844],
  ] as const) {
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(250);
    await page.screenshot({ path: path.join(SHOTS, `${name}-${label}.png`), fullPage: false });
  }
  await page.setViewportSize({ width: 1440, height: 900 });
}

/** Console errors and uncaught page errors for the whole test. */
function watchConsole(page: Page): () => string[] {
  const seen: string[] = [];
  page.on("pageerror", (err) => seen.push(`pageerror ${page.url()}: ${err.message}`));
  page.on("console", (msg) => {
    if (msg.type() === "error") seen.push(`console.error ${page.url()}: ${msg.text()}`);
  });
  return () => seen;
}

test.describe("production hub (D-048, D-049)", () => {
  test("a nonfiction book: stage follows the work, marketing opens when writing is done, pack and publish", async ({ page, request }) => {
    const errors = watchConsole(page);
    const stamp = String(Date.now()).slice(-6);
    const SHORT_BIO = `Hub Author ${stamp} writes short, practical books about calmer working days.`;
    const main = page.locator("main");
    const stepAction = page.getByRole("group", { name: "Step action" });
    let bookId = "";
    let title = "";
    const profile = await newProfile(request, stamp, SHORT_BIO);

    await test.step("Choosing a title moves the book to the blueprint stage", async () => {
      const created = await postJson<Book>(request, "/books", {
        profileId: profile.id,
        bookTypeId: "self-help",
        template: "nonfiction",
        idea: "A short guide to calmer working days for people who always feel behind. Working title: The Calm Day.",
        wordTarget: 8000,
      });
      bookId = created.id;
      expect(created.template).toBe("nonfiction");
      expect(STAGES.indexOf((await book(request, bookId)).stage)).toBeLessThan(STAGES.indexOf("blueprint"));
      await postJson(request, `/books/${bookId}/title-sets`, {});
      await waitForJob(request, bookId, "titles");
      const sets = (await getJson<Items<TitleSet>>(request, `/books/${bookId}/title-sets`)).items;
      expect(sets.length).toBeGreaterThan(0);
      const chosen = await postJson<{ book: Book }>(request, `/title-sets/${sets[0]!.id}/choose`, { index: 0 });
      title = chosen.book.title ?? "";
      expect(title).not.toBe("");
      expect(chosen.book.stage).toBe("blueprint");
      expect((await book(request, bookId)).stage).toBe("blueprint");
    });

    await test.step("Blueprint: build and approve", async () => {
      await postJson(request, `/books/${bookId}/blueprints`, { chapterCount: 4 });
      await waitForJob(request, bookId, "blueprint");
      await postJson(request, `/books/${bookId}/blueprint/approve`, {});
      const b = await book(request, bookId);
      expect(b.approvedBlueprintId).toBeTruthy();
      expect(stageAtLeast(b.stage, "blueprint")).toBe(true);
    });

    await test.step("Before writing completes: the Marketing screen is locked and the API answers 409 writing_incomplete", async () => {
      expect((await book(request, bookId)).writingComplete).toBe(false);
      const res = await request.post(`${API}/books/${bookId}/marketing`, { headers: { Origin: ORIGIN }, data: {} });
      expect(res.status()).toBe(409);
      expect(((await res.json()) as { error: { code: string } }).error.code).toBe("writing_incomplete");
      await page.goto(`/books/${bookId}/marketing`);
      await expect(main.getByRole("heading", { level: 1, name: "Marketing" })).toBeVisible();
      await expect(main.getByText("Finish writing every chapter to open marketing.").first()).toBeVisible();
      await expect(stepAction.getByRole("button", { name: /^Generate scripts/ })).toBeDisabled();
      await shoot(page, "marketing-locked");
    });

    await test.step("The mock writes every chapter: stage reaches editor, marketing opens", async () => {
      await postJson(request, `/books/${bookId}/write`, {});
      await waitForJob(request, bookId, "write_book");
      let b = await book(request, bookId);
      if (!b.writingComplete) {
        // The writer never invents an owner's text (acknowledgements names): the owner writes any placeholder.
        const tree = await getJson<SectionTree>(request, `/books/${bookId}/sections`);
        const todo: string[] = [];
        for (const leaf of leafSections(tree)) {
          const detail = await getJson<SectionDetail>(request, `/sections/${leaf.id}`);
          const body = detail.current?.bodyMd.trim() ?? "";
          const versions = await getJson<Items<{ id: string; source: string }>>(request, `/sections/${leaf.id}/versions`);
          const placeholder = versions.items.find((v) => v.id === leaf.currentVersionId)?.source === "app:placeholder";
          if (body === "" || placeholder) {
            todo.push(leaf.kind);
            await postJson(request, `/sections/${leaf.id}/versions`, { bodyMd: `# ${leaf.kind}\n\nThanks to Sam and to everyone who read an early draft.` });
          }
        }
        test.info().annotations.push({ type: "owner-written after the mock", description: todo.join(", ") });
        b = await book(request, bookId);
      }
      expect(b.writingComplete, "writing complete after every section has text").toBe(true);
      expect(stageAtLeast(b.stage, "editor"), `stage ${b.stage}`).toBe(true);
    });

    await test.step("Marketing generates 5 TikTok scripts and 5 Instagram captions", async () => {
      await page.goto(`/books/${bookId}/marketing`);
      await expect(main.getByText("Finish writing every chapter to open marketing.")).toHaveCount(0);
      await stepAction.getByRole("button", { name: /^Generate scripts/ }).click();
      await waitForJob(request, bookId, "marketing", 1);
      await page.getByRole("tab", { name: /Instagram/ }).click();
      await stepAction.getByRole("button", { name: /^Generate captions/ }).click();
      await waitForJob(request, bookId, "marketing", 2);
      const items = (await getJson<Items<MarketingItem>>(request, `/books/${bookId}/marketing`)).items;
      expect(items.filter((i) => i.kind === "tiktok_script")).toHaveLength(5);
      expect(items.filter((i) => i.kind === "instagram_caption")).toHaveLength(5);
    });

    await test.step("Pack: listing/back-cover-blurb.txt and listing/short-bio.txt", async () => {
      // Padding, the owner's matter, a cover and the pack go through the API; the pack gate is the same as the screen's.
      const tree = await getJson<SectionTree>(request, `/books/${bookId}/sections`);
      for (const ch of leafSections(tree).filter((s) => s.kind === "chapter")) {
        const detail = await getJson<SectionDetail>(request, `/sections/${ch.id}`);
        await postJson(request, `/sections/${ch.id}/versions`, { bodyMd: `${detail.current?.bodyMd ?? ""}\n\n${padding("calmer working days", 220)}` });
      }
      await postJson(request, `/books/${bookId}/cover/concepts`, {});
      await waitForJob(request, bookId, "cover_concepts");
      const cover = await getJson<{ cover: { concepts: { assetId: string }[] } }>(request, `/books/${bookId}/cover`);
      await postJson(request, `/books/${bookId}/cover/choose`, { assetId: cover.cover.concepts[0]!.assetId });
      await postJson(request, `/books/${bookId}/cover/build`, {});
      await waitForJob(request, bookId, "cover_build");
      await postJson(request, `/books/${bookId}/exports`, {});
      await expect
        .poll(
          async () => {
            const jobs = (await getJson<Items<Job>>(request, `/books/${bookId}/jobs`)).items.filter((j) => j.kind === "export_pack");
            return jobs[0]?.status ?? "queued";
          },
          { timeout: 180_000 },
        )
        .toMatch(/succeeded|failed|needs_attention|cancelled/);
      const exports = (await getJson<Items<ExportRecord & { id: string }>>(request, `/books/${bookId}/exports`)).items;
      const pack = exports.find((e) => e.kind === "pack" && e.status === "done");
      expect(pack, `a finished pack among ${exports.map((e) => `${e.kind}:${e.status}`).join(", ")}`).toBeTruthy();
      const res = await request.get(`${API}/exports/${pack!.id}/download`);
      expect(res.ok()).toBe(true);
      mkdirSync(downloadDir, { recursive: true });
      const names = readZip(Buffer.from(await res.body())).map((e) => e.name);
      expect(names, `zip entries: ${names.join(", ")}`).toContain("listing/back-cover-blurb.txt");
      expect(names).toContain("listing/short-bio.txt");
      const zip = readZip(Buffer.from(await res.body()));
      expect(
        zip
          .find((e) => e.name === "listing/short-bio.txt")!
          .read()
          .toString("utf8"),
      ).toContain(SHORT_BIO);
      expect(
        zip
          .find((e) => e.name === "listing/back-cover-blurb.txt")!
          .read()
          .toString("utf8")
          .trim().length,
      ).toBeGreaterThan(20);
    });

    await test.step("Export screen: the Mark as published dialog", async () => {
      await page.goto(`/books/${bookId}/export`);
      await expect(main.getByRole("heading", { name: "Export" }).first()).toBeVisible();
      await main.getByRole("button", { name: "Mark as published", exact: true }).click();
      const dialog = page.getByRole("dialog", { name: "Mark as published" });
      await expect(dialog).toBeVisible();
      const date = dialog.getByLabel("Date published");
      expect(await date.inputValue(), "defaults to today").toBe(isoDay(0));
      const max = (await date.getAttribute("max")) ?? "";
      expect(max, "max is a date no earlier than today").toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(max >= isoDay(0)).toBe(true);
      expect(max <= isoDay(1)).toBe(true);
      await shoot(page, "publish-dialog");

      // Keyboard: the date field has focus on open, Tab reaches both buttons, Escape closes.
      await expect(date).toBeFocused();
      const reached = new Set<string>();
      for (let i = 0; i < 6; i++) {
        await page.keyboard.press("Tab");
        const name = await page.evaluate(() => {
          const el = document.activeElement as HTMLElement | null;
          return el ? `${el.tagName}:${(el.textContent ?? "").trim() || el.getAttribute("aria-label") || ""}` : "";
        });
        reached.add(name);
      }
      expect([...reached], "Tab reaches Cancel").toContain("BUTTON:Cancel");
      // The button's text carries a hidden "Saving" label for the busy state, so match the start.
      expect(
        [...reached].some((n) => n.startsWith("BUTTON:Mark as published")),
        `Tab reaches the Mark as published button: ${[...reached].join(" | ")}`,
      ).toBe(true);
      await page.keyboard.press("Escape");
      await expect(dialog).toBeHidden();

      // Submit with a past date.
      const past = isoDay(-10);
      await main.getByRole("button", { name: "Mark as published", exact: true }).click();
      await expect(dialog).toBeVisible();
      await dialog.getByLabel("Date published").fill(past);
      await dialog.getByRole("button", { name: "Mark as published", exact: true }).click();
      await expect(dialog).toBeHidden();
      await expect.poll(async () => (await book(request, bookId)).status).toBe("published");
    });

    await test.step("The Published shelf shows the book with that date", async () => {
      await page.goto("/published");
      const shelfBook = page.locator("li", { has: page.getByRole("heading", { name: title, exact: true }) });
      await expect(shelfBook).toHaveCount(1);
      const expected = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(
        new Date(`${isoDay(-10)}T00:00:00Z`),
      );
      await expect(shelfBook.getByText("Live since").locator("xpath=following-sibling::dd")).toHaveText(expected);
    });

    expect(errors(), "console errors").toEqual([]);
  });

  test("Archive from a Library card asks in a labelled dialog, Undo restores, then it sits in the Archive", async ({ page, request }) => {
    const errors = watchConsole(page);
    const stamp = String(Date.now()).slice(-6);
    const title = `Archive Test ${stamp}`;
    const profile = await newProfile(request, stamp, null);
    const created = await postJson<Book>(request, "/books", {
      profileId: profile.id,
      bookTypeId: "self-help",
      template: "nonfiction",
      idea: "A book to archive.",
      title,
    });
    // window.confirm would be a native dialog: fail loudly if the app uses one.
    page.on("dialog", async (d) => {
      await d.dismiss();
      throw new Error(`Native ${d.type()} dialog used: ${d.message()}`);
    });

    await page.goto("/library?view=covers");
    const archiveLink = page.getByRole("button", { name: `Archive ${title}`, exact: true });
    await expect(archiveLink).toBeVisible();
    await archiveLink.click();
    const dialog = page.getByRole("dialog", { name: `Archive ${title}?` });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Cancel" })).toBeVisible();
    await shoot(page, "archive-confirm");

    // Undo path first, while the toast is up.
    await dialog.getByRole("button", { name: "Archive book" }).click();
    await expect(dialog).toBeHidden();
    await expect(archiveLink).toHaveCount(0);
    expect((await book(request, created.id)).status).toBe("archived");
    const undo = page.getByRole("button", { name: "Undo" });
    // Soft: if no Undo toast shows, report it, restore through the API and carry on with the rest of the flow.
    await expect.soft(undo, "the Undo toast after archiving from a Library card").toBeVisible({ timeout: 5_000 });
    if (await undo.isVisible()) await undo.click();
    else await postJson(request, `/books/${created.id}/restore`, {});
    await expect.poll(async () => (await book(request, created.id)).status).toBe("active");
    await expect(archiveLink).toBeVisible();

    // Archive again and find it in the Archive.
    await archiveLink.click();
    await page
      .getByRole("dialog", { name: `Archive ${title}?` })
      .getByRole("button", { name: "Archive book" })
      .click();
    await expect(archiveLink).toHaveCount(0);
    await page.goto("/archive");
    await expect(page.getByRole("list", { name: "Archived books" }).getByText(title).first()).toBeVisible();
    expect((await book(request, created.id)).status).toBe("archived");

    expect(errors(), "console errors").toEqual([]);
  });

  test("a picture book: marketing is locked until the story is saved, then opens with 5 and 5", async ({ request }) => {
    const stamp = String(Date.now()).slice(-6);
    const profile = await newProfile(request, stamp, null);
    const created = await postJson<Book>(request, "/books", {
      profileId: profile.id,
      bookTypeId: "picture-book",
      template: "picture-book",
      idea: "A small rabbit called Pip waits patiently for the wind to lift her paper kite.",
      title: `Pip and the Kite ${stamp}`,
    });
    expect(created.template).toBe("picture-book");
    const locked = await request.post(`${API}/books/${created.id}/marketing`, { headers: { Origin: ORIGIN }, data: {} });
    expect(locked.status()).toBe(409);
    expect(((await locked.json()) as { error: { code: string } }).error.code).toBe("writing_incomplete");

    await postJson(request, `/books/${created.id}/picture-book`, { spreads: 10 });
    await waitForJob(request, created.id, "picture_book", 1, JOB_WAIT * 3);
    const done = await book(request, created.id);
    expect(done.writingComplete).toBe(true);
    expect(stageAtLeast(done.stage, "editor"), `stage ${done.stage}`).toBe(true);

    await postJson(request, `/books/${created.id}/marketing`, {});
    await waitForJob(request, created.id, "marketing");
    const items = (await getJson<Items<MarketingItem>>(request, `/books/${created.id}/marketing`)).items;
    expect(items.filter((i) => i.kind === "tiktok_script")).toHaveLength(5);
    expect(items.filter((i) => i.kind === "instagram_caption")).toHaveLength(5);
  });
});
