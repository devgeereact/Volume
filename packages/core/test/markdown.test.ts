/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { bookDocSchema, parseInline, parseManuscript, sectionHeading, serialiseInline, serialiseManuscript, subtypeForHeading } from '../src/index.ts';

const golden = readFileSync(new URL('./fixtures/windowsill-herbs-manuscript.md', import.meta.url), 'utf8');

describe('manuscript parser', () => {
  const book = parseManuscript(golden);

  it('round-trips the Windowsill Herbs manuscript byte for byte', () => {
    expect(serialiseManuscript(book)).toBe(golden);
  });

  it('validates against the zod schema', () => {
    expect(bookDocSchema.safeParse(book).success).toBe(true);
  });

  it('reads the title page into meta', () => {
    expect(book.meta).toMatchObject({
      title: 'Windowsill Herbs',
      subtitle: 'Grow Fresh Herbs in a Small UK Home',
      author: 'Sam Rowe',
      edition: 'Demo edition',
      year: 2026,
      language: 'en-GB',
    });
    expect(book.meta.titlePageNotes).toHaveLength(1);
  });

  it('finds every section in order with kinds and kickers', () => {
    expect(book.sections.map((s) => `${s.kind}:${s.subtype}`)).toEqual([
      'front:titlepage',
      'front:copyright',
      'front:contents',
      'front:introduction',
      'chapter:chapter',
      'chapter:chapter',
      'chapter:chapter',
      'chapter:chapter',
      'chapter:chapter',
      'back:conclusion',
      'back:about_the_author',
      'back:review_request',
    ]);
    const ch1 = book.sections[4];
    expect(ch1?.kicker).toBe('Chapter 1');
    expect(ch1?.number).toBe(1);
    expect(ch1?.title).toBe('Read your windows before you buy a plant');
    expect(ch1 ? sectionHeading(ch1) : '').toBe('Chapter 1: Read your windows before you buy a plant');
    expect(ch1?.id).toBe('chapter-1-read-your-windows-before-you-buy-a-plant');
  });

  it('parses every block type in chapter 3', () => {
    const ch3 = book.sections.find((s) => s.number === 3);
    const types = new Set(ch3?.blocks.map((b) => b.type));
    expect([...types].sort()).toEqual(['heading2', 'list', 'paragraph', 'sceneBreak', 'table']);
    const table = ch3?.blocks.find((b) => b.type === 'table');
    expect(table && table.type === 'table' ? table.rows.length : 0).toBe(8);
    expect(ch3?.blocks.filter((b) => b.type === 'heading2')).toHaveLength(10);
  });

  it('keeps demo notes as callouts', () => {
    const about = book.sections.find((s) => s.subtype === 'about_the_author');
    expect(about?.blocks[0]).toEqual({
      type: 'callout',
      variant: 'demo',
      text: 'A demo book made with the AI Book Writing and Amazon KDP Toolkit. Sam Rowe is a fictional author.',
    });
  });
});

