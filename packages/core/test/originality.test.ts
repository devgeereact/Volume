import { describe, expect, it } from 'vitest';
import { findCopiedPassages, originalityMessage } from '../src/originality.ts';

const SAMPLE = {
  label: 'your voice sample',
  text: 'Most of us learn to cook by watching someone we love stand at the stove and make it look easy. Then we try it alone.',
};

describe('findCopiedPassages', () => {
  it('finds a sentence copied word for word, ignoring case, punctuation and line breaks', () => {
    const text = 'A plain opening.\n\nMost of us learn to cook by watching someone we LOVE\nstand at the stove, and make it look easy! The end.';
    const found = findCopiedPassages(text, [SAMPLE]);
    expect(found).toHaveLength(1);
    const p = found[0]!;
    expect(p.source).toBe('your voice sample');
    expect(p.text.startsWith('Most of us')).toBe(true);
    expect(p.text.endsWith('look easy')).toBe(true);
    expect(text.slice(p.start, p.end)).toBe(p.text);
    expect(p.words).toBe(20);
  });

  it('does not flag a short shared phrase or the same idea in other words', () => {
    const text = 'Many people learn to cook by watching someone they love at the stove. It looks easy until you try.';
    expect(findCopiedPassages(text, [SAMPLE])).toEqual([]);
  });

  it('leaves out a passage inside quotation marks, which is quoting, not copying', () => {
    const text = 'As the guide puts it, “Most of us learn to cook by watching someone we love stand at the stove and make it look easy.” [1]';
    expect(findCopiedPassages(text, [SAMPLE])).toEqual([]);
  });

  it('reports each source it copies from, in order of appearance', () => {
    const source = {
      label: 'Eat well guide',
      text: 'Base your meals on higher fibre starchy carbohydrates like potatoes, bread, rice or pasta whenever you can.',
    };
    const text =
      'Base your meals on higher fibre starchy carbohydrates like potatoes, bread, rice or pasta whenever you can. Later on: most of us learn to cook by watching someone we love stand at the stove.';
    const found = findCopiedPassages(text, [SAMPLE, source]);
    expect(found.map((f) => f.source)).toEqual(['Eat well guide', 'your voice sample']);
    expect(originalityMessage(found)).toBe(
      '2 passages repeat Eat well guide, your voice sample word for word, starting "Base your meals on higher fibre starchy carbohydrates like potatoes,...". Put it in your own words, or quote it and cite the source.',
    );
  });

  it('honours minWords and skips sources shorter than it', () => {
    const text = 'we learn to cook by watching';
    expect(findCopiedPassages(text, [SAMPLE])).toEqual([]);
    expect(findCopiedPassages(text, [SAMPLE], { minWords: 5 })).toHaveLength(1);
    expect(findCopiedPassages(SAMPLE.text, [{ label: 'tiny', text: 'too short' }])).toEqual([]);
  });
});
