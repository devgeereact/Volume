// Production hub (D-048, D-049): stage advances, the one marketing gate, writingComplete and marketingCounts on the
// book, the owner's publish date, template marketing counts, AI disclosure evidence and the pack text fields.
// Mock AI only, no live calls.
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { MockAiAdapter } from '../src/adapters/mock-ai.js';
import { VolumeExportAdapter } from '../src/adapters/volume-export.js';
import { buildApp } from '../src/app.js';
import { ensureOwner, type RequestCtx } from '../src/auth/context.js';
import { loadTemplateFile } from '../src/config/book-structure.js';
import { buildExportBook, isWritingComplete, marketingCountsOf } from '../src/jobs/book-data.js';
import type { AiStage, AiStageInput, AiStageResult, RunStageOptions } from '../src/ports/ai.js';
import { parsePublishedAt } from '../src/routes/books.js';
import type { WritingState } from '../src/repos/manuscript.js';
import { HOST, ORIGIN, str, testApp, type TestApp } from './helpers.js';

type Obj = Record<string, unknown>;
interface SectionRow {
  id: string;
  kind: string;
  enabled: boolean;
  plan: Obj;
  currentVersionId: string | null;
}

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const CONFIG = join(ROOT, 'config');
const NOW = new Date(Date.UTC(2026, 9, 18, 12));

let t: TestApp | null = null;
afterEach(async () => {
  if (t) await t.close();
  t = null;
});

function app(): TestApp {
  if (!t) throw new Error('No test app.');
  return t;
}

async function newBook(over: Obj = {}): Promise<string> {
  const p = await app().call<Obj>('POST', '/api/v1/profiles', {
    penName: 'Test Author',
    bioThirdPerson: 'Test Author writes plain books.',
    shortBio: 'Test Author writes plain books in London.',
  });
  expect(p.status).toBe(201);
  const b = await app().call<Obj>('POST', '/api/v1/books', {
    profileId: str(p.body['id']),
    idea: 'Calm mornings',
    title: 'Calm Mornings',
    settings: { acknowledgements: 'Sam' },
    ...over,
  });
  expect(b.status).toBe(201);
  return str(b.body['id']);
}

async function approved(id: string): Promise<void> {
  expect((await app().call('POST', `/api/v1/books/${id}/blueprints`, { chapterCount: 2 })).status).toBe(202);
  await app().services.runner.runUntilIdle();
  expect((await app().call('POST', `/api/v1/books/${id}/blueprint/approve`, {})).status).toBe(200);
}

async function sections(id: string): Promise<SectionRow[]> {
  const tree = await app().call<{ front: SectionRow[]; body: (SectionRow & { children: SectionRow[] })[]; back: SectionRow[] }>(
    'GET',
    `/api/v1/books/${id}/sections`,
  );
  return [...tree.body.front, ...tree.body.body.flatMap((s) => [s, ...s.children]), ...tree.body.back];
}

/** Sections the AI or the owner writes that are switched on (what isWritingComplete looks at). */
async function writable(id: string): Promise<SectionRow[]> {
  const code = new Set(['half_title', 'title_page', 'copyright', 'contents', 'about_author', 'also_by', 'part']);
  return (await sections(id)).filter((s) => s.enabled && !code.has(s.kind) && s.plan['writer'] !== 'code');
}

async function book(id: string): Promise<Obj> {
  const r = await app().call<Obj>('GET', `/api/v1/books/${id}`);
  expect(r.status).toBe(200);
  return r.body;
}

async function ownerSaves(id: string, rows: SectionRow[]): Promise<void> {
  for (const s of rows) {
    const r = await app().call('POST', `/api/v1/sections/${s.id}/versions`, { bodyMd: `# ${s.kind}\n\nThe owner wrote this section by hand.` });
    expect(r.status).toBe(201);
  }
}

