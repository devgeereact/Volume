import { fileURLToPath } from 'node:url';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { mockClaimSentence } from '../src/adapters/mock-ai.js';
import { VolumeExportAdapter } from '../src/adapters/volume-export.js';
import { fillEmpty } from '../src/jobs/handlers/production.js';
import { findMatches, replaceMatches } from '../src/lib/find.js';
import { MockExportAdapter } from '../src/adapters/mock-export.js';
import type { CoverInput, ExportBook } from '../src/ports/export.js';
import { testApp, type TestApp } from './helpers.js';

// Round 2 additions for the editor, claims, covers, marketing and the mock. Mock AI and mock exporter; no network.

interface Obj {
  [k: string]: unknown;
}

let t: TestApp | null = null;
afterEach(async () => {
  await t?.close();
  t = null;
});

async function writtenBook(app: TestApp): Promise<{ bookId: string; chapterId: string }> {
  const p = await app.call<Obj>('POST', '/api/v1/profiles', { penName: 'Test Author', bioThirdPerson: 'Test Author writes plain books.' });
  const b = await app.call<Obj>('POST', '/api/v1/books', { profileId: p.body['id'], idea: 'Calm mornings', title: 'Calm Mornings', template: 'nonfiction' });
  const bookId = b.body['id'] as string;
  await app.call('POST', `/api/v1/books/${bookId}/blueprints`, { chapterCount: 2 });
  await app.services.runner.runUntilIdle();
  await app.call('POST', `/api/v1/books/${bookId}/blueprint/approve`, {});
  await app.call('POST', `/api/v1/books/${bookId}/write`, {});
  await app.services.runner.runUntilIdle();
  const tree = await app.call<{ body: Obj[] }>('GET', `/api/v1/books/${bookId}/sections`);
  return { bookId, chapterId: tree.body.body.find((x) => x['kind'] === 'chapter')!['id'] as string };
}

async function current(app: TestApp, sectionId: string): Promise<{ id: string; bodyMd: string; note: string | null }> {
  const r = await app.call<{ current: { id: string; bodyMd: string; note: string | null } }>('GET', `/api/v1/sections/${sectionId}`);
  return r.body.current;
}

describe('1 and 2. weave or expand notes, and reopen a note', () => {
  it('expands a note into a new subsection and can reopen it', async () => {
    t = await testApp();
    const { chapterId } = await writtenBook(t);
    const n = await t.call<{ id: string }>('POST', `/api/v1/sections/${chapterId}/notes`, { note: 'My dog wakes me at six.' });
    const job = await t.call<{ job: { payload: Obj } }>('POST', `/api/v1/sections/${chapterId}/notes/weave`, { mode: 'expand' });
    expect(job.status).toBe(202);
    expect(job.body.job.payload['mode']).toBe('expand');
    await t.services.runner.runUntilIdle();
    const cur = await current(t, chapterId);
    expect(cur.bodyMd).toMatch(/^## \[MOCK\] Expanded Note$/m);
    expect(cur.bodyMd).toContain("Expanded from the author's note: My dog wakes me at six.");
    expect(cur.note).toBe('Expanded 1 author note');

    const woven = await t.call<{ items: { id: string; status: string; wovenVersionId: string | null }[] }>('GET', `/api/v1/sections/${chapterId}/notes`);
    expect(woven.body.items[0]).toMatchObject({ status: 'woven', wovenVersionId: cur.id });
    const reopened = await t.call<Obj>('POST', `/api/v1/notes/${n.body.id}/reopen`, {});
    expect(reopened.status).toBe(200);
    expect(reopened.body).toMatchObject({ status: 'open', wovenVersionId: cur.id });

    // Default mode is weave.
    await t.call('POST', `/api/v1/sections/${chapterId}/notes/weave`, {});
    await t.services.runner.runUntilIdle();
    expect((await current(t, chapterId)).bodyMd).toContain("Woven from the author's note: My dog wakes me at six.");
    expect((await t.call('POST', `/api/v1/sections/${chapterId}/notes/weave`, { mode: 'rewrite' })).status).toBe(400);
  });

  it('refuses to reopen a note that is being woven', async () => {
    t = await testApp();
    const { chapterId } = await writtenBook(t);
    const n = await t.call<{ id: string }>('POST', `/api/v1/sections/${chapterId}/notes`, { note: 'Later.' });
    await t.call('POST', `/api/v1/sections/${chapterId}/notes/weave`, {});
    expect((await t.call('POST', `/api/v1/notes/${n.body.id}/reopen`, {})).status).toBe(409);
  });
});

describe('3. claims carry a softer wording', () => {
  it('stores suggestedSoftening and uses it when soften has no replacement', async () => {
    t = await testApp();
    const { bookId } = await writtenBook(t);
    const claims = await t.call<{ items: { id: string; sentence: string; sectionId: string; suggestedSoftening: string | null }[] }>(
      'GET',
      `/api/v1/books/${bookId}/claims`,
    );
    const c = claims.body.items[0]!;
    expect(c.suggestedSoftening).toBe('[MOCK] A softer version of this sentence.');
    const res = await t.call<{ claim: { status: string }; textChanged: boolean }>('POST', `/api/v1/claims/${c.id}/soften`, {});
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ claim: { status: 'softened' }, textChanged: true });
    const text = (await current(t, c.sectionId)).bodyMd;
    expect(text).toContain('[MOCK] A softer version of this sentence.');
    expect(text).not.toContain(c.sentence);
    // An explicit replacement still wins.
    const other = claims.body.items[1]!;
    const own = await t.call<{ textChanged: boolean }>('POST', `/api/v1/claims/${other.id}/soften`, { replacement: 'My own softer line.' });
    expect(own.body.textChanged).toBe(true);
    expect((await current(t, other.sectionId)).bodyMd).toContain('My own softer line.');
  });
});

