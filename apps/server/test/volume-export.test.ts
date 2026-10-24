import { fileURLToPath } from 'node:url';
import { inspectPdf } from '@volume/export';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { copyrightLines, toBookDoc, VolumeExportAdapter } from '../src/adapters/volume-export.js';
import { readZip } from '../src/lib/zip.js';
import type { ExportBook, ExportFile } from '../src/ports/export.js';
import { buildCovers, HOST, testApp, type TestApp } from './helpers.js';

/** The em dash the house style forbids, built from its code point so this file stays clean. */
const EM_DASH = String.fromCharCode(0x2014);

// Real files from @volume/export: one Chromium is shared by the whole file and released in afterAll.

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const NOW = new Date(Date.UTC(2026, 9, 5, 12));
const BIO = 'Sam Rowe has grown herbs on rented windowsills in Sheffield and Leeds since 2020. She writes plain, practical books.';

/** Lists the entries of a zip from its central directory (no extra package needed). */
function zipEntries(zip: Uint8Array): string[] {
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  let eocd = -1;
  for (let i = zip.length - 22; i >= Math.max(0, zip.length - 65_557); i -= 1) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('Not a zip file.');
  const count = view.getUint16(eocd + 10, true);
  let p = view.getUint32(eocd + 16, true);
  const names: string[] = [];
  for (let n = 0; n < count; n += 1) {
    if (view.getUint32(p, true) !== 0x02014b50) throw new Error('Bad central directory.');
    const nameLen = view.getUint16(p + 28, true);
    const extraLen = view.getUint16(p + 30, true);
    const commentLen = view.getUint16(p + 32, true);
    names.push(new TextDecoder().decode(zip.subarray(p + 46, p + 46 + nameLen)));
    p += 46 + nameLen + extraLen + commentLen;
  }
  return names;
}

function para(n: number, topic: string): string {
  return Array.from(
    { length: n },
    (_, i) => `This is paragraph ${i + 1} about ${topic}. It keeps to plain British English and gives the reader one clear step to take at the window.`,
  ).join('\n\n');
}

function sampleBook(over: Partial<ExportBook> = {}): ExportBook {
  const s = (id: string, kind: string, area: string, position: number, title: string | null, bodyMd: string, number: number | null = null) => ({
    id,
    kind,
    area,
    position,
    number,
    title,
    bodyMd,
    wordCount: bodyMd.split(/\s+/).filter(Boolean).length,
  });
  return {
    projectId: '01TESTBOOK0000000000000000',
    title: 'Windowsill Herbs',
    subtitle: 'Grow Fresh Herbs in a Small UK Home',
    author: { penName: 'Sam Rowe', imprintName: null, bioThirdPerson: BIO, shortBio: 'Sam Rowe grows herbs on windowsills.' },
    language: 'en-GB',
    trim: '6x9',
    paper: 'cream',
    edition: null,
    publicationYear: 2026,
    isbnPaperback: null,
    isbnEbook: null,
    bookTypeId: null,
    interiorThemeId: 'romance-elegant',
    coverStyleId: null,
    aiDisclosure: { text: 'ai_generated', images: 'none', translation: 'none' },
    illustrativeLine: true,
    sections: [
      s('t', 'title_page', 'front', 1000, 'Title page', ''),
      s('c', 'copyright', 'front', 2000, 'Copyright', ''),
      s('o', 'contents', 'front', 3000, 'Contents', ''),
      s('i', 'introduction', 'front', 4000, 'Introduction', `# Introduction\n\n${para(4, 'why herbs fail')}`),
      s(
        'c1',
        'chapter',
        'body',
        5000,
        'Read Your Windows',
        `## North and South\n\n${para(6, 'light')}\n\n::: takeaways\n- Check the light first.\n- Move pots slowly.\n:::`,
        1,
      ),
      s('k', 'conclusion', 'back', 6000, 'Conclusion', para(3, 'what to do next')),
      s('a', 'about_author', 'back', 7000, 'About the author', `# About the author\n\n${BIO}`),
    ],
    manuscriptHash: 'hash-1',
    templateId: 'nonfiction',
    sectionsOff: ['dedication', 'acknowledgements'],
    summary: 'A short guide to growing herbs on a windowsill.',
    listing: {
      description: 'Grow fresh herbs on the windowsill you already have.',
      keywords: ['windowsill herbs', 'indoor herbs uk', 'small space garden', 'herbs for beginners', 'kitchen herbs', 'container herbs', 'north window plants'],
      categories: ['Gardening > Herbs', 'Gardening > Container', 'Gardening > Indoor'],
      backBlurb: 'Fresh herbs, even on a north-facing sill.',
    },
    claims: [
      {
        chapter: 'Chapter 1: Read Your Windows',
        sentence: 'Basil needs six hours of sun.',
        category: 'other_fact',
        check: 'Check a horticultural source.',
        status: 'open',
        needsCheck: true,
      },
    ],
    ...over,
  };
}

