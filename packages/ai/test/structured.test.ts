// house-style:off (test data quotes banned phrases, ISBNs and claims on purpose)
import { z } from 'zod';
import { describe, expect, it } from 'vitest';
import {
  InvalidOutputError,
  MockProvider,
  PromptLoader,
  chatStructured,
  extractJson,
  jsonSchemaOf,
  responseFormatFor,
  sampleFromSchema,
  validateJson,
} from '../src/index.ts';
import { PROMPTS_DIR } from './helpers.ts';

const schema = z.object({ title: z.string(), count: z.number(), tags: z.array(z.string()) });
const prompts = new PromptLoader(PROMPTS_DIR);

describe('structured output', () => {
  it('extracts JSON from plain text, fences and surrounding words', () => {
    expect(extractJson('{"a":1}')).toEqual({ a: 1 });
    expect(extractJson('```json\n{"a":2}\n```')).toEqual({ a: 2 });
    expect(extractJson('Here you go: {"a":3} thanks')).toEqual({ a: 3 });
    expect(() => extractJson('no json here')).toThrow();
  });

  it('reports zod issues with paths', () => {
    const v = validateJson(schema, '{"title":"x","count":"two","tags":[]}');
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.issues.join(' ')).toContain('count');
  });

  it('builds a JSON schema response format and a sample that validates', () => {
    const rf = responseFormatFor('titles.title-options', schema);
    expect(rf.type).toBe('json_schema');
    if (rf.type === 'json_schema') {
      expect(rf.name).toBe('titles_title-options');
      expect(rf.schema['$schema']).toBeUndefined();
      expect(schema.safeParse(sampleFromSchema(rf.schema)).success).toBe(true);
    }
    expect(jsonSchemaOf(schema)['type']).toBe('object');
  });

  it('repairs once with the zod errors, then succeeds', async () => {
    const mock = new MockProvider({ scenario: 'invalid_json' });
    const req = {
      model: 'mock/model',
      messages: [{ role: 'user' as const, content: 'Give JSON' }],
      responseFormat: responseFormatFor('t', schema),
      meta: { promptId: 'test.repair' },
    };
    const r = await chatStructured(mock, req, schema, prompts);
    expect(r.repaired).toBe(true);
    expect(r.calls).toHaveLength(2);
    expect(r.data.title).toBe('Sample title');
    const repairMsg = mock.requests[1]?.messages.at(-1)?.content ?? '';
    expect(repairMsg).toContain('did not match the JSON output contract');
    expect(repairMsg).toContain('not valid JSON');
    expect(mock.requests[1]?.messages.at(-2)?.role).toBe('assistant');
  });

  it('throws InvalidOutputError after one failed repair', async () => {
    const mock = new MockProvider({ scenario: 'invalid_json_always' });
    const req = { model: 'mock/model', messages: [{ role: 'user' as const, content: 'x' }], meta: { promptId: 'test.bad' } };
    await expect(chatStructured(mock, req, schema, prompts)).rejects.toBeInstanceOf(InvalidOutputError);
    expect(mock.requests).toHaveLength(2);
  });
});