describe('isWritingComplete (unit)', () => {
  const sec = (kind: string, written: boolean, extra: Partial<WritingState> = {}): WritingState => ({
    kind,
    enabled: true,
    plan: {},
    currentVersionId: written ? 'v1' : null,
    wordCount: written ? 120 : 0,
    currentSource: written ? 'ai:writing' : null,
    ...extra,
  });
  it('needs every switched-on written section, ignores code pages, parts and switched-off sections', () => {
    expect(isWritingComplete([])).toBe(false);
    expect(isWritingComplete([sec('title_page', false), sec('part', false)])).toBe(false);
    expect(isWritingComplete([sec('chapter', true), sec('chapter', false)])).toBe(false);
    expect(isWritingComplete([sec('chapter', true), sec('title_page', false), sec('part', false), sec('dedication', false, { enabled: false })])).toBe(true);
    expect(isWritingComplete([sec('chapter', true), sec('disclaimer', false, { plan: { writer: 'owner' } })])).toBe(false);
    expect(isWritingComplete([sec('spread', true), sec('spread', true)])).toBe(true);
  });
  it('does not count the app placeholder for the owner to fill', () => {
    expect(isWritingComplete([sec('chapter', true), sec('acknowledgements', true, { currentSource: 'app:placeholder' })])).toBe(false);
    expect(isWritingComplete([sec('chapter', true), sec('acknowledgements', true, { currentSource: 'human' })])).toBe(true);
  });
  it('does not count an empty or whitespace-only version (zero words)', () => {
    expect(isWritingComplete([sec('chapter', true), sec('chapter', true, { wordCount: 0, currentSource: 'human' })])).toBe(false);
  });
});

describe('stage advances (D-048)', () => {
  it('nonfiction: choosing a title moves to blueprint; the last AI section moves to editor', async () => {
    t = await testApp();
    const id = await newBook();
    await app().call('POST', `/api/v1/books/${id}/title-sets`, {});
    await app().services.runner.runUntilIdle();
    const sets = await app().call<{ items: { id: string }[] }>('GET', `/api/v1/books/${id}/title-sets`);
    const chosen = await app().call<{ book: Obj }>('POST', `/api/v1/title-sets/${str(sets.body.items[0]?.id)}/choose`, { index: 0 });
    expect(chosen.status).toBe(200);
    expect(chosen.body.book['stage']).toBe('blueprint');
    await approved(id);
    expect((await book(id))['stage']).toBe('writing');
    expect((await book(id))['writingComplete']).toBe(false);
    await app().call('POST', `/api/v1/books/${id}/write`, {});
    await app().services.runner.runUntilIdle();
    const b = await book(id);
    expect(b['stage']).toBe('editor');
    expect(b['writingComplete']).toBe(true);
  });

  for (const template of ['fiction', 'workbook'] as const) {
    it(`${template}: the AI writer finishing every section moves to editor`, async () => {
      t = await testApp();
      const id = await newBook({ template, ...(template === 'fiction' ? { settings: { acknowledgements: 'Sam', pov: 'close third', tense: 'past' } } : {}) });
      await approved(id);
      await app().call('POST', `/api/v1/books/${id}/write`, {});
      await app().services.runner.runUntilIdle();
      const b = await book(id);
      expect(b['stage']).toBe('editor');
      expect(b['writingComplete']).toBe(true);
    });
  }

  it('owner saves: the last hand-written section moves to editor, not before', async () => {
    t = await testApp();
    const id = await newBook();
    await approved(id);
    const rows = await writable(id);
    expect(rows.length).toBeGreaterThan(2);
    await ownerSaves(id, rows.slice(0, -1));
    expect((await book(id))['stage']).toBe('writing');
    await ownerSaves(id, rows.slice(-1));
    const b = await book(id);
    expect(b['stage']).toBe('editor');
    expect(b['writingComplete']).toBe(true);
  });

  it('picture book: editor once the story is saved', async () => {
    t = await testApp();
    const id = await newBook({ bookTypeId: 'picture-book', title: 'Pip and the Quiet Meadow' });
    await app().call('POST', `/api/v1/books/${id}/picture-book`, { story: { newWord: 'Brave' } });
    await app().services.runner.runUntilIdle(2); // parent, story
    const b = await book(id);
    expect(b['stage']).toBe('editor');
    expect(b['writingComplete']).toBe(true);
  });

  it('never moves a book back', async () => {
    t = await testApp();
    const id = await newBook();
    await app().call('PATCH', `/api/v1/books/${id}`, { stage: 'cover' });
    await app().call('POST', `/api/v1/books/${id}/title-sets`, {});
    await app().services.runner.runUntilIdle();
    const sets = await app().call<{ items: { id: string }[] }>('GET', `/api/v1/books/${id}/title-sets`);
    await app().call('POST', `/api/v1/title-sets/${str(sets.body.items[0]?.id)}/choose`, { index: 0 });
    expect((await book(id))['stage']).toBe('cover');
  });
});

