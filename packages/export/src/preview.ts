// Render PDF pages to PNG with pdf.js inside Chromium (no native canvas needed in Node).
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import type { Browser } from 'playwright';
import { withBrowser } from './browser.ts';

const require = createRequire(import.meta.url);
const ORIGIN = 'http://volume-preview.local';

function pdfjsFile(name: string): Buffer {
  // pdfjs-dist exposes build/pdf.mjs; the legacy build sits beside it.
  const main = require.resolve('pdfjs-dist/build/pdf.mjs');
  return readFileSync(path.join(path.dirname(main), name));
}

export interface RenderPagesOptions {
  /** Pixels per point. 1.5 gives 108 DPI. Default 1.5. */
  scale?: number;
  browser?: Browser;
}

/** PNG bytes for each requested 1-based page. */
export async function renderPdfPages(pdf: Buffer, pages: number[], opts: RenderPagesOptions = {}): Promise<Buffer[]> {
  const scale = opts.scale ?? 1.5;
  return withBrowser(opts.browser, async (browser) => {
    const ctx = await browser.newContext();
    try {
      await ctx.route(`${ORIGIN}/**`, async (route) => {
        const url = new URL(route.request().url());
        if (url.pathname === '/') return route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><body></body></html>' });
        if (url.pathname === '/pdf.mjs') return route.fulfill({ contentType: 'text/javascript', body: pdfjsFile('pdf.mjs') });
        if (url.pathname === '/pdf.worker.mjs') return route.fulfill({ contentType: 'text/javascript', body: pdfjsFile('pdf.worker.mjs') });
        if (url.pathname === '/doc.pdf') return route.fulfill({ contentType: 'application/pdf', body: pdf });
        return route.fulfill({ status: 404, body: '' });
      });
      const page = await ctx.newPage();
      await page.goto(`${ORIGIN}/`);
      const script = `(async () => {
        const lib = await import('${ORIGIN}/pdf.mjs');
        lib.GlobalWorkerOptions.workerSrc = '${ORIGIN}/pdf.worker.mjs';
        const doc = await lib.getDocument({ url: '${ORIGIN}/doc.pdf' }).promise;
        const out = [];
        for (const n of ${JSON.stringify(pages)}) {
          const p = await doc.getPage(n);
          const vp = p.getViewport({ scale: ${scale} });
          const canvas = document.createElement('canvas');
          canvas.width = Math.round(vp.width); canvas.height = Math.round(vp.height);
          const c = canvas.getContext('2d');
          c.fillStyle = '#ffffff'; c.fillRect(0, 0, canvas.width, canvas.height);
          await p.render({ canvasContext: c, canvas, viewport: vp }).promise;
          out.push(canvas.toDataURL('image/png').split(',')[1]);
        }
        return out;
      })()`;
      const b64 = await page.evaluate<string[]>(script);
      return b64.map((s) => Buffer.from(s, 'base64'));
    } finally {
      await ctx.close();
    }
  });
}
