import { describe, expect, it } from 'vitest';
import { screenshotWithRetry } from '../src/browser.js';

// CI failed four times between 8 and 9 November 2026 with "page.screenshot: Protocol error (Page.captureScreenshot):
// Unable to capture screenshot" on heavy cover pages (blur, blend, texture) on loaded Linux runners, and each run
// passed when repeated. The browser fails before any pixels exist, so one more attempt is safe. Anything else (a real
// error in the page or the arguments) must not be retried and hidden.

const PROTOCOL_FAILURE = 'page.screenshot: Protocol error (Page.captureScreenshot): Unable to capture screenshot';
const png = Buffer.from('png');
const clip = { x: 0, y: 0, width: 10, height: 10 };

/** A page whose screenshot answers the given results in order: a Buffer succeeds, an Error is thrown. */
function pageThatAnswers(...results: (Buffer | Error)[]) {
  let calls = 0;
  return {
    get calls() {
      return calls;
    },
    screenshot: () => {
      const next = results[Math.min(calls, results.length - 1)]!;
      calls++;
      return next instanceof Error ? Promise.reject(next) : Promise.resolve(next);
    },
  };
}

describe('screenshotWithRetry', () => {
  it('returns the screenshot of a page that works, with one call', async () => {
    const page = pageThatAnswers(png);
    expect(await screenshotWithRetry(page, { type: 'png', clip }, { delayMs: 0 })).toBe(png);
    expect(page.calls).toBe(1);
  });

  it('tries again after the browser could not capture the screenshot, and returns the second result', async () => {
    const page = pageThatAnswers(new Error(PROTOCOL_FAILURE), png);
    expect(await screenshotWithRetry(page, { type: 'png', clip }, { delayMs: 0 })).toBe(png);
    expect(page.calls).toBe(2);
  });

  it('does not retry any other error, so a real fault is not hidden', async () => {
    const page = pageThatAnswers(new Error('page.screenshot: Target page, context or browser has been closed'), png);
    await expect(screenshotWithRetry(page, { type: 'png', clip }, { delayMs: 0 })).rejects.toThrow(/has been closed/);
    expect(page.calls).toBe(1);
  });

  it('gives up after three attempts and reports the browser error', async () => {
    const page = pageThatAnswers(new Error(PROTOCOL_FAILURE));
    await expect(screenshotWithRetry(page, { type: 'png', clip }, { delayMs: 0 })).rejects.toThrow(/Unable to capture screenshot/);
    expect(page.calls).toBe(3);
  });

  it('passes the screenshot options through unchanged', async () => {
    const seen: unknown[] = [];
    const page = {
      screenshot: (options: unknown) => {
        seen.push(options);
        return Promise.resolve(png);
      },
    };
    await screenshotWithRetry(page, { type: 'png', clip }, { delayMs: 0 });
    expect(seen).toEqual([{ type: 'png', clip }]);
  });
});
