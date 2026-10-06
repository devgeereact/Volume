// Manuscript Markdown dialect (docs/06-EXPORT-SPEC.md): parser and writer.
// A strict superset of the P02 demo-book format (book.py), so the Windowsill Herbs manuscript
// imports unchanged and writes back byte-identical.

import type { Block, BookDoc, BookMeta, Section, SectionKind, SectionSubtype } from './model.ts';
import { SECTION_KINDS, SECTION_SUBTYPES } from './model.ts';
import { slugify, toRoman } from './text.ts';

export interface ParseOptions {
  /** BCP 47 language for meta.language. Default en-GB. */
  language?: string;
}

const FRONT_NAMES: Record<string, SectionSubtype> = {
  dedication: 'dedication',
  epigraph: 'epigraph',
  foreword: 'foreword',
  preface: 'preface',
  acknowledgements: 'acknowledgements',
  acknowledgments: 'acknowledgements',
  introduction: 'introduction',
};
const BACK_NAMES: Record<string, SectionSubtype> = {
  conclusion: 'conclusion',
  epilogue: 'epilogue',
  appendix: 'appendix',
  resources: 'resources',
  glossary: 'glossary',
  references: 'references',
  'about the author': 'about_the_author',
  'a small request': 'review_request',
  'stay in touch': 'newsletter',
};
const FRONT_SUBTYPES = new Set<SectionSubtype>([
  'titlepage',
  'copyright',
  'contents',
  'halftitle',
  'dedication',
  'epigraph',
  'foreword',
  'preface',
  'acknowledgements',
  'introduction',
]);
const BACK_SUBTYPES = new Set<SectionSubtype>([
  'conclusion',
  'epilogue',
  'appendix',
  'resources',
  'glossary',
  'references',
  'about_the_author',
  'also_by',
  'review_request',
  'newsletter',
]);

const FENCE_OPEN = /^:::\s+(\S.*?)\s*$/;
const isFenceClose = (ln: string) => ln.trim() === ':::';
const CHAPTER_RE = /^(Chapter\s+(\d+)):\s+(.+)$/i;
const KIND_MARKER_RE = /\s*\{kind=([a-z_]+)\}\s*$/;

export function kindForSubtype(subtype: SectionSubtype, afterChapters: boolean): SectionKind {
  if (subtype === 'chapter') return 'chapter';
  if (subtype === 'part') return 'part';
  if (FRONT_SUBTYPES.has(subtype)) return 'front';
  if (BACK_SUBTYPES.has(subtype)) return 'back';
  return afterChapters ? 'back' : 'front';
}

/** Map a heading (without '# ') to its subtype by the name before any colon. */
export function subtypeForHeading(heading: string): SectionSubtype {
  if (CHAPTER_RE.test(heading)) return 'chapter';
  const name = (heading.split(':')[0] ?? '').trim().toLowerCase();
  if (FRONT_NAMES[name]) return FRONT_NAMES[name];
  if (BACK_NAMES[name]) return BACK_NAMES[name];
  if (name.startsWith('also by')) return 'also_by';
  return 'other';
}

function readFence(lines: string[], start: number): { name: string; body: string[]; next: number } | null {
  const m = FENCE_OPEN.exec(lines[start] ?? '');
  if (!m || !m[1]) return null;
  const body: string[] = [];
  let j = start + 1;
  while (j < lines.length && !isFenceClose(lines[j] ?? '')) {
    body.push(lines[j] ?? '');
    j++;
  }
  return { name: m[1], body, next: Math.min(j + 1, lines.length) };
}

const nonEmpty = (ls: string[]) => ls.map((l) => l.trim()).filter(Boolean);

