/*
 * Phase 8 browser tests (P8-4): Volume mode, with the mock AI. Playwright, Chromium, API mode.
 *
 *   1. A batch of five books across three pen names is built and started from /volume, and its progress
 *      moves on screen without a reload until every book has run.
 *   2. The release schedule refuses the third new title of one format inside KDP's rolling week, across pen
 *      names, names the clash and the next free date, and accepts that date. The limit is read from the
 *      server (config/kdp-rules), so no number is typed here.
 *   3. A viewer sees Volume mode, the schedule and a batch with no write buttons.
 *
 * Run it with the rest from the repo root:   npm run e2e
 *
 * The five books and their pen names are created through the API (setup, not the thing under test); the
 * batch, the run and the schedule are driven through the screens. The main test server injects no failure (the
 * one full-book.spec.ts expects lives on that spec's own server), so every book in the batch finishes. A book
 * that fails inside a batch is covered by phase8-batch-failure.spec.ts.
 *
 * What cannot be done here: the test server always signs the browser in as the workspace owner (the
 * stub auth has no setting for another role), so a viewer is simulated by answering GET /api/v1/me
 * with role "viewer" in the browser. That proves the screens hide their write controls. That the
 * server refuses a viewer's writes is proved by apps/server/test/roles.test.ts and not repeated here.
 */
import { expect, test, type Locator, type Page } from "@playwright/test";
import { API, getJson, JOB_WAIT, postJson, type Items } from "./helpers";

interface ProfileRec {
  id: string;
  penName: string;
}
interface BookRec {
  id: string;
  title: string;
}
interface BatchView {
  id: string;
  status: string;
  itemCount: number;
  penNames: string[];
  items: { bookId: string; run: { status: string } | null }[];
}
interface ScheduleView {
  limit: { maxNewTitlesPerFormat: number; periodDays: number; ruleId: string };
  items: { id: string; bookId: string; format: string; plannedAt: number; book: { penName: string } }[];
}

const DAY = 86_400_000;
const stamp = new Date().toISOString().slice(11, 19).replace(/:/g, "");
/** Three pen names and five books: 2, 2 and 1. Titles are unique per run so the pickers find exactly these. */
const PENS = [`E2E Ada North ${stamp}`, `E2E Ben South ${stamp}`, `E2E Cleo West ${stamp}`];
const PLAN: { pen: number; title: string }[] = [
  { pen: 0, title: `Volume One ${stamp}` },
  { pen: 0, title: `Volume Two ${stamp}` },
  { pen: 1, title: `Volume Three ${stamp}` },
  { pen: 1, title: `Volume Four ${stamp}` },
  { pen: 2, title: `Volume Five ${stamp}` },
];

const isoDay = (ms: number): string => new Date(ms).toISOString().slice(0, 10);

function watchPageErrors(page: Page): () => void {
  const errors: string[] = [];
  page.on("pageerror", (err) => errors.push(`${page.url()}: ${err.message}`));
  return () => expect(errors, "uncaught page errors").toEqual([]);
}

/**
 * Opens a custom select by its label and picks one option with the keyboard (Home, ArrowDown, Enter). The mouse
 * cannot be used here once the library holds many books: the list has no height limit, so options below the
 * viewport cannot be clicked (reported to the frontend owner, not hidden by this helper).
 */
async function choose(scope: Locator, page: Page, label: string, option: RegExp): Promise<void> {
  await scope.getByLabel(label, { exact: true }).click();
  const list = page.getByRole("listbox");
  await expect(list).toBeVisible();
  const names = await list.getByRole("option").allTextContents();
  const index = names.findIndex((n) => option.test(n));
  expect(index, `an option matching ${option} in ${names.length} options`).toBeGreaterThanOrEqual(0);
  await list.press("Home");
  for (let i = 0; i < index; i++) await list.press("ArrowDown");
  await list.press("Enter");
  await expect(list).toBeHidden();
}

test.describe.configure({ mode: "serial" });

