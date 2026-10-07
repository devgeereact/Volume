import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { exportMarkdown, exportTxt, txtWordCount } from '../src/index.ts';
import { golden, goldenPath, loadMiniBook, loadWindowsill } from './helpers.ts';

describe('TXT', () => {
  it('matches the exact example in docs/book-production/EXPORT-SPEC.md (with the optional SUMMARY block)', () => {
    const book = loadMiniBook();
    expect(txtWordCount(book)).toBe(145);
    expect(exportTxt(book, { includeSummary: true }).toString('utf8')).toBe(readFileSync(goldenPath('mini-book.txt'), 'utf8'));
  });

  it('leaves the blueprint summary out of the interior by default', () => {
    const book = loadMiniBook();
    expect(book.meta.summary).toBeTruthy();
    const out = exportTxt(book).toString('utf8');
    expect(out).not.toContain('SUMMARY');
    expect(out).not.toContain(book.meta.summary ?? '');
  });

  it('matches the Windowsill Herbs golden file, wrapped at 80 columns', () => {
    const { book } = loadWindowsill();
    const out = exportTxt(book).toString('utf8');
    expect(out).toBe(golden('windowsill-herbs.txt', out));
    const long = out.split('\n').filter((l) => l.length > 80 && /\s/.test(l));
    expect(long).toEqual([]);
    expect(out.endsWith('\n')).toBe(true);
    expect(out.includes('\r')).toBe(false);
  });
});

describe('MD', () => {
  it('writes the Windowsill Herbs manuscript back byte for byte', () => {
    const { md, book } = loadWindowsill();
    expect(exportMarkdown(book).toString('utf8')).toBe(md);
  });
});
