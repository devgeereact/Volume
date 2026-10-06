// Listing checks against the KDP rules object (FACTS 5.1 to 5.4, 10.14). Pure.
import type { KdpRules } from './kdp.ts';
import { listingLimits } from './kdp.ts';
import { isValidIsbn13 } from './text.ts';

export type CheckLevel = 'pass' | 'warn' | 'fail';
export interface CheckItem {
  id: string;
  label: string;
  level: CheckLevel;
  detail: string;
  factIds?: string[];
  ruleIds?: string[];
}

/** Title plus subtitle length, counted without a separator (rule listing.titleSubtitle.maxChars). */
export function titleSubtitleLength(title: string, subtitle = ''): number {
  return [...title].length + [...subtitle].length;
}

/** Tags used in an HTML description (lower case, unique). */
export function descriptionTags(html: string): string[] {
  const tags = new Set<string>();
  for (const m of html.matchAll(/<\/?\s*([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>/g)) if (m[1]) tags.add(m[1].toLowerCase());
  return [...tags];
}

export interface ListingInput {
  title: string;
  subtitle?: string;
  description?: string;
  keywords?: string[];
  categories?: string[];
  isbnPrint?: string;
  isbnEbook?: string;
}

export function checkListing(rules: KdpRules, l: ListingInput): CheckItem[] {
  const lim = listingLimits(rules);
  const items: CheckItem[] = [];
  const tlen = titleSubtitleLength(l.title, l.subtitle);
  items.push({
    id: 'listing.title-length',
    label: 'Title and subtitle length',
    level: tlen <= lim.titleSubtitleMaxChars ? 'pass' : 'fail',
    detail: `${tlen} characters (limit ${lim.titleSubtitleMaxChars}).`,
    factIds: ['5.4'],
    ruleIds: ['listing.titleSubtitle.maxChars'],
  });
  if (l.description === undefined) {
    items.push({ id: 'listing.description', label: 'Description', level: 'fail', detail: 'No description yet.', factIds: ['5.3'] });
  } else {
    const dlen = [...l.description].length;
    const bad = descriptionTags(l.description).filter((t) => !lim.descriptionAllowedTags.includes(t));
    items.push({
      id: 'listing.description-length',
      label: 'Description length (tags count)',
      level: dlen <= lim.descriptionMaxChars ? 'pass' : 'fail',
      detail: `${dlen} characters including HTML tags (limit ${lim.descriptionMaxChars}).`,
      factIds: ['5.3'],
      ruleIds: ['listing.description.maxChars'],
    });
    items.push({
      id: 'listing.description-tags',
      label: 'Description HTML tags',
      level: bad.length ? 'fail' : 'pass',
      detail: bad.length
        ? `Tags not allowed: ${bad.join(', ')}.`
        : 'Only allowed tags used (tag spellings are a partial rule: check KDP before relying on strong or em).',
      factIds: ['10.14'],
      ruleIds: ['listing.description.allowedFormatting'],
    });
  }
  const kw = (l.keywords ?? []).filter((k) => k.trim());
  items.push({
    id: 'listing.keywords',
    label: 'Keywords',
    level: kw.length === lim.maxKeywords ? 'pass' : 'fail',
    detail: `${kw.length} of ${lim.maxKeywords} keywords.`,
    factIds: ['5.1'],
    ruleIds: ['listing.keywords'],
  });
  const cats = (l.categories ?? []).filter((c) => c.trim());
  items.push({
    id: 'listing.categories',
    label: 'Categories',
    level: cats.length === lim.categories ? 'pass' : 'fail',
    detail: `${cats.length} of ${lim.categories} categories.`,
    factIds: ['5.2'],
    ruleIds: ['listing.categories'],
  });
  for (const [key, isbn] of [
    ['print', l.isbnPrint],
    ['ebook', l.isbnEbook],
  ] as const) {
    if (!isbn) continue;
    const ok = isValidIsbn13(isbn);
    items.push({
      id: `isbn.${key}`,
      label: `ISBN (${key})`,
      level: ok ? 'pass' : 'fail',
      detail: ok ? `${isbn} passes the ISBN-13 checksum.` : `${isbn} fails the ISBN-13 checksum.`,
      factIds: ['4.1', '4.2'],
    });
  }
  return items;
}
