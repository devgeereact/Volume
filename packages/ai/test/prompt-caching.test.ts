// Prompt caching on the direct Anthropic path. Anthropic reuses only the unchanged start of a prompt, so the system
// part must carry the cache marker and must not change from one call to the next within a book.
import { describe, expect, it } from 'vitest';
import { parsePromptFile, PromptLoader } from '../src/prompts.ts';
import { AnthropicClient } from '../src/provider/anthropic.ts';
import { PROMPTS_DIR } from './helpers.ts';

// Variables that change on every chapter or section.
const PER_CALL = /\{\{\s*(chapter\.[a-zA-Z]+|nextChapter\.[a-zA-Z]+|section\.[a-zA-Z]+|previousSummaries|ledger|currentWords)\s*\}\}/g;
// Prompts run once per chapter or section, whose User part opens with the per-book material.
const SPLIT = [
  'writing.chapter',
  'writing.chapter-fiction',
  'writing.chapter-reference',
  'writing.chapter-workbook',
  'writing.extend-section',
  'writing.extend-section-fiction',
];

function sse(usage: { input: number; output: number; cacheRead: number; cacheWrite: number }): string {
  const events: [string, unknown][] = [
    [
      'message_start',
      {
        type: 'message_start',
        message: {
          id: 'msg_test',
          type: 'message',
          role: 'assistant',
          model: 'claude-fable-5-1',
          content: [],
          stop_reason: null,
          stop_sequence: null,
          usage: {
            input_tokens: usage.input,
            output_tokens: 1,
            cache_read_input_tokens: usage.cacheRead,
            cache_creation_input_tokens: usage.cacheWrite,
          },
        },
      },
    ],
    ['content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } }],
    ['content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Hello.' } }],
    ['content_block_stop', { type: 'content_block_stop', index: 0 }],
    ['message_delta', { type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: usage.output } }],
    ['message_stop', { type: 'message_stop' }],
  ];
  return events.map(([name, data]) => `event: ${name}\ndata: ${JSON.stringify(data)}\n\n`).join('');
}

function client(usage = { input: 1000, output: 5, cacheRead: 0, cacheWrite: 0 }) {
  const bodies: Record<string, unknown>[] = [];
  const fetch = ((_url: unknown, init?: RequestInit) => {
    bodies.push(JSON.parse(typeof init?.body === 'string' ? init.body : '{}') as Record<string, unknown>);
    return Promise.resolve(new Response(sse(usage), { status: 200, headers: { 'content-type': 'text/event-stream' } }));
  }) as typeof globalThis.fetch;
  return { bodies, anthropic: new AnthropicClient({ apiKey: 'test-key', fetch, retry: { maxRetries: 0 } }) };
}

describe('Anthropic request caching', () => {
  it('marks the system part for caching and leaves the user part unmarked', async () => {
    const { bodies, anthropic } = client();
    await anthropic.chat(
      {
        model: 'anthropic/claude-fable-5.1',
        messages: [
          { role: 'system', content: 'Book-wide instructions.' },
          { role: 'user', content: 'Write chapter 3.' },
        ],
      },
      'claude-fable-5-1',
    );
    expect(bodies[0]?.['system']).toEqual([{ type: 'text', text: 'Book-wide instructions.', cache_control: { type: 'ephemeral' } }]);
    expect(bodies[0]?.['messages']).toEqual([{ role: 'user', content: 'Write chapter 3.' }]);
    expect(bodies[0]).not.toHaveProperty('cache_control');
  });

  it('marks the shared start of the user part when the prompt has a "# Per call" part', async () => {
    const { bodies, anthropic } = client();
    await anthropic.chat(
      {
        model: 'anthropic/claude-fable-5.1',
        messages: [
          { role: 'system', content: 'Book-wide instructions.' },
          { role: 'user', content: 'Blueprint.\n\nWrite chapter 3.', cachePrefix: 'Blueprint.'.length },
          { role: 'assistant', content: 'Draft.' },
          { role: 'user', content: 'Fix it.', cachePrefix: 2 },
        ],
      },
      'claude-fable-5-1',
    );
    expect(bodies[0]?.['messages']).toEqual([
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Blueprint.', cache_control: { type: 'ephemeral' } },
          { type: 'text', text: '\n\nWrite chapter 3.' },
        ],
      },
      { role: 'assistant', content: 'Draft.' },
      { role: 'user', content: 'Fix it.' },
    ]);
  });
});

