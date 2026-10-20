import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * A book's structure from config: the book type (config/book-types.json) picks its template file
 * (config/book-templates/*.json) and lists the front and back matter that kind of book has. The
 * blueprint prompt, the writer and section creation all use this, so a tech how-to book keeps its
 * glossary, resources and "how to use" page, and its genre rules (dated prices) reach the writer.
 */

type Rec = Record<string, unknown>;
const isRec = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim().length > 0 ? v : null);
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** Template section ids whose server section kind is not just the id with dashes turned into underscores. */
const KIND_OVERRIDES: Readonly<Record<string, string>> = {
  'about-the-author': 'about_author',
  'newsletter-socials': 'newsletter',
};

/** Sections whose text comes from code, never from the writer (docs/04, stage 7). */
export const CODE_KINDS: ReadonlySet<string> = new Set(['half_title', 'title_page', 'copyright', 'contents', 'about_author', 'also_by']);

/** Server section kind for a template section id (or its writesAs id, for a section written like another). */
export function sectionKindFor(templateSectionId: string): string {
  return KIND_OVERRIDES[templateSectionId] ?? templateSectionId.replace(/-/g, '_');
}

/** Who writes a section: the AI writer, app code, or the owner (created switched off until the owner fills it). */
export type SectionWriter = 'ai' | 'code' | 'owner';

export interface StructureSection {
  /** Template section id, for example 'glossary-of-nhs-terms'. */
  id: string;
  /** Server section kind, for example 'glossary'. */
  kind: string;
  area: 'front' | 'back';
  title: string;
  source: string;
  promptId: string | null;
  writer: SectionWriter;
  /** Default word target from the template's wordTargets, when it has one. */
  wordTarget: number | null;
  /** The template's own rule text for the section. */
  content: string | null;
  required: boolean;
  /** True when the book type lists the section (false: a required template section the type leaves out). */
  inType: boolean;
}

export interface BookStructure {
  bookTypeId: string | null;
  /** Template id (file name without .json), from the book type when there is one. */
  templateId: string;
  template: Rec | null;
  bookType: Rec | null;
  front: StructureSection[];
  back: StructureSection[];
  /** The book's default total word target (book type, else template). */
  defaultWordTarget: number | null;
  defaultChapterCount: number | null;
}

async function readJson(path: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as unknown;
  } catch {
    return null;
  }
}

/** Every book type in config/book-types.json. */
export async function loadBookTypes(configDir: string): Promise<Rec[]> {
  const raw = await readJson(join(configDir, 'book-types.json'));
  return isRec(raw) && Array.isArray(raw['types']) ? raw['types'].filter(isRec) : [];
}

/** One template file by id, or null. */
export async function loadTemplateFile(configDir: string, templateId: string | null): Promise<Rec | null> {
  if (!templateId || !/^[a-z0-9-]+$/.test(templateId)) return null;
  const raw = await readJson(join(configDir, 'book-templates', `${templateId}.json`));
  return isRec(raw) ? raw : null;
}

function writerOf(kind: string, source: string, promptId: string | null): SectionWriter {
  if (CODE_KINDS.has(kind)) return 'code';
  if (source === 'ai') return 'ai';
  if (promptId && promptId.startsWith('writing.')) return 'ai';
  return 'owner';
}

