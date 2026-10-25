// The Editor shows the pages the exported book holds (built pages) and honest prompts for owner pages. The built
// text comes from the exporter's own code (toBookDoc, generatedPage), so these tests compare it with the real
// exporters' output for the same book. Mock AI, in-memory database, no browser.
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { exportMarkdown, exportTxt } from '@volume/export';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { exportTemplate, toBookDoc } from '../src/adapters/volume-export.js';
import { alsoByMarkdown, buildExportBook, isBlankMatter } from '../src/jobs/book-data.js';
import { testApp, str, type TestApp } from './helpers.js';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const CONFIG = join(ROOT, 'config');

type Obj = Record<string, unknown>;
interface Line {
  text: string;
  level: number;
}
interface Gen {
  lines: Line[];
  words: number;
  countsInTotal: boolean;
  leftOut: boolean;
  note: string;
  edit: { target: string } | null;
}
interface Sec extends Obj {
  id: string;
  kind: string;
  enabled: boolean;
  status: string;
  wordCount: number;
  generated: Gen | null;
  ownerPrompt: { message: string; placeholder: string; leftOut: boolean } | null;
}
interface Tree {
  front: Sec[];
  body: (Sec & { children: Sec[] })[];
  back: Sec[];
}

const flat = (t: Tree): Sec[] => [...t.front, ...t.body.flatMap((b) => [b, ...b.children]), ...t.back];
const norm = (s: string): string => s.replace(/\s+/g, ' ').trim();

