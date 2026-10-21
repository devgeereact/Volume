#!/usr/bin/env node
// Convert DOCX files exported from Apple Pages into Volume Markdown (the dialect parseManuscript reads,
// docs/book-production/EXPORT-SPEC.md), ready for POST /books/import-manuscript.
//
//   node scripts/pages-docx-to-md.mjs <in.docx|folder> <outFolder> [--author "Name"]
//
// Pages exports keep their paragraph style names (word/styles.xml), but authors reuse styles freely:
// "Title 2" may hold "CHAPTER 1", "Chapter" may hold a subheading, "Dedication" may hold body text.
// So structure comes from the text first (CHAPTER N, Day N, Part One, INTRODUCTION, ABOUT THE AUTHOR,
// the contents page) and from the style second (heading styles become ## or ###, body styles paragraphs).
// Headers and footers are never read. Contents pages are replaced by `::: contents`. A trailing KDP
// metadata block (Amazon Product Description, Amazon Categories, SEO Keywords, Keywords) is dropped.

import { readdir, readFile, mkdir, writeFile, stat } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import JSZip from 'jszip';

export const DEFAULT_AUTHOR = 'Harni Muharami';

// ---------- styles ----------

/** Styles whose paragraphs are never part of the book text. */
const IGNORED_STYLE = /^(header\s*&\s*footer|header|footer|page number)$/i;
/** Contents page entries. */
const TOC_STYLE = /^(table of contents?|toc\s*\d*|contents)$/i;
/** Heading styles that make a `###` (the lower level). */
const MINOR_HEADING_STYLE = /^(subheading|heading\s+black|heading\s*[3-6]|sub\s*heading\s*\d*)$/i;
/** Heading styles that make a `##`. */
const MAJOR_HEADING_STYLE = /^(title(\s*\d+)?|sub\s*title(\s*\d+)?|heading(\s*[12])?|chapter(\s*\d+)?|chapter number|headers?)$/i;
/** Title page styles that may carry the book title. */
const TITLE_STYLE = /^title(\s*\d+)?$/i;

const isHeadingStyle = (style) => !IGNORED_STYLE.test(style) && (MAJOR_HEADING_STYLE.test(style) || MINOR_HEADING_STYLE.test(style));

// ---------- section names ----------

/** Front and back matter headings, by normalised text, to the heading Volume expects. */
const SECTION_NAMES = {
  dedication: 'Dedication',
  acknowledgements: 'Acknowledgements',
  acknowledgments: 'Acknowledgements',
  acknowledgement: 'Acknowledgements',
  introduction: 'Introduction',
  preface: 'Preface',
  foreword: 'Foreword',
  prologue: 'Prologue',
  epigraph: 'Epigraph',
  conclusion: 'Conclusion',
  epilogue: 'Epilogue',
  afterword: 'Afterword',
  glossary: 'Glossary',
  references: 'References',
  resources: 'Resources',
  appendix: 'Appendix',
  'about the author': 'About the Author',
  'about author': 'About the Author',
};
/** Headings Volume files as front matter wherever they stand. */
const FRONT_MATTER_NAMES = new Set(['Dedication', 'Acknowledgements', 'Introduction', 'Preface', 'Foreword', 'Epigraph']);
const CONTENTS_NAMES = new Set(['contents', 'table of contents', 'table of content']);
const DISCLAIMER_NAMES = new Set(['disclaimer']);
/** KDP listing notes some manuscripts end with: everything from here on is dropped. */
const KDP_TAIL_NAMES = new Set([
  'amazon product description',
  'amazon description',
  'amazon categories',
  'amazon keywords',
  'seo keywords',
  'keywords',
  'kdp keywords',
  'kdp categories',
  'kdp metadata',
  'book description',
  'product description',
  'categories',
]);

const NUMBER_WORDS = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
};

/** "12", "Twelve", "Twenty-One", "twenty one" or a Roman numeral to a number, or null. */
export function parseNumber(raw) {
  const s = raw.trim().toLowerCase();
  if (/^\d+$/.test(s)) return Number(s);
  if (NUMBER_WORDS[s] !== undefined) return NUMBER_WORDS[s];
  const m = /^(twenty|thirty|forty|fifty)[- ](one|two|three|four|five|six|seven|eight|nine)$/.exec(s);
  if (m && m[1] && m[2]) return (NUMBER_WORDS[m[1]] ?? 0) + (NUMBER_WORDS[m[2]] ?? 0);
  if (/^[ivxlc]+$/.test(s)) {
    const v = { i: 1, v: 5, x: 10, l: 50, c: 100 };
    let total = 0;
    for (let k = 0; k < s.length; k++) {
      const cur = v[s[k]] ?? 0;
      const next = v[s[k + 1]] ?? 0;
      total += cur < next ? -cur : cur;
    }
    return total || null;
  }
  return null;
}