function titleOf(t: Rec, id: string): string {
  const title = str(t['title']);
  if (title && !title.includes('{')) return title;
  const words = id.replace(/-/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function toSection(t: Rec, area: 'front' | 'back', template: Rec, inType: boolean): StructureSection {
  const id = String(t['id']);
  const kind = sectionKindFor(str(t['writesAs']) ?? id);
  const source = str(t['source']) ?? 'owner';
  const promptId = str(t['promptId']);
  const targets = isRec(template['wordTargets']) ? template['wordTargets'] : {};
  const target = isRec(targets[id]) ? num(targets[id]['default']) : null;
  return {
    id,
    kind,
    area,
    title: titleOf(t, id),
    source,
    promptId,
    writer: writerOf(kind, source, promptId),
    wordTarget: target,
    content: str(t['content']),
    required: t['required'] === true,
    inType,
  };
}

/**
 * The structure of a book: the book type's front and back matter in its order, each resolved to its template
 * section. Required template sections the type leaves out are returned with inType false (kept switched off).
 * Without a book type, the template's default-on sections are used.
 */
export async function loadBookStructure(configDir: string, bookTypeId: string | null, templateId: string | null): Promise<BookStructure> {
  const types = await loadBookTypes(configDir);
  const bookType = bookTypeId ? (types.find((t) => t['id'] === bookTypeId) ?? null) : null;
  const fromType = bookType ? str(bookType['templateFile'])?.replace(/\.json$/, '') : null;
  const id = fromType ?? templateId ?? 'nonfiction';
  const template = await loadTemplateFile(configDir, id);
  const sections = template && Array.isArray(template['sections']) ? template['sections'].filter(isRec) : [];
  const byId = new Map(sections.map((s) => [String(s['id']), s]));
  const front: StructureSection[] = [];
  const back: StructureSection[] = [];
  const structure = bookType && isRec(bookType['structure']) ? bookType['structure'] : null;
  if (template && structure) {
    const listed = new Set<string>();
    for (const [key, area] of [
      ['frontMatter', 'front'],
      ['backMatter', 'back'],
    ] as const) {
      const ids = Array.isArray(structure[key]) ? structure[key].filter((x): x is string => typeof x === 'string') : [];
      for (const sid of ids) {
        const t = byId.get(sid);
        listed.add(sid);
        const sec = t ? toSection(t, area, template, true) : toSection({ id: sid, source: 'owner' }, area, template, true);
        (area === 'front' ? front : back).push(sec);
      }
    }
    // Required template sections the type leaves out stay known (switched off on purpose for the preflight).
    for (const t of sections) {
      const sid = String(t['id']);
      const kind = str(t['kind']);
      if (listed.has(sid) || t['required'] !== true || (kind !== 'front' && kind !== 'back')) continue;
      (kind === 'front' ? front : back).push(toSection(t, kind, template, false));
    }
  } else if (template) {
    for (const t of sections) {
      const kind = str(t['kind']);
      if ((kind !== 'front' && kind !== 'back') || t['defaultOn'] !== true) continue;
      (kind === 'front' ? front : back).push(toSection(t, kind, template, true));
    }
  }
  const range = bookType && isRec(bookType['wordRange']) ? bookType['wordRange'] : null;
  const chapters = bookType && isRec(bookType['chapterRange']) ? bookType['chapterRange'] : null;
  const tTargets = template && isRec(template['wordTargets']) && isRec(template['wordTargets']['total']) ? template['wordTargets']['total'] : null;
  const tCount = template && isRec(template['chapterRules']) && isRec(template['chapterRules']['count']) ? template['chapterRules']['count'] : null;
  return {
    bookTypeId: bookType ? String(bookType['id']) : null,
    templateId: id,
    template,
    bookType,
    front,
    back,
    defaultWordTarget: num(range?.['default']) ?? num(tTargets?.['default']),
    defaultChapterCount: num(chapters?.['default']) ?? num(tCount?.['default']),
  };
}

/**
 * The template rules sent to prompts as {{template}}: the template's rules (voice, word targets, chapter
 * rules, variants), only the sections this book has, and the book type (structure, ranges, genre rules).
 */
export function promptTemplate(s: BookStructure): Rec | null {
  if (!s.template) return null;
  const { sections: _sections, packages: _packages, derivedFrom: _derived, $comment: _comment, ...rules } = s.template;
  const listed = [...s.front, ...s.back].filter((x) => x.inType);
  const out: Rec = {
    ...rules,
    sections: listed.map((x) => ({ id: x.id, area: x.area, title: x.title, writer: x.writer, ...(x.content ? { rule: x.content } : {}) })),
  };
  if (s.bookType) {
    const t = s.bookType;
    out['bookType'] = {
      id: t['id'],
      name: t['name'],
      category: t['category'],
      structure: t['structure'],
      wordRange: t['wordRange'],
      chapterRange: t['chapterRange'],
      genreRules: t['genreRules'],
    };
  }
  return out;
}

/**
 * True when the book type asks for dated prices: every price carries the month it was checked (genreRules.datedPrices,
 * set for the tech how-to and travel types; older configs are read from the rule wording).
 */
export function hasDatedPrices(s: Pick<BookStructure, 'bookType'>): boolean {
  const rules = s.bookType && isRec(s.bookType['genreRules']) ? s.bookType['genreRules'] : null;
  if (!rules) return false;
  if (typeof rules['datedPrices'] === 'boolean') return rules['datedPrices'];
  const words = Object.values(rules)
    .flatMap((v): unknown[] => (Array.isArray(v) ? (v as unknown[]) : []))
    .filter((x): x is string => typeof x === 'string');
  return words.some((w) => /undated prices|prices?\b.*\bmonth checked|prices? or features stated without a date/i.test(w));
}
