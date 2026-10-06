// house-style:off (test data quotes banned phrases, ISBNs and claims on purpose)
import { describe, expect, it } from 'vitest';
import { ModelRegistry, ModelUnavailableError, loadModelsDefaults, mergeOverrides, mockModelInfo } from '../src/index.ts';
import { CONFIG_DIR } from './helpers.ts';

const defaults = loadModelsDefaults(CONFIG_DIR);

describe('model registry', () => {
  it('resolves config defaults per stage', () => {
    const r = new ModelRegistry(defaults).resolve('writing');
    expect(r.model).toBe(defaults.stages['writing']?.defaultModel);
    expect(r.source).toBe('default');
    expect(r.fallbacks).toEqual(defaults.stages['writing']?.fallbacks);
    expect(r.fallbackUsed).toBe(false);
    expect(r.stream).toBe(true);
    expect(r.temperature).toBe(0.8);
    expect(r.maxTokens).toBe(defaults.stages['writing']?.maxTokens);
    expect(r.maxTokens).toBeGreaterThanOrEqual(32000);
  });

  it('gives the research stage the web plugin from config', () => {
    const r = new ModelRegistry(defaults).resolve('research');
    expect(r.webSearch).toEqual({ engine: 'native', maxResults: 8 });
    expect(new ModelRegistry(defaults).resolve('titles').webSearch).toBeUndefined();
  });

  it('applies workspace, then profile, then book overrides', () => {
    const reg = new ModelRegistry(defaults, {
      workspace: { titles: { model: 'ws/model', params: { temperature: 0.5 } } },
      profile: { titles: { model: 'profile/model' } },
      book: { titles: { params: { maxTokens: 999 } } },
    });
    const r = reg.resolve('titles');
    expect(r.model).toBe('profile/model');
    expect(r.source).toBe('profile');
    expect(r.temperature).toBe(0.5);
    expect(r.maxTokens).toBe(999);
    // Earlier choices become fallbacks, no duplicates, never the model itself.
    expect(r.fallbacks[0]).toBe('ws/model');
    expect(r.fallbacks).toContain(defaults.stages['titles']?.defaultModel);
    expect(new Set(r.fallbacks).size).toBe(r.fallbacks.length);
    expect(r.fallbacks).not.toContain('profile/model');
  });

  it('per-call overrides and an explicit model sit on top', () => {
    const reg = new ModelRegistry(defaults, { workspace: { blueprint: { model: 'ws/model' } } });
    expect(reg.resolve('blueprint', { overrides: { book: { blueprint: { model: 'book/model' } } } }).model).toBe('book/model');
    const explicit = reg.resolve('blueprint', { model: 'chosen/model' });
    expect(explicit.model).toBe('chosen/model');
    expect(explicit.source).toBe('explicit');
  });

  it('merges override layers', () => {
    const m = mergeOverrides({ book: { writing: { model: 'a', params: { temperature: 0.1 } } } }, { book: { writing: { params: { maxTokens: 10 } } } });
    expect(m.book?.['writing']).toEqual({ model: 'a', params: { temperature: 0.1, maxTokens: 10 } });
  });

  it('never switches silently: a missing model throws with the next fallback offered', () => {
    const reg = new ModelRegistry(defaults);
    const research = defaults.stages['research'];
    if (!research) throw new Error('research stage missing');
    const available = (slug: string) => slug !== research.defaultModel;
    try {
      reg.resolve('research', { isAvailable: available });
      throw new Error('expected a throw');
    } catch (e) {
      expect(e).toBeInstanceOf(ModelUnavailableError);
      expect((e as ModelUnavailableError).nextFallback).toBe(research.fallbacks[0]);
      expect((e as ModelUnavailableError).stage).toBe('research');
    }
  });

  it('uses the fallback only when allowed, and flags it', () => {
    const reg = new ModelRegistry(defaults);
    const research = defaults.stages['research'];
    if (!research) throw new Error('research stage missing');
    const r = reg.resolve('research', { isAvailable: (s) => s !== research.defaultModel, allowFallback: true });
    expect(r.fallbackUsed).toBe(true);
    expect(r.fallbackFrom).toBe(research.defaultModel);
    expect(r.model).toBe(research.fallbacks[0]);
    expect(r.requestedModel).toBe(research.defaultModel);
  });

  it('throws when neither the model nor any fallback is available', () => {
    const reg = new ModelRegistry(defaults);
    expect(() => reg.resolve('cover_image', { isAvailable: () => false, allowFallback: true })).toThrowError(ModelUnavailableError);
  });

  it('caches the model list for prices and context, including alias targets', () => {
    const reg = new ModelRegistry(defaults);
    expect(reg.isListed('anything')).toBe(true);
    reg.setModels([mockModelInfo('~anthropic/claude-sonnet-latest', { aliasTarget: 'anthropic/claude-sonnet-5.5' })]);
    expect(reg.isListed('~anthropic/claude-sonnet-latest')).toBe(true);
    expect(reg.isListed('missing/model')).toBe(false);
    expect(reg.pricing('anthropic/claude-sonnet-5.5')?.inputPerMillion).toBe(1);
    expect(reg.configuredSlugs().get('~anthropic/claude-sonnet-latest')).toContain('writing');
  });
});