describe('"# Per call" split in prompt files', () => {
  const raw = (user: string): string => `---\nid: test.split\nversion: 1\nstage: writing\ntier: mid\n---\n\n# System\n\nRules.\n\n# User\n\n${user}\n`;
  const fill = (vars: string[]): Record<string, string> => Object.fromEntries(vars.map((v) => [v, `<${v}>`]));

  it('splits the User part at the heading and keeps the variables of both halves', () => {
    const file = parsePromptFile(raw('Blueprint: {{blueprint}}\n\n# Per call\n\nChapter {{chapter.number}}.'), 'test.split.v1.md');
    expect(file.user).toBe('Blueprint: {{blueprint}}');
    expect(file.perCall).toBe('Chapter {{chapter.number}}.');
    expect(file.variables.sort()).toEqual(['blueprint', 'chapter.number']);
  });

  it('renders each split prompt as one whole user message with a per-book start', () => {
    const loader = new PromptLoader(PROMPTS_DIR);
    for (const id of SPLIT) {
      const file = loader.load(id);
      expect(file.perCall, id).not.toBe('');
      expect(
        [...file.user.matchAll(PER_CALL)].map((m) => m[1]),
        id,
      ).toEqual([]);
      const user = loader.render(id, fill(file.variables)).messages[1];
      const cut = user?.cachePrefix ?? 0;
      expect(cut, id).toBeGreaterThan(0);
      expect(user?.content, id).not.toContain('# Per call');
      expect(user?.content.slice(0, cut), id).not.toMatch(/<(chapter|nextChapter|section)\.|<previousSummaries>|<ledger>|<currentWords>/);
      expect(user?.content.slice(cut), id).toContain('<chapter.wordTarget>');
    }
  });

  it('leaves prompts without the heading as before', () => {
    const loader = new PromptLoader(PROMPTS_DIR);
    const file = loader.load('writing.chapter', 9);
    expect(file.perCall).toBe('');
    const user = loader.render('writing.chapter', fill(file.variables), { version: 9 }).messages[1];
    expect(user).toEqual({ role: 'user', content: expect.stringContaining('<chapter.summary>') as unknown });
    expect(user).not.toHaveProperty('cachePrefix');
  });

  it('prices Claude Fable 5.1 cache reads at $0.25 per million tokens', async () => {
    const { anthropic } = client({ input: 1000, output: 5, cacheRead: 1_000_000, cacheWrite: 0 });
    const r = await anthropic.chat(
      {
        model: 'anthropic/claude-fable-5.1',
        messages: [
          { role: 'system', content: 'S' },
          { role: 'user', content: 'U' },
        ],
      },
      'claude-fable-5-1',
    );
    expect(r.usage.cachedTokens).toBe(1_000_000);
    expect(r.usage.costUsd).toBeCloseTo((1000 * 10 + 5 * 50 + 1_000_000 * 0.25) / 1_000_000, 8);
  });
});

describe('system parts stay the same from call to call', () => {
  // A per-call variable in a system part makes each call's prompt start differently, so nothing is read back from
  // the cache. The exceptions: the introduction and conclusion run once per book, and the consistency check's
  // chapter.kind takes only a few values. Do not add to this list.
  const KNOWN: Record<string, string[]> = {
    'checks.consistency': ['chapter.kind'],
    'writing.conclusion': ['chapter.wordTarget'],
    'writing.introduction': ['chapter.wordTarget'],
  };

  it('no latest prompt adds a per-chapter variable to its system part', () => {
    const found: Record<string, string[]> = {};
    for (const file of new PromptLoader(PROMPTS_DIR).latest()) {
      const vars = [...new Set([...file.system.matchAll(PER_CALL)].map((m) => m[1] ?? ''))].sort();
      if (vars.length > 0) found[file.meta.id] = vars;
    }
    expect(found).toEqual(KNOWN);
  });
});
