// house-style:off (test data quotes banned phrases, ISBNs and claims on purpose)
import { describe, expect, it } from 'vitest';
import { checkText, formatPatternHits, loadHouseStyle, runGuardrails } from '../src/index.ts';
import { CONFIG_DIR } from './helpers.ts';

const hs = loadHouseStyle(CONFIG_DIR);
const sources = [{ id: 'S1', url: 'https://www.example.org/night-shift-sleep', title: 'Sleep', snippet: '' }];

function rules(text: string, ctx = {}) {
  return checkText(text, hs, ctx).map((h) => `${h.severity}:${h.rule}`);
}

describe('guardrails', () => {
  it('blocks invented ISBNs but allows the owner ISBN', () => {
    expect(rules('ISBN 978-1-2345-6789-7')).toContain('block:isbn');
    expect(rules('ISBN 978-1-2345-6789-7', { allowedIsbns: ['9781234567897'] })).not.toContain('block:isbn');
  });

  it('blocks links that are not research sources or profile links', () => {
    expect(rules('See https://www.madeup-site.com/page for more.', { sources })).toContain('block:url-not-from-sources');
    expect(rules('See https://www.example.org/night-shift-sleep for more.', { sources })).not.toContain('block:url-not-from-sources');
    expect(rules('Visit amirahale.example.com', { allowedUrls: ['https://amirahale.example.com'] })).not.toContain('block:url-not-from-sources');
  });

  it('sends statistics and research appeals to the claims report', () => {
    const r = rules('Studies show that 40% of nurses sleep badly. According to experts it gets better.');
    expect(r).toContain('claims:studies-show');
    expect(r).toContain('claims:percent-of');
    expect(r).toContain('claims:according-to');
  });

  it('flags dashes for auto-fix and blocks invented praise', () => {
    expect(rules('It was late — very late.')).toContain('autofix:em-dash');
    expect(rules('From the bestselling author.')).toContain('block:bestselling');
  });

  it('blocks source markers that point at no source', () => {
    expect(rules('Sleep matters [[S1]]. Nights are hard [[S7]].', { sources })).toEqual(['block:unknown-source-marker']);
  });

  it('blocks banned phrases with inflections', () => {
    const banned = { bannedPhrases: ['delve', 'ensure', 'in conclusion'] };
    expect(rules('We delved into it.', banned)).toContain('block:banned-phrase');
    expect(rules('Ensuring rest helps.', banned)).toContain('block:banned-phrase');
    expect(rules('In conclusion, rest.', banned)).toContain('block:banned-phrase');
    expect(rules('A calm night.', banned)).toEqual([]);
  });

  it('walks JSON answers, reports paths and skips copied quotes', () => {
    const report = runGuardrails({ blurb: { body: 'An award-winning guide.' }, claims: [{ quote: 'Studies show 40% of nurses.' }] }, hs, { bannedPhrases: [] });
    expect(report.passed).toBe(false);
    expect(report.blocking[0]?.path).toBe('blurb.body');
    expect(report.claims).toEqual([]);
  });

  it('formats code hits for the claims prompt', () => {
    expect(formatPatternHits('Calm.', hs)).toBe('None');
    expect(formatPatternHits('Research shows 12% of people.', hs)).toContain('studies-show');
  });
});
