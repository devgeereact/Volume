import { sql } from 'kysely';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { mergeGuardrails, type VolumeAiStageResult } from '../src/adapters/openrouter-ai.js';
import { MockAiAdapter } from '../src/adapters/mock-ai.js';
import { MockExportAdapter } from '../src/adapters/mock-export.js';
import { BackupService } from '../src/backups/backup.js';
import { ConfigError, loadConfig } from '../src/config/env.js';
import { bioStatusFromPublishing } from '../src/db/migrations/0002_gaps.js';
import { AppError } from '../src/http/errors.js';
import {
  AiModelUnavailableError,
  type AiCredit,
  type AiGuardrails,
  type AiPort,
  type AiStage,
  type AiStageInput,
  type AiStageResult,
  type RunStageOptions,
} from '../src/ports/ai.js';
import type { ExportBook, ExportFile, PreflightReport } from '../src/ports/export.js';
import { seedProfiles } from '../src/seed/seed.js';
import { anyString, buildCovers, testApp, testConfig, type TestApp } from './helpers.js';

// The gap fields and endpoints the web screens asked for (all additive). No network.

interface Obj {
  [k: string]: unknown;
}

const NEEDS: AiGuardrails = {
  passed: false,
  blocking: [],
  needsAttention: [
    {
      rule: 'banned-phrase',
      severity: 'error',
      message: 'Banned phrase left after the rewrite.',
      match: 'at the end of the day',
      path: '',
      phrase: 'at the end of the day',
    },
  ],
  rules: [{ rule: 'banned-phrase', list: 'needsAttention', count: 1, message: 'Banned phrases', matches: ['at the end of the day'] }],
  styleRewrite: { phrases: ['at the end of the day'], applied: true, cleared: false, note: '' },
};

/** The mock AI with hooks: guardrails per stage, extra sources, a failing stage and credit. */
class HookAi implements AiPort {
  readonly provider = 'mock' as const;
  private readonly inner = new MockAiAdapter();
  constructor(
    private readonly o: {
      guardrails?: Partial<Record<AiStage, AiGuardrails>>;
      sources?: AiStageResult['sources'];
      fail?: AiStage;
      credit?: AiCredit | null;
      /** Appended to every writing answer (to put guardrail hits into the saved text). */
      writingSuffix?: string;
    } = {},
  ) {}
  async runStage<S extends AiStage>(stage: S, input: AiStageInput, opts?: RunStageOptions): Promise<AiStageResult<S>> {
    if (this.o.fail === stage) throw new AiModelUnavailableError('That model is gone.', 'gone/model');
    let r = await this.inner.runStage(stage, input, opts);
    if (stage === 'writing' && this.o.writingSuffix && input.promptId !== 'writing.extend-section') {
      const out = r.output as { markdown: string };
      r = { ...r, output: { ...out, markdown: `${out.markdown}\n\n${this.o.writingSuffix}` } as AiStageResult<S>['output'] };
    }
    const g = this.o.guardrails?.[stage];
    return { ...r, ...(g ? { guardrails: g } : {}), ...(stage === 'research' && this.o.sources ? { sources: this.o.sources } : {}) };
  }
  generateImage: AiPort['generateImage'] = (prompt, opts) => this.inner.generateImage(prompt, opts);
  estimate: AiPort['estimate'] = () => this.inner.estimate();
  credit(): Promise<AiCredit | null> {
    return Promise.resolve(this.o.credit ?? null);
  }
}

let t: TestApp | null = null;
const temps: string[] = [];
afterEach(async () => {
  await t?.close();
  t = null;
  for (const d of temps.splice(0)) rmSync(d, { recursive: true, force: true });
});

function tempDir(): string {
  const d = mkdtempSync(join(tmpdir(), 'volume-gaps-'));
  temps.push(d);
  return d;
}

async function profile(app: TestApp, extra: Obj = {}): Promise<string> {
  const p = await app.call<Obj>('POST', '/api/v1/profiles', { penName: 'Test Author', bioThirdPerson: 'Test Author writes plain books.', ...extra });
  return p.body['id'] as string;
}

async function book(app: TestApp, title = 'Calm Mornings', profileId?: string): Promise<string> {
  const pid = profileId ?? (await profile(app));
  const b = await app.call<Obj>('POST', '/api/v1/books', {
    profileId: pid,
    idea: 'Calm mornings',
    title,
    template: 'nonfiction',
    settings: { acknowledgements: 'Sam' },
  });
  return b.body['id'] as string;
}

async function writtenBook(app: TestApp, chapterCount = 2, title?: string): Promise<string> {
  const id = await book(app, title);
  await app.call('POST', `/api/v1/books/${id}/blueprints`, { chapterCount });
  await app.services.runner.runUntilIdle();
  expect((await app.call('POST', `/api/v1/books/${id}/blueprint/approve`, {})).status).toBe(200);
  await app.call('POST', `/api/v1/books/${id}/write`, {});
  await app.services.runner.runUntilIdle();
  return id;
}

