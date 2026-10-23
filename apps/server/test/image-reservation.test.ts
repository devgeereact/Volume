import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MockAiAdapter } from '../src/adapters/mock-ai.js';
import { IMAGE_HIGH_ESTIMATE_USD, imageReservationUsd } from '../src/jobs/runner.js';
import type { PictureBookView } from '../src/jobs/picture-book.js';
import type { AiImageEstimate, AiPort } from '../src/ports/ai.js';
import { str, testApp, type TestApp } from './helpers.js';

/**
 * Picture budget reservations: every image job (cover, spread, character reference) and the one-spread regenerate
 * route reserve the priced estimate for one picture (as POST /picture-book/estimate shows it), with $0.20 only as a
 * floor. A listed price above the floor (about $0.24 at 4K) must stop spend before it passes the budget. Mock AI only.
 */

type Obj = Record<string, unknown>;
const DEAR_IMAGE_USD = 0.24;

/** The mock AI with a listed picture price above the old flat reservation. */
class DearImages extends MockAiAdapter {
  override estimateImage(opts: { model?: string } = {}): Promise<AiImageEstimate> {
    return Promise.resolve({ lowUsd: 0.12, highUsd: DEAR_IMAGE_USD, model: opts.model ?? 'mock/cover_image', priced: true });
  }
}

async function pictureBook(t: TestApp): Promise<string> {
  const p = await t.call<Obj>('POST', '/api/v1/profiles', { penName: 'Nell Ashby', bioThirdPerson: 'Nell Ashby writes gentle bedtime stories.' });
  const b = await t.call<Obj>('POST', '/api/v1/books', {
    profileId: str(p.body['id']),
    idea: 'A small rabbit learns to be brave on a walk at dusk',
    title: 'Pip and the Quiet Meadow',
    bookTypeId: 'picture-book',
  });
  expect(b.status).toBe(201);
  return str(b.body['id']);
}

function port(estimateImage?: AiPort['estimateImage']): AiPort {
  const inner = new MockAiAdapter();
  const ai: AiPort = {
    provider: 'mock',
    runStage: (stage, input, opts) => inner.runStage(stage, input, opts),
    generateImage: (prompt, opts) => inner.generateImage(prompt, opts),
    estimate: () => inner.estimate(),
  };
  if (estimateImage) ai.estimateImage = estimateImage;
  return ai;
}

describe('imageReservationUsd', () => {
  it('reserves the priced estimate when it is above the floor', async () => {
    expect(await imageReservationUsd(new DearImages(), 'test/model')).toBe(DEAR_IMAGE_USD);
  });

  it('never goes below the $0.20 floor', async () => {
    // The mock prices a picture at $0.001.
    expect(await imageReservationUsd(new MockAiAdapter(), null)).toBe(IMAGE_HIGH_ESTIMATE_USD);
  });

  it('uses the floor when no price is listed, the port cannot price, or pricing fails', async () => {
    const unpriced = port(() => Promise.resolve({ lowUsd: 0, highUsd: 0, model: 'x', priced: false }));
    expect(await imageReservationUsd(unpriced, null)).toBe(IMAGE_HIGH_ESTIMATE_USD);
    expect(await imageReservationUsd(port(), null)).toBe(IMAGE_HIGH_ESTIMATE_USD);
    expect(
      await imageReservationUsd(
        port(() => Promise.reject(new Error('no model list'))),
        null,
      ),
    ).toBe(IMAGE_HIGH_ESTIMATE_USD);
  });
});

describe('picture budget with a listed price above $0.20', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await testApp({ ai: new DearImages() });
  });
  afterAll(async () => t.close());

  it('runs a picture book past a small book budget, as no book cap applies (D-057)', async () => {
    const id = await pictureBook(t);
    expect((await t.call('PATCH', `/api/v1/books/${id}`, { budgetUsd: 0.22 })).status).toBe(200);
    const start = await t.call<{ jobId: string }>('POST', `/api/v1/books/${id}/picture-book`, {});
    expect(start.status).toBe(202);
    await t.services.runner.runUntilIdle();
    const jobs = await t.handle.db.selectFrom('jobs').select(['status', 'errorCode']).where('projectId', '=', id).execute();
    expect(jobs.some((j) => j.status === 'paused_budget')).toBe(false);
  });

  it('POST /spreads/:id/image accepts a new picture whatever the book budget says', async () => {
    const id = await pictureBook(t);
    expect((await t.call('POST', `/api/v1/books/${id}/picture-book`, {})).status).toBe(202);
    await t.services.runner.runUntilIdle();
    const v = await t.call<PictureBookView>('GET', `/api/v1/books/${id}/spreads`);
    const sectionId = str(v.body.spreads[0]?.sectionId);
    const book = await t.call<{ costToDateUsd: number }>('GET', `/api/v1/books/${id}`);
    await t.call('PATCH', `/api/v1/books/${id}`, { budgetUsd: book.body.costToDateUsd + 0.22 });
    expect((await t.call('POST', `/api/v1/spreads/${sectionId}/image`, {})).status).toBe(202);
    await t.services.runner.runUntilIdle();
  });
});

describe('cover concepts use the same priced reservation', () => {
  it('makes cover images past a small book budget, as no book cap applies (D-057)', async () => {
    const t = await testApp({ ai: new DearImages() });
    try {
      const p = await t.call<Obj>('POST', '/api/v1/profiles', { penName: 'Nell Ashby', bioThirdPerson: 'Nell Ashby writes calm books.' });
      const b = await t.call<Obj>('POST', '/api/v1/books', { profileId: str(p.body['id']), idea: 'Calm mornings', title: 'Calm Mornings' });
      const id = str(b.body['id']);
      expect((await t.call('PATCH', `/api/v1/books/${id}`, { budgetUsd: 0.22 })).status).toBe(200);
      expect((await t.call('POST', `/api/v1/books/${id}/cover/concepts`, {})).status).toBe(202);
      await t.services.runner.runUntilIdle();
      const jobs = await t.handle.db.selectFrom('jobs').select(['kind', 'status']).where('projectId', '=', id).execute();
      expect(jobs.find((j) => j.kind === 'cover_concepts')?.status).not.toBe('paused_budget');
    } finally {
      await t.close();
    }
  });
});
