import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { AppServices } from '../app.js';
import { readCatalogue, readJsonFile, readModelDefaults, type CatalogueName } from '../config/catalogue.js';
import type { AiCredit } from '../ports/ai.js';
import { AppError, parse } from '../http/errors.js';
import { INSTANCE_ONLY_SETTINGS, SettingsPatchSchema, type SettingValues } from '../repos/settings.js';
import { assertInstanceOwner, isInstanceOwner } from '../auth/context.js';
import { GUEST_CAP_KEY } from '../jobs/runner.js';
import { owner } from './common.js';
import { APP_VERSION } from '../lib/version.js';

const startedAt = Date.now();
const CREDIT_TTL_MS = 5 * 60 * 1000;

/** config/house-style.json version (a number), or null when the file is missing. */
async function houseStyleVersion(configDir: string): Promise<number | null> {
  try {
    const v = ((await readJsonFile(join(configDir, 'house-style.json'))) as { version?: unknown }).version;
    return typeof v === 'number' || typeof v === 'string' ? Number(v) : null;
  } catch {
    return null;
  }
}

/** House style summary for Settings: version, how many banned phrases and US to UK spelling pairs. */
async function houseStyleInfo(
  configDir: string,
): Promise<{ version: number | null; updatedOn: string | null; bannedCount: number; spellingPairs: number } | null> {
  try {
    const h = (await readJsonFile(join(configDir, 'house-style.json'))) as Record<string, unknown>;
    const v = h['version'];
    const spelling = h['usToUkSpelling'];
    return {
      version: typeof v === 'number' || typeof v === 'string' ? Number(v) : null,
      updatedOn: typeof h['updatedOn'] === 'string' ? h['updatedOn'] : null,
      bannedCount: Array.isArray(h['bannedPhrases']) ? h['bannedPhrases'].length : 0,
      spellingPairs: spelling && typeof spelling === 'object' ? Object.keys(spelling).length : 0,
    };
  } catch {
    return null;
  }
}

