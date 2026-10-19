import { JOB_EVENT_RETENTION_DAYS, type EventBus } from '../sse/bus.js';

/**
 * Daily retention (D-050): job events older than 90 days are deleted. Runs once at start, then every `everyMs`
 * (default 24 hours) while the server runs, on SQLite and MySQL alike. The timer is unref'd so it never keeps
 * the process alive.
 */
export class RetentionService {
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly bus: EventBus,
    private readonly days = JOB_EVENT_RETENTION_DAYS,
  ) {}

  /** One pass now. Returns how many events were deleted. */
  runOnce(at?: number): Promise<number> {
    return this.bus.prune(this.days, at);
  }

  start(opts: { everyMs?: number; log?: (msg: string, deleted?: number, failed?: boolean) => void } = {}): void {
    if (this.timer) return;
    const pass = async (): Promise<void> => {
      try {
        const n = await this.runOnce();
        if (n > 0) opts.log?.('Old job events pruned', n);
      } catch {
        opts.log?.('Job event pruning failed', undefined, true);
      }
    };
    this.timer = setInterval(() => void pass(), opts.everyMs ?? 24 * 60 * 60 * 1000);
    this.timer.unref();
    void pass();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}
