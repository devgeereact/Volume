import { describe, expect, it } from 'vitest';
import { fieldDriftApplies, fieldDriftMessage, findHealthTerms, isHealthBookType } from '../src/index.ts';

const labels = (text: string): string[] => findHealthTerms(text).map((m) => m.label);

describe('field drift', () => {
  it('finds health-institution terms as whole words, acronyms case-sensitive, in order of first use', () => {
    expect(labels('Never type your NHS number. Ring NHS 111 or see your GP, then A&E if it is urgent.')).toEqual(['NHS', 'NHS 111', 'GP', 'A&E']);
    expect(labels('Hospitals, wards and nurses; the patient and two patients; clinical notes; the NMC and the CQC.')).toEqual([
      'hospital',
      'ward',
      'nurse',
      'patient',
      'clinical',
      'NMC',
      'CQC',
    ]);
  });

  it('skips near misses', () => {
    expect(labels('Your GPU and GPT tools; nhs in lower case; be patient; move towards it; ward off spam; a hospitable host.')).toEqual([]);
  });

  it('counts each term', () => {
    expect(findHealthTerms('NHS, NHS and NHS 111.').map((m) => [m.label, m.count])).toEqual([
      ['NHS', 2],
      ['NHS 111', 1],
    ]);
  });

  it('applies to non-fiction and workbooks that are not health types', () => {
    expect(fieldDriftApplies({ id: 'ai-tech-howto', category: 'nonfiction' })).toBe(true);
    expect(fieldDriftApplies({ id: 'workbook', category: 'workbooks-journals' })).toBe(true);
    expect(fieldDriftApplies({ id: 'health-wellbeing', category: 'nonfiction', field: 'health' })).toBe(false);
    expect(fieldDriftApplies({ id: 'healthcare-professional', category: 'nonfiction' })).toBe(false);
    expect(fieldDriftApplies({ id: 'thriller', category: 'fiction' })).toBe(false);
    expect(fieldDriftApplies({ id: 'picture-book', category: 'childrens' })).toBe(false);
    expect(fieldDriftApplies(null)).toBe(false);
    expect(isHealthBookType({ id: 'self-care', category: 'nonfiction' })).toBe(true);
  });

  it('writes one plain warning', () => {
    expect(fieldDriftMessage(findHealthTerms('the NHS website and a hospital letter'))).toBe(
      "This book is not a health book, but the text mentions NHS, hospital. Check these fit the pen name's field.",
    );
  });
});
