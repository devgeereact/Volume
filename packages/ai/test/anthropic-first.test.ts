import { describe, expect, it, vi } from 'vitest';
import { BudgetError, ServerError } from '../src/errors.ts';
import { AnthropicFirstProvider, anthropicModelFor, isFundsError, type AnthropicClient } from '../src/provider/anthropic.ts';
import type { AiProvider, ChatRequest, ChatResult } from '../src/types.ts';

function result(provider: ChatResult['provider'], model: string): ChatResult {
  return {
    text: 'ok',
    model,
    finishReason: 'stop',
    usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2, reasoningTokens: 0, cachedTokens: 0, costUsd: 0, costSource: 'computed' },
    sources: [],
    generationId: null,
    latencyMs: 1,
    provider,
  };
}

function fakes(anthropicChat: () => Promise<ChatResult>) {
  const openrouterChat = vi.fn((req: ChatRequest) => Promise.resolve(result('openrouter', req.model)));
  const openrouter = { name: 'openrouter', chat: openrouterChat, generateImage: vi.fn(), listModels: vi.fn(), keyStatus: vi.fn() } as unknown as AiProvider;
  const chat = vi.fn(anthropicChat);
  const anthropic = { chat } as unknown as AnthropicClient;
  return { openrouter, openrouterChat, anthropic, chat };
}

const req = (model: string, extra: Partial<ChatRequest> = {}): ChatRequest => ({ model, messages: [{ role: 'user', content: 'hi' }], ...extra });

describe('anthropicModelFor', () => {
  it('maps OpenRouter Claude slugs to Anthropic ids', () => {
    expect(anthropicModelFor('anthropic/claude-sonnet-4.6')).toBe('claude-sonnet-4-6');
    expect(anthropicModelFor('~anthropic/claude-sonnet-latest')).toBe('claude-sonnet-5-5');
    expect(anthropicModelFor('~anthropic/claude-opus-latest')).toBe('claude-opus-5-5');
    expect(anthropicModelFor('anthropic/claude-haiku-4.5:online')).toBe('claude-haiku-4-5');
  });
  it('leaves other models and unknown Claude versions to OpenRouter', () => {
    expect(anthropicModelFor('openai/gpt-5')).toBeNull();
    expect(anthropicModelFor('google/gemini-3-pro')).toBeNull();
    expect(anthropicModelFor('anthropic/claude-sonnet-9.9')).toBeNull();
  });
});

describe('isFundsError', () => {
  it('spots the low balance answer and nothing else', () => {
    expect(isFundsError(400, 'Your credit balance is too low to access the Anthropic API.')).toBe(true);
    expect(isFundsError(402, 'billing_error')).toBe(true);
    expect(isFundsError(400, 'max_tokens: must be positive')).toBe(false);
    expect(isFundsError(429, 'credit balance')).toBe(false);
  });
});

describe('AnthropicFirstProvider', () => {
  it('serves a Claude model from Anthropic first', async () => {
    const f = fakes(() => Promise.resolve(result('anthropic', 'claude-sonnet-5-5')));
    const p = new AnthropicFirstProvider(f.openrouter, f.anthropic);
    const r = await p.chat(req('~anthropic/claude-sonnet-latest'));
    expect(r.provider).toBe('anthropic');
    expect(f.chat).toHaveBeenCalledWith(expect.anything(), 'claude-sonnet-5-5');
    expect(f.openrouterChat).not.toHaveBeenCalled();
  });

  it('keeps non-Claude models and web search calls on OpenRouter', async () => {
    const f = fakes(() => Promise.resolve(result('anthropic', 'x')));
    const p = new AnthropicFirstProvider(f.openrouter, f.anthropic);
    expect((await p.chat(req('openai/gpt-5'))).provider).toBe('openrouter');
    expect((await p.chat(req('anthropic/claude-sonnet-4.6', { webSearch: {} }))).provider).toBe('openrouter');
    expect(f.chat).not.toHaveBeenCalled();
  });

  it('moves to OpenRouter when Anthropic is out of funds, tells the caller and skips Anthropic for a while', async () => {
    let now = 1_000;
    const f = fakes(() => Promise.reject(new BudgetError('empty', 'credits')));
    const onFallback = vi.fn();
    const p = new AnthropicFirstProvider(f.openrouter, f.anthropic, { onFallback, retryAfterMs: 60_000, now: () => now });
    expect((await p.chat(req('anthropic/claude-sonnet-4.6'))).provider).toBe('openrouter');
    expect(onFallback).toHaveBeenCalledTimes(1);
    expect(p.status()).toEqual({ configured: true, outOfFundsAt: 1_000 });
    now = 30_000;
    await p.chat(req('anthropic/claude-sonnet-4.6'));
    expect(f.chat).toHaveBeenCalledTimes(1); // skipped inside the wait
    now = 100_000;
    await p.chat(req('anthropic/claude-sonnet-4.6'));
    expect(f.chat).toHaveBeenCalledTimes(2); // tried again after the wait
  });

  it('clears the out of funds mark once Anthropic answers again', async () => {
    let fail = true;
    const f = fakes(() => (fail ? Promise.reject(new BudgetError('empty', 'credits')) : Promise.resolve(result('anthropic', 'm'))));
    const p = new AnthropicFirstProvider(f.openrouter, f.anthropic, { retryAfterMs: 0 });
    await p.chat(req('anthropic/claude-sonnet-4.6'));
    expect(p.status().outOfFundsAt).not.toBeNull();
    fail = false;
    expect((await p.chat(req('anthropic/claude-sonnet-4.6'))).provider).toBe('anthropic');
    expect(p.status().outOfFundsAt).toBeNull();
  });

  it('does not hide other Anthropic failures behind OpenRouter', async () => {
    const f = fakes(() => Promise.reject(new ServerError('boom')));
    const p = new AnthropicFirstProvider(f.openrouter, f.anthropic);
    await expect(p.chat(req('anthropic/claude-sonnet-4.6'))).rejects.toBeInstanceOf(ServerError);
    expect(f.openrouterChat).not.toHaveBeenCalled();
  });
});
