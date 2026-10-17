import rateLimit from '@fastify/rate-limit';
import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify';
import { MockAiAdapter } from './adapters/mock-ai.js';
import { MockExportAdapter } from './adapters/mock-export.js';
import { ensureOwner, StubAuthProvider, type AuthProvider, type RequestCtx } from './auth/context.js';
import { BackupService } from './backups/backup.js';
import type { AppConfig } from './config/env.js';
import type { Db, DbHandle } from './db/connect.js';
import { BlobStore, DEFAULT_CHUNK_BYTES } from './files/blob-store.js';
import { AppError, errorBody, registerErrorHandling } from './http/errors.js';
import { applySecurityHeaders, clientIp, isApiPath, isPublicHealth, PUBLIC_HEALTH_PATH, registerWebApp, sendSpaIndex } from './http/hosting.js';
import { defaultHandlers } from './jobs/handlers/index.js';
import { JobQueue } from './jobs/queue.js';
import { JobRunner, type HandlerMap, type JobServices, type RunnerOptions } from './jobs/runner.js';
import type { AiPort } from './ports/ai.js';
import type { ExportPort } from './ports/export.js';
import { createRepos } from './repos/index.js';
import { createTextChecker } from './jobs/guardrails.js';
import { registerRoutes } from './routes/index.js';
import { EventBus } from './sse/bus.js';

declare module 'fastify' {
  interface FastifyRequest {
    ctx: RequestCtx;
  }
}

export interface AppServices extends JobServices {
  config: AppConfig;
  runner: JobRunner;
  ownerCtx: RequestCtx;
  dbClient: 'sqlite' | 'mysql';
  backups: BackupService;
  /** Checks the OpenRouter key with OpenRouter's key status (null when no key is set). Never returns the key. */
  openRouterKeyCheck: OpenRouterKeyCheck | null;
}

/** OpenRouter's key status, as much as Settings needs. */
export type OpenRouterKeyCheck = (signal: AbortSignal) => Promise<{ valid: boolean; limitRemainingUsd: number | null }>;

export interface BuildAppOptions {
  config: AppConfig;
  handle: DbHandle;
  ai?: AiPort;
  exporter?: ExportPort;
  /** Who is calling. AUTH_MODE=local uses the stub; AUTH_MODE=clerk must pass the Clerk provider (index.ts does). */
  auth?: (owner: RequestCtx, db: Db) => AuthProvider;
  handlers?: HandlerMap;
  runner?: RunnerOptions;
  /** Start the polling job runner (default: config.jobsEnabled). Tests drive it by hand. */
  startJobs?: boolean;
  logger?: NonNullable<FastifyServerOptions['logger']>;
  chunkBytes?: number;
  /** Run the nightly SQLite backup while the app runs (default: the same as startJobs). */
  nightlyBackups?: boolean;
  /** POST /settings/openrouter/test uses this (index.ts builds it from the key; tests pass a fake). */
  openRouterKeyCheck?: OpenRouterKeyCheck | null;
}

/** Header names that must never reach the log. */
const REDACT = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["x-api-key"]',
  'headers.authorization',
  '*.password',
  '*.apiKey',
  '*.OPENROUTER_API_KEY',
];

export function defaultLogger(config: AppConfig): NonNullable<FastifyServerOptions['logger']> {
  if (config.logLevel === 'silent') return false;
  return { level: config.logLevel, redact: { paths: REDACT, censor: '[redacted]' } };
}