describe('1. book list rows', () => {
  it('carry word and section totals, a running job flag and the chosen cover', async () => {
    t = await testApp();
    const id = await writtenBook(t);
    let rows = await t.call<{ items: Obj[] }>('GET', '/api/v1/books');
    let row = rows.body.items.find((b) => b['id'] === id)!;
    const tree = await t.call<{ totals: { words: number; sections: number } }>('GET', `/api/v1/books/${id}/sections`);
    expect(row['wordCount']).toBe(tree.body.totals.words);
    expect(row['wordCount']).toBeGreaterThan(0);
    expect(row['sectionCount']).toBe(tree.body.totals.sections);
    expect(row['jobRunning']).toBe(false);
    expect(row['coverAssetId']).toBeNull();
    expect(row['coverEbookAssetId']).toBeNull();

    await t.call('POST', `/api/v1/books/${id}/cover/concepts`, {});
    rows = await t.call<{ items: Obj[] }>('GET', '/api/v1/books');
    expect(rows.body.items.find((b) => b['id'] === id)!['jobRunning']).toBe(true);
    await t.services.runner.runUntilIdle();
    const cover = await t.call<{ cover: { concepts: { assetId: string }[] } }>('GET', `/api/v1/books/${id}/cover`);
    const assetId = cover.body.cover.concepts[0]!.assetId;
    await t.call('POST', `/api/v1/books/${id}/cover/choose`, { assetId });
    rows = await t.call<{ items: Obj[] }>('GET', '/api/v1/books');
    row = rows.body.items.find((b) => b['id'] === id)!;
    expect(row).toMatchObject({ jobRunning: false, coverAssetId: assetId });
    // GET /books/:id carries the same extras.
    expect((await t.call<Obj>('GET', `/api/v1/books/${id}`)).body).toMatchObject({ coverAssetId: assetId, sectionCount: row['sectionCount'] });
  });
});

describe('2. activity', () => {
  it('lists book created, stage changes, finished and failed jobs, the pack and publishing, newest first', async () => {
    t = await testApp({ ai: new HookAi({ fail: 'research' }) });
    const id = await writtenBook(t, 1);
    await buildCovers(t, id);
    await t.call('POST', `/api/v1/books/${id}/research`, {});
    await t.services.runner.runUntilIdle();
    await t.call('POST', `/api/v1/books/${id}/exports`, {});
    await t.services.runner.runUntilIdle();
    await t.call('POST', `/api/v1/books/${id}/publish`, {});
    const res = await t.call<{ items: { kind: string; at: number; projectId: string; title: string; detail: string; live: boolean }[] }>(
      'GET',
      '/api/v1/activity?limit=100',
    );
    expect(res.status).toBe(200);
    const kinds = new Set(res.body.items.map((i) => i.kind));
    for (const k of ['book_created', 'stage_changed', 'job_finished', 'job_failed', 'export_built', 'published']) expect(kinds, k).toContain(k);
    expect(res.body.items.every((i) => i.title === 'Calm Mornings' && i.live)).toBe(true);
    const times = res.body.items.map((i) => i.at);
    expect([...times].sort((a, b) => b - a)).toEqual(times);
    expect(res.body.items.find((i) => i.kind === 'job_failed')?.detail).toMatch(/^Research failed/);
    expect(res.body.items.find((i) => i.kind === 'stage_changed')?.detail).toMatch(/^Moved to /);
    // Section children do not flood the panel.
    expect(res.body.items.some((i) => i.detail.startsWith('Writing a section'))).toBe(false);
    expect((await t.call<{ items: unknown[] }>('GET', '/api/v1/activity?limit=2')).body.items).toHaveLength(2);
    expect((await t.call('GET', '/api/v1/activity?limit=0')).status).toBe(400);
  });
});

