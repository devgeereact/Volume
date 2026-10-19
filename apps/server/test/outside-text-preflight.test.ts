import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { VolumeExportAdapter } from '../src/adapters/volume-export.js';
import { buildExportBook } from '../src/jobs/book-data.js';
import { str, testApp, type TestApp } from './helpers.js';

// Live acceptance 18 October 2026, defect 6: the blurb, listing and marketing were never house-style checked.

type Obj = Record<string, unknown>;
const EN = String.fromCharCode(0x2013);

let t: TestApp;
let bookId: string;
const exporter = new VolumeExportAdapter({ root: fileURLToPath(new URL('../../../', import.meta.url)), now: () => new Date(Date.UTC(2026, 9, 19, 12)) });
beforeAll(async () => {
  t = await testApp();
  const p = await t.call<Obj>('POST', '/api/v1/profiles', { penName: 'Test Author', bioThirdPerson: 'Test Author writes plain books.' });
  const b = await t.call<Obj>('POST', '/api/v1/books', { profileId: p.body['id'], idea: 'Calm mornings', title: 'Calm Mornings' });
  bookId = str(b.body['id']);
});
afterAll(async () => {
  await exporter.close();
  await t.close();
});

describe('preflight on the blurb and marketing', () => {
  it('passes them to the package checks, with a fix route for marketing', async () => {
    const book = await buildExportBook(t.services.repos, t.owner, bookId, t.services.configDir, t.services.blobs);
    const report = await exporter.preflight({
      ...book,
      listing: { description: null, keywords: [], categories: [], backBlurb: `Calm ${EN} quiet mornings.` },
      marketing: { launchEmail: `Day one ${EN} day two.` },
    });
    const byId = (id: string) => report.items.find((i) => i.id === id);
    expect(byId('listing.blurb-style')?.severity).toBe('block');
    expect(byId('listing.blurb-length')?.severity).toBe('warn');
    expect(byId('marketing.style')).toMatchObject({ severity: 'warn', fix: { route: 'marketing', label: 'Open marketing' } });
  });
});
