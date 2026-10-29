/// <reference types="node" />
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { colourPageRange, getRule, trimClassFor, trimPageRange, trimSizes } from '../src/index.ts';
import { findRepoRoot, loadKdpRules } from '../src/node/index.ts';

// Studio redesign stage 6: every KDP paperback trim, read from the official trim page on 29 October 2026.
// The 17 October file is never edited. Values are compared with the old file, not typed in.
const root = findRepoRoot();
const file = loadKdpRules(root, '2026-10-29');
const previous = loadKdpRules(root, '2026-10-17');

/** Rules this revision re-read or extended; every other rule must be identical to the 17 October file. */
const REREAD = [
  'paperback.trimSizes.list',
  'paperback.trimAndPages',
  'paperback.trimAndPages.colour',
  'paperback.colour.paper',
  'print.bleed',
  'paperback.interiorMargins',
  'hardcover.basics',
];
const NEW_IDS = ['paperback.trimSizes.custom', 'hardcover.trimAndPages'];

type Row = { widthIn: number; heightIn: number; [k: string]: unknown };
const key = (t: { widthIn: number; heightIn: number }) => `${t.widthIn}x${t.heightIn}`;
const rows = (id: string, field: string, rules = file): Row[] => (getRule(rules, id).values as Record<string, Row[]>)[field] ?? [];

describe('KDP rules 2026-10-29 (trim sizes)', () => {
  it('is the newest file and keeps every rule it did not re-read unchanged', () => {
    expect(loadKdpRules(root).version).toBe('2026-10-29');
    for (const r of previous.rules) if (!REREAD.includes(r.id)) expect(getRule(file, r.id)).toEqual(r);
    expect(file.rules.map((r) => r.id).sort()).toEqual([...previous.rules.map((r) => r.id), ...NEW_IDS].sort());
    expect(file.verifiedOn).toBe(previous.verifiedOn);
    expect(file.recheckDue).toBe(previous.recheckDue);
  });

  it('keeps the re-read values and adds trims without changing the earlier ones', () => {
    for (const id of ['print.bleed', 'paperback.interiorMargins', 'hardcover.basics']) expect(getRule(file, id).values).toEqual(getRule(previous, id).values);
    expect(getRule(file, 'paperback.colour.paper').value).toBe(getRule(previous, 'paperback.colour.paper').value);
    const list = trimSizes(file).value.map(key);
    for (const t of trimSizes(previous).value) expect(list).toContain(key(t));
    expect(list).toEqual(expect.arrayContaining(['8x10', '8.5x8.5', '8.25x8.25', '8.25x6']));
    expect(new Set(list).size).toBe(list.length);
    for (const [id, field] of [
      ['paperback.trimAndPages', 'blackInkByTrim'],
      ['paperback.trimAndPages.colour', 'standardColourByTrim'],
      ['paperback.trimAndPages.colour', 'premiumColourByTrim'],
    ] as const) {
      const now = new Map(rows(id, field).map((r) => [key(r), r]));
      for (const old of rows(id, field, previous)) expect(now.get(key(old))).toMatchObject(old);
    }
  });

  it('has a black-ink page range for every trim, and a colour range unless the page says not available', () => {
    const notAvailable = rows('paperback.trimAndPages.colour', 'standardColourNotAvailable').map(key);
    expect(notAvailable).toEqual(['8.27x11.69']);
    for (const t of trimSizes(file).value) {
      for (const paper of ['white', 'cream'] as const) {
        const r = trimPageRange(file, t, paper);
        expect(r.warnings, key(t)).toEqual([]);
        expect(r.value.min).toBeLessThan(r.value.max);
      }
      expect(colourPageRange(file, t, 'premium').warnings).toEqual([]);
      if (notAvailable.includes(key(t))) expect(() => colourPageRange(file, t, 'standard')).toThrow(/No standard colour page range/);
      else expect(colourPageRange(file, t, 'standard').value.min).toBeGreaterThan(0);
    }
    expect(rows('paperback.trimAndPages', 'blackInkByTrim').map(key)).toEqual(trimSizes(file).value.map(key));
    expect(rows('paperback.trimAndPages.colour', 'premiumColourByTrim').map(key)).toEqual(trimSizes(file).value.map(key));
  });

  it('classes the new trims with the large-trim threshold', () => {
    expect(trimClassFor(file, { widthIn: 5.06, heightIn: 7.81 })).toBe('regular');
    expect(trimClassFor(file, { widthIn: 8.25, heightIn: 6 })).toBe('large');
    expect(trimClassFor(file, { widthIn: 8, heightIn: 10 })).toBe('large');
  });

  it('gives every new or re-read rule an official KDP source, the read date and a fact entry', () => {
    const factsFile = String((file as { factsFile?: unknown }).factsFile);
    expect(existsSync(path.join(root, factsFile))).toBe(true);
    const facts = readFileSync(path.join(root, factsFile), 'utf8');
    for (const id of [...REREAD, ...NEW_IDS]) {
      const r = getRule(file, id);
      expect(r.source).toMatch(/^https:\/\/kdp\.amazon\.com\/en_US\/help\/topic\/[A-Z0-9]+$/);
      expect(r.verifiedOn).toBe('2026-10-29');
      expect(r.status).toBe('confirmed');
      expect(r.note).toBeTruthy();
    }
    for (const id of ['paperback.trimSizes.list', 'paperback.trimAndPages', 'paperback.trimAndPages.colour', 'paperback.colour.paper', ...NEW_IDS])
      expect(facts).toContain(`**${String(getRule(file, id).factId)}`);
  });
});
