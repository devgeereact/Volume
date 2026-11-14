import assert from "node:assert/strict";
import test from "node:test";
import { diffSets, docRoutes, docPromptCount, promptIdsFromFiles, routesFromSource, tableNamesFromSchema, camelToSnake } from "../../scripts/check-drift.mjs";

test("routesFromSource reads method and path, including multi-line and generic calls, and skips template paths", () => {
  const source = [
    "app.get('/books', async () => []);",
    "app.post<{ Params: P }>('/books/:id/duplicate', async () => ({}));",
    "app.patch(",
    "  '/spreads/:id',",
    "  async () => ({}),",
    ");",
    "app.post(`/books/:id/${action}`, async () => ({}));",
    "// app.delete('/commented', async () => ({}));",
  ].join("\n");
  assert.deepEqual([...routesFromSource(source)].sort(), ["GET /books", "PATCH /spreads/:id", "POST /books/:id/duplicate"]);
});

test("docRoutes reads the API spec table and drops the /api/v1 prefix", () => {
  const table = [
    "| Method | Path | Source |",
    "| --- | --- | --- |",
    "| GET | `/api/v1/books` | `a.ts` |",
    "| POST | `/api/v1/books/:id/duplicate` | `a.ts` |",
    "| GET | `/api/health` | `h.ts` |",
  ].join("\n");
  assert.deepEqual([...docRoutes(table)].sort(), ["GET /books", "POST /books/:id/duplicate"]);
});

test("diffSets lists what is only in code and what is only in the docs", () => {
  assert.deepEqual(diffSets(new Set(["a", "b"]), new Set(["b", "c"])), { onlyInCode: ["a"], onlyInDocs: ["c"] });
});

test("promptIdsFromFiles keeps one id per prompt and ignores older versions", () => {
  const files = ["prompts/writing/chapter.v1.md", "prompts/writing/chapter.v2.md", "prompts/titles/title-options.v1.md", "prompts/README.md"];
  assert.deepEqual(promptIdsFromFiles(files).sort(), ["titles.title-options", "writing.chapter"]);
});

test("docPromptCount reads the stated count", () => {
  assert.equal(docPromptCount("intro\n\n39 prompts. Version 1 of each"), 39);
  assert.equal(docPromptCount("no count here"), null);
});

test("tableNamesFromSchema reads the Database interface keys as snake case names", () => {
  const schema =
    "export interface Other {\n  x: X;\n}\nexport interface Database {\n  workspaces: WorkspacesTable;\n  authorProfiles: AuthorProfilesTable;\n  jobEvents: JobEventsTable;\n}\n";
  assert.deepEqual(tableNamesFromSchema(schema), ["workspaces", "author_profiles", "job_events"]);
  assert.equal(camelToSnake("profileMemory"), "profile_memory");
});
