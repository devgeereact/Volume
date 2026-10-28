// DOCX export, ported from P02 build_docx.py with the `docx` package (docs/book-production/EXPORT-SPEC.md, DOCX).
// Named styles only (no blank paragraphs or tabs for spacing), page break before every Heading 1, linked contents
// (bookmarks and internal hyperlinks) so Kindle conversion keeps a working table of contents, trim page size,
// mirrored margins (settings.xml patched after packing), PAGE field in the footer, theme fonts named and embedded.

import {
  AlignmentType,
  Bookmark,
  BorderStyle,
  CheckBox,
  Document,
  Footer,
  ImageRun,
  InternalHyperlink,
  LevelFormat,
  Packer,
  PageBreak,
  PageNumber,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
  type IParagraphStyleOptions,
  type IParagraphStylePropertiesOptions,
} from 'docx';
import JSZip from 'jszip';
import sharp from 'sharp';
import {
  clampLines,
  DEFAULT_INTERIOR_THEME,
  enabledSections,
  exerciseHeading,
  marginsFor,
  parseInline,
  parseTrimKey,
  sectionHeading,
  type Block,
  type BookDoc,
  type InteriorTheme,
  type Section,
  type TrimKey,
} from '@volume/core';
import { contentsSections } from './front-matter.ts';
import { fillInLines } from './print-html.ts';
import { fontBytes, loadFontLibrary, resolveFamily, type FontLibrary } from './fonts.ts';

export interface DocxOptions {
  trim?: TrimKey;
  /** Embed the body and heading fonts (static TTF/OTF only). Default true. */
  embedFonts?: boolean;
  images?: Record<string, Buffer>;
  fonts?: FontLibrary;
}

const TWIP_PER_IN = 1440;

/** docx's style typings omit pageBreakBefore and widowControl, which it writes correctly at run time. */
type StylePara = IParagraphStylePropertiesOptions & { pageBreakBefore?: boolean; widowControl?: boolean };
const para = (p: StylePara): IParagraphStylePropertiesOptions => p;
const tw = (inches: number) => Math.round(inches * TWIP_PER_IN);
const pt = (points: number) => Math.round(points * 20); // twips
const half = (points: number) => Math.round(points * 2); // half-points
const hex = (c: string) => c.replace('#', '').slice(0, 6).toUpperCase();

function runsFor(text: string, extra: { size?: number; allCaps?: boolean } = {}): TextRun[] {
  return parseInline(text).map(
    (r) =>
      new TextRun({
        text: r.text,
        ...(r.bold ? { bold: true } : {}),
        ...(r.italic ? { italics: true } : {}),
        ...(extra.size ? { size: extra.size } : {}),
        ...(extra.allCaps ? { allCaps: true } : {}),
      }),
  );
}

/** An empty paragraph with a bottom rule: one writing line for workbooks. */
function ruledLine(): Paragraph {
  return new Paragraph({
    style: 'FirstParagraph',
    spacing: { before: 280, after: 0 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: '888888', space: 1 } },
    children: [],
  });
}

