// Field drift (owner, 21 October 2026): a book that is not a health book warns (never blocks) when its text mentions
// health institutions such as the NHS, GPs or hospitals. Mock AI only, no network.
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { fieldDriftAppliesTo } from '../src/config/book-structure.js';
import { FIELD_DRIFT_CHECKER, fieldDriftCheck } from '../src/jobs/book-data.js';
import { fixCodeChecks } from '../src/jobs/claim-fix.js';
import { testApp, type TestApp } from './helpers.js';

type Obj = Record<string, unknown>;
const CONFIG = join(fileURLToPath(new URL('../../../', import.meta.url)), 'config');
const TECH_TEXT = 'Never type your NHS number into a chat window. Check the NHS website, not a forum, and keep a hospital letter to yourself.';

let t: TestApp | null = null;
afterEach(async () => {
  await t?.close();
  t = null;
});

describe('field drift check', () => {
  it('applies to a tech how-to, not to health, fiction or unknown types', async () => {
    expect(await fieldDriftAppliesTo(CONFIG, 'ai-tech-howto')).toBe(true);
    expect(await fieldDriftAppliesTo(CONFIG, 'healthcare-professional')).toBe(false);
    expect(await fieldDriftAppliesTo(CONFIG, 'health-wellbeing')).toBe(false);
    expect(await fieldDriftAppliesTo(CONFIG, 'thriller')).toBe(false);
    expect(await fieldDriftAppliesTo(CONFIG, 'no-such-type')).toBe(false);
    expect(await fieldDriftAppliesTo(CONFIG, null)).toBe(false);
  });

  it('warns once for an ai-tech-howto section that mentions the NHS number', async () => {
    const check = fieldDriftCheck(TECH_TEXT, await fieldDriftAppliesTo(CONFIG, 'ai-tech-howto'));
    expect(check).toEqual({
      checker: FIELD_DRIFT_CHECKER,
      severity: 'warn',
      message: "This book is not a health book, but the text mentions NHS, hospital. Check these fit the pen name's field.",
      location: { matches: ['NHS', 'hospital'], counts: { NHS: 2, hospital: 1 } },
    });
  });

  it('stays silent for a healthcare-professional section and for a tech section without health terms', async () => {
    expect(fieldDriftCheck(TECH_TEXT, await fieldDriftAppliesTo(CONFIG, 'healthcare-professional'))).toBeNull();
    const plain = 'Never type your bank details into a chat window. Check the council website and be patient with the replies.';
    expect(fieldDriftCheck(plain, await fieldDriftAppliesTo(CONFIG, 'ai-tech-howto'))).toBeNull();
  });

  it('runs in the fix code checks only when asked', () => {
    expect(fixCodeChecks(TECH_TEXT, CONFIG, true).filter((c) => c.checker === FIELD_DRIFT_CHECKER)).toHaveLength(1);
    expect(fixCodeChecks(TECH_TEXT, CONFIG).filter((c) => c.checker === FIELD_DRIFT_CHECKER)).toHaveLength(0);
  });
});

async function bookWithChapter(app: TestApp, bookTypeId: string): Promise<{ id: string; chapterId: string }> {
  const p = await app.call<Obj>('POST', '/api/v1/profiles', { penName: 'Test Author', bioThirdPerson: 'Test Author writes plain books.' });
  const b = await app.call<Obj>('POST', '/api/v1/books', { profileId: p.body['id'], idea: 'First chats with AI', title: 'First Chats', bookTypeId });
  const id = b.body['id'] as string;
  await app.call('POST', `/api/v1/books/${id}/blueprints`, { chapterCount: 2 });
  await app.services.runner.runUntilIdle();
  expect((await app.call('POST', `/api/v1/books/${id}/blueprint/approve`, {})).status).toBe(200);
  const tree = await app.call<{ body: Obj[] }>('GET', `/api/v1/books/${id}/sections`);
  const ch1 = tree.body.body.find((x) => x['kind'] === 'chapter' && x['number'] === 1);
  return { id, chapterId: ch1?.['id'] as string };
}

