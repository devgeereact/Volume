import { QueryObserver, type QueryClient } from "@tanstack/react-query";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NotConnectedMessage, notConnectedTitle } from "../shell/NotConnectedBanner";
import { booksApi } from "./books";
import { isApiError } from "./client";
import { connection, healthRefetchMs } from "./connection";
import { createQueryClient } from "./queryClient";
import { deriveDataSource, healthQueryOptions } from "./source";
import type { HealthResponse } from "./types";

/* D-061: sample data only when this page has never reached the API. These tests drive the real health query, the
   real connection state and a real query for the book list, against a mocked fetch that plays the server. */

const HEALTH: HealthResponse = {
  status: "ok",
  version: "test",
  uptimeS: 1,
  database: { client: "sqlite", status: "ok" },
  ai: { provider: "mock" },
  exporter: { name: "stub" },
};

let serverUp = true;
let booksBody: unknown = { items: [{ id: "b1", title: "Real Book One" }] };

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

beforeEach(() => {
  serverUp = true;
  booksBody = { items: [{ id: "b1", title: "Real Book One" }] };
  connection.reset();
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL) => {
      if (!serverUp) return Promise.reject(new TypeError("fetch failed"));
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url.includes("/health")) return Promise.resolve(json(HEALTH));
      if (url.includes("/books")) return Promise.resolve(json(booksBody));
      return Promise.resolve(json({ error: { code: "not_found", message: "no" } }, 404));
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  connection.reset();
});

interface Watch {
  qc: QueryClient;
  health: QueryObserver<HealthResponse, Error, HealthResponse, HealthResponse, readonly ["system", "health"]>;
  books: QueryObserver<unknown>;
  stop: () => void;
}

function watch(): Watch {
  const qc = createQueryClient();
  const health = new QueryObserver(qc, { ...healthQueryOptions(), refetchInterval: false });
  const books = new QueryObserver<unknown>(qc, {
    queryKey: ["books", "list"],
    queryFn: ({ signal }) => booksApi.list({}, { signal }),
  });
  const stops = [health.subscribe(() => undefined), books.subscribe(() => undefined)];
  return { qc, health, books, stop: () => stops.forEach((s) => s()) };
}

function source(w: Watch) {
  const r = w.health.getCurrentResult();
  return deriveDataSource(r, connection.snapshot(), false);
}

describe("offline honesty (D-061)", () => {
  it("never connected: the app uses demo sample data, without the banner state", async () => {
    serverUp = false;
    const w = watch();
    await vi.waitFor(() => expect(w.health.getCurrentResult().isError).toBe(true));
    expect(source(w).source).toBe("mock");
    expect(source(w).everConnected).toBe(false);
    expect(connection.snapshot().offline).toBe(false);
    w.stop();
  });

  it("connected, then dropped: real data stays, the source stays api, and the banner state is on", async () => {
    const w = watch();
    await vi.waitFor(() => expect(w.health.getCurrentResult().isSuccess).toBe(true));
    await vi.waitFor(() => expect(w.books.getCurrentResult().isSuccess).toBe(true));
    expect(source(w).source).toBe("api");

    serverUp = false;
    await w.qc.refetchQueries({ queryKey: ["system", "health"] });
    await vi.waitFor(() => expect(connection.snapshot().offline).toBe(true));
    const s = source(w);
    expect(s.source).toBe("api"); // never back to sample data
    expect(s.down).toBe(true);
    expect(s.everConnected).toBe(true);

    // The next refresh of the list does not fail the screen or drop its rows.
    void w.qc.refetchQueries({ queryKey: ["books"] });
    await new Promise((r) => setTimeout(r, 50));
    const r = w.books.getCurrentResult();
    expect(r.isError).toBe(false);
    expect(r.data).toEqual({ items: [{ id: "b1", title: "Real Book One" }] });
    w.stop();
  });

  it("a list call that gets no answer is enough to go offline, and keeps its rows", async () => {
    const w = watch();
    await vi.waitFor(() => expect(w.books.getCurrentResult().isSuccess).toBe(true));
    serverUp = false;
    void w.qc.refetchQueries({ queryKey: ["books"] });
    await vi.waitFor(() => expect(connection.snapshot().offline).toBe(true));
    const r = w.books.getCurrentResult();
    expect(r.isError).toBe(false);
    expect(JSON.stringify(r.data)).toContain("Real Book One");
    w.stop();
  });

  it("refuses a write while offline, with a plain reason", async () => {
    const w = watch();
    await vi.waitFor(() => expect(w.health.getCurrentResult().isSuccess).toBe(true));
    serverUp = false;
    await w.qc.refetchQueries({ queryKey: ["system", "health"] });
    const write = vi.fn(() => Promise.resolve("saved"));
    const err = await w.qc
      .getMutationCache()
      .build(w.qc, { mutationFn: write })
      .execute(undefined)
      .catch((e: unknown) => e);
    expect(write).not.toHaveBeenCalled();
    expect(isApiError(err) && err.code === "not_connected").toBe(true);
    expect(String((err as Error).message)).toContain("Not connected");
    w.stop();
  });

  it("reconnect: the banner state clears and the list is refetched with the server's current data", async () => {
    const w = watch();
    await vi.waitFor(() => expect(w.books.getCurrentResult().isSuccess).toBe(true));
    serverUp = false;
    await w.qc.refetchQueries({ queryKey: ["system", "health"] });
    await vi.waitFor(() => expect(connection.snapshot().offline).toBe(true));

    serverUp = true;
    booksBody = {
      items: [
        { id: "b1", title: "Real Book One" },
        { id: "b2", title: "Added While Away" },
      ],
    };
    await w.qc.refetchQueries({ queryKey: ["system", "health"] });
    await vi.waitFor(() => expect(connection.snapshot().offline).toBe(false));
    expect(source(w).down).toBe(false);
    await vi.waitFor(() => expect(JSON.stringify(w.books.getCurrentResult().data)).toContain("Added While Away"), { timeout: 5000 });
    w.stop();
  });

  it("backs off while offline: 2 s doubling to 30 s, and 30 s when fine or never connected", () => {
    expect(healthRefetchMs({ everConnected: false, offline: false, failures: 5 })).toBe(30_000);
    expect(healthRefetchMs({ everConnected: true, offline: false, failures: 0 })).toBe(30_000);
    expect([1, 2, 3, 4, 5, 6].map((failures) => healthRefetchMs({ everConnected: true, offline: true, failures }))).toEqual([
      2_000, 4_000, 8_000, 16_000, 30_000, 30_000,
    ]);
  });

  it("says the exact words and shows no sample figure", () => {
    expect(notConnectedTitle(true)).toBe("Not connected. Showing your last saved view. Reconnecting...");
    const html = renderToStaticMarkup(<NotConnectedMessage everConnected />);
    expect(html).toContain("Not connected. Showing your last saved view. Reconnecting...");
    expect(html).not.toContain("October spend");
    expect(html).not.toContain("Demo");
  });
});