describe('marketing gate and book fields (D-049)', () => {
  it('refuses marketing with 409 writing_incomplete until every section is written, and reports writingComplete', async () => {
    t = await testApp();
    const id = await newBook();
    await approved(id);
    const rows = await writable(id);
    await ownerSaves(id, rows.slice(0, 1));
    const refused = await app().call<{ error: { code: string; message: string } }>('POST', `/api/v1/books/${id}/marketing`, {});
    expect(refused.status).toBe(409);
    expect(refused.body.error).toEqual({ code: 'writing_incomplete', message: 'Finish writing every chapter before marketing.' });
    const list = await app().call<{ items: Obj[] }>('GET', '/api/v1/books');
    expect(list.body.items.find((b) => b['id'] === id)).toMatchObject({ writingComplete: false, marketingCounts: { tiktok: 5, instagram: 5 } });

    await ownerSaves(id, rows.slice(1));
    expect(await book(id)).toMatchObject({ writingComplete: true, marketingCounts: { tiktok: 5, instagram: 5 } });
    const list2 = await app().call<{ items: Obj[] }>('GET', '/api/v1/books');
    expect(list2.body.items.find((b) => b['id'] === id)?.['writingComplete']).toBe(true);
    expect((await app().call('POST', `/api/v1/books/${id}/marketing`, {})).status).toBe(202);
  });

  it('regenerating one marketing item also needs writing complete', async () => {
    t = await testApp();
    const id = await newBook();
    await approved(id);
    await app().call('POST', `/api/v1/books/${id}/write`, {});
    await app().services.runner.runUntilIdle();
    await app().call('POST', `/api/v1/books/${id}/marketing`, { kinds: ['tiktok_script'] });
    await app().services.runner.runUntilIdle();
    const items = await app().call<{ items: { id: string }[] }>('GET', `/api/v1/books/${id}/marketing`);
    const itemId = str(items.body.items[0]?.id);
    // Switch on an empty section: writing is no longer complete.
    const off = (await sections(id)).find((s) => !s.enabled && s.currentVersionId === null && s.plan['writer'] !== 'code' && s.kind !== 'also_by');
    expect(off).toBeDefined();
    await app().call('PATCH', `/api/v1/sections/${str(off?.id)}`, { enabled: true });
    const r = await app().call<{ error: { code: string } }>('POST', `/api/v1/marketing/${itemId}/regenerate`, {});
    expect(r.status).toBe(409);
    expect(r.body.error.code).toBe('writing_incomplete');
  });
});

