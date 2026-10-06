// Export a manuscript (.md in the Volume dialect) to every format, for manual checks.
//
//   npx tsx packages/export/scripts/export-book.ts <manuscript.md> <out-folder> [options]
//
// Options:
//   --meta <file.json>     extra book meta (summary, listing description, keywords, categories, isbns)
//   --trim 6x9             trim size (5x8, 5.5x8.5, 6x9, 8.5x11)
//   --paper white|cream    paper for the wrap (default white)
//   --theme <id>           interior theme id from config/interior-themes.json (default: built-in)
//   --cover-style <id>     cover style id from config/cover-styles.json (default: built-in)
//   --any-page             chapters may open on any page (default: right-hand pages)
//   --render 1,3,7,8       PDF pages to render to PNG (default: title, contents, first chapter opener, next page)

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { DEFAULT_COVER_STYLE, DEFAULT_INTERIOR_THEME, marginsFor, parseManuscript, type BookDoc, type Paper } from '@volume/core';
import { findRepoRoot, loadBookTemplate, loadCoverStyles, loadHouseStyle, loadInteriorThemes, loadKdpRules } from '@volume/core/node';
import {
  acquireBrowser,
  buildUploadPack,
  exportDocx,
  exportEbookCover,
  exportEpub,
  exportMarkdown,
  exportPaperbackWrap,
  exportPrintPdf,
  exportTxt,
  preflightHtml,
  preflightText,
  releaseBrowser,
  renderPdfPages,
  runPreflight,
} from '../src/index.ts';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const [src, outDir] = process.argv.slice(2).filter((a, i, all) => !a.startsWith('--') && !(all[i - 1] ?? '').startsWith('--'));
if (!src || !outDir) {
  console.error(
    'Usage: tsx packages/export/scripts/export-book.ts <manuscript.md> <out-folder> [--meta f.json] [--trim 6x9] [--paper white] [--theme id] [--cover-style id] [--any-page]',
  );
  process.exit(2);
}
const root = findRepoRoot();
const trim = arg('trim') ?? '6x9';
const paper = (arg('paper') ?? 'white') as Paper;
const book: BookDoc = parseManuscript(readFileSync(src, 'utf8'));
const metaFile = arg('meta');
if (metaFile) Object.assign(book.meta, JSON.parse(readFileSync(metaFile, 'utf8')) as Partial<BookDoc['meta']>);
const themes = loadInteriorThemes(root);
const theme = themes.find((t) => t.id === arg('theme')) ?? DEFAULT_INTERIOR_THEME;
const coverStyle = loadCoverStyles(root).find((c) => c.id === arg('cover-style')) ?? DEFAULT_COVER_STYLE;
const rules = loadKdpRules(root);
const slug = path
  .basename(src)
  .replace(/\.md$/, '')
  .replace(/-manuscript$/, '');
mkdirSync(outDir, { recursive: true });
const out = (name: string, data: Buffer | string) => {
  writeFileSync(path.join(outDir, name), data);
  console.log(`wrote ${name} (${(Buffer.byteLength(data) / 1024).toFixed(0)} KB)`);
};

