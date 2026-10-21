// scripts/pages-docx-to-md.mjs: a Pages-style DOCX, built here in memory, converts to Volume Markdown
// that parseManuscript reads into the right sections.
import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { parseManuscript, type Block } from '@volume/core';

interface Converted {
  markdown: string;
  report: { title: string; subtitle: string; contents: { number: number; title: string }[]; notes: string[] };
}
interface Converter {
  docxToMarkdown: (data: Uint8Array, opts?: { author?: string }) => Promise<Converted>;
  titleCase: (text: string, acronyms?: Set<string>) => string;
}

const scriptUrl = new URL('../../../scripts/pages-docx-to-md.mjs', import.meta.url).href;
const loadConverter = async (): Promise<Converter> => (await import(scriptUrl)) as Converter;

/** Style ids differ from their names, as in a real export, so the converter must read styles.xml. */
const STYLES: Record<string, string> = {
  Title2: 'Title 2',
  Title: 'Title',
  ChapterNumber: 'Chapter Number',
  Chapter2: 'Chapter 2',
  Chapter: 'Chapter',
  Subheading: 'Subheading',
  Body: 'Body',
  Body2: 'Body 2',
  Body3: 'Body 3',
  Default: 'Default',
  Normal: 'Normal',
  Caption: 'Caption',
  Dedication: 'Dedication',
  TOC: 'Table of Content',
  AboutAuthor: 'ABOUT AUTHOR',
  HeaderFooter: 'Header & Footer',
};

