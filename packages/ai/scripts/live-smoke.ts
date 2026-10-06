// Live smoke test against OpenRouter. Costs real money, so it runs only when BOTH are true:
//   1. LIVE_AI=1 is set in the environment of the command (it is read before .env is loaded, so .env cannot set it);
//   2. OPENROUTER_API_KEY is present after loading the project .env file inside this process.
// Budget cap: 0.50 USD for the whole run. No image call unless LIVE_AI_IMAGES=1.
// The key is never printed: only "key present: yes/no".
//
// Run: LIVE_AI=1 npm run smoke:live -w packages/ai

import { config as loadEnv } from 'dotenv';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAiService, isAiError, type ModelInfo } from '../src/index.ts';

const BUDGET_USD = 0.5;
const live = process.env['LIVE_AI'] === '1';
const liveImages = process.env['LIVE_AI_IMAGES'] === '1';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, '..', '..', '..');
loadEnv({ path: join(ROOT, '.env'), quiet: true });
const apiKey = process.env['OPENROUTER_API_KEY'] ?? '';
const keyPresent = apiKey.trim().length > 0;

console.log(`key present: ${keyPresent ? 'yes' : 'no'}`);
console.log(`LIVE_AI=1: ${live ? 'yes' : 'no'}`);
if (!keyPresent || !live) {
  console.log('Result: NOT TESTED (needs both the key and LIVE_AI=1). No network call was made.');
  process.exit(0);
}

let spent = 0;
const remaining = () => ({ remainingUsd: Math.max(0, BUDGET_USD - spent) });
const money = (n: number | null) => (n === null ? 'unknown' : `$${n.toFixed(5)}`);
const results: Array<{ step: string; status: 'PASS' | 'FAIL' | 'SKIPPED'; detail: string }> = [];

const ai = createAiService({
  apiKey,
  promptsDir: join(ROOT, 'prompts'),
  configDir: join(ROOT, 'config'),
  appTitle: 'Volume (live smoke)',
});

function describeError(e: unknown): string {
  if (isAiError(e)) return `${e.kind}${e.status ? ` ${e.status}` : ''}: ${e.message}`;
  return e instanceof Error ? e.message : String(e);
}

// 1. Model list and slug check.
let models: ModelInfo[];
try {
  models = await ai.listModels({ refresh: true });
  const listed = new Set(models.map((m) => m.slug));
  const missing: string[] = [];
  const lines: string[] = [];
  for (const [slug, stages] of ai.registry.configuredSlugs()) {
    const info = ai.registry.modelInfo(slug);
    if (!listed.has(slug)) missing.push(`${slug} (${stages.join(', ')})`);
    lines.push(`  ${listed.has(slug) ? 'ok     ' : 'MISSING'} ${slug}${info?.aliasTarget ? ` -> ${info.aliasTarget}` : ''} [${stages.join(', ')}]`);
  }
  console.log(`\nModels listed by OpenRouter: ${models.length}`);
  console.log(lines.join('\n'));
  results.push({
    step: 'listModels + slug check',
    status: missing.length === 0 ? 'PASS' : 'FAIL',
    detail: missing.length === 0 ? `all ${ai.registry.configuredSlugs().size} configured slugs listed` : `missing: ${missing.join('; ')}`,
  });
} catch (e) {
  results.push({ step: 'listModels + slug check', status: 'FAIL', detail: describeError(e) });
}

// 2. One tiny titles call on the cheapest text default.
const textDefaults = Object.entries(ai.registry.defaults.stages)
  .filter(([stage]) => stage !== 'cover_image')
  .map(([, s]) => s.defaultModel);
const cheapest = [...new Set(textDefaults)]
  .map((slug) => ({ slug, p: ai.registry.pricing(slug) }))
  .filter((x) => x.p && x.p.inputPerMillion !== null && x.p.outputPerMillion !== null)
  .sort((a, b) => (a.p?.inputPerMillion ?? 0) + (a.p?.outputPerMillion ?? 0) - ((b.p?.inputPerMillion ?? 0) + (b.p?.outputPerMillion ?? 0)))[0];

const profile = {
  penName: 'Test Author',
  perspective: 'A UK primary school teacher who writes practical guides for parents.',
  credentials: null,
};

