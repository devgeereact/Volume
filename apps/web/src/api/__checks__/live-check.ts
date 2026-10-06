/* Live check of the API client against a running Volume server (not part of the app bundle).

   Run from the repository root with a throwaway server, for example:
     PORT=5199 SQLITE_PATH=<scratch>/webapi.db AI_PROVIDER=mock node apps/server/dist/index.js
     VOLUME_API=http://127.0.0.1:5199/api/v1 npx tsx prototype/src/api/__checks__/live-check.ts

   Checks: plainJobError (no server), health, profiles list, books create, book get, a typed 404, blueprint job (202), and
   three SSE events from the book stream, applied to a QueryClient with the same rules as
   useBookEvents. Prints PASS or FAIL per check and exits 1 when any check fails. */

import { QueryClient } from "@tanstack/react-query";
import { booksApi } from "../books";
import { ApiError, apiUrl, configureApi } from "../client";
import { applyBookEvent, parseServerEvent, type BookLiveState } from "../events";
import { queryKeys } from "../hooks";
import { plainJobError } from "../jobErrors";
import { planningApi } from "../planning";
import { profilesApi } from "../profiles";
import { systemApi } from "../system";
import type { BookEvent } from "../types";

/* The prototype's tsconfig has no Node types, so reach process through globalThis. */
const proc = (globalThis as unknown as { process: { env: Record<string, string | undefined>; exitCode?: number } }).process;
const base = proc.env["VOLUME_API"] ?? "http://127.0.0.1:5199/api/v1";
configureApi({ baseUrl: base });

type Result = { name: string; ok: boolean; detail: string };
const results: Result[] = [];

async function check(name: string, fn: () => string | Promise<string>): Promise<boolean> {
  try {
    const detail = await fn();
    results.push({ name, ok: true, detail });
    return true;
  } catch (e) {
    const detail = e instanceof ApiError ? `${e.status} ${e.code}: ${e.message}` : e instanceof Error ? e.message : String(e);
    results.push({ name, ok: false, detail });
    return false;
  }
}

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(message);
}

/** Reads `count` events from an SSE URL with fetch (Node has no EventSource without a flag). */
async function readSse(url: string, count: number, timeoutMs: number, onReady: () => Promise<void>): Promise<BookEvent[]> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  const events: BookEvent[] = [];
  try {
    const res = await fetch(url, { headers: { Accept: "text/event-stream" }, signal: ctl.signal });
    assert(res.ok, `SSE answered ${res.status}`);
    assert((res.headers.get("content-type") ?? "").includes("text/event-stream"), "SSE content type is not text/event-stream");
    assert(res.body, "SSE has no body");
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    let started = false;
    while (events.length < count) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      if (!started && buf.includes(": connected")) {
        started = true;
        await onReady();
      }
      let at: number;
      while ((at = buf.indexOf("\n\n")) >= 0) {
        const block = buf.slice(0, at);
        buf = buf.slice(at + 2);
        let id: string | null = null;
        let type = "message";
        const data: string[] = [];
        for (const line of block.split("\n")) {
          if (line.startsWith(":")) continue;
          if (line.startsWith("id: ")) id = line.slice(4);
          else if (line.startsWith("event: ")) type = line.slice(7);
          else if (line.startsWith("data: ")) data.push(line.slice(6));
        }
        if (data.length === 0) continue;
        const ev = parseServerEvent(type, data.join("\n"), id);
        if (ev) events.push(ev);
      }
    }
    return events;
  } finally {
    clearTimeout(timer);
    ctl.abort();
  }
}

async function main(): Promise<void> {
  let profileId = "";
  let bookId = "";
  let jobId = "";

  // No server needed: known job error codes read in plain words, anything else passes through.
  await check("plainJobError", () => {
    assert(plainJobError("402 from provider", "ai_credits")?.startsWith("OpenRouter has no credit left."), "ai_credits not plain");
    assert(plainJobError(null, "output_truncated")?.startsWith("The AI's answer was cut off"), "output_truncated not plain");
    assert(plainJobError("Preflight failed", "preflight_blocked") === "Preflight failed", "other codes must keep the text");
    assert(plainJobError(null, null) === null && plainJobError(undefined, "job_failed") === null, "null must stay null");
    return "ai_credits, output_truncated, pass-through and null";
  });

  await check("health", async () => {
    const h = await systemApi.health();
    assert(h.status === "ok", `status ${h.status}`);
    return `status=${h.status} db=${h.database.client}/${h.database.status} ai=${h.ai.provider} exporter=${h.exporter.name}`;
  });

  await check("profiles list", async () => {
    const r = await profilesApi.list();
    assert(Array.isArray(r.items), "items is not an array");
    const active = r.items.find((p) => p.status === "active");
    assert(active, "no active profile (seeding from config/profiles expected)");
    profileId = active.id;
    return `${r.items.length} profiles, using "${active.penName}"`;
  });

  await check("books create", async () => {
    assert(profileId, "no profile id from the previous check");
    const b = await booksApi.create({ profileId, idea: "Live check of the web API client. Safe to delete.", title: "API client check" });
    assert(b.id && b.profileId === profileId, "created book does not match");
    bookId = b.id;
    return `id=${b.id} stage=${b.stage} budget=$${b.budgetUsd}`;
  });

  await check("book get", async () => {
    assert(bookId, "no book id from the previous check");
    const b = await booksApi.get(bookId);
    assert(b.id === bookId, "id mismatch");
    assert(typeof b.totals.words === "number" && Array.isArray(b.recentJobs), "totals or recentJobs missing");
    return `title="${b.title ?? ""}" totals.sections=${b.totals.sections} recentJobs=${b.recentJobs.length}`;
  });

  await check("typed error (404)", async () => {
    try {
      await booksApi.get("NO_SUCH_BOOK");
    } catch (e) {
      assert(e instanceof ApiError, "not an ApiError");
      assert(e.status === 404 && e.code === "not_found", `got ${e.status} ${e.code}`);
      return `ApiError ${e.status} ${e.code}: ${e.message}`;
    }
    throw new Error("expected a 404");
  });

  const qc = new QueryClient();
  let events: BookEvent[] = [];
  const sseUrl = apiUrl(`/books/${encodeURIComponent(bookId)}/events`);

  await check("blueprint create job (202)", async () => {
    assert(bookId, "no book id");
    // Open the stream first so the job's events are not missed, then start the job.
    events = await readSse(sseUrl, 3, 20_000, async () => {
      const r = await planningApi.createBlueprint(bookId, { chapterCount: 3 });
      assert(r.jobId && r.job.id === r.jobId, "202 body has no jobId or job");
      assert(r.job.kind === "blueprint", `job kind ${r.job.kind}`);
      jobId = r.jobId;
    });
    assert(jobId, "the job was not started");
    return `jobId=${jobId}`;
  });

  await check("SSE: 3 events from the book stream", () => {
    assert(events.length >= 3, `only ${events.length} events before the timeout`);
    for (const ev of events) applyBookEvent(qc, bookId, ev);
    const live = qc.getQueryData<BookLiveState>(queryKeys.book.live(bookId));
    const seen = events.map((e) => `${e.type}${e.id ? "" : " (no id)"}`).join(", ");
    assert(live && live.jobs[jobId], "live state has no entry for the job");
    return `${seen}; live job status=${live.jobs[jobId]?.status ?? "?"} progress=${live.jobs[jobId]?.progress ?? 0}`;
  });

  for (const r of results) console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name}  ${r.detail}`);
  proc.exitCode = results.every((r) => r.ok) ? 0 : 1;
}

void main();