describe('marketing counts from the template', () => {
  it('reads default.count for tiktok-scripts and instagram-captions, else 5', async () => {
    expect(marketingCountsOf(null)).toEqual({ tiktok: 5, instagram: 5 });
    expect(marketingCountsOf({ packages: { marketing: 'same as nonfiction' } })).toEqual({ tiktok: 5, instagram: 5 });
    expect(
      marketingCountsOf({
        packages: {
          marketing: [
            { id: 'tiktok-scripts', default: { count: 3 } },
            { id: 'instagram-captions', default: { count: 'six' } },
          ],
        },
      }),
    ).toEqual({ tiktok: 3, instagram: 5 });
    for (const id of ['nonfiction', 'fiction', 'workbook', 'picture-book']) {
      expect(marketingCountsOf(await loadTemplateFile(CONFIG, id))).toEqual({ tiktok: 5, instagram: 5 });
    }
  });

  it('passes tiktokCount and instagramCount to the AI, and count 1 when regenerating one item', async () => {
    const calls: Obj[] = [];
    class Recording extends MockAiAdapter {
      override async runStage<S extends AiStage>(stage: S, input: AiStageInput, opts?: RunStageOptions): Promise<AiStageResult<S>> {
        if (stage === 'marketing') calls.push(input.variables);
        return super.runStage(stage, input, opts);
      }
    }
    t = await testApp({ ai: new Recording() });
    const id = await newBook();
    await approved(id);
    await app().call('POST', `/api/v1/books/${id}/write`, {});
    await app().services.runner.runUntilIdle();
    await app().call('POST', `/api/v1/books/${id}/marketing`, {});
    await app().services.runner.runUntilIdle();
    expect(calls[0]).toMatchObject({ tiktokCount: 5, instagramCount: 5 });
    const items = await app().call<{ items: { id: string; kind: string }[] }>('GET', `/api/v1/books/${id}/marketing`);
    expect(items.body.items.filter((i) => i.kind === 'tiktok_script')).toHaveLength(5);
    expect(items.body.items.filter((i) => i.kind === 'instagram_caption')).toHaveLength(5);
    await app().call('POST', `/api/v1/marketing/${str(items.body.items[0]?.id)}/regenerate`, {});
    await app().services.runner.runUntilIdle();
    expect(calls[1]).toMatchObject({ count: 1 });
    expect(calls[1]?.['tiktokCount']).toBeUndefined();
  });
});

describe('publish date', () => {
  /** The error parsePublishedAt throws, or null. */
  const errorOf = (raw: unknown, now: number): unknown => {
    try {
      parsePublishedAt(raw, now);
      return null;
    } catch (e) {
      return e;
    }
  };

  it('parses YYYY-MM-DD, today or earlier in any time zone', () => {
    // 23:30Z on 18 October: already 19 October east of UTC+0:30, so the 19th is accepted.
    const lateUtc = Date.UTC(2026, 9, 18, 23, 30);
    expect(parsePublishedAt('2026-10-18', lateUtc)).toBe(Date.UTC(2026, 9, 18));
    expect(parsePublishedAt('2026-10-19', lateUtc)).toBe(Date.UTC(2026, 9, 19));
    expect(parsePublishedAt('2024-02-29', lateUtc)).toBe(Date.UTC(2024, 1, 29));
    // 00:30 BST on 19 October is 23:30Z on the 18th: the owner's local today (the 19th) passes.
    const bstAfterMidnight = Date.UTC(2026, 9, 18, 23, 30);
    expect(parsePublishedAt('2026-10-19', bstAfterMidnight)).toBe(Date.UTC(2026, 9, 19));
    // 00:30Z on 18 October: the 19th has not started anywhere (UTC+14 is 14:30 on the 18th).
    expect(errorOf('2026-10-19', Date.UTC(2026, 9, 18, 0, 30))).toMatchObject({ code: 'invalid_published_at', statusCode: 400 });
    for (const bad of ['2026-10-21', '2027-01-01', '2023-02-29', '2026-13-01', '18/10/2026', '2026-1-5', 20261018, null]) {
      expect(errorOf(bad, lateUtc)).toMatchObject({ code: 'invalid_published_at', statusCode: 400 });
    }
  });

  it('stores a custom date, refuses future and badly written dates, keeps now() without a body', async () => {
    t = await testApp();
    const id = await newBook();
    const custom = await app().call<Obj>('POST', `/api/v1/books/${id}/publish`, { publishedAt: '2025-03-14' });
    expect(custom.status).toBe(200);
    expect(custom.body).toMatchObject({ status: 'published', publishedAt: Date.UTC(2025, 2, 14) });

    const tomorrow = new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10);
    const id2 = await newBook();
    const future = await app().call<{ error: { code: string } }>('POST', `/api/v1/books/${id2}/publish`, { publishedAt: tomorrow });
    expect(future.status).toBe(400);
    expect(future.body.error.code).toBe('invalid_published_at');
    const badFormat = await app().call<{ error: { code: string } }>('POST', `/api/v1/books/${id2}/publish`, { publishedAt: '14 March 2025' });
    expect(badFormat.status).toBe(400);
    expect(badFormat.body.error.code).toBe('invalid_published_at');
    expect((await book(id2))['status']).toBe('active');

    const before = Date.now();
    const plain = await app().app.inject({ method: 'POST', url: `/api/v1/books/${id2}/publish`, headers: { host: '127.0.0.1:5181' } });
    expect(plain.statusCode).toBe(200);
    expect((JSON.parse(plain.body) as Obj)['publishedAt']).toBeGreaterThanOrEqual(before);
  });

  it('refuses an archived book with 409 and still runs the batch quality gate', async () => {
    t = await testApp();
    const id = await newBook();
    await app().call('POST', `/api/v1/books/${id}/archive`, {});
    const archived = await app().call<{ error: { code: string } }>('POST', `/api/v1/books/${id}/publish`, { publishedAt: '2025-03-14' });
    expect(archived.status).toBe(409);
    expect(archived.body.error.code).toBe('invalid_state');

    const batched = await newBook();
    // A book that was ever in a batch (batched_at set) is published only after preflight and claims review (P8-2).
    await app().handle.db.updateTable('projects').set({ batchedAt: Date.now() }).where('id', '=', batched).execute();
    const gated = await app().call<{ error: { code: string } }>('POST', `/api/v1/books/${batched}/publish`, { publishedAt: '2025-03-14' });
    expect(gated.status).toBe(409);
    expect(gated.body.error.code).toBe('quality_gate');
    expect((await book(batched))['status']).toBe('active');
  });
});