/** KDP rules summary: version, when it was checked and when it is due a re-check (checked date plus recheckAfterDays, 90 by default). */
async function kdpRulesInfo(configDir: string): Promise<{ version: string; checkedAt: string | null; recheckDueAt: string | null; rules: number } | null> {
  const version = await kdpRulesVersion(configDir);
  if (!version) return null;
  try {
    const files = (await readdir(join(configDir, 'kdp-rules'))).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort();
    const k = (await readJsonFile(join(configDir, 'kdp-rules', files[files.length - 1] as string))) as Record<string, unknown>;
    const checkedAt = typeof k['verifiedOn'] === 'string' ? k['verifiedOn'] : typeof k['checkedOn'] === 'string' ? k['checkedOn'] : version;
    const days = typeof k['recheckAfterDays'] === 'number' ? k['recheckAfterDays'] : 90;
    const at = Date.parse(`${checkedAt}T00:00:00Z`);
    const recheckDueAt = Number.isNaN(at) ? null : new Date(at + days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    return { version, checkedAt, recheckDueAt, rules: Array.isArray(k['rules']) ? k['rules'].length : 0 };
  } catch {
    return { version, checkedAt: null, recheckDueAt: null, rules: 0 };
  }
}

/** The newest config/kdp-rules/<date>.json: its version field, else the file name. */
async function kdpRulesVersion(configDir: string): Promise<string | null> {
  try {
    const files = (await readdir(join(configDir, 'kdp-rules'))).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort();
    const newest = files[files.length - 1];
    if (!newest) return null;
    try {
      const v = ((await readJsonFile(join(configDir, 'kdp-rules', newest))) as { version?: unknown }).version;
      if (typeof v === 'string' && v.trim()) return v;
    } catch {
      // fall back to the file name
    }
    return newest.replace(/\.json$/, '');
  } catch {
    return null;
  }
}

export function systemRoutes(app: FastifyInstance, s: AppServices): void {
  // OpenRouter credit from the key status, cached for five minutes. Never the key itself.
  let credit: { at: number; value: AiCredit | null } | null = null;
  async function openRouterCredit(): Promise<AiCredit | null> {
    if (!s.ai.credit) return null;
    if (credit && Date.now() - credit.at < CREDIT_TTL_MS) return credit.value;
    let value: AiCredit | null;
    try {
      value = await s.ai.credit(AbortSignal.timeout(5000));
    } catch {
      value = null;
    }
    credit = { at: Date.now(), value };
    return value;
  }

  app.get('/health', async () => {
    let db = 'ok';
    try {
      await s.db.selectFrom('workspaces').select('id').limit(1).execute();
    } catch {
      db = 'error';
    }
    return {
      status: db === 'ok' ? 'ok' : 'degraded',
      version: APP_VERSION,
      uptimeS: Math.round((Date.now() - startedAt) / 1000),
      database: { client: s.dbClient, status: db },
      ai: { provider: s.ai.provider },
      exporter: { name: s.exporter.name },
    };
  });

  // ---------- settings ----------

  /** The workspace's settings; instance-only keys are left out for everyone but the instance owner. */
  async function visibleValues(req: FastifyRequest): Promise<SettingValues> {
    const values = await s.repos.settings.all(req.ctx);
    if (!isInstanceOwner(req.ctx, s.ownerCtx)) for (const key of INSTANCE_ONLY_SETTINGS) delete values[key];
    return values;
  }

  async function budgets(req: FastifyRequest) {
    const defaults = await readModelDefaults(s.config.configDir);
    const values = await s.repos.settings.all(req.ctx);
    const cfgDefault = Number(defaults.budgets?.['perBookDefaultUSD'] ?? 15);
    return {
      bookDefaultUsd: values['budget.book_default_usd'] ?? cfgDefault,
      monthlyCapUsd: values['budget.monthly_cap_usd'] ?? null,
      warnRatio: values['budget.warn_ratio'] ?? 0.8,
      monthSpendUsd: await s.repos.production.monthSpendUsd(req.ctx),
      // The cap for every other workspace on this Volume (D-047): the instance owner's to see and set; 0 means off.
      ...(isInstanceOwner(req.ctx, s.ownerCtx) ? { guestWorkspacesMonthlyCapUsd: values[GUEST_CAP_KEY] ?? 0 } : {}),
    };
  }

  app.get('/settings', async (req) => {
    return {
      // Presence only. The key value never leaves the server process.
      openRouterKey: { present: s.config.openRouterKeyPresent },
      aiProvider: s.ai.provider,
      exporter: s.exporter.name,
      database: { client: s.dbClient },
      budgets: await budgets(req),
      values: await visibleValues(req),
      // Workspace status for the Settings screen (all read only). The credit is the owner's key, so only the owner's
      // workspace sees it (D-047).
      openRouterCredit: req.ctx.workspaceId === s.ownerCtx.workspaceId ? await openRouterCredit() : null,
      // Backups hold the whole database, so only the instance owner sees their status.
      backups: isInstanceOwner(req.ctx, s.ownerCtx) ? await s.backups.status((await s.repos.settings.get(req.ctx, 'backup.enabled')) !== false) : null,
      houseStyleVersion: await houseStyleVersion(s.config.configDir),
      kdpRulesVersion: await kdpRulesVersion(s.config.configDir),
      houseStyle: await houseStyleInfo(s.config.configDir),
      kdpRules: await kdpRulesInfo(s.config.configDir),
      exportProvider: s.exporter.name === 'mock' ? 'mock' : 'volume',
    };
  });

  app.post('/settings/openrouter/test', async (req) => {
    assertInstanceOwner(req.ctx, s.ownerCtx);
    if (!s.openRouterKeyCheck) {
      return { ok: false, creditUsd: null, message: 'No OpenRouter key is set. Add OPENROUTER_API_KEY to .env and restart Volume.' };
    }
    credit = null; // the next GET /settings reads fresh credit
    try {
      const k = await s.openRouterKeyCheck(AbortSignal.timeout(10_000));
      if (!k.valid) return { ok: false, creditUsd: null, message: 'OpenRouter did not accept the key. Check OPENROUTER_API_KEY in .env.' };
      const creditUsd = k.limitRemainingUsd;
      return {
        ok: true,
        creditUsd,
        message:
          creditUsd === null
            ? 'OpenRouter accepted the key. It has no spending limit set.'
            : `OpenRouter accepted the key. $${creditUsd.toFixed(2)} left on its limit.`,
      };
    } catch (e) {
      const reason = e instanceof Error && e.name === 'TimeoutError' ? 'it did not answer in time' : 'the request failed';
      return { ok: false, creditUsd: null, message: `Could not reach OpenRouter (${reason}). Check the internet connection and try again.` };
    }
  });

  // ---------- backups ----------

  // Backups hold the whole database (every workspace), so only the owner of this Volume sees or makes them.
  app.get('/backups', async (req) => {
    assertInstanceOwner(req.ctx, s.ownerCtx);
    const enabled = (await s.repos.settings.get(req.ctx, 'backup.enabled')) !== false;
    return { items: await s.backups.list(), status: await s.backups.status(enabled) };
  });

  app.post('/backups', async (req, reply) => {
    assertInstanceOwner(req.ctx, s.ownerCtx);
    const file = await s.backups.create();
    void reply.code(201);
    return file;
  });

  app.patch('/settings', async (req) => {
    owner(req);
    const patch = parse(SettingsPatchSchema, req.body ?? {});
    if (INSTANCE_ONLY_SETTINGS.some((key) => patch[key] !== undefined)) assertInstanceOwner(req.ctx, s.ownerCtx);
    if (patch.default_profile_id) await s.repos.profiles.require(req.ctx, patch.default_profile_id);
    await s.repos.settings.set(req.ctx, patch);
    return { values: await visibleValues(req), budgets: await budgets(req) };
  });

  app.get('/settings/models', async (req) => {
    const defaults = await readModelDefaults(s.config.configDir);
    const overrides = (await s.repos.settings.get(req.ctx, 'models.overrides')) ?? {};
    const stages = Object.entries(defaults.stages).map(([stage, d]) => {
      const o = overrides[stage];
      return {
        stage,
        tier: d.tier ?? null,
        defaultModel: d.defaultModel,
        fallbacks: o?.fallbacks ?? d.fallbacks,
        override: o?.model ?? null,
        effectiveModel: o?.model ?? d.defaultModel,
        webSearch: d.webSearch === true,
      };
    });
    return { checkedOn: defaults.checkedOn ?? null, version: defaults.version ?? null, stages };
  });

  app.put('/settings/models', async (req) => {
    owner(req);
    const body = parse(
      z.object({
        stages: z.record(z.string(), z.object({ model: z.string().min(1).max(200), fallbacks: z.array(z.string().max(200)).max(10).optional() }).nullable()),
      }),
      req.body,
    );
    const defaults = await readModelDefaults(s.config.configDir);
    const current = { ...((await s.repos.settings.get(req.ctx, 'models.overrides')) ?? {}) };
    for (const [stage, v] of Object.entries(body.stages)) {
      if (!defaults.stages[stage]) throw new AppError('validation_failed', `Unknown stage ${stage}.`);
      if (v === null) delete current[stage];
      else current[stage] = v.fallbacks ? { model: v.model, fallbacks: v.fallbacks } : { model: v.model };
    }
    await s.repos.settings.set(req.ctx, { 'models.overrides': current });
    return { overrides: current };
  });

  // ---------- read-only catalogues from ROOT/config ----------

  const catalogue = (name: CatalogueName) => async () => {
    const c = await readCatalogue(s.config.configDir, name);
    return { available: c.available, source: c.source, items: c.items, meta: c.meta };
  };
  app.get('/book-types', catalogue('book-types'));
  app.get('/interior-themes', catalogue('interior-themes'));
  app.get('/cover-styles', catalogue('cover-styles'));
}
