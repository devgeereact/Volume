// Book text is untrusted (editors, imports, AI output). The export Chromium must never run markup taken from it, and
// must never reach the network: every export page is built from data: URLs only (audit, 1 November 2026).
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { readFileSync } from 'node:fs';
import type { Browser } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DEFAULT_INTERIOR_THEME, parseManuscript } from '@volume/core';
import { acquireBrowser, exportPrintPdf, imageSrc, newIsolatedContext, releaseBrowser } from '../src/index.ts';
import { fixture } from './helpers.ts';

const PNG_1PX = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

let browser: Browser;
let server: Server;
let hits: string[];
let base: string;

beforeAll(async () => {
  browser = await acquireBrowser();
  hits = [];
  server = createServer((req, res) => {
    hits.push(req.url ?? '');
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end('<p>internal</p>');
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await releaseBrowser();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe('imageSrc', () => {
  it('keeps a base64 raster data URL', () => {
    expect(imageSrc(PNG_1PX, undefined)).toBe(PNG_1PX);
    expect(imageSrc('data:image/jpeg;base64,/9j/AA==', undefined)).toBe('data:image/jpeg;base64,/9j/AA==');
  });

  it('refuses data URLs that are not plain base64 images', () => {
    for (const bad of [
      'data:x"><iframe/src=http://127.0.0.1/></iframe><b"',
      'data:text/html;base64,PHNjcmlwdD4=',
      'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=',
      'data:image/png;base64,AAAA"onerror="alert(1)',
      'data:image/png,<svg>',
    ]) {
      expect(imageSrc(bad, undefined), bad).toBeUndefined();
    }
  });
});

describe('isolated export context', () => {
  it('blocks every network request but still shows data: images', async () => {
    const ctx = await newIsolatedContext(browser);
    try {
      const page = await ctx.newPage();
      await page.setContent(
        `<img id="ok" src="${PNG_1PX}"><img src="${base}/img"><iframe src="${base}/frame"></iframe><link rel="stylesheet" href="${base}/css">` +
          `<script>fetch('${base}/fetch').catch(() => {});</script>`,
        { waitUntil: 'load' },
      );
      await page.waitForTimeout(300);
      expect(await page.evaluate('document.getElementById("ok").naturalWidth')).toBe(1);
    } finally {
      await ctx.close();
    }
    expect(hits).toEqual([]);
  });
});

describe('print PDF with hostile book text', () => {
  it('neither injects markup from an image address nor reaches the network', async () => {
    const md = readFileSync(fixture('mini-book.md'), 'utf8').replace(
      '# Introduction\n',
      `# Introduction\n\n![x](data:x"><iframe/src=${base}/pdf-frame></iframe><img/src=${base}/pdf-img><b")\n\n![ok](${PNG_1PX})\n`,
    );
    const book = parseManuscript(md);
    const r = await exportPrintPdf(book, DEFAULT_INTERIOR_THEME, { browser, chapterStart: 'any', creationDate: new Date('2026-11-01T00:00:00Z') });
    expect(r.html).not.toContain('<iframe');
    expect(r.html).not.toContain(`${base}/pdf-img`);
    expect(r.html).toContain(`<img src="${PNG_1PX}"`);
    expect(r.warnings.some((w) => w.includes('has no data'))).toBe(true);
    expect(hits).toEqual([]);
  });
});
