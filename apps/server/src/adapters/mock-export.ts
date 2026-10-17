import type {
  CoverInput,
  EpubOptions,
  ExportBook,
  ExportFile,
  ExportFileRole,
  ExportPort,
  PictureBookBuild,
  PictureBookInput,
  PreflightItem,
  PreflightReport,
  WrapCoverInput,
} from '../ports/export.js';

/**
 * MOCK export adapter. TXT and MD are real plain renderings; PDF, DOCX, EPUB,
 * covers and the pack are small placeholder files clearly marked MOCK.
 * Replaced by an @volume/export adapter once packages/export is ready.
 */

const enc = new TextEncoder();

function slug(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 60) || 'book'
  );
}

function asMarkdown(book: ExportBook): string {
  const parts = [`# ${book.title}`, book.subtitle ? `\n_${book.subtitle}_` : '', `\nBy ${book.author.penName}\n`];
  for (const s of book.sections) {
    parts.push(s.bodyMd.trim().length > 0 ? s.bodyMd.trim() : `## ${s.title ?? s.kind}\n\n(empty)`);
  }
  return parts.join('\n\n') + '\n';
}

function minimalPdf(text: string): Uint8Array {
  const safe = text.replace(/[()\\]/g, ' ').slice(0, 80);
  const stream = `BT /F1 18 Tf 72 720 Td (${safe}) Tj ET`;
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 432 648] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let body = '%PDF-1.4\n';
  const offsets: number[] = [];
  objs.forEach((o, i) => {
    offsets.push(body.length);
    body += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = body.length;
  body += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) body += `${String(off).padStart(10, '0')} 00000 n \n`;
  body += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return enc.encode(body);
}

function file(filename: string, mime: string, data: Uint8Array, pageCount: number | null = null, role?: ExportFileRole): ExportFile {
  const f: ExportFile = { filename, mime, data, pageCount, mock: true };
  if (role) f.role = role;
  return f;
}

function estimatePages(book: ExportBook): number {
  const words = book.sections.reduce((n, s) => n + s.wordCount, 0);
  return Math.max(24, Math.ceil(words / 300) + book.sections.length);
}

export class MockExportAdapter implements ExportPort {
  readonly name = 'mock' as const;

  buildMd(book: ExportBook): Promise<ExportFile> {
    return Promise.resolve(file(`${slug(book.title)}.md`, 'text/markdown; charset=utf-8', enc.encode(`<!-- MOCK EXPORT -->\n${asMarkdown(book)}`), null, 'md'));
  }

