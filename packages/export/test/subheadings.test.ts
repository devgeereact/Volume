import JSZip from 'jszip';
import { parseManuscript, DEFAULT_INTERIOR_THEME, type BookDoc } from '@volume/core';
import { describe, expect, it } from 'vitest';
import { buildPrintHtml, exportDocx, exportEpub, exportMarkdown, exportTxt, loadFontLibrary } from '../src/index.ts';

// Shaped like the live book: each chapter ends with "### Key Takeaways" and a list.
const MD = `::: titlepage
Start Small With AI
How To Test A Side Business Idea
Test Author
:::

::: copyright
Copyright © 2026 Test Author. All rights reserved.
:::

::: contents
:::

# Chapter 1: Start With A Problem, Not A Tool

Opening paragraph.

## Your One-line Idea Card

Notice what the card does not contain.

### Key Takeaways

- Pick the problem first, then the plainest tool that helps with it.

#### Before You Move On

One last check.
`;

const SUMMARY = 'A short, practical guide for UK adults with a day job.';

function book(): BookDoc {
  const b = parseManuscript(MD);
  b.meta.summary = SUMMARY;
  return b;
}

describe('### and #### sub-subheadings in every exporter', () => {
  it('TXT puts them on their own line without hashes and keeps the summary out', () => {
    const txt = exportTxt(book()).toString('utf8');
    expect(txt).not.toContain('#');
    expect(txt).toContain('\n\nKey Takeaways\n\n- Pick the problem first');
    expect(txt).toContain('\n\nBefore You Move On\n\nOne last check.');
    expect(txt).not.toContain('SUMMARY');
    expect(txt).not.toContain(SUMMARY);
    // The old format is still there for anyone who asks for it.
    expect(exportTxt(book(), { includeSummary: true }).toString('utf8')).toContain(`SUMMARY\n\n${SUMMARY}`);
  });

  it('MD writes them back as ### and ####', () => {
    expect(exportMarkdown(book()).toString('utf8')).toBe(MD);
  });

  it('DOCX uses the Heading 3 and Heading 4 styles with outline levels', async () => {
    const zip = await JSZip.loadAsync(await exportDocx(book()));
    const doc = (await zip.file('word/document.xml')?.async('string')) ?? '';
    const styles = (await zip.file('word/styles.xml')?.async('string')) ?? '';
    expect(doc).toMatch(/<w:pStyle w:val="Heading3"\/>.*?Key Takeaways/s);
    expect(doc).toMatch(/<w:pStyle w:val="Heading4"\/>.*?Before You Move On/s);
    expect(doc).not.toContain('###');
    expect(doc).not.toContain(SUMMARY);
    const h3 = /<w:style [^>]*w:styleId="Heading3".*?<\/w:style>/s.exec(styles)?.[0] ?? '';
    expect(h3).toContain('<w:outlineLvl w:val="2"/>');
    expect(h3).toContain('<w:keepNext/>');
  });

  it('EPUB renders h3 and h4 with styles', async () => {
    const zip = await JSZip.loadAsync(await exportEpub(book(), undefined, { modified: new Date('2026-10-05T00:00:00Z') }));
    const names = Object.keys(zip.files);
    const chapter = names.find((n) => n.includes('chapter-1'));
    const xhtml = (await zip.file(chapter ?? '')?.async('string')) ?? '';
    expect(xhtml).toContain('<h3>Key Takeaways</h3>');
    expect(xhtml).toContain('<h4>Before You Move On</h4>');
    expect(xhtml).not.toContain('###');
    const read = (n: string) => zip.file(n)?.async('string') ?? Promise.resolve('');
    const css = (await Promise.all(names.filter((n) => n.endsWith('.css')).map(read))).join('\n');
    expect(css).toMatch(/\nh3 \{/);
    const all = (await Promise.all(names.filter((n) => n.endsWith('.xhtml')).map(read))).join('\n');
    expect(all).not.toContain(SUMMARY);
  });

  it('print HTML (the PDF interior) renders h3 and h4 with print CSS', () => {
    const { html } = buildPrintHtml(book(), DEFAULT_INTERIOR_THEME, loadFontLibrary(), { trim: '6x9' });
    expect(html).toContain('<h3>Key Takeaways</h3>');
    expect(html).toContain('<h4>Before You Move On</h4>');
    expect(html).toMatch(/\nh3 \{ font-family/);
    expect(html).toContain('h3 + p');
    expect(html).not.toContain('###');
    expect(html).not.toContain(SUMMARY);
  });
});
