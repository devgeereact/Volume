import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { str, testApp, type TestApp } from './helpers.js';

/** Typed bodies for the cover brief, cover typography and blueprint edits (D-050), in the shapes the web sends. */

type Obj = Record<string, unknown>;
let t: TestApp;
let bookId: string;
let assetId: string;

beforeAll(async () => {
  t = await testApp();
  const p = await t.call<Obj>('POST', '/api/v1/profiles', { penName: 'Body Pen', bioThirdPerson: 'Writes.' });
  const b = await t.call<Obj>('POST', '/api/v1/books', { profileId: str(p.body['id']), idea: 'Strict bodies', title: 'Strict Bodies', template: 'nonfiction' });
  bookId = str(b.body['id']);
  await t.call('POST', `/api/v1/books/${bookId}/blueprints`, { chapterCount: 2 });
  await t.call('POST', `/api/v1/books/${bookId}/cover/concepts`, {});
  await t.services.runner.runUntilIdle();
  const cover = await t.call<{ cover: { concepts: { assetId: string }[] } }>('GET', `/api/v1/books/${bookId}/cover`);
  assetId = str(cover.body.cover.concepts[0]?.assetId);
});
afterAll(async () => t.close());

describe('PUT /books/:id/cover/brief', () => {
  it('accepts the brief the web sends, keeps the stored concepts and drops unknown keys', async () => {
    const stored = (await t.call<{ cover: { brief: Obj } }>('GET', `/api/v1/books/${bookId}/cover`)).body.cover.brief;
    const brief = { ...stored, genre: ['Self-help'], mood: 'calm, warm', palette: ['#112233'], use: ['kettle'], avoid: ['faces'], extraFromAi: 'x' };
    const res = await t.call<{ cover: { brief: Obj } }>('PUT', `/api/v1/books/${bookId}/cover/brief`, { brief });
    expect(res.status).toBe(200);
    expect(res.body.cover.brief).toMatchObject({ genre: ['Self-help'], mood: 'calm, warm', palette: ['#112233'], use: ['kettle'], avoid: ['faces'] });
    expect(res.body.cover.brief).not.toHaveProperty('extraFromAi');
    expect(res.body.cover.brief['concepts']).toEqual(stored['concepts']);
  });

  it('refuses wrong types, oversize values and extra top-level keys', async () => {
    const bad: unknown[] = [
      { brief: { palette: 'red' } },
      { brief: { mood: 5 } },
      { brief: { concepts: [{ name: 'A' }] } },
      { brief: { avoid: Array.from({ length: 40 }, () => 'x') } },
      { brief: { audience: 'x'.repeat(3000) } },
      { brief: {}, other: true },
      { brief: 'text' },
    ];
    for (const body of bad) {
      const res = await t.call<{ error: { code: string } }>('PUT', `/api/v1/books/${bookId}/cover/brief`, body);
      expect(res.status, JSON.stringify(body).slice(0, 80)).toBe(400);
      expect(res.body.error.code).toBe('validation_failed');
    }
  });
});

describe('POST /books/:id/cover/choose', () => {
  it('accepts the typography the web builds', async () => {
    const typography = { styleId: 'serene-serif', paletteId: null, showSubtitle: true, titlePosition: 'top', titleTopPct: 22.5, titleSize: 0.12, sizePct: 100 };
    const res = await t.call<{ cover: { typography: Obj } }>('POST', `/api/v1/books/${bookId}/cover/choose`, { assetId, typography });
    expect(res.status).toBe(200);
    expect(res.body.cover.typography).toEqual(typography);
    const full = { align: 'left', colours: { title: '#ffffff' }, fonts: { title: 'Lora' }, titleUppercase: true, authorUppercase: false, titleSize: 'large' };
    expect((await t.call('POST', `/api/v1/books/${bookId}/cover/choose`, { assetId, typography: full })).status).toBe(200);
  });

  it('refuses unknown keys, bad colours and wrong types', async () => {
    const bad: Obj[] = [
      { styleId: 'a', script: '<b>' },
      { colours: { title: 'red' } },
      { titlePosition: 'left' },
      { showSubtitle: 'no' },
      { titleTopPct: 999 },
      { fonts: { title: 'Lora', body: 'x' } },
    ];
    for (const typography of bad) {
      const res = await t.call<{ error: { code: string } }>('POST', `/api/v1/books/${bookId}/cover/choose`, { assetId, typography });
      expect(res.status, JSON.stringify(typography)).toBe(400);
    }
    expect((await t.call('POST', `/api/v1/books/${bookId}/cover/choose`, { assetId, extra: 1 })).status).toBe(400);
  });
});

describe('PATCH /books/:id/blueprint', () => {
  it('accepts the summary, chapter, listing and restore edits the web sends', async () => {
    const bp = await t.call<{ blueprint: { version: number; data: Obj } }>('GET', `/api/v1/books/${bookId}/blueprint`);
    const data = bp.body.blueprint.data;
    const chapters = (data['chapters'] as Obj[]).map((c) => ({ ...c, title: `${String(c['title'])} edited` }));
    const edit = await t.call<{ version: number; data: Obj }>('PATCH', `/api/v1/books/${bookId}/blueprint`, {
      parts: { summary: 'New summary.', usps: ['One'], chapters, keywords: ['calm'] },
      baseVersion: bp.body.blueprint.version,
      note: 'Edited',
    });
    expect(edit.status).toBe(200);
    expect(edit.body.data['summary']).toBe('New summary.');
    // A restore sends the whole blueprint, including any extra keys the planner stored; those are dropped, not refused.
    const restore = await t.call<{ data: Obj }>('PATCH', `/api/v1/books/${bookId}/blueprint`, { parts: { ...data, someExtra: { a: 1 } } });
    expect(restore.status).toBe(200);
    expect(restore.body.data['summary']).toBe(data['summary']);
  });

  it('refuses wrong types and runaway nesting', async () => {
    let deep: unknown = 'x';
    for (let i = 0; i < 8; i += 1) deep = { a: deep };
    const bad: Obj[] = [
      { chapters: 'none' },
      { chapters: [{ number: 'one', title: 'x' }] },
      { usps: [1, 2] },
      { title: 'x'.repeat(400) },
      { front: { dedication: deep } },
      { storyBible: { characters: [{ role: 'no name' }] } },
    ];
    for (const parts of bad) {
      const res = await t.call<{ error: { code: string } }>('PATCH', `/api/v1/books/${bookId}/blueprint`, { parts });
      expect(res.status, JSON.stringify(parts).slice(0, 80)).toBe(400);
      expect(res.body.error.code).toBe('validation_failed');
    }
    expect((await t.call('PATCH', `/api/v1/books/${bookId}/blueprint`, { parts: {}, extra: 1 })).status).toBe(400);
  });
});
