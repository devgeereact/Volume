import { z } from 'zod';
import type { RequestCtx } from '../auth/context.js';
import type { Db } from '../db/connect.js';
import type { AuthorProfilesTable, ProfileMemoryTable, ProfileSamplesTable } from '../db/schema.js';
import { AppError, notFound } from '../http/errors.js';
import { wordCount } from '../lib/text.js';
import { bool, flag, fromJson, newId, now, sha256Hex, toJson } from '../lib/util.js';

const Obj = z.record(z.string(), z.unknown());
/** Links from the profile files use {label, value}; {label, url} is also accepted. */
const LinkSchema = z.object({ label: z.string().max(200), value: z.string().max(2000).optional(), url: z.string().max(2000).optional() });

/** confirmed: the owner approved the bio. to_confirm: the owner still has to check it. */
export const BIO_STATUSES = ['confirmed', 'to_confirm'] as const;
export type BioStatus = (typeof BIO_STATUSES)[number];

export const ProfileInputSchema = z.object({
  penName: z.string().trim().min(1).max(200),
  legalName: z.string().max(200).nullable().optional(),
  imprintName: z.string().max(200).nullable().optional(),
  isRealPerson: z.boolean().optional(),
  illustrativeLineDefault: z.boolean().optional(),
  location: z.string().max(200).nullable().optional(),
  language: z.string().min(2).max(20).optional(),
  bioThirdPerson: z.string().max(20000).optional(),
  shortBio: z.string().max(2000).nullable().optional(),
  credentials: z.array(z.string().max(300)).max(50).optional(),
  links: z.array(LinkSchema).max(50).optional(),
  voice: Obj.optional(),
  brand: Obj.optional(),
  templates: Obj.optional(),
  publishing: Obj.optional(),
  models: Obj.optional(),
  defaultBookTypeId: z.string().max(200).nullable().optional(),
  /** Defaults to confirmed for a profile made in the app (the owner wrote the bio). */
  bioStatus: z.enum(BIO_STATUSES).optional(),
});
export type ProfileInput = z.infer<typeof ProfileInputSchema>;
export const ProfilePatchSchema = ProfileInputSchema.partial();

export const SampleInputSchema = z.object({
  kind: z.enum(['sounds_like', 'not_like', 'writing_sample']),
  title: z.string().max(200).nullable().optional(),
  text: z.string().min(1).max(200000),
});

export const SamplePatchSchema = z.object({
  kind: z.enum(['sounds_like', 'not_like', 'writing_sample']).optional(),
  title: z.string().max(200).nullable().optional(),
  text: z.string().min(1).max(200000).optional(),
});

export const MemoryInputSchema = z.object({
  kind: z.enum(['preference', 'avoid_phrase', 'keep_phrase', 'style_rule', 'fact']),
  content: z.string().min(1).max(5000),
  origin: z.enum(['accepted_edit', 'owner']).optional(),
  sourceSuggestionId: z.string().nullable().optional(),
  weight: z.number().int().min(1).max(10).optional(),
});
export const MemoryPatchSchema = z.object({
  content: z.string().min(1).max(5000).optional(),
  active: z.boolean().optional(),
  weight: z.number().int().min(1).max(10).optional(),
});

export interface Profile {
  id: string;
  sourceKey: string | null;
  penName: string;
  legalName: string | null;
  imprintName: string | null;
  isRealPerson: boolean;
  illustrativeLineDefault: boolean;
  location: string | null;
  language: string;
  bioThirdPerson: string;
  bioHash: string;
  shortBio: string | null;
  credentials: string[];
  links: z.infer<typeof LinkSchema>[];
  voice: Record<string, unknown>;
  brand: Record<string, unknown>;
  templates: Record<string, unknown>;
  publishing: Record<string, unknown>;
  models: Record<string, unknown>;
  defaultBookTypeId: string | null;
  status: string;
  archivedAt: number | null;
  createdAt: number;
  updatedAt: number;
  /** Whether the owner has confirmed the bio. Seeded profiles keep their config status. */
  bioStatus: BioStatus;
}

function toProfile(r: AuthorProfilesTable): Profile {
  return {
    id: r.id,
    sourceKey: r.sourceKey,
    penName: r.penName,
    legalName: r.legalName,
    imprintName: r.imprintName,
    isRealPerson: bool(r.isRealPerson),
    illustrativeLineDefault: bool(r.illustrativeLineDefault),
    location: r.location,
    language: r.language,
    bioThirdPerson: r.bioThirdPerson,
    bioHash: r.bioHash,
    shortBio: r.shortBio,
    credentials: fromJson(z.array(z.string()), r.credentials, []),
    links: fromJson(z.array(LinkSchema), r.links, []),
    voice: fromJson(Obj, r.voice, {}),
    brand: fromJson(Obj, r.brand, {}),
    templates: fromJson(Obj, r.templates, {}),
    publishing: fromJson(Obj, r.publishing, {}),
    models: fromJson(Obj, r.models, {}),
    defaultBookTypeId: r.defaultBookTypeId,
    status: r.status,
    archivedAt: r.archivedAt === null ? null : Number(r.archivedAt),
    createdAt: Number(r.createdAt),
    updatedAt: Number(r.updatedAt),
    bioStatus: r.bioStatus === 'to_confirm' ? 'to_confirm' : 'confirmed',
  };
}

