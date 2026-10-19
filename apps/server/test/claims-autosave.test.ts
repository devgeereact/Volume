// house-style:off (test data quotes claims on purpose)
import { afterEach, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { claimStatusFor, locateSentence, spliceSentence, vetOptions, type ClaimFixOption } from '../src/jobs/claim-fix.js';
import { CHECKS_MISSING_CHECKER, withOwnerPlaceholders, withPackCovers } from '../src/jobs/book-data.js';
import { AUTOSAVE_WINDOW_MS, sessionStartOf } from '../src/repos/manuscript.js';
import type { PreflightReport } from '../src/ports/export.js';
import { testApp, type TestApp } from './helpers.js';

// Claim fixes, autosave and the rerun of missing checks (owner request, 19 October 2026). Mock AI only; no network.

interface Obj {
  [k: string]: unknown;
}
interface ClaimView {
  id: string;
  sectionId: string;
  sentence: string;
  status: string;
}
interface Version {
  id: string;
  version: number;
  source: string;
  bodyMd: string;
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

async function current(app: TestApp, sectionId: string): Promise<Version> {
  return (await app.call<{ current: Version }>('GET', `/api/v1/sections/${sectionId}`)).body.current;
}

async function openClaim(app: TestApp, bookId: string, sectionId: string): Promise<ClaimView> {
  const r = await app.call<{ items: ClaimView[] }>('GET', `/api/v1/books/${bookId}/claims?status=open&sectionId=${sectionId}`);
  const claim = r.body.items[0];
  if (!claim) throw new Error('The mock filed no claim.');
  return claim;
}

const opt = (text: string, approach: ClaimFixOption['approach'], needsSource = false): ClaimFixOption => ({ text, approach, rationale: 'Why.', needsSource });

describe('claim fix helpers', () => {
  it('finds the sentence at its offset, else the first match, and removes it without a double space', () => {
    const text = 'One. Two claims here. Three.\n\nTwo claims here. Four.';
    expect(locateSentence(text, 'Two claims here.', 30)).toBe(30);
    expect(locateSentence(text, 'Two claims here.', 3)).toBe(5);
    expect(locateSentence(text, 'Gone.')).toBeNull();
    expect(spliceSentence(text, 5, 'Two claims here.', '')).toBe('One. Three.\n\nTwo claims here. Four.');
    expect(spliceSentence('Alone.\n\nNext.', 0, 'Alone.', '')).toBe('\n\nNext.');
    expect(spliceSentence(text, 5, 'Two claims here.', '  Softer claims. ')).toBe('One. Softer claims. Three.\n\nTwo claims here. Four.');
  });

  it('drops options that invent a figure, a link or a source and keeps at most three', () => {
    const sentence = 'Most nurses sleep 5 hours.';
    const sources = [{ title: 'Sleep survey 2024', excerpt: 'Nurses slept 6.5 hours on average.' }];
    const { kept, dropped } = vetOptions(
      [
        opt('Most nurses sleep 5 hours.', 'soften'),
        opt('About 72% of nurses sleep badly.', 'generalise'),
        opt('See https://example.org for more.', 'reframe'),
        opt('Nurses slept 6.5 hours on average [[S1]].', 'attribute'),
        opt('A survey found this [[S2]].', 'attribute'),
        opt('Many nurses sleep less than they need.', 'soften'),
        opt('Many nurses sleep less than they need.', 'soften'),
        opt('Nurses can find sleep hard.', 'attribute'),
        opt('ignored text', 'remove'),
      ],
      sentence,
      sources,
    );
    expect(kept.map((o) => o.text)).toEqual([
      'Nurses slept 6.5 hours on average [[S1]].',
      'Many nurses sleep less than they need.',
      'Nurses can find sleep hard.',
    ]);
    // An attribution with no marker still needs a source.
    expect(kept[2]?.needsSource).toBe(true);
    expect(dropped).toBe(6);
    expect(vetOptions([opt('anything', 'remove')], sentence, []).kept).toEqual([{ text: '', approach: 'remove', rationale: 'Why.', needsSource: false }]);
  });

  it('maps a fix to the claim status', () => {
    expect(claimStatusFor('remove', '', 0)).toBe('removed');
    expect(claimStatusFor('attribute', 'Fact [[S1]].', 1)).toBe('verified');
    expect(claimStatusFor('attribute', 'Fact.', 1)).toBe('softened');
    expect(claimStatusFor('generalise', 'Fact [[S1]].', 1)).toBe('softened');
  });

  it('finds the version before the run of one user’s autosaves', () => {
    const v = (id: string, source: string, parentVersionId: string | null, createdBy: string | null = null) => ({ id, source, parentVersionId, createdBy });
    const list = [v('a', 'ai:writing', null), v('b', 'owner:autosave', 'a', 'u1'), v('c', 'owner:autosave', 'b', 'u1'), v('d', 'human', 'c', 'u1')];
    expect(sessionStartOf(list, 'c')).toBe('a');
    expect(sessionStartOf(list, 'd')).toBe('a');
    expect(sessionStartOf(list, 'a')).toBeNull();
    expect(sessionStartOf([...list, v('e', 'owner:autosave', 'd', 'u2')], 'e')).toBe('d');
    expect(sessionStartOf(list, null)).toBeNull();
  });
});

describe('preflight fixes', () => {
  const empty = (): PreflightReport => ({ ok: true, blocks: 0, warnings: 0, items: [], rulesVersion: null, mock: true });

  it('points the pack cover block and warning at the own-cover panel', () => {
    const blocked = withPackCovers(empty(), { ebook: false, wrap: false });
    expect(blocked.items[0]).toMatchObject({ id: 'cover.files', severity: 'block', fix: { route: 'cover', anchor: 'own-cover' } });
    expect(blocked.items[0]?.message).toContain('Build the covers in the cover studio or upload your own cover.');
    const warned = empty();
    warned.items.push({ id: 'cover.files', area: 'cover', severity: 'warn', message: 'KDP pack covers: No paperback wrap yet; the pack goes without it.' });
    withPackCovers(warned, { ebook: true, wrap: false });
    expect(warned.items[0]?.message).toBe(
      'KDP pack covers: No paperback wrap yet; the pack goes without it. Build it in the cover studio or upload your own cover.',
    );
    expect(warned.items[0]?.fix).toEqual({ route: 'cover', label: 'Upload your own cover', anchor: 'own-cover' });
    // Run twice, the hint is not repeated.
    withPackCovers(warned, { ebook: true, wrap: false });
    expect(warned.items[0]?.message.match(/upload your own cover/g)).toHaveLength(1);
  });

  it('gives the checks-missing block a rerun-checks action with the section', async () => {
    t = await testApp();
    const { bookId, chapterId } = await writtenBook(t);
    const cur = await current(t, chapterId);
    await t.services.repos.manuscript.addCheckResults(t.owner, bookId, chapterId, cur.id, [
      { checker: CHECKS_MISSING_CHECKER, severity: 'block', message: 'Checks missing.' },
    ]);
    const report = await withOwnerPlaceholders(t.services.repos, t.owner, bookId, empty());
    expect(report.items.find((i) => i.id === `body.checks-missing.${chapterId}`)?.fix).toEqual({
      route: 'writing',
      label: 'Run it again',
      action: 'rerun-checks',
      sectionId: chapterId,
    });
  });
});

describe('POST /books/:id/claims/:claimId/suggest and /apply', () => {
  it('offers three vetted options with an estimate and saves the chosen one as a new version', async () => {
    t = await testApp();
    const { bookId, chapterId } = await writtenBook(t);
    const claim = await openClaim(t, bookId, chapterId);
    const before = await current(t, chapterId);

    const job = await t.call<{ jobId: string; estimate: { lowUsd: number; highUsd: number } }>('POST', `/api/v1/books/${bookId}/claims/${claim.id}/suggest`, {
      instruction: 'Keep it short',
    });
    expect(job.status).toBe(202);
    expect(job.body.estimate.highUsd).toBeGreaterThanOrEqual(job.body.estimate.lowUsd);
    await t.services.runner.runUntilIdle();
    const done = await t.call<{ status: string; kind: string; result: { options: ClaimFixOption[]; baseVersionId: string; sentence: string } }>(
      'GET',
      `/api/v1/jobs/${job.body.jobId}`,
    );
    expect(done.body).toMatchObject({ status: 'succeeded', kind: 'claim_fix' });
    expect(done.body.result).toMatchObject({ baseVersionId: before.id, sentence: claim.sentence });
    expect(done.body.result.options.map((o) => o.approach)).toEqual(['soften', 'reframe', 'remove']);
    expect((await current(t, chapterId)).id).toBe(before.id);

    const chosen = done.body.result.options[0]!;
    const applied = await t.call<{ claim: ClaimView; version: Version; checks: { blocks: number; warnings: number } }>(
      'POST',
      `/api/v1/books/${bookId}/claims/${claim.id}/apply`,
      { text: chosen.text, approach: chosen.approach, jobId: job.body.jobId, baseVersionId: before.id },
    );
    expect(applied.status).toBe(200);
    expect(applied.body.claim.status).toBe('softened');
    expect(applied.body.version.source).toBe('ai:claim-fix');
    expect(applied.body.version.bodyMd).toContain(chosen.text);
    expect(applied.body.version.bodyMd).not.toContain(claim.sentence);
    expect(typeof applied.body.checks.blocks).toBe('number');
    expect(typeof applied.body.checks.warnings).toBe('number');

    // The sentence is gone now: applying again is a conflict with the current version id.
    const again = await t.call<{ error: { code: string; details: { currentVersionId: string } } }>('POST', `/api/v1/books/${bookId}/claims/${claim.id}/apply`, {
      text: 'Anything.',
      approach: 'soften',
    });
    expect(again.status).toBe(409);
    expect(again.body.error.details.currentVersionId).toBe(applied.body.version.id);
  });

  it('marks owner-edited text, removes cleanly, checks markers and scopes to the book', async () => {
    t = await testApp();
    const { bookId, chapterId } = await writtenBook(t);
    const claim = await openClaim(t, bookId, chapterId);

    expect((await t.call('POST', `/api/v1/books/${bookId}/claims/${claim.id}/apply`, { text: '', approach: 'soften' })).status).toBe(400);
    expect((await t.call('POST', `/api/v1/books/${bookId}/claims/${claim.id}/apply`, { text: 'Cited [[S1]].', approach: 'attribute' })).status).toBe(400);
    expect((await t.call('POST', `/api/v1/books/${bookId}/claims/${claim.id}/apply`, { text: 'x', approach: 'invent' })).status).toBe(400);
    const stale = await t.call('POST', `/api/v1/books/${bookId}/claims/${claim.id}/apply`, { text: 'x', approach: 'soften', baseVersionId: 'not-current' });
    expect(stale.status).toBe(409);

    expect((await t.call('POST', `/api/v1/books/01NOTABOOK0000000000000000/claims/${claim.id}/suggest`, {})).status).toBe(404);

    const removed = await t.call<{ claim: ClaimView; version: Version }>('POST', `/api/v1/books/${bookId}/claims/${claim.id}/apply`, {
      text: '',
      approach: 'remove',
    });
    expect(removed.status).toBe(200);
    expect(removed.body.claim.status).toBe('removed');
    expect(removed.body.version.source).toBe('owner:claim-fix');
    expect(removed.body.version.bodyMd).not.toContain(claim.sentence);
    expect(removed.body.version.bodyMd).not.toMatch(/ {2}/);

    // A sentence that is no longer in the text cannot get fixes either.
    expect((await t.call('POST', `/api/v1/books/${bookId}/claims/${claim.id}/suggest`, {})).status).toBe(409);
  });

  it('marks an edited option as the owner’s text', async () => {
    t = await testApp();
    const { bookId, chapterId } = await writtenBook(t);
    const claim = await openClaim(t, bookId, chapterId);
    const job = await t.call<{ jobId: string }>('POST', `/api/v1/books/${bookId}/claims/${claim.id}/suggest`);
    await t.services.runner.runUntilIdle();
    const r = await t.call<{ version: Version }>('POST', `/api/v1/books/${bookId}/claims/${claim.id}/apply`, {
      text: 'My own softer sentence.',
      approach: 'soften',
      jobId: job.body.jobId,
    });
    expect(r.status).toBe(200);
    expect(r.body.version.source).toBe('owner:claim-fix');
  });

  it('accepts the owner’s own rewrite', async () => {
    t = await testApp();
    const { bookId, chapterId } = await writtenBook(t);
    const claim = await openClaim(t, bookId, chapterId);
    const r = await t.call<{ claim: ClaimView; version: Version }>('POST', `/api/v1/books/${bookId}/claims/${claim.id}/apply`, {
      text: 'In my own words.',
      approach: 'own',
    });
    expect(r.status).toBe(200);
    expect(r.body.claim.status).toBe('softened');
    expect(r.body.version).toMatchObject({ source: 'owner:claim-fix' });
    expect(r.body.version.bodyMd).toContain('In my own words.');
  });
});

describe('PUT /books/:id/sections/:sectionId/autosave', () => {
  it('coalesces one user’s autosaves for five minutes, until an explicit save closes the window', async () => {
    t = await testApp();
    const { bookId, chapterId } = await writtenBook(t);
    const start = await current(t, chapterId);
    const url = `/api/v1/books/${bookId}/sections/${chapterId}/autosave`;
    const count = async () => (await t!.call<{ items: unknown[] }>('GET', `/api/v1/sections/${chapterId}/versions`)).body.items.length;
    const n0 = await count();

    const first = await t.call<Version & { coalesced: boolean }>('PUT', url, { bodyMd: '# One\n\nDraft one.', baseVersionId: start.id });
    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({ coalesced: false, source: 'owner:autosave' });
    const second = await t.call<Version & { coalesced: boolean }>('PUT', url, { bodyMd: '# One\n\nDraft two.', baseVersionId: first.body.id });
    expect(second.body).toMatchObject({ coalesced: true, id: first.body.id });
    expect(await count()).toBe(n0 + 1);
    expect((await current(t, chapterId)).bodyMd).toBe('# One\n\nDraft two.');

    // A stale base is a conflict carrying the current version id.
    const stale = await t.call<{ error: { code: string; details: { currentVersionId: string } } }>('PUT', url, { bodyMd: 'x', baseVersionId: start.id });
    expect(stale.status).toBe(409);
    expect(stale.body.error.details.currentVersionId).toBe(first.body.id);
    expect((await t.call('PUT', url, { bodyMd: 'x' })).status).toBe(400);

    // The version list names the version before this edit session.
    const list = await t.call<{ currentVersionId: string; previousVersionId: string }>('GET', `/api/v1/sections/${chapterId}/versions`);
    expect(list.body).toMatchObject({ currentVersionId: first.body.id, previousVersionId: start.id });

    // An explicit save closes the window: the next autosave is a new version.
    const saved = await t.call<Version>('POST', `/api/v1/sections/${chapterId}/versions`, { bodyMd: '# One\n\nSaved.', baseVersionId: first.body.id });
    expect(saved.status).toBe(201);
    const third = await t.call<Version & { coalesced: boolean }>('PUT', url, { bodyMd: '# One\n\nDraft three.', baseVersionId: saved.body.id });
    expect(third.body.coalesced).toBe(false);

    // An autosave older than five minutes is not updated in place either.
    await sql`update section_versions set created_at = created_at - ${AUTOSAVE_WINDOW_MS + 1000} where id = ${third.body.id}`.execute(t.handle.db);
    const fourth = await t.call<Version & { coalesced: boolean }>('PUT', url, { bodyMd: '# One\n\nDraft four.', baseVersionId: third.body.id });
    expect(fourth.body.coalesced).toBe(false);
    expect(await count()).toBe(n0 + 4);

    // Another book's path does not reach this section.
    expect((await t.call('PUT', `/api/v1/books/01NOTABOOK0000000000000000/sections/${chapterId}/autosave`, { bodyMd: 'x', baseVersionId: null })).status).toBe(
      404,
    );
  });
});

describe('POST /sections/:id/recheck (the preflight rerun-checks action)', () => {
  it('queues only the missing steps with an estimate, and refuses when nothing is missing or a job is running', async () => {
    t = await testApp();
    const { bookId, chapterId } = await writtenBook(t);
    const url = `/api/v1/sections/${chapterId}/recheck`;
    expect((await t.call('POST', url, {})).status).toBe(409);

    const cur = await current(t, chapterId);
    await t.services.repos.manuscript.addCheckResults(t.owner, bookId, chapterId, cur.id, [
      { checker: CHECKS_MISSING_CHECKER, severity: 'block', message: 'Checks missing.' },
    ]);
    const queued = await t.call<{ jobId: string; steps: string[]; estimate: { lowUsd: number; highUsd: number } }>('POST', url, {});
    expect(queued.status).toBe(202);
    expect(queued.body.steps).toEqual(['checks']);
    expect(queued.body.estimate.highUsd).toBeGreaterThanOrEqual(queued.body.estimate.lowUsd);
    const busy = await t.call<{ error: { details: { jobId: string } } }>('POST', url, {});
    expect(busy.status).toBe(409);
    expect(busy.body.error.details.jobId).toBe(queued.body.jobId);

    await t.services.runner.runUntilIdle();
    const job = await t.call<{ status: string; result: Obj }>('GET', `/api/v1/jobs/${queued.body.jobId}`);
    expect(job.body.status).toBe('succeeded');
    expect(job.body.result['reran']).toEqual(['checks']);
    expect((await t.call('POST', url, {})).status).toBe(409);
  });
});
