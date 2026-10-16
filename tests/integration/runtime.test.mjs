import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import test from "node:test";
import { checkPort, developmentPorts, requireRuntime, root } from "../../scripts/runtime.mjs";

async function reserve() {
  const server = createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  return { server, port: server.address().port };
}
async function release(server) {
  await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
}
function launch(env) {
  const child = spawn(process.execPath, [root + "scripts/dev.mjs"], { cwd: tmpdir(), env: { ...process.env, ...env }, stdio: ["ignore", "pipe", "pipe"] });
  let output = "";
  for (const stream of [child.stdout, child.stderr])
    stream.on("data", (chunk) => {
      output = (output + chunk).slice(-8000);
    });
  const closed = once(child, "close");
  return { child, closed, output: () => output };
}
const safeEnv = { VOLUME_LOAD_ENV: "false", AI_PROVIDER: "mock", EXPORT_PROVIDER: "mock", JOBS_ENABLED: "false", OPENROUTER_API_KEY: "", HOST: "127.0.0.1" };

test("unsupported Node and inconsistent/unsafe bindings fail clearly", () => {
  assert.throws(() => requireRuntime("22.18.0"), /Node 24\.11/);
  assert.throws(() => requireRuntime("24.10.0"), /Node 24\.11/);
  requireRuntime("24.21.0");
  requireRuntime("26.10.0");
  assert.deepEqual(developmentPorts({}), { api: 5181, web: 5180 });
  for (const env of [{ PORT: "invalid" }, { PORT: "0" }, { PORT: "65536" }, { PORT: "5180" }, { PORT: "5181", VOLUME_API_PORT: "5182" }, { HOST: "0.0.0.0" }]) {
    assert.throws(() => developmentPorts(env));
  }
});

test("occupied ports fail without stopping the unrelated listener", { timeout: 30000 }, async () => {
  const occupied = await reserve();
  const other = await reserve();
  await release(other.server);
  const run = launch({ ...safeEnv, PORT: String(other.port), VOLUME_API_PORT: String(other.port), VOLUME_WEB_PORT: String(occupied.port) });
  try {
    const [code] = await run.closed;
    assert.equal(code, 1, run.output());
    assert.match(run.output(), /EADDRINUSE/);
    assert.equal(occupied.server.listening, true);
  } finally {
    if (run.child.exitCode === null) run.child.kill("SIGTERM");
    await release(occupied.server);
  }
});

test("standalone dev starts from another cwd and SIGTERM releases both process trees", { timeout: 45000 }, async () => {
  const api = await reserve();
  const web = await reserve();
  await Promise.all([release(api.server), release(web.server)]);
  const fixture = await mkdtemp(join(tmpdir(), "volume-dev-test-"));
  const run = launch({
    ...safeEnv,
    PORT: String(api.port),
    VOLUME_API_PORT: String(api.port),
    VOLUME_WEB_PORT: String(web.port),
    WEB_ORIGINS: `http://127.0.0.1:${web.port}`,
    DATA_DIR: fixture,
    SQLITE_PATH: join(fixture, "fixture.sqlite"),
  });
  try {
    let healthy = false;
    for (let attempt = 0; attempt < 80; attempt++) {
      if (run.child.exitCode !== null) break;
      try {
        const health = await fetch(`http://127.0.0.1:${web.port}/api/v1/health`, { signal: AbortSignal.timeout(1000) });
        if (health.ok && (await health.json()).status === "ok") {
          healthy = true;
          break;
        }
      } catch {
        /* Startup is still in progress. */
      }
      await delay(200);
    }
    assert.ok(healthy, run.output());
    assert.equal((await fetch(`http://127.0.0.1:${web.port}`)).status, 200);
    run.child.kill("SIGTERM");
    const [code] = await run.closed;
    assert.equal(code, 0, run.output());
    await Promise.all([checkPort(api.port), checkPort(web.port)]);
  } finally {
    if (run.child.exitCode === null) {
      run.child.kill("SIGTERM");
      await run.closed;
    }
    await rm(fixture, { recursive: true, force: true });
  }
});
