// Live prompt cache check (D-063, D-064). Costs real money, so it runs only when LIVE_AI=1 is set in the command's
// environment and a key is present after loading the project .env inside this process. Keys are never printed.
// Writes chapters 1 to 3 of one book in a row on the writing default and prints, per call, the provider that
// answered, input tokens, tokens read from the cache and the cost. Budget cap: 1.00 USD for the whole run.
//
// Run: LIVE_AI=1 npx tsx packages/ai/scripts/live-cache.ts [output folder for the chapter text]

import { config as loadEnv } from 'dotenv';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAiService, isAiError } from '../src/index.ts';
import { FULL_INPUT } from '../test/helpers.ts';

const BUDGET_USD = 1;
const live = process.env['LIVE_AI'] === '1';
const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, '..', '..', '..');
loadEnv({ path: join(ROOT, '.env'), quiet: true });
const openrouterKey = process.env['OPENROUTER_API_KEY'] ?? '';
const anthropicKey = process.env['ANTHROPIC_API_KEY'] ?? '';
console.log(`OpenRouter key present: ${openrouterKey.trim() ? 'yes' : 'no'}; Anthropic key present: ${anthropicKey.trim() ? 'yes' : 'no'}`);
if (!live || !anthropicKey.trim() || !openrouterKey.trim()) {
  console.log('Result: NOT TESTED (needs LIVE_AI=1 and both keys). No network call was made.');
  process.exit(0);
}
const outDir = process.argv[2];
if (outDir) mkdirSync(outDir, { recursive: true });

const ai = createAiService({
  apiKey: openrouterKey,
  anthropicApiKey: anthropicKey,
  promptsDir: join(ROOT, 'prompts'),
  configDir: join(ROOT, 'config'),
  appTitle: 'Volume (live cache check)',
});

// A blueprint of realistic size, so the per-book start of the user part is past the cache minimum.
const TOPICS = [
  ['Arrival', 'The first night on the ward and the fear of the empty corridor.'],
  ['The Long Middle', 'What happens between two and five in the morning, and how to stay steady.'],
  ['Handover', 'Passing the night on well, so the day team starts with the full picture.'],
  ['Food And Water', 'Eating and drinking on nights without relying on the vending machine.'],
  ['Sleep After Nights', 'Protecting sleep after a run of nights, at home and on the way home.'],
  ['Asking For Help', 'When and how to ask a senior colleague for help in the small hours.'],
  ['Difficult Conversations', 'Talking with worried relatives on the phone at night.'],
  ['Mistakes And Near Misses', 'What to do in the first hour after a near miss, and how to report it.'],
  ['Your Body On Nights', 'Feet, back and eyes: looking after yourself across a twelve-hour shift.'],
  ['The Morning After', 'The drive home, the first meal and getting back to normal life.'],
] as const;
const chapters = TOPICS.map(([title, plan], i) => ({
  number: i + 1,
  title,
  summary: `${plan} The chapter opens with a concrete moment on the ward, explains why this part of night work catches new nurses out, then gives practical steps the reader can use on their next shift, with a short reflection on how it gets easier with practice. It refers back to earlier chapters in a few words rather than retelling them, and points to local policy where procedures differ between trusts.`,
  subheadings: [`What ${title} Looks Like`, 'Why It Catches You Out', 'What To Do On Your Next Shift'],
  hook: 'scene',
  wordTarget: 500,
}));
const blueprint = {
  title: 'Quiet Hours',
  subtitle: 'A Calm Guide To Night Shifts For New Nurses',
  reader: 'Newly qualified nurses in the UK facing their first run of night shifts, anxious but capable.',
  promise: 'By the end, the reader can plan a night, protect their sleep, ask for help early and hand over well.',
  voice: 'Warm, direct, a little dry; first person from an experienced night nurse.',
  chapters,
};
const sources = Array.from({ length: 8 }, (_, i) => ({
  title: `Night shift guidance part ${i + 1}`,
  url: `https://www.example.org/night-shifts/${i + 1}`,
  snippet:
    'Practical guidance for nurses working nights: planning breaks, staying hydrated, recognising fatigue, handing over safely and recovering sleep after a run of nights.',
}));

let spent = 0;
let failed = false;
const summaries: Array<{ number: number; title: string; summary: string }> = [];
for (const ch of chapters.slice(0, 3)) {
  const next = chapters[ch.number];
  try {
    const r = await ai.runStage(
      'writing.chapter',
      {
        ...FULL_INPUT,
        blueprint,
        sources,
        previousSummaries: [...summaries],
        ledger: [],
        chapter: {
          number: ch.number,
          title: ch.title,
          partTitle: null,
          subheadings: ch.subheadings,
          summary: ch.summary,
          wordTarget: ch.wordTarget,
          isLast: false,
        },
        nextChapter: next ? { title: next.title, summary: next.summary } : undefined,
      },
      { budget: { remainingUsd: Math.max(0, BUDGET_USD - spent) } },
    );
    spent += r.usage.costUsd ?? 0;
    for (const [i, c] of r.calls.entries()) {
      console.log(
        `chapter ${ch.number} call ${i + 1}: ${c.provider} ${c.model}; input ${c.usage.promptTokens}, read from cache ${c.usage.cachedTokens}; output ${c.usage.completionTokens}; cost $${(c.usage.costUsd ?? 0).toFixed(5)}`,
      );
    }
    const text = typeof r.output === 'string' ? r.output : JSON.stringify(r.output);
    console.log(
      `chapter ${ch.number}: prompt v${r.promptVersion}, ${text.split(/\s+/).filter(Boolean).length} words, guardrails passed ${r.guardrails.passed}`,
    );
    if (outDir) writeFileSync(join(outDir, `chapter-${ch.number}.md`), text);
    summaries.push({ number: ch.number, title: ch.title, summary: ch.summary });
  } catch (e) {
    failed = true;
    console.log(`chapter ${ch.number}: FAIL ${isAiError(e) ? `${e.kind}: ${e.message}` : e instanceof Error ? e.message : String(e)}`);
    break;
  }
}
console.log(`\nTotal cost reported: $${spent.toFixed(5)} of the $${BUDGET_USD.toFixed(2)} budget.`);
process.exit(failed ? 1 : 0);