describe('4. cover typography on top of the cover style', () => {
  const root = fileURLToPath(new URL('../../../', import.meta.url));
  const exporter = new VolumeExportAdapter({ root });
  afterAll(async () => exporter.close());
  const book = { coverStyleId: null, bookTypeId: null } as unknown as ExportBook;

  it('picks the chosen style and palette, then applies position, size and colours', () => {
    const base = exporter.styleForCover(book, 'serene-serif', {});
    expect(base.id).toBe('serene-serif');
    const dusk = exporter.styleForCover(book, null, { styleId: 'serene-serif', paletteId: 'dusk-blue' });
    expect(dusk.colours.background.toUpperCase()).toBe('#26314F');
    const own = exporter.styleForCover(book, 'serene-serif', {
      paletteId: 'sage-ink',
      titlePosition: 'bottom',
      titleSize: 'large',
      palette: { title: '#112233', band: 'not a colour' },
      align: 'center',
    });
    expect(own.colours.background.toUpperCase()).toBe('#DCE5D6');
    expect(own.colours.title).toBe('#112233');
    // An invalid colour keeps the palette's own.
    expect(own.colours.band).toBe(exporter.styleForCover(book, 'serene-serif', { paletteId: 'sage-ink' }).colours.band);
    expect(own.titleTopPct).toBe(105);
    expect(own.titleScale).toBeCloseTo(base.titleScale * 1.2, 6);
    expect(own.align).toBe('center');
    // An unknown palette keeps the style's first palette.
    expect(exporter.styleForCover(book, 'serene-serif', { paletteId: 'nope' }).colours.background).toBe(base.colours.background);
  });

  it('passes the stored typography to the cover build', async () => {
    const seen: Record<string, unknown>[] = [];
    class Recording extends MockExportAdapter {
      override async buildEbookCover(input: CoverInput) {
        seen.push(input.typography);
        return super.buildEbookCover(input);
      }
    }
    t = await testApp({ exporter: new Recording() });
    const { bookId } = await writtenBook(t);
    await t.call('POST', `/api/v1/books/${bookId}/cover/concepts`, {});
    await t.services.runner.runUntilIdle();
    const cover = await t.call<{ cover: { concepts: { assetId: string }[] } }>('GET', `/api/v1/books/${bookId}/cover`);
    const typography = { styleId: 'serene-serif', paletteId: 'dusk-blue', titlePosition: 'top', showSubtitle: false };
    await t.call('POST', `/api/v1/books/${bookId}/cover/choose`, { assetId: cover.body.cover.concepts[0]!.assetId, typography });
    await t.call('POST', `/api/v1/books/${bookId}/cover/build`, {});
    await t.services.runner.runUntilIdle();
    expect(seen).toEqual([typography]);
  });
});

