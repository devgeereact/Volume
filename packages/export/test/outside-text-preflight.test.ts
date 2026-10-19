import { describe, expect, it } from 'vitest';
import { loadBookTemplate, loadHouseStyle, loadKdpRules } from '@volume/core/node';
import { blurbWordRange, runPreflight, type PreflightInput } from '../src/index.ts';
import { loadMiniBook } from './helpers.ts';

// Live acceptance 18 October 2026, defect 6: the workbook's blurb, listing and marketing carried 42 en dashes and
// preflight said nothing, because style.house reads only the manuscript.

const EN = String.fromCharCode(0x2013);
const EM = String.fromCharCode(0x2014);
const rules = loadKdpRules();
const houseStyle = loadHouseStyle();
const words = (n: number) => Array.from({ length: n }, (_, i) => `word${i}`).join(' ');

async function report(extra: Partial<PreflightInput>) {
  return runPreflight({
    book: loadMiniBook(),
    rules,
    houseStyle,
    trim: '6x9',
    paper: 'white',
    listing: { title: 'Mini' },
    now: new Date('2026-10-19T12:00:00Z'),
    ...extra,
  });
}
const item = (r: Awaited<ReturnType<typeof report>>, id: string) => r.items.find((i) => i.id === id);

describe('listing house style', () => {
  it('blocks dashes and US spellings in the subtitle and description', async () => {
    const r = await report({ listing: { title: 'Mini', subtitle: `Plan ${EN} launch`, description: '<p>Pick your favorite color.</p>' } });
    expect(item(r, 'listing.style')?.level).toBe('fail');
    expect(item(r, 'listing.style')?.detail).toContain(`in the subtitle`);
    expect(item(r, 'listing.style')?.detail).toContain('in the description');
  });

  it('passes a clean listing', async () => {
    expect(item(await report({ listing: { title: 'Mini', description: '<p>Plain words.</p>' } }), 'listing.style')?.level).toBe('pass');
  });
});

describe('back-cover blurb', () => {
  it('blocks house-style problems and warns outside the word range', async () => {
    const r = await report({ blurb: `Short ${EM} and sweet.` });
    expect(item(r, 'listing.blurb-style')?.level).toBe('fail');
    expect(item(r, 'listing.blurb-length')?.level).toBe('warn');
    expect(item(r, 'listing.blurb-length')?.detail).toContain('120 to 200');
    expect(item(await report({ blurb: words(150) }), 'listing.blurb-length')?.level).toBe('pass');
    expect(item(await report({ blurb: words(201) }), 'listing.blurb-length')?.level).toBe('warn');
    expect(item(await report({}), 'listing.blurb-length')).toBeUndefined();
  });

  it('takes the range from the template', () => {
    expect(blurbWordRange(loadBookTemplate('nonfiction'))).toEqual({ min: 120, max: 200 });
    expect(blurbWordRange(loadBookTemplate('fiction'))).toEqual({ min: 120, max: 200 });
    expect(blurbWordRange(loadBookTemplate('picture-book'))).toEqual({ max: 80 });
    expect(blurbWordRange(undefined)).toEqual({ min: 120, max: 200 });
  });
});

describe('marketing house style', () => {
  it('warns, and names the piece', async () => {
    const r = await report({ marketing: { tiktokScripts: 'Clean script.', launchEmail: `Day one ${EN} day thirty.` } });
    expect(item(r, 'marketing.style')?.level).toBe('warn');
    expect(item(r, 'marketing.style')?.detail).toContain('the launch email');
    expect(item(await report({ marketing: { instagramCaptions: 'Fine words.' } }), 'marketing.style')?.level).toBe('pass');
    expect(item(await report({}), 'marketing.style')).toBeUndefined();
  });
});
