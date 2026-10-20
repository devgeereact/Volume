import type { FastifyBaseLogger } from 'fastify';
import { z } from 'zod';
import type { RequestCtx } from '../auth/context.js';
import { readModelDefaults } from '../config/catalogue.js';
import type { Db } from '../db/connect.js';
import type { BlobStore } from '../files/blob-store.js';
import { AppError } from '../http/errors.js';
import { sleep } from '../lib/util.js';
import {
  AI_OUTPUT_SCHEMAS,
  partialUsageOf,
  AiModelUnavailableError,
  AiRetryableError,
  type AiImageEstimate,
  type AiImageResult,
  type AiPort,
  type AiStage,
  type AiStageInput,
  type AiStageResult,
  type GenerateImageOptions,
  type RunStageOptions,
} from '../ports/ai.js';
import type { ExportPort } from '../ports/export.js';
import type { Repos } from '../repos/index.js';
import type { EventBus, EventType } from '../sse/bus.js';
import { BudgetPaused, JobCancelled, JobFailed, JobPaused } from './errors.js';
import { JobQueue, type ClaimedJob, type EnqueueInput, type Job, type JobKind } from './queue.js';

/** Setting on the instance owner's workspace: the monthly AI cap for every other workspace (D-047). */
export const GUEST_CAP_KEY = 'budget.guest_workspaces_monthly_cap_usd';

/** Budget check for one cover image. A 2K image on the default model cost $0.039 live (5 October 2026); this leaves room for the pro fallback. */
export const IMAGE_HIGH_ESTIMATE_USD = 0.2;

/**
 * What one picture reserves against the budget: the priced estimate the picture-book estimate route shows (request
 * price, else image output price times the tokens one image uses at the configured resolution, dearest of the model
 * and its fallbacks), never below IMAGE_HIGH_ESTIMATE_USD. With no price listed it is that floor. Listed prices can pass
 * the floor (about $0.24 at 4K), so a flat floor alone could let spend pass the budget.
 */
export async function imageReservationUsd(ai: AiPort, model: string | null): Promise<number> {
  let priced: AiImageEstimate | null;
  try {
    priced = ai.estimateImage ? await ai.estimateImage(model ? { model } : {}) : null;
  } catch {
    priced = null; // no price known: the floor applies
  }
  const high = priced && priced.priced && Number.isFinite(priced.highUsd) ? priced.highUsd : 0;
  return Math.max(IMAGE_HIGH_ESTIMATE_USD, high);
}

export interface JobServices {
  db: Db;
  repos: Repos;
  queue: JobQueue;
  bus: EventBus;
  blobs: BlobStore;
  ai: AiPort;
  exporter: ExportPort;
  configDir: string;
  /**
   * The instance owner's workspace (D-047). Every other workspace spends the instance owner's OpenRouter key, so its
   * AI and image calls are held to budget.guest_workspaces_monthly_cap_usd, set on this workspace by its owner.
   */
  instanceWorkspaceId: string;
}

export type JobOutcome = { status?: 'succeeded' | 'needs_attention'; result?: unknown; waitForChildren?: false } | { waitForChildren: true; result?: unknown };

export interface JobContext {
  job: ClaimedJob;
  ctx: RequestCtx;
  signal: AbortSignal;
  services: JobServices;
  payload: Record<string, unknown>;
  progress(p: number, message?: string): Promise<void>;
  emit(type: EventType, data: unknown): Promise<void>;
  emitEphemeral(type: EventType, data: unknown): void;
  /** Throws JobCancelled or JobPaused when the owner asked for it. Call between steps. */
  checkpoint(): Promise<void>;
  enqueueChild(input: Omit<EnqueueInput, 'parentId'>): Promise<Job>;
  /** Budget check, model choice, call, output validation, prompt_runs row and cost update. */
  runAi<S extends AiStage>(
    stage: S,
    input: AiStageInput,
    opts?: Omit<RunStageOptions, 'signal' | 'model'>,
  ): Promise<AiStageResult<S> & { promptRunId: string }>;
  runImage(prompt: string, opts?: Omit<GenerateImageOptions, 'signal' | 'model'>): Promise<AiImageResult & { promptRunId: string }>;
}

