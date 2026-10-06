import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import type { BookDoc } from '@volume/core';
import { loadHouseStyle, loadKdpRules } from '@volume/core/node';
import { exportEpub, isbnDigits, runPreflight } from '../src/index.ts';
import { loadMiniBook } from './helpers.ts';

// Owner-entered ISBNs may sit on the copyright page; any other ISBN still blocks (docs/04, guardrails).

const rules = loadKdpRules();
const houseStyle = loadHouseStyle();
const OWN = '978-0-306-40615-7';
const OTHER = '978-1-4028-9462-6';

function withCopyrightLine(text: string): BookDoc {
  const book = loadMiniBook();
  const copyright = book.sections.find((s) => s.subtype === 'copyright');
  if (!copyright) throw new Error('fixture has no copyright section');
  copyright.blocks.push({ type: 'paragraph', text });
  return book;
}

async function inventedContent(book: BookDoc, isbns?: string[]): Promise<string | undefined> {
  const report = await runPreflight({
    book,
    rules,
    houseStyle,
    trim: '6x9',
    paper: 'white',
    listing: { title: book.meta.title },
    ...(isbns ? { isbns } : {}),
    now: new Date('2026-10-04T12:00:00Z'),
  });
  return report.items.find((i) => i.id === 'style.invented-content')?.level;
}

describe('preflight ISBN allow-list', () => {
  it('blocks an ISBN on the copyright page when the owner entered none', async () => {
    expect(await inventedContent(withCopyrightLine(`ISBN (paperback): ${OWN}`))).toBe('fail');
  });

  it('passes the owner-entered ISBN, with or without hyphens and an ISBN label', async () => {
    expect(await inventedContent(withCopyrightLine(`ISBN (paperback): ${OWN}`), [OWN])).toBe('pass');
    expect(await inventedContent(withCopyrightLine(`ISBN: ${OWN}`), ['9780306406157'])).toBe('pass');
  });

  it('allows the ISBNs in the book metadata without the isbns list', async () => {
    const book = withCopyrightLine(`ISBN (eBook): ${OWN}`);
    book.meta.isbnEbook = OWN;
    expect(await inventedContent(book)).toBe('pass');
  });

  it('still blocks an ISBN the owner did not enter', async () => {
    expect(await inventedContent(withCopyrightLine(`ISBN (paperback): ${OTHER}`), [OWN])).toBe('fail');
  });

  it('normalises ISBN text to digits', () => {
    expect(isbnDigits('ISBN-13: 978-0-306-40615-7')).toBe('9780306406157');
    expect(isbnDigits('0-8044-2957-x')).toBe('080442957X');
  });
});

describe('EPUB cover', () => {
  it('adds the eBook cover JPEG as the cover image', async () => {
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0xff, 0xd9]);
    const zip = await JSZip.loadAsync(await exportEpub(loadMiniBook(), undefined, { coverJpeg: jpeg, modified: new Date('2026-10-04T00:00:00Z') }));
    expect(await zip.file('OEBPS/images/cover.jpg')?.async('nodebuffer')).toEqual(jpeg);
    expect(await zip.file('OEBPS/content.opf')?.async('string')).toContain('properties="cover-image"');
  });

  it('refuses a cover that is not a JPEG', async () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    await expect(exportEpub(loadMiniBook(), undefined, { coverJpeg: png })).rejects.toThrow(/JPEG/);
  });
});