describe('3. settings extras', () => {
  it('shows credit (never the key), backups, house style and KDP rules versions and the providers', async () => {
    const dataDir = tempDir();
    t = await testApp({
      ai: new HookAi({ credit: { limitRemainingUsd: 4.5, limitUsd: 10, usageUsd: 5.5, isFreeTier: false } }),
      config: testConfig({ DATA_DIR: dataDir }),
    });
    const s = await t.call<Obj>('GET', '/api/v1/settings');
    expect(s.body).toMatchObject({
      openRouterCredit: { limitRemainingUsd: 4.5, limitUsd: 10 },
      backups: { lastAt: null, count: 0, locationKind: 'local_folder', keep: 14, enabled: true, supported: true },
      houseStyleVersion: 1,
      aiProvider: 'mock',
      exportProvider: 'mock',
    });
    expect(s.body['kdpRulesVersion']).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(JSON.stringify(s.body)).not.toMatch(/sk-or/);
  });

  it('gives null credit for the mock AI', async () => {
    t = await testApp();
    expect((await t.call<Obj>('GET', '/api/v1/settings')).body['openRouterCredit']).toBeNull();
  });

  it('tests the OpenRouter key through the key check and clears the monthly cap with null', async () => {
    t = await testApp();
    const none = await t.call<Obj>('POST', '/api/v1/settings/openrouter/test', {});
    expect(none.body).toMatchObject({ ok: false, creditUsd: null });
    await t.close();
    t = await testApp({ openRouterKeyCheck: () => Promise.resolve({ valid: true, limitRemainingUsd: 7.25 }) });
    expect((await t.call<Obj>('POST', '/api/v1/settings/openrouter/test', {})).body).toMatchObject({ ok: true, creditUsd: 7.25 });
    await t.close();
    t = await testApp({ openRouterKeyCheck: () => Promise.resolve({ valid: false, limitRemainingUsd: null }) });
    const bad = await t.call<Obj>('POST', '/api/v1/settings/openrouter/test', {});
    expect(bad.body).toMatchObject({ ok: false, creditUsd: null });
    expect(bad.body['message']).toMatch(/did not accept/);

    expect((await t.call<Obj>('PATCH', '/api/v1/settings', { 'budget.monthly_cap_usd': 25 })).body).toMatchObject({ budgets: { monthlyCapUsd: 25 } });
    expect((await t.call<Obj>('PATCH', '/api/v1/settings', { 'budget.monthly_cap_usd': null })).body).toMatchObject({ budgets: { monthlyCapUsd: null } });
  });

  it('uses book.defaults for new books and blueprint chapter counts', async () => {
    t = await testApp();
    const r = await t.call('PATCH', '/api/v1/settings', { 'book.defaults': { trim: '7x10', paper: 'cream', wordTarget: 30000, chapterCount: 3 } });
    expect(r.status).toBe(200);
    const id = await book(t);
    expect((await t.call<Obj>('GET', `/api/v1/books/${id}`)).body).toMatchObject({ trim: '7x10', paper: 'cream', wordTarget: 30000 });
    const job = await t.call<{ job: { payload: Obj } }>('POST', `/api/v1/books/${id}/blueprints`, {});
    expect(job.body.job.payload['chapterCount']).toBe(3);
    const pid = await profile(t);
    const own = await t.call<Obj>('POST', '/api/v1/books', { profileId: pid, idea: 'x', trim: '5.25x8' });
    expect(own.body['trim']).toBe('5.25x8');
  });
});

describe('4. published info', () => {
  it('takes list prices and marketplace, and shows formats and pack version from the latest export', async () => {
    t = await testApp();
    const id = await writtenBook(t, 1);
    let b = await t.call<Obj>('GET', `/api/v1/books/${id}`);
    expect(b.body).toMatchObject({ marketplace: 'amazon.co.uk', listPrices: { ebook: null, paperback: null, hardcover: null }, formats: [], packVersion: 0 });
    await buildCovers(t, id);
    const p = await t.call<Obj>('PATCH', `/api/v1/books/${id}`, { listPrices: { paperback: 8.99, ebook: 2.99 }, marketplace: 'Amazon.com' });
    expect(p.body).toMatchObject({ listPrices: { paperback: 8.99, ebook: 2.99, hardcover: null }, marketplace: 'amazon.com' });
    expect((await t.call('PATCH', `/api/v1/books/${id}`, { marketplace: 'ebay.co.uk' })).status).toBe(400);
    expect((await t.call<Obj>('PATCH', `/api/v1/books/${id}`, { listPrices: { ebook: null } })).body).toMatchObject({
      listPrices: { paperback: 8.99, ebook: null },
    });

    await t.call('POST', `/api/v1/books/${id}/exports`, {});
    await t.services.runner.runUntilIdle();
    await t.call('POST', `/api/v1/books/${id}/exports`, { kinds: ['pdf_print'] });
    await t.services.runner.runUntilIdle();
    await t.call('POST', `/api/v1/books/${id}/publish`, {});
    b = await t.call<Obj>('GET', `/api/v1/books/${id}`);
    expect(b.body['packVersion']).toBe(2);
    expect(typeof b.body['publishedAt']).toBe('number');
    // The latest export built only the print PDF, so only the paperback shows.
    const formats = b.body['formats'] as Obj[];
    expect(formats).toHaveLength(1);
    expect(formats[0]).toMatchObject({ format: 'Paperback', kind: 'paperback', listPriceGbp: 8.99 });
    expect((formats[0]!['pages'] as number) >= 24).toBe(true);
    const list = await t.call<{ items: Obj[] }>('GET', '/api/v1/books?published=true');
    expect(list.body.items[0]).toMatchObject({ id, packVersion: 2, marketplace: 'amazon.com' });
  });
});

