// house-style:off (test data quotes claims on purpose)
import { afterEach, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import {
  amountWordsIn,
  claimStatusFor,
  locateSentence,
  paragraphAround,
  similarity,
  spliceSentence,
  vetOptions,
  type ClaimFixOption,
} from '../src/jobs/claim-fix.js';
import { claimsInScope } from '../src/jobs/handlers/writing.js';
import { CHECKS_MISSING_CHECKER, houseStyle, withOwnerPlaceholders, withPackCovers } from '../src/jobs/book-data.js';
import { AUTOSAVE_WINDOW_MS, sessionStartOf } from '../src/repos/manuscript.js';
import type { PreflightReport } from '../src/ports/export.js';
import { testApp, testConfig, type TestApp } from './helpers.js';

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

const style = houseStyle(testConfig().configDir);
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
      style,
    );
    expect(kept.map((o) => o.text)).toEqual([
      'Nurses slept 6.5 hours on average [[S1]].',
      'Many nurses sleep less than they need.',
      'Nurses can find sleep hard.',
    ]);
    // An attribution with no marker still needs a source.
    expect(kept[2]?.needsSource).toBe(true);
    expect(dropped).toBe(6);
    expect(vetOptions([opt('anything', 'remove')], sentence, [], style).kept).toEqual([
      { text: '', approach: 'remove', rationale: 'Why.', needsSource: false },
    ]);
  });

  it('drops options that add a guardrail pattern or an amount in words the sentence does not have', () => {
    const sentence = 'Night shifts are hard on sleep.';
    const { kept } = vetOptions(
      [
        opt('According to nurses, night shifts are hard on sleep.', 'attribute'),
        opt('Studies show night shifts are hard on sleep.', 'soften'),
        opt('One in five nurses sleeps badly after nights.', 'generalise'),
        opt('Half of night nurses find sleep hard.', 'generalise'),
        opt('This award-winning advice helps with sleep.', 'reframe'),
        opt('Night shifts can be hard on sleep.', 'soften'),
      ],
      sentence,
      [],
      style,
    );
    expect(kept.map((o) => o.text)).toEqual(['Night shifts can be hard on sleep.']);
    // A pattern or amount the sentence already has may stay.
    const half = vetOptions([opt('Perhaps half of night nurses find sleep hard.', 'soften')], 'Half of night nurses sleep badly.', [], style);
    expect(half.kept).toHaveLength(1);
  });

  it.each([
    ['Seventy per cent of nurses sleep badly.', 'seventy per cent'],
    ['Eighty percent of nurses sleep badly.', 'eighty per cent'],
    ['Twenty-five per cent of shifts run late.', 'twenty five per cent'],
    ['Ninety-nine percent of readers agree.', 'ninety nine per cent'],
    ['Sixty in every hundred nurses say so.', 'sixty in every hundred'],
    ['Nine in every ten nurses sleep badly.', 'nine in every ten'],
    ['One in five nurses sleeps badly.', 'one in five'],
    ['One in a million people have it.', 'one in a million'],
    ['Night nurses are three times more likely to sleep badly.', 'three times more'],
    ['They are ten times less likely to rest.', 'ten times less'],
    ['A quarter of nurses sleep badly.', 'a quarter of'],
    ['A third of nurses sleep badly.', 'a third of'],
    ['A fifth of nurses sleep badly.', 'a fifth of'],
    ['Two thirds of nurses sleep badly.', 'two thirds of'],
    ['Half of nurses sleep badly.', 'half of'],
    ['The majority of nurses sleep badly.', 'the majority of'],
    ['A minority of nurses sleep well.', 'a minority of'],
    ['Most of the nurses sleep badly.', 'most of'],
    ['Thousands of nurses sleep badly.', 'thousands of'],
    ['Sleep loss doubles the risk, twice over.', 'twice'],
  ])('finds the amount in words in "%s"', (text, amount) => {
    expect(amountWordsIn(text)).toContain(amount);
    // An option adding it to a sentence without it is dropped; the same amount already in the sentence may stay.
    expect(vetOptions([opt(text, 'soften')], 'Night shifts are hard on sleep.', [], style).kept).toEqual([]);
    expect(vetOptions([opt(`Perhaps ${text.charAt(0).toLowerCase()}${text.slice(1)}`, 'soften')], text, [], style).kept).toHaveLength(1);
  });

  it('finds the paragraph and the sentences either side', () => {
    const text = '# Title\n\nFirst idea here. The claim sits here. Then a follow-up.\n\nNext paragraph starts.';
    const at = text.indexOf('The claim');
    expect(paragraphAround(text, at, 'The claim sits here.')).toEqual({
      paragraph: 'First idea here. The claim sits here. Then a follow-up.',
      previousSentence: 'First idea here.',
      nextSentence: 'Then a follow-up.',
    });
    const last = text.indexOf('Then a');
    expect(paragraphAround(text, last, 'Then a follow-up.').nextSentence).toBe('Next paragraph starts.');
  });

  it('drops near-duplicate options and options that repeat the sentence before or after', () => {
    expect(similarity('Many nurses find sleep hard.', 'Many nurses find sleep hard!')).toBe(1);
    const { kept } = vetOptions(
      [
        opt('Many night nurses find sleep hard after a shift.', 'soften'),
        opt('Many night nurses find sleep hard after their shift.', 'generalise'),
        opt('The ward was quiet at three in the morning.', 'reframe'),
        opt('Sleep after a night shift takes practice.', 'reframe'),
        opt('Then the phone rang and nobody slept.', 'reframe'),
      ],
      'Most night nurses sleep badly for years.',
      [],
      style,
      { previousSentence: 'The ward was quiet at three in the morning.', nextSentence: 'Then the phone rang.' },
    );
    expect(kept.map((o) => o.text)).toEqual(['Many night nurses find sleep hard after a shift.', 'Sleep after a night shift takes practice.']);
  });

  it('leaves ordinary words alone', () => {
    expect(amountWordsIn('No one in an office sleeps at night. Most nurses rest when they can.')).toEqual([]);
  });

  it('maps a fix to the claim status', () => {
    expect(claimStatusFor('remove', '', 0)).toBe('removed');
    // An AI attribution is never verified: the owner has not checked the source.
    expect(claimStatusFor('attribute', 'Fact [[S1]].', 1)).toBe('softened');
    expect(claimStatusFor('attribute', 'Fact.', 1)).toBe('softened');
    expect(claimStatusFor('generalise', 'Fact [[S1]].', 1)).toBe('softened');
    expect(claimStatusFor('own', 'My words.', 1)).toBe('softened');
    expect(claimStatusFor('own', 'My words [[S1]].', 1)).toBe('verified');
    expect(claimStatusFor('own', 'My words [[S2]].', 1)).toBe('softened');
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
    const [job, twice] = await Promise.all([
      t.call<{ jobId: string }>('POST', `/api/v1/books/${bookId}/claims/${claim.id}/suggest`),
      t.call<{ jobId: string }>('POST', `/api/v1/books/${bookId}/claims/${claim.id}/suggest`),
    ]);
    // One fix job per claim at a time: the second click is a conflict, not a second charge.
    expect([job.status, twice.status].sort()).toEqual([202, 409]);
    const jobId = (job.status === 202 ? job : twice).body.jobId;
    await t.services.runner.runUntilIdle();
    const r = await t.call<{ version: Version }>('POST', `/api/v1/books/${bookId}/claims/${claim.id}/apply`, {
      text: 'My own softer sentence.',
      approach: 'soften',
      jobId,
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

describe('GET /books/:id/claims/overview', () => {
  it('lists the book’s claims with their section, counts and whether the sentence is still there', async () => {
    t = await testApp();
    const { bookId, chapterId } = await writtenBook(t);
    const before = await t.call<{
      counts: Record<string, number>;
      items: (ClaimView & { section: { id: string; title: string } | null; inCurrentText: boolean })[];
    }>('GET', `/api/v1/books/${bookId}/claims/overview`);
    expect(before.status).toBe(200);
    expect(before.body.counts['open']).toBe(before.body.items.length);
    expect(before.body.items.length).toBeGreaterThan(0);
    expect(before.body.items.every((c) => c.status === 'open' && c.section !== null && c.inCurrentText)).toBe(true);
    const claim = before.body.items.find((c) => c.sectionId === chapterId)!;
    await t.call('POST', `/api/v1/books/${bookId}/claims/${claim.id}/apply`, { text: '', approach: 'remove' });
    const after = await t.call<{ counts: Record<string, number>; items: (ClaimView & { inCurrentText: boolean })[] }>(
      'GET',
      `/api/v1/books/${bookId}/claims/overview?status=all`,
    );
    expect(after.body.counts['removed']).toBe(1);
    expect(after.body.items.find((c) => c.id === claim.id)).toMatchObject({ status: 'removed', inCurrentText: false });
    expect((await t.call('GET', `/api/v1/books/${bookId}/claims/overview?status=nope`)).status).toBe(400);
    expect((await t.call('GET', '/api/v1/books/01NOTABOOK0000000000000000/claims/overview')).status).toBe(404);
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
    const second = await t.call<Version & { coalesced: boolean; updatedAt: number }>('PUT', url, {
      bodyMd: '# One\n\nDraft two.',
      baseVersionId: first.body.id,
      baseRevision: (first.body as unknown as { updatedAt: number }).updatedAt,
    });
    expect(second.body).toMatchObject({ coalesced: true, id: first.body.id });
    expect(await count()).toBe(n0 + 1);
    expect((await current(t, chapterId)).bodyMd).toBe('# One\n\nDraft two.');

    // A second tab still on the first revision of that autosave is a conflict, not a silent overwrite.
    const otherTab = await t.call<{ error: { details: { currentVersionId: string; currentRevision: number } } }>('PUT', url, {
      bodyMd: '# One\n\nOther tab.',
      baseVersionId: first.body.id,
      baseRevision: (first.body as unknown as { updatedAt: number }).updatedAt,
    });
    expect(otherTab.status).toBe(409);
    expect(otherTab.body.error.details).toMatchObject({ currentVersionId: first.body.id, currentRevision: second.body.updatedAt });
    expect(second.body.updatedAt).toBeGreaterThan((first.body as unknown as { updatedAt: number }).updatedAt);

    // Two saves from the same user on the same revision at once: one lands, the other is a conflict.
    const rev = second.body.updatedAt;
    const [x, y] = await Promise.all([
      t.call('PUT', url, { bodyMd: '# One\n\nTab A.', baseVersionId: first.body.id, baseRevision: rev }),
      t.call('PUT', url, { bodyMd: '# One\n\nTab B.', baseVersionId: first.body.id, baseRevision: rev }),
    ]);
    expect([x.status, y.status].sort()).toEqual([200, 409]);

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
    const third = await t.call<Version & { coalesced: boolean; updatedAt: number }>('PUT', url, {
      bodyMd: '# One\n\nDraft three.',
      baseVersionId: saved.body.id,
    });
    expect(third.body.coalesced).toBe(false);

    // An autosave older than five minutes is not updated in place either.
    await sql`update section_versions set created_at = created_at - ${AUTOSAVE_WINDOW_MS + 1000} where id = ${third.body.id}`.execute(t.handle.db);
    const fourth = await t.call<Version & { coalesced: boolean }>('PUT', url, {
      bodyMd: '# One\n\nDraft four.',
      baseVersionId: third.body.id,
      baseRevision: third.body.updatedAt,
    });
    expect(fourth.body.coalesced).toBe(false);
    // Without a revision the autosave makes a new version instead of updating in place.
    const fifth = await t.call<Version & { coalesced: boolean }>('PUT', url, { bodyMd: '# One\n\nDraft five.', baseVersionId: fourth.body.id });
    expect(fifth.body.coalesced).toBe(false);
    expect(await count()).toBe(n0 + 5);

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
    const preview = await t.call<{ steps: string[]; estimate: { lowUsd: number; highUsd: number }; runningJobId: string | null }>('GET', url);
    expect(preview.body).toMatchObject({ steps: ['checks'], runningJobId: null });
    // Two clicks at once queue one rerun: the lock makes check and enqueue one step.
    const [a, b] = await Promise.all([
      t.call<{ jobId: string; steps: string[]; estimate: { lowUsd: number; highUsd: number } }>('POST', url, {}),
      t.call<{ jobId: string; steps: string[]; estimate: { lowUsd: number; highUsd: number } }>('POST', url, {}),
    ]);
    expect([a.status, b.status].sort()).toEqual([202, 409]);
    const queued = a.status === 202 ? a : b;
    expect(queued.body.estimate).toEqual(preview.body.estimate);
    expect((await t.call<{ runningJobId: string }>('GET', url)).body.runningJobId).toBe(queued.body.jobId);
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
  it('runs the claims check on request ({ checks: true }) for a section with no failed step, such as an imported book', async () => {
    t = await testApp();
    const { chapterId } = await writtenBook(t);
    const url = `/api/v1/sections/${chapterId}/recheck`;
    expect((await t.call('POST', url, {})).status).toBe(409);
    const r = await t.call<{ jobId: string; steps: string[] }>('POST', url, { checks: true });
    expect(r.status).toBe(202);
    expect(r.body.steps).toContain('checks');
    await t.services.runner.runUntilIdle();
    const job = await t.call<{ status: string; result: Obj }>('GET', `/api/v1/jobs/${r.body.jobId}`);
    expect(job.body.result['reran']).toContain('checks');
  });
});

describe('POST /books/:id/fix-house-style', () => {
  it('fixes dashes and US spellings in every section as a new owner version, and changes nothing the second time', async () => {
    t = await testApp();
    const { bookId, chapterId } = await writtenBook(t);
    const start = await current(t, chapterId);
    await t.call('PUT', `/api/v1/books/${bookId}/sections/${chapterId}/autosave`, {
      bodyMd: '# One\n\nThe color changed — slowly.\n\n- \n\n* * *\n\nEnd.',
      baseVersionId: start.id,
    });
    const r = await t.call<{ sections: number; dashes: number; spellings: number; emptyItems: number }>('POST', `/api/v1/books/${bookId}/fix-house-style`, {});
    expect(r.status).toBe(200);
    expect(r.body.sections).toBeGreaterThanOrEqual(1);
    expect(r.body.dashes).toBeGreaterThanOrEqual(1);
    expect(r.body.spellings).toBeGreaterThanOrEqual(1);
    const after = await current(t, chapterId);
    expect(after.source).toBe('owner:style-fix');
    expect(after.bodyMd).toContain('The colour changed, slowly.');
    expect(after.bodyMd).not.toMatch(/^- $/m);
    expect(after.bodyMd).toContain('* * *');
    expect(r.body).toMatchObject({ emptyItems: 1 });
    const again = await t.call<{ sections: number }>('POST', `/api/v1/books/${bookId}/fix-house-style`, {});
    expect(again.body.sections).toBe(0);
  });
});

describe('POST /books/:id/models/withdraw', () => {
  it('removes a withdrawn model from the book, its pen name and the workspace, and leaves other choices alone', async () => {
    t = await testApp();
    const p = await t.call<Obj>('POST', '/api/v1/profiles', { penName: 'Model Author', bioThirdPerson: 'Model Author writes.' });
    const profileId = p.body['id'] as string;
    const b = await t.call<Obj>('POST', '/api/v1/books', { profileId, idea: 'Models', title: 'Models', template: 'nonfiction' });
    const bookId = b.body['id'] as string;
    const gone = 'nvidia/gone-model:free';
    expect((await t.call('PATCH', `/api/v1/books/${bookId}`, { settings: { models: { cover_brief: gone, writing: 'anthropic/kept' } } })).status).toBe(200);
    expect((await t.call('PATCH', `/api/v1/profiles/${profileId}`, { models: { marketing: { model: gone } } })).status).toBe(200);
    expect((await t.call('PUT', '/api/v1/settings/models', { stages: { checks: { model: gone } } })).status).toBe(200);

    const r = await t.call<{ removed: { scope: string; stage: string }[] }>('POST', `/api/v1/books/${bookId}/models/withdraw`, { model: gone });
    expect(r.status).toBe(200);
    expect(r.body.removed).toEqual([
      { scope: 'book', stage: 'cover_brief' },
      { scope: 'profile', stage: 'marketing' },
      { scope: 'workspace', stage: 'checks' },
    ]);
    const book = await t.call<{ settings: { models: Obj } }>('GET', `/api/v1/books/${bookId}`);
    expect(book.body.settings.models).toEqual({ writing: 'anthropic/kept' });
    const profile = await t.call<{ models: Obj }>('GET', `/api/v1/profiles/${profileId}`);
    expect(profile.body.models).toEqual({});
  });
});

describe('claims are not filed twice', () => {
  it('skips a sentence the owner already settled, or one already open, when the checks run again', async () => {
    t = await testApp();
    const { bookId, chapterId } = await writtenBook(t);
    const claim = await openClaim(t, bookId, chapterId);
    expect((await t.call('POST', `/api/v1/claims/${claim.id}/verify`, { note: 'checked' })).status).toBe(200);
    const cur = await current(t, chapterId);
    const added = await t.services.repos.manuscript.addClaims(t.owner, bookId, chapterId, cur.id, [
      { sentence: `  ${claim.sentence.toUpperCase()} `, category: 'medical', checkNeeded: 'x', start: null, end: null },
      { sentence: 'A brand new claim about 90% of people.', category: 'statistic', checkNeeded: 'x', start: null, end: null },
      { sentence: 'A brand new claim about 90% of people.', category: 'statistic', checkNeeded: 'x', start: null, end: null },
    ]);
    expect(added.map((c) => c.sentence)).toEqual(['A brand new claim about 90% of people.']);
  });

  it('does not file the replacement text of a fixed claim again (apply and soften)', async () => {
    t = await testApp();
    const { bookId, chapterId } = await writtenBook(t);
    const claim = await openClaim(t, bookId, chapterId);
    const r = await t.call<{ claim: ClaimView & { location: Obj } }>('POST', `/api/v1/books/${bookId}/claims/${claim.id}/apply`, {
      text: 'Many readers find mornings calmer with a plan.',
      approach: 'own',
    });
    expect(r.status).toBe(200);
    expect(r.body.claim.location['replacement']).toBe('Many readers find mornings calmer with a plan.');
    const cur = await current(t, chapterId);
    const added = await t.services.repos.manuscript.addClaims(t.owner, bookId, chapterId, cur.id, [
      { sentence: 'Many readers find mornings calmer with a plan. ', category: 'other_fact', checkNeeded: 'x', start: null, end: null },
    ]);
    expect(added).toEqual([]);

    const fresh = await t.services.repos.manuscript.addClaims(t.owner, bookId, chapterId, cur.id, [
      { sentence: 'A second claim, 70% of people.', category: 'statistical', checkNeeded: 'x', start: null, end: null },
    ]);
    const second = fresh[0]!;
    const s = await t.call<{ claim: { location: Obj } }>('POST', `/api/v1/claims/${second.id}/soften`, { replacement: 'Some people find this helps.' });
    expect(s.status).toBe(200);
    expect(s.body.claim.location['replacement']).toBe('Some people find this helps.');
    const again = await t.services.repos.manuscript.addClaims(t.owner, bookId, chapterId, cur.id, [
      { sentence: 'Some people find this helps.', category: 'other_fact', checkNeeded: 'x', start: null, end: null },
    ]);
    expect(again).toEqual([]);
  });

  it('keeps model claims only where they belong: none for the review request or also by; harmful ones for the glossary and how to use', () => {
    const items = [{ category: 'other_fact' }, { category: 'medical' }, { category: 'legal' }, { category: 'statistical' }, { category: 'personal' }];
    for (const kind of ['review_request', 'also_by']) expect(claimsInScope(kind, items)).toEqual([]);
    const harmful = [{ category: 'medical' }, { category: 'legal' }, { category: 'statistical' }, { category: 'personal' }];
    expect(claimsInScope('glossary', items)).toEqual(harmful);
    expect(claimsInScope('how_to_use', items)).toEqual(harmful);
    expect(claimsInScope('chapter', items)).toEqual(items);
  });

  it('files no model claims for the review request section when the book is written', async () => {
    t = await testApp();
    const { bookId } = await writtenBook(t);
    const tree = await t.call<{ back: Obj[] }>('GET', `/api/v1/books/${bookId}/sections`);
    const review = tree.body.back.find((x) => x['kind'] === 'review_request');
    expect(review?.['currentVersionId'] ?? review?.['current']).toBeTruthy();
    const claims = await t.call<{ items: ClaimView[] }>('GET', `/api/v1/books/${bookId}/claims?sectionId=${review!['id'] as string}`);
    expect(claims.body.items).toEqual([]);
  });
});