describe('5. the concepts job keeps the owner brief', () => {
  it('fills only empty fields', () => {
    expect(
      fillEmpty(
        { mood: 'Quiet dawn', palette: [], audience: '', concepts: [{ x: 1 }] },
        { mood: 'AI mood', palette: ['#111'], audience: 'Nurses', avoid: ['faces'] },
      ),
    ).toEqual({
      mood: 'Quiet dawn',
      palette: ['#111'],
      audience: 'Nurses',
      avoid: ['faces'],
    });
  });

  it('does not overwrite a saved brief when it makes concepts', async () => {
    t = await testApp();
    const { bookId } = await writtenBook(t);
    await t.call('PUT', `/api/v1/books/${bookId}/cover/brief`, { brief: { mood: 'Owner mood', palette: ['#000000'], composition: '' } });
    await t.call('POST', `/api/v1/books/${bookId}/cover/concepts`, {});
    await t.services.runner.runUntilIdle();
    const cover = await t.call<{ cover: { brief: Obj; concepts: unknown[] } }>('GET', `/api/v1/books/${bookId}/cover`);
    expect(cover.body.cover.brief).toMatchObject({ mood: 'Owner mood', palette: ['#000000'] });
    expect(cover.body.cover.brief['composition']).toMatch(/central symbol/);
    expect(cover.body.cover.concepts).toHaveLength(3);
  });
});

describe('6. selection rewrite', () => {
  it('returns a proposal without saving', async () => {
    t = await testApp();
    const { chapterId } = await writtenBook(t);
    const before = await current(t, chapterId);
    const from = before.bodyMd.indexOf('[MOCK] What if');
    const to = before.bodyMd.indexOf('?', from) + 1;
    const job = await t.call<{ jobId: string }>('POST', `/api/v1/sections/${chapterId}/rewrite-selection`, { from, to, instruction: 'Make it warmer' });
    expect(job.status).toBe(202);
    await t.services.runner.runUntilIdle();
    const done = await t.call<{ status: string; result: Obj }>('GET', `/api/v1/jobs/${job.body.jobId}`);
    expect(done.body.status).toBe('succeeded');
    expect(done.body.result).toMatchObject({ sectionId: chapterId, from, to, original: before.bodyMd.slice(from, to), baseVersionId: before.id });
    expect(done.body.result['text']).toContain('(rewritten)');
    expect((await current(t, chapterId)).id).toBe(before.id);
    expect((await t.call('POST', `/api/v1/sections/${chapterId}/rewrite-selection`, { from: 10, to: 5 })).status).toBe(400);
    expect((await t.call('POST', `/api/v1/sections/${chapterId}/rewrite-selection`, { from: 0, to: before.bodyMd.length + 5 })).status).toBe(400);
  });
});

describe('7. book-wide find and replace', () => {
  it('helpers match case and whole words', () => {
    const text = 'Calm mornings. calm Calmer calm.';
    expect(findMatches(text, 'calm').length).toBe(4);
    expect(findMatches(text, 'calm', { caseSensitive: true }).length).toBe(2);
    expect(findMatches(text, 'calm', { word: true }).map((m) => m.start)).toEqual([0, 15, 27]);
    expect(replaceMatches(text, findMatches(text, 'calm', { word: true }), 'quiet')).toBe('quiet mornings. quiet Calmer quiet.');
    expect(findMatches(text, '')).toEqual([]);
    expect(findMatches('a.b axb', '.').map((m) => m.start)).toEqual([1]);
  });

  it('finds per section and replaces with one human version per changed section', async () => {
    t = await testApp();
    const { bookId, chapterId } = await writtenBook(t);
    const found = await t.call<{
      total: number;
      sections: {
        sectionId: string;
        versionId: string;
        count: number;
        matches: { start: number; end: number; before: string; match: string; after: string }[];
      }[];
    }>('GET', `/api/v1/books/${bookId}/find?q=${encodeURIComponent('mock writer')}`);
    expect(found.status).toBe(200);
    expect(found.body.total).toBeGreaterThan(1);
    const ch = found.body.sections.find((x) => x.sectionId === chapterId)!;
    const body = (await current(t, chapterId)).bodyMd;
    expect(body.slice(ch.matches[0]!.start, ch.matches[0]!.end)).toBe('mock writer');
    expect(ch.matches[0]!.before.length).toBeGreaterThan(0);
    expect((await t.call<{ total: number }>('GET', `/api/v1/books/${bookId}/find?q=MOCK%20WRITER&case=true`)).body.total).toBe(0);

    const only = await t.call<{ replacements: number; sectionsChanged: number; versions: { sectionId: string }[] }>('POST', `/api/v1/books/${bookId}/replace`, {
      q: 'mock writer',
      replacement: 'test writer',
      sectionIds: [chapterId],
    });
    expect(only.body).toMatchObject({ sectionsChanged: 1, replacements: ch.count });
    const after = await current(t, chapterId);
    expect(after.bodyMd).toContain('test writer');
    expect(after.note).toMatch(/^Replaced "mock writer" with "test writer"/);
    const versions = await t.call<{ items: { source: string }[] }>('GET', `/api/v1/sections/${chapterId}/versions`);
    expect(versions.body.items.filter((v) => v.source === 'human')).toHaveLength(1);

    const rest = await t.call<{ replacements: number; sectionsChanged: number }>('POST', `/api/v1/books/${bookId}/replace`, {
      q: 'mock writer',
      replacement: 'test writer',
    });
    expect(rest.body.sectionsChanged).toBe(found.body.sections.length - 1);
    expect((await t.call<{ total: number }>('GET', `/api/v1/books/${bookId}/find?q=mock%20writer`)).body.total).toBe(0);
    expect((await t.call('GET', `/api/v1/books/${bookId}/find`)).status).toBe(400);
  });
});

