import { basename } from 'node:path';
import { z } from 'zod';
import type { RequestCtx } from '../auth/context.js';
import { listProfileFiles, readJsonFile } from '../config/catalogue.js';
import type { Repos } from '../repos/index.js';
import { bioStatusFromPublishing } from '../db/migrations/0002_gaps.js';
import type { ProfileInput } from '../repos/profiles.js';

/**
 * Copies ROOT/config/profiles/*.json into author_profiles on first run.
 * A profile already seeded (same source key) is left alone, so the owner's
 * edits in the app are never overwritten. One repair: a seeded profile whose
 * bio is still empty and that was never edited gets the bio from its file
 * (About the author prints the bio word for word). Missing folder: seeds nothing.
 */

const ProfileFileSchema = z.looseObject({
  id: z.string().min(1),
  name: z.string().min(1),
  initials: z.string().optional(),
  realPerson: z.boolean().default(false),
  legalName: z.string().nullable().optional(),
  location: z.string().nullable().optional(),
  imprint: z.string().nullable().optional(),
  bio: z.string().default(''),
  shortBio: z.string().nullable().optional(),
  credentials: z.array(z.string()).default([]),
  links: z.array(z.looseObject({ label: z.string(), value: z.string().optional(), url: z.string().optional() })).default([]),
  genres: z.array(z.string()).default([]),
  bookTypes: z.array(z.string()).default([]),
  voice: z.record(z.string(), z.unknown()).default({}),
  publishing: z.record(z.string(), z.unknown()).default({}),
  models: z.record(z.string(), z.unknown()).default({}),
  modelNotes: z.string().optional(),
  status: z.unknown().optional(),
  language: z.string().optional(),
});

export interface SeedReport {
  folderFound: boolean;
  created: string[];
  skipped: string[];
  /** Seeded profiles whose empty, never-edited bio was filled from the config file. */
  bioFilled: string[];
  invalid: { file: string; reason: string }[];
}

export function profileFileToInput(f: z.infer<typeof ProfileFileSchema>): ProfileInput {
  const publishing = { ...f.publishing, sourceStatus: f.status ?? null, modelNotes: f.modelNotes ?? null };
  return {
    penName: f.name,
    legalName: f.legalName ?? null,
    imprintName: f.imprint ?? null,
    isRealPerson: f.realPerson,
    illustrativeLineDefault: f.realPerson,
    location: f.location ?? null,
    language: f.language ?? 'en-GB',
    bioThirdPerson: f.bio,
    shortBio: f.shortBio ?? null,
    credentials: f.credentials,
    links: f.links.map((l) => ({ label: l.label, ...(l.value !== undefined ? { value: l.value } : {}), ...(l.url !== undefined ? { url: l.url } : {}) })),
    voice: f.voice,
    brand: { initials: f.initials ?? null, genres: f.genres, bookTypes: f.bookTypes },
    publishing,
    models: f.models,
    defaultBookTypeId: f.bookTypes[0] ?? null,
    // The config file's status.bio: owner-to-confirm stays to_confirm; confirmed and pen-name bios count as confirmed.
    bioStatus: bioStatusFromPublishing(JSON.stringify(publishing)) ?? 'to_confirm',
  };
}

export async function seedProfiles(repos: Repos, ctx: RequestCtx, configDir: string): Promise<SeedReport> {
  const files = await listProfileFiles(configDir);
  const report: SeedReport = { folderFound: files.length > 0, created: [], skipped: [], bioFilled: [], invalid: [] };
  for (const file of files) {
    let raw: unknown;
    try {
      raw = await readJsonFile(file);
    } catch {
      report.invalid.push({ file: basename(file), reason: 'not valid JSON' });
      continue;
    }
    const parsed = ProfileFileSchema.safeParse(raw);
    if (!parsed.success) {
      report.invalid.push({ file: basename(file), reason: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') });
      continue;
    }
    const key = `config:${parsed.data.id}`;
    const existing = await repos.profiles.findBySourceKey(ctx, key);
    if (existing) {
      report.skipped.push(parsed.data.id);
      // Never overwrite the owner's words: only an empty bio on a profile nobody has edited is filled.
      const neverEdited = existing.updatedAt === existing.createdAt;
      if (neverEdited && existing.bioThirdPerson.trim() === '' && parsed.data.bio.trim() !== '') {
        const patch: { bioThirdPerson: string; shortBio?: string } = { bioThirdPerson: parsed.data.bio };
        if ((existing.shortBio ?? '').trim() === '' && parsed.data.shortBio) patch.shortBio = parsed.data.shortBio;
        await repos.profiles.update(ctx, existing.id, patch);
        report.bioFilled.push(parsed.data.id);
      }
      continue;
    }
    await repos.profiles.create(ctx, profileFileToInput(parsed.data), key);
    report.created.push(parsed.data.id);
  }
  return report;
}