describe('5. archive', () => {
  it('lists archived books, profiles and marketing items in one list', async () => {
    t = await testApp();
    // Marketing needs written text (409 before), so the book is written first.
    const id = await writtenBook(t, 1, 'Old Book');
    const lone = await profile(t, { penName: 'Spare Name' });
    await t.call('POST', `/api/v1/books/${id}/marketing`, {});
    await t.services.runner.runUntilIdle();
    const items = await t.call<{ items: { id: string }[] }>('GET', `/api/v1/books/${id}/marketing`);
    const mid = items.body.items[0]!.id;
    await t.call('POST', `/api/v1/marketing/${mid}/archive`, {});
    await t.call('POST', `/api/v1/books/${id}/archive`, {});
    await t.call('POST', `/api/v1/profiles/${lone}/archive`, {});
    const res = await t.call<{ items: { kind: string; id: string; title: string; detail: string; archivedAt: number; restorePath: string }[] }>(
      'GET',
      '/api/v1/archive',
    );
    expect(res.body.items.map((i) => i.kind).sort()).toEqual(['book', 'marketing', 'profile']);
    expect(res.body.items.find((i) => i.kind === 'book')).toMatchObject({ id, title: 'Old Book', restorePath: `/books/${id}/restore` });
    expect(res.body.items.find((i) => i.kind === 'profile')).toMatchObject({ id: lone, title: 'Spare Name', detail: 'Pen name' });
    expect(res.body.items.find((i) => i.kind === 'marketing')?.detail).toContain('Old Book');
    expect(res.body.items.every((i) => typeof i.archivedAt === 'number')).toBe(true);
    // 18: archived marketing across books.
    const m = await t.call<{ items: { id: string; status: string }[] }>('GET', '/api/v1/marketing?status=archived');
    expect(m.body.items.map((i) => i.id)).toEqual([mid]);
  });
});

describe('6. model and cost on planning items', () => {
  it('shows the main call model and the job cost on research runs, title sets and blueprint versions', async () => {
    t = await testApp();
    const id = await book(t);
    await t.call('POST', `/api/v1/books/${id}/research`, {});
    await t.call('POST', `/api/v1/books/${id}/title-sets`, {});
    await t.call('POST', `/api/v1/books/${id}/blueprints`, { chapterCount: 1 });
    await t.services.runner.runUntilIdle();
    const research = await t.call<{ latest: Obj; runs: Obj[] }>('GET', `/api/v1/books/${id}/research`);
    expect(research.body.latest).toMatchObject({ model: anyString, promptRunId: anyString });
    expect(research.body.latest['costUsd'] as number).toBeGreaterThan(0);
    const run = await t.call<Obj>('GET', `/api/v1/research-runs/${research.body.latest['id'] as string}`);
    expect(run.body['model']).toBe(research.body.latest['model']);
    const sets = await t.call<{ items: Obj[] }>('GET', `/api/v1/books/${id}/title-sets`);
    expect(sets.body.items[0]!['costUsd'] as number).toBeGreaterThan(0);
    expect(sets.body.items[0]!['model']).toEqual(anyString);
    const versions = await t.call<{ items: Obj[] }>('GET', `/api/v1/books/${id}/blueprint/versions`);
    expect(versions.body.items[0]).toMatchObject({ model: anyString });
    // An owner edit made no AI call.
    const bp = await t.call<{ blueprint: { data: Obj; version: number; model: string } }>('GET', `/api/v1/books/${id}/blueprint`);
    expect(bp.body.blueprint.model).toEqual(anyString);
    const edited = await t.call<Obj>('PATCH', `/api/v1/books/${id}/blueprint`, {
      baseVersion: bp.body.blueprint.version,
      parts: { summary: 'Owner summary.' },
    });
    expect(edited.status).toBe(200);
    expect(edited.body).toMatchObject({ model: null, costUsd: 0, guardrails: null });
  });
});

describe('7. writing jobs', () => {
  it('give an ETA from finished sibling sections and the model in use', async () => {
    t = await testApp();
    const id = await book(t);
    await t.call('POST', `/api/v1/books/${id}/blueprints`, { chapterCount: 3 });
    await t.services.runner.runUntilIdle();
    await t.call('POST', `/api/v1/books/${id}/blueprint/approve`, {});
    const w = await t.call<{ jobId: string }>('POST', `/api/v1/books/${id}/write`, {});
    // The parent plus two sections: the rest are still queued.
    await t.services.runner.runUntilIdle(3);
    const mid = await t.call<{
      etaMs: number | null;
      model: string | null;
      children: { kind: string; status: string; etaMs: number | null; model: string | null }[];
    }>('GET', `/api/v1/jobs/${w.body.jobId}`);
    expect(typeof mid.body.etaMs).toBe('number');
    expect(mid.body.model).toEqual(anyString);
    // Section children carry the ETA; the listing child after them (matter stage) has none.
    const queued = mid.body.children.filter((c) => c.status === 'queued' && c.kind === 'write_section');
    expect(queued.length).toBeGreaterThan(0);
    expect(queued.every((c) => typeof c.etaMs === 'number' && c.model !== null)).toBe(true);
    expect(mid.body.children.filter((c) => c.status === 'succeeded').every((c) => c.etaMs === null)).toBe(true);
    await t.services.runner.runUntilIdle();
    const done = await t.call<{ etaMs: number | null; model: string | null }>('GET', `/api/v1/jobs/${w.body.jobId}`);
    expect(done.body).toMatchObject({ etaMs: null, model: anyString });
    const list = await t.call<{ items: { kind: string; etaMs: number | null; model: string | null }[] }>('GET', `/api/v1/books/${id}/jobs`);
    expect(list.body.items.find((j) => j.kind === 'write_book')?.model).toEqual(anyString);
    expect(list.body.items.find((j) => j.kind === 'blueprint')).toMatchObject({ etaMs: null, model: null });
  });
});

