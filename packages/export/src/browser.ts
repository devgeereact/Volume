// One shared headless Chromium (Playwright) for PDF, cover and preview work.
import { chromium, type Browser } from 'playwright';

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