const NUM = String.raw`(\d+|[a-z]+(?:[- ][a-z]+)?)`;
const CHAPTER_LINE = new RegExp(String.raw`^(chapter|day)\s+${NUM}\s*\.?\s*(?:[:.\-–—]\s*(.+))?$`, 'i');
const PART_LINE = new RegExp(String.raw`^(part|week)\s+${NUM}\s*\.?\s*(?:[:.\-–—]\s*(.+))?$`, 'i');
const NUMBERED_TITLE = /^(\d{1,2})\.\s+(\S.*)$/;
const RULE_LINE = /^[-=_*~—–]{5,}$/;
const BULLET_PREFIX = /^[•◦▪●■‣∙·]\s*|^[-–]\s+/;

/** Lower-case, straight quotes, letters and digits only: for comparing headings with contents entries. */
export function normalise(text) {
  return text
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function parseChapterLine(text) {
  const m = CHAPTER_LINE.exec(text.trim());
  if (!m || !m[1] || !m[2]) return null;
  const n = parseNumber(m[2]);
  if (n === null) return null;
  return { label: m[1].toLowerCase(), number: n, title: (m[3] ?? '').trim() };
}

function parsePartLine(text) {
  const m = PART_LINE.exec(text.trim());
  if (!m || !m[1] || !m[2]) return null;
  const n = parseNumber(m[2]);
  if (n === null) return null;
  return { label: `${m[1][0]?.toUpperCase() ?? ''}${m[1].slice(1).toLowerCase()} ${m[2].trim()}`, number: n, title: (m[3] ?? '').trim() };
}

// ---------- text helpers ----------

const words = (text) => text.split(/\s+/).filter(Boolean);
const wordCount = (text) => words(text).length;

/** True when the letters are (nearly) all capitals. */
export function isMostlyCaps(text) {
  const letters = text.replace(/[^A-Za-z]/g, '');
  if (letters.length < 2) return false;
  const upper = letters.replace(/[^A-Z]/g, '').length;
  return upper / letters.length >= 0.85;
}

const SMALL_WORDS = new Set([
  'a',
  'an',
  'and',
  'as',
  'at',
  'but',
  'by',
  'for',
  'from',
  'in',
  'into',
  'nor',
  'of',
  'on',
  'or',
  'over',
  'per',
  'the',
  'to',
  'via',
  'vs',
  'with',
]);
/** Always upper case in titles, whatever the body text says. */
const BASE_ACRONYMS = [
  'NHS',
  'NMC',
  'PALS',
  'HCA',
  'HCAS',
  'HR',
  'GP',
  'GPS',
  'A&E',
  'ICU',
  'ITU',
  'CQC',
  'NICE',
  'UK',
  'AI',
  'MDT',
  'CPD',
  'PPE',
  'SBAR',
  'DBS',
  'RCN',
  'ED',
  'IV',
  'OK',
  'TV',
  'ID',
];
/** Words that appear in capitals for emphasis, not as acronyms. */
const NOT_ACRONYMS = new Set([
  'I',
  'A',
  'AN',
  'THE',
  'AND',
  'OR',
  'NOT',
  'NO',
  'YES',
  'STOP',
  'DO',
  'DON',
  'BE',
  'IS',
  'IT',
  'IN',
  'ON',
  'TO',
  'OF',
  'WE',
  'YOU',
  'ME',
  'MY',
  'US',
  'SO',
  'IF',
  'AT',
  'BY',
  'UP',
  'GO',
  'ALL',
  'NOW',
  'ONE',
  'NEVER',
  'ALWAYS',
  'WHY',
  'HOW',
  'WHAT',
]);

/** Collect acronyms the body text writes in capitals (at least twice), plus the base list. */
export function collectAcronyms(texts) {
  const counts = new Map();
  for (const t of texts) {
    if (isMostlyCaps(t)) continue;
    for (const m of t.matchAll(/(?<![A-Za-z])([A-Z][A-Z0-9&]{1,5})(?:s|'s|’s)?(?![A-Za-z])/g)) {
      const w = m[1] ?? '';
      if (NOT_ACRONYMS.has(w)) continue;
      counts.set(w, (counts.get(w) ?? 0) + 1);
    }
  }
  const set = new Set(BASE_ACRONYMS);
  for (const [w, n] of counts) if (n >= 2) set.add(w);
  return set;
}

/** Title case for a heading written in capitals, keeping acronyms upper case. */
export function titleCase(text, acronyms = new Set(BASE_ACRONYMS)) {
  const parts = text.trim().split(/(\s+)/);
  const wordIdx = parts.map((p, i) => (/\S/.test(p) ? i : -1)).filter((i) => i >= 0);
  const first = wordIdx[0];
  const last = wordIdx[wordIdx.length - 1];
  let afterColon = false;
  return parts
    .map((p, i) => {
      if (!/\S/.test(p)) return p;
      const forceCap = i === first || i === last || afterColon;
      afterColon = /[:.!?]$/.test(p);
      return p
        .split('-')
        .map((seg, k) => caseWord(seg, acronyms, k === 0 ? forceCap : false))
        .join('-');
    })
    .join('');
}

function caseWord(seg, acronyms, forceCap) {
  const m = /^([^A-Za-z0-9]*)([A-Za-z0-9&'’]*)(.*)$/.exec(seg);
  if (!m) return seg;
  const [, pre = '', core = '', post = ''] = m;
  if (!core) return seg;
  const bare = core.replace(/(?:'s|’s|s)$/i, '');
  if (acronyms.has(core.toUpperCase()) || (bare.length > 1 && acronyms.has(bare.toUpperCase()) && core.toUpperCase() !== core.toUpperCase().toLowerCase())) {
    if (acronyms.has(core.toUpperCase())) return pre + core.toUpperCase() + post;
    const suffix = core.slice(bare.length).toLowerCase();
    return pre + bare.toUpperCase() + suffix + post;
  }
  const lower = core.toLowerCase();
  if (!forceCap && SMALL_WORDS.has(lower)) return pre + lower + post;
  return pre + lower.charAt(0).toUpperCase() + lower.slice(1) + post;
}

/** Straight quotes to curly ones. Em dashes and spelling are left as they are. */
export function curlyQuotes(text) {
  let out = '';
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    const prev = i > 0 ? (text[i - 1] ?? '') : '';
    const opening = i === 0 || /[\s([{—–/-]/.test(prev);
    if (c === '"') out += opening ? '“' : '”';
    else if (c === "'") out += opening && /[A-Za-z0-9]/.test(text[i + 1] ?? '') && !/^'(?:\d0s|tis|twas|em\b)/i.test(text.slice(i)) ? '‘' : '’';
    else out += c;
  }
  return out;
}

function tidy(text) {
  return text
    .replace(/[\u00A0\u2007\u202F]/g, ' ')
    .replace(/\u2011/g, '-')
    .replace(/[\u200B\uFEFF]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// ---------- DOCX reading ----------

function decodeXml(s) {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

const attr = (xml, name) => new RegExp(`${name}="([^"]*)"`).exec(xml)?.[1];
const flagOn = (rPr, tag) => {
  const m = new RegExp(`<w:${tag}(?:\\s+w:val="([^"]*)")?\\s*/>`).exec(rPr);
  if (!m) return false;
  return m[1] === undefined || !/^(0|false|off|none)$/i.test(m[1]);
};

function readStyles(xml) {
  const names = new Map();
  for (const m of xml.matchAll(/<w:style\b([^>]*)>([\s\S]*?)<\/w:style>/g)) {
    const id = attr(m[1] ?? '', 'w:styleId');
    if (!id) continue;
    const name = /<w:name w:val="([^"]*)"/.exec(m[2] ?? '')?.[1];
    names.set(id, decodeXml(name ?? id));
  }
  return names;
}

function readNumbering(xml) {
  const abstractFormats = new Map();
  for (const m of xml.matchAll(/<w:abstractNum\b[^>]*w:abstractNumId="([^"]*)"[^>]*>([\s\S]*?)<\/w:abstractNum>/g)) {
    const levels = new Map();
    for (const l of (m[2] ?? '').matchAll(/<w:lvl\b[^>]*w:ilvl="(\d+)"[^>]*>([\s\S]*?)<\/w:lvl>/g)) {
      levels.set(l[1], /<w:numFmt w:val="([^"]*)"/.exec(l[2] ?? '')?.[1] ?? 'bullet');
    }
    abstractFormats.set(m[1], levels);
  }
  const nums = new Map();
  for (const m of xml.matchAll(/<w:num\b[^>]*w:numId="([^"]*)"[^>]*>([\s\S]*?)<\/w:num>/g)) {
    const abs = /<w:abstractNumId w:val="([^"]*)"/.exec(m[2] ?? '')?.[1];
    if (abs !== undefined) nums.set(m[1], abstractFormats.get(abs) ?? new Map());
  }
  return nums;
}

/**
 * Read the body paragraphs of a DOCX: style name, plain text, inline-marked text, whether every run is
 * bold, and list membership. Headers, footers, footnotes and comments live in other parts and are skipped.
 */
export async function readDocx(data) {
  const zip = await JSZip.loadAsync(data);
  const docXml = await zip.file('word/document.xml')?.async('string');
  if (!docXml) throw new Error('Not a DOCX file: word/document.xml is missing.');
  const styles = readStyles((await zip.file('word/styles.xml')?.async('string')) ?? '');
  const numbering = readNumbering((await zip.file('word/numbering.xml')?.async('string')) ?? '');
  const body = /<w:body>([\s\S]*)<\/w:body>/.exec(docXml)?.[1] ?? docXml;
  const paragraphs = [];
  for (const p of body.matchAll(/<w:p(?=[\s>/])(?:[^>]*\/>|[^>]*>([\s\S]*?)<\/w:p>)/g)) {
    const inner = p[1] ?? '';
    const pPr = /<w:pPr>([\s\S]*?)<\/w:pPr>/.exec(inner)?.[1] ?? '';
    const styleId = /<w:pStyle w:val="([^"]*)"/.exec(pPr)?.[1] ?? '';
    const style = styles.get(styleId) ?? styleId;
    let list = null;
    const numId = /<w:numId w:val="([^"]*)"/.exec(pPr)?.[1];
    if (numId && numId !== '0') {
      const ilvl = /<w:ilvl w:val="(\d+)"/.exec(pPr)?.[1] ?? '0';
      const fmt = numbering.get(numId)?.get(ilvl) ?? 'bullet';
      list = { ordered: fmt !== 'bullet' && fmt !== 'none' };
    }
    const runs = [];
    for (const r of inner.matchAll(/<w:r(?=[\s>])[^>]*>([\s\S]*?)<\/w:r>/g)) {
      const rInner = r[1] ?? '';
      const rPr = /<w:rPr>([\s\S]*?)<\/w:rPr>/.exec(rInner)?.[1] ?? '';
      let text = '';
      for (const t of rInner.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>|<w:t\s*\/>|<w:(tab|noBreakHyphen|softHyphen|cr)\s*\/>|<w:br\b([^>]*)\/>/g)) {
        if (t[1] !== undefined) text += decodeXml(t[1]);
        else if (t[2] === 'tab' || t[2] === 'cr') text += ' ';
        else if (t[2] === 'noBreakHyphen') text += '-';
        else if (t[3] !== undefined && !/w:type="page"/.test(t[3])) text += ' ';
      }
      if (text) runs.push({ text, bold: flagOn(rPr, 'b'), italic: flagOn(rPr, 'i') });
    }
    const raw = runs.map((r) => r.text).join('');
    const text = tidy(raw);
    const visible = runs.filter((r) => r.text.trim());
    const bold = visible.length > 0 && visible.every((r) => r.bold);
    const italic = visible.length > 0 && visible.every((r) => r.italic);
    paragraphs.push({ style, text, marked: tidy(markInline(runs, bold, italic)), bold, list });
  }
  return paragraphs;
}

