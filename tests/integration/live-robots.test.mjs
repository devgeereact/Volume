import assert from "node:assert/strict";
import test from "node:test";
import { robotsProblems } from "../../scripts/live-robots.mjs";

/* The deploy script's live check used to demand the word "noindex" on the landing page. D-068 (1 November 2026) made
   / and /how-it-works indexable on purpose, so the release that carries it failed its own live check on 8 November and
   was rolled back (Deploy run 42535571560). What must stay true on every release is that the private app is not
   indexed; the landing page may be either. */

const page = (robots) =>
  `<!doctype html><html><head><title>x</title>${robots === null ? "" : `<meta name="robots" content="${robots}">`}</head><body></body></html>`;

test("accepts the old release: landing page noindex, sign-in noindex", () => {
  assert.deepEqual(robotsProblems(page("noindex, nofollow"), page("noindex, nofollow")), []);
});

test("accepts the release that indexes the landing page on purpose (D-068)", () => {
  assert.deepEqual(robotsProblems(page("index, follow, max-image-preview:large"), page("noindex, nofollow")), []);
});

test("reports a landing page with no robots meta at all", () => {
  const problems = robotsProblems(page(null), page("noindex, nofollow"));
  assert.equal(problems.length, 1);
  assert.match(problems[0], /landing page has no robots meta/);
});

test("reports a sign-in page that search engines may index", () => {
  const problems = robotsProblems(page("index, follow"), page("index, follow"));
  assert.equal(problems.length, 1);
  assert.match(problems[0], /sign-in page is not noindex/);
});

test("does not take the word noindex written somewhere else on the page for the meta tag", () => {
  const sneaky = `<!doctype html><html><head><meta name="robots" content="index, follow"></head><body>/* noindex */</body></html>`;
  const problems = robotsProblems(page("index, follow"), sneaky);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /sign-in page is not noindex/);
});

test("reads the meta tag whichever way round its attributes are written", () => {
  const swapped = `<meta content="noindex, nofollow" name="robots">`;
  assert.deepEqual(robotsProblems(page("index, follow"), swapped), []);
});
