import { expect, test } from "@playwright/test";

test("offline new-profile entry settles without a health request loop and reconnects", async ({ page }) => {
  let offline = true;
  let healthRequests = 0;
  await page.route("**/api/v1/health", async (route) => {
    healthRequests++;
    if (offline)
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: { code: "offline_fixture", message: "Offline test" } }),
      });
    else await route.continue();
  });
  await page.goto("/profiles/new");
  await expect(page.getByRole("heading", { level: 1, name: "New profile", exact: true })).toBeVisible();
  await expect(page.getByText(/^Demo\s+data\. Everything here is sample data\./)).toBeVisible();
  // Observe a window in which the old mounting loop issued hundreds of requests.
  await page.waitForTimeout(1500);
  expect(healthRequests).toBeLessThanOrEqual(2);
  await expect(page.getByLabel("Name on the book", { exact: true })).toBeEditable();

  offline = false;
  // The real 30-second health poll must reconnect without reloading or remount retries.
  await expect(page.getByText(/^Demo\s+data\. Everything here is sample data\./)).toBeHidden({ timeout: 40000 });
  await expect(page.getByRole("heading", { level: 1, name: "New profile", exact: true })).toBeVisible();
});

test("mobile menu traps keyboard focus and Escape returns focus with reduced motion", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/library");
  const open = page.getByRole("button", { name: "Open menu", exact: true });
  await open.focus();
  await page.keyboard.press("Enter");
  const menu = page.getByRole("dialog", { name: "Menu", exact: true });
  await expect(menu).toBeVisible();
  for (let i = 0; i < 15; i++) {
    await page.keyboard.press("Tab");
    await expect.poll(() => menu.evaluate((element) => element.contains(document.activeElement))).toBe(true);
  }
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
  await expect(open).toBeFocused();
});