export type JobHandler = (jc: JobContext) => Promise<JobOutcome>;
export type HandlerMap = Partial<Record<JobKind, JobHandler>>;

/** Concurrency lanes (docs: 2 AI jobs at once, 1 export job). */
const LANES: { name: string; max: number; kinds: JobKind[] }[] = [
  {
    name: 'ai',
    max: 2,
    kinds: [
      'research',
      'titles',
      'blueprint',
      'blueprint_part',
      'write_section',
      'weave_notes',
      'edit_pass',
      'cover_concepts',
      'marketing',
      'listing',
      'rewrite_selection',
      'claim_fix',
      'picture_story',
      'picture_characters',
      'spread_image',
    ],
  },
  { name: 'export', max: 1, kinds: ['export_pack', 'cover_build', 'picture_export'] },
  { name: 'control', max: 2, kinds: ['write_book', 'batch_run', 'batch_book', 'picture_book', 'noop'] },
];

/** Config stage key used to pick the model for each AI stage. */
const STAGE_TO_CONFIG: Record<AiStage, string> = {
  research: 'research',
  titles: 'titles',
  blueprint: 'blueprint',
  blueprint_part: 'blueprint',
  writing: 'writing',
  summarise: 'summarise',
  checks: 'checks',
  editing: 'editing',
  weave: 'writing',
  matter_metadata: 'matter_metadata',
  cover_brief: 'cover_brief',
  marketing: 'marketing',
  // config/models.defaults.json lists children.picture-book-story under writing and the two prompt stages under cover_brief.
  picture_story: 'writing',
  scene_prompts: 'cover_brief',
  character_reference: 'cover_brief',
  claim_fix: 'editing',
};

const ModelChoice = z.union([z.string().min(1), z.object({ model: z.string().min(1) })]);

function pickModel(source: Record<string, unknown> | undefined, key: string): string | null {
  const v = source?.[key];
  const parsed = ModelChoice.safeParse(v);
  if (!parsed.success) return null;
  return typeof parsed.data === 'string' ? parsed.data : parsed.data.model;
}

export interface RunnerOptions {
  pollMs?: number;
  heartbeatMs?: number;
  staleMs?: number;
  log?: FastifyBaseLogger;
}

export class JobRunner {
  private budgetChecks: Promise<void> = Promise.resolve();
  private readonly reservations = new Map<string, { workspaceId: string; projectId: string | null; usd: number }>();
  private timer: NodeJS.Timeout | null = null;
  private lastRecover = 0;
  private readonly running = new Map<string, { abort: AbortController; done: Promise<void>; lane: string }>();
  private stopped = true;
  private ticking = false;
  private readonly pollMs: number;
  private readonly heartbeatMs: number;
  private readonly staleMs: number;

  constructor(
    private readonly services: JobServices,
    private readonly handlers: HandlerMap,
    private readonly opts: RunnerOptions = {},
  ) {
    this.pollMs = opts.pollMs ?? 500;
    this.heartbeatMs = opts.heartbeatMs ?? 15000;
    this.staleMs = opts.staleMs ?? 60000;
  }

  /** Recovers jobs left running by a crash, then polls. */
  async start(): Promise<void> {
    this.stopped = false;
    const recovered = await this.services.queue.recoverStale(this.staleMs);
    if (recovered > 0) this.opts.log?.info({ recovered }, 'jobs re-queued after restart');
    this.services.queue.onEnqueue(() => void this.tick());
    this.timer = setInterval(() => void this.tick(), this.pollMs);
    this.timer.unref();
    void this.tick();
  }

  async stop(): Promise<void> {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    // Running jobs are left 'running'; after restart their stale heartbeat re-queues them.
    for (const r of this.running.values()) r.abort.abort(new Error('server stopping'));
    await Promise.allSettled([...this.running.values()].map((r) => r.done));
  }

