import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { loadKdpRules } from '@volume/core/node';
import { buildUploadPack, findPages, PAGES_CONVERT_SCRIPT, PAGES_README_HINT, type PackFiles } from '../src/index.ts';
import { loadMiniBook } from './helpers.ts';

// Apple Pages copy of the manuscript in the upload pack (packages/export/src/pages.ts, Task 5 of the clean production plan).
async function pack(files: PackFiles): Promise<{ names: string[]; readme: string; zip: JSZip }> {
  const { zip } = await buildUploadPack({
    book: loadMiniBook(),
    files,
    trim: '6x9',
    paper: 'white',
    rules: loadKdpRules(),
    ai: { aiWroteText: true, aiMadeImages: false },
    date: new Date('2026-10-21T00:00:00Z'),
  });
  const z = await JSZip.loadAsync(zip);
  return { names: Object.keys(z.files), readme: (await z.file('README.txt')?.async('string')) ?? '', zip: z };
}

describe('upload pack: Apple Pages copy', () => {
  it('writes manuscript/<slug>.pages and names it in the README', async () => {
    const pagesBytes = Buffer.from('PK pages stand-in');
    const { names, readme, zip } = await pack({ docx: Buffer.from('docx'), pages: pagesBytes });
    expect(names).toContain('manuscript/windowsill-herbs.pages');
    expect(await zip.file('manuscript/windowsill-herbs.pages')?.async('nodebuffer')).toEqual(pagesBytes);
    expect(readme).toContain('Apple Pages: manuscript/windowsill-herbs.pages is the DOCX manuscript as a Pages document');
    expect(readme).not.toContain(PAGES_README_HINT);
  });

  it('without a Pages copy, tells the reader how to make one', async () => {
    const { names, readme } = await pack({ docx: Buffer.from('docx') });
    expect(names.some((n) => n.endsWith('.pages'))).toBe(false);
    expect(readme).toContain('Using Apple Pages? Open the DOCX in Pages, or run npm run pages on a Mac.\n');
  });

  it('gives no Pages hint when there is no DOCX to open', async () => {
    const { readme } = await pack({});
    expect(readme).not.toContain('Apple Pages');
  });
});

describe('Pages conversion guard', () => {
  it('refuses plainly off a Mac', async () => {
    expect(await findPages({ platform: 'linux' })).toEqual({ ok: false, reason: 'Apple Pages runs only on macOS; this computer is linux.' });
  });

  it.skipIf(process.platform !== 'darwin')('refuses plainly when the app is not installed', async () => {
    const r = await findPages({ bundleId: 'com.example.volume-no-such-app' });
    expect(r).toEqual({ ok: false, reason: 'Apple Pages (com.example.volume-no-such-app) is not installed on this Mac.' });
  });

  it('closes only the document it opened and never quits Pages', () => {
    expect(PAGES_CONVERT_SCRIPT).toContain('close d saving no');
    expect(PAGES_CONVERT_SCRIPT).not.toMatch(/\bquit\b/i);
    // Paths come in as arguments, never pasted into the script.
    expect(PAGES_CONVERT_SCRIPT).toContain('on run argv');
  });
});