const browser = await acquireBrowser();
try {
  const t0 = Date.now();
  out(`${slug}.md`, exportMarkdown(book));
  out(`${slug}.txt`, exportTxt(book));
  out(`${slug}.docx`, await exportDocx(book, theme, { trim }));
  const pdf = await exportPrintPdf(book, theme, { trim, browser, ...(process.argv.includes('--any-page') ? { chapterStart: 'any' as const } : {}) });
  out(`${slug}-interior-${trim}.pdf`, pdf.buffer);
  console.log(`  ${pdf.pageCount} pages, ${pdf.widthPt} x ${pdf.heightPt} pt, blank pages ${pdf.blankPages.join(', ') || 'none'}`);
  for (const w of pdf.warnings) console.log(`  warning: ${w}`);
  const cover = await exportEbookCover(book.meta, coverStyle, { browser, rules });
  out(`${slug}-ebook-cover.jpg`, cover.jpeg);
  out(`${slug}.epub`, await exportEpub(book, theme, { coverJpeg: cover.jpeg }));
  const wrap = await exportPaperbackWrap(book.meta, coverStyle, {
    rules,
    pages: pdf.pageCount,
    paper,
    trim,
    browser,
    blurb:
      'Grow fresh herbs on the windowsill you already have. A short, practical guide to reading the light at each window, choosing pots that fit a narrow sill and watering without drowning the plants.',
    shortBio: `${book.meta.author} writes practical guides.`,
  });
  out(`${slug}-paperback-wrap-${trim}-${paper}-${pdf.pageCount}p.pdf`, wrap.pdf);
  console.log(
    `  wrap ${wrap.size.widthIn.toFixed(4)} x ${wrap.size.heightIn.toFixed(4)} in, spine ${wrap.size.spineIn.toFixed(4)} in, spine text ${wrap.spineText}`,
  );

  const opener = Object.values(pdf.sections).find((_s, i) => i === 1)?.page ?? 5;
  const contents = pdf.sections.contents?.page ?? 3;
  const want = (arg('render') ?? `1,${contents},${opener},${opener + 1}`).split(',').map(Number);
  const pngs = await renderPdfPages(pdf.buffer, want, { browser, scale: 1.5 });
  pngs.forEach((png, i) => out(`page-${String(want[i]).padStart(2, '0')}.png`, png));
  const wrapPng = await renderPdfPages(wrap.pdf, [1], { browser, scale: 0.6 });
  if (wrapPng[0]) out('wrap-preview.png', wrapPng[0]);

  const report = await runPreflight({
    book,
    rules,
    houseStyle: loadHouseStyle(root),
    template: loadBookTemplate('nonfiction', root),
    trim,
    paper,
    listing: {
      title: book.meta.title,
      ...(book.meta.subtitle ? { subtitle: book.meta.subtitle } : {}),
      ...(book.meta.listing?.description ? { description: book.meta.listing.description } : {}),
      keywords: book.meta.listing?.keywords ?? [],
      categories: book.meta.listing?.categories ?? [],
    },
    interiorPdf: pdf.buffer,
    insideMarginIn: marginsFor(theme, trim).insideIn,
    wrapPdf: wrap.pdf,
    wrapInfo: { spineText: wrap.spineText },
    ebookCover: cover.jpeg,
    epubcheck: { skipped: 'EPUBCheck jar not installed (Java is present).' },
    aiDisclosure: { aiWroteText: false, aiMadeImages: false, disclosed: 'none' },
    copyrightYear: book.meta.year ?? new Date().getFullYear(),
  });
  out('preflight.txt', preflightText(report, `Preflight: ${book.meta.title}`));
  out('preflight.html', preflightHtml(report, `Preflight: ${book.meta.title}`));
  const pack = await buildUploadPack({
    book,
    files: {
      interiorPdf: pdf.buffer,
      docx: readFileSync(path.join(outDir, `${slug}.docx`)),
      txt: exportTxt(book),
      md: exportMarkdown(book),
      ebookCover: cover.jpeg,
      wrapPdf: wrap.pdf,
      epub: readFileSync(path.join(outDir, `${slug}.epub`)),
    },
    trim,
    paper,
    pages: pdf.pageCount,
    rules,
    preflight: report,
    ai: { aiWroteText: false, aiMadeImages: false },
  });
  out(pack.fileName, pack.zip);
  console.log(
    `done in ${((Date.now() - t0) / 1000).toFixed(1)} s; preflight ${report.counts.pass} pass, ${report.counts.warn} warn, ${report.counts.fail} fail`,
  );
  for (const w of [...cover.warnings, ...wrap.warnings]) console.log(`  warning: ${w}`);
} finally {
  await releaseBrowser();
}