export interface Sample {
  id: string;
  profileId: string;
  kind: string;
  title: string | null;
  text: string;
  wordCount: number;
  createdAt: number;
}

function toSample(r: ProfileSamplesTable): Sample {
  return { id: r.id, profileId: r.profileId, kind: r.kind, title: r.title, text: r.text, wordCount: r.wordCount, createdAt: Number(r.createdAt) };
}

export interface MemoryItem {
  id: string;
  profileId: string;
  kind: string;
  content: string;
  origin: string;
  sourceSuggestionId: string | null;
  weight: number;
  active: boolean;
  createdAt: number;
}

function toMemory(r: ProfileMemoryTable): MemoryItem {
  return {
    id: r.id,
    profileId: r.profileId,
    kind: r.kind,
    content: r.content,
    origin: r.origin,
    sourceSuggestionId: r.sourceSuggestionId,
    weight: r.weight,
    active: bool(r.active),
    createdAt: Number(r.createdAt),
  };
}

export class ProfilesRepo {
  constructor(private readonly db: Db) {}

  async list(ctx: RequestCtx, opts: { includeArchived?: boolean; status?: string } = {}): Promise<(Profile & { bookCount: number })[]> {
    let q = this.db.selectFrom('authorProfiles').selectAll().where('workspaceId', '=', ctx.workspaceId);
    if (opts.status) q = q.where('status', '=', opts.status);
    else if (!opts.includeArchived) q = q.where('status', '=', 'active');
    const rows = await q.orderBy('penName').execute();
    const counts = await this.db
      .selectFrom('projects')
      .select(['profileId', (eb) => eb.fn.countAll<number>().as('n')])
      .where('workspaceId', '=', ctx.workspaceId)
      .where('status', '!=', 'archived')
      .groupBy('profileId')
      .execute();
    const byId = new Map(counts.map((c) => [c.profileId, Number(c.n)]));
    return rows.map((r) => ({ ...toProfile(r), bookCount: byId.get(r.id) ?? 0 }));
  }

  async get(ctx: RequestCtx, id: string): Promise<Profile | null> {
    const r = await this.db.selectFrom('authorProfiles').selectAll().where('id', '=', id).where('workspaceId', '=', ctx.workspaceId).executeTakeFirst();
    return r ? toProfile(r) : null;
  }

  async require(ctx: RequestCtx, id: string): Promise<Profile> {
    const p = await this.get(ctx, id);
    if (!p) throw notFound('Profile');
    return p;
  }

  async findBySourceKey(ctx: RequestCtx, sourceKey: string): Promise<Profile | null> {
    const r = await this.db
      .selectFrom('authorProfiles')
      .selectAll()
      .where('workspaceId', '=', ctx.workspaceId)
      .where('sourceKey', '=', sourceKey)
      .executeTakeFirst();
    return r ? toProfile(r) : null;
  }

  async create(ctx: RequestCtx, input: ProfileInput, sourceKey: string | null = null): Promise<Profile> {
    const t = now();
    const id = newId();
    const bio = input.bioThirdPerson ?? '';
    await this.db
      .insertInto('authorProfiles')
      .values({
        id,
        workspaceId: ctx.workspaceId,
        sourceKey,
        penName: input.penName,
        legalName: input.legalName ?? null,
        imprintName: input.imprintName ?? null,
        isRealPerson: flag(input.isRealPerson),
        illustrativeLineDefault: flag(input.illustrativeLineDefault ?? input.isRealPerson),
        location: input.location ?? null,
        language: input.language ?? 'en-GB',
        bioThirdPerson: bio,
        bioHash: sha256Hex(bio),
        shortBio: input.shortBio ?? null,
        credentials: toJson(input.credentials ?? []),
        links: toJson(input.links ?? []),
        voice: toJson(input.voice ?? {}),
        brand: toJson(input.brand ?? {}),
        templates: toJson(input.templates ?? {}),
        publishing: toJson(input.publishing ?? {}),
        models: toJson(input.models ?? {}),
        defaultBookTypeId: input.defaultBookTypeId ?? null,
        bioStatus: input.bioStatus ?? 'confirmed',
        status: 'active',
        archivedAt: null,
        createdAt: t,
        updatedAt: t,
      })
      .execute();
    return this.require(ctx, id);
  }