/** Wrap partly bold or italic runs in ** and *. Whole-paragraph emphasis is left to the caller. */
function markInline(runs, allBold, allItalic) {
  const merged = [];
  for (const r of runs) {
    const b = r.bold && !allBold;
    const it = r.italic && !allItalic;
    const prev = merged[merged.length - 1];
    if (prev && ((prev.b === b && prev.it === it) || !r.text.trim())) prev.text += r.text;
    else merged.push({ text: r.text, b, it });
  }
  return merged
    .map((r) => {
      if ((!r.b && !r.it) || !r.text.trim() || r.text.includes('*')) return r.text;
      const lead = /^\s*/.exec(r.text)?.[0] ?? '';
      const trail = /\s*$/.exec(r.text)?.[0] ?? '';
      const mark = r.b && r.it ? '***' : r.b ? '**' : '*';
      return `${lead}${mark}${r.text.trim()}${mark}${trail}`;
    })
    .join('');
}

// ---------- structure ----------

function sectionNameOf(text) {
  const key = normalise(text);
  return SECTION_NAMES[key] ?? null;
}

const isRule = (p) => RULE_LINE.test(p.text.replace(/\s+/g, ''));
const skipStyle = (p) => IGNORED_STYLE.test(p.style);

/** Contents page entries, as { number, title } for chapters, in order. */
function readContents(items) {
  const chapters = [];
  for (let i = 0; i < items.length; i++) {
    const t = items[i]?.text ?? '';
    const ch = parseChapterLine(t);
    if (!ch) continue;
    let title = ch.title;
    if (!title) {
      const next = items[i + 1]?.text ?? '';
      if (next && !parseChapterLine(next) && !parsePartLine(next) && !sectionNameOf(next)) title = next;
    }
    chapters.push({ label: ch.label, number: ch.number, title });
  }
  return chapters;
}