function styles(theme: InteriorTheme, body: string, heading: string): IParagraphStyleOptions[] {
  const t = theme;
  const lineTw = Math.round((Math.min(t.leading, 1.6) / 1.2) * 240); // CSS leading to Word "auto" line spacing
  const font = (name: string) => ({ font: name });
  const s = (id: string, name: string, o: Omit<IParagraphStyleOptions, 'id' | 'name'>): IParagraphStyleOptions => ({ id, name, quickFormat: true, ...o });
  const centred = AlignmentType.CENTER;
  return [
    s('Normal', 'Normal', {
      run: { ...font(body), size: half(Math.round((t.sizes.bodyPt + 0.4) * 2) / 2), color: hex(t.colours.text) },
      paragraph: para({
        indent: { firstLine: t.paragraph.spaceLines > 0 ? 0 : tw(0.2) },
        spacing: { before: 0, after: t.paragraph.spaceLines > 0 ? pt(t.paragraph.spaceLines * t.leading * t.sizes.bodyPt) : 0, line: lineTw },
        alignment: t.paragraph.align === 'justify' ? AlignmentType.JUSTIFIED : AlignmentType.LEFT,
        widowControl: true,
      }),
    }),
    s('FirstParagraph', 'First Paragraph', { basedOn: 'Normal', next: 'Normal', paragraph: { indent: { firstLine: 0 } } }),
    s('TitlePageTitle', 'Title Page Title', {
      basedOn: 'Normal',
      next: 'TitlePageSubtitle',
      run: { ...font(heading), size: half(28), bold: true, color: hex(t.colours.accent) },
      paragraph: { alignment: centred, indent: { firstLine: 0 }, spacing: { before: pt(150), after: pt(6) } },
    }),
    s('TitlePageSubtitle', 'Title Page Subtitle', {
      basedOn: 'Normal',
      run: { size: half(13) },
      paragraph: { alignment: centred, indent: { firstLine: 0 }, spacing: { after: pt(6) } },
    }),
    s('TitlePageAuthor', 'Title Page Author', {
      basedOn: 'Normal',
      run: { ...font(heading), size: half(13) },
      paragraph: { alignment: centred, indent: { firstLine: 0 }, spacing: { before: pt(60), after: pt(6) } },
    }),
    s('Copyright', 'Copyright', {
      basedOn: 'Normal',
      run: { size: half(t.sizes.smallPt + 0.4) },
      paragraph: { alignment: AlignmentType.LEFT, indent: { firstLine: 0 }, spacing: { after: pt(5) } },
    }),
    s('CopyrightFirst', 'Copyright First', {
      basedOn: 'Copyright',
      next: 'Copyright',
      run: { bold: true },
      paragraph: para({ pageBreakBefore: true, spacing: { before: pt(250), after: pt(5) } }),
    }),
    s('ContentsHeading', 'Contents Heading', {
      basedOn: 'Normal',
      next: 'ContentsEntry',
      run: { ...font(heading), size: half(20), bold: true, color: hex(t.colours.accent) },
      paragraph: para({ pageBreakBefore: true, alignment: AlignmentType.LEFT, indent: { firstLine: 0 }, spacing: { before: pt(60), after: pt(18) } }),
    }),
    s('ContentsEntry', 'Contents Entry', {
      basedOn: 'Normal',
      paragraph: { alignment: AlignmentType.LEFT, indent: { firstLine: 0 }, spacing: { before: pt(4), after: pt(2) } },
    }),
    s('ContentsSubentry', 'Contents Subentry', {
      basedOn: 'Normal',
      run: { size: half(t.sizes.bodyPt * 0.85) },
      paragraph: { alignment: AlignmentType.LEFT, indent: { firstLine: 0, left: tw(0.3) }, spacing: { after: 0 } },
    }),
    s('PartTitle', 'Part Title', {
      basedOn: 'Heading1',
      next: 'FirstParagraph',
      run: { ...font(heading), size: half(24), bold: true },
      paragraph: para({ pageBreakBefore: true, alignment: centred, outlineLevel: 0, indent: { firstLine: 0 }, spacing: { before: pt(160), after: pt(24) } }),
    }),
    s('Epigraph', 'Epigraph', {
      basedOn: 'Normal',
      run: { italics: true },
      paragraph: { alignment: centred, indent: { firstLine: 0, left: tw(0.4), right: tw(0.4) }, spacing: { before: pt(6), after: pt(6) } },
    }),
    s('Dedication', 'Dedication', {
      basedOn: 'Normal',
      run: { italics: true },
      paragraph: { alignment: centred, indent: { firstLine: 0 }, spacing: { before: pt(6), after: pt(6) } },
    }),
    s('ListBullet', 'List Bullet', {
      basedOn: 'Normal',
      paragraph: {
        numbering: { reference: 'volume-bullets', level: 0 },
        alignment: AlignmentType.LEFT,
        indent: { left: tw(0.3), hanging: tw(0.2) },
        spacing: { after: pt(3) },
      },
    }),
    s('ListNumber', 'List Number', {
      basedOn: 'Normal',
      paragraph: { alignment: AlignmentType.LEFT, indent: { left: tw(0.3), hanging: tw(0.25) }, spacing: { after: pt(3) } },
    }),
    s('TakeawaysHeading', 'Takeaways Heading', {
      basedOn: 'Normal',
      next: 'TakeawaysItem',
      run: { ...font(heading), bold: true, size: half(t.sizes.subheadingPt * 0.85), color: hex(t.colours.accent) },
      paragraph: { keepNext: true, alignment: AlignmentType.LEFT, indent: { firstLine: 0 }, spacing: { before: pt(12), after: pt(4) } },
    }),
    s('TakeawaysItem', 'Takeaways Item', { basedOn: 'ListBullet', paragraph: { numbering: { reference: 'volume-bullets', level: 0 } } }),
    s('SceneBreak', 'Scene Break', {
      basedOn: 'Normal',
      paragraph: { alignment: centred, indent: { firstLine: 0 }, spacing: { before: pt(10), after: pt(10) } },
    }),
    s('DemoNote', 'Demo Note', {
      basedOn: 'Normal',
      run: { size: half(9) },
      paragraph: {
        alignment: AlignmentType.LEFT,
        indent: { firstLine: 0 },
        spacing: { before: pt(6), after: pt(10) },
        border: {
          top: { style: BorderStyle.SINGLE, size: 6, color: '111111', space: 4 },
          bottom: { style: BorderStyle.SINGLE, size: 6, color: '111111', space: 4 },
          left: { style: BorderStyle.SINGLE, size: 6, color: '111111', space: 4 },
          right: { style: BorderStyle.SINGLE, size: 6, color: '111111', space: 4 },
        },
      },
    }),
    s('Callout', 'Callout', { basedOn: 'DemoNote' }),
    s('Quote', 'Quote', {
      basedOn: 'Normal',
      run: { italics: true },
      paragraph: { indent: { firstLine: 0, left: tw(0.3), right: tw(0.3) }, spacing: { before: pt(6), after: pt(6) } },
    }),
    s('TableText', 'Table Text', {
      basedOn: 'Normal',
      run: { size: half(8.5) },
      paragraph: { alignment: AlignmentType.LEFT, indent: { firstLine: 0 }, spacing: { line: 240 } },
    }),
    s('Caption', 'Caption', {
      basedOn: 'Normal',
      run: { size: half(t.sizes.smallPt), italics: true },
      paragraph: { alignment: centred, indent: { firstLine: 0 }, spacing: { after: pt(8) } },
    }),
  ];
}

