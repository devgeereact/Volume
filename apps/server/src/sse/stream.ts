import type { BusEvent, EventBus } from './bus.js';

/** The part of http.ServerResponse the stream needs (lets tests pass a fake). */
export interface SseSink {
  writeHead(status: number, headers: Record<string, string>): unknown;
  write(chunk: string): boolean;
  end(): unknown;
  on(event: 'close', fn: () => void): unknown;
  once(event: 'drain' | 'close', fn: () => void): unknown;
  /** Drops the connection at once (http.ServerResponse has it); used for a socket that never drains. */
  destroy?(): unknown;
  removeListener(event: 'drain' | 'close', fn: () => void): unknown;
}

/** How long a stream lives before the server ends it; the browser reconnects through sign-in (audit L7). */
export const SSE_MAX_AGE_MS = 60 * 60 * 1000;
/** A socket that cannot take more data for this long is closed instead of buffering without end (audit M3). */
export const SSE_DRAIN_TIMEOUT_MS = 30_000;
/** Open streams one user may hold at once (tabs, the book stream and the workspace stream). */
export const SSE_MAX_PER_USER = 8;

/** Counts open streams per key; take() gives a release function, or null when the key is at its limit. */
export class StreamLimit {
  private readonly open = new Map<string, number>();
  constructor(private readonly max: number = SSE_MAX_PER_USER) {}
  take(key: string): (() => void) | null {
    const n = this.open.get(key) ?? 0;
    if (n >= this.max) return null;
    this.open.set(key, n + 1);
    let released = false;
    return () => {
      if (released) return;
      released = true;
      const left = (this.open.get(key) ?? 1) - 1;
      if (left <= 0) this.open.delete(key);
      else this.open.set(key, left);
    };
  }
}

export interface SseOptions {
  bus: EventBus;
  workspaceId: string;
  projectId: string | null;
  lastEventId: string | null;
  pingMs?: number;
  /**
   * Asked every `recheckMs` (60 s by default) whether the caller may still read this workspace. False, or an error,
   * closes the stream, so a member removed from the workspace stops receiving events within a minute.
   */
  stillAllowed?: () => Promise<boolean>;
  recheckMs?: number;
  /** Security headers the rest of the API sends from onSend (a hijacked reply skips onSend). The stream's own win. */
  headers?: Record<string, string>;
  /** Ends the stream after this long (default SSE_MAX_AGE_MS). */
  maxAgeMs?: number;
  /** Closes a socket that has not drained for this long (default SSE_DRAIN_TIMEOUT_MS). */
  drainTimeoutMs?: number;
  /** Called once when the stream closes, whatever closed it. */
  onClose?: () => void;
}

export function formatEvent(e: BusEvent): string {
  const lines: string[] = [];
  if (e.id) lines.push(`id: ${e.id}`);
  lines.push(`event: ${e.type}`);
  const payload = JSON.stringify({ projectId: e.projectId, jobId: e.jobId, createdAt: e.createdAt, data: e.data });
  for (const line of payload.split('\n')) lines.push(`data: ${line}`);
  return `${lines.join('\n')}\n\n`;
}

const ULID_RE = /^[0-9A-HJKMNP-TV-Z]{26}$/;

/**
 * Opens a text/event-stream on `sink`: replays stored events after
 * Last-Event-ID, then forwards live events. Subscribes before replaying and
 * buffers, so nothing is lost or sent twice in between.
 * Returns a function that closes the stream.
 */
export async function openSseStream(sink: SseSink, opts: SseOptions): Promise<() => void> {
  sink.writeHead(200, {
    ...opts.headers,
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  sink.write(': connected\n\nretry: 3000\n\n');

  let closed = false;
  let replaying = true;
  let lastSent: string | null = opts.lastEventId && ULID_RE.test(opts.lastEventId) ? opts.lastEventId : null;
  const buffered: BusEvent[] = [];

  // Backpressure: a write that returns false means the socket's buffer is full. Wait for 'drain'; a socket that does
  // not drain in time is closed (the browser reconnects with Last-Event-ID, so nothing is lost).
  let draining: Promise<void> | null = null;
  const waitDrain = (): Promise<void> => {
    draining ??= new Promise<void>((resolve) => {
      const done = (): void => {
        clearTimeout(timer);
        sink.removeListener('drain', done);
        sink.removeListener('close', done);
        draining = null;
        resolve();
      };
      const timer = setTimeout(() => {
        close();
        // end() would wait for the stuck buffer to flush; drop the connection instead.
        sink.destroy?.();
        done();
      }, opts.drainTimeoutMs ?? SSE_DRAIN_TIMEOUT_MS);
      timer.unref();
      sink.once('drain', done);
      sink.once('close', done);
    });
    return draining;
  };

  /** Writes one event; false when the socket asked us to wait. */
  const send = (e: BusEvent): boolean => {
    if (closed) return true;
    if (e.id !== null) {
      if (lastSent !== null && e.id <= lastSent) return true;
      lastSent = e.id;
    }
    const ok = sink.write(formatEvent(e));
    if (!ok) void waitDrain();
    return ok;
  };

  const unsubscribe = opts.bus.subscribe(opts.workspaceId, opts.projectId, (e) => {
    if (replaying) buffered.push(e);
    else send(e);
  });

  const ping = setInterval(() => {
    if (!closed) sink.write(': ping\n\n');
  }, opts.pingMs ?? 15000);
  ping.unref();

  let recheck: NodeJS.Timeout | null = null;
  const maxAge = setTimeout(() => close(), opts.maxAgeMs ?? SSE_MAX_AGE_MS);
  maxAge.unref();
  const close = (): void => {
    if (closed) return;
    closed = true;
    clearInterval(ping);
    clearTimeout(maxAge);
    if (recheck) clearInterval(recheck);
    unsubscribe();
    opts.onClose?.();
    try {
      sink.end();
    } catch {
      // already closed
    }
  };
  sink.on('close', close);
  const stillAllowed = opts.stillAllowed;
  if (stillAllowed) {
    let checking = false;
    recheck = setInterval(() => {
      if (closed || checking) return;
      checking = true;
      void stillAllowed()
        .catch(() => false)
        .then((ok) => {
          if (!ok) close();
        })
        .finally(() => {
          checking = false;
        });
    }, opts.recheckMs ?? 60_000);
    recheck.unref();
  }

  if (lastSent !== null) {
    let after = lastSent;
    for (;;) {
      const batch = await opts.bus.replay(opts.workspaceId, opts.projectId, after, 500);
      for (const e of batch) {
        if (closed) break;
        if (!send(e)) await waitDrain();
      }
      if (closed || batch.length < 500) break;
      after = batch[batch.length - 1]?.id ?? after;
    }
  }
  replaying = false;
  for (const e of buffered.splice(0)) send(e);
  return close;
}
