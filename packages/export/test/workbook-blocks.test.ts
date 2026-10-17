import JSZip from 'jszip';
import { DEFAULT_INTERIOR_THEME, parseManuscript, WRITING_SPACE_TEXT, type BookDoc } from '@volume/core';
import { describe, expect, it } from 'vitest';
import { buildPrintHtml, exportDocx, exportEpub, exportMarkdown, exportTxt, loadFontLibrary, txtWordCount } from '../src/index.ts';

// P6-1 rendering per D-042: PDF and DOCX draw ruled lines and tick boxes; EPUB and TXT print the exercise and
// "Space to write your answer." instead of ruled lines. Full fiction and workbook goldens come with P6-2.
const MD = `::: titlepage
Morning Habits Workbook
Small Changes You Can Keep
Test Author
:::

::: copyright
Copyright © 2026 Test Author. All rights reserved.
:::

::: contents
:::

# Chapter 1: The First Hour

Opening paragraph.

::: exercise reflection Your First Hour
What do you do in the first hour after you wake?

::: lines 5
:::
:::

::: exercise checklist Before Bed
- [ ] Phone in another room
- [ ] Clothes laid out
:::

::: fill-in page
My wake-up time:
My first drink:
:::

* * *

After the break.
`;

const book = (): BookDoc => parseManuscript(MD);

describe('workbook blocks in every format', () => {
  it('MD writes the blocks back in the canonical dialect (scene break as ***)', () => {
    const out = exportMarkdown(book()).toString('utf8');
    expect(out).toBe(MD.replace('* * *', '***'));
  });

  it('TXT prints exercises, [ ] items and one "Space to write" line per ruled block', () => {
    const out = exportTxt(book()).toString('utf8');
    expect(out).toContain(
      [
        'EXERCISE: YOUR FIRST HOUR',
        '',
        'What do you do in the first hour after you wake?',
        '',
        WRITING_SPACE_TEXT,
        '',
        'EXERCISE: BEFORE BED',
        '',
        '[ ] Phone in another room',
        '[ ] Clothes laid out',
        '',
        'My wake-up time:',
        'My first drink:',
        WRITING_SPACE_TEXT,
        '',
        '* * *',
      ].join('\n'),
    );
    expect(out).not.toContain(':::');
    expect(out).not.toContain('____');
    // 2 (opening) + 14 (title 3, question 11) + 9 (title 2, items 4 and 3) + 6 (prompts) + 3 (after the break)
    expect(txtWordCount(book())).toBe(34);
  });

  it('EPUB prints the exercise text and no ruled lines', async () => {
    const zip = await JSZip.loadAsync(await exportEpub(book(), undefined, { modified: new Date('2026-10-17T00:00:00Z') }));
    const name = Object.keys(zip.files).find((n) => n.includes('chapter-1'));
    const xhtml = (await zip.file(name ?? '')?.async('string')) ?? '';
    expect(xhtml).toContain('<aside class="exercise"><p class="xh">Exercise: Your First Hour</p>');
    expect(xhtml).toContain('<ul class="checklist"><li>Phone in another room</li><li>Clothes laid out</li></ul>');
    expect(xhtml.split(WRITING_SPACE_TEXT)).toHaveLength(3);
    expect(xhtml).toContain('<hr class="break"/>');
    expect(xhtml).not.toContain('writing-lines');
  });

  it('DOCX draws ruled lines and tick boxes without new styles', async () => {
    const zip = await JSZip.loadAsync(await exportDocx(book()));
    const doc = (await zip.file('word/document.xml')?.async('string')) ?? '';
    expect(doc).toMatch(/<w:pStyle w:val="TakeawaysHeading"\/>.*?Exercise: Your First Hour/s);
    // 5 lines in the exercise plus FILL_IN_PAGE_LINES (3) per prompt on the fill-in page (P6-2).
    expect(doc.match(/<w:bottom w:val="single"[^>]*w:color="888888"/g)).toHaveLength(11);
    expect(doc.match(/<w14:checkbox>/g)).toHaveLength(2);
    expect(doc).not.toContain(WRITING_SPACE_TEXT);
    expect(doc).toContain('My wake-up time:');
  });

  it('print HTML (PDF interior) draws ruled lines, tick boxes and a fill-in page', () => {
    const { html } = buildPrintHtml(book(), DEFAULT_INTERIOR_THEME, loadFontLibrary(), { trim: '6x9' });
    expect(html).toContain('<section class="exercise reflection"><p class="xh">Exercise: Your First Hour</p>');
    expect(html).toContain(`<div class="writing-lines">${'<div class="wl"></div>'.repeat(5)}</div>`);
    expect(html.match(/<span class="tick" aria-hidden="true"><\/span>/g)).toHaveLength(2);
    expect(html).toContain('<div class="fill-in page"><p class="fi">My wake-up time:</p><div class="wl"></div>');
    expect(html).toContain('.fill-in.page { break-before: page; }');
    expect(html).toContain('<div class="break" role="separator">');
    expect(html).not.toContain(WRITING_SPACE_TEXT);
  });

  it('clamps out-of-range line counts in print formats', () => {
    const b = parseManuscript('# Chapter 1: One\n\n::: lines 99\n:::\n');
    const { html } = buildPrintHtml(b, DEFAULT_INTERIOR_THEME, loadFontLibrary(), { trim: '6x9' });
    expect(html.match(/<div class="wl"><\/div>/g)).toHaveLength(30);
  });
});
