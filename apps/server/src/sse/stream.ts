import type { BusEvent, EventBus } from './bus.js';

/** The part of http.ServerResponse the stream needs (lets tests pass a fake). */
export interface SseSink {
  writeHead(status: number, headers: Record<string, string>): unknown;
  write(chunk: string): boolean;
  end(): unknown;
  on(event: 'close', fn: () => void): unknown;
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

  const send = (e: BusEvent): void => {
    if (closed) return;
    if (e.id !== null) {
      if (lastSent !== null && e.id <= lastSent) return;
      lastSent = e.id;
    }
    sink.write(formatEvent(e));
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
  const close = (): void => {
    if (closed) return;
    closed = true;
    clearInterval(ping);
    if (recheck) clearInterval(recheck);
    unsubscribe();
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
      for (const e of batch) send(e);
      if (batch.length < 500) break;
      after = batch[batch.length - 1]?.id ?? after;
    }
  }
  replaying = false;
  for (const e of buffered.splice(0)) send(e);
  return close;
}