interface Para {
  style: keyof typeof STYLES;
  text: string;
  bold?: boolean;
  bullet?: boolean;
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function paragraphXml(p: Para): string {
  const numPr = p.bullet ? '<w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr>' : '';
  const rPr = p.bold ? '<w:rPr><w:b/></w:rPr>' : '<w:rPr><w:b w:val="0"/></w:rPr>';
  return `<w:p><w:pPr><w:pStyle w:val="${p.style}"/>${numPr}</w:pPr><w:r>${rPr}<w:t xml:space="preserve">${esc(p.text)}</w:t></w:r></w:p>`;
}

async function buildDocx(paras: Para[]): Promise<Uint8Array> {
  const zip = new JSZip();
  const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
  zip.file(
    '[Content_Types].xml',
    '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/></Types>',
  );
  const styles = Object.entries(STYLES)
    .map(([id, name]) => `<w:style w:type="paragraph" w:styleId="${id}"><w:name w:val="${esc(name)}"/></w:style>`)
    .join('');
  zip.file('word/styles.xml', `<?xml version="1.0" encoding="UTF-8"?><w:styles ${W}>${styles}</w:styles>`);
  zip.file(
    'word/numbering.xml',
    `<?xml version="1.0" encoding="UTF-8"?><w:numbering ${W}><w:abstractNum w:abstractNumId="0"><w:lvl w:ilvl="0"><w:numFmt w:val="bullet"/></w:lvl></w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num></w:numbering>`,
  );
  zip.file('word/header1.xml', `<?xml version="1.0" encoding="UTF-8"?><w:hdr ${W}><w:p><w:r><w:t>RUNNING HEAD</w:t></w:r></w:p></w:hdr>`);
  zip.file('word/document.xml', `<?xml version="1.0" encoding="UTF-8"?><w:document ${W}><w:body>${paras.map(paragraphXml).join('')}</w:body></w:document>`);
  return zip.generateAsync({ type: 'uint8array' });
}

const text = (b: Block | undefined): string => (b && 'text' in b ? b.text : '');

describe('pages-docx-to-md', () => {
  it('converts a Pages DOCX into title page, front matter, chapters and back matter', async () => {
    const { docxToMarkdown } = await loadConverter();
    const docx = await buildDocx([
      { style: 'Title2', text: 'THE NHS TEST HANDBOOK' },
      { style: 'ChapterNumber', text: 'A Practical Guide For NMC Nurses' },
      { style: 'Caption', text: 'By Harni Muharami' },
      { style: 'Caption', text: '© 2026 Harni Muharami. All rights reserved.' },
      { style: 'Caption', text: 'DISCLAIMER', bold: true },
      { style: 'Caption', text: 'For education only.' },
      { style: 'ChapterNumber', text: 'DEDICATION' },
      { style: 'Body2', text: 'To every nurse on the ward.' },
      { style: 'ChapterNumber', text: 'TABLE OF CONTENTS' },
      { style: 'TOC', text: 'Chapter 1: Working With PALS And The NHS' },
      { style: 'TOC', text: 'Chapter 2: Speaking Up' },
      { style: 'ChapterNumber', text: 'INTRODUCTION' },
      { style: 'Body2', text: 'This book is for "you" and it\'s practical.' },
      { style: 'HeaderFooter', text: '' },
      { style: 'Title2', text: 'CHAPTER 1' },
      { style: 'Chapter2', text: 'WORKING WITH PALS AND' },
      { style: 'Chapter2', text: 'THE NHS' },
      { style: 'Chapter', text: 'First Steps' },
      { style: 'Body', text: 'Body text one.' },
      { style: 'Body2', text: 'Ask for help early', bullet: true },
      { style: 'Body2', text: 'Write it down', bullet: true },
      { style: 'Subheading', text: 'A Smaller Point' },
      { style: 'Default', text: 'Default text.' },
      { style: 'Title2', text: 'CHAPTER 2' },
      { style: 'Chapter2', text: 'SPEAKING UP' },
      { style: 'Body3', text: 'Body three text.' },
      { style: 'ChapterNumber', text: 'CONCLUSION' },
      { style: 'Normal', text: 'Closing words.' },
      { style: 'ChapterNumber', text: 'ABOUT THE AUTHOR' },
      { style: 'AboutAuthor', text: 'Harni Muharami is a nurse.' },
      { style: 'Default', text: 'Amazon Categories', bold: true },
      { style: 'Default', text: 'Medical Books > Nursing' },
      { style: 'Default', text: 'SEO Keywords', bold: true },
    ]);
    const { markdown, report } = await docxToMarkdown(docx, { author: 'Harni Muharami' });
    const book = parseManuscript(markdown);

    expect(book.sections.map((s) => `${s.kind}:${s.subtype}`)).toEqual([
      'front:titlepage',
      'front:copyright',
      'front:dedication',
      'front:contents',
      'front:introduction',
      'chapter:chapter',
      'chapter:chapter',
      'back:conclusion',
      'back:about_the_author',
    ]);
    expect(book.meta).toMatchObject({ title: 'The NHS Test Handbook', subtitle: 'A Practical Guide For NMC Nurses', author: 'Harni Muharami', year: 2026 });
    expect(report.contents.map((c) => c.number)).toEqual([1, 2]);

    const [ch1, ch2] = book.sections.filter((s) => s.kind === 'chapter');
    expect(ch1).toMatchObject({ number: 1, title: 'Working with PALS and the NHS' });
    expect(ch2).toMatchObject({ number: 2, title: 'Speaking Up' });
    expect(ch1?.blocks).toEqual([
      { type: 'heading2', text: 'First Steps' },
      { type: 'paragraph', text: 'Body text one.' },
      { type: 'list', items: ['Ask for help early', 'Write it down'] },
      { type: 'heading3', text: 'A Smaller Point' },
      { type: 'paragraph', text: 'Default text.' },
    ]);

    const intro = book.sections.find((s) => s.subtype === 'introduction');
    expect(text(intro?.blocks[0])).toBe('This book is for “you” and it’s practical.');
    const copyright = book.sections.find((s) => s.subtype === 'copyright');
    expect(copyright?.blocks.map(text)).toEqual(['© 2026 Harni Muharami. All rights reserved.', '**Disclaimer**', 'For education only.']);
    expect(text(book.sections.find((s) => s.subtype === 'about_the_author')?.blocks[0])).toBe('Harni Muharami is a nurse.');

    // Contents entries, the running head and the KDP tail never reach the book.
    expect(markdown).not.toMatch(/Amazon|Medical Books|SEO|RUNNING HEAD|Speaking Up\n[\s\S]*Speaking Up\n[\s\S]*Speaking Up/);
    expect(markdown.match(/Working With PALS/gi)).toHaveLength(1);
  });

  it('reads chapters from the text when the styles do not mark them', async () => {
    const { docxToMarkdown } = await loadConverter();
    const docx = await buildDocx([
      { style: 'Title', text: 'Quiet Wards' },
      { style: 'Body', text: '© Harni Muharami. All rights reserved.' },
      { style: 'Chapter', text: 'Contents' },
      { style: 'TOC', text: 'Chapter 1.' },
      { style: 'TOC', text: 'The First Shift' },
      { style: 'TOC', text: 'Chapter 2.' },
      { style: 'TOC', text: 'Handover' },
      { style: 'TOC', text: 'Chapter 3.' },
      { style: 'TOC', text: 'Rest' },
      { style: 'Chapter', text: 'Introduction' },
      { style: 'Default', text: 'A long enough introduction paragraph that carries the reader into the book and onwards to the first part.' },
      { style: 'Title', text: 'Part One' },
      { style: 'Chapter', text: 'The Beginning' },
      { style: 'Chapter', text: 'The First Shift' },
      { style: 'Default', text: 'Chapter one text.' },
      { style: 'Default', text: '2. Handover', bold: true },
      { style: 'Default', text: 'Chapter two text.' },
      { style: 'Chapter', text: 'Chapter Three' },
      { style: 'Chapter', text: 'Rest' },
      { style: 'Dedication', text: 'Chapter three text.' },
      { style: 'Chapter', text: 'Acknowledgements' },
      { style: 'Body', text: 'Thanks to the team.' },
    ]);
    const { markdown } = await docxToMarkdown(docx, { author: 'Harni Muharami' });
    const book = parseManuscript(markdown);

    expect(book.meta.title).toBe('Quiet Wards');
    expect(book.meta.subtitle).toBeUndefined();
    expect(book.sections.map((s) => `${s.kind}:${s.subtype}`)).toEqual([
      'front:titlepage',
      'front:copyright',
      'front:contents',
      'front:introduction',
      'part:part',
      'chapter:chapter',
      'chapter:chapter',
      'chapter:chapter',
      'back:acknowledgements',
    ]);
    expect(book.sections.find((s) => s.kind === 'part')).toMatchObject({ kicker: 'Part One', title: 'The Beginning' });
    expect(book.sections.filter((s) => s.kind === 'chapter').map((s) => `${s.number} ${s.title}`)).toEqual(['1 The First Shift', '2 Handover', '3 Rest']);
  });

  it('title-cases capitals but keeps acronyms and small words', async () => {
    const { titleCase } = await loadConverter();
    expect(titleCase('SPEAKING UP SMART IN THE NHS')).toBe('Speaking Up Smart in the NHS');
    expect(titleCase('PALLIATIVE AND END-OF-LIFE CARE: THE NMC CODE')).toBe('Palliative and End-of-Life Care: The NMC Code');
    expect(titleCase('THE NHS HEALER’S HANDBOOK')).toBe('The NHS Healer’s Handbook');
  });
});
