/// <reference types="node" />
import { existsSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { getRule } from '../src/index.ts';
import { findRepoRoot, loadBookTemplate, loadKdpRules } from '../src/node/index.ts';

// P7-1: colour and picture-book rules in a new dated file (2026-10-17). The 6 October file is never edited.
// The 17 October file is pinned here; later files (2026-10-29 onwards) have their own tests.
const root = findRepoRoot();
const latest = loadKdpRules(root, '2026-10-17');
const newest = loadKdpRules(root);
const previous = loadKdpRules(root, '2026-10-06');
const NEW_IDS = [
  'paperback.printingCost.uk.standardColour',
  'paperback.printingCost.uk.premiumColour',
  'paperback.trimAndPages.colour',
  'paperback.colour.paper',
  'paperback.spine.widthPerPage.colour',
];

describe('KDP rules 2026-10-17 (colour)', () => {
  it('keeps every 6 October rule unchanged', () => {
    expect(latest.version).toBe('2026-10-17');
    for (const r of previous.rules) expect(getRule(latest, r.id)).toEqual(r);
    expect(latest.rules.map((r) => r.id).sort()).toEqual([...previous.rules.map((r) => r.id), ...NEW_IDS].sort());
  });

  it('points factsFile at a file that exists (conflict 6)', () => {
    const factsFile = (latest as { factsFile?: unknown }).factsFile;
    expect(typeof factsFile).toBe('string');
    expect(existsSync(path.join(root, String(factsFile)))).toBe(true);
  });

  it('gives every new rule an official KDP source, a read date and a status', () => {
    for (const id of NEW_IDS) {
      const r = getRule(latest, id);
      expect(r.source).toMatch(/^https:\/\/kdp\.amazon\.com\/en_US\/help\/topic\/[A-Z0-9]+$/);
      expect(r.verifiedOn).toBe('2026-10-17');
      expect(['confirmed', 'partial']).toContain(r.status);
      expect(r.note).toBeTruthy();
    }
    expect(getRule(latest, 'paperback.colour.paper').status).toBe('partial');
  });

  it('has colour page bands that agree with the colour trim table', () => {
    const premium = getRule(latest, 'paperback.printingCost.uk.premiumColour').values as {
      regularTrim: { pages: { min: number; max: number } }[];
      largeTrim: { pages: { min: number; max: number } }[];
    };
    const standard = getRule(latest, 'paperback.printingCost.uk.standardColour').values as typeof premium;
    const trims = getRule(latest, 'paperback.trimAndPages.colour').values as {
      standardColourByTrim: { widthIn: number; heightIn: number; minPages: number; maxPages: number }[];
      premiumColourByTrim: { widthIn: number; heightIn: number; minPages: number; maxPages: number }[];
    };
    const volumeTrims = (getRule(latest, 'paperback.trimSizes.list').values as { widthIn: number; heightIn: number }[]).map(
      (t) => `${t.widthIn}x${t.heightIn}`,
    );
    for (const list of [trims.standardColourByTrim, trims.premiumColourByTrim]) expect(list.map((t) => `${t.widthIn}x${t.heightIn}`)).toEqual(volumeTrims);
    for (const bands of [premium.regularTrim, premium.largeTrim]) {
      expect(bands[0]?.pages.min).toBe(Math.min(...trims.premiumColourByTrim.map((t) => t.minPages)));
      expect(bands[bands.length - 1]?.pages.max).toBe(Math.max(...trims.premiumColourByTrim.map((t) => t.maxPages)));
    }
    for (const bands of [standard.regularTrim, standard.largeTrim]) {
      expect(bands[0]?.pages.min).toBe(Math.min(...trims.standardColourByTrim.map((t) => t.minPages)));
      expect(bands[0]?.pages.max).toBe(Math.max(...trims.standardColourByTrim.map((t) => t.maxPages)));
    }
  });
});

describe('picture-book template (conflict 7)', () => {
  const tpl = loadBookTemplate('picture-book', root) as { print: Record<string, unknown> };

  it('cites rule ids that exist in the newest rules file', () => {
    const ids = tpl.print['kdpRuleIds'] as string[];
    expect(ids).toEqual(expect.arrayContaining(['print.bleed', 'paperback.trimAndPages.colour', 'paperback.printingCost.uk.premiumColour']));
    for (const id of ids) expect(() => getRule(newest, id)).not.toThrow();
  });

  it('carries no KDP page numbers or fact numbers in its print notes', () => {
    const notes = [tpl.print['pageCountNote'], tpl.print['spineText']].map(String).join(' ');
    expect(notes).not.toMatch(/\b(24|79|80) pages\b/);
    expect(notes).not.toMatch(/fact \d/);
  });
});
