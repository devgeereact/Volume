// TXT export in the owner's "====" format (docs/06-EXPORT-SPEC.md, TXT).
import { countWords, enabledSections, stripInline, wrapText, type Block, type BookDoc, type Section } from '@volume/core';

export interface TxtOptions {
  /** Line width for wrapping. Default 80. */
  width?: number;
  /**
   * SUMMARY block after the copyright (blueprint summary from meta.summary). Default false: the
   * summary belongs to the listing and back cover, not the book interior. True gives the old format.
   */
  includeSummary?: boolean;
  /** AMAZON MARKETING PACKAGE from meta.listing. Default true. */
  includeMarketing?: boolean;
}

const FRONT_FENCES = new Set(['titlepage', 'copyright', 'contents', 'halftitle']);

/** Decode the few entities a description is likely to hold. */
function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_m, d: string) => String.fromCodePoint(Number(d)));
}

/** HTML description to plain paragraphs (list items become "- item"). */
export function htmlToParagraphs(html: string): string[] {
  const marked = html
    .replace(/\r\n?/g, '\n')
    .replace(/<li\b[^>]*>/gi, '\n\u0000- ')
    .replace(/<br\s*\/?>/gi, '\n\u0000')
    .replace(/<\/(p|h[1-6]|ul|ol|li|div)>/gi, '\n\u0000')
    .replace(/<[^>]+>/g, '');
  return decodeEntities(marked)
    .split('\u0000')
    .map((p) => p.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

function blockLines(b: Block, width: number): string[] | null {
  switch (b.type) {
    case 'paragraph':
      return wrapText(stripInline(b.text), width);
    case 'heading2':
    case 'heading3':
      return wrapText(stripInline(b.text), width);
    case 'list':
      return b.items.flatMap((it, k) => {
        const marker = b.ordered ? `${k + 1}. ` : '- ';
        return wrapText(stripInline(it), width, marker, ' '.repeat(marker.length));
      });
    case 'takeaways':
      return ['KEY TAKEAWAYS', '', ...b.items.flatMap((it) => wrapText(stripInline(it), width, '- ', '  '))];
    case 'sceneBreak':
      return ['* * *'];
    case 'table':
      return b.rows.flatMap((r) => wrapText(r.map(stripInline).join(' | '), width, '', '  '));
    case 'quote':
      return [...b.lines.flatMap((l) => wrapText(stripInline(l), width)), ...(b.attribution ? [`- ${b.attribution}`] : [])];
    case 'callout':
      return b.text ? wrapText(stripInline(b.text), width) : null;
    case 'image':
      return [`[Image: ${b.caption ?? b.alt}]`];
    case 'pageBreak':
      return null;
  }
}

function bodyLines(s: Section, width: number): string[] {
  const out: string[] = [];
  for (const b of s.blocks) {
    const ls = blockLines(b, width);
    if (!ls) continue;
    if (out.length) out.push('');
    out.push(...ls);
  }
  return out;
}

/** Words counted for "Total Word Count": section bodies including subheadings and list items, no headings or labels. */
export function txtWordCount(book: BookDoc): number {
  let n = 0;
  for (const s of enabledSections(book)) {
    if (FRONT_FENCES.has(s.subtype)) continue;
    for (const b of s.blocks) {
      switch (b.type) {
        case 'paragraph':
        case 'heading2':
        case 'heading3':
        case 'callout':
          n += countWords(stripInline(b.text));
          break;
        case 'list':
        case 'takeaways':
          n += b.items.reduce((a, it) => a + countWords(stripInline(it)), 0);
          break;
        case 'table':
          n += b.rows.flat().reduce((a, c) => a + countWords(stripInline(c)), 0);
          break;
        case 'quote':
          n += countWords([...b.lines, b.attribution ?? ''].join(' '));
          break;
        case 'image':
          n += countWords(b.caption ?? '');
          break;
        default:
          break;
      }
    }
  }
  return n;
}

function headingFor(s: Section): string {
  if (s.kind === 'chapter' && s.number !== undefined) return `CHAPTER ${s.number}: ${s.title}`.toUpperCase();
  if (s.kicker) return `${s.kicker}: ${s.title}`.toUpperCase();
  return s.title.toUpperCase();
}

function contentsLines(secs: Section[], from: number): string[] {
  const out: string[] = [];
  let n = 0;
  for (const s of secs.slice(from)) {
    if (FRONT_FENCES.has(s.subtype)) continue;
    if (s.kind === 'chapter') {
      n = s.number ?? n + 1;
      out.push(`${n}. ${s.title}`);
      for (const b of s.blocks) if (b.type === 'heading2') out.push(`   ${stripInline(b.text)}`);
    } else if (s.kind === 'part') {
      out.push(s.kicker ? `${s.kicker}: ${s.title}` : s.title);
    } else {
      out.push(s.title);
    }
  }
  return out;
}

/** The book as the owner's TXT format. UTF-8 without BOM, LF endings, final newline. */
export function exportTxt(book: BookDoc, opts: TxtOptions = {}): Buffer {
  const width = opts.width ?? 80;
  const sep = '='.repeat(width);
  const L: string[] = [];
  const secs = enabledSections(book);
  const block = (heading: string | null, body: string[]) => {
    L.push('');
    if (heading !== null) L.push(heading, '');
    if (body.length) L.push(...body, '');
    L.push(sep);
  };

  L.push(sep, book.meta.title.toUpperCase());
  if (book.meta.subtitle) L.push(book.meta.subtitle);
  L.push(`by ${book.meta.author}`, sep);

  const copyright = secs.find((s) => s.subtype === 'copyright');
  if (copyright) {
    const lines = copyright.blocks.flatMap((b) => blockLines(b, width) ?? []);
    block(null, lines);
  }
  if (opts.includeSummary === true && book.meta.summary) {
    block(
      'SUMMARY',
      book.meta.summary.split(/\n\s*\n/).flatMap((p, k) => [...(k ? [''] : []), ...wrapText(p.trim(), width)]),
    );
  }
  secs.forEach((s, idx) => {
    if (s.subtype === 'titlepage' || s.subtype === 'copyright' || s.subtype === 'halftitle') return;
    if (s.subtype === 'contents') {
      block('CONTENTS', contentsLines(secs, idx + 1));
      return;
    }
    block(headingFor(s), bodyLines(s, width));
  });

  const listing = book.meta.listing;
  if (opts.includeMarketing !== false && listing && (listing.description || listing.categories?.length || listing.keywords?.length)) {
    const body: string[] = [];
    if (listing.description) {
      body.push('PRODUCT DESCRIPTION:');
      htmlToParagraphs(listing.description).forEach((p, k) => {
        if (k) body.push('');
        body.push(...(p.startsWith('- ') ? wrapText(p.slice(2), width, '- ', '  ') : wrapText(p, width)));
      });
    }
    const numbered = (label: string, items: string[] | undefined) => {
      if (!items?.length) return;
      if (body.length) body.push('');
      body.push(label, ...items.map((it, k) => `${k + 1}. ${it}`));
    };
    numbered('CATEGORIES:', listing.categories);
    numbered('KEYWORDS:', listing.keywords);
    block('AMAZON MARKETING PACKAGE', body);
  }
  L.push('END OF BOOK', `Total Word Count: ${txtWordCount(book)}`, sep);
  return Buffer.from(`${L.join('\n')}\n`, 'utf8');
}