/**
 * Convert the paragraphs of one Pages DOCX into Volume Markdown.
 * Returns the Markdown and a report (title, contents chapter count, notes for a human to check).
 */
export function paragraphsToMarkdown(input, opts = {}) {
  const author = opts.author ?? DEFAULT_AUTHOR;
  const notes = [];
  const paras = input.filter((p) => !skipStyle(p));
  const acronyms = collectAcronyms(paras.map((p) => p.text));
  const caseIfCaps = (t) => (isMostlyCaps(t) ? titleCase(t, acronyms) : t);
  const authorLine = (t) => new RegExp(`^(by\\s+)?${author.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\.?$`, 'i').test(t.trim());

  // The KDP metadata tail: cut at the first heading-like line that names it.
  let end = paras.length;
  for (let i = 0; i < paras.length; i++) {
    const p = paras[i];
    if (p && KDP_TAIL_NAMES.has(normalise(p.text)) && wordCount(p.text) <= 4) {
      end = i;
      notes.push(`dropped a KDP metadata block from "${p.text}" (${paras.length - i} paragraphs)`);
      break;
    }
  }
  const items = paras.slice(0, end);

  // The contents page: the heading, then entries up to the next heading in the same style as it.
  let tocStart = -1;
  let tocEnd = -1;
  for (let i = 0; i < items.length; i++) {
    const p = items[i];
    if (p && CONTENTS_NAMES.has(normalise(p.text)) && !TOC_STYLE.test(p.style)) {
      tocStart = i;
      break;
    }
  }
  if (tocStart >= 0) {
    const headStyle = items[tocStart]?.style;
    tocEnd = items.length;
    for (let i = tocStart + 1; i < items.length; i++) {
      const p = items[i];
      if (!p || !p.text || TOC_STYLE.test(p.style)) continue;
      const strong = p.style === headStyle || (isHeadingStyle(p.style) && !TOC_STYLE.test(p.style));
      const opens = sectionNameOf(p.text) || parseChapterLine(p.text) || parsePartLine(p.text);
      // A long paragraph means the contents page is over even if no heading was recognised.
      const long = wordCount(p.text) > 30;
      if ((strong && opens && p.style === headStyle) || long) {
        tocEnd = long && !(strong && opens) ? backUpToHeading(items, tocStart + 1, i) : i;
        break;
      }
    }
  }
  const tocItems = tocStart >= 0 ? items.slice(tocStart + 1, tocEnd).filter((p) => p.text) : items.filter((p) => TOC_STYLE.test(p.style) && p.text);
  const contents = readContents(tocItems);
  const inToc = (i) => (tocStart >= 0 && i > tocStart && i < tocEnd) || TOC_STYLE.test(items[i]?.style ?? '');

  // Title page and copyright: everything before the first section heading.
  let firstSection = items.findIndex(
    (p, i) => !inToc(i) && i !== tocStart && p.text && (sectionNameOf(p.text) || parseChapterLine(p.text) || parsePartLine(p.text)),
  );
  if (tocStart >= 0 && (firstSection < 0 || tocStart < firstSection)) firstSection = tocStart;
  if (firstSection < 0) firstSection = items.length;
  const front = items.slice(0, firstSection).filter((p) => p.text);
  const crIdx = front.findIndex((p) => /©|all rights reserved|no part of this (book|publication)/i.test(p.text));
  const titleBlock = (crIdx >= 0 ? front.slice(0, crIdx) : front).filter((p) => !authorLine(p.text));
  const copyrightBlock = crIdx >= 0 ? front.slice(crIdx) : [];

  let title = '';
  let subtitle = '';
  if (titleBlock.length) {
    const first = titleBlock[0];
    title = first?.text ?? '';
    let k = 1;
    while (k < titleBlock.length) {
      const next = titleBlock[k];
      if (!next) break;
      const prevEndsOpen = /[,:;&]$/.test(title.trim());
      const bothTitles = TITLE_STYLE.test(first?.style ?? '') && TITLE_STYLE.test(next.style);
      if (!prevEndsOpen && !bothTitles) break;
      title = prevEndsOpen ? `${title.trim()} ${next.text}` : `${title.trim()}: ${next.text}`;
      k++;
    }
    subtitle = titleBlock
      .slice(k)
      .map((p) => p.text)
      .join(' ')
      .replace(/[.]$/, '');
  }
  title = curlyQuotes(caseIfCaps(title.replace(/:(?=\S)/g, ': ')));
  subtitle = curlyQuotes(caseIfCaps(subtitle));
  if (!title) notes.push('no title found on the title page');

  const out = [];
  const titleLines = [title, ...(subtitle ? [subtitle, author] : [])];
  out.push(['::: titlepage', ...titleLines, ':::'].join('\n'));
  if (copyrightBlock.length) {
    const lines = copyrightBlock.map((p) => (DISCLAIMER_NAMES.has(normalise(p.text)) ? '**Disclaimer**' : curlyQuotes(p.marked)));
    out.push(`::: copyright\n${lines.join('\n\n')}\n:::`);
  }

  // Body: front matter, parts, chapters, back matter.
  const chapterTitles = new Map(contents.map((c) => [c.number, c.title]));
  const chapters = [];
  let lastChapter = 0;
  let current = null; // the section being written: 'chapter' | 'front' | 'back' | 'part'
  let partLines = null;
  let listBuf = null;
  const flushList = () => {
    if (listBuf && listBuf.items.length) out.push(listBuf.items.map((t, n) => (listBuf.ordered ? `${n + 1}. ${t}` : `- ${t}`)).join('\n'));
    listBuf = null;
  };
  const flushPart = () => {
    if (partLines) out.push(['::: part', ...partLines, ':::'].join('\n'));
    partLines = null;
  };
  const emit = (block) => {
    flushList();
    if (partLines && current === 'part') {
      partLines.push(block);
      return;
    }
    out.push(block);
  };
  const startSection = (heading) => {
    flushList();
    flushPart();
    out.push(heading);
  };

  /** Read the title lines that follow a chapter or part line, from index j. Returns [title, next index]. */
  const readTitle = (j, fallback) => {
    let k = j;
    while (k < items.length && (!items[k]?.text || isRule(items[k]))) k++;
    const first = items[k];
    if (!first || !first.text || sectionNameOf(first.text) || parseChapterLine(first.text) || parsePartLine(first.text)) return [fallback, j];
    const headingLike = isHeadingStyle(first.style) || isMostlyCaps(first.text) || first.bold;
    if (!headingLike || wordCount(first.text) > 25 || (!isHeadingStyle(first.style) && /[.!?]$/.test(first.text))) return [fallback, j];
    let text = first.text;
    k++;
    while (k < items.length) {
      const next = items[k];
      if (!next) break;
      if (!next.text) {
        k++;
        // A blank line ends the title unless the title so far ends with a colon or comma.
        if (!/[,:;&]$/.test(text.trim())) break;
        continue;
      }
      if (next.style !== first.style || isRule(next) || sectionNameOf(next.text) || parseChapterLine(next.text)) break;
      const openEnd = /[,:;&]$/.test(text.trim()) || /\b(and|or|of|the|for|to|with)$/i.test(text.trim());
      const capsRun = isMostlyCaps(text) && isMostlyCaps(next.text);
      if (!openEnd && !capsRun) break;
      text = `${text.trim()} ${next.text}`;
      k++;
    }
    return [text.replace(/[:\s]+$/, ''), k];
  };

  const promoted = [];
  for (let i = firstSection; i < items.length; i++) {
    const p = items[i];
    if (!p) continue;
    if (i === tocStart) {
      startSection('::: contents\n:::');
      current = 'front';
      continue;
    }
    if (inToc(i) || !p.text || isRule(p)) continue;

    const name = sectionNameOf(p.text);
    if (name && wordCount(p.text) <= 4 && (isHeadingStyle(p.style) || isMostlyCaps(p.text) || p.bold || wordCount(p.text) <= 3)) {
      // A front matter name after the chapters (Acknowledgements at the back) stays at the back.
      const backAfterChapters = lastChapter > 0 && FRONT_MATTER_NAMES.has(name);
      startSection(`# ${name}${backAfterChapters ? ' {kind=back}' : ''}`);
      current = name === 'About the Author' || lastChapter > 0 ? 'back' : 'front';
      continue;
    }

    const part = parsePartLine(p.text);
    if (part && wordCount(p.text) <= 12) {
      const [ptitle, next] = part.title ? [part.title, i + 1] : readTitle(i + 1, '');
      flushList();
      flushPart();
      partLines = [part.label, curlyQuotes(caseIfCaps(ptitle))].filter(Boolean);
      current = 'part';
      i = next - 1;
      continue;
    }

    let chapter = parseChapterLine(p.text);
    if (chapter && wordCount(p.text) > 15) chapter = null;
    let chapterTitleKnown = '';
    if (!chapter && contents.length) {
      const numbered = NUMBERED_TITLE.exec(p.text);
      const expected = lastChapter + 1;
      const tocTitle = chapterTitles.get(expected);
      if (numbered && Number(numbered[1]) === expected && (p.bold || isHeadingStyle(p.style)) && wordCount(p.text) <= 20) {
        chapter = { label: 'chapter', number: expected, title: numbered[2] ?? '' };
      } else if (tocTitle && normalise(p.text) === normalise(tocTitle) && (isHeadingStyle(p.style) || p.bold || isMostlyCaps(p.text))) {
        chapter = { label: 'chapter', number: expected, title: p.text };
        chapterTitleKnown = p.text;
      }
    }
    if (chapter) {
      let ctitle = chapter.title || chapterTitleKnown;
      let next = i + 1;
      if (!ctitle) [ctitle, next] = readTitle(i + 1, chapterTitles.get(chapter.number) ?? '');
      ctitle = curlyQuotes(caseIfCaps(ctitle.replace(/[:\s]+$/, '')));
      if (chapter.number !== lastChapter + 1) notes.push(`chapter ${chapter.number} follows chapter ${lastChapter}`);
      if (chapter.label === 'day' && !notes.some((n) => n.startsWith('"Day N"'))) notes.push('"Day N" headings are written as chapters (Chapter N: title)');
      lastChapter = chapter.number;
      chapters.push({ number: chapter.number, title: ctitle });
      flushList();
      flushPart();
      out.push(ctitle ? `# Chapter ${chapter.number}: ${ctitle}` : `# Chapter ${chapter.number}`);
      current = 'chapter';
      i = next - 1;
      continue;
    }

    // Before any section heading there is nowhere to put text (it would be lost): start an untitled front section.
    if (current === null) {
      startSection('# Foreword {kind=front}');
      current = 'front';
      notes.push(`text before the first heading went into an untitled front section: "${p.text.slice(0, 50)}"`);
    }

    // Headings inside a section.
    const sandwiched = isRule(items[i - 1] ?? { text: '' }) && isRule(items[i + 1] ?? { text: '' });
    const notHeading = /^amen\b/i.test(p.text) || p.list || BULLET_PREFIX.test(p.text);
    const shortLine = wordCount(p.text) <= 14 && !/[.!?…;,:]$/.test(p.text);
    const longWords = words(p.text).filter((w) => /^[A-Za-z]/.test(w) && w.length > 3);
    const titleish = longWords.length > 0 && longWords.every((w) => /^[A-Z]/.test(w));
    const nextText = items.slice(i + 1).find((q) => q.text && !isRule(q))?.text ?? '';
    let level = 0;
    if (notHeading) level = 0;
    else if (isHeadingStyle(p.style) && wordCount(p.text) <= 20 && !/[.!?]$/.test(p.text)) level = MINOR_HEADING_STYLE.test(p.style) ? 3 : 2;
    else if (shortLine && sandwiched) {
      level = 2;
      promoted.push(p.text);
    } else if ((shortLine || (/\?$/.test(p.text) && wordCount(p.text) <= 10)) && wordCount(p.text) <= 10 && titleish && (p.bold || wordCount(nextText) > 15)) {
      // A short title-case line in a body style: a bold one is a minor heading, a plain one a section heading.
      level = p.bold ? 3 : 2;
      promoted.push(p.text);
    }
    if (current === 'part' && level) {
      // A heading inside a part opener: keep it as an opener line.
      emit(curlyQuotes(caseIfCaps(p.text)));
      continue;
    }
    if (level) {
      emit(`${'#'.repeat(level)} ${curlyQuotes(caseIfCaps(p.text))}`);
      continue;
    }

    // Lists and paragraphs.
    let text = curlyQuotes(p.bold && !p.list ? `**${p.text}**` : p.marked || p.text);
    let list = p.list;
    if (!list && BULLET_PREFIX.test(p.text)) {
      list = { ordered: false };
      text = curlyQuotes(p.text.replace(BULLET_PREFIX, ''));
    }
    if (list && current !== 'part') {
      text = text.replace(BULLET_PREFIX, '');
      if (listBuf && listBuf.ordered !== list.ordered) flushList();
      listBuf ??= { ordered: list.ordered, items: [] };
      listBuf.items.push(text);
      continue;
    }
    if (looksLikeMarkup(text)) notes.push(`a paragraph starts like Markdown markup: "${text.slice(0, 40)}"`);
    emit(text);
  }
  flushList();
  flushPart();
  if (promoted.length)
    notes.push(`${promoted.length} short title-case, bold or ruled body lines became headings, such as "${promoted.slice(0, 3).join(`", "`)}"`);

  return {
    markdown: `${out.join('\n\n')}\n`,
    report: { title, subtitle, contents, chapters, notes },
  };
}

