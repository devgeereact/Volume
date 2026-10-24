/*
 * Phase 8: a book that fails inside a batch must not leave the batch running for ever, and must not stop the books behind it.
 *
 * It starts its own server on 127.0.0.1:5314 (mock AI, a fresh SQLite file in a temp folder, the third writing
 * call fails once, as in the main test server) and stops it at the end, like restart.spec.ts does on 5313. Three
 * books run one at a time; the first one's writing fails. The books behind it still run, the batch ends (failed or
 * needs_attention) once all three have ended, and the batch must be startable again to finish the failed book.
 *
 * The batch is driven through the API: the behaviour under test is the job queue's, not a screen's.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, test } from "@playwright/test";

interface BatchView {
  id: string;
  status: string;
  items: { bookId: string; run: { status: string; error: string | null } | null }[];
}

test("a failed book is reported and the books behind it still run", async ({ request }) => {
  const scratch = mkdtempSync(path.join(tmpdir(), "volume-batch-failure-"));
  const port = 5314;
  const api = `http://127.0.0.1:${port}/api/v1`;
  const headers = { Origin: "http://127.0.0.1:5312" };
  let child: ChildProcess | undefined;
  const post = async <T>(route: string, data: unknown): Promise<T> => {
    const res = await request.post(`${api}${route}`, { headers, data });
    expect(res.ok(), `POST ${route} answered ${res.status()}: ${await res.text()}`).toBe(true);
    return (await res.json()) as T;
  };
  const batch = async (id: string): Promise<BatchView> => (await (await request.get(`${api}/batches/${id}`)).json()) as BatchView;
  try {
    child = spawn(process.execPath, ["apps/server/dist/index.js"], {
      cwd: process.cwd(),
      stdio: "ignore",
      env: {
        ...process.env,
        VOLUME_LOAD_ENV: "false",
        OPENROUTER_API_KEY: "",
        AI_PROVIDER: "mock",
        EXPORT_PROVIDER: "mock",
        DB_CLIENT: "sqlite",
        SQLITE_PATH: path.join(scratch, "test.sqlite"),
        DATA_DIR: scratch,
        PORT: String(port),
        HOST: "127.0.0.1",
        WEB_ORIGINS: "http://127.0.0.1:5312",
        RESOLVE_SOURCE_REDIRECTS: "false",
        MOCK_FAIL_NEXT_WRITING: "3",
        MOCK_STREAM_DELAY_MS: "0",
        JOBS_ENABLED: "true",
        LOG_LEVEL: "silent",
      },
    });
    await expect.poll(async () => (await request.get(`${api}/health`, { timeout: 1000 }).catch(() => null))?.status() ?? 0, { timeout: 60_000 }).toBe(200);

    const profile = await post<{ id: string }>("/profiles", { penName: "Failure author", bioThirdPerson: "Failure author writes test books." });
    const bookIds: string[] = [];
    for (let i = 1; i <= 3; i++) {
      bookIds.push(
        (
          await post<{ id: string }>("/books", {
            profileId: profile.id,
            idea: `Failure idea ${i}`,
            title: `Failure book ${i}`,
            settings: { acknowledgements: "Sam" },
          })
        ).id,
      );
    }
    const created = await post<BatchView>("/batches", { name: "Failure batch", bookIds });
    await post(`/batches/${created.id}/start`, { chapterCount: 2 });

    // The first book's third writing call fails. The batch has to end, not wait for ever.
    await expect
      .poll(async () => (await batch(created.id)).status, { timeout: 60_000, message: "the batch ends after a book fails" })
      .not.toMatch(/^(draft|queued|running|waiting)$/);
    const ended = await batch(created.id);
    expect(["failed", "needs_attention"]).toContain(ended.status);
    expect(ended.items[0]?.run?.status).toBe("failed");
    // Books behind the failure still ran: a batch only orders its books, one failure does not cancel the rest.
    for (const item of ended.items.slice(1)) expect(["succeeded", "needs_attention"]).toContain(item.run?.status);

    // And the owner can run it again: the failure was a one-off, so the failed book now finishes too.
    await post(`/batches/${created.id}/start`, { chapterCount: 2 });
    await expect.poll(async () => (await batch(created.id)).status, { timeout: 120_000 }).toBe("succeeded");
  } finally {
    if (child && child.exitCode === null && child.signalCode === null) {
      const ended = once(child, "exit");
      child.kill("SIGKILL");
      await ended;
    }
    rmSync(scratch, { recursive: true, force: true });
  }
});
