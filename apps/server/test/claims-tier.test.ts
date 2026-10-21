// house-style:off (test data quotes claims on purpose)
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { VolumeExportAdapter } from '../src/adapters/volume-export.js';
import { buildExportBook } from '../src/jobs/book-data.js';
import { testApp, type TestApp } from './helpers.js';

// Claim tiers (21 October 2026): the checker's risk and harmIfWrong are kept on each claim, and only the claims that
// could do harm need the owner's check. The rest stay in the claims report, listed for the record. Mock AI only.

type Obj = Record<string, unknown>;

let t: TestApp;
let bookId: string;
let chapterId: string;
const exporter = new VolumeExportAdapter({ root: fileURLToPath(new URL('../../../', import.meta.url)), now: () => new Date(Date.UTC(2026, 9, 21, 12)) });

beforeAll(async () => {
  t = await testApp();
  const p = await t.call<Obj>('POST', '/api/v1/profiles', { penName: 'Test Author', bioThirdPerson: 'Test Author writes plain books.' });
  const b = await t.call<Obj>('POST', '/api/v1/books', { profileId: p.body['id'], idea: 'Calm shifts', title: 'Calm Shifts', template: 'nonfiction' });
  bookId = b.body['id'] as string;
  await t.call('POST', `/api/v1/books/${bookId}/blueprints`, { chapterCount: 2 });
  await t.services.runner.runUntilIdle();
  await t.call('POST', `/api/v1/books/${bookId}/blueprint/approve`, {});
  await t.call('POST', `/api/v1/books/${bookId}/write`, {});
  await t.services.runner.runUntilIdle();
  const tree = await t.call<{ body: Obj[] }>('GET', `/api/v1/books/${bookId}/sections`);
  chapterId = tree.body.body.find((x) => x['kind'] === 'chapter')!['id'] as string;
  const section = await t.services.repos.manuscript.requireSection(t.owner, chapterId);
  await t.services.repos.manuscript.addClaims(t.owner, bookId, chapterId, section.currentVersionId!, [
    { sentence: 'A short walk on a break can lift your mood.', category: 'medical', checkNeeded: 'x', start: null, end: null, risk: 'low', harmIfWrong: false },
    { sentence: 'Most nurses keep a notebook.', category: 'other_fact', checkNeeded: 'x', start: null, end: null, risk: 'medium', harmIfWrong: false },
    { sentence: 'Double the dose if the patient is in pain.', category: 'medical', checkNeeded: 'x', start: null, end: null, risk: 'high', harmIfWrong: true },
    { sentence: 'Rest well before a night shift.', category: 'safety', checkNeeded: 'x', start: null, end: null, risk: 'low', harmIfWrong: true },
  ]);
});
afterAll(async () => {
  await exporter.close();
  await t.close();
});

describe('claim tiers', () => {
  it('keeps the risk and harmIfWrong in the claim location', async () => {
    const claims = await t.services.repos.manuscript.listClaims(t.owner, { projectId: bookId });
    const walk = claims.find((c) => c.sentence.startsWith('A short walk'))!;
    expect(walk.location).toMatchObject({ risk: 'low', harmIfWrong: false });
    expect(claims.find((c) => c.sentence.startsWith('Double'))!.location).toMatchObject({ risk: 'high', harmIfWrong: true });
  });

  it('counts both tiers in the claims overview and marks each item', async () => {
    const r = await t.call<{
      counts: Record<string, number>;
      tiers: { needsCheck: number; forRecord: number };
      items: { sentence: string; needsCheck: boolean }[];
    }>('GET', `/api/v1/books/${bookId}/claims/overview`);
    expect(r.status).toBe(200);
    expect(r.body.tiers.forRecord).toBe(2);
    // The mock's own claims carry no risk, so they need a check (backward compatible), as do the high and harmful ones.
    expect(r.body.tiers.needsCheck).toBe(r.body.counts['open']! - 2);
    const by = new Map(r.body.items.map((i) => [i.sentence, i.needsCheck]));
    expect(by.get('A short walk on a break can lift your mood.')).toBe(false);
    expect(by.get('Most nurses keep a notebook.')).toBe(false);
    expect(by.get('Double the dose if the patient is in pain.')).toBe(true);
    expect(by.get('Rest well before a night shift.')).toBe(true);
  });

  it('counts only the claims that need a check in preflight, and lists the rest for the record', async () => {
    const book = await buildExportBook(t.services.repos, t.owner, bookId, t.services.configDir, t.services.blobs);
    const open = (book.claims ?? []).filter((c) => c.status === 'open');
    const need = open.filter((c) => c.needsCheck).length;
    expect(open.length - need).toBe(2);
    const report = await exporter.preflight(book);
    const item = report.items.find((i) => i.id === 'claims.open');
    expect(item?.severity).toBe('warn');
    expect(item?.message).toContain(`${need} open claim(s) need your check; 2 more are listed for the record in the claims report.`);
  });
});

describe('Volume mode quality gate and claim tiers', () => {
  it('lets a book through when its only open claims are listed for the record', async () => {
    const { testApp } = await import('./helpers.js');
    const { preflightReport } = await import('../src/jobs/quality-gate.js');
    const app = await testApp();
    try {
      const p = await app.call<Record<string, unknown>>('POST', '/api/v1/profiles', { penName: 'Gate Author', bioThirdPerson: 'Gate Author writes.' });
      const b = await app.call<Record<string, unknown>>('POST', '/api/v1/books', {
        profileId: p.body['id'],
        idea: 'Gate',
        title: 'Gate',
        template: 'nonfiction',
      });
      const bookId = b.body['id'] as string;
      await app.call('POST', `/api/v1/books/${bookId}/blueprints`, { chapterCount: 1 });
      await app.services.runner.runUntilIdle();
      await app.call('POST', `/api/v1/books/${bookId}/blueprint/approve`, {});
      await app.call('POST', `/api/v1/books/${bookId}/write`, {});
      await app.services.runner.runUntilIdle();
      const m = app.services.repos.manuscript;
      for (const c of await m.listClaims(app.owner, { projectId: bookId, status: 'open' }))
        await m.resolveClaim(app.owner, c.id, 'verified', { ownerNote: 'test' });
      const sec = (await m.listSections(app.owner, bookId)).find((s) => s.kind === 'chapter')!;
      const cur = (await m.currentVersion(app.owner, sec.id))!;
      await m.addClaims(app.owner, bookId, sec.id, cur.id, [
        { sentence: 'Many people feel tired at night.', category: 'medical', checkNeeded: 'x', start: null, end: null, risk: 'low', harmIfWrong: false },
      ]);
      const report = await preflightReport(app.services, app.owner, bookId);
      expect(report.items.find((i) => i.id === 'claims.open')?.severity ?? 'pass').not.toBe('block');
    } finally {
      await app.close();
    }
  });
});
