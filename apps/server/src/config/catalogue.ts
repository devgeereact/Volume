import { readFile, readdir, stat } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { z } from 'zod';

/**
 * Read-only access to files in ROOT/config. Files are re-read when their
 * modified time changes, so edits show up without a restart.
 */

export type CatalogueName = 'book-types' | 'interior-themes' | 'cover-styles';

export interface CatalogueResult {
  name: CatalogueName;
  /** False when the file does not exist yet. */
  available: boolean;
  source: string;
  items: unknown[];
  meta: Record<string, unknown>;
}

const ARRAY_KEYS = ['items', 'bookTypes', 'types', 'interiorThemes', 'themes', 'coverStyles', 'styles', 'categories'];

interface CacheEntry {
  mtimeMs: number;
  value: unknown;
}

const cache = new Map<string, CacheEntry>();

async function readJsonCached(path: string): Promise<unknown> {
  let mtimeMs: number;
  try {
    mtimeMs = (await stat(path)).mtimeMs;
  } catch {
    return undefined;
  }
  const hit = cache.get(path);
  if (hit && hit.mtimeMs === mtimeMs) return hit.value;
  const raw = await readFile(path, 'utf8');
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error(`config file ${basename(path)} is not valid JSON`);
  }
  cache.set(path, { mtimeMs, value });
  return value;
}

function splitItems(value: unknown): { items: unknown[]; meta: Record<string, unknown> } {
  if (Array.isArray(value)) return { items: value, meta: {} };
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const key = ARRAY_KEYS.find((k) => Array.isArray(obj[k])) ?? Object.keys(obj).find((k) => Array.isArray(obj[k]));
    if (key) {
      const meta = { ...obj };
      delete meta[key];
      return { items: obj[key] as unknown[], meta };
    }
    return { items: [], meta: obj };
  }
  return { items: [], meta: {} };
}

export async function readCatalogue(configDir: string, name: CatalogueName): Promise<CatalogueResult> {
  const source = `config/${name}.json`;
  const value = await readJsonCached(join(configDir, `${name}.json`));
  if (value === undefined) return { name, available: false, source, items: [], meta: {} };
  const { items, meta } = splitItems(value);
  return { name, available: true, source, items, meta };
}

const StageDefaultSchema = z.looseObject({
  tier: z.string().optional(),
  defaultModel: z.string(),
  fallbacks: z.array(z.string()).default([]),
  maxTokens: z.number().nullable().optional(),
  temperature: z.number().nullable().optional(),
  webSearch: z.boolean().nullable().optional(),
});

const ModelDefaultsSchema = z.looseObject({
  version: z.number().optional(),
  checkedOn: z.string().optional(),
  budgets: z.record(z.string(), z.unknown()).optional(),
  stages: z.record(z.string(), StageDefaultSchema),
});

export type ModelDefaults = z.infer<typeof ModelDefaultsSchema>;

export async function readModelDefaults(configDir: string): Promise<ModelDefaults> {
  const value = await readJsonCached(join(configDir, 'models.defaults.json'));
  if (value === undefined) return { stages: {} };
  const parsed = ModelDefaultsSchema.safeParse(value);
  if (!parsed.success) {
    const where = parsed.error.issues.map((i) => i.path.join('.')).join(', ');
    throw new Error(`config/models.defaults.json does not match the expected shape at ${where}`);
  }
  return parsed.data;
}

/** Lists ROOT/config/profiles/*.json, or an empty list when the folder is missing. */
export async function listProfileFiles(configDir: string): Promise<string[]> {
  const dir = join(configDir, 'profiles');
  try {
    const names = await readdir(dir);
    return names
      .filter((n) => n.endsWith('.json') && !n.startsWith('_'))
      .sort()
      .map((n) => join(dir, n));
  } catch {
    return [];
  }
}

export async function readJsonFile(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, 'utf8'));
}