describe('field drift in preflight', () => {
  it('lists a warning for the drifting section of a tech book, and none for a healthcare book', async () => {
    t = await testApp();
    const tech = await bookWithChapter(t, 'ai-tech-howto');
    expect((await t.call('POST', `/api/v1/sections/${tech.chapterId}/versions`, { bodyMd: TECH_TEXT })).status).toBe(201);
    const report = await t.call<{ items: { id: string; severity: string; message: string }[] }>('GET', `/api/v1/books/${tech.id}/preflight`);
    const drift = report.body.items.filter((i) => i.id.includes('.field-drift.'));
    expect(drift).toHaveLength(1);
    expect(drift[0]?.severity).toBe('warn');
    expect(drift[0]?.message).toContain('the text mentions NHS, hospital');

    const care = await bookWithChapter(t, 'healthcare-professional');
    expect((await t.call('POST', `/api/v1/sections/${care.chapterId}/versions`, { bodyMd: TECH_TEXT })).status).toBe(201);
    const careReport = await t.call<{ items: { id: string }[] }>('GET', `/api/v1/books/${care.id}/preflight`);
    expect(careReport.body.items.some((i) => i.id.includes('.field-drift.'))).toBe(false);
  });
});

describe('"I have checked this" on a preflight warning', () => {
  it('saves the tick on the book, keeps it across reads, and drops it when the wording changes or it is unticked', async () => {
    t = await testApp();
    const tech = await bookWithChapter(t, 'ai-tech-howto');
    expect((await t.call('POST', `/api/v1/sections/${tech.chapterId}/versions`, { bodyMd: TECH_TEXT })).status).toBe(201);
    const url = `/api/v1/books/${tech.id}/preflight`;
    type Item = { id: string; severity: string; acknowledged?: boolean };
    const drift = async (): Promise<Item | undefined> => (await t!.call<{ items: Item[] }>('GET', url)).body.items.find((i) => i.id.includes('.field-drift.'));
    const warning = await drift();
    expect(warning?.acknowledged).toBeUndefined();

    const ticked = await t.call<{ items: Item[] }>('PUT', `${url}/acknowledgements`, { itemId: warning?.id, on: true });
    expect(ticked.status).toBe(200);
    expect(ticked.body.items.find((i) => i.id === warning?.id)?.acknowledged).toBe(true);
    expect((await drift())?.acknowledged).toBe(true);

    // New wording is a new warning: the old tick no longer applies.
    expect((await t.call('POST', `/api/v1/sections/${tech.chapterId}/versions`, { bodyMd: `${TECH_TEXT} The GP will also send a letter.` })).status).toBe(201);
    expect((await drift())?.acknowledged).toBeUndefined();

    const again = await t.call<{ items: Item[] }>('PUT', `${url}/acknowledgements`, { itemId: warning?.id, on: true });
    expect(again.body.items.find((i) => i.id === warning?.id)?.acknowledged).toBe(true);
    const off = await t.call<{ items: Item[] }>('PUT', `${url}/acknowledgements`, { itemId: warning?.id, on: false });
    expect(off.body.items.find((i) => i.id === warning?.id)?.acknowledged).toBeUndefined();
    expect((await t.call('PUT', `${url}/acknowledgements`, { itemId: 'nope.1', on: true })).status).toBe(404);
  });
});

describe('ticking several warnings at once', () => {
  it('keeps every tick when two arrive together', async () => {
    t = await testApp();
    const tech = await bookWithChapter(t, 'ai-tech-howto');
    const tree = await t.call<{ body: Obj[] }>('GET', `/api/v1/books/${tech.id}/sections`);
    const chapters = tree.body.body.filter((x) => x['kind'] === 'chapter').map((x) => x['id'] as string);
    expect(chapters.length).toBeGreaterThanOrEqual(2);
    for (const id of chapters) expect((await t.call('POST', `/api/v1/sections/${id}/versions`, { bodyMd: TECH_TEXT })).status).toBe(201);
    const url = `/api/v1/books/${tech.id}/preflight`;
    type Item = { id: string; severity: string; acknowledged?: boolean };
    const warns = (await t.call<{ items: Item[] }>('GET', url)).body.items.filter((i) => i.id.includes('.field-drift.'));
    expect(warns.length).toBeGreaterThanOrEqual(2);
    const done = await Promise.all(warns.map((w) => t!.call('PUT', `${url}/acknowledgements`, { itemId: w.id, on: true })));
    expect(done.map((r) => r.status)).toEqual(warns.map(() => 200));
    const after = (await t.call<{ items: Item[] }>('GET', url)).body.items.filter((i) => i.id.includes('.field-drift.'));
    expect(after.every((i) => i.acknowledged === true)).toBe(true);
  });
});