describe('8. profile bio status', () => {
  it('defaults to confirmed in the app, keeps config status for seeded profiles and takes PATCH', async () => {
    t = await testApp();
    const id = await profile(t);
    expect((await t.call<Obj>('GET', `/api/v1/profiles/${id}`)).body['bioStatus']).toBe('confirmed');
    const other = await profile(t, { penName: 'Second', bioStatus: 'to_confirm' });
    expect((await t.call<Obj>('GET', `/api/v1/profiles/${other}`)).body['bioStatus']).toBe('to_confirm');
    expect((await t.call<Obj>('PATCH', `/api/v1/profiles/${other}`, { bioStatus: 'confirmed' })).body['bioStatus']).toBe('confirmed');
    expect((await t.call('PATCH', `/api/v1/profiles/${other}`, { bioStatus: 'maybe' })).status).toBe(400);

    await seedProfiles(t.services.repos, t.owner, t.services.config.configDir);
    const all = await t.call<{ items: { penName: string; bioStatus: string; publishing: { sourceStatus?: { bio?: string } } }[] }>('GET', '/api/v1/profiles');
    const seeded = all.body.items.filter((p) => p.publishing.sourceStatus?.bio);
    expect(seeded.length).toBeGreaterThan(0);
    for (const p of seeded) expect(p.bioStatus).toBe(p.publishing.sourceStatus?.bio === 'owner-to-confirm' ? 'to_confirm' : 'confirmed');
  });

  it('maps the config status the same way in the migration backfill', () => {
    expect(bioStatusFromPublishing(JSON.stringify({ sourceStatus: { bio: 'owner-to-confirm' } }))).toBe('to_confirm');
    expect(bioStatusFromPublishing(JSON.stringify({ sourceStatus: { bio: 'pen-name' } }))).toBe('confirmed');
    expect(bioStatusFromPublishing('{}')).toBeNull();
    expect(bioStatusFromPublishing('not json')).toBeNull();
  });
});

describe('9. research sources', () => {
  it('keep domain, redirect link and unresolved through the API', async () => {
    const redirect = 'https://vertexaisearch.cloud.google.com/grounding-api-redirect/abc';
    t = await testApp({
      ai: new HookAi({
        sources: [
          {
            url: 'https://www.nhs.uk/live-well/sleep/',
            title: 'Sleep',
            excerpt: null,
            startIndex: null,
            endIndex: null,
            domain: 'nhs.uk',
            redirectUrl: redirect,
            unresolved: false,
          },
          { url: redirect + '2', title: 'Unknown', excerpt: null, startIndex: null, endIndex: null, domain: null, redirectUrl: null, unresolved: true },
          { url: 'https://www.example.com/a', title: 'Older adapter', excerpt: null, startIndex: null, endIndex: null },
        ],
      }),
    });
    const id = await book(t);
    await t.call('POST', `/api/v1/books/${id}/research`, {});
    await t.services.runner.runUntilIdle();
    const r = await t.call<{ latest: { sources: Obj[] } }>('GET', `/api/v1/books/${id}/research`);
    const [a, b, c] = r.body.latest.sources;
    expect(a).toMatchObject({ domain: 'nhs.uk', redirectUrl: redirect, unresolved: false });
    expect(b).toMatchObject({ domain: null, redirectUrl: null, unresolved: true });
    expect(c).toMatchObject({ domain: 'example.com', redirectUrl: null, unresolved: false });
  });

  it('come from the mock with a domain', async () => {
    t = await testApp();
    const id = await book(t);
    await t.call('POST', `/api/v1/books/${id}/research`, {});
    await t.services.runner.runUntilIdle();
    const r = await t.call<{ latest: { sources: Obj[] } }>('GET', `/api/v1/books/${id}/research`);
    expect(r.body.latest.sources.every((s) => s['domain'] === 'example.org')).toBe(true);
  });
});

