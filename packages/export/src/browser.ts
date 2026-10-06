// One shared headless Chromium (Playwright) for PDF, cover and preview work.
import { chromium, type Browser } from 'playwright';

let shared: Browser | undefined;
let users = 0;

/** Launch (or reuse) the shared browser. Call releaseBrowser() when done. */
export async function acquireBrowser(): Promise<Browser> {
  users++;
  if (!shared || !shared.isConnected()) shared = await chromium.launch({ headless: true });
  return shared;
}

export async function releaseBrowser(): Promise<void> {
  users = Math.max(0, users - 1);
  if (users === 0 && shared) {
    const b = shared;
    shared = undefined;
    await b.close();
  }
}

/** Run fn with a browser: the caller's own one when given, otherwise the shared one. */
export async function withBrowser<T>(given: Browser | undefined, fn: (b: Browser) => Promise<T>): Promise<T> {
  if (given) return fn(given);
  const b = await acquireBrowser();
  try {
    return await fn(b);
  } finally {
    await releaseBrowser();
  }
}
