import { describe, expect, it } from 'vitest';
import { mapModel } from '../src/index.ts';

// OpenRouter lists routers whose price depends on the model they pick (openrouter/auto) with "-1". A negative price is
// unknown, never a credit: a negative estimate would cancel spend in the guest cap check (audit, 1 November 2026).
describe('model prices from the model list', () => {
  it('treats a negative price as unknown', () => {
    const m = mapModel({
      id: 'openrouter/auto',
      name: 'Auto Router',
      pricing: { prompt: '-1', completion: '-1', request: '-1', web_search: '-1', image: '-1' },
    });
    expect(m?.pricing).toMatchObject({
      inputPerMillion: null,
      outputPerMillion: null,
      perRequest: null,
      webSearchPerRequest: null,
      imageInputPerMillion: null,
    });
  });

  it('keeps zero and positive prices', () => {
    const m = mapModel({ id: 'a/b', pricing: { prompt: '0.000003', completion: '0', request: '0' } });
    expect(m?.pricing).toMatchObject({ inputPerMillion: 3, outputPerMillion: 0, perRequest: 0 });
  });
});