  private laneCount(name: string): number {
    let n = 0;
    for (const r of this.running.values()) if (r.lane === name) n += 1;
    return n;
  }

  async tick(): Promise<void> {
    if (this.stopped || this.ticking) return;
    this.ticking = true;
    try {
      if (Date.now() - this.lastRecover > this.heartbeatMs) {
        this.lastRecover = Date.now();
        await this.services.queue.recoverStale(this.staleMs);
      }
      for (const lane of LANES) {
        while (this.laneCount(lane.name) < lane.max) {
          const job = await this.services.queue.claim(lane.kinds.filter((k) => this.handlers[k]));
          if (!job) break;
          this.launch(job, lane.name);
        }
      }
    } catch (err) {
      this.opts.log?.error({ err: { message: (err as Error).message } }, 'job runner tick failed');
    } finally {
      this.ticking = false;
    }
  }

  private launch(job: ClaimedJob, lane: string): void {
    const abort = new AbortController();
    const done = this.execute(job, abort).finally(() => {
      this.running.delete(job.id);
      if (!this.stopped) void this.tick();
    });
    this.running.set(job.id, { abort, done, lane });
  }

  /** Test helper: claims and runs jobs one at a time until nothing is ready. */
  async runUntilIdle(maxJobs = 500): Promise<number> {
    let count = 0;
    const kinds = LANES.flatMap((l) => l.kinds).filter((k) => this.handlers[k]);
    for (; count < maxJobs; count += 1) {
      const job = await this.services.queue.claim(kinds);
      if (!job) break;
      await this.execute(job, new AbortController());
    }
    return count;
  }

