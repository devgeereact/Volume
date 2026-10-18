/*
 * Preloaded into one e2e test server (`node --import ./tests/e2e/slow-mock.mjs apps/server/dist/index.js`, see
 * playwright.config.ts). It adds E2E_MOCK_CALL_DELAY_MS to every call the mock AI answers, text and picture, so a
 * run that takes about 80 ms on the main server lasts long enough for a browser test to watch it, on any runner.
 * It patches the built mock adapter in memory; no product file changes and the other servers are untouched.
 */
import path from "node:path";
import { pathToFileURL } from "node:url";

const delayMs = Number(process.env.E2E_MOCK_CALL_DELAY_MS ?? "0");
if (Number.isFinite(delayMs) && delayMs > 0) {
  const url = pathToFileURL(path.resolve("apps/server/dist/adapters/mock-ai.js")).href;
  const { MockAiAdapter } = await import(url);
  const wait = () => new Promise((resolve) => setTimeout(resolve, delayMs));
  for (const name of ["runStage", "generateImage"]) {
    const original = MockAiAdapter.prototype[name];
    if (typeof original !== "function") throw new Error(`slow-mock: MockAiAdapter.${name} not found`);
    MockAiAdapter.prototype[name] = async function (...args) {
      await wait();
      return original.apply(this, args);
    };
  }
}