describe('editor pages match the exported book', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await testApp();
  });
  afterAll(async () => t.close());

  async function written(bookTypeId: string, settings: Obj = { acknowledgements: 'Sam' }, penName = 'Test Author'): Promise<{ id: string; profileId: string }> {
    const p = await t.call<{ id: string }>('POST', '/api/v1/profiles', { penName, bioThirdPerson: `${penName} writes plain books for busy people.` });
    const b = await t.call<{ id: string }>('POST', '/api/v1/books', {
      profileId: p.body.id,
      idea: 'Calm mornings',
      title: 'Calm Mornings',
      bookTypeId,
      settings,
    });
    expect(b.status).toBe(201);
    const id = b.body.id;
    await t.call('POST', `/api/v1/books/${id}/blueprints`, { chapterCount: 2 });
    await t.services.runner.runUntilIdle();
    expect((await t.call('POST', `/api/v1/books/${id}/blueprint/approve`, {})).status).toBe(200);
    await t.call('POST', `/api/v1/books/${id}/write`, {});
    await t.services.runner.runUntilIdle();
    return { id, profileId: p.body.id };
  }
  const tree = async (id: string): Promise<Tree> => (await t.call<Tree>('GET', `/api/v1/books/${id}/sections`)).body;
  const kind = (secs: Sec[], k: string): Sec => {
    const s = secs.find((x) => x.kind === k);
    if (!s) throw new Error(`No ${k} section.`);
    return s;
  };
  async function exportedDoc(id: string) {
    const book = await t.services.repos.books.require(t.owner, id);
    const eb = await buildExportBook(t.services.repos, t.owner, id, CONFIG);
    return { eb, doc: toBookDoc(eb, exportTemplate(ROOT, eb)), book };
  }

  it('gives the title page, copyright, contents and About the author real text instead of an empty page', async () => {
    const { id } = await written('self-help');
    const secs = flat(await tree(id));
    for (const k of ['title_page', 'copyright', 'contents', 'about_author']) {
      const s = kind(secs, k);
      // The stored section is still empty: the text is built, not written.
      expect(s.wordCount, k).toBe(0);
      expect(s.generated, k).not.toBeNull();
      expect(s.generated?.lines.length, k).toBeGreaterThan(0);
      expect(s.generated?.words, k).toBeGreaterThan(0);
      expect(s.generated?.note, k).toContain('Built from your book details when you export');
      expect(s.generated?.edit, k).not.toBeNull();
    }
    expect(kind(secs, 'title_page').generated?.lines.map((l) => l.text)).toEqual(['Calm Mornings', expect.any(String), 'Test Author', 'First edition']);
    expect(kind(secs, 'about_author').generated?.lines.map((l) => l.text)).toEqual(['Test Author writes plain books for busy people.']);
    // Pages before the contents print but add nothing to the manuscript's word total, as the TXT total counts.
    expect(kind(secs, 'title_page').generated?.countsInTotal).toBe(false);
    expect(kind(secs, 'about_author').generated?.countsInTotal).toBe(true);
    // Written sections carry no preview.
    expect(kind(secs, 'introduction').generated).toBeNull();
    expect(kind(secs, 'dedication').ownerPrompt).toBeNull();
  });

  it('shows the same text the MD and TXT exporters print, and the same contents entries', async () => {
    const { id } = await written('self-help');
    const secs = flat(await tree(id));
    const { doc } = await exportedDoc(id);
    const md = norm(exportMarkdown(doc).toString('utf8'));
    const txt = norm(exportTxt(doc).toString('utf8'));
    for (const k of ['title_page', 'copyright', 'about_author']) {
      for (const l of kind(secs, k).generated?.lines ?? []) expect(md, `${k}: ${l.text}`).toContain(norm(l.text));
    }
    const contents = kind(secs, 'contents').generated?.lines ?? [];
    // Every chapter, with its subheadings beneath it, appears in the contents block of the TXT.
    const block = txt.slice(txt.indexOf('CONTENTS'), txt.indexOf('CHAPTER 1'));
    for (const l of contents) expect(block, l.text).toContain(norm(l.text.replace(/^Chapter \d+: /, '')));
    expect(contents.filter((l) => l.level === 0).map((l) => l.text)).toEqual(
      expect.arrayContaining(['Introduction', 'Chapter 1: [MOCK] Chapter 1', 'Chapter 2: [MOCK] Chapter 2', 'Conclusion']),
    );
    // Subheadings sit under their chapter at level 1.
    expect(contents.some((l) => l.level === 1)).toBe(true);
  });

  it('reads the same for fiction, a journal, poetry, a workbook and a picture book', async () => {
    for (const type of ['contemporary-romance', 'guided-journal', 'poetry', 'workbook', 'bedtime-story']) {
      const { id } = await written(type);
      const secs = flat(await tree(id));
      const { doc } = await exportedDoc(id);
      const md = norm(exportMarkdown(doc).toString('utf8'));
      for (const s of secs.filter((x) => x.enabled && x.generated)) {
        expect(s.generated?.lines.length, `${type} ${s.kind}`).toBeGreaterThan(0);
        if (s.kind === 'contents') continue;
        for (const l of s.generated?.lines ?? []) expect(md, `${type} ${s.kind}: ${l.text}`).toContain(norm(l.text));
      }
      // Every built front and back page of the type is previewed: none is left as an empty page.
      for (const k of ['title_page', 'copyright', 'about_author']) expect(kind(secs, k).generated, `${type} ${k}`).not.toBeNull();
    }
  });

  it('shows part dividers as containers, never as empty text', async () => {
    const { id } = await written('self-help');
    const [part] = await t.services.repos.manuscript.addSections(t.owner, id, [{ kind: 'part', area: 'body', title: 'Start Small', number: 1 }], 500);
    const secs = flat(await tree(id));
    const p = secs.find((s) => s.id === part?.id);
    expect(p?.generated?.lines.map((l) => l.text)).toEqual(['Part I', 'Start Small']);
    expect(p?.generated?.words).toBe(0);
    expect(p?.generated?.note).toContain('divider');
    const { doc } = await exportedDoc(id);
    expect(doc.sections.find((s) => s.subtype === 'part')?.kicker).toBe('Part I');
  });

  it('prompts on a switched-on owner page with no text, and leaves it out of the exported book', async () => {
    const { id } = await written('clinical-reference');
    const dedication = kind(flat(await tree(id)), 'dedication');
    expect(dedication.enabled).toBe(false);
    expect(dedication.ownerPrompt).toBeNull();
    expect((await t.call('PATCH', `/api/v1/sections/${dedication.id}`, { enabled: true })).status).toBe(200);
    const after = kind(flat(await tree(id)), 'dedication');
    expect(after.ownerPrompt?.message).toContain('yours to write');
    expect(after.ownerPrompt?.leftOut).toBe(true);
    expect(after.ownerPrompt?.placeholder).toContain('until you write it');
    // The detail route says the same.
    const detail = await t.call<{ section: Sec }>('GET', `/api/v1/sections/${dedication.id}`);
    expect(detail.body.section.ownerPrompt?.leftOut).toBe(true);
    // The export holds no blank Dedication page.
    const { eb, doc } = await exportedDoc(id);
    expect(eb.sections.some((s) => s.kind === 'dedication')).toBe(false);
    expect(eb.sectionsOff).toContain('dedication');
    expect(doc.sections.some((s) => s.subtype === 'dedication')).toBe(false);
    expect(exportTxt(doc).toString('utf8')).not.toContain('DEDICATION');
    // Once the owner writes it, the prompt goes and the page prints.
    await t.call('POST', `/api/v1/sections/${dedication.id}/versions`, { bodyMd: '# Dedication\n\nFor Sam, who read every draft.' });
    expect(kind(flat(await tree(id)), 'dedication').ownerPrompt).toBeNull();
    const again = await exportedDoc(id);
    expect(exportMarkdown(again.doc).toString('utf8')).toContain('For Sam, who read every draft.');
  });

  it('clears the Resources switched-off note when the owner switches Resources back on', async () => {
    const { id } = await written('ai-tech-howto', {});
    const res = kind(flat(await tree(id)), 'resources');
    expect(res.enabled).toBe(false);
    expect((res['plan'] as Obj)['autoSwitchedOff']).toMatchObject({ reason: 'no-sources' });
    const patched = await t.call<Sec>('PATCH', `/api/v1/sections/${res.id}`, { enabled: true });
    expect(patched.status).toBe(200);
    expect(patched.body['plan']).not.toHaveProperty('autoSwitchedOff');
    // Other plan fields stay, and switching off again by hand adds no note.
    const off = await t.call<Sec>('PATCH', `/api/v1/sections/${res.id}`, { enabled: false });
    expect(off.body['plan']).not.toHaveProperty('autoSwitchedOff');
  });

  it('shows the placeholder the exported book holds while Acknowledgements has no names', async () => {
    const { id } = await written('self-help', {});
    const ack = kind(flat(await tree(id)), 'acknowledgements');
    expect(ack.ownerPrompt?.leftOut).toBe(false);
    expect(ack.ownerPrompt?.message).toContain('Add their names');
    expect(ack.ownerPrompt?.placeholder).toContain('Acknowledgements to come');
    const { doc } = await exportedDoc(id);
    expect(exportMarkdown(doc).toString('utf8')).toContain(ack.ownerPrompt?.placeholder ?? 'missing');
  });

  it('builds Also by from the books published under the pen name, and leaves it out with none', async () => {
    const { id, profileId } = await written('self-help', { acknowledgements: 'Sam' }, 'Series Author');
    const also = kind(flat(await tree(id)), 'also_by');
    expect(also.enabled).toBe(false);
    expect((await t.call('PATCH', `/api/v1/sections/${also.id}`, { enabled: true })).status).toBe(200);
    // Nothing published yet: the page is left out and the Editor says why.
    let secs = flat(await tree(id));
    expect(kind(secs, 'also_by').generated?.leftOut).toBe(true);
    expect(kind(secs, 'also_by').generated?.note).toContain('leaves this page out');
    let ex = await exportedDoc(id);
    expect(ex.doc.sections.some((s) => s.subtype === 'also_by')).toBe(false);
    // Publish another book under the same pen name.
    const other = await t.call<{ id: string }>('POST', '/api/v1/books', { profileId, idea: 'Evening walks', title: 'Evening Walks', subtitle: 'A slow guide' });
    expect((await t.call('POST', `/api/v1/books/${str(other.body.id)}/publish`, {})).status).toBe(200);
    secs = flat(await tree(id));
    const gen = kind(secs, 'also_by').generated;
    expect(gen?.leftOut).toBe(false);
    expect(gen?.lines.map((l) => l.text)).toEqual(['Evening Walks: A slow guide']);
    ex = await exportedDoc(id);
    const section = ex.doc.sections.find((s) => s.subtype === 'also_by');
    expect(section?.blocks.length).toBe(1);
    expect(exportMarkdown(ex.doc).toString('utf8')).toContain('Evening Walks: A slow guide');
  });
});

describe('blank pages in the export', () => {
  it('leaves out a front or back page with no text, but never a built page or the body', () => {
    expect(isBlankMatter('dedication', 'front', '')).toBe(true);
    expect(isBlankMatter('dedication', 'front', '# Dedication\n\n')).toBe(true);
    expect(isBlankMatter('dedication', 'front', '# Dedication\n\nFor Sam.')).toBe(false);
    expect(isBlankMatter('also_by', 'back', '')).toBe(true);
    for (const k of ['title_page', 'copyright', 'contents', 'about_author', 'half_title']) expect(isBlankMatter(k, 'front', '')).toBe(false);
    expect(isBlankMatter('chapter', 'body', '')).toBe(false);
    expect(isBlankMatter('part', 'body', '')).toBe(false);
  });
  it('writes the Also by text one title to a paragraph', () => {
    expect(alsoByMarkdown([])).toBe('');
    expect(alsoByMarkdown(['A', 'B: C'])).toBe('# Also by\n\nA\n\nB: C');
  });
});
