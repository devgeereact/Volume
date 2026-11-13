// One shared headless Chromium (Playwright) for PDF, cover and preview work.
import { chromium, type Browser, type BrowserContext, type BrowserContextOptions, type Page } from 'playwright';

let shared: Browser | undefined;
let users = 0;

/**
 * Launch flags that keep layout the same on every platform. Headless Chromium on Linux defaults to full font hinting,
 * which rounds glyph advances, so the same book wrapped lines and pages differently from macOS (where the flag is
 * ignored and glyphs are never hinted). With hinting off, Linux uses the unhinted advances macOS uses.
 */
export const BROWSER_ARGS: readonly string[] = ['--font-render-hinting=none'];

/**
 * Environment for the launched browser. CHROMIUM_LD_LIBRARY_PATH names a folder of extra shared libraries that a host
 * lacks (on the cPanel host: libatspi.so.0 and libatk-bridge-2.0.so.0); it is put in front of LD_LIBRARY_PATH for
 * Chromium only. PLAYWRIGHT_BROWSERS_PATH, read by Playwright itself, says where the browser is installed.
 */
export function browserEnv(env: NodeJS.ProcessEnv = process.env): Record<string, string> | undefined {
  const extra = env['CHROMIUM_LD_LIBRARY_PATH']?.trim();
  if (!extra) return undefined;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(env)) if (typeof v === 'string') out[k] = v;
  const current = env['LD_LIBRARY_PATH']?.trim();
  out['LD_LIBRARY_PATH'] = current ? `${extra}:${current}` : extra;
  return out;
}

/** Launch (or reuse) the shared browser. Call releaseBrowser() when done. */
export async function acquireBrowser(): Promise<Browser> {
  users++;
  if (!shared || !shared.isConnected()) {
    const env = browserEnv();
    shared = await chromium.launch({ headless: true, args: [...BROWSER_ARGS], ...(env ? { env } : {}) });
  }
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

/**
 * A browser context for export work that can reach nothing outside the page. Every export page is built from data:
 * URLs (fonts, images, ornaments), so any request at all is refused: text from a book, an import or a model can never
 * make the host's Chromium load an internal or outside address. Routes added later on the context (the page preview's
 * own origin) take precedence over this one.
 */
export async function newIsolatedContext(browser: Browser, options: BrowserContextOptions = {}): Promise<BrowserContext> {
  const ctx = await browser.newContext({ ...options, serviceWorkers: 'block' });
  await ctx.route('**/*', (route) => route.abort('blockedbyclient'));
  return ctx;
}

/** The browser's own message when it could not take a screenshot (Chrome DevTools Protocol, before any pixels exist). */
const CAPTURE_FAILURE = /Unable to capture screenshot/i;

/**
 * Takes a screenshot, trying again when the browser itself could not capture one. On a loaded Linux runner, heavy
 * cover pages (blur, blend, texture) sometimes fail with "Protocol error (Page.captureScreenshot): Unable to capture
 * screenshot" and succeed when repeated; CI failed four times that way between 8 and 9 November 2026. Only that
 * failure is retried. Any other error is thrown at once, so a real fault in the page or the options is not hidden.
 */
export async function screenshotWithRetry(
  page: Pick<Page, 'screenshot'>,
  options: Parameters<Page['screenshot']>[0],
  { attempts = 3, delayMs = 250 }: { attempts?: number; delayMs?: number } = {},
): Promise<Buffer> {
  let last: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await page.screenshot(options);
    } catch (e) {
      last = e;
      if (!(e instanceof Error) || !CAPTURE_FAILURE.test(e.message) || attempt === attempts) throw e;
      if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs * attempt));
    }
  }
  throw last;
}