  async update(ctx: RequestCtx, id: string, patch: z.infer<typeof ProfilePatchSchema>): Promise<Profile> {
    await this.require(ctx, id);
    const set: Partial<AuthorProfilesTable> = { updatedAt: now() };
    if (patch.penName !== undefined) set.penName = patch.penName;
    if (patch.legalName !== undefined) set.legalName = patch.legalName;
    if (patch.imprintName !== undefined) set.imprintName = patch.imprintName;
    if (patch.isRealPerson !== undefined) {
      set.isRealPerson = flag(patch.isRealPerson);
      if (patch.isRealPerson && patch.illustrativeLineDefault === undefined) set.illustrativeLineDefault = 1;
    }
    if (patch.illustrativeLineDefault !== undefined) set.illustrativeLineDefault = flag(patch.illustrativeLineDefault);
    if (patch.location !== undefined) set.location = patch.location;
    if (patch.language !== undefined) set.language = patch.language;
    if (patch.bioThirdPerson !== undefined) {
      set.bioThirdPerson = patch.bioThirdPerson;
      set.bioHash = sha256Hex(patch.bioThirdPerson);
    }
    if (patch.shortBio !== undefined) set.shortBio = patch.shortBio;
    if (patch.credentials !== undefined) set.credentials = toJson(patch.credentials);
    if (patch.links !== undefined) set.links = toJson(patch.links);
    if (patch.voice !== undefined) set.voice = toJson(patch.voice);
    if (patch.brand !== undefined) set.brand = toJson(patch.brand);
    if (patch.templates !== undefined) set.templates = toJson(patch.templates);
    if (patch.publishing !== undefined) set.publishing = toJson(patch.publishing);
    if (patch.models !== undefined) set.models = toJson(patch.models);
    if (patch.defaultBookTypeId !== undefined) set.defaultBookTypeId = patch.defaultBookTypeId;
    if (patch.bioStatus !== undefined) set.bioStatus = patch.bioStatus;
    await this.db.updateTable('authorProfiles').set(set).where('id', '=', id).where('workspaceId', '=', ctx.workspaceId).execute();
    return this.require(ctx, id);
  }

  async setStatus(ctx: RequestCtx, id: string, status: 'active' | 'archived'): Promise<Profile> {
    await this.require(ctx, id);
    const t = now();
    await this.db
      .updateTable('authorProfiles')
      .set({ status, archivedAt: status === 'archived' ? t : null, updatedAt: t })
      .where('id', '=', id)
      .where('workspaceId', '=', ctx.workspaceId)
      .execute();
    return this.require(ctx, id);
  }

  /** Deletes an archived profile with no books after the owner typed its exact name. Samples and memory go with it. */
  async deleteArchived(ctx: RequestCtx, id: string, confirm: string): Promise<void> {
    const p = await this.require(ctx, id);
    if (p.status !== 'archived') throw new AppError('invalid_state', 'Archive this profile before deleting it.');
    if (confirm.trim() !== p.penName.trim()) throw new AppError('invalid_state', `Type the exact name (${p.penName}) to delete this profile.`);
    const book = await this.db.selectFrom('projects').select('id').where('workspaceId', '=', ctx.workspaceId).where('profileId', '=', id).executeTakeFirst();
    if (book) throw new AppError('invalid_state', 'This profile still has books (archived ones count). Delete or move them first.');
    await this.db.transaction().execute(async (trx) => {
      const w = ctx.workspaceId;
      await trx.deleteFrom('authorProfiles').where('id', '=', id).where('workspaceId', '=', w).execute();
      await trx.deleteFrom('assets').where('profileId', '=', id).where('workspaceId', '=', w).execute();
      await trx
        .deleteFrom('settings')
        .where('workspaceId', '=', w)
        .where('settingKey', '=', 'default_profile_id')
        .where('value', '=', JSON.stringify(id))
        .execute();
    });
  }

  // ---- samples ----

  async listSamples(ctx: RequestCtx, profileId: string): Promise<Sample[]> {
    await this.require(ctx, profileId);
    const rows = await this.db
      .selectFrom('profileSamples')
      .selectAll()
      .where('workspaceId', '=', ctx.workspaceId)
      .where('profileId', '=', profileId)
      .orderBy('id')
      .execute();
    return rows.map(toSample);
  }