describe('dialect extensions', () => {
  const md = [
    '::: halftitle',
    'Small Book',
    ':::',
    '',
    '::: titlepage',
    'Small Book',
    'A Subtitle',
    'Ann Author',
    ':::',
    '',
    '::: contents',
    ':::',
    '',
    '# Dedication',
    '',
    'For you.',
    '',
    '::: part',
    'Part I',
    'Getting Started',
    ':::',
    '',
    '# Chapter 1: First Steps',
    '',
    'Some *italic* and **bold** text.',
    '',
    '::: epigraph',
    'A line of verse.',
    '- Ann Author',
    ':::',
    '',
    '1. one',
    '2. two',
    '',
    '> A quoted line.',
    '',
    '![A pot](pot.png "The pot")',
    '',
    '::: takeaways',
    '- First point.',
    '- Second point.',
    ':::',
    '',
    '::: pagebreak',
    ':::',
    '',
    '::: exercise',
    'Write down three windows.',
    ':::',
    '',
    '# A Note to You {kind=review_request}',
    '',
    'Please leave an honest review.',
    '',
    '# Also by Ann Author',
    '',
    '- Big Book',
    '',
  ].join('\n');

  it('parses parts, epigraphs, takeaways, images and kind markers, and round-trips', () => {
    const book = parseManuscript(md);
    expect(book.sections.map((s) => s.subtype)).toEqual(['halftitle', 'titlepage', 'contents', 'dedication', 'part', 'chapter', 'review_request', 'also_by']);
    const part = book.sections[4];
    expect(part).toMatchObject({ kind: 'part', kicker: 'Part I', title: 'Getting Started' });
    const ch = book.sections[5];
    expect(ch?.blocks.map((b) => b.type)).toEqual(['paragraph', 'quote', 'list', 'quote', 'image', 'takeaways', 'pageBreak', 'callout']);
    expect(ch?.blocks[1]).toEqual({ type: 'quote', variant: 'epigraph', lines: ['A line of verse.'], attribution: 'Ann Author' });
    expect(book.sections[6]).toMatchObject({ kind: 'back', title: 'A Note to You', explicitKind: true });
    expect(book.sections[7]).toMatchObject({ kind: 'back', subtype: 'also_by' });
    expect(serialiseManuscript(book)).toBe(md);
  });

  it('skips disabled sections when writing', () => {
    const book = parseManuscript(md);
    const ded = book.sections.find((s) => s.subtype === 'dedication');
    if (ded) ded.enabled = false;
    expect(serialiseManuscript(book)).not.toContain('# Dedication');
    expect(serialiseManuscript(book, { includeDisabled: true })).toContain('# Dedication');
  });

  it('maps headings to subtypes by the name before the colon', () => {
    expect(subtypeForHeading('Conclusion: your next steps')).toBe('conclusion');
    expect(subtypeForHeading('About the Author')).toBe('about_the_author');
    expect(subtypeForHeading('Stay in Touch')).toBe('newsletter');
    expect(subtypeForHeading('Chapter 12: Twelve')).toBe('chapter');
    expect(subtypeForHeading('Something Else')).toBe('other');
  });
});

describe('inline marks', () => {
  it('splits bold and italic runs and writes them back', () => {
    const text = '**Light:** your *sunniest* window, ***really***.';
    const runs = parseInline(text);
    expect(runs).toEqual([
      { text: 'Light:', bold: true },
      { text: ' your ' },
      { text: 'sunniest', italic: true },
      { text: ' window, ' },
      { text: 'really', bold: true, italic: true },
      { text: '.' },
    ]);
    expect(serialiseInline(runs)).toBe(text);
  });

  it('leaves a lone asterisk alone', () => {
    expect(parseInline('5 * 3 = 15')).toEqual([{ text: '5 * 3 = 15' }]);
  });
});

describe('sub-subheadings', () => {
  // From the live book: the model closed each chapter with "### Key Takeaways" and a list.
  const md = [
    '# Chapter 1: Start With A Problem, Not A Tool',
    '',
    '## Your One-line Idea Card',
    '',
    'Notice what the card does not contain.',
    '',
    '### Key Takeaways',
    '',
    '- Pick the problem first, then the plainest tool that helps with it.',
    '',
    '#### A Smaller Heading',
    '',
    '##### Five hashes stay text',
    '',
  ].join('\n');

  it('parses ### as level 3 and #### as level 4, not as paragraphs', () => {
    const blocks = parseManuscript(md).sections[0]?.blocks ?? [];
    expect(blocks.map((b) => b.type)).toEqual(['heading2', 'paragraph', 'heading3', 'list', 'heading3', 'paragraph']);
    expect(blocks[2]).toEqual({ type: 'heading3', text: 'Key Takeaways' });
    expect(blocks[4]).toEqual({ type: 'heading3', level: 4, text: 'A Smaller Heading' });
    expect(blocks[5]).toEqual({ type: 'paragraph', text: '##### Five hashes stay text' });
  });

  it('writes them back byte for byte and validates', () => {
    const book = parseManuscript(md);
    expect(serialiseManuscript(book)).toBe(`${md.trimEnd()}\n`);
    expect(bookDocSchema.safeParse({ ...book, meta: { ...book.meta, title: 'Start Small With AI', author: 'Test' } }).success).toBe(true);
  });
});
