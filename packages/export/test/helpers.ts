import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { parseManuscript, type BookDoc } from '@volume/core';

export const fixture = (name: string) => new URL(`./fixtures/${name}`, import.meta.url);
export const goldenPath = (name: string) => new URL(`./golden/${name}`, import.meta.url);

export function loadWindowsill(): { md: string; book: BookDoc } {
  const md = readFileSync(fixture('windowsill-herbs-manuscript.md'), 'utf8');
  return { md, book: parseManuscript(md) };
}

export function loadMiniBook(): BookDoc {
  const book = parseManuscript(readFileSync(fixture('mini-book.md'), 'utf8'));
  Object.assign(book.meta, JSON.parse(readFileSync(fixture('mini-book.meta.json'), 'utf8')) as Partial<BookDoc['meta']>);
  return book;
}

/** Read a golden file; with UPDATE_GOLDEN=1 (or when it is missing and WRITE_MISSING_GOLDEN=1) write `actual` first. */
export function golden(name: string, actual: string): string {
  const p = goldenPath(name);
  if (process.env.UPDATE_GOLDEN === '1' || (!existsSync(p) && process.env.WRITE_MISSING_GOLDEN === '1')) writeFileSync(p, actual);
  return readFileSync(p, 'utf8');
}
