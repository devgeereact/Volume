import { expect, test, type APIRequestContext } from "@playwright/test";

// Whole-book rebuild from a new title, and going back to before it (D-056, 22 October 2026). Mock AI only.
const API = "http://127.0.0.1:5311/api/v1";
const headers = { Origin: "http://127.0.0.1:5312" };

interface Section {
  id: string;
  kind: string;
  number: number | null;
  enabled: boolean;
  currentVersionId: string | null;
}
interface Tree {
  front: Section[];
  body: Section[];
  back: Section[];
}
interface Rebuilds {
  planTitle: string | null;
  rebuilds: { jobId: string; status: string; note: string | null; undoneAt: number | null }[];
}

async function post(request: APIRequestContext, route: string, data: unknown): Promise<Record<string, unknown>> {
  const res = await request.post(`${API}${route}`, { headers, data });
  expect(res.status(), await res.text()).toBeLessThan(300);
  return (await res.json()) as Record<string, unknown>;
}

async function tree(request: APIRequestContext, bookId: string): Promise<Tree> {
  return (await (await request.get(`${API}/books/${bookId}/sections`)).json()) as Tree;
}

/** A book written in full by the mock AI from a two-chapter blueprint. */
async function writtenBook(request: APIRequestContext): Promise<string> {
  const author = await post(request, "/profiles", { penName: `Rebuild author ${Date.now()}`, bioThirdPerson: "This author writes test books." });
  const book = await post(request, "/books", { profileId: author["id"], idea: "Calm notes for night shifts", title: "Night Notes" });
  const id = String(book["id"]);
  await post(request, `/books/${id}/blueprints`, { chapterCount: 2 });
  await expect.poll(async () => ((await (await request.get(`${API}/books/${id}/blueprint`)).json()) as { blueprint: unknown }).blueprint !== null).toBe(true);
  await post(request, `/books/${id}/blueprint/approve`, {});
  await post(request, `/books/${id}/write`, {});
  await expect
    .poll(async () => (await tree(request, id)).body.filter((s) => s.kind === "chapter").every((s) => s.currentVersionId !== null), { timeout: 120_000 })
    .toBe(true);
  // Wait for the listing child too, so no job runs on the book when the rebuild starts.
  await expect
    .poll(
      async () =>
        ((await (await request.get(`${API}/books/${id}/jobs`)).json()) as { items: { status: string }[] }).items.every((j) =>
          ["succeeded", "needs_attention", "failed", "cancelled"].includes(j.status),
        ),
      {
        timeout: 120_000,
      },
    )
    .toBe(true);
  return id;
}

test("rebuilds the whole book for a new title with named versions, then goes back to before it", async ({ page, request }) => {
  const bookId = await writtenBook(request);
  const chapter1 = (await tree(request, bookId)).body.find((s) => s.kind === "chapter" && s.number === 1);
  if (!chapter1?.currentVersionId) throw new Error("Chapter 1 was not written");
  const before = chapter1.currentVersionId;

  await page.goto(`/books/${bookId}/blueprint`);
  // The book's step bar is up (the approved step bar has no cover; the Library card shows it).
  await expect(page.getByRole("navigation", { name: "Book steps" })).toBeVisible();

  const panel = page.getByRole("region", { name: "Rebuild the whole book" });
  await panel.getByLabel("Title for the rebuild").fill("Calm Night Notes");
  await panel.getByRole("button", { name: "Rebuild for this title" }).click();
  const confirm = page.getByRole("dialog", { name: 'Rebuild the book as "Calm Night Notes"' });
  await expect(confirm).toContainText("A new blueprint is built for the title.");
  await confirm.getByRole("button", { name: "Rebuild the book" }).click();
  await page.waitForURL(new RegExp(`/books/${bookId}/writing$`));

  await expect
    .poll(async () => ((await (await request.get(`${API}/books/${bookId}/rebuilds`)).json()) as Rebuilds).rebuilds[0]?.status, { timeout: 150_000 })
    .toBe("succeeded");
  const book = (await (await request.get(`${API}/books/${bookId}`)).json()) as { title: string };
  expect(book.title).toBe("Calm Night Notes");

  // The rewritten chapter's newest version is named after the rebuild; the old one is still listed.
  await page.goto(`/books/${bookId}/editor/${chapter1.id}`);
  await page.getByRole("button", { name: "Versions", exact: true }).click();
  const list = page.getByRole("list", { name: "Version list" });
  await expect(list).toContainText("Rebuild 1 from new title: Calm Night Notes");
  expect(await list.getByRole("button").count()).toBeGreaterThanOrEqual(2);
  await page.keyboard.press("Escape");

  // Go back to before the rebuild from the Blueprint step.
  await page.goto(`/books/${bookId}/blueprint`);
  await expect(panel).toContainText("Past rebuilds");
  await panel.getByRole("button", { name: "Go back to before this rebuild" }).click();
  const undo = page.getByRole("dialog", { name: "Go back to before this rebuild" });
  await undo.getByRole("button", { name: "Put the book back" }).click();
  await expect(panel.getByRole("status")).toContainText("Back to before rebuild 1");
  await expect(panel).toContainText("undone");

  expect(((await (await request.get(`${API}/books/${bookId}`)).json()) as { title: string }).title).toBe("Night Notes");
  const versions = (await (await request.get(`${API}/sections/${chapter1.id}/versions`)).json()) as {
    items: { id: string; note: string | null; parentVersionId: string | null }[];
  };
  expect(versions.items[0]!.note).toBe("Back to before rebuild 1");
  expect(versions.items[0]!.parentVersionId).toBe(before);
});

test("a crowded Library row scrolls sideways with buttons, and the wheel scrolls the page", async ({ page, request }) => {
  const author = await post(request, "/profiles", { penName: `Shelf author ${Date.now()}`, bioThirdPerson: "This author writes test books." });
  for (let n = 1; n <= 9; n++) await post(request, "/books", { profileId: author["id"], idea: `Shelf idea ${n}`, title: `Shelf book ${n}` });
  await page.setViewportSize({ width: 1100, height: 900 });
  // The Shelves view (?view=covers) holds the sideways rows; the default Grid view wraps instead.
  await page.goto("/library?view=covers");
  const more = page.getByRole("button", { name: /^More books in / }).first();
  await expect(more).toBeVisible();
  const row = page.locator("section", { has: more }).locator("ul").first();
  const overflowY = await row.evaluate((el) => getComputedStyle(el).overflowY);
  expect(overflowY).toBe("hidden");
  await page.screenshot({ path: test.info().outputPath("crowded-row.png") });
  await more.click();
  await expect.poll(() => row.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0);
  await expect(page.getByRole("button", { name: /^Earlier books in / }).first()).toBeVisible();
  // The wheel over the covers moves the page, not the row.
  const box = await row.boundingBox();
  if (!box) throw new Error("Row not on screen");
  const top = await page.evaluate(() => document.scrollingElement?.scrollTop ?? 0);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, 400);
  await expect
    .poll(
      async () =>
        (await page.evaluate(() => document.scrollingElement?.scrollTop ?? 0)) + (await page.evaluate(() => document.querySelector("main")?.scrollTop ?? 0)),
    )
    .toBeGreaterThan(top);
});

test("Library rows scroll the page, not themselves", async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 900 });
  await page.goto("/library?view=covers");
  const rows = page.locator("section ul");
  await expect(rows.first()).toBeVisible();
  const overflowY = await rows.evaluateAll((els) => els.map((el) => getComputedStyle(el).overflowY));
  expect(overflowY.every((v) => v === "hidden" || v === "visible")).toBe(true);
});
