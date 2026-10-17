import { z } from 'zod';
import type { RequestCtx } from '../auth/context.js';
import type { Db } from '../db/connect.js';
import { fromJson, newId, now, toJson } from '../lib/util.js';
import { TRIMS } from './books.js';

/** Known keys and their value shapes. The API key is never stored here. */
export const SETTING_SCHEMAS = {
  'budget.book_default_usd': z.number().min(0).max(10000),
  /** null clears the cap. */
  'budget.monthly_cap_usd': z.number().min(0).max(100000).nullable(),
  'budget.warn_ratio': z.number().min(0).max(1),
  /**
   * Instance owner only, stored on the instance owner's workspace (D-047): the monthly AI cap in USD for each other
   * workspace, which spends the instance owner's OpenRouter key. 0 (the default) refuses their AI runs.
   */
  'budget.guest_workspaces_monthly_cap_usd': z.number().min(0).max(100000),
  'backup.enabled': z.boolean(),
  'backup.time': z.string().regex(/^\d{2}:\d{2}$/),
  'links.check_enabled': z.boolean(),
  'ui.theme': z.enum(['light', 'dark', 'system']),
  default_profile_id: z.string().nullable(),
  /** Defaults for new books; a field the request gives wins, then the pen name's book type, then these. */
  'book.defaults': z
    .object({
      bookTypeId: z.string().max(200).nullable().optional(),
      trim: z.enum(TRIMS).optional(),
      paper: z.enum(['white', 'cream']).optional(),
      interiorThemeId: z.string().max(200).nullable().optional(),
      coverStyleId: z.string().max(200).nullable().optional(),
      wordTarget: z.number().int().min(0).max(1000000).nullable().optional(),
      chapterCount: z.number().int().min(1).max(100).nullable().optional(),
    })
    .strict(),
  'models.overrides': z.record(z.string(), z.object({ model: z.string().min(1), fallbacks: z.array(z.string()).optional() })),
} as const;

export type SettingKey = keyof typeof SETTING_SCHEMAS;

/** Keys only the instance owner reads or changes; they mean nothing on any other workspace. */
export const INSTANCE_ONLY_SETTINGS: readonly SettingKey[] = ['budget.guest_workspaces_monthly_cap_usd'];
export type SettingValues = { [K in SettingKey]?: z.infer<(typeof SETTING_SCHEMAS)[K]> };

export const SettingsPatchSchema = z
  .object(
    Object.fromEntries(Object.entries(SETTING_SCHEMAS).map(([k, s]) => [k, s.optional()])) as { [K in SettingKey]: z.ZodOptional<(typeof SETTING_SCHEMAS)[K]> },
  )
  .strict();

export class SettingsRepo {
  constructor(private readonly db: Db) {}

  async all(ctx: RequestCtx): Promise<SettingValues> {
    const rows = await this.db.selectFrom('settings').select(['settingKey', 'value']).where('workspaceId', '=', ctx.workspaceId).execute();
    const out: Record<string, unknown> = {};
    for (const r of rows) {
      const schema = SETTING_SCHEMAS[r.settingKey as SettingKey];
      if (!schema) continue;
      const v = fromJson(schema as z.ZodType, r.value, undefined);
      if (v !== undefined) out[r.settingKey] = v;
    }
    return out;
  }

  async get<K extends SettingKey>(ctx: RequestCtx, key: K): Promise<SettingValues[K] | undefined> {
    const all = await this.all(ctx);
    return all[key];
  }

  async set(ctx: RequestCtx, patch: { [K in SettingKey]?: SettingValues[K] | undefined }): Promise<SettingValues> {
    const t = now();
    for (const [key, value] of Object.entries(patch)) {
      if (value === undefined) continue;
      const existing = await this.db
        .selectFrom('settings')
        .select(['id'])
        .where('workspaceId', '=', ctx.workspaceId)
        .where('settingKey', '=', key)
        .executeTakeFirst();
      if (existing) {
        await this.db
          .updateTable('settings')
          .set({ value: toJson(value), updatedAt: t })
          .where('id', '=', existing.id)
          .where('workspaceId', '=', ctx.workspaceId)
          .execute();
      } else {
        await this.db
          .insertInto('settings')
          .values({ id: newId(), workspaceId: ctx.workspaceId, settingKey: key, value: toJson(value), createdAt: t, updatedAt: t })
          .execute();
      }
    }
    return this.all(ctx);
  }
}
