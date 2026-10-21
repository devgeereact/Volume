import { describe, expect, it } from 'vitest';
import { claimNeedsCheck, claimRisk } from '../src/index.ts';

describe('claim tiers', () => {
  it('reads the recorded risk', () => {
    expect(claimRisk({ risk: 'medium' })).toBe('medium');
    expect(claimRisk({ risk: 'severe' })).toBeNull();
    expect(claimRisk({})).toBeNull();
    expect(claimRisk(null)).toBeNull();
  });

  it('needs a check when the risk is high, harm is possible, or no risk is recorded', () => {
    expect(claimNeedsCheck({ category: 'medical', location: { risk: 'high', harmIfWrong: false } })).toBe(true);
    expect(claimNeedsCheck({ category: 'medical', location: { risk: 'low', harmIfWrong: true } })).toBe(true);
    expect(claimNeedsCheck({ category: 'medical', location: { start: 0, end: 4 } })).toBe(true);
    expect(claimNeedsCheck({ category: 'other_fact' })).toBe(true);
  });

  it('always needs a check for regulatory and personal claims', () => {
    expect(claimNeedsCheck({ category: 'regulatory', location: { risk: 'low', harmIfWrong: false } })).toBe(true);
    expect(claimNeedsCheck({ category: 'personal', location: { risk: 'low', harmIfWrong: false } })).toBe(true);
  });

  it('lists low and medium risk claims that do no harm for the record', () => {
    expect(claimNeedsCheck({ category: 'medical', location: { risk: 'low', harmIfWrong: false } })).toBe(false);
    expect(claimNeedsCheck({ category: 'other_fact', location: { risk: 'medium', harmIfWrong: false } })).toBe(false);
  });
});
