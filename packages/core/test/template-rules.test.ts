import { describe, expect, it } from 'vitest';
import { checkBookTemplateRules, checkTemplateRules, parseManuscript, templateRulesFromTemplate, type Section } from '../src/index.ts';
import { loadBookTemplate } from '../src/node/index.ts';

const fiction = templateRulesFromTemplate(loadBookTemplate('fiction'));
const workbook = templateRulesFromTemplate(loadBookTemplate('workbook'));
const nonfiction = templateRulesFromTemplate(loadBookTemplate('nonfiction'));

const chapter = (body: string): Section => {
  const s = parseManuscript(`# Chapter 1: Test\n\n${body}\n`).sections[0];
  if (!s) throw new Error('no section');
  return s;
};
const codes = (s: Section, rules = workbook) => checkTemplateRules(s, rules).map((f) => `${f.code}:${f.severity}`);

const ex = (kind: string) => `::: exercise ${kind}\nQuestion?\n::: lines 4\n:::\n:::`;

describe('template rules from config', () => {
  it('reads the chapter rules the checks need from the real templates', () => {
    expect(fiction.subheadings).toEqual({ min: 0, max: 0 });
    expect(fiction.takeaways).toEqual({ enabled: false });
    expect(fiction.exercises).toBeUndefined();
    expect(workbook.exercises?.perChapter).toEqual({ min: 2, max: 4 });
    expect(workbook.exercises?.types).toContain('fill-in');
  });

  it('returns empty rules for a template without chapter rules and throws on wrong types', () => {
    expect(templateRulesFromTemplate({})).toEqual({});
    expect(() => templateRulesFromTemplate({ chapterRules: { takeaways: { enabled: 'no' } } })).toThrow();
  });
});

describe('fiction checks', () => {
  it('passes a clean fiction chapter with scene breaks', () => {
    expect(codes(chapter('She ran.\n\n* * *\n\nLater, rain.'), fiction)).toEqual([]);
  });

  it('blocks subheadings and takeaways, including a takeaways heading', () => {
    expect(codes(chapter('## The Storm\n\nText.\n\n### Later\n\nMore.'), fiction)).toEqual(['fiction.subheading:block']);
    expect(codes(chapter('Text.\n\n::: takeaways\n- one\n:::'), fiction)).toEqual(['fiction.takeaways:block']);
    expect(codes(chapter('Text.\n\n### Key Takeaways\n\n- one'), fiction)).toEqual(['fiction.takeaways:block']);
  });

  it('warns on workbook blocks in a fiction book', () => {
    const f = checkTemplateRules(chapter(ex('reflection')), fiction);
    expect(f.map((x) => x.code)).toEqual(['template.unknown-block', 'template.unknown-block']);
    expect(f.every((x) => x.severity === 'warn' && x.blockIndex === 0)).toBe(true);
  });

  it('does not apply chapter rules to front and back matter', () => {
    const s = parseManuscript('# Introduction\n\n## A Heading\n\nText.\n').sections[0];
    expect(s && checkTemplateRules(s, fiction)).toEqual([]);
  });
});

describe('workbook checks', () => {
  it('passes a chapter with 2 to 4 exercises', () => {
    expect(codes(chapter([ex('reflection'), ex('scenario')].join('\n\n')))).toEqual([]);
    expect(codes(chapter([1, 2, 3, 4].map(() => ex('tracker')).join('\n\n')))).toEqual([]);
  });

  it('blocks a chapter with no exercises and warns outside the range', () => {
    expect(codes(chapter('Text only.'))).toEqual(['workbook.exercise-count:block']);
    expect(codes(chapter(ex('reflection')))).toEqual(['workbook.exercise-count:warn']);
    expect(codes(chapter([1, 2, 3, 4, 5].map(() => ex('reflection')).join('\n\n')))).toEqual(['workbook.exercise-count:warn']);
  });

  it('warns on line counts outside 1 to 30, nested or not', () => {
    const s = chapter(['::: exercise reflection\nQ?\n::: lines 40\n:::\n:::', ex('scenario'), '::: lines 0\n:::'].join('\n\n'));
    const f = checkTemplateRules(s, workbook);
    expect(f.map((x) => [x.code, x.blockIndex])).toEqual([
      ['workbook.lines-range', 0],
      ['workbook.lines-range', 2],
    ]);
  });

  it('warns on malformed workbook fences that fell back to callouts', () => {
    const s = chapter([ex('reflection'), ex('scenario'), '::: exercise\nDo this.\n:::'].join('\n\n'));
    expect(codes(s)).toEqual(['template.unknown-block:warn']);
  });

  it('warns on an exercise kind the template does not list', () => {
    const narrow = { ...workbook, exercises: { perChapter: { min: 1, max: 4 }, types: ['reflection'] } };
    expect(codes(chapter(ex('tracker')), narrow)).toEqual(['template.unknown-block:warn']);
  });
});

describe('checkBookTemplateRules', () => {
  it('checks every enabled section and tags findings with the section id', () => {
    const book = parseManuscript('# Chapter 1: One\n\n## Sub\n\nText.\n\n# Chapter 2: Two\n\n## Sub\n\nText.\n');
    const second = book.sections[1];
    if (second) second.enabled = false;
    const f = checkBookTemplateRules(book, fiction);
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ sectionId: 'chapter-1-one', code: 'fiction.subheading', severity: 'block' });
  });

  it('finds nothing in a non-fiction chapter with subheadings and takeaways', () => {
    const book = parseManuscript('# Chapter 1: One\n\n## Sub\n\nText.\n\n::: takeaways\n- a\n:::\n');
    expect(checkBookTemplateRules(book, nonfiction)).toEqual([]);
  });
});