  async addSample(ctx: RequestCtx, profileId: string, input: z.infer<typeof SampleInputSchema>): Promise<Sample> {
    await this.require(ctx, profileId);
    const t = now();
    const id = newId();
    await this.db
      .insertInto('profileSamples')
      .values({
        id,
        workspaceId: ctx.workspaceId,
        profileId,
        kind: input.kind,
        title: input.title ?? null,
        text: input.text,
        wordCount: wordCount(input.text),
        createdAt: t,
        updatedAt: t,
      })
      .execute();
    const row = await this.db
      .selectFrom('profileSamples')
      .selectAll()
      .where('id', '=', id)
      .where('workspaceId', '=', ctx.workspaceId)
      .executeTakeFirstOrThrow();
    return toSample(row);
  }

  async updateSample(ctx: RequestCtx, profileId: string, sampleId: string, patch: z.infer<typeof SamplePatchSchema>): Promise<Sample> {
    const set: Partial<ProfileSamplesTable> = { updatedAt: now() };
    if (patch.kind !== undefined) set.kind = patch.kind;
    if (patch.title !== undefined) set.title = patch.title;
    if (patch.text !== undefined) {
      set.text = patch.text;
      set.wordCount = wordCount(patch.text);
    }
    const res = await this.db
      .updateTable('profileSamples')
      .set(set)
      .where('id', '=', sampleId)
      .where('profileId', '=', profileId)
      .where('workspaceId', '=', ctx.workspaceId)
      .executeTakeFirst();
    if (Number(res.numUpdatedRows) === 0) throw notFound('Sample');
    return toSample(
      await this.db.selectFrom('profileSamples').selectAll().where('id', '=', sampleId).where('workspaceId', '=', ctx.workspaceId).executeTakeFirstOrThrow(),
    );
  }

  async deleteSample(ctx: RequestCtx, profileId: string, sampleId: string): Promise<void> {
    const res = await this.db
      .deleteFrom('profileSamples')
      .where('id', '=', sampleId)
      .where('profileId', '=', profileId)
      .where('workspaceId', '=', ctx.workspaceId)
      .executeTakeFirst();
    if (Number(res.numDeletedRows) === 0) throw notFound('Sample');
  }

  // ---- memory ----

  async listMemory(ctx: RequestCtx, profileId: string, opts: { activeOnly?: boolean } = {}): Promise<MemoryItem[]> {
    await this.require(ctx, profileId);
    let q = this.db.selectFrom('profileMemory').selectAll().where('workspaceId', '=', ctx.workspaceId).where('profileId', '=', profileId);
    if (opts.activeOnly) q = q.where('active', '=', 1);
    return (await q.orderBy('id').execute()).map(toMemory);
  }

  async addMemory(ctx: RequestCtx, profileId: string, input: z.infer<typeof MemoryInputSchema>): Promise<MemoryItem> {
    await this.require(ctx, profileId);
    const t = now();
    const id = newId();
    await this.db
      .insertInto('profileMemory')
      .values({
        id,
        workspaceId: ctx.workspaceId,
        profileId,
        kind: input.kind,
        content: input.content,
        origin: input.origin ?? 'owner',
        sourceSuggestionId: input.sourceSuggestionId ?? null,
        weight: input.weight ?? 1,
        active: 1,
        createdAt: t,
        updatedAt: t,
      })
      .execute();
    return toMemory(
      await this.db.selectFrom('profileMemory').selectAll().where('id', '=', id).where('workspaceId', '=', ctx.workspaceId).executeTakeFirstOrThrow(),
    );
  }

  async deleteMemory(ctx: RequestCtx, profileId: string, memoryId: string): Promise<void> {
    const res = await this.db
      .deleteFrom('profileMemory')
      .where('id', '=', memoryId)
      .where('profileId', '=', profileId)
      .where('workspaceId', '=', ctx.workspaceId)
      .executeTakeFirst();
    if (Number(res.numDeletedRows) === 0) throw notFound('Memory item');
  }

  async updateMemory(ctx: RequestCtx, profileId: string, memoryId: string, patch: z.infer<typeof MemoryPatchSchema>): Promise<MemoryItem> {
    const set: Partial<ProfileMemoryTable> = { updatedAt: now() };
    if (patch.content !== undefined) set.content = patch.content;
    if (patch.active !== undefined) set.active = flag(patch.active);
    if (patch.weight !== undefined) set.weight = patch.weight;
    const res = await this.db
      .updateTable('profileMemory')
      .set(set)
      .where('id', '=', memoryId)
      .where('profileId', '=', profileId)
      .where('workspaceId', '=', ctx.workspaceId)
      .executeTakeFirst();
    if (Number(res.numUpdatedRows) === 0) throw notFound('Memory item');
    return toMemory(
      await this.db.selectFrom('profileMemory').selectAll().where('id', '=', memoryId).where('workspaceId', '=', ctx.workspaceId).executeTakeFirstOrThrow(),
    );
  }
}
