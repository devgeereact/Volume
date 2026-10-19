import { afterEach, describe, expect, it } from 'vitest';
import { ulid } from 'ulid';
import { RetentionService } from '../src/jobs/retention.js';
import { newId } from '../src/lib/util.js';
import { str, testApp, type TestApp } from './helpers.js';

/** Retention (D-050): a deleted book takes its AI output and job events with it; old events are pruned daily. */

type Obj = Record<string, unknown>;
let t: TestApp | null = null;
afterEach(async () => {
  await t?.close();
  t = null;
});

async function bookWithRuns(app: TestApp, title: string): Promise<string> {
  const p = await app.call<Obj>('POST', '/api/v1/profiles', { penName: `Pen ${title}`, bioThirdPerson: 'Writes plain books.' });
  const b = await app.call<Obj>('POST', '/api/v1/books', { profileId: str(p.body['id']), idea: title, title, template: 'nonfiction' });
  const id = str(b.body['id']);
  await app.call('POST', `/api/v1/books/${id}/blueprints`, { chapterCount: 1 });
  await app.services.runner.runUntilIdle();
  return id;
}

describe('book delete retention', () => {
  it('clears prompt run output and error text and deletes job events, keeping the spend rows', async () => {
    t = await testApp();
    const id = await bookWithRuns(t, 'Gone Book');
    const kept = await bookWithRuns(t, 'Kept Book');
    const db = t.services.db;
    const runs = await db.selectFrom('promptRuns').select(['id', 'output', 'costUsd']).where('projectId', '=', id).execute();
    expect(runs.length).toBeGreaterThan(0);
    expect(runs.some((r) => r.output !== null)).toBe(true);
    // Guardrail hits quote the matched manuscript text, so they must go too.
    await db
      .updateTable('promptRuns')
      .set({ guardrails: JSON.stringify({ hits: [{ text: 'quoted manuscript words' }] }) })
      .where('projectId', '=', id)
      .execute();
    const jobIds = (await db.selectFrom('jobs').select('id').where('projectId', '=', id).execute()).map((j) => j.id);
    // An event stored with only a job id (no book id) must go as well.
    await db
      .insertInto('jobEvents')
      .values({
        id: newId(),
        workspaceId: t.owner.workspaceId,
        projectId: null,
        jobId: jobIds[0] ?? null,
        type: 'job.status',
        data: '{}',
        createdAt: Date.now(),
      })
      .execute();

    await t.call('POST', `/api/v1/books/${id}/archive`, {});
    expect((await t.call('DELETE', `/api/v1/books/${id}`, { confirm: 'Gone Book' })).status).toBe(204);

    const after = await db
      .selectFrom('promptRuns')
      .select(['id', 'output', 'error', 'guardrails', 'projectId', 'jobId', 'costUsd'])
      .where(
        'id',
        'in',
        runs.map((r) => r.id),
      )
      .execute();
    expect(after).toHaveLength(runs.length);
    for (const r of after) expect(r).toMatchObject({ output: null, error: null, guardrails: null, projectId: null, jobId: null });
    expect(after.map((r) => r.costUsd).sort()).toEqual(runs.map((r) => r.costUsd).sort());
    expect(await db.selectFrom('jobEvents').select('id').where('projectId', '=', id).execute()).toEqual([]);
    expect(await db.selectFrom('jobEvents').select('id').where('jobId', 'in', jobIds).execute()).toEqual([]);
    // The other book keeps its output and events.
    const other = await db.selectFrom('promptRuns').select('output').where('projectId', '=', kept).execute();
    expect(other.some((r) => r.output !== null)).toBe(true);
    expect((await db.selectFrom('jobEvents').select('id').where('projectId', '=', kept).execute()).length).toBeGreaterThan(0);
  });
});

describe('job event pruning', () => {
  it('deletes events older than 90 days in every workspace and keeps newer ones', async () => {
    t = await testApp();
    const db = t.services.db;
    const day = 24 * 60 * 60 * 1000;
    const at = Date.now();
    const other = newId();
    await db.insertInto('workspaces').values({ id: other, name: 'Other', slug: 'other', createdAt: at, updatedAt: at }).execute();
    // Event ids are ULIDs made at store time, so an old event has an old id.
    const row = (workspaceId: string, ageDays: number) => ({
      id: ulid(at - ageDays * day),
      workspaceId,
      projectId: null,
      jobId: null,
      type: 'job.status',
      data: '{}',
      createdAt: at - ageDays * day,
    });
    const old = [row(t.owner.workspaceId, 91), row(other, 200)];
    const fresh = [row(t.owner.workspaceId, 89), row(other, 1)];
    await db
      .insertInto('jobEvents')
      .values([...old, ...fresh])
      .execute();
    const retention = new RetentionService(t.services.bus);
    expect(await retention.runOnce(at)).toBe(2);
    const left = (await db.selectFrom('jobEvents').select('id').execute()).map((r) => r.id).sort();
    expect(left).toEqual(fresh.map((r) => r.id).sort());
    expect(await retention.runOnce(at)).toBe(0);
  });

  it('deletes in bounded batches by primary key', async () => {
    t = await testApp();
    const db = t.services.db;
    const at = Date.now();
    const old = Array.from({ length: 5 }, (_, i) => ({
      id: ulid(at - (100 + i) * 86_400_000),
      workspaceId: t!.owner.workspaceId,
      projectId: null,
      jobId: null,
      type: 'job.status',
      data: '{}',
      createdAt: at - (100 + i) * 86_400_000,
    }));
    await db.insertInto('jobEvents').values(old).execute();
    expect(await t.services.bus.prune(90, at, 2)).toBe(5);
    expect(await db.selectFrom('jobEvents').select('id').execute()).toEqual([]);
  });

  it('runs a pass when started and stops cleanly', async () => {
    t = await testApp();
    const db = t.services.db;
    const at = Date.now();
    await db
      .insertInto('jobEvents')
      .values({
        id: ulid(at - 400 * 86_400_000),
        workspaceId: t.owner.workspaceId,
        projectId: null,
        jobId: null,
        type: 'job.status',
        data: '{}',
        createdAt: at - 400 * 86_400_000,
      })
      .execute();
    const logs: string[] = [];
    const retention = new RetentionService(t.services.bus);
    retention.start({ everyMs: 60_000, log: (msg) => logs.push(msg) });
    await expect.poll(() => logs.length).toBe(1);
    retention.stop();
    expect(await db.selectFrom('jobEvents').select('id').execute()).toEqual([]);
  });
});
