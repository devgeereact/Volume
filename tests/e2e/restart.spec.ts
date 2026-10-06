import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { expect, test } from "@playwright/test";

test("a server process restart recovers interrupted writing and preserves the manuscript", async ({ request }) => {
  const scratch = mkdtempSync(path.join(tmpdir(), "volume-restart-"));
  const database = path.join(scratch, "test.sqlite");
  const port = 5313;
  const api = `http://127.0.0.1:${port}/api/v1`;
  const headers = { Origin: "http://127.0.0.1:5312" };
  let child: ChildProcess | undefined;
  async function stop(): Promise<void> {
    if (!child || child.exitCode !== null || child.signalCode !== null) return;
    const ended = once(child, "exit");
    child.kill("SIGKILL");
    await ended;
  }
  async function start(delay: string): Promise<void> {
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
        SQLITE_PATH: database,
        DATA_DIR: scratch,
        PORT: String(port),
        HOST: "127.0.0.1",
        WEB_ORIGINS: "http://127.0.0.1:5312",
        RESOLVE_SOURCE_REDIRECTS: "false",
        MOCK_FAIL_NEXT_WRITING: "",
        MOCK_STREAM_DELAY_MS: delay,
        JOBS_ENABLED: "true",
        LOG_LEVEL: "silent",
      },
    });
    await expect
      .poll(
        async () => {
          try {
            return (await request.get(`${api}/health`, { timeout: 1000 })).status();
          } catch {
            return 0;
          }
        },
        { timeout: 15000 },
      )
      .toBe(200);
  }
  try {
    await start("0");
    const author = (await (
      await request.post(`${api}/profiles`, { headers, data: { penName: "Restart author", bioThirdPerson: "Restart author writes test books." } })
    ).json()) as { id: string };
    const book = (await (
      await request.post(`${api}/books`, { headers, data: { profileId: author.id, idea: "Restart writing", title: "Restart test" } })
    ).json()) as { id: string };
    await request.post(`${api}/books/${book.id}/blueprints`, { headers, data: { chapterCount: 2 } });
    await expect.poll(async () => ((await (await request.get(`${api}/books/${book.id}/blueprint`)).json()) as { blueprint: unknown }).blueprint).toBeTruthy();
    expect((await request.post(`${api}/books/${book.id}/blueprint/approve`, { headers, data: {} })).status()).toBe(200);
    await stop();
    await start("300");
    const write = await request.post(`${api}/books/${book.id}/write`, { headers, data: {} });
    expect(write.status()).toBe(202);
    await expect
      .poll(async () =>
        ((await (await request.get(`${api}/books/${book.id}/jobs`)).json()) as { items: { kind: string; status: string }[] }).items.some(
          (job) => job.kind === "write_section" && job.status === "running",
        ),
      )
      .toBe(true);
    await stop();
    // Simulate the stale-heartbeat grace period passing in this test database only.
    const copy = new DatabaseSync(database);
    copy.prepare("UPDATE jobs SET locked_at = 0 WHERE status = 'running'").run();
    copy.close();
    await start("0");
    await expect
      .poll(
        async () => {
          const jobs = (await (await request.get(`${api}/books/${book.id}/jobs`)).json()) as { items: { kind: string; status: string }[] };
          return jobs.items.find((job) => job.kind === "write_book")?.status;
        },
        { timeout: 30000 },
      )
      .toBe("succeeded");
    const sections = (await (await request.get(`${api}/books/${book.id}/sections`)).json()) as { totals: { words: number } };
    expect(sections.totals.words).toBeGreaterThan(0);
  } finally {
    await stop();
    rmSync(scratch, { recursive: true, force: true });
  }
});
