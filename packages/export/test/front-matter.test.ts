import type { BookDoc, Section } from '@volume/core';
import { describe, expect, it } from 'vitest';
import { contentsLinesOf, contentsSections, generatedPage, isGeneratedSubtype } from '../src/front-matter.ts';
import { exportTxt } from '../src/txt.ts';

const sec = (over: Partial<Section> & Pick<Section, 'id' | 'subtype' | 'title'>): Section => ({ kind: 'front', blocks: [], ...over });

function book(entries: 'all' | 'chapters' = 'all'): BookDoc {
  return {
    meta: { title: 'Windowsill Herbs', author: 'Sam Rowe', language: 'en-GB', year: 2026, identifier: 'x', contentsEntries: entries },
    sections: [
      sec({ id: 'title-page', subtype: 'titlepage', title: 'Title Page', lines: ['Windowsill Herbs', '', 'Sam Rowe'] }),
      sec({ id: 'copyright', subtype: 'copyright', title: 'Copyright', blocks: [{ type: 'paragraph', text: 'Copyright © 2026 Sam Rowe.' }] }),
      sec({ id: 'contents', subtype: 'contents', title: 'Contents' }),
      sec({ id: 'intro', subtype: 'introduction', title: 'Introduction', blocks: [{ type: 'paragraph', text: 'Welcome.' }] }),
      sec({ id: 'part-i', kind: 'part', subtype: 'part', title: 'Start', kicker: 'Part I', number: 1 }),
      sec({
        id: 'c1',
        kind: 'chapter',
        subtype: 'chapter',
        title: 'Basil',
        kicker: 'Chapter 1',
        number: 1,
        blocks: [
          { type: 'paragraph', text: 'Water it.' },
          { type: 'heading2', text: 'Light' },
        ],
      }),
      sec({ id: 'about', kind: 'back', subtype: 'about_the_author', title: 'About the Author', blocks: [{ type: 'paragraph', text: 'Sam grows herbs.' }] }),
    ],
  };
}

describe('contents', () => {
  it('lists every entry after the contents page, with chapter subheadings beneath', () => {
    expect(contentsLinesOf(book())).toEqual([
      { text: 'Introduction', level: 0 },
      { text: 'Part I: Start', level: 0 },
      { text: 'Chapter 1: Basil', level: 0 },
      { text: 'Light', level: 1 },
      { text: 'About the Author', level: 0 },
    ]);
  });
  it('lists only parts and chapters when the template says so', () => {
    expect(contentsLinesOf(book('chapters')).map((l) => l.text)).toEqual(['Part I: Start', 'Chapter 1: Basil', 'Light']);
  });
  it('never lists the pages before it, and the exporters use the same list', () => {
    const doc = book();
    const secs = doc.sections;
    expect(contentsSections(doc, secs, 3).map((s) => s.id)).toEqual(['intro', 'part-i', 'c1', 'about']);
    const txt = exportTxt(doc).toString('utf8');
    const block = txt.slice(txt.indexOf('CONTENTS'), txt.indexOf('INTRODUCTION'));
    expect(block).toContain('Part I: Start');
    expect(block).toContain('1. Basil');
    expect(block).toContain('Light');
    expect(block).not.toContain('Title Page');
  });
});

describe('generatedPage', () => {
  it('returns the printed lines and word count of each built page', () => {
    const doc = book();
    const page = (id: string) => generatedPage(doc, doc.sections.find((s) => s.id === id) as Section);
    expect(page('title-page')).toEqual({
      lines: [
        { text: 'Windowsill Herbs', level: 0 },
        { text: 'Sam Rowe', level: 0 },
      ],
      words: 4,
    });
    expect(page('copyright')?.words).toBe(4);
    expect(page('about')?.lines).toEqual([{ text: 'Sam grows herbs.', level: 0 }]);
    expect(page('part-i')).toEqual({
      lines: [
        { text: 'Part I', level: 0 },
        { text: 'Start', level: 0 },
      ],
      words: 0,
    });
    expect(page('contents')?.words).toBeGreaterThan(5);
  });
  it('returns null for text the writer or the owner writes', () => {
    const doc = book();
    expect(generatedPage(doc, doc.sections.find((s) => s.id === 'c1') as Section)).toBeNull();
    expect(generatedPage(doc, doc.sections.find((s) => s.id === 'intro') as Section)).toBeNull();
    expect(isGeneratedSubtype('dedication')).toBe(false);
    expect(isGeneratedSubtype('also_by')).toBe(true);
  });
});
