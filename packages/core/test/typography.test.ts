import { describe, expect, it } from 'vitest';
import { curlQuotes, curlQuotesDeep } from '../src/typography.ts';

describe('curlQuotes', () => {
  it('curls dialogue, quoted phrases and apostrophes the way a printed book sets them', () => {
    expect(curlQuotes('"You all right? You\'ve been on that chart a while."')).toBe('“You all right? You’ve been on that chart a while.”');
    expect(curlQuotes("Many of us have heard 'a quiet one' and the nurses' break.")).toBe('Many of us have heard ‘a quiet one’ and the nurses’ break.');
    expect(curlQuotes('He said, "fine".')).toBe('He said, “fine”.');
    expect(curlQuotes('**"Bold quote"**')).toBe('**“Bold quote”**');
  });
  it('leaves inline code and links exactly as written', () => {
    expect(curlQuotes('Type `print("hi")` then visit https://example.com/?q="x" now.')).toBe('Type `print("hi")` then visit https://example.com/?q="x" now.');
  });
  it('curls text fields deeply but never ids, kinds or image sources', () => {
    const doc = { type: 'paragraph', text: '"Hi"', src: 'a"b', items: ["it's"] };
    expect(curlQuotesDeep(doc)).toEqual({ type: 'paragraph', text: '“Hi”', src: 'a"b', items: ['it’s'] });
  });
});

describe('guardrail words quoted as words', () => {
  it('warns instead of blocking when "award-winning" is only mentioned in quotes, and still blocks a real claim', async () => {
    const { checkText } = await import('../src/style.ts');
    const { loadHouseStyle } = await import('../src/node/index.ts');
    const style = loadHouseStyle();
    const mention = checkText('Superlatives such as "the best", "award-winning" and "unrivalled" are the usual culprits.', style, { rules: ['guardrail'] });
    expect(mention.filter((f) => f.id === 'award-words').map((f) => f.action)).toEqual(['warn']);
    const claim = checkText('This is an award-winning guide.', style, { rules: ['guardrail'] });
    expect(claim.filter((f) => f.id === 'award-words').map((f) => f.action)).toEqual(['block']);
  });
});