  private async execute(job: ClaimedJob, abort: AbortController): Promise<void> {
    const { queue, bus } = this.services;
    const ctx: RequestCtx = { workspaceId: job.workspaceId, userId: 'system', role: 'owner' };
    let pauseRequested = false;

    const heartbeat = setInterval(() => {
      void queue
        .heartbeat(job.id, job.lockToken)
        .then((flags) => {
          if (!flags) abort.abort(new Error('lock lost'));
          else if (flags.cancelRequested) abort.abort(new JobCancelled());
          else if (flags.pauseRequested) pauseRequested = true;
        })
        .catch(() => undefined);
    }, this.heartbeatMs);
    heartbeat.unref();

    const checkpoint = async (): Promise<void> => {
      if (abort.signal.aborted) throw abort.signal.reason instanceof JobCancelled ? abort.signal.reason : new JobCancelled();
      const row = await this.services.db.selectFrom('jobs').select(['cancelRequested', 'pauseRequested']).where('id', '=', job.id).executeTakeFirst();
      if (row && Number(row.cancelRequested) === 1) throw new JobCancelled();
      if (pauseRequested || (row && Number(row.pauseRequested) === 1)) throw new JobPaused();
    };

    const jc: JobContext = {
      job,
      ctx,
      signal: abort.signal,
      services: this.services,
      payload: job.payload,
      progress: async (p, message) => {
        await queue.setProgress(job.id, job.lockToken, p);
        await bus.publish(ctx.workspaceId, {
          projectId: job.projectId,
          jobId: job.id,
          type: 'job.progress',
          data: { jobId: job.id, kind: job.kind, progress: p, message: message ?? null },
        });
      },
      emit: async (type, data) => {
        await bus.publish(ctx.workspaceId, { projectId: job.projectId, jobId: job.id, type, data });
      },
      emitEphemeral: (type, data) => bus.publishEphemeral(ctx.workspaceId, { projectId: job.projectId, jobId: job.id, type, data }),
      checkpoint,
      enqueueChild: (input) => queue.enqueue(ctx, { ...input, parentId: job.id }),
      runAi: async (stage, input, opts) => {
        await checkpoint();
        const model = await this.resolveModel(ctx, job.projectId, stage);
        const estimate = await this.services.ai.estimate(stage, input, model ? { model } : {});
        await this.reserveBudget(job.id, ctx, job.projectId, estimate.highUsd);
        try {
          const callOpts: RunStageOptions = {
            ...opts,
            signal: abort.signal,
            beforeCall: (spent, quote) => this.reserveBudget(job.id, ctx, job.projectId, spent + (quote ?? estimate.highUsd)),
          };
          if (model) callOpts.model = model;
          let result: AiStageResult<typeof stage>;
          try {
            result = await this.services.ai.runStage(stage, { ...input, projectId: job.projectId }, callOpts);
          } catch (err) {
            // Calls that finished before the failure were paid for: record them so the book's spend is right.
            const partial = partialUsageOf(err);
            if (partial && (partial.usage.costUsd > 0 || partial.usage.inputTokens > 0 || partial.usage.outputTokens > 0)) {
              try {
                await this.services.repos.production.recordPromptRun(ctx, {
                  projectId: job.projectId,
                  jobId: job.id,
                  stage,
                  prompt: partial.prompt,
                  usage: partial.usage,
                  status: 'failed',
                  error: (err instanceof Error ? err.message : String(err)).slice(0, 1000),
                });
                await this.emitCost(ctx, job, partial.usage.costUsd);
              } catch (recordErr) {
                // The stage's own error matters more; the missed record is logged.
                this.opts.log?.warn({ jobId: job.id, stage, err: { message: (recordErr as Error).message } }, 'could not record the cost of a failed stage');
              }
            }
            throw err;
          }
          const schema = AI_OUTPUT_SCHEMAS[stage];
          const parsed = schema.safeParse(result.output);
          const promptRunId = await this.services.repos.production.recordPromptRun(ctx, {
            projectId: job.projectId,
            jobId: job.id,
            stage,
            prompt: result.prompt,
            usage: result.usage,
            status: parsed.success ? 'ok' : 'invalid_output',
            output: result.rawText,
            guardrails: result.guardrails ?? null,
          });
          await this.emitCost(ctx, job, result.usage.costUsd);
          if (!parsed.success) throw new JobFailed(`The ${stage} step came back incomplete. Try again or pick another model.`, 'invalid_output');
          return { ...result, output: parsed.data, promptRunId };
        } finally {
          this.reservations.delete(job.id);
        }
      },
      runImage: async (prompt, opts) => {
        await checkpoint();
        const model = await this.resolveModel(ctx, job.projectId, 'cover_image');
        // One image, not a text call: the cover_brief text estimate (about $0.48 high) used to pause
        // books over a $0.04 image. Covers, spreads and character references all reserve the priced estimate for the
        // dearest image model in the chain at the configured resolution, never below IMAGE_HIGH_ESTIMATE_USD.
        const reserve = await imageReservationUsd(this.services.ai, model);
        await this.reserveBudget(job.id, ctx, job.projectId, reserve);
        try {
          const callOpts: GenerateImageOptions = {
            ...opts,
            signal: abort.signal,
            beforeCall: (spent, quote) => this.reserveBudget(job.id, ctx, job.projectId, spent + Math.max(quote ?? 0, reserve)),
          };
          if (model) callOpts.model = model;
          const img = await this.services.ai.generateImage(prompt, callOpts);
          const promptRunId = await this.services.repos.production.recordPromptRun(ctx, {
            projectId: job.projectId,
            jobId: job.id,
            stage: 'cover_image',
            prompt: null,
            usage: img.usage,
            status: 'ok',
          });
          await this.emitCost(ctx, job, img.usage.costUsd);
          return { ...img, promptRunId };
        } finally {
          this.reservations.delete(job.id);
        }
      },
    };

    const handler = this.handlers[job.kind as JobKind];
    try {
      if (!handler) throw new JobFailed(`No handler for job kind ${job.kind}.`, 'no_handler');
      const outcome = await handler(jc);
      if (outcome.waitForChildren) {
        await queue.finish(job.id, job.lockToken, { status: 'waiting', result: outcome.result });
        await queue.refreshParent(job.id);
      } else {
        await queue.finish(job.id, job.lockToken, { status: outcome.status ?? 'succeeded', result: outcome.result });
      }
    } catch (err) {
      await this.handleError(job, ctx, abort, err);
    } finally {
      clearInterval(heartbeat);
    }
  }