describe('AI disclosure evidence and pack text', () => {
  const exporter = (): VolumeExportAdapter => new VolumeExportAdapter({ root: ROOT, now: () => NOW });

  async function disclosureItem(id: string): Promise<{ severity: string; message: string }> {
    const pre = await app().call<{ items: { id: string; severity: string; message: string }[] }>('GET', `/api/v1/books/${id}/preflight`);
    const item = pre.body.items.find((i) => i.id === 'kdp.ai-disclosure');
    if (!item) throw new Error('No kdp.ai-disclosure item.');
    return item;
  }

  async function clearFlag(id: string): Promise<void> {
    await app()
      .handle.db.updateTable('projects')
      .set({ aiDisclosure: JSON.stringify({ text: 'none', images: 'none', translation: 'none' }) })
      .where('id', '=', id)
      .execute();
  }

  it('fails when the AI wrote text and the flag is unset, passes for an owner-only book', async () => {
    t = await testApp({ exporter: exporter() });
    const ai = await newBook();
    await approved(ai);
    await app().call('POST', `/api/v1/books/${ai}/write`, {});
    await app().services.runner.runUntilIdle();
    await clearFlag(ai);
    expect((await disclosureItem(ai)).severity).toBe('block');

    const owner = await newBook();
    await approved(owner);
    await ownerSaves(owner, await writable(owner));
    expect((await disclosureItem(owner)).severity).toBe('pass');
  });

  it('counts a restored AI version as AI text', async () => {
    t = await testApp({ exporter: exporter() });
    const id = await newBook();
    await approved(id);
    const rows = await writable(id);
    await ownerSaves(id, rows);
    const target = str(rows.find((s) => s.kind === 'chapter')?.id);
    // An AI version (as from the writer), then the owner's text over it, then the AI version restored.
    const aiV = await app().services.repos.manuscript.saveVersion(app().owner, target, { bodyMd: '# Chapter\n\nAI text.', source: 'ai:writing' });
    await ownerSaves(
      id,
      rows.filter((s) => s.id === target),
    );
    const restored = await app().call<Obj>('POST', `/api/v1/sections/${target}/versions/${aiV.id}/restore`, {});
    expect(restored.status).toBe(201);
    await clearFlag(id);
    expect((await app().services.repos.manuscript.aiEvidence(app().owner, id)).text).toBe(true);
    expect((await disclosureItem(id)).severity).toBe('block');
  });

  it('a picture book with AI pictures and the flag unset fails', async () => {
    t = await testApp({ exporter: exporter() });
    const id = await newBook({ bookTypeId: 'picture-book', title: 'Pip and the Quiet Meadow' });
    await app().call('POST', `/api/v1/books/${id}/picture-book`, { story: { newWord: 'Brave' } });
    await app().services.runner.runUntilIdle();
    await clearFlag(id);
    const b = await buildExportBook(app().services.repos, app().owner, id, app().services.configDir, app().services.blobs);
    expect(b.aiEvidence).toEqual({ text: true, images: true });
    expect(b.aiDisclosure.images).toBe('none');
    const report = await exporter().preflight(b);
    expect(report.items.find((i) => i.id === 'kdp.ai-disclosure')?.severity).toBe('block');
  });

  it('passes the blueprint back blurb (no matter-stage blurb yet) and the short bio to the export book', async () => {
    t = await testApp();
    const id = await newBook();
    await approved(id);
    const b = await buildExportBook(app().services.repos, app().owner, id, app().services.configDir);
    expect(b.listing?.backBlurb).toMatch(/blurb/i);
    expect(b.author.shortBio).toBe('Test Author writes plain books in London.');
  });

  it('the matter-stage blurb (listings.back_blurb) wins over the blueprint blurb', async () => {
    t = await testApp();
    const id = await newBook();
    await approved(id);
    const at = Date.now();
    await app()
      .handle.db.insertInto('listings')
      .values({
        id: '01JMATTERBLURB0000000000AA',
        workspaceId: app().owner.workspaceId,
        projectId: id,
        descriptionHtml: null,
        backBlurb: 'The matter-stage back-cover blurb.',
        shortBio: null,
        categories: '[]',
        keywords: '[]',
        aiDisclosureNote: null,
        pricing: '{}',
        kdpRulesVersion: null,
        createdAt: at,
        updatedAt: at,
      })
      .execute();
    const b = await buildExportBook(app().services.repos, app().owner, id, app().services.configDir);
    expect(b.listing?.backBlurb).toBe('The matter-stage back-cover blurb.');
  });
});