describe('10. guardrails', () => {
  it('are stored on prompt runs and shown on sections, research runs, title sets and blueprint versions', async () => {
    // house-style:off (the saved text uses a banned phrase and an invented review on purpose)
    const suffix = 'Readers call it a five-star guide, and at the end of the day it helps.';
    // house-style:on
    t = await testApp({ ai: new HookAi({ guardrails: { writing: NEEDS, research: NEEDS, titles: NEEDS, blueprint: NEEDS }, writingSuffix: suffix }) });
    const id = await writtenBook(t, 1);
    await t.call('POST', `/api/v1/books/${id}/research`, {});
    await t.call('POST', `/api/v1/books/${id}/title-sets`, {});
    await t.services.runner.runUntilIdle();
    const stored = await t.services.db.selectFrom('promptRuns').select(['stage', 'guardrails']).where('stage', '=', 'writing').executeTakeFirstOrThrow();
    expect(JSON.parse(stored.guardrails ?? 'null')).toMatchObject({ passed: false, styleRewrite: { applied: true } });

    const tree = await t.call<{ body: (Obj & { children: Obj[] })[]; front: Obj[] }>('GET', `/api/v1/books/${id}/sections`);
    const chapter = tree.body.body.find((x) => x['kind'] === 'chapter')!;
    // A section's report is worked out from its saved text: blocking hits and banned phrases both show.
    expect(chapter['guardrails']).toMatchObject({
      passed: false,
      blocking: [{ rule: 'review-words', match: 'five-star' }],
      needsAttention: [{ match: 'at the end of the day' }],
    });
    expect((chapter['guardrails'] as { rules: { rule: string; list: string }[] }).rules).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ rule: 'banned-phrase', list: 'needsAttention' }),
        expect.objectContaining({ rule: 'review-words', list: 'blocking' }),
      ]),
    );
    expect(tree.body.front.find((x) => x['kind'] === 'title_page')?.['guardrails']).toBeNull();
    const one = await t.call<{ section: Obj }>('GET', `/api/v1/sections/${chapter['id'] as string}`);
    expect(one.body.section['guardrails']).toEqual(chapter['guardrails']);

    // An owner edit that removes both: the stored report follows the saved text, so nothing stale stays.
    const current = await t.call<{ current: { bodyMd: string; id: string } }>('GET', `/api/v1/sections/${chapter['id'] as string}`);
    const cleaned = current.body.current.bodyMd.replace(suffix, 'It helps.');
    expect((await t.call('POST', `/api/v1/sections/${chapter['id'] as string}/versions`, { bodyMd: cleaned })).status).toBe(201);
    const after = await t.call<{ section: Obj }>('GET', `/api/v1/sections/${chapter['id'] as string}`);
    expect(after.body.section['guardrails']).toMatchObject({ passed: true, blocking: [], needsAttention: [] });

    const research = await t.call<{ latest: Obj }>('GET', `/api/v1/books/${id}/research`);
    expect(research.body.latest['guardrails']).toMatchObject({ needsAttention: [{ rule: 'banned-phrase' }] });
    const sets = await t.call<{ items: Obj[] }>('GET', `/api/v1/books/${id}/title-sets`);
    expect(sets.body.items[0]!['guardrails']).toMatchObject({ passed: false, blocking: [] });
    const bp = await t.call<{ items: Obj[] }>('GET', `/api/v1/books/${id}/blueprint/versions`);
    expect(bp.body.items[0]!['guardrails']).toMatchObject({ passed: false });
  });

  it('merge the reports of a stage that ran several tasks', () => {
    const r = (passed: boolean, attention: string[]): VolumeAiStageResult =>
      ({
        guardrails: {
          passed,
          blocking: [],
          needsAttention: attention.map((m) => ({ rule: 'banned-phrase', severity: 'error', message: 'x', match: m, index: 0, path: '' })),
          claims: [],
          autofix: [],
          warnings: [],
          rules: attention.length ? [{ rule: 'banned-phrase', list: 'needsAttention', count: attention.length, message: 'x', matches: attention }] : [],
        },
      }) as unknown as VolumeAiStageResult;
    expect(mergeGuardrails([])).toBeNull();
    const m = mergeGuardrails([r(true, []), r(false, ['a', 'b'])]);
    expect(m).toMatchObject({ passed: false, styleRewrite: null });
    expect(m?.needsAttention.map((h) => h.match)).toEqual(['a', 'b']);
    expect(m?.rules).toHaveLength(1);
  });

  it('reads RESOLVE_SOURCE_REDIRECTS, blank counting as unset', () => {
    const cfg = (v: string | undefined) => loadConfig({ dotenv: false, env: v === undefined ? {} : { RESOLVE_SOURCE_REDIRECTS: v } }).resolveSourceRedirects;
    expect(cfg(undefined)).toBeUndefined();
    expect(cfg('  ')).toBeUndefined();
    expect(cfg('FALSE')).toBe(false);
    expect(cfg('true')).toBe(true);
    expect(() => cfg('maybe')).toThrow(ConfigError);
  });
});