  private async handleError(job: ClaimedJob, ctx: RequestCtx, abort: AbortController, err: unknown): Promise<void> {
    const { queue, bus } = this.services;
    const reason: unknown = abort.signal.aborted ? abort.signal.reason : null;
    if (err instanceof JobCancelled || reason instanceof JobCancelled) {
      await queue.finish(job.id, job.lockToken, { status: 'cancelled', error: 'Cancelled by the owner.', errorCode: 'cancelled' });
      return;
    }
    if (this.stopped && abort.signal.aborted) return; // shutting down: leave it for recovery on restart
    if (err instanceof JobPaused) {
      await queue.finish(job.id, job.lockToken, { status: 'paused', errorCode: 'paused' });
      return;
    }
    if (err instanceof BudgetPaused) {
      await queue.finish(job.id, job.lockToken, { status: 'paused_budget', error: err.message, errorCode: 'budget_exceeded' });
      await bus.publish(ctx.workspaceId, {
        projectId: job.projectId,
        jobId: job.id,
        type: 'budget.paused',
        data: { jobId: job.id, message: err.message, ...err.details },
      });
      return;
    }
    if (err instanceof AiModelUnavailableError) {
      await queue.finish(job.id, job.lockToken, {
        status: 'failed',
        error: `${err.message} Choose another model for this stage.`,
        errorCode: 'model_unavailable',
        result: { model: err.model, stage: err.stage, nextFallback: err.nextFallback },
      });
      return;
    }
    if (err instanceof AiRetryableError) {
      await queue.retryOrFail(job.id, job.lockToken, err.message, { retryable: true, retryAfterMs: err.retryAfterMs, errorCode: 'provider_error' });
      return;
    }
    if (err instanceof JobFailed) {
      await queue.finish(job.id, job.lockToken, {
        status: 'failed',
        error: err.message,
        errorCode: err.code,
        ...(err.result !== undefined ? { result: err.result } : {}),
      });
      return;
    }
    if (err instanceof AppError || err instanceof z.ZodError) {
      await queue.finish(job.id, job.lockToken, { status: 'failed', error: err.message, errorCode: err instanceof AppError ? err.code : 'validation_failed' });
      return;
    }
    const message = err instanceof Error ? err.message : String(err);
    this.opts.log?.warn({ jobId: job.id, kind: job.kind, err: { message } }, 'job attempt failed');
    await queue.retryOrFail(job.id, job.lockToken, message, { retryable: true });
  }

  private async emitCost(ctx: RequestCtx, job: Job, addedUsd: number): Promise<void> {
    const book = job.projectId ? await this.services.repos.books.get(ctx, job.projectId) : null;
    await this.services.bus.publish(ctx.workspaceId, {
      projectId: job.projectId,
      jobId: job.id,
      type: 'cost.update',
      data: { addedUsd, costToDateUsd: book?.costToDateUsd ?? null, budgetUsd: book?.budgetUsd ?? null },
    });
  }

  private async reserveBudget(jobId: string, ctx: RequestCtx, projectId: string | null, usd: number): Promise<void> {
    const check = this.budgetChecks.then(async () => {
      const others = [...this.reservations.entries()].filter(([id, value]) => id !== jobId && value.workspaceId === ctx.workspaceId).map(([, value]) => value);
      await this.checkBudget(
        ctx,
        projectId,
        { highUsd: usd },
        {
          book: others.filter((value) => value.projectId === projectId).reduce((sum, value) => sum + value.usd, 0),
          month: others.reduce((sum, value) => sum + value.usd, 0),
        },
      );
      this.reservations.set(jobId, { workspaceId: ctx.workspaceId, projectId, usd });
    });
    this.budgetChecks = check.then(
      () => undefined,
      () => undefined,
    );
    await check;
  }