describe('8. marketing', () => {
  it('keeps all subject lines, the image idea and hashtags, and regenerates one item in place', async () => {
    t = await testApp();
    const { bookId } = await writtenBook(t);
    await t.call('POST', `/api/v1/books/${bookId}/marketing`, {});
    await t.services.runner.runUntilIdle();
    const items = await t.call<{
      items: { id: string; kind: string; title: string | null; hashtags: string[]; subjectLines: string[]; imageIdea: string | null; body: string }[];
    }>('GET', `/api/v1/books/${bookId}/marketing`);
    const email = items.body.items.find((i) => i.kind === 'launch_email')!;
    const insta = items.body.items.find((i) => i.kind === 'instagram_caption')!;
    const tiktok = items.body.items.find((i) => i.kind === 'tiktok_script')!;
    expect(email.subjectLines).toEqual(['[MOCK] It is here', '[MOCK] New book', '[MOCK] Launch day']);
    expect(email.title).toBe('[MOCK] It is here');
    expect(insta.imageIdea).toContain('windowsill');
    expect(tiktok.hashtags).toEqual(['#booktok', '#newbook']);
    expect(tiktok.subjectLines).toEqual([]);

    await t.call('PATCH', `/api/v1/marketing/${insta.id}`, { body: 'Owner edit.', status: 'used' });
    const job = await t.call<{ jobId: string }>('POST', `/api/v1/marketing/${insta.id}/regenerate`, {});
    expect(job.status).toBe(202);
    await t.services.runner.runUntilIdle();
    const after = await t.call<{ items: { id: string; kind: string; body: string; status: string; imageIdea: string | null }[] }>(
      'GET',
      `/api/v1/books/${bookId}/marketing`,
    );
    expect(after.body.items).toHaveLength(items.body.items.length);
    const again = after.body.items.find((i) => i.id === insta.id)!;
    expect(again).toMatchObject({ kind: 'instagram_caption', status: 'draft' });
    expect(again.body).not.toBe('Owner edit.');
    expect(again.imageIdea).toContain('windowsill');
    expect((await t.call('POST', '/api/v1/marketing/nope/regenerate', {})).status).toBe(404);
  });
});

describe('9. mock claims stay inside one paragraph', () => {
  it('never spans a heading', () => {
    const md = '# Heading Without a Stop\n\n[MOCK] What if the next hour could change how you see this? More text.\n\n## Sub\n\n[MOCK] Paragraph 1.';
    const found = mockClaimSentence(md)!;
    expect(found.sentence).toBe('[MOCK] What if the next hour could change how you see this?');
    expect(md.slice(found.start, found.start + found.sentence.length)).toBe(found.sentence);
    expect(found.sentence).not.toContain('#');
    expect(mockClaimSentence('# Only a heading [MOCK]')).toBeNull();
  });

  it('gives claims from the writing job one sentence with offsets', async () => {
    t = await testApp();
    const { bookId } = await writtenBook(t);
    const claims = await t.call<{ items: { sentence: string; location: { start: number | null; end: number | null }; sectionId: string }[] }>(
      'GET',
      `/api/v1/books/${bookId}/claims`,
    );
    for (const c of claims.body.items) {
      expect(c.sentence).not.toMatch(/\n|#/);
      const body = (await current(t, c.sectionId)).bodyMd;
      expect(body.slice(c.location.start ?? -1, c.location.end ?? -1)).toBe(c.sentence);
    }
  });
});