describe('11. export job', () => {
  /** The mock exporter, recording the EPUB cover and blocking the final preflight on request. */
  class GateExport extends MockExportAdapter {
    epubCover: Uint8Array | undefined;
    constructor(private readonly block: boolean) {
      super();
    }
    override async buildEpub(book: ExportBook, opts: { coverJpeg?: Uint8Array } = {}): Promise<ExportFile> {
      this.epubCover = opts.coverJpeg;
      return super.buildEpub(book, opts);
    }
    override async finalPreflight(book: ExportBook): Promise<PreflightReport> {
      const r = await super.finalPreflight(book);
      if (!this.block) return r;
      return {
        ...r,
        ok: false,
        blocks: 1,
        items: [
          ...r.items,
          { id: 'interior.pages', area: 'interior', severity: 'block', message: 'Page count within trim limits: 12 pages (allowed 24 to 828).' },
        ],
      };
    }
  }

  it('passes the eBook cover JPEG to the EPUB build', async () => {
    const exporter = new GateExport(false);
    t = await testApp({ exporter });
    const id = await writtenBook(t, 1);
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 0xff, 0xd9]);
    const asset = await t.services.blobs.put(t.owner, { kind: 'cover_ebook', filename: 'cover.jpg', mime: 'image/jpeg', projectId: id }, jpeg);
    await t.services.repos.production.upsertCover(t.owner, id, { ebookAssetId: asset.id });
    await t.call('POST', `/api/v1/books/${id}/exports`, { kinds: ['epub'] });
    await t.services.runner.runUntilIdle();
    expect(Array.from(exporter.epubCover ?? [])).toEqual(Array.from(jpeg));
  });

  it('fails the pack with a plain reason when the final preflight blocks, keeping the built files', async () => {
    t = await testApp({ exporter: new GateExport(true) });
    const id = await writtenBook(t, 1);
    await buildCovers(t, id);
    const job = await t.call<{ jobId: string }>('POST', `/api/v1/books/${id}/exports`, { kinds: ['pdf_print', 'txt'] });
    await t.services.runner.runUntilIdle();
    const done = await t.call<Obj>('GET', `/api/v1/jobs/${job.body.jobId}`);
    expect(done.body).toMatchObject({ status: 'failed', errorCode: 'preflight_blocked' });
    expect(done.body['error']).toBe(
      "The upload pack was not built. The interior page count is outside KDP's limits for this trim: 12 pages (allowed 24 to 828). The other files are built and ready to download.",
    );
    const exps = await t.call<{ items: { kind: string; status: string; error: string | null; assetId: string | null }[] }>(
      'GET',
      `/api/v1/books/${id}/exports`,
    );
    expect(
      exps.body.items
        .filter((e) => e.status === 'done')
        .map((e) => e.kind)
        .sort(),
    ).toEqual(['pdf_print', 'txt']);
    expect(exps.body.items.find((e) => e.kind === 'pack')).toMatchObject({ status: 'failed', assetId: null });
    const pdf = exps.body.items.find((e) => e.kind === 'pdf_print')!;
    expect(pdf.assetId).toEqual(anyString);
  });
});

describe('12. backups', () => {
  it('makes a SQLite backup under DATA_DIR/backups and lists it', async () => {
    const dataDir = tempDir();
    t = await testApp({ config: testConfig({ DATA_DIR: dataDir }) });
    await book(t);
    const made = await t.call<{ name: string; bytes: number; createdAt: number }>('POST', '/api/v1/backups');
    expect(made.status).toBe(201);
    expect(made.body.name).toMatch(/^volume-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z\.sqlite$/);
    expect(made.body.bytes).toBeGreaterThan(0);
    expect(readdirSync(join(dataDir, 'backups'))).toEqual([made.body.name]);
    const list = await t.call<{ items: { name: string }[]; status: Obj }>('GET', '/api/v1/backups');
    expect(list.body.items.map((i) => i.name)).toEqual([made.body.name]);
    expect(list.body.status).toMatchObject({ count: 1, lastAt: made.body.createdAt, locationKind: 'local_folder' });
    // The backup is a real database with the book in it.
    const { openSqlite } = await import('../src/db/connect.js');
    const copy = openSqlite(join(dataDir, 'backups', made.body.name));
    expect((await sql<{ integrityCheck: string }>`PRAGMA integrity_check`.execute(copy.db)).rows).toEqual([{ integrityCheck: 'ok' }]);
    expect((await copy.db.selectFrom('projects').select('title').execute()).map((r) => r.title)).toEqual(['Calm Mornings']);
    await copy.close();
  });

  it('keeps the newest 14 and knows when the nightly one is due', async () => {
    t = await testApp();
    const svc = new BackupService(t.services.db, 'sqlite', tempDir());
    for (let d = 1; d <= 16; d += 1) await svc.create(new Date(Date.UTC(2026, 8, d, 3)));
    const list = await svc.list();
    expect(list).toHaveLength(14);
    expect(new Date(list[0]!.createdAt).getUTCDate()).toBe(16);
    expect(new Date(list[13]!.createdAt).getUTCDate()).toBe(3);
    const lastLocal = new Date(list[0]!.createdAt);
    const sameDayLate = new Date(lastLocal.getFullYear(), lastLocal.getMonth(), lastLocal.getDate(), 23, 0);
    expect(await svc.dueAt(sameDayLate, '02:00')).toBe(false);
    const nextDayEarly = new Date(lastLocal.getFullYear(), lastLocal.getMonth(), lastLocal.getDate() + 1, 1, 0);
    expect(await svc.dueAt(nextDayEarly, '02:00')).toBe(false);
    const nextDayLater = new Date(lastLocal.getFullYear(), lastLocal.getMonth(), lastLocal.getDate() + 1, 2, 30);
    expect(await svc.dueAt(nextDayLater, '02:00')).toBe(true);
  });

  it('says plainly that MySQL is backed up by cPanel (501)', async () => {
    t = await testApp();
    const svc = new BackupService(t.services.db, 'mysql', tempDir());
    const err = await svc.create().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).statusCode).toBe(501);
    expect((err as AppError).message).toMatch(/cPanel/);
    expect(await svc.list()).toEqual([]);
    expect(await svc.status(true)).toMatchObject({ locationKind: 'cpanel', supported: false, enabled: false });
  });

  it('refuses a DATA_DIR inside the repo but outside data/', () => {
    expect(() => testConfig({ DATA_DIR: 'apps' })).toThrow(ConfigError);
    expect(testConfig({ DATA_DIR: 'data/test-backups' }).dataDir).toMatch(/data[/\\]test-backups$/);
  });
});

