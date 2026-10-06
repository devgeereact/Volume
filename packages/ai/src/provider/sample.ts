// Builds a minimal valid value from a JSON schema (as produced by z.toJSONSchema). The mock provider uses it
// as the generic fallback answer when no fixture exists for a prompt.

import { asArray, asNumber, asObject, asString } from '../util.ts';

type Schema = Record<string, unknown>;

function resolveRef(ref: string, root: Schema): Schema | undefined {
  const m = /^#\/(\$defs|definitions)\/(.+)$/.exec(ref);
  if (!m) return undefined;
  return asObject(asObject(root[m[1] ?? ''])?.[m[2] ?? '']);
}

export function sampleFromSchema(schema: unknown, root: Schema = asObject(schema) ?? {}, depth = 0, key = 'value'): unknown {
  const s = asObject(schema);
  if (!s || depth > 12) return null;
  const ref = asString(s['$ref']);
  if (ref) return sampleFromSchema(resolveRef(ref, root), root, depth + 1, key);
  if ('const' in s) return s['const'];
  const en = asArray(s['enum']);
  if (en.length) return en[0];
  for (const k of ['anyOf', 'oneOf', 'allOf']) {
    const opts = asArray(s[k]);
    if (opts.length) {
      const pick = opts.find((o) => asObject(o)?.['type'] !== 'null') ?? opts[0];
      return sampleFromSchema(pick, root, depth + 1, key);
    }
  }
  let type = s['type'];
  if (Array.isArray(type)) type = type.find((t) => t !== 'null') ?? type[0];
  switch (type) {
    case 'object': {
      const out: Record<string, unknown> = {};
      const props = asObject(s['properties']) ?? {};
      for (const [k, v] of Object.entries(props)) out[k] = sampleFromSchema(v, root, depth + 1, k);
      return out;
    }
    case 'array': {
      const min = asNumber(s['minItems']) ?? 1;
      const n = Math.max(1, min);
      return Array.from({ length: n }, () => sampleFromSchema(s['items'], root, depth + 1, key));
    }
    case 'string': {
      const min = asNumber(s['minLength']) ?? 0;
      const text = `Sample ${key}`;
      return text.length >= min ? text : text.padEnd(min, '.');
    }
    case 'integer':
    case 'number':
      return asNumber(s['minimum']) ?? 1;
    case 'boolean':
      return false;
    case 'null':
      return null;
    default:
      return `Sample ${key}`;
  }
}
