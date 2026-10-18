import { readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { loadBookTemplate } from '@volume/core/node';

// D-049, AC12.1 and AC12.2: every template declares 5 TikTok scripts and 5 Instagram captions at
// packages.marketing[id].default.count, the path the server reads.
const names = readdirSync(new URL('../../../config/book-templates/', import.meta.url))
  .filter((f) => f.endsWith('.json'))
  .map((f) => f.replace(/\.json$/, ''));

const countFor = (template: unknown, id: string): unknown => {
  const packages = (template as { packages?: { marketing?: unknown } }).packages;
  const marketing = packages?.marketing;
  if (!Array.isArray(marketing)) return undefined;
  const item: unknown = marketing.find((m: unknown) => (m as { id?: unknown }).id === id);
  return (item as { default?: { count?: unknown } } | undefined)?.default?.count;
};

describe('marketing counts in every book template', () => {
  it('finds the templates', () => {
    expect(names).toEqual(expect.arrayContaining(['nonfiction', 'fiction', 'workbook', 'picture-book']));
  });

  it.each(names)('%s declares 5 TikTok scripts and 5 Instagram captions', (name) => {
    const t: unknown = loadBookTemplate(name);
    expect(countFor(t, 'tiktok-scripts')).toBe(5);
    expect(countFor(t, 'instagram-captions')).toBe(5);
  });
});