describe('13 to 15. trims, owner-confirmed deletes, samples and memory', () => {
  it('accepts the 5.25x8 and 7x10 trims', async () => {
    t = await testApp();
    const id = await book(t);
    expect((await t.call<Obj>('PATCH', `/api/v1/books/${id}`, { trim: '7x10' })).body['trim']).toBe('7x10');
    expect((await t.call<Obj>('PATCH', `/api/v1/books/${id}`, { trim: '5.25x8' })).body['trim']).toBe('5.25x8');
    expect((await t.call('PATCH', `/api/v1/books/${id}`, { trim: '9x12' })).status).toBe(400);
  });

  it('deletes a book only when archived and confirmed by its exact title, with everything under it', async () => {
    t = await testApp();
    const pid = await profile(t);
    const id = await writtenBook(t, 1);
    await t.call('POST', `/api/v1/books/${id}/exports`, { kinds: ['txt'] });
    await t.services.runner.runUntilIdle();
    const notArchived = await t.call<{ error: { code: string; message: string } }>('DELETE', `/api/v1/books/${id}`, { confirm: 'Calm Mornings' });
    expect(notArchived.status).toBe(409);
    expect(notArchived.body.error.message).toMatch(/Archive/);
    await t.call('POST', `/api/v1/books/${id}/archive`, {});
    expect((await t.call('DELETE', `/api/v1/books/${id}`, { confirm: 'calm mornings' })).status).toBe(409);
    expect((await t.call('DELETE', `/api/v1/books/${id}`, {})).status).toBe(409);
    const spendBefore = (await t.call<{ budgets: { monthSpendUsd: number } }>('GET', '/api/v1/settings')).body.budgets.monthSpendUsd;
    expect((await t.call('DELETE', `/api/v1/books/${id}`, { confirm: 'Calm Mornings' })).status).toBe(204);
    expect((await t.call('GET', `/api/v1/books/${id}`)).status).toBe(404);
    const db = t.services.db;
    for (const table of ['sections', 'sectionVersions', 'exports', 'assets', 'jobs', 'jobEvents', 'blueprints'] as const) {
      const n = await db.selectFrom(table).select('projectId').where('projectId', '=', id).execute();
      expect(n, table).toEqual([]);
    }
    // Spend history stays for the month's total.
    expect((await t.call<{ budgets: { monthSpendUsd: number } }>('GET', '/api/v1/settings')).body.budgets.monthSpendUsd).toBe(spendBefore);
    void pid;
  });

  it('deletes a profile only when archived, confirmed and without books', async () => {
    t = await testApp();
    const pid = await profile(t, { penName: 'Spare Name' });
    const bid = await book(t, 'Kept', pid);
    await t.call('POST', `/api/v1/profiles/${pid}/samples`, { kind: 'writing_sample', text: 'One two three.' });
    await t.call('POST', `/api/v1/profiles/${pid}/archive`, {});
    const withBook = await t.call<{ error: { message: string } }>('DELETE', `/api/v1/profiles/${pid}`, { confirm: 'Spare Name' });
    expect(withBook.status).toBe(409);
    expect(withBook.body.error.message).toMatch(/books/);
    await t.call('POST', `/api/v1/books/${bid}/archive`, {});
    expect((await t.call('DELETE', `/api/v1/books/${bid}`, { confirm: 'Kept' })).status).toBe(204);
    expect((await t.call('DELETE', `/api/v1/profiles/${pid}`, { confirm: 'Wrong' })).status).toBe(409);
    expect((await t.call('DELETE', `/api/v1/profiles/${pid}`, { confirm: 'Spare Name' })).status).toBe(204);
    expect((await t.call('GET', `/api/v1/profiles/${pid}`)).status).toBe(404);
    expect(await t.services.db.selectFrom('profileSamples').select('id').where('profileId', '=', pid).execute()).toEqual([]);
  });

  it('edits a voice sample and deletes a memory item', async () => {
    t = await testApp();
    const pid = await profile(t);
    const s = await t.call<{ id: string }>('POST', `/api/v1/profiles/${pid}/samples`, { kind: 'writing_sample', text: 'One two.' });
    const edited = await t.call<Obj>('PATCH', `/api/v1/profiles/${pid}/samples/${s.body.id}`, { text: 'One two three four.', title: 'Short' });
    expect(edited.body).toMatchObject({ text: 'One two three four.', title: 'Short', wordCount: 4 });
    expect((await t.call('PATCH', `/api/v1/profiles/${pid}/samples/nope`, { title: 'x' })).status).toBe(404);
    const m = await t.call<{ id: string }>('POST', `/api/v1/profiles/${pid}/memory`, { kind: 'preference', content: 'Short sentences.' });
    expect((await t.call('DELETE', `/api/v1/profiles/${pid}/memory/${m.body.id}`)).status).toBe(204);
    expect((await t.call<{ items: unknown[] }>('GET', `/api/v1/profiles/${pid}/memory`)).body.items).toEqual([]);
    expect((await t.call('DELETE', `/api/v1/profiles/${pid}/memory/${m.body.id}`)).status).toBe(404);
  });
});
