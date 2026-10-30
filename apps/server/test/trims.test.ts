import { trimSizes } from '@volume/core';
import { loadKdpRules } from '@volume/core/node';
import { describe, expect, it } from 'vitest';
import { BookInputSchema, TRIMS } from '../src/repos/books.js';

// The API must accept every paperback trim in the newest rules file (rule paperback.trimSizes.list), so the
// New book wizard and the cover studio can offer the whole list.
describe('paperback trims the API accepts', () => {
  it('covers every trim in the newest KDP rules file', () => {
    const rules = loadKdpRules();
    const fromRules = trimSizes(rules).value.map((t) => `${t.widthIn}x${t.heightIn}`);
    expect([...TRIMS].sort()).toEqual([...fromRules].sort());
  });

  it('takes a new trim such as 8.25x8.25 for a new book and refuses one KDP does not list for paperbacks', () => {
    expect(BookInputSchema.safeParse({ profileId: 'p', trim: '8.25x8.25' }).success).toBe(true);
    // 8.25 x 11 in is a KDP hardcover trim, not a paperback one.
    expect(BookInputSchema.safeParse({ profileId: 'p', trim: '8.25x11' }).success).toBe(false);
  });
});