/** Parse the blocks of one section body. */
export function parseBlocks(lines: string[]): Block[] {
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const raw = lines[i] ?? '';
    const ln = raw.trimEnd();
    if (!ln.trim()) {
      i++;
      continue;
    }
    const fence = readFence(lines, i);
    if (fence) {
      blocks.push(fenceBlock(fence.name, fence.body));
      i = fence.next;
      continue;
    }
    if (ln.startsWith('#### ')) {
      blocks.push({ type: 'heading3', level: 4, text: ln.slice(5).trim() });
    } else if (ln.startsWith('### ')) {
      blocks.push({ type: 'heading3', text: ln.slice(4).trim() });
    } else if (ln.startsWith('## ')) {
      blocks.push({ type: 'heading2', text: ln.slice(3).trim() });
    } else if (ln.trim() === '***') {
      blocks.push({ type: 'sceneBreak' });
    } else if (ln.startsWith('- ')) {
      const items: string[] = [];
      while (i < lines.length && (lines[i] ?? '').startsWith('- ')) {
        items.push((lines[i] ?? '').slice(2).trim());
        i++;
      }
      blocks.push({ type: 'list', items });
      continue;
    } else if (/^\d+\.\s/.test(ln)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s/.test(lines[i] ?? '')) {
        items.push((lines[i] ?? '').replace(/^\d+\.\s+/, '').trim());
        i++;
      }
      blocks.push({ type: 'list', ordered: true, items });
      continue;
    } else if (ln.startsWith('|')) {
      const rows: string[][] = [];
      while (i < lines.length && (lines[i] ?? '').startsWith('|')) {
        const cells = (lines[i] ?? '')
          .trim()
          .replace(/^\|/, '')
          .replace(/\|$/, '')
          .split('|')
          .map((c) => c.trim());
        if (!cells.every((c) => /^:?-+:?$/.test(c))) rows.push(cells);
        i++;
      }
      blocks.push({ type: 'table', rows });
      continue;
    } else if (ln.startsWith('> ') || ln === '>') {
      const qlines: string[] = [];
      while (i < lines.length && /^>( |$)/.test(lines[i] ?? '')) {
        qlines.push((lines[i] ?? '').replace(/^>\s?/, '').trim());
        i++;
      }
      blocks.push({ type: 'quote', variant: 'quote', lines: qlines.filter(Boolean) });
      continue;
    } else {
      const img = /^!\[([^\]]*)\]\((\S+?)(?:\s+"([^"]*)")?\)$/.exec(ln.trim());
      if (img) {
        const block: Block = { type: 'image', alt: img[1] ?? '', src: img[2] ?? '' };
        if (img[3] !== undefined) block.caption = img[3];
        blocks.push(block);
      } else {
        blocks.push({ type: 'paragraph', text: ln.trim() });
      }
    }
    i++;
  }
  return blocks;
}

function fenceBlock(name: string, body: string[]): Block {
  const key = name.toLowerCase();
  if (key === 'takeaways') {
    return { type: 'takeaways', items: nonEmpty(body).map((l) => l.replace(/^-\s+/, '')) };
  }
  if (key === 'epigraph') {
    const ls = nonEmpty(body);
    const last = ls[ls.length - 1];
    if (last && /^-\s+/.test(last) && ls.length > 1) {
      return { type: 'quote', variant: 'epigraph', lines: ls.slice(0, -1), attribution: last.replace(/^-\s+/, '') };
    }
    return { type: 'quote', variant: 'epigraph', lines: ls };
  }
  if (key === 'pagebreak') return { type: 'pageBreak' };
  return { type: 'callout', variant: name, text: nonEmpty(body).join(' ') };
}

function uniqueId(base: string, used: Set<string>): string {
  let id = base || 'section';
  let n = 2;
  while (used.has(id)) id = `${base}-${n++}`;
  used.add(id);
  return id;
}