async function imageParagraph(b: Extract<Block, { type: 'image' }>, images: Record<string, Buffer> | undefined, maxWidthPx: number): Promise<Paragraph | null> {
  let buf: Buffer | undefined;
  if (b.src.startsWith('data:')) buf = Buffer.from(b.src.slice(b.src.indexOf(',') + 1), 'base64');
  else buf = images?.[b.src];
  if (!buf) return null;
  const meta = await sharp(buf).metadata();
  const w = meta.width ?? 600;
  const h = meta.height ?? 400;
  const scale = Math.min(1, maxWidthPx / w);
  const type = meta.format === 'png' ? 'png' : meta.format === 'gif' ? 'gif' : 'jpg';
  return new Paragraph({
    style: 'FirstParagraph',
    alignment: AlignmentType.CENTER,
    children: [
      new ImageRun({
        type,
        data: buf,
        transformation: { width: Math.round(w * scale), height: Math.round(h * scale) },
        altText: { name: b.alt || 'image', description: b.alt, title: b.alt },
      }),
    ],
  });
}

const MIRROR_BEFORE = [
  'w:alignBordersAndEdges',
  'w:bordersDoNotSurroundHeader',
  'w:bordersDoNotSurroundFooter',
  'w:gutterAtTop',
  'w:hideSpellingErrors',
  'w:hideGrammaticalErrors',
  'w:activeWritingStyle',
  'w:proofState',
  'w:formsDesign',
  'w:attachedTemplate',
  'w:linkStyles',
  'w:stylePaneFormatFilter',
  'w:stylePaneSortMethod',
  'w:documentType',
  'w:mailMerge',
  'w:revisionView',
  'w:trackRevisions',
  'w:doNotTrackMoves',
  'w:doNotTrackFormatting',
  'w:documentProtection',
  'w:autoFormatOverride',
  'w:styleLockTheme',
  'w:styleLockQFSet',
  'w:defaultTabStop',
  'w:autoHyphenation',
  'w:consecutiveHyphenLimit',
  'w:hyphenationZone',
  'w:doNotHyphenateCaps',
  'w:showEnvelope',
  'w:summaryLength',
  'w:clickAndTypeStyle',
  'w:defaultTableStyle',
  'w:evenAndOddHeaders',
  'w:bookFoldRevPrinting',
  'w:bookFoldPrinting',
  'w:bookFoldPrintingSheets',
  'w:drawingGridHorizontalSpacing',
  'w:drawingGridVerticalSpacing',
  'w:characterSpacingControl',
  'w:updateFields',
  'w:compat',
  'w:rsids',
  'm:mathPr',
  'w:themeFontLang',
  'w:clrSchemeMapping',
  'w:decimalSymbol',
  'w:listSeparator',
];

