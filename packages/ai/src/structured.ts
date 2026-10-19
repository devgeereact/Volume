// Structured JSON output: request a JSON schema built from the zod schema, parse and validate the answer,
// and on failure send one repair request (prompts/system/json-repair.v<N>.md) with the zod errors.
// A second failure throws InvalidOutputError.

import { z } from 'zod';
import { AiError, InvalidOutputError } from './errors.ts';
import type { PromptLoader } from './prompts.ts';
import { addUsage, emptyUsage, type AiProvider, type ChatRequest, type ChatResult, type ResponseFormat } from './types.ts';

export const JSON_REPAIR_PROMPT_ID = 'system.json-repair';

export function jsonSchemaOf(schema: z.ZodType): Record<string, unknown> {
  const js = z.toJSONSchema(schema, { target: 'draft-7', unrepresentable: 'any', io: 'input' }) as Record<string, unknown>;
  const { $schema: _drop, ...rest } = js;
  return rest;
}

export function responseFormatFor(name: string, schema: z.ZodType, mode: 'json_schema' | 'json_object' = 'json_schema'): ResponseFormat {
  if (mode === 'json_object') return { type: 'json_object' };
  return { type: 'json_schema', name: name.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 64), schema: jsonSchemaOf(schema), strict: false };
}

/**
 * Commas left before a closing } or ], outside strings, removed. Small models often leave them (live acceptance run,
 * 18 October 2026: editing answers on free models failed as invalid JSON).
 */
export function stripTrailingCommas(text: string): string {
  let out = '';
  let inString = false;
  let escaped = false;
  for (let i = 0; i < text.length; i++) {
    const c = text.charAt(i);
    if (inString) {
      out += c;
      if (escaped) escaped = false;
      else if (c === '\\') escaped = true;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') inString = true;
    if (c === ',') {
      let j = i + 1;
      while (j < text.length && /\s/.test(text.charAt(j))) j++;
      const next = text.charAt(j);
      if (next === '}' || next === ']') continue;
    }
    out += c;
  }
  return out;
}

/**
 * Pull a JSON value out of a model answer: plain JSON, a ```json fence (closed or not), or the outermost {...} block.
 * Each candidate is tried as it is, then once more with a byte order mark and trailing commas removed. This local
 * repair runs before the one repair request to the model.
 */
export function extractJson(text: string): unknown {
  const trimmed = text.replace(/^\uFEFF/, '').trim();
  const attempts: string[] = [trimmed];
  const fence = /```(?:json)?\s*\n?([\s\S]*?)```/i.exec(trimmed);
  if (fence?.[1]) attempts.push(fence[1].trim());
  const open = /^```(?:json)?\s*\n?([\s\S]*)$/i.exec(trimmed);
  if (open?.[1] && !fence) attempts.push(open[1].trim());
  const first = trimmed.indexOf('{');
  const last = trimmed.lastIndexOf('}');
  if (first !== -1 && last > first) attempts.push(trimmed.slice(first, last + 1));
  let lastError: unknown;
  for (const a of attempts) {
    try {
      return JSON.parse(a);
    } catch (e) {
      lastError = e;
    }
  }
  for (const a of attempts) {
    try {
      return JSON.parse(stripTrailingCommas(a));
    } catch {
      // The error of the answer as sent is the one reported.
    }
  }
  throw lastError instanceof Error ? lastError : new Error('No JSON found');
}

export type Validation<T> = { ok: true; data: T } | { ok: false; issues: string[] };

export function validateJson<T>(schema: z.ZodType<T>, text: string): Validation<T> {
  let parsed: unknown;
  try {
    parsed = extractJson(text);
  } catch (e) {
    return { ok: false, issues: [`The answer is not valid JSON: ${e instanceof Error ? e.message : String(e)}`] };
  }
  const r = schema.safeParse(parsed);
  if (r.success) return { ok: true, data: r.data };
  return {
    ok: false,
    issues: r.error.issues.slice(0, 40).map((i) => `${i.path.length ? i.path.join('.') : '(root)'}: ${i.message}`),
  };
}

export interface StructuredResult<T> {
  data: T;
  calls: ChatResult[];
  repaired: boolean;
}

/**
 * Run a chat request that must return JSON matching `schema`. One repair attempt, then InvalidOutputError.
 * `run` lets the caller wrap each call (budget checks, stream resets); it defaults to provider.chat.
 */
export async function chatStructured<T>(
  provider: AiProvider,
  req: ChatRequest,
  schema: z.ZodType<T>,
  prompts: PromptLoader,
  opts: { run?: ((r: ChatRequest) => Promise<ChatResult>) | undefined; repairVersion?: number | undefined } = {},
): Promise<StructuredResult<T>> {
  const run = opts.run ?? ((r: ChatRequest) => provider.chat(r));
  const first = await run(req);
  const v1 = validateJson(schema, first.text);
  if (v1.ok) return { data: v1.data, calls: [first], repaired: false };

  // The schema goes with the repair request: when a provider refused response_format, the model has not
  // seen the field names anywhere else (the contract is in the prompt's front matter, not in its text).
  const repairFile = prompts.load(JSON_REPAIR_PROMPT_ID, opts.repairVersion);
  const values: Record<string, unknown> = { errors: v1.issues };
  if (repairFile.variables.includes('schema')) values['schema'] = JSON.stringify(jsonSchemaOf(schema));
  const repair = prompts.render(JSON_REPAIR_PROMPT_ID, values, { version: opts.repairVersion });
  const repairText = repair.messages.map((m) => m.content).join('\n\n');
  let second: ChatResult;
  try {
    second = await run({
      ...req,
      stream: false,
      onDelta: undefined,
      messages: [...req.messages, { role: 'assistant', content: first.text }, { role: 'user', content: repairText }],
      meta: { ...req.meta, attempt: (req.meta?.attempt ?? 0) + 1, purpose: 'json-repair' },
    });
  } catch (e) {
    // The first answer was paid for too.
    if (e instanceof AiError) e.usage = e.usage ? addUsage(first.usage, e.usage) : first.usage;
    throw e;
  }
  const v2 = validateJson(schema, second.text);
  if (v2.ok) return { data: v2.data, calls: [first, second], repaired: true };
  // Both calls were paid for: the error carries their usage so the caller can record the spend.
  throw new InvalidOutputError(
    `The model's answer did not match the expected JSON after one repair: ${v2.issues.slice(0, 5).join('; ')}`,
    v2.issues,
    second.text,
    {
      details: { firstIssues: v1.issues, calls: [first, second].map((c) => ({ model: c.model, usage: c.usage })) },
      usage: [first, second].reduce((u, c) => addUsage(u, c.usage), emptyUsage()),
    },
  );
}
