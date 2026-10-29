import { expect, test, type APIRequestContext } from "@playwright/test";

const API = "http://127.0.0.1:5311/api/v1";
const headers = { Origin: "http://127.0.0.1:5312" };
interface Profile {
  id: string;
  penName: string;
  brand: { photoAssetId?: string };
}
interface Blueprint {
  version: number;
  data: Record<string, unknown>;
}
async function profile(request: APIRequestContext): Promise<Profile> {
  const response = await request.post(`${API}/profiles`, {
    headers,
    data: { penName: `Browser author ${Date.now()}`, bioThirdPerson: "This author writes test books." },
  });
  expect(response.status()).toBe(201);
  return (await response.json()) as Profile;
}

test("Markdown import saves edited text after reload and supports undo and plain paste", async ({ page, request }) => {
  const author = await profile(request);
  await page.goto("/library");
  await page.getByRole("button", { name: "Import manuscript", exact: true }).first().click();
  const dialog = page.getByRole("dialog", { name: "Import manuscripts" });
  await dialog.getByLabel("Pen name", { exact: true }).click();
  await dialog.getByRole("option", { name: author.penName }).click();
  await dialog.getByLabel("Markdown files").setInputFiles({
    name: "browser.md",
    mimeType: "text/markdown",
    buffer: Buffer.from("::: titlepage\nBrowser Import\nA saved manuscript\nTest Author\n:::\n\n# Chapter 1: Imported chapter\n\nThe original paragraph.\n"),
  });
  await dialog.getByRole("button", { name: "Import manuscript", exact: true }).click();
  await page.waitForURL(/\/books\/[^/]+\/editor$/);
  const paragraph = page.getByRole("textbox", { name: "Manuscript paragraph" }).first();
  await expect(paragraph).toContainText("The original paragraph.");
  await paragraph.focus();
  await page.keyboard.press("ControlOrMeta+End");
  await page.keyboard.insertText(" Saved browser change.");
  await page.keyboard.press("ControlOrMeta+z");
  await expect(paragraph).not.toContainText("Saved browser change.");
  await page.keyboard.press("ControlOrMeta+Shift+z");
  await expect(paragraph).toContainText("Saved browser change.");
  await paragraph.evaluate((element) => {
    const clipboardData = new DataTransfer();
    clipboardData.setData("text/plain", " Plain pasted text.");
    clipboardData.setData("text/html", "<script>broken()</script><b>Wrong HTML</b>");
    element.dispatchEvent(new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData }));
  });
  await expect(paragraph).toContainText("Plain pasted text.");
  await page.getByRole("button", { name: "Save version", exact: true }).click();
  await expect(page.getByText(/Saved as version \d+ at/)).toBeVisible();
  await page.reload();
  await expect(page.getByRole("textbox", { name: "Manuscript paragraph" }).first()).toContainText("Saved browser change.");
  await expect(page.getByRole("textbox", { name: "Manuscript paragraph" }).first()).toContainText("Plain pasted text.");
});

test("blueprint comparison restores an older version as a new draft", async ({ page, request }) => {
  const author = await profile(request);
  const created = await request.post(`${API}/books`, { headers, data: { profileId: author.id, idea: "Blueprint restore test", title: "History test" } });
  expect(created.status()).toBe(201);
  const book = (await created.json()) as { id: string };
  const generated = await request.post(`${API}/books/${book.id}/blueprints`, { headers, data: { chapterCount: 2 } });
  expect(generated.status()).toBe(202);
  let original: Blueprint | undefined;
  await expect
    .poll(async () => {
      const response = await request.get(`${API}/books/${book.id}/blueprint`);
      original = ((await response.json()) as { blueprint: Blueprint | null }).blueprint ?? undefined;
      return original?.version;
    })
    .toBe(1);
  if (!original) throw new Error("Missing blueprint");
  const changed = { ...original.data, title: "Changed history title" };
  const edited = await request.patch(`${API}/books/${book.id}/blueprint`, {
    headers,
    data: { parts: changed, baseVersion: 1, note: "Browser fixture change" },
  });
  expect(edited.status()).toBe(200);
  await page.goto(`/books/${book.id}/blueprint`);
  const versions = page.getByRole("complementary", { name: "Blueprint details" });
  await versions.getByRole("button", { name: "Compare and restore" }).last().click();
  const comparison = page.getByRole("dialog", { name: /Compare version/ });
  await expect(comparison).toBeVisible();
  await comparison.getByRole("button", { name: "Restore as a new draft" }).click();
  await expect(comparison).not.toBeVisible();
  const restored = ((await (await request.get(`${API}/books/${book.id}/blueprint`)).json()) as { blueprint: Blueprint & { status: string } }).blueprint;
  expect(restored.version).toBe(3);
  expect(restored.status).toBe("draft");
  expect(restored.data.title).toBe(original.data.title);
  expect((await request.patch(`${API}/books/${book.id}`, { headers, data: { budgetUsd: 0.02 } })).status()).toBe(200);
  expect((await request.post(`${API}/books/${book.id}/blueprint/approve`, { headers, data: {} })).status()).toBe(200);
  await page.goto(`/books/${book.id}/writing`);
  const start = page.getByRole("group", { name: "Step action" }).getByRole("button", { name: /^Write book/ });
  await expect(start).toBeEnabled();
  await start.click();
  const cost = page.getByRole("dialog", { name: "Confirm writing cost" });
  await expect(cost).toBeVisible();
  await cost.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(cost).not.toBeVisible();
  const jobs = (await (await request.get(`${API}/books/${book.id}/jobs`)).json()) as { items: { kind: string }[] };
  expect(jobs.items.some((job) => job.kind === "write_book")).toBe(false);
  await page.goto(`/books/${book.id}/export`);
  await page.getByRole("button", { name: "Set list prices" }).click();
  const prices = page.getByRole("dialog", { name: /Prices for/ });
  await prices.getByLabel("Kindle eBook, pounds", { exact: true }).fill("3.99");
  await prices.getByRole("button", { name: "Save prices", exact: true }).click();
  await expect(prices).not.toBeVisible();
  const priced = (await (await request.get(`${API}/books/${book.id}`)).json()) as { status: string; listPrices: { ebook: number } };
  expect(priced.status).toBe("active");
  expect(priced.listPrices.ebook).toBe(3.99);
});

test("author photo upload persists through profile save and reload", async ({ page, request }) => {
  const author = await profile(request);
  await page.goto(`/profiles/${author.id}`);
  await expect(page.getByRole("button", { name: "Choose photo" })).toBeEnabled();
  const image = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 600;
    canvas.height = 600;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Missing canvas");
    context.fillStyle = "#cccccc";
    context.fillRect(0, 0, 600, 600);
    return canvas.toDataURL("image/png").split(",")[1] ?? "";
  });
  await page.locator("input[type=file]").setInputFiles({ name: "portrait.png", mimeType: "image/png", buffer: Buffer.from(image, "base64") });
  await expect(page.getByRole("button", { name: "Remove photo" })).toBeVisible();
  await page.getByRole("button", { name: "Save profile", exact: true }).click();
  await expect.poll(async () => ((await (await request.get(`${API}/profiles/${author.id}`)).json()) as Profile).brand.photoAssetId).toBeTruthy();
  await page.reload();
  await expect(page.getByRole("button", { name: "Remove photo" })).toBeVisible();
});