/** Insert <w:mirrorMargins/> (and <w:embedTrueTypeFonts/> when fonts are embedded) into settings.xml at its schema position (the docx package has no option for it). */
export function addMirrorMargins(settingsXml: string, embedTrueTypeFonts = false): string {
  if (settingsXml.includes('<w:mirrorMargins')) return settingsXml;
  const embed = embedTrueTypeFonts && !settingsXml.includes('<w:embedTrueTypeFonts') ? '<w:embedTrueTypeFonts/>' : '';
  let at = -1;
  for (const tag of MIRROR_BEFORE) {
    const i = settingsXml.indexOf(`<${tag}`);
    if (i >= 0 && (at < 0 || i < at)) at = i;
  }
  if (at < 0) at = settingsXml.lastIndexOf('</w:settings>');
  return `${settingsXml.slice(0, at)}${embed}<w:mirrorMargins/>${settingsXml.slice(at)}`;
}

export async function exportDocx(book: BookDoc, theme: InteriorTheme = DEFAULT_INTERIOR_THEME, opts: DocxOptions = {}): Promise<Buffer> {
  const trim = opts.trim ?? '6x9';
  const lib = opts.fonts ?? loadFontLibrary();
  const warnings: string[] = [];
  // Word and Kindle only need the family name; static TTF files are embedded when available.
  const body = resolveFamily(lib, theme.fonts.body, 'Source Sans 3', warnings, { allowVariable: true });
  const heading = resolveFamily(lib, theme.fonts.heading, 'Plus Jakarta Sans', warnings, { allowVariable: true });
  const { widthIn, heightIn } = parseTrimKey(trim);
  const m = marginsFor(theme, trim);
  const secs = enabledSections(book);
  const linked = secs.filter((s) => !['titlepage', 'copyright', 'contents', 'halftitle'].includes(s.subtype));
  const mark = new Map(linked.map((s, i) => [s.id, `_sec${i + 1}`]));
  const children: (Paragraph | Table)[] = [];
  const maxImgPx = Math.round((widthIn - m.insideIn - m.outsideIn) * 96);
  let numberedInstance = 0;

  const headingPara = (s: Section, style: 'Heading1' | 'PartTitle') =>
    new Paragraph({ style, children: [new Bookmark({ id: mark.get(s.id) ?? s.id, children: [new TextRun(sectionHeading(s))] })] });
  // A chapter opener alone on its page (theme opener.ownPage): the label in its own colour over the title, centred.
  const ownOpener = theme.opener.ownPage;
  const openerPara = (s: Section) => {
    const caps = theme.opener.titleUppercase;
    const runs =
      s.kicker && s.title && theme.opener.numberFormat !== 'none'
        ? [
            new TextRun({ text: s.kicker, color: hex(theme.colours.label), allCaps: theme.opener.kickerUppercase }),
            new TextRun({ text: s.title, break: 1, allCaps: caps }),
          ]
        : [new TextRun({ text: sectionHeading(s), allCaps: caps })];
    return new Paragraph({
      style: 'Heading1',
      alignment: AlignmentType.CENTER,
      spacing: { before: pt(200), after: 0 },
      children: [new Bookmark({ id: mark.get(s.id) ?? s.id, children: runs })],
    });
  };
  const sec = theme.sections;

  for (const s of secs) {
    switch (s.subtype) {
      case 'titlepage': {
        const [t = book.meta.title, sub = '', author = book.meta.author, ed = '', ...rest] = s.lines ?? [];
        children.push(new Paragraph({ style: 'TitlePageTitle', children: [new TextRun(t)] }));
        if (sub) children.push(new Paragraph({ style: 'TitlePageSubtitle', children: [new TextRun(sub)] }));
        children.push(new Paragraph({ style: 'TitlePageAuthor', children: [new TextRun(author)] }));
        if (ed) children.push(new Paragraph({ style: 'TitlePageSubtitle', children: [new TextRun(ed.toUpperCase())] }));
        for (const x of rest) children.push(new Paragraph({ style: 'DemoNote', children: [new TextRun(x)] }));
        continue;
      }
      case 'halftitle':
        children.push(new Paragraph({ style: 'TitlePageTitle', pageBreakBefore: children.length > 0, children: [new TextRun(s.title)] }));
        continue;
      case 'copyright':
        s.blocks.forEach((b, k) => {
          if (b.type === 'paragraph') children.push(new Paragraph({ style: k === 0 ? 'CopyrightFirst' : 'Copyright', children: runsFor(b.text) }));
        });
        continue;
      case 'contents': {
        children.push(new Paragraph({ style: 'ContentsHeading', children: [new TextRun('Contents')] }));
        const after = contentsSections(book, secs, secs.indexOf(s) + 1).filter((x) => mark.has(x.id));
        for (const x of after) {
          children.push(
            new Paragraph({
              style: 'ContentsEntry',
              children: [new InternalHyperlink({ anchor: mark.get(x.id) ?? '', children: [new TextRun(sectionHeading(x))] })],
            }),
          );
          if (x.kind === 'chapter')
            for (const b of x.blocks) if (b.type === 'heading2') children.push(new Paragraph({ style: 'ContentsSubentry', children: runsFor(b.text) }));
        }
        continue;
      }
      default:
        break;
    }
    if (s.kind === 'part') {
      children.push(headingPara(s, 'PartTitle'));
      for (const b of s.blocks) if (b.type === 'paragraph') children.push(new Paragraph({ style: 'FirstParagraph', children: runsFor(b.text) }));
      continue;
    }
    const inChapter = s.kind === 'chapter';
    children.push(inChapter && ownOpener ? openerPara(s) : headingPara(s, 'Heading1'));
    let afterBreak = true;
    // The first block after an opener that sits alone on its page starts the next page.
    let breakNext = inChapter && ownOpener;
    let firstBlock = true;
    const takeBreak = (): boolean => {
      const b = breakNext;
      breakNext = false;
      return b;
    };
    const renderBlock = async (b: Block): Promise<void> => {
      switch (b.type) {
        case 'paragraph': {
          const style = s.subtype === 'dedication' ? 'Dedication' : afterBreak || b.text.startsWith('**') ? 'FirstParagraph' : 'Normal';
          children.push(new Paragraph({ style, ...(takeBreak() ? { pageBreakBefore: true } : {}), children: runsFor(b.text) }));
          break;
        }
        case 'heading2': {
          // Theme sections: each subheading in a chapter on a new page, in capitals, left or centred.
          const own = inChapter && (sec.newPage || sec.uppercase || sec.align === 'center');
          // A subheading straight after the chapter heading stays with it unless the opener sits alone on its page.
          const brk = takeBreak() || (inChapter && sec.newPage && !firstBlock);
          children.push(
            new Paragraph({
              style: 'Heading2',
              ...(brk ? { pageBreakBefore: true } : {}),
              ...(own && sec.align === 'center' ? { alignment: AlignmentType.CENTER } : {}),
              children: runsFor(b.text, own && sec.uppercase ? { allCaps: true } : {}),
            }),
          );
          break;
        }
        case 'heading3':
          children.push(new Paragraph({ style: b.level === 4 ? 'Heading4' : 'Heading3', children: runsFor(b.text) }));
          break;
        case 'list':
          if (b.ordered) {
            numberedInstance++;
            for (const it of b.items)
              children.push(
                new Paragraph({ style: 'ListNumber', numbering: { reference: 'volume-numbers', level: 0, instance: numberedInstance }, children: runsFor(it) }),
              );
          } else for (const it of b.items) children.push(new Paragraph({ style: 'ListBullet', children: runsFor(it) }));
          break;
        case 'takeaways':
          children.push(new Paragraph({ style: 'TakeawaysHeading', children: [new TextRun('Key Takeaways')] }));
          for (const it of b.items) children.push(new Paragraph({ style: 'TakeawaysItem', children: runsFor(it) }));
          break;
        case 'table': {
          const cols = Math.max(...b.rows.map((r) => r.length));
          children.push(
            new Table({
              width: { size: 100, type: WidthType.PERCENTAGE },
              rows: b.rows.map(
                (r, ri) =>
                  new TableRow({
                    tableHeader: ri === 0,
                    children: Array.from(
                      { length: cols },
                      (_v, ci) =>
                        new TableCell({
                          children: [
                            new Paragraph({ style: 'TableText', children: ri === 0 ? [new TextRun({ text: r[ci] ?? '', bold: true })] : runsFor(r[ci] ?? '') }),
                          ],
                        }),
                    ),
                  }),
              ),
            }),
          );
          break;
        }
        case 'sceneBreak':
          children.push(new Paragraph({ style: 'SceneBreak', children: [new TextRun(theme.sceneBreak)] }));
          break;
        case 'quote':
          for (const l of b.lines) children.push(new Paragraph({ style: b.variant === 'epigraph' ? 'Epigraph' : 'Quote', children: runsFor(l) }));
          if (b.attribution)
            children.push(
              new Paragraph({
                style: b.variant === 'epigraph' ? 'Epigraph' : 'Quote',
                children: [new TextRun({ text: `- ${b.attribution}`, italics: false })],
              }),
            );
          break;
        case 'callout':
          if (b.text) children.push(new Paragraph({ style: b.variant === 'demo' ? 'DemoNote' : 'Callout', children: runsFor(b.text) }));
          break;
        case 'image': {
          const p = await imageParagraph(b, opts.images, maxImgPx);
          if (p) {
            children.push(p);
            if (b.caption) children.push(new Paragraph({ style: 'Caption', children: runsFor(b.caption) }));
          }
          break;
        }
        case 'pageBreak':
          children.push(new Paragraph({ style: 'FirstParagraph', children: [new PageBreak()] }));
          break;
        // D-042: print formats draw ruled lines and tick boxes. Existing styles only, so styles.xml is unchanged.
        case 'exercise':
          children.push(new Paragraph({ style: 'TakeawaysHeading', children: runsFor(exerciseHeading(b)) }));
          afterBreak = true;
          for (const x of b.blocks) {
            await renderBlock(x);
            afterBreak = x.type !== 'paragraph';
          }
          break;
        case 'lines':
          for (let n = 0; n < clampLines(b.count); n++) children.push(ruledLine());
          break;
        case 'checklist':
          for (const it of b.items)
            children.push(new Paragraph({ style: 'FirstParagraph', children: [new CheckBox({ checked: false }), new TextRun(' '), ...runsFor(it)] }));
          break;
        case 'fillIn':
          if (b.page) children.push(new Paragraph({ style: 'FirstParagraph', children: [new PageBreak()] }));
          for (const p of b.prompts) {
            children.push(new Paragraph({ style: 'FirstParagraph', children: runsFor(p) }));
            for (let n = 0; n < fillInLines(b); n++) children.push(ruledLine());
          }
          break;
      }
    };
    for (const b of s.blocks) {
      if (breakNext && b.type !== 'paragraph' && b.type !== 'heading2') children.push(new Paragraph({ style: 'FirstParagraph', children: [new PageBreak()] }));
      if (b.type !== 'paragraph' && b.type !== 'heading2') breakNext = false;
      await renderBlock(b);
      afterBreak = b.type !== 'paragraph';
      firstBlock = false;
    }
  }

  const footer = (align: (typeof AlignmentType)[keyof typeof AlignmentType]) =>
    new Footer({
      children: [
        new Paragraph({
          style: 'FirstParagraph',
          alignment: align,
          children: [new TextRun({ children: [PageNumber.CURRENT], size: half(theme.sizes.folioPt) })],
        }),
      ],
    });
  const fontsToEmbed: { name: string; data: Buffer }[] = [];
  if (opts.embedFonts !== false) {
    for (const [fam, w] of [
      [body, theme.weights.body],
      [heading, theme.weights.heading],
    ] as const) {
      const data = fontBytes(lib, fam, w) ?? fontBytes(lib, fam, 400);
      if (data && !fontsToEmbed.some((f) => f.name === fam)) fontsToEmbed.push({ name: fam, data });
    }
  }

  const doc = new Document({
    title: book.meta.subtitle ? `${book.meta.title}: ${book.meta.subtitle}` : book.meta.title,
    creator: book.meta.author,
    description: 'Interior manuscript exported by Volume',
    evenAndOddHeaderAndFooters: true,
    ...(fontsToEmbed.length ? { fonts: fontsToEmbed } : {}),
    numbering: {
      config: [
        {
          reference: 'volume-bullets',
          levels: [
            {
              level: 0,
              format: LevelFormat.BULLET,
              text: '•',
              alignment: AlignmentType.LEFT,
              style: { paragraph: { indent: { left: tw(0.3), hanging: tw(0.2) } } },
            },
          ],
        },
        {
          reference: 'volume-numbers',
          levels: [
            {
              level: 0,
              format: LevelFormat.DECIMAL,
              text: '%1.',
              alignment: AlignmentType.LEFT,
              style: { paragraph: { indent: { left: tw(0.3), hanging: tw(0.25) } } },
            },
          ],
        },
      ],
    },
    styles: {
      default: {
        document: { run: { font: body, size: half(11) } },
        heading1: {
          run: { font: heading, size: half(20), bold: true, color: hex(theme.colours.accent) },
          paragraph: para({
            pageBreakBefore: true,
            keepNext: true,
            alignment: AlignmentType.LEFT,
            outlineLevel: 0,
            spacing: { before: pt(72), after: pt(18) },
            indent: { firstLine: 0 },
          }),
        },
        heading2: {
          run: { font: heading, size: half(12.5), bold: true, color: hex(theme.colours.accent) },
          paragraph: { keepNext: true, alignment: AlignmentType.LEFT, outlineLevel: 1, spacing: { before: pt(14), after: pt(4) }, indent: { firstLine: 0 } },
        },
        heading3: {
          run: { font: heading, size: half(11.5), bold: true, color: hex(theme.colours.text) },
          paragraph: { keepNext: true, alignment: AlignmentType.LEFT, outlineLevel: 2, spacing: { before: pt(11), after: pt(3) }, indent: { firstLine: 0 } },
        },
        heading4: {
          run: { font: heading, size: half(11), bold: true, italics: true, color: hex(theme.colours.text) },
          paragraph: { keepNext: true, alignment: AlignmentType.LEFT, outlineLevel: 3, spacing: { before: pt(9), after: pt(2) }, indent: { firstLine: 0 } },
        },
      },
      paragraphStyles: styles(theme, body, heading),
    },
    sections: [
      {
        properties: {
          titlePage: true,
          page: {
            size: { width: tw(widthIn), height: tw(heightIn) },
            margin: { top: tw(m.topIn), bottom: tw(m.bottomIn), left: tw(m.insideIn), right: tw(m.outsideIn), header: tw(0.4), footer: tw(0.38), gutter: 0 },
          },
        },
        footers: !theme.folios.enabled
          ? { default: new Footer({ children: [] }), even: new Footer({ children: [] }), first: new Footer({ children: [] }) }
          : theme.folios.position === 'center'
            ? { default: footer(AlignmentType.CENTER), even: footer(AlignmentType.CENTER), first: new Footer({ children: [] }) }
            : { default: footer(AlignmentType.RIGHT), even: footer(AlignmentType.LEFT), first: new Footer({ children: [] }) },
        children,
      },
    ],
  });
  const packed = await Packer.toBuffer(doc);
  const zip = await JSZip.loadAsync(packed);
  const settings = zip.file('word/settings.xml');
  if (settings) zip.file('word/settings.xml', addMirrorMargins(await settings.async('string'), fontsToEmbed.length > 0));
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 6 } });
}