test.describe("phase 8 Volume mode", () => {
  const bookIds: string[] = [];
  let batchId = "";

  test.beforeAll(async ({ request }) => {
    test.setTimeout(170_000);
    const profileIds: string[] = [];
    for (const penName of PENS) {
      const p = await postJson<ProfileRec>(request, "/profiles", { penName, bioThirdPerson: `${penName} writes plain books for busy readers.` });
      profileIds.push(p.id);
    }
    for (const [i, b] of PLAN.entries()) {
      const book = await postJson<BookRec>(request, "/books", {
        profileId: profileIds[b.pen],
        idea: `Batch idea ${i + 1} for ${stamp}`,
        title: b.title,
        settings: { acknowledgements: "Sam" },
      });
      bookIds.push(book.id);
    }
    expect(bookIds).toHaveLength(5);
  });

  test("a batch of five books across three pen names runs from /volume with live progress", async ({ page, request }) => {
    const failNow = watchPageErrors(page);
    const main = page.locator("main");

    await test.step("Volume mode: create the batch by picking books grouped by pen name", async () => {
      await page.goto("/volume");
      await expect(main.getByRole("heading", { level: 1, name: "Volume mode" })).toBeVisible();
      await main.getByRole("button", { name: "New batch" }).first().click();
      const dialog = page.getByRole("dialog", { name: "New batch" });
      await expect(dialog).toBeVisible();
      await dialog.getByLabel("Name", { exact: true }).fill(`E2E batch ${stamp}`);
      for (const pen of PENS) await expect(dialog.getByRole("group", { name: pen })).toBeVisible();
      for (const b of PLAN) {
        // The checkbox is visually hidden inside its label: click the label, then check the box took it.
        await dialog.locator("label", { hasText: b.title }).click();
        await expect(dialog.getByRole("checkbox", { name: b.title })).toBeChecked();
      }
      await expect(dialog.getByText("(5 picked)")).toBeVisible();
      await dialog.getByRole("button", { name: "Create batch" }).click();
      await page.waitForURL(/\/volume\/batches\/[^/]+$/);
      batchId = page.url().split("/batches/")[1]!;
      await expect(main.getByRole("heading", { level: 1, name: `E2E batch ${stamp}` })).toBeVisible();
      const batch = await getJson<BatchView>(request, `/batches/${batchId}`);
      expect(batch).toMatchObject({ status: "draft", itemCount: 5 });
      expect([...batch.penNames].sort()).toEqual([...PENS].sort());
      await expect(main.getByRole("list", { name: "Books in this batch" }).locator("> li")).toHaveCount(5);
      failNow();
    });

    await test.step("Start batch: progress moves on screen without a reload, until every book has run", async () => {
      let navigations = 0;
      page.on("framenavigated", (f) => {
        if (f === page.mainFrame()) navigations++;
      });
      await main.getByRole("button", { name: "Start batch", exact: true }).click();
      const confirm = page.getByRole("dialog", { name: /^Start batch: 5 books/ });
      await expect(confirm).toBeVisible();
      await confirm.getByRole("button", { name: "Start batch", exact: true }).click();
      const navigationsAtStart = navigations;

      // The live panel appears while the batch is queued or running. It is read as it changes.
      const live = main.getByRole("region", { name: "Batch progress" });
      const seen = new Set<string>();
      const sample = async (): Promise<void> => {
        if (!(await live.isVisible())) return;
        const text = (
          await live
            .getByText(/books? done\./)
            .first()
            .textContent({ timeout: 500 })
            .catch(() => null)
        )?.trim();
        if (text) seen.add(text);
      };
      const settled = async (): Promise<string> => {
        await sample();
        const status = (await getJson<BatchView>(request, `/batches/${batchId}`)).status;
        return ["queued", "running", "waiting"].includes(status) ? "running" : status;
      };
      await expect(live).toBeVisible({ timeout: JOB_WAIT });
      await expect.poll(settled, { timeout: 180_000, intervals: [100, 200, 300] }).not.toBe("running");
      expect(await settled(), "the batch finished well").toBe("succeeded");
      expect(seen.size, `the live line was shown: ${[...seen].join(" | ")}`).toBeGreaterThan(0);
      expect(navigations, "the page was never reloaded or navigated while the batch ran").toBe(navigationsAtStart);

      // The screen settles to Finished with no live panel, and every book has its chapters.
      await expect(live).toBeHidden({ timeout: JOB_WAIT });
      await expect(main.getByText("Finished", { exact: true }).first()).toBeVisible();
      const done = await getJson<BatchView>(request, `/batches/${batchId}`);
      expect(done.items.map((i) => i.run?.status)).toEqual(Array(5).fill("succeeded"));
      for (const id of bookIds) {
        const tree = await getJson<{ body: { kind: string; status: string }[] }>(request, `/books/${id}/sections`);
        expect(tree.body.filter((s) => s.kind === "chapter").length, `chapters of ${id}`).toBeGreaterThanOrEqual(2);
        expect(tree.body.filter((s) => s.kind === "chapter").every((s) => s.status === "done")).toBe(true);
      }
      failNow();
    });

    await test.step("Volume mode list: the batch shows its books, ready count and pen names", async () => {
      await page.goto("/volume");
      const row = main
        .getByRole("list", { name: "Batches" })
        .getByRole("listitem")
        .filter({ hasText: `E2E batch ${stamp}` });
      await expect(row).toContainText("5 books");
      for (const pen of PENS) await expect(row).toContainText(pen);
      failNow();
    });
  });

  test("the schedule refuses the third new title of a format in a week and names the next free date", async ({ page, request }) => {
    const failNow = watchPageErrors(page);
    const main = page.locator("main");
    const { limit } = await getJson<ScheduleView>(request, "/schedule");
    expect(limit.ruleId).toBe("titles.creationLimit");
    const max = limit.maxNewTitlesPerFormat;
    expect(bookIds.length, "more books than the limit, so one must be refused").toBeGreaterThan(max);
    const today = Date.now();
    // One book per slot, each from a different pen name where possible: PLAN order is Ada, Ada, Ben, Ben, Cleo.
    const picks = [0, 2, 4].map((i) => PLAN[i]!);
    expect(picks.length).toBeGreaterThan(max);
    const dates = picks.map((_, i) => isoDay(today + (i + 1) * DAY));

    await page.goto("/volume/schedule");
    await expect(main.getByRole("heading", { level: 1, name: "Release schedule" })).toBeVisible();
    await expect(main.getByText(new RegExp(`Up to ${max} new titles per format in any ${limit.periodDays} days`))).toBeVisible();

    async function plan(book: string, format: RegExp, date: string): Promise<Locator> {
      await main.getByRole("button", { name: "Plan a release" }).first().click();
      const dialog = page.getByRole("dialog", { name: "Plan a release" });
      await expect(dialog).toBeVisible();
      await choose(dialog, page, "Book", new RegExp(book));
      await dialog.getByRole("radio", { name: format }).click();
      await dialog.getByLabel("Release date").fill(date);
      await dialog.getByRole("button", { name: "Plan release" }).click();
      return dialog;
    }

    await test.step(`The first ${max} paperbacks in the week fit`, async () => {
      for (let i = 0; i < max; i++) {
        const dialog = await plan(picks[i]!.title, /^Paperback$/, dates[i]!);
        await expect(dialog).toBeHidden({ timeout: JOB_WAIT });
        await expect(main.getByText(new RegExp(`${picks[i]!.title} is planned as a paperback`))).toBeVisible();
      }
      const slots = (await getJson<ScheduleView>(request, "/schedule")).items.filter((s) => s.format === "paperback" && bookIds.includes(s.bookId));
      expect(slots).toHaveLength(max);
      await expect(main.getByRole("region", { name: "Paperback" })).toContainText(`${max} of ${max} new titles in these 7 days`);
    });

    let nextFree = "";
    await test.step("The next paperback, from another pen name, is refused with the clash and the next free date", async () => {
      const dialog = await plan(picks[max]!.title, /^Paperback$/, dates[max]!);
      await expect(dialog.getByText("No paperback slot free on that date")).toBeVisible();
      await expect(dialog).toBeVisible();
      const banner = dialog.getByText(/The next free date is /).first();
      await expect(banner).toContainText(`KDP allows ${max} new paperback titles in any ${limit.periodDays} days`);
      await expect(banner).toContainText("Already planned:");
      for (const planned of picks.slice(0, max)) await expect(banner).toContainText(planned.title);
      // The refusal names the next free date: a week after the first slot.
      const first = new Date(`${dates[0]}T12:00:00Z`).getTime();
      const expected = new Date(first + limit.periodDays * DAY);
      const useButton = dialog.getByRole("button", { name: /^Use / });
      await expect(useButton).toBeVisible();
      nextFree = (await useButton.textContent())?.replace(/^Use\s+/, "").trim() ?? "";
      expect(nextFree, "the next free date, in words").toContain(String(expected.getUTCFullYear()));
      expect(new Date(`${nextFree} 12:00 UTC`).getTime()).toBe(expected.getTime());
      // Nothing was planned for the refused book.
      const slots = (await getJson<ScheduleView>(request, "/schedule")).items;
      expect(slots.some((s) => s.bookId === bookIds[4] && s.format === "paperback")).toBe(false);
      failNow();
    });

    await test.step("Another format has its own limit; the refused paperback fits on the next free date", async () => {
      // Same dialog, same book: switch to the Kindle eBook format on the refused date.
      const dialog = page.getByRole("dialog", { name: "Plan a release" });
      await dialog.getByRole("radio", { name: /^Kindle eBook$/ }).click();
      await dialog.getByRole("button", { name: "Plan release" }).click();
      await expect(dialog).toBeHidden({ timeout: JOB_WAIT });
      await expect(main.getByText(new RegExp(`${picks[max]!.title} is planned as a Kindle eBook`))).toBeVisible();

      // Back to the paperback: refused again, then "Use <date>" takes the next free date and it is accepted.
      const again = await plan(picks[max]!.title, /^Paperback$/, dates[max]!);
      await expect(again.getByText("No paperback slot free on that date")).toBeVisible();
      await again.getByRole("button", { name: new RegExp(`^Use ${nextFree.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`) }).click();
      await expect(again.getByLabel("Release date")).toHaveValue(isoDay(new Date(`${dates[0]}T12:00:00Z`).getTime() + limit.periodDays * DAY));
      await again.getByRole("button", { name: "Plan release" }).click();
      await expect(again).toBeHidden({ timeout: JOB_WAIT });
      const slots = (await getJson<ScheduleView>(request, "/schedule")).items.filter((s) => s.bookId === bookIds[4]);
      expect(slots.map((s) => s.format).sort()).toEqual(["ebook", "paperback"]);
      failNow();
    });
  });

  test("a viewer reads Volume mode and the schedule with no write buttons", async ({ page, request }) => {
    const failNow = watchPageErrors(page);
    const main = page.locator("main");

    // Contrast: the real server signs this browser in as the owner.
    const real = await getJson<{ role: string }>(request, "/me");
    expect(real.role).toBe("owner");

    await page.route("**/api/v1/me", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ userId: "e2e-viewer", workspaceId: "e2e-workspace", role: "viewer", instanceOwner: false, accountsMode: "owner-only" }),
      }),
    );

    await test.step("Volume mode: the batches are listed, New batch is gone, a read-only note shows", async () => {
      await page.goto("/volume");
      await expect(main.getByRole("heading", { level: 1, name: "Volume mode" })).toBeVisible();
      await expect(main.getByText("Read only: you are a viewer")).toBeVisible();
      await expect(main.getByRole("list", { name: "Batches" })).toContainText(`E2E batch ${stamp}`);
      await expect(main.getByRole("button", { name: "New batch" })).toHaveCount(0);
    });

    await test.step("A batch: Start, Add books, Delete and Mark ready are gone", async () => {
      await page.goto(`/volume/batches/${batchId}`);
      await expect(main.getByRole("heading", { level: 1, name: `E2E batch ${stamp}` })).toBeVisible();
      await expect(main.getByRole("list", { name: "Books in this batch" }).locator("> li")).toHaveCount(5);
      await expect(main.getByText("Read only: you are a viewer")).toBeVisible();
      for (const name of [/^Start/, "Add books", "Delete batch", /^Mark ready/, /^Remove .* from this batch$/]) {
        await expect(main.getByRole("button", { name }), `button ${String(name)}`).toHaveCount(0);
      }
    });

    await test.step("Schedule: the slots are shown, Plan a release is gone, a slot opens with Close only", async () => {
      await page.goto("/volume/schedule");
      await expect(main.getByRole("heading", { level: 1, name: "Release schedule" })).toBeVisible();
      await expect(main.getByText("Read only: you are a viewer")).toBeVisible();
      await expect(main.getByRole("button", { name: "Plan a release" })).toHaveCount(0);
      const slot = main.getByRole("button", { name: new RegExp(`Volume (One|Three|Five) ${stamp}`) }).first();
      await expect(slot).toBeVisible();
      await slot.click();
      const dialog = page.getByRole("dialog");
      // Two buttons are called Close: the corner cross and the footer button a viewer gets instead of the write buttons.
      const footerClose = dialog.getByRole("button", { name: "Close", exact: true }).last();
      await expect(footerClose).toBeVisible();
      for (const name of ["Remove from schedule", "Confirm release"]) await expect(dialog.getByRole("button", { name })).toHaveCount(0);
      await footerClose.click();
      await expect(dialog).toBeHidden();
    });

    await test.step("Library: no New book for a viewer", async () => {
      await page.goto("/library");
      await expect(main.getByRole("heading", { level: 1, name: "Library" })).toBeVisible();
      await expect(main.getByText(/Read only: you are a viewer/).first()).toBeVisible();
      await expect(main.getByRole("button", { name: "New book" })).toHaveCount(0);
      failNow();
    });

    // The API is untouched by the browser-side role: it still answers as the owner.
    expect((await request.get(`${API}/batches/${batchId}`)).status()).toBe(200);
    expect((await getJson<Items<unknown>>(request, "/batches")).items.length).toBeGreaterThan(0);
  });
});
