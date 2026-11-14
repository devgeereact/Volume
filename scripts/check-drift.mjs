// Fails when the docs and the code disagree on what exists: API routes, prompts and database tables.
// Run with `npm run docs:drift`. Pure functions are exported for tests/integration/docs-drift.test.mjs.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const METHODS = 'get|post|put|patch|delete';

function stripComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
}

/** Routes registered in a Fastify route file, as "METHOD /path". Template-literal paths are skipped. */
export function routesFromSource(text) {
  const routes = new Set();
  const pattern = new RegExp(`\\b(?:app|server|api|r|fastify|scope|instance)\\.(${METHODS})(?:<[^()]*>)?\\(\\s*['"](/[^'"]*)['"]`, 'g');
  for (const match of stripComments(text).matchAll(pattern)) routes.add(`${match[1].toUpperCase()} ${match[2]}`);
  return routes;
}

/** Routes listed in the API spec table, as "METHOD /path" without the /api/v1 prefix. */
export function docRoutes(text) {
  const routes = new Set();
  for (const match of text.matchAll(/^\| (GET|POST|PUT|PATCH|DELETE) \| `\/api\/v1([^`]*)`/gm)) routes.add(`${match[1]} ${match[2]}`);
  return routes;
}

export function diffSets(code, docs) {
  return {
    onlyInCode: [...code].filter((item) => !docs.has(item)).sort(),
    onlyInDocs: [...docs].filter((item) => !code.has(item)).sort(),
  };
}

/** One id per prompt ("stage.name") from files named prompts/<stage>/<name>.v<N>.md. */
export function promptIdsFromFiles(files) {
  const ids = new Set();
  for (const file of files) {
    const match = file.replace(/\\/g, '/').match(/(?:^|\/)prompts\/([^/]+)\/([^/]+)\.v\d+\.md$/);
    if (match) ids.add(`${match[1]}.${match[2]}`);
  }
  return [...ids];
}

/** The number in a line such as "39 prompts. Version 1 of each ...", or null. */
export function docPromptCount(text) {
  const match = text.match(/^(\d+) prompts\./m);
  return match ? Number(match[1]) : null;
}

export function camelToSnake(name) {
  return name.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

/** Table names (snake case) from the `Database` interface in the Kysely schema. */
export function tableNamesFromSchema(text) {
  const block = text.match(/export interface Database \{([\s\S]*?)\n\}/);
  if (!block) return [];
  return [...block[1].matchAll(/^\s*([A-Za-z]\w*)\s*:/gm)].map((match) => camelToSnake(match[1]));
}

function listFiles(dir, keep) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? listFiles(path, keep) : keep(path) ? [path] : [];
  });
}

function read(path) {
  return readFileSync(join(root, path), 'utf8');
}

export function runChecks() {
  const results = [];
  const record = (name, problems) => results.push({ name, problems });

  const routeFiles = listFiles(join(root, 'apps/server/src/routes'), (path) => path.endsWith('.ts') && !path.endsWith('.test.ts'));
  const codeRoutes = new Set(routeFiles.flatMap((path) => [...routesFromSource(readFileSync(path, 'utf8'))]));
  const { onlyInCode, onlyInDocs } = diffSets(codeRoutes, docRoutes(read('docs/02-architecture/API-SPEC.md')));
  record('API routes match docs/02-architecture/API-SPEC.md', [
    ...onlyInCode.map((route) => `in code, not in the API spec: ${route}`),
    ...onlyInDocs.map((route) => `in the API spec, not in code: ${route}`),
  ]);

  const promptFiles = listFiles(join(root, 'prompts'), (path) => path.endsWith('.md')).map((path) => path.slice(root.length));
  const promptIds = promptIdsFromFiles(promptFiles).sort();
  const promptsDoc = read('docs/book-production/PROMPTS.md');
  const stated = docPromptCount(promptsDoc);
  record('Prompts match docs/book-production/PROMPTS.md', [
    ...(stated === promptIds.length ? [] : [`the page says ${stated ?? 'no number of'} prompts, the prompts folder has ${promptIds.length}`]),
    ...promptIds.filter((id) => !promptsDoc.includes(`\`${id}\``)).map((id) => `prompt not listed on the page: ${id}`),
  ]);

  const dataModel = read('docs/02-architecture/DATA-MODEL.md');
  const tables = tableNamesFromSchema(read('apps/server/src/db/schema.ts'));
  record('Database tables match docs/02-architecture/DATA-MODEL.md', [
    ...(tables.length ? [] : ['no tables found in the Database interface (apps/server/src/db/schema.ts)']),
    ...tables.filter((table) => !new RegExp(`\\b${table}\\b`).test(dataModel)).map((table) => `table not in the data model: ${table}`),
  ]);
  return results;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const results = runChecks();
  let failed = false;
  for (const { name, problems } of results) {
    if (problems.length === 0) console.log(`PASS: ${name}`);
    else {
      failed = true;
      console.log(`FAIL: ${name}`);
      for (const problem of problems) console.log(`  - ${problem}`);
    }
  }
  process.exitCode = failed ? 1 : 0;
}
