import { EventEmitter } from 'node:events';
import { describe, expect, it } from 'vitest';
import { ensureOwner } from '../src/auth/context.js';
import { EventBus } from '../src/sse/bus.js';
import { openSseStream, type SseSink } from '../src/sse/stream.js';
import { memoryDb } from './helpers.js';

class FakeSink extends EventEmitter implements SseSink {
  status = 0;
  headers: Record<string, string> = {};
  chunks: string[] = [];
  ended = false;
  writeHead(status: number, headers: Record<string, string>) {
    this.status = status;
    this.headers = headers;
    return this;
  }
  write(chunk: string) {
    this.chunks.push(chunk);
    return true;
  }
  end() {
    this.ended = true;
  }
  get text() {
    return this.chunks.join('');
  }
  ids(): string[] {
    return [...this.text.matchAll(/^id: (\S+)$/gm)].map((m) => m[1] as string);
  }
}

describe('SSE per book', () => {
  it('replays stored events after Last-Event-ID, then streams live ones', async () => {
    const handle = await memoryDb();
    const ctx = await ensureOwner(handle.db);
    const bus = new EventBus(handle.db);
    const book = 'BOOK00000000000000000000001';
    const e1 = await bus.publish(ctx.workspaceId, { projectId: book, type: 'job.status', data: { n: 1 } });
    const e2 = await bus.publish(ctx.workspaceId, { projectId: book, type: 'job.progress', data: { n: 2 } });
    const e3 = await bus.publish(ctx.workspaceId, { projectId: book, type: 'section.saved', data: { n: 3 } });
    await bus.publish(ctx.workspaceId, { projectId: 'OTHERBOOK00000000000000001', type: 'job.status', data: { other: true } });

    const sink = new FakeSink();
    const close = await openSseStream(sink, { bus, workspaceId: ctx.workspaceId, projectId: book, lastEventId: e1.id, pingMs: 60_000 });
    expect(sink.status).toBe(200);
    expect(sink.headers['Content-Type']).toMatch(/text\/event-stream/);
    expect(sink.ids()).toEqual([e2.id, e3.id]);
    expect(sink.text).not.toContain('"other"');

    // Live: stored events carry an id; streamed text does not and is not stored.
    const e4 = await bus.publish(ctx.workspaceId, { projectId: book, type: 'job.status', data: { n: 4 } });
    bus.publishEphemeral(ctx.workspaceId, { projectId: book, type: 'section.delta', data: { text: 'Hello' } });
    expect(sink.ids()).toEqual([e2.id, e3.id, e4.id]);
    expect(sink.text).toContain('event: section.delta');
    expect(await handle.db.selectFrom('jobEvents').select('id').where('type', '=', 'section.delta').execute()).toHaveLength(0);

    // Reconnect from e3: only e4 is replayed.
    const again = new FakeSink();
    const close2 = await openSseStream(again, { bus, workspaceId: ctx.workspaceId, projectId: book, lastEventId: e3.id, pingMs: 60_000 });
    expect(again.ids()).toEqual([e4.id]);

    // Another workspace replays nothing.
    const other = await ensureOwner(handle.db, 'other', 'Other');
    const foreign = new FakeSink();
    const close3 = await openSseStream(foreign, { bus, workspaceId: other.workspaceId, projectId: book, lastEventId: '0'.repeat(26), pingMs: 60_000 });
    expect(foreign.ids()).toEqual([]);

    close();
    close2();
    sink.emit('close');
    close3();
    expect(sink.ended).toBe(true);
    expect(bus.listenerCount()).toBe(0);
    await handle.close();
  });
});