export async function buildApp(opts: BuildAppOptions): Promise<{ app: FastifyInstance; services: AppServices }> {
  const { config, handle } = opts;
  const app = Fastify({
    logger: opts.logger ?? defaultLogger(config),
    bodyLimit: config.maxJsonBytes,
    // Behind Passenger and Cloudflare (TRUST_PROXY, on in production) the visitor's IP and protocol come from proxy headers.
    trustProxy: config.trustProxy,
  });

  const db = handle.db;
  const repos = createRepos(db);
  // Every saved version stores the guardrail report for its own text (owner edits, replace and restore included).
  repos.manuscript.setTextChecker(createTextChecker(repos, config.configDir));
  const bus = new EventBus(db);
  const queue = new JobQueue(db, bus);
  const blobs = new BlobStore(db, opts.chunkBytes ?? DEFAULT_CHUNK_BYTES);
  const ownerCtx = await ensureOwner(db);
  // Stage changes go to the event bus, so the Library live panel (GET /activity) and SSE listeners see them.
  repos.books.onStageChange(async (ctx, projectId, from, to) => {
    await bus.publish(ctx.workspaceId, { projectId, type: 'book.updated', data: { projectId, part: 'stage', stage: to, from } });
  });
  // A writing child that failed or was never started must not leave its section showing as queued or writing.
  queue.onJobEndedBadly(async (job) => {
    const sectionId = job.kind === 'write_section' ? job.payload['sectionId'] : null;
    if (typeof sectionId !== 'string') return;
    const ctx: RequestCtx = { workspaceId: job.workspaceId, userId: 'system', role: 'owner' };
    await repos.manuscript
      .getSection(ctx, sectionId)
      .then(async (sec) => {
        if (!sec || !['queued', 'writing', 'checking'].includes(sec.status)) return;
        await repos.manuscript.setSectionStatus(ctx, sectionId, sec.currentVersionId ? 'done' : 'empty');
      })
      .catch(() => undefined);
  });
  const jobServices: JobServices = {
    db,
    repos,
    queue,
    bus,
    blobs,
    ai: opts.ai ?? new MockAiAdapter(),
    exporter: opts.exporter ?? new MockExportAdapter(),
    configDir: config.configDir,
    instanceWorkspaceId: ownerCtx.workspaceId,
  };
  const runnerOpts: RunnerOptions = { ...opts.runner, log: app.log };
  const runner = new JobRunner(jobServices, opts.handlers ?? defaultHandlers, runnerOpts);
  const backups = new BackupService(db, handle.dialect, config.dataDir);
  const services: AppServices = {
    ...jobServices,
    config,
    runner,
    ownerCtx,
    dbClient: handle.dialect,
    backups,
    openRouterKeyCheck: opts.openRouterKeyCheck ?? null,
  };
  if (config.authMode === 'clerk' && !opts.auth) throw new Error('AUTH_MODE=clerk needs the Clerk auth provider.');
  const auth = opts.auth ? opts.auth(ownerCtx, db) : new StubAuthProvider(ownerCtx);

  // JSON only. The default text/plain parser is removed so simple cross-site form posts cannot reach handlers.
  app.removeContentTypeParser('text/plain');

  app.decorateRequest('ctx', null as unknown as RequestCtx);

  // Rate limit per visitor IP, before anything else runs: reads, writes (the expensive AI, export and import starts)
  // and the public health check each have their own allowance per minute.
  await app.register(rateLimit, {
    global: true,
    timeWindow: 60_000,
    keyGenerator: (req) => clientIp(req, config.trustProxy),
    max: (req) => {
      if (isPublicHealth(req.url)) return config.rateLimit.healthMax;
      const m = req.method.toUpperCase();
      return m === 'GET' || m === 'HEAD' || m === 'OPTIONS' ? config.rateLimit.max : config.rateLimit.writeMax;
    },
  });

  // Host (DNS rebinding) and Origin (CSRF) guards, then sign-in for /api (the public health check excepted).
  app.addHook('onRequest', async (req, reply) => {
    const host = (req.headers.host ?? '').toLowerCase();
    if (!config.allowedHosts.includes(host)) {
      return reply.code(421).send(errorBody('bad_host', 'This server does not answer for that address.'));
    }
    const method = req.method.toUpperCase();
    if (method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS') {
      const origin = req.headers.origin;
      if (origin !== undefined && !config.allowedOrigins.includes(origin.toLowerCase())) {
        return reply.code(403).send(errorBody('bad_origin', 'Requests from this page are not allowed.'));
      }
    }
    // The web app's pages and files are public (the sign-in screen is part of them); its data is not.
    if (!isApiPath(req.url) || isPublicHealth(req.url)) return undefined;
    const ctx = await auth.resolve(req);
    if (!ctx) return reply.code(401).send(errorBody('unauthorized', 'Sign in to continue.'));
    req.ctx = ctx;
    return undefined;
  });

  const pageCsp = await registerWebApp(app, config);

  app.addHook('onSend', async (req, reply, payload) => {
    applySecurityHeaders(req, reply, config, pageCsp);
    // CORS is off: no Access-Control-Allow-Origin header is ever sent.
    return payload;
  });

  // Keep-alive and uptime check (cron, Passenger warm-up). Public, so it says nothing beyond up or down.
  app.get(PUBLIC_HEALTH_PATH, async (_req, reply) => {
    try {
      await db.selectFrom('workspaces').select('id').limit(1).execute();
      return { status: 'ok' };
    } catch {
      return reply.code(503).send({ status: 'unavailable' });
    }
  });

  registerErrorHandling(app, pageCsp ? (req, reply) => sendSpaIndex(req, reply, config) : undefined);
  await app.register((api) => Promise.resolve(registerRoutes(api, services)), { prefix: '/api/v1' });

  app.addHook('onClose', async () => {
    backups.stop();
    await runner.stop();
    // The real exporter holds one shared Chromium; it is released here.
    await jobServices.exporter.close?.();
  });

  if (opts.startJobs ?? config.jobsEnabled) await runner.start();
  if (opts.nightlyBackups ?? opts.startJobs ?? config.jobsEnabled) {
    backups.startNightly(repos.settings, ownerCtx, {
      log: (msg, err) =>
        err ? app.log.warn({ err: { message: err instanceof Error ? err.message : typeof err === 'string' ? err : 'Unknown error' } }, msg) : app.log.info(msg),
    });
  }
  return { app, services };
}

export { AppError };