/** Parse a manuscript in the dialect into a BookDoc. */
export function parseManuscript(markdown: string, opts: ParseOptions = {}): BookDoc {
  const lines = markdown
    .replace(/^\uFEFF/, '')
    .replace(/\r\n?/g, '\n')
    .split('\n');
  const sections: Section[] = [];
  const used = new Set<string>();
  let cur: Section | null = null;
  let buf: string[] = [];
  let seenChapter = false;

  const flush = () => {
    if (cur) {
      cur.blocks = parseBlocks(buf);
      sections.push(cur);
    }
    cur = null;
    buf = [];
  };

  let i = 0;
  while (i < lines.length) {
    const ln = lines[i] ?? '';
    const fence = FENCE_OPEN.exec(ln);
    const fname = fence?.[1]?.toLowerCase();
    if (fence && ['part', 'titlepage', 'copyright', 'contents', 'halftitle'].includes(fname ?? '')) {
      const f = readFence(lines, i);
      if (f) {
        flush();
        sections.push(frontFenceSection(f.name.toLowerCase(), f.body, used));
        i = f.next;
        continue;
      }
    }
    if (ln.startsWith('# ')) {
      flush();
      let head = ln.slice(2).trim();
      let explicit: string | undefined;
      const km = KIND_MARKER_RE.exec(head);
      if (km) {
        explicit = km[1];
        head = head.slice(0, km.index).trim();
      }
      const cm = CHAPTER_RE.exec(head);
      let subtype: SectionSubtype = subtypeForHeading(head);
      let kind: SectionKind;
      if (explicit && (SECTION_SUBTYPES as readonly string[]).includes(explicit)) {
        subtype = explicit as SectionSubtype;
        kind = kindForSubtype(subtype, seenChapter);
      } else if (explicit && (SECTION_KINDS as readonly string[]).includes(explicit)) {
        kind = explicit as SectionKind;
      } else {
        kind = kindForSubtype(subtype, seenChapter);
      }
      if (subtype === 'chapter') seenChapter = true;
      const section: Section = {
        id: uniqueId(slugify(head), used),
        kind,
        subtype,
        title: cm && subtype === 'chapter' ? (cm[3] ?? head) : head,
        blocks: [],
      };
      if (cm && subtype === 'chapter') {
        section.kicker = cm[1] ?? '';
        section.number = Number(cm[2]);
      }
      if (explicit) section.explicitKind = true;
      cur = section;
    } else if (cur) {
      buf.push(ln);
    }
    i++;
  }
  flush();
  return { meta: metaFromSections(sections, opts.language ?? 'en-GB'), sections };
}

function frontFenceSection(name: string, body: string[], used: Set<string>): Section {
  if (name === 'titlepage')
    return { id: uniqueId('title-page', used), kind: 'front', subtype: 'titlepage', title: 'Title Page', lines: nonEmpty(body), blocks: [] };
  if (name === 'halftitle')
    return { id: uniqueId('half-title', used), kind: 'front', subtype: 'halftitle', title: nonEmpty(body)[0] ?? '', lines: nonEmpty(body), blocks: [] };
  if (name === 'contents') return { id: uniqueId('contents', used), kind: 'front', subtype: 'contents', title: 'Contents', blocks: [] };
  if (name === 'copyright') return { id: uniqueId('copyright', used), kind: 'front', subtype: 'copyright', title: 'Copyright', blocks: parseBlocks(body) };
  // part: label, title, then optional opener paragraphs
  const ls = nonEmpty(body);
  const label = ls[0] ?? 'Part';
  const title = ls[1] ?? '';
  return {
    id: uniqueId(slugify(`${label} ${title}`), used),
    kind: 'part',
    subtype: 'part',
    kicker: label,
    title,
    blocks: ls.slice(2).map((t) => ({ type: 'paragraph', text: t })),
  };
}

function metaFromSections(sections: Section[], language: string): BookMeta {
  const tp = sections.find((s) => s.subtype === 'titlepage');
  const half = sections.find((s) => s.subtype === 'halftitle');
  const ls = tp?.lines ?? [];
  const meta: BookMeta = { title: ls[0] ?? half?.title ?? '', author: ls[2] ?? '', language };
  if (ls[1]) meta.subtitle = ls[1];
  if (ls[3]) meta.edition = ls[3];
  if (ls.length > 4) meta.titlePageNotes = ls.slice(4);
  const cr = sections.find((s) => s.subtype === 'copyright');
  if (cr) {
    for (const b of cr.blocks) {
      if (b.type !== 'paragraph') continue;
      const y = /(?:©|copyright)\s*(?:©\s*)?(\d{4})/i.exec(b.text);
      if (y) {
        meta.year = Number(y[1]);
        break;
      }
    }
  }
  return meta;
}