  buildTxt(book: ExportBook): Promise<ExportFile> {
    const txt = asMarkdown(book)
      .replace(/^#+\s*/gm, '')
      .replace(/[*_`]/g, '');
    return Promise.resolve(file(`${slug(book.title)}.txt`, 'text/plain; charset=utf-8', enc.encode(`MOCK EXPORT\n====\n${txt}`), null, 'txt'));
  }

  buildPdf(book: ExportBook): Promise<ExportFile> {
    return Promise.resolve(
      file(`${slug(book.title)}-print.pdf`, 'application/pdf', minimalPdf(`MOCK PDF: ${book.title}`), estimatePages(book), 'interior_pdf'),
    );
  }

  buildDocx(book: ExportBook): Promise<ExportFile> {
    return Promise.resolve(
      file(`${slug(book.title)}.mock.docx.txt`, 'text/plain; charset=utf-8', enc.encode(`MOCK DOCX placeholder for ${book.title}\n`), null, 'docx'),
    );
  }

  buildEpub(book: ExportBook, opts: EpubOptions = {}): Promise<ExportFile> {
    const cover = opts.coverJpeg ? `with a ${opts.coverJpeg.byteLength} byte cover JPEG` : 'without a cover';
    return Promise.resolve(
      file(`${slug(book.title)}.mock.epub.txt`, 'text/plain; charset=utf-8', enc.encode(`MOCK EPUB placeholder for ${book.title}, ${cover}\n`), null, 'epub'),
    );
  }

  buildEbookCover(input: CoverInput): Promise<ExportFile> {
    const data = input.artwork?.data ?? enc.encode('MOCK');
    return Promise.resolve(
      file(`${slug(input.book.title)}-ebook-cover.mock.${input.artwork ? 'png' : 'txt'}`, input.artwork?.mime ?? 'text/plain', data, null, 'ebook_cover'),
    );
  }

  buildWrapCover(input: WrapCoverInput): Promise<ExportFile> {
    return Promise.resolve(
      file(
        `${slug(input.book.title)}-paperback-wrap.pdf`,
        'application/pdf',
        minimalPdf(`MOCK WRAP: ${input.book.title}, ${input.pageCount} pages`),
        1,
        'wrap_pdf',
      ),
    );
  }

  preflight(book: ExportBook): Promise<PreflightReport> {
    const items: PreflightItem[] = [];
    const written = book.sections.filter((s) => s.wordCount > 0);
    items.push(
      written.length > 0
        ? { id: 'manuscript.has_text', area: 'manuscript', severity: 'pass', message: `${written.length} sections have text.` }
        : {
            id: 'manuscript.has_text',
            area: 'manuscript',
            severity: 'block',
            message: 'No section has any text yet.',
            fix: { route: 'writing', label: 'Write the book' },
          },
    );
    items.push(
      book.title.trim().length > 0
        ? { id: 'listing.title', area: 'listing', severity: 'pass', message: 'Title is set.' }
        : { id: 'listing.title', area: 'listing', severity: 'block', message: 'The book has no title.', fix: { route: 'titles', label: 'Choose a title' } },
    );
    items.push(
      book.author.bioThirdPerson.trim().length > 0
        ? { id: 'matter.about_author', area: 'matter', severity: 'pass', message: 'About the author comes from the profile bio.' }
        : { id: 'matter.about_author', area: 'matter', severity: 'warn', message: 'The profile has no bio for About the author.' },
    );
    items.push({ id: 'mock.adapter', area: 'system', severity: 'warn', message: 'MOCK preflight: real KDP checks arrive with packages/export.' });
    const blocks = items.filter((i) => i.severity === 'block').length;
    const warnings = items.filter((i) => i.severity === 'warn').length;
    return Promise.resolve({ ok: blocks === 0, blocks, warnings, items, rulesVersion: null, mock: true });
  }

  /** The mock's final preflight is its first one: placeholder files have nothing more to check. */
  async finalPreflight(book: ExportBook): Promise<PreflightReport> {
    return this.preflight(book);
  }

  /** Picture books: a placeholder PDF and a preflight that checks only that every spread has text and a picture. */
  async buildPictureBook(input: PictureBookInput): Promise<PictureBookBuild> {
    const { book, spreads } = input;
    const missingImages = spreads.filter((sp) => !sp.imageKey || !input.images[sp.imageKey]).map((sp) => sp.n);
    const front = book.sections.filter((s) => s.area === 'front').length;
    const back = book.sections.filter((s) => s.area === 'back').length;
    const pages = front + (front % 2 === 1 ? 0 : 1) + spreads.length * 2 + back;
    const pageCount = pages % 2 === 1 ? pages + 1 : pages;
    const interior = file(`${slug(book.title)}-picture-book.pdf`, 'application/pdf', minimalPdf(`MOCK PICTURE BOOK: ${book.title}`), pageCount, 'interior_pdf');
    const base = await this.preflight(book);
    const items: PreflightItem[] = [
      ...base.items,
      missingImages.length
        ? { id: 'picture.spread-images', area: 'picture', severity: 'block', message: `MOCK: spreads without a picture: ${missingImages.join(', ')}.` }
        : { id: 'picture.spread-images', area: 'picture', severity: 'pass', message: 'MOCK: every spread has a picture.' },
    ];
    const blocks = items.filter((i) => i.severity === 'block').length;
    const preflight: PreflightReport = { ...base, items, blocks, ok: blocks === 0, warnings: items.filter((i) => i.severity === 'warn').length };
    const pack = blocks === 0 ? await this.buildPack(book, [interior, ...(input.covers ?? [])]) : null;
    return {
      interior,
      preflight,
      pack,
      pageSizeIn: { widthIn: 8.625, heightIn: 8.75 },
      safeAreaFindings: [],
      missingImages,
      ruleIds: [],
      warnings: ['MOCK picture book: placeholder PDF, no real layout.'],
    };
  }

  buildPack(book: ExportBook, files: ExportFile[]): Promise<ExportFile> {
    const manifest = [`MOCK PACK for ${book.title}`, '', ...files.map((f) => `${f.filename}  ${f.mime}  ${f.data.byteLength} bytes`)].join('\n');
    return Promise.resolve(file(`${slug(book.title)}-kdp-pack.mock.txt`, 'text/plain; charset=utf-8', enc.encode(manifest + '\n'), null, 'pack'));
  }
}
