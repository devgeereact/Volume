import { describe, expect, it } from 'vitest';
import {
  blockSchema,
  blockText,
  bookDocSchema,
  clampLines,
  exerciseHeading,
  LINES_RANGE,
  parseBlocks,
  parseManuscript,
  sectionWordCount,
  serialiseManuscript,
  type Block,
  type ExerciseBlock,
} from '../src/index.ts';

const blocks = (md: string): Block[] => parseBlocks(md.split('\n'));

describe('scene breaks (P6-1, conflict 1)', () => {
  it('accepts both *** and * * * and writes ***', () => {
    const book = parseManuscript('# Chapter 1: Rain\n\nOne.\n\n* * *\n\nTwo.\n\n***\n\nThree.\n');
    const types = book.sections[0]?.blocks.map((b) => b.type);
    expect(types).toEqual(['paragraph', 'sceneBreak', 'paragraph', 'sceneBreak', 'paragraph']);
    const out = serialiseManuscript(book);
    expect(out).toBe('# Chapter 1: Rain\n\nOne.\n\n***\n\nTwo.\n\n***\n\nThree.\n');
    expect(serialiseManuscript(parseManuscript(out))).toBe(out);
  });

  it('leaves other star lines as paragraphs', () => {
    expect(blocks('* *').map((b) => b.type)).toEqual(['paragraph']);
    expect(blocks('****').map((b) => b.type)).toEqual(['paragraph']);
  });
});

const WORKBOOK = `# Chapter 1: Morning Habits

Intro paragraph.

::: exercise reflection Your First Hour
What do you do in the first hour after you wake?

::: lines 6
:::
:::

::: exercise checklist Before Bed
- [ ] Phone in another room
- [ ] Clothes laid out
:::

::: exercise fill-in
::: fill-in page
My wake-up time:
My first drink:
:::
:::
`;

describe('workbook blocks (P6-1, D-042)', () => {
  const book = parseManuscript(WORKBOOK);
  const ch = book.sections[0];

  it('parses nested exercises with lines, checklists and fill-ins', () => {
    expect(ch?.blocks).toEqual([
      { type: 'paragraph', text: 'Intro paragraph.' },
      {
        type: 'exercise',
        kind: 'reflection',
        title: 'Your First Hour',
        blocks: [
          { type: 'paragraph', text: 'What do you do in the first hour after you wake?' },
          { type: 'lines', count: 6 },
        ],
      },
      { type: 'exercise', kind: 'checklist', title: 'Before Bed', blocks: [{ type: 'checklist', items: ['Phone in another room', 'Clothes laid out'] }] },
      { type: 'exercise', kind: 'fill-in', blocks: [{ type: 'fillIn', prompts: ['My wake-up time:', 'My first drink:'], page: true }] },
    ]);
  });

  it('round-trips byte for byte and validates against the zod schema', () => {
    const out = serialiseManuscript(book);
    expect(out).toBe(WORKBOOK);
    // No title page here, so meta would fail; the sections carry the new blocks.
    expect(bookDocSchema.shape.sections.safeParse(book.sections).success).toBe(true);
  });

  it('accepts ::: lines N without its closing fence', () => {
    expect(blocks('::: lines 4\nNext paragraph.')).toEqual([
      { type: 'lines', count: 4 },
      { type: 'paragraph', text: 'Next paragraph.' },
    ]);
    const ex = blocks('::: exercise scenario\nQuestion?\n::: lines 3\nAnother question?\n::: lines 2\n:::\n:::\nAfter.');
    expect(ex[0]).toMatchObject({ type: 'exercise', kind: 'scenario' });
    expect((ex[0] as ExerciseBlock).blocks.map((b) => b.type)).toEqual(['paragraph', 'lines', 'paragraph', 'lines']);
    expect(ex[1]).toEqual({ type: 'paragraph', text: 'After.' });
  });

  it('keeps old and malformed fences as callouts', () => {
    expect(blocks('::: exercise\nDo this.\n:::')).toEqual([{ type: 'callout', variant: 'exercise', text: 'Do this.' }]);
    expect(blocks('::: exercise homework Title\nDo this.\n:::')[0]).toMatchObject({ type: 'callout', variant: 'exercise homework Title' });
    expect(blocks('::: lines many\n:::')[0]).toMatchObject({ type: 'callout', variant: 'lines many' });
    expect(blocks('::: demo\nA note.\n:::')).toEqual([{ type: 'callout', variant: 'demo', text: 'A note.' }]);
  });

  it('only turns all-tick-box lists into checklists', () => {
    expect(blocks('- [ ] a\n- b')[0]).toEqual({ type: 'list', items: ['[ ] a', 'b'] });
    expect(blocks('- [x] done')[0]).toEqual({ type: 'list', items: ['[x] done'] });
    expect(blocks('- [ ] a\n- [ ] b')[0]).toEqual({ type: 'checklist', items: ['a', 'b'] });
  });

  it('parses out-of-range line counts so the template check can flag them', () => {
    expect(blocks('::: lines 0\n:::')[0]).toEqual({ type: 'lines', count: 0 });
    expect(blocks('::: lines 45\n:::')[0]).toEqual({ type: 'lines', count: 45 });
    expect(clampLines(0)).toBe(LINES_RANGE.min);
    expect(clampLines(45)).toBe(LINES_RANGE.max);
    expect(clampLines(6)).toBe(6);
  });

  it('rejects unknown exercise kinds and nested junk in the schema', () => {
    expect(blockSchema.safeParse({ type: 'exercise', kind: 'quiz', blocks: [] }).success).toBe(false);
    expect(blockSchema.safeParse({ type: 'exercise', kind: 'tracker', blocks: [{ type: 'nope' }] }).success).toBe(false);
    expect(blockSchema.safeParse({ type: 'exercise', kind: 'tracker', blocks: [{ type: 'lines', count: 3 }] }).success).toBe(true);
  });

  it('counts exercise words (title, prompts, checklist items) and not ruled lines', () => {
    const ex = ch?.blocks[1] as ExerciseBlock;
    expect(exerciseHeading(ex)).toBe('Exercise: Your First Hour');
    expect(exerciseHeading({ type: 'exercise', kind: 'tracker', blocks: [] })).toBe('Exercise');
    expect(blockText(ex)).toBe('Your First Hour\nWhat do you do in the first hour after you wake?');
    // 2 + 3 (title) + 11 + 2 (Before Bed) + 4 + 3 + 3 + 3
    expect(ch && sectionWordCount(ch)).toBe(31);
  });
});