// ---------- writer ----------

function writeBlock(b: Block): string {
  switch (b.type) {
    case 'paragraph':
      return b.text;
    case 'heading2':
      return `## ${b.text}`;
    case 'heading3':
      return `${b.level === 4 ? '####' : '###'} ${b.text}`;
    case 'list':
      return b.items.map((it, k) => (b.ordered ? `${k + 1}. ${it}` : `- ${it}`)).join('\n');
    case 'table': {
      const [head, ...rows] = b.rows;
      if (!head) return '';
      const row = (cells: string[]) => `| ${cells.join(' | ')} |`;
      return [row(head), `|${head.map(() => '---').join('|')}|`, ...rows.map(row)].join('\n');
    }
    case 'sceneBreak':
      return '***';
    case 'quote':
      if (b.variant === 'epigraph') {
        return ['::: epigraph', ...b.lines, ...(b.attribution ? [`- ${b.attribution}`] : []), ':::'].join('\n');
      }
      return b.lines.map((l) => `> ${l}`).join('\n');
    case 'takeaways':
      return ['::: takeaways', ...b.items.map((it) => `- ${it}`), ':::'].join('\n');
    case 'callout':
      return [`::: ${b.variant}`, ...(b.text ? [b.text] : []), ':::'].join('\n');
    case 'image':
      return `![${b.alt}](${b.src}${b.caption !== undefined ? ` "${b.caption}"` : ''})`;
    case 'pageBreak':
      return '::: pagebreak\n:::';
  }
}

function writeSection(s: Section): string {
  switch (s.subtype) {
    case 'titlepage':
      return ['::: titlepage', ...(s.lines ?? []), ':::'].join('\n');
    case 'halftitle':
      return ['::: halftitle', ...(s.lines ?? [s.title]), ':::'].join('\n');
    case 'contents':
      return '::: contents\n:::';
    case 'copyright':
      return `::: copyright\n${s.blocks.map(writeBlock).join('\n\n')}\n:::`;
    case 'part': {
      const paras = s.blocks.filter((b) => b.type === 'paragraph').map((b) => (b.type === 'paragraph' ? b.text : ''));
      return ['::: part', s.kicker ?? 'Part', s.title, ...paras, ':::'].join('\n');
    }
    default: {
      let head = s.kicker ? `${s.kicker}: ${s.title}` : s.title;
      if (s.explicitKind) head += ` {kind=${s.subtype === 'other' ? s.kind : s.subtype}}`;
      return [`# ${head}`, ...s.blocks.map(writeBlock)].join('\n\n');
    }
  }
}

export interface SerialiseOptions {
  /** Include sections switched off by the owner. Default false. */
  includeDisabled?: boolean;
}

/** Write a BookDoc back to the dialect. parse(write(x)) is stable and write(parse(file)) === file for writer output. */
export function serialiseManuscript(book: BookDoc, opts: SerialiseOptions = {}): string {
  const secs = opts.includeDisabled ? book.sections : book.sections.filter((s) => s.enabled !== false);
  return `${secs.map(writeSection).join('\n\n')}\n`;
}

/** Build the title page lines from meta (title, subtitle, author, edition, notes). */
export function titlePageLines(meta: BookMeta): string[] {
  return [meta.title, meta.subtitle ?? '', meta.author, ...(meta.edition ? [meta.edition] : []), ...(meta.titlePageNotes ?? [])];
}

/** Next part label ("Part I", "Part II", ...). */
export function partLabel(n: number): string {
  return `Part ${toRoman(n)}`;
}