if (!cheapest) {
  results.push({ step: 'titles call', status: 'FAIL', detail: 'no priced default model found' });
} else {
  try {
    const r = await ai.runStage(
      'titles.topic-directions',
      {
        profile,
        book: { idea: 'A short guide to helping children with reading at home', type: 'nonfiction' },
        research: { ideaSummary: 'Parents want simple reading routines.' },
        sources: [],
      },
      { model: cheapest.slug, budget: remaining(), overrides: { book: { titles: { params: { maxTokens: 3000 } } } } },
    );
    spent += r.usage.costUsd ?? 0;
    results.push({
      step: `titles.topic-directions on cheapest default ${cheapest.slug}`,
      status: r.output.directions.length > 0 ? 'PASS' : 'FAIL',
      detail: `answered by ${r.model}; ${r.output.directions.length} directions; tokens ${r.usage.promptTokens} in / ${r.usage.completionTokens} out; cost ${money(r.usage.costUsd)} (${r.usage.costSource}); repaired ${r.repaired}; calls ${r.calls.length}; guardrails passed ${r.guardrails.passed} (blocking: ${r.guardrails.blocking.map((h) => h.rule).join(', ') || 'none'}; needs attention: ${r.guardrails.needsAttention.map((h) => h.phrase ?? h.match).join(', ') || 'none'}; style rewrite: ${r.guardrails.styleRewrite ? `${r.guardrails.styleRewrite.phrases.join(', ')} -> applied ${r.guardrails.styleRewrite.applied}, cleared ${r.guardrails.styleRewrite.cleared}${r.guardrails.styleRewrite.note ? ` (${r.guardrails.styleRewrite.note})` : ''}` : 'not needed'})`,
    });
  } catch (e) {
    results.push({ step: `titles.topic-directions on ${cheapest.slug}`, status: 'FAIL', detail: describeError(e) });
  }
}

// 3. One research call with web search; needs at least one url_citation source.
try {
  const r = await ai.runStage(
    'research.title-research',
    {
      profile,
      book: { idea: 'A short guide to helping children with reading at home', type: 'nonfiction', audience: 'UK parents of children aged 5 to 7' },
    },
    { budget: remaining() },
  );
  spent += r.usage.costUsd ?? 0;
  results.push({
    step: `research.title-research with web search on ${r.sentModel}`,
    status: r.sources.length >= 1 && r.sources.some((s) => !s.unresolved) ? 'PASS' : 'FAIL',
    detail: `answered by ${r.model}; ${r.sources.length} url_citation sources, ${r.sources.filter((s) => s.unresolved).length} unresolved, ${r.sources.filter((s) => /vertexaisearch\.cloud\.google\.com/.test(s.url) && !s.unresolved).length} redirect links left unflagged; domains: ${[...new Set(r.sources.map((s) => s.domain ?? '(unresolved)'))].join(', ') || 'none'}; guardrails passed ${r.guardrails.passed} (needs attention: ${r.guardrails.needsAttention.map((h) => h.phrase ?? h.match).join(', ') || 'none'}; style rewrite: ${r.guardrails.styleRewrite ? `applied ${r.guardrails.styleRewrite.applied}, cleared ${r.guardrails.styleRewrite.cleared}` : 'not needed'}); calls ${r.calls.length}; tokens ${r.usage.promptTokens} in / ${r.usage.completionTokens} out; cost ${money(r.usage.costUsd)} (${r.usage.costSource}); repaired ${r.repaired}; notes: ${r.notes.join(' ') || 'none'}`,
  });
} catch (e) {
  results.push({ step: 'research.title-research with web search', status: 'FAIL', detail: describeError(e) });
}

// 4. Image call only when asked.
if (liveImages) {
  try {
    const r = await ai.generateImage('A calm watercolour of an open book on a wooden table by a window, soft morning light, no text, no letters', {
      n: 1,
      budget: remaining(),
    });
    spent += r.usage.costUsd ?? 0;
    results.push({
      step: `image on ${r.model}`,
      status: r.images.length > 0 ? 'PASS' : 'FAIL',
      detail: `${r.images.length} image(s), ${r.images[0]?.mediaType ?? '?'}, ${r.images[0]?.data.length ?? 0} bytes; cost ${money(r.usage.costUsd)}`,
    });
  } catch (e) {
    results.push({ step: 'image', status: 'FAIL', detail: describeError(e) });
  }
} else {
  results.push({ step: 'image', status: 'SKIPPED', detail: 'LIVE_AI_IMAGES is not 1' });
}

console.log('\nResults:');
for (const r of results) console.log(`- ${r.status} ${r.step}: ${r.detail}`);
console.log(`\nTotal cost reported: $${spent.toFixed(5)} of the $${BUDGET_USD.toFixed(2)} budget.`);
process.exit(results.some((r) => r.status === 'FAIL') ? 1 : 0);
