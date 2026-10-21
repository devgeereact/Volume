// Field drift (owner, 21 October 2026): each book stays in its own pen name's world. A book whose type is not a
// health type should not reach for health institutions and settings (the NHS, GPs, hospitals, wards, patients) as
// everyday examples. Deterministic and model-free; the app turns the result into one warning per section, never a block.

/** A book type as config/book-types.json gives it (only the fields this check reads). */
export interface FieldBookType {
  id: string;
  category?: string | null;
  /** "health" marks a health or care book type. */
  field?: string | null;
}

/** Book type categories where the story sets its own world (a thriller in a hospital is fine): no drift check. */
const STORY_CATEGORIES: ReadonlySet<string> = new Set(['fiction', 'childrens']);

/** True for a health or care book type: field "health", or "health" or "care" in its id or category. */
export function isHealthBookType(type: FieldBookType): boolean {
  if (type.field === 'health') return true;
  const words = `${type.id} ${type.category ?? ''}`.toLowerCase().split(/[^a-z]+/);
  return words.some((w) => w === 'health' || w === 'healthcare' || w === 'care' || w === 'medical' || w === 'nursing');
}

/** True when the field drift check runs for this book type: not a health type, and not fiction or children's. */
export function fieldDriftApplies(type: FieldBookType | null | undefined): boolean {
  if (!type) return false;
  if (type.category && STORY_CATEGORIES.has(type.category)) return false;
  return !isHealthBookType(type);
}

interface Term {
  label: string;
  pattern: RegExp;
}

const B = '(?<![A-Za-z0-9])';
const E = '(?![A-Za-z0-9])';

/**
 * Health-institution terms. Acronyms are case-sensitive whole words; words are whole words in any case, with their
 * plural. "patient" counts only after a word that makes it a person ("a patient", "the patient"), so "be patient"
 * passes; "ward off" passes.
 */
const HEALTH_TERMS: readonly Term[] = [
  { label: 'NHS 111', pattern: new RegExp(`${B}NHS 111${E}`, 'g') },
  { label: 'NHS', pattern: new RegExp(`${B}NHS${E}(?! 111${E})`, 'g') },
  { label: 'GP', pattern: new RegExp(`${B}GPs?${E}`, 'g') },
  { label: 'A&E', pattern: new RegExp(`${B}A&E${E}`, 'g') },
  { label: 'NMC', pattern: new RegExp(`${B}NMC${E}`, 'g') },
  { label: 'CQC', pattern: new RegExp(`${B}CQC${E}`, 'g') },
  { label: 'hospital', pattern: new RegExp(`${B}hospitals?${E}`, 'gi') },
  { label: 'ward', pattern: new RegExp(`${B}wards?${E}(?! off${E})`, 'gi') },
  { label: 'patient', pattern: new RegExp(`${B}(?:patients${E}|(?<=(?:a|the|your|each|every|one|another) )patient${E})`, 'gi') },
  { label: 'nurse', pattern: new RegExp(`${B}nurses?${E}`, 'gi') },
  { label: 'clinical', pattern: new RegExp(`${B}clinical${E}`, 'gi') },
];

/** One health term found in the text: its label, how many times, and where it first appears. */
export interface FieldDriftMatch {
  label: string;
  count: number;
  first: number;
}

/** The health-institution terms in the text, in order of first appearance. Empty when there are none. */
export function findHealthTerms(text: string): FieldDriftMatch[] {
  const out: FieldDriftMatch[] = [];
  for (const t of HEALTH_TERMS) {
    const hits = [...text.matchAll(t.pattern)];
    const first = hits[0];
    if (first) out.push({ label: t.label, count: hits.length, first: first.index });
  }
  return out.sort((a, b) => a.first - b.first);
}

/** The warning text for a section of a non-health book that mentions health terms. */
export function fieldDriftMessage(matches: readonly FieldDriftMatch[]): string {
  return `This book is not a health book, but the text mentions ${matches.map((m) => m.label).join(', ')}. Check these fit the pen name's field.`;
}