const exporter = new VolumeExportAdapter({ root: ROOT, now: () => NOW });

afterAll(async () => {
  await exporter.close();
});

describe('mapping the server book to a BookDoc', () => {
  it('keeps order, numbers chapters, fills the code-written pages and copies the bio word for word', () => {
    const doc = toBookDoc(sampleBook(), undefined);
    expect(doc.sections.map((s) => s.subtype)).toEqual(['titlepage', 'copyright', 'contents', 'introduction', 'chapter', 'conclusion', 'about_the_author']);
    const chapter = doc.sections[4]!;
    expect(chapter).toMatchObject({ kind: 'chapter', number: 1, kicker: 'Chapter 1', title: 'Read Your Windows' });
    expect(chapter.blocks.some((b) => b.type === 'takeaways')).toBe(true);
    expect(doc.sections[3]!.blocks[0]).toMatchObject({ type: 'paragraph' }); // the "# Introduction" line became the heading, not text
    expect(doc.sections[0]!.lines).toEqual(['Windowsill Herbs', 'Grow Fresh Herbs in a Small UK Home', 'Sam Rowe']);
    const about = doc.sections[6]!;
    expect(about.blocks).toEqual([{ type: 'paragraph', text: BIO }]);
    expect(doc.meta).toMatchObject({ title: 'Windowsill Herbs', author: 'Sam Rowe', year: 2026, identifier: '01TESTBOOK0000000000000000' });
    expect(doc.meta.listing?.description).toBe('<p>Grow fresh herbs on the windowsill you already have.</p>');
  });

  it('builds the copyright page from the template, with owner ISBNs only', async () => {
    const { loadBookTemplate } = await import('@volume/core/node');
    const template = loadBookTemplate('nonfiction', ROOT);
    const lines = copyrightLines(sampleBook({ isbnPaperback: '9780306406157', edition: 'First edition 2026' }), template);
    expect(lines[0]).toBe('Copyright © 2026 Sam Rowe. All rights reserved.');
    expect(lines.some((l) => l.startsWith('The stories in this book are illustrative.'))).toBe(true);
    expect(lines).toContain('First edition 2026');
    expect(lines).toContain('ISBN (paperback): 9780306406157');
    expect(lines.join('\n')).not.toMatch(/\{[a-zA-Z_]/);
    expect(copyrightLines(sampleBook({ illustrativeLine: false }), template).some((l) => l.includes('illustrative'))).toBe(false);
  });
});

describe('VolumeExportAdapter files', () => {
  it('includes the saved author photo in EPUB and DOCX while preserving the bio', async () => {
    const photo = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64');
    const withPhoto = sampleBook({ authorPhoto: { mime: 'image/png', data: photo } });
    const epub = readZip(Buffer.from((await exporter.buildEpub(withPhoto)).data));
    expect(epub.some((entry) => entry.name.startsWith('OEBPS/images/') && Buffer.from(entry.data).equals(photo))).toBe(true);
    const text = epub
      .filter((entry) => entry.name.endsWith('.xhtml'))
      .map((entry) => Buffer.from(entry.data).toString())
      .join(' ');
    expect(text).toContain(BIO);
    const docx = readZip(Buffer.from((await exporter.buildDocx(withPhoto)).data));
    expect(docx.some((entry) => entry.name.startsWith('word/media/') && Buffer.from(entry.data).equals(photo))).toBe(true);
    const markdown = Buffer.from((await exporter.buildMd(withPhoto)).data).toString();
    expect(markdown).toContain(BIO);
    expect(markdown).not.toContain('data:image');
  });

  const files: Record<string, ExportFile> = {};
  let book: ExportBook;

  beforeAll(async () => {
    book = sampleBook();
    files['txt'] = await exporter.buildTxt(book);
    files['md'] = await exporter.buildMd(book);
    files['docx'] = await exporter.buildDocx(book);
    files['epub'] = await exporter.buildEpub(book);
    files['pdf'] = await exporter.buildPdf(book);
    files['cover'] = await exporter.buildEbookCover({ book, artwork: null, typography: {}, coverStyleId: null });
    files['wrap'] = await exporter.buildWrapCover({
      book,
      artwork: null,
      typography: {},
      coverStyleId: null,
      pageCount: files['pdf'].pageCount ?? 24,
      backBlurb: 'Fresh herbs, even on a north-facing sill.',
    });
  }, 60_000);

  it('builds every format with real content', () => {
    const text = (f: ExportFile) => new TextDecoder().decode(f.data);
    expect(text(files['txt']!)).toContain('Read Your Windows');
    expect(text(files['txt']!).replace(/\s+/g, ' ')).toContain(BIO); // TXT wraps at 80 columns
    expect(text(files['md']!)).toContain('# Chapter 1: Read Your Windows');
    const magic = (f: ExportFile) => Array.from(f.data.subarray(0, 4));
    expect(magic(files['docx']!)).toEqual([0x50, 0x4b, 0x03, 0x04]);
    expect(magic(files['epub']!)).toEqual([0x50, 0x4b, 0x03, 0x04]);
    expect(zipEntries(files['epub']!.data)[0]).toBe('mimetype');
    expect(text(files['pdf']!).startsWith('%PDF')).toBe(true);
    expect(files['pdf']!.pageCount).toBeGreaterThan(4);
    expect(magic(files['cover']!).slice(0, 2)).toEqual([0xff, 0xd8]);
    expect(text(files['wrap']!).startsWith('%PDF')).toBe(true);
    for (const f of Object.values(files)) expect(f.mock).toBe(false);
    expect(files['pdf']!.filename).toBe('windowsill-herbs-interior-6x9.pdf');
    expect(files['pdf']!.role).toBe('interior_pdf');
  });

  it('prints the PDF in the book’s interior theme fonts, all embedded', async () => {
    const info = await inspectPdf(Buffer.from(files['pdf']!.data));
    const names = info.fonts.map((f) => f.name.replace(/^[A-Z]{6}\+/, ''));
    // romance-elegant: Lora body, Playfair Display headings (config/interior-themes.json).
    expect(names.some((n) => /Lora/i.test(n))).toBe(true);
    expect(names.some((n) => /Playfair/i.test(n))).toBe(true);
    expect(info.fonts.every((f) => f.embedded && !f.type3)).toBe(true);
    expect(exporter.theme(book).id).toBe('romance-elegant');
  });

  it('falls back to the default theme for an unknown id', () => {
    expect(exporter.theme(sampleBook({ interiorThemeId: 'no-such-theme' })).id).not.toBe('no-such-theme');
  });

  it('runs preflight with the KDP rules and house style', async () => {
    const report = await exporter.preflight(book);
    expect(report.mock).toBe(false);
    expect(report.rulesVersion).toBeTruthy();
    const byId = new Map(report.items.map((i) => [i.id, i]));
    expect(byId.get('honesty.about-author')?.severity).toBe('pass');
    expect(byId.get('style.house')?.severity).toBe('pass');
    expect(byId.get('front.copyright-year')?.severity).toBe('pass');
    expect(byId.get('structure.sections')?.severity).toBe('pass');
    expect(byId.get('claims.open')?.severity).toBe('warn');
    expect(report.blocks).toBe(report.items.filter((i) => i.severity === 'block').length);

    const bad = await exporter.preflight(
      sampleBook({ sections: book.sections.map((s) => (s.kind === 'conclusion' ? { ...s, bodyMd: `It was good ${EM_DASH} really.` } : s)) }),
    );
    expect(bad.items.find((i) => i.id === 'style.house')?.severity).toBe('block');
    expect(bad.ok).toBe(false);
  });

  it('passes an owner-entered ISBN on the copyright page and still blocks any other ISBN', async () => {
    // No server workaround any more: @volume/export allow-lists the book's own ISBNs.
    const own = await exporter.preflight(sampleBook({ isbnPaperback: '978-0-306-40615-7' }));
    expect(own.items.find((i) => i.id === 'style.invented-content')?.severity).toBe('pass');
    const ownCopyright = sampleBook({
      isbnEbook: '9780306406157',
      sections: book.sections.map((x) => (x.kind === 'copyright' ? { ...x, bodyMd: 'Copyright 2026 Sam Rowe.\n\nISBN: 978-0-306-40615-7' } : x)),
    });
    expect((await exporter.preflight(ownCopyright)).items.find((i) => i.id === 'style.invented-content')?.severity).toBe('pass');
    const other = sampleBook({
      isbnPaperback: '978-0-306-40615-7',
      sections: book.sections.map((x) => (x.kind === 'conclusion' ? { ...x, bodyMd: 'Order the workbook, ISBN 978-1-4028-9462-6.' } : x)),
    });
    expect((await exporter.preflight(other)).items.find((i) => i.id === 'style.invented-content')?.severity).toBe('block');
  });

  it('puts the eBook cover JPEG into the EPUB', async () => {
    const epub = await exporter.buildEpub(book, { coverJpeg: files['cover']!.data });
    expect(zipEntries(epub.data)).toContain('OEBPS/images/cover.jpg');
    expect(zipEntries(files['epub']!.data)).not.toContain('OEBPS/images/cover.jpg');
  });

  it('runs the final preflight on the built files with the real page count', async () => {
    const list = [files['pdf']!, files['md']!];
    const final = await exporter.finalPreflight(book, list);
    const pages = final.items.find((i) => i.id === 'interior.pages');
    expect(pages?.message).toContain(`${files['pdf']!.pageCount} pages`);
    // The short sample book is under the KDP minimum, so the gate blocks.
    expect(pages?.severity).toBe('block');
    expect(final.blocks).toBeGreaterThan(0);
  });

  it('zips the upload pack with the expected files', async () => {
    const pack = await exporter.buildPack(book, [files['pdf']!, files['docx']!, files['epub']!, files['txt']!, files['md']!, files['cover']!, files['wrap']!]);
    expect(pack.filename).toBe('windowsill-herbs-kdp-pack-2026-10-05.zip');
    expect(pack.mime).toBe('application/zip');
    const names = zipEntries(pack.data);
    for (const n of [
      'README.txt',
      'manuscript/windowsill-herbs-interior-6x9.pdf',
      'manuscript/windowsill-herbs.epub',
      'manuscript/windowsill-herbs.docx',
      'manuscript/windowsill-herbs.txt',
      'manuscript/windowsill-herbs.md',
      'cover/windowsill-herbs-ebook-cover.jpg',
      'listing/metadata.txt',
      'listing/description.html',
      'listing/ai-disclosure.txt',
      'reports/preflight.txt',
      'reports/preflight.html',
      'reports/claims-to-verify.csv',
      'reports/kdp-rules-used.txt',
    ]) {
      expect(names).toContain(n);
    }
    expect(names.some((n) => /^cover\/windowsill-herbs-paperback-wrap-6x9-cream-\d+p\.pdf$/.test(n))).toBe(true);
    // No marketing written yet: no marketing files at all, never a "Not written yet" placeholder.
    expect(names.filter((n) => n.startsWith('marketing/') && n.endsWith('.txt'))).toEqual([]);
  });

  it('puts only the marketing that exists into the pack', async () => {
    const withMarketing = { ...book, marketing: { tiktokScripts: '1. Hook\nThree calm herbs for a small window.\n' } };
    const pack = await exporter.buildPack(withMarketing, [files['pdf']!, files['md']!]);
    const names = zipEntries(pack.data).filter((n) => n.startsWith('marketing/') && n.endsWith('.txt'));
    expect(names).toEqual(['marketing/tiktok-scripts.txt']);
  });

  it('names every marketing post clearly, with a start-here index and the posts of a platform together', async () => {
    const post = (
      o: {
        kind: 'tiktok_script' | 'instagram_caption' | 'launch_email';
        title: string | null;
        hook: string | null;
        body: string;
        cta: string | null;
      } & Partial<{ hashtags: string[]; durationS: number | null; subjectLines: string[]; imageIdea: string | null }>,
    ) => ({
      hashtags: [],
      durationS: null,
      subjectLines: [],
      imageIdea: null,
      ...o,
    });
    const items = [
      post({
        kind: 'tiktok_script',
        title: 'Three calm herbs',
        hook: 'Small window, big flavour.',
        body: 'Show the sill. Name three herbs.',
        cta: 'Follow for more.',
        hashtags: ['herbs', '#windowsill'],
        durationS: 30,
      }),
      post({ kind: 'tiktok_script', title: null, hook: 'Stop killing basil.', body: 'Water in the morning.', cta: null }),
      post({
        kind: 'instagram_caption',
        title: 'The sill',
        hook: null,
        body: 'A calm corner for herbs.',
        cta: 'Link in bio.',
        hashtags: ['herbs'],
        imageIdea: 'A sunny windowsill with three pots.',
      }),
      post({
        kind: 'launch_email',
        title: 'Your herbs start here',
        hook: null,
        body: 'The book is out today.',
        cta: 'Get your copy.',
        subjectLines: ['Your herbs start here', 'Three herbs, one window'],
      }),
    ];
    const pack = await exporter.buildPack({ ...book, marketing: { items } }, [files['pdf']!, files['md']!]);
    const names = zipEntries(pack.data).filter((n) => n.startsWith('marketing/'));
    expect(names).toEqual(
      expect.arrayContaining([
        'marketing/00-START-HERE.txt',
        'marketing/tiktok/tiktok-01-three-calm-herbs.txt',
        'marketing/tiktok/tiktok-02-stop-killing-basil.txt',
        'marketing/tiktok/all-tiktok-scripts.txt',
        'marketing/instagram/instagram-01-the-sill.txt',
        'marketing/instagram/all-instagram-captions.txt',
        'marketing/email/launch-email-01-your-herbs-start-here.txt',
        'marketing/email/all-launch-emails.txt',
      ]),
    );
    const entries = readZip(Buffer.from(pack.data));
    const read = (n: string): string => Buffer.from(entries.find((e) => e.name === n)!.data).toString('utf8');
    const index = read('marketing/00-START-HERE.txt');
    expect(index).toContain('2 TikTok scripts');
    expect(index).toContain('tiktok/tiktok-01-three-calm-herbs.txt');
    const first = read('marketing/tiktok/tiktok-01-three-calm-herbs.txt');
    expect(first).toContain('TikTok script 1 of 2');
    expect(first).toContain('Hook (say or show this in the first three seconds):\nSmall window, big flavour.');
    expect(first).toContain('#herbs #windowsill');
    expect(first).toContain('Length: about 30 seconds');
    expect(read('marketing/instagram/instagram-01-the-sill.txt')).toContain('What the picture should show:\nA sunny windowsill with three pots.');
    expect(read('marketing/email/launch-email-01-your-herbs-start-here.txt')).toContain('Other subject lines to try:\n- Three herbs, one window');
    expect(read('marketing/email/launch-email-01-your-herbs-start-here.txt')).toContain('Subject: Your herbs start here');
  });
});

describe('the export job with the real exporter', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await testApp({ exporter });
  });
  afterAll(async () => {
    await t.close(); // also releases the exporter's browser (onClose); close() is safe to call twice
  });

  /** A mock-written book through the API; `long` pads the chapter so the interior passes KDP's page minimum. */
  async function writtenBook(title: string, long: boolean): Promise<string> {
    const p = await t.call<{ id: string }>('POST', '/api/v1/profiles', { penName: 'Test Author', bioThirdPerson: 'Test Author writes plain books.' });
    const b = await t.call<{ id: string }>('POST', '/api/v1/books', {
      profileId: p.body.id,
      idea: 'Calm mornings',
      title,
      settings: { acknowledgements: 'Sam' },
    });
    const bookId = b.body.id;
    await t.call('POST', `/api/v1/books/${bookId}/blueprints`, { chapterCount: 1 });
    await t.services.runner.runUntilIdle();
    expect((await t.call('POST', `/api/v1/books/${bookId}/blueprint/approve`, {})).status).toBe(200);
    await t.call('POST', `/api/v1/books/${bookId}/write`, {});
    await t.services.runner.runUntilIdle();
    if (long) {
      const tree = await t.call<{ body: { id: string; kind: string }[] }>('GET', `/api/v1/books/${bookId}/sections`);
      const chapter = tree.body.body.find((x) => x.kind === 'chapter')!;
      const saved = await t.call('POST', `/api/v1/sections/${chapter.id}/versions`, { bodyMd: `# Calm Mornings\n\n${para(260, 'calm mornings')}` });
      expect(saved.status).toBe(201);
    }
    return bookId;
  }

  it('stops the pack with a plain reason when the final preflight blocks, keeping the built files', async () => {
    const bookId = await writtenBook('Short Mornings', false);
    const job = await t.call<{ jobId: string }>('POST', `/api/v1/books/${bookId}/exports`, { kinds: ['pdf_print', 'md'] });
    await t.services.runner.runUntilIdle();
    const done = await t.call<{ status: string; error: string | null; errorCode: string | null; result: { exports: string[] } }>(
      'GET',
      `/api/v1/jobs/${job.body.jobId}`,
    );
    expect(done.body).toMatchObject({ status: 'failed', errorCode: 'preflight_blocked' });
    expect(done.body.error).toMatch(/upload pack was not built/i);
    expect(done.body.error).toMatch(/page count/i);
    expect(done.body.result.exports).toHaveLength(2);
    const exps = await t.call<{ items: { kind: string; status: string; error: string | null; preflight: { blocks: number } }[] }>(
      'GET',
      `/api/v1/books/${bookId}/exports`,
    );
    const byKind = Object.fromEntries(exps.body.items.map((e) => [e.kind, e]));
    expect(byKind['pdf_print']?.status).toBe('done');
    expect(byKind['md']?.status).toBe('done');
    expect(byKind['pack']).toMatchObject({ status: 'failed' });
    expect(byKind['pack']?.preflight.blocks).toBeGreaterThan(0);
  }, 60_000);

  it('writes a mock book through the API and builds a real pack', async () => {
    const bookId = await writtenBook('Calm Mornings', true);

    const pre = await t.call<{ ok: boolean; mock: boolean; items: { id: string; severity: string; message: string }[] }>(
      'GET',
      `/api/v1/books/${bookId}/preflight`,
    );
    expect(pre.body.mock).toBe(false);
    // With no covers yet the pack is blocked (cover.files), and nothing else blocks.
    expect(pre.body.items.filter((i) => i.severity === 'block').map((i) => i.id)).toEqual(['cover.files']);
    await buildCovers(t, bookId);
    const ready = await t.call<{ items: { id: string; severity: string }[] }>('GET', `/api/v1/books/${bookId}/preflight`);
    expect(ready.body.items.filter((i) => i.severity === 'block')).toEqual([]);

    const job = await t.call<{ jobId: string }>('POST', `/api/v1/books/${bookId}/exports`, { kinds: ['pdf_print', 'md'] });
    await t.services.runner.runUntilIdle();
    const done = await t.call<{ status: string; error: string | null }>('GET', `/api/v1/jobs/${job.body.jobId}`);
    expect(done.body).toMatchObject({ status: 'succeeded' });
    const exps = await t.call<{ items: { id: string; kind: string; mock: boolean }[] }>('GET', `/api/v1/books/${bookId}/exports`);
    expect(exps.body.items.map((e) => e.kind).sort()).toEqual(['md', 'pack', 'pdf_print']);
    expect(exps.body.items.every((e) => !e.mock)).toBe(true);
    const packId = exps.body.items.find((e) => e.kind === 'pack')!.id;
    const dl = await t.app.inject({ method: 'GET', url: `/api/v1/exports/${packId}/download`, headers: { host: HOST } });
    expect(dl.statusCode).toBe(200);
    const names = zipEntries(dl.rawPayload);
    expect(names).toContain('manuscript/calm-mornings-interior-6x9.pdf');
    expect(names).toContain('manuscript/calm-mornings.md');
    expect(names).toContain('reports/preflight.txt');
    expect(names.some((n) => /^cover\/.*ebook-cover\.jpg$/i.test(n))).toBe(true);
  }, 60_000);
  it('previews a cover as the same HTML the build renders', async () => {
    const bookId = await writtenBook('Calm Mornings Preview', true);
    await buildCovers(t, bookId);
    const ebook = await t.call<{ html: string; widthPx: number; heightPx: number }>('POST', `/api/v1/books/${bookId}/cover/preview`, { kind: 'ebook' });
    expect(ebook.status).toBe(200);
    expect(ebook.body.widthPx).toBe(1600);
    expect(ebook.body.heightPx).toBe(2560);
    expect(ebook.body.html).toContain('Calm Mornings Preview');
    expect(ebook.body.html).toContain('data-fit');
    // The owner's settings change the page, without being saved.
    const bigger = await t.call<{ html: string }>('POST', `/api/v1/books/${bookId}/cover/preview`, {
      kind: 'ebook',
      typography: { styleId: 'bold-condensed', paletteId: 'blueprint' },
    });
    expect(bigger.body.html).not.toBe(ebook.body.html);
    expect(bigger.body.html).toContain('Big Shoulders Display');
    const wrap = await t.call<{ html: string; widthPx: number }>('POST', `/api/v1/books/${bookId}/cover/preview`, { kind: 'wrap', pages: 120 });
    expect(wrap.body.html).toContain('frontpanel');
    expect(wrap.body.widthPx).toBeGreaterThan(1100);
  }, 60_000);
});