describe('roles and workspaces on the new contract', () => {
  /** A second app on the same database that answers as the given caller. */
  async function as(ctx: RequestCtx): Promise<{ call: (method: 'POST' | 'GET', url: string, body?: unknown) => Promise<number>; close: () => Promise<void> }> {
    const built = await buildApp({
      config: app().services.config,
      handle: app().handle,
      startJobs: false,
      logger: false,
      auth: () => ({ resolve: () => Promise.resolve(ctx) }),
    });
    await built.app.ready();
    return {
      call: async (method, url, body) => {
        const headers: Record<string, string> = { host: HOST };
        if (body !== undefined) {
          headers['content-type'] = 'application/json';
          headers['origin'] = ORIGIN;
        }
        const res = await built.app.inject({ method, url, headers, ...(body !== undefined ? { payload: JSON.stringify(body) } : {}) });
        return res.statusCode;
      },
      close: () => built.app.close(),
    };
  }

  it('a viewer gets 403 on publish with a date; another workspace gets 404 on publish and marketing', async () => {
    t = await testApp();
    const id = await newBook();
    const viewer = await as({ ...app().owner, role: 'viewer' });
    try {
      expect(await viewer.call('POST', `/api/v1/books/${id}/publish`, { publishedAt: '2025-03-14' })).toBe(403);
    } finally {
      await viewer.close();
    }
    expect((await book(id))['status']).toBe('active');

    const other = await as(await ensureOwner(app().handle.db, 'publisher-b', 'Publisher B'));
    try {
      expect(await other.call('POST', `/api/v1/books/${id}/publish`, { publishedAt: '2025-03-14' })).toBe(404);
      expect(await other.call('POST', `/api/v1/books/${id}/marketing`, {})).toBe(404);
      expect(await other.call('GET', `/api/v1/books/${id}`)).toBe(404);
    } finally {
      await other.close();
    }
    expect((await book(id))['status']).toBe('active');
  });
});
