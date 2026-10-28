// Pages the app builds from the book instead of the writer: title page, copyright, contents, About the author, Also by,
// part dividers. Every exporter takes its contents list from contentsSections(), and the Editor shows the same pages
// through generatedPage(), so what the owner reads in the Editor is what the exported book holds.
import { countWords, inContents, sectionHeading, stripInline, type BookDoc, type Section } from '@volume/core';

/** Pages that sit before the contents and never get a contents entry (and, apart from About the author, no body words). */
export const FENCED_SUBTYPES: ReadonlySet<string> = new Set(['titlepage', 'copyright', 'contents', 'halftitle']);

/** The sections that get a contents entry, in book order, after position `from` (the contents page itself is at from - 1). */
export function contentsSections(book: BookDoc, secs: readonly Section[], from: number): Section[] {
  return secs.slice(from).filter((s) => !FENCED_SUBTYPES.has(s.subtype) && inContents(book, s));
}

/** One line of the contents list: its text, and level 1 for a chapter subheading indented beneath its chapter. */
export interface ContentsLine {
  text: string;
  level: 0 | 1;
}

/** The contents list as plain lines: every entry, with each chapter's subheadings beneath it. */
export function contentsLinesOf(book: BookDoc, withSubs = true): ContentsLine[] {
  const secs = book.sections.filter((s) => s.enabled !== false);
  const at = secs.findIndex((s) => s.subtype === 'contents');
  if (at < 0) return [];
  const out: ContentsLine[] = [];
  for (const s of contentsSections(book, secs, at + 1)) {
    out.push({ text: sectionHeading(s), level: 0 });
    if (withSubs && s.kind === 'chapter') for (const b of s.blocks) if (b.type === 'heading2') out.push({ text: stripInline(b.text), level: 1 });
  }
  return out;
}

/** A page the app builds: its lines as the exported book prints them, and the words in them. */
export interface GeneratedPage {
  lines: ContentsLine[];
  words: number;
}

const GENERATED_SUBTYPES: ReadonlySet<string> = new Set(['titlepage', 'halftitle', 'copyright', 'contents', 'about_the_author', 'also_by', 'part']);

/** True for a section whose exported page the app builds (the owner can still write their own copyright text). */
export function isGeneratedSubtype(subtype: string): boolean {
  return GENERATED_SUBTYPES.has(subtype);
}

const paragraphs = (s: Section): ContentsLine[] => s.blocks.flatMap((b) => (b.type === 'paragraph' ? [{ text: stripInline(b.text), level: 0 as const }] : []));

/**
 * The lines the exporters print for a page the app builds, or null for a section the writer or the owner writes.
 * `book` is the same BookDoc the exporters receive, so the contents list sees the real chapters and subheadings.
 */
export function generatedPage(book: BookDoc, section: Section): GeneratedPage | null {
  let lines: ContentsLine[];
  switch (section.subtype) {
    case 'titlepage':
      lines = (section.lines ?? []).filter((l) => l.trim()).map((text) => ({ text, level: 0 as const }));
      break;
    case 'halftitle':
      lines = [{ text: section.title, level: 0 }];
      break;
    case 'contents':
      lines = contentsLinesOf(book);
      break;
    case 'copyright':
    case 'about_the_author':
    case 'also_by':
      lines = paragraphs(section);
      break;
    case 'part':
      lines = [section.kicker, section.title]
        .filter((t): t is string => typeof t === 'string' && t.trim().length > 0)
        .map((text) => ({ text, level: 0 as const }));
      break;
    default:
      return null;
  }
  // A part divider and a half title carry a label, not reading text; they add no words to the manuscript.
  const words = section.subtype === 'part' || section.subtype === 'halftitle' ? 0 : countWords(lines.map((l) => l.text).join(' '));
  return { lines, words };
}