  private async checkBudget(ctx: RequestCtx, projectId: string | null, est: { highUsd: number }, pending = { book: 0, month: 0 }): Promise<void> {
    const { repos } = this.services;
    if (ctx.workspaceId !== this.services.instanceWorkspaceId) await this.checkGuestCap(ctx, est, pending.month);
    if (projectId) {
      const book = await repos.books.get(ctx, projectId);
      if (book && book.costToDateUsd + pending.book + est.highUsd > book.budgetUsd) {
        throw new BudgetPaused(`This book needs about $${est.highUsd.toFixed(2)} more than its budget allows. Raise the budget or stop here.`, {
          scope: 'book',
          limitUsd: book.budgetUsd,
          spentUsd: book.costToDateUsd,
          estimateUsd: est.highUsd,
        });
      }
    }
    const cap = await repos.settings.get(ctx, 'budget.monthly_cap_usd');
    if (typeof cap === 'number') {
      const spent = await repos.production.monthSpendUsd(ctx);
      if (spent + pending.month + est.highUsd > cap) {
        throw new BudgetPaused('This month’s AI spending cap is reached. Raise the cap in Settings to continue.', {
          scope: 'month',
          limitUsd: cap,
          spentUsd: spent,
          estimateUsd: est.highUsd,
        });
      }
    }
  }

  /**
   * A workspace other than the instance owner's spends the instance owner's key (D-047). The instance owner sets one
   * monthly cap that applies to each such workspace; 0 or unset refuses every AI and image call. The workspace's own
   * caps still apply on top, but can never lift this one.
   */
  private async checkGuestCap(ctx: RequestCtx, est: { highUsd: number }, pendingMonth: number): Promise<void> {
    const { repos, instanceWorkspaceId } = this.services;
    const instance: RequestCtx = { workspaceId: instanceWorkspaceId, userId: 'system', role: 'owner' };
    const cap = (await repos.settings.get(instance, GUEST_CAP_KEY)) ?? 0;
    if (!(cap > 0)) {
      throw new JobFailed(
        'AI runs are not switched on for this workspace yet. The owner of this Volume needs to set a monthly cap for other workspaces in Settings.',
        'guest_ai_disabled',
      );
    }
    const spent = await repos.production.monthSpendUsd(ctx);
    if (spent + pendingMonth + est.highUsd > cap) {
      throw new BudgetPaused('This workspace has reached the monthly AI cap the owner of this Volume set. Ask them to raise it to continue.', {
        scope: 'month',
        limitUsd: cap,
        spentUsd: spent,
        estimateUsd: est.highUsd,
      });
    }
  }

  /** Book settings, then profile, then workspace overrides, then config defaults. */
  async resolveModel(ctx: RequestCtx, projectId: string | null, stage: AiStage | 'cover_image'): Promise<string | null> {
    const key = stage === 'cover_image' ? 'cover_image' : STAGE_TO_CONFIG[stage];
    const { repos } = this.services;
    if (projectId) {
      const book = await repos.books.get(ctx, projectId);
      if (book) {
        const fromBook = pickModel(book.settings['models'] as Record<string, unknown> | undefined, key);
        if (fromBook) return fromBook;
        const profile = await repos.profiles.get(ctx, book.profileId);
        const fromProfile = pickModel(profile?.models, key);
        if (fromProfile) return fromProfile;
      }
    }
    const overrides = await repos.settings.get(ctx, 'models.overrides');
    const fromWorkspace = pickModel(overrides, key);
    if (fromWorkspace) return fromWorkspace;
    try {
      const defaults = await readModelDefaults(this.services.configDir);
      return defaults.stages[key]?.defaultModel ?? null;
    } catch {
      return null;
    }
  }

  /** Waits until no job is running (tests and shutdown). */
  async drain(timeoutMs = 10000): Promise<void> {
    const until = Date.now() + timeoutMs;
    while (this.running.size > 0 && Date.now() < until) await sleep(20);
  }
}