/** True when a paragraph would be read as other Markdown (a heading, a table, a quote, a fence or a scene break). */
const looksLikeMarkup = (text) => /^(#{1,4} |\||> |:::|\*\s*\*\s*\*\s*$|!\[)/.test(text);

/** Back up from a long paragraph to the heading that opens its section, but not past `lo`. */
function backUpToHeading(items, lo, i) {
  for (let k = i - 1; k >= lo; k--) {
    const p = items[k];
    if (!p || !p.text) continue;
    if (TOC_STYLE.test(p.style)) break;
    if (sectionNameOf(p.text) || parseChapterLine(p.text) || parsePartLine(p.text)) return k;
    if (!isHeadingStyle(p.style)) break;
  }
  return i;
}

/** Convert one DOCX (bytes) to Volume Markdown. */
export async function docxToMarkdown(data, opts = {}) {
  const paragraphs = await readDocx(data);
  return paragraphsToMarkdown(paragraphs, opts);
}

// ---------- command line ----------

async function main(argv) {
  const args = [...argv];
  let author = DEFAULT_AUTHOR;
  const ai = args.indexOf('--author');
  if (ai >= 0) {
    author = args[ai + 1] ?? author;
    args.splice(ai, 2);
  }
  const [input, outDir] = args;
  if (!input || !outDir) {
    console.error('Usage: node scripts/pages-docx-to-md.mjs <in.docx|folder> <outFolder> [--author "Name"]');
    process.exitCode = 2;
    return;
  }
  const files = (await stat(input)).isDirectory()
    ? (await readdir(input))
        .filter((f) => extname(f).toLowerCase() === '.docx' && !f.startsWith('~$'))
        .sort()
        .map((f) => join(input, f))
    : [input];
  await mkdir(outDir, { recursive: true });

  // Check each file with the real parser when the workspace package is reachable (Node strips the types).
  let parseManuscript = null;
  try {
    ({ parseManuscript } = await import('@volume/core'));
  } catch {
    console.warn('Note: @volume/core could not be loaded, so the output is not checked with parseManuscript.');
  }

  let failed = 0;
  for (const file of files) {
    const name = basename(file, extname(file));
    const { markdown, report } = await docxToMarkdown(await readFile(file), { author });
    const target = join(outDir, `${name}.md`);
    await writeFile(target, markdown, 'utf8');
    const line = [`${name}`, `  title: ${report.title}${report.subtitle ? ` / ${report.subtitle}` : ''}`];
    if (parseManuscript) {
      const book = parseManuscript(markdown);
      const chapters = book.sections.filter((s) => s.kind === 'chapter');
      const words = markdown
        .replace(/^(:::.*|#+ )/gm, '')
        .replace(/\{kind=[a-z_]+\}/g, '')
        .split(/\s+/)
        .filter((w) => /[A-Za-z0-9]/.test(w)).length;
      const kinds = book.sections.map((s) => (s.kind === 'chapter' ? 'C' : s.subtype)).join(' ');
      const tocCount = report.contents.length;
      const ok = book.meta.title === report.title && (tocCount === 0 || tocCount === chapters.length);
      if (!ok) failed++;
      line.push(
        `  chapters: ${chapters.length} (contents page: ${tocCount || 'none'}) sections: ${book.sections.length} words: ${words} ${ok ? 'OK' : 'CHECK'}`,
      );
      line.push(`  sections: ${kinds.replace(/(C )+C/g, (m) => `C x${m.split(' ').length}`)}`);
    } else {
      line.push(`  chapters: ${report.chapters.length} (contents page: ${report.contents.length || 'none'})`);
    }
    for (const n of report.notes) line.push(`  note: ${n}`);
    console.log(line.join('\n'));
  }
  if (failed) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main(process.argv.slice(2));
}
