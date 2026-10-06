// Context packer: turns a stage input into prompt variables, in the block order of docs/04-AI-PIPELINE.md,
// and trims until the rendered request fits 60% of the model's context length. Trimming order: source
// excerpts first, then older chapter summaries shortened to 40 words, then voice samples drop to one.
// System rules, voice and the task itself are never trimmed; if it still does not fit the call stops.

import { configVariables, type ConfigBundle } from './config.ts';
import { ContextTooLargeError } from './errors.ts';
import type { PromptLoader, RenderedPrompt } from './prompts.ts';
import type { Source } from './types.ts';
import { asObject, asString, estimateTokens, truncateWords } from './util.ts';
import type { SourceInput, VoiceDna } from './stages/inputs.ts';

/** Variables that carry owner text or web content. They are wrapped in <data> tags so the model treats them as data. */
export const FENCED_VARIABLES: ReadonlySet<string> = new Set([
  'text',
  'selection.text',
  'selection.before',
  'selection.after',
  'weave.before',
  'weave.after',
  'note.text',
  'note.intent',
  'research',
  'research.sources',
  'book.idea',
  'book.quotes',
  'keepLines',
  'cover.ownerIdeas',
  'cover.shelfNotes',
  'description',
  'categoriesSeen',
  'rewrite.instruction',
  'regenerate.instruction',
]);

export interface PackLevel {
  dropExcerpts: boolean;
  shortenOlderSummaries: boolean;
  maxVoiceSamples: number;
}

export const PACK_LEVELS: PackLevel[] = [
  { dropExcerpts: false, shortenOlderSummaries: false, maxVoiceSamples: 2 },
  { dropExcerpts: true, shortenOlderSummaries: false, maxVoiceSamples: 2 },
  { dropExcerpts: true, shortenOlderSummaries: true, maxVoiceSamples: 2 },
  { dropExcerpts: true, shortenOlderSummaries: true, maxVoiceSamples: 1 },
];

export function assignSourceIds(sources: SourceInput[] | null | undefined): Source[] {
  return (sources ?? []).map((s, i) => ({
    id: s.id ?? `S${i + 1}`,
    title: s.title,
    url: s.url,
    snippet: s.snippet ?? '',
  }));
}

export function formatSources(sources: Source[], withExcerpts = true): string {
  if (sources.length === 0) return 'None';
  return sources.map((s) => `[${s.id}] ${s.title}, ${s.url}${withExcerpts && s.snippet ? `, ${s.snippet.replace(/\s+/g, ' ').trim()}` : ''}`).join('\n');
}

export function formatSummaries(list: Array<{ number: number; title: string; summary: string }>, shortenOlder = false): string {
  if (list.length === 0) return 'None';
  return list
    .map((c, i) => {
      const older = i < list.length - 1;
      const summary = shortenOlder && older ? truncateWords(c.summary, 40) : c.summary;
      return `Chapter ${c.number}, ${c.title}: ${summary}`;
    })
    .join('\n');
}

/** Ledger kinds in the order and wording the "used already, do not repeat" list shows them. */
const LEDGER_GROUPS: ReadonlyArray<{ kinds: readonly string[]; heading: string }> = [
  { kinds: ['term'], heading: 'Terms already defined (use them freely, never define them again)' },
  {
    kinds: ['warning', 'caution', 'disclaimer'],
    heading: 'Warnings, cautions and disclaimers already given (do not repeat them; a short pointer back is enough)',
  },
  { kinds: ['story'], heading: 'Stories already told (never retell them; refer back in a few words if needed)' },
  { kinds: ['example'], heading: 'Examples already used (choose new ones)' },
  { kinds: ['metaphor'], heading: 'Metaphors and images already used (choose new ones)' },
  { kinds: ['quote'], heading: 'Quotes already used (do not quote them again)' },
  { kinds: ['fact'], heading: 'Facts already stated (do not state them again as if new)' },
  { kinds: ['name'], heading: 'Names already used (keep each person or character in the same role)' },
  { kinds: ['phrase'], heading: 'Phrases leaned on too often (do not use them again)' },
];

/**
 * The used-already ledger as a grouped "used already, do not repeat" list: defined terms, warnings given,
 * stories, examples and phrases, each under a heading that says what to do with it.
 */
export function formatLedger(list: Array<{ kind: string; key: string; detail?: string | null | undefined }>): string {
  if (list.length === 0) return 'None';
  const line = (e: { key: string; detail?: string | null | undefined }): string => `- ${e.key}${e.detail ? `: ${e.detail}` : ''}`;
  const known = new Set(LEDGER_GROUPS.flatMap((g) => g.kinds));
  const blocks: string[] = [];
  for (const g of LEDGER_GROUPS) {
    const items = list.filter((e) => g.kinds.includes(e.kind));
    if (items.length) blocks.push(`${g.heading}:\n${items.map(line).join('\n')}`);
  }
  const other = list.filter((e) => !known.has(e.kind));
  if (other.length)
    blocks.push(`Other things already used (do not repeat):\n${other.map((e) => `- [${e.kind}] ${e.key}${e.detail ? `: ${e.detail}` : ''}`).join('\n')}`);
  return blocks.join('\n\n');
}

function factText(v: unknown): string | null {
  if (Array.isArray(v)) {
    const items = v.filter((x) => typeof x === 'string' && x.trim()).map(String);
    return items.length ? items.join('; ') : null;
  }
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

/**
 * The profile facts block ({{profile.facts}}): the only personal facts a reader-facing prompt may state about the
 * author. Built from the profile, never from model text. Null when the profile holds nothing.
 */
export function formatProfileFacts(profile: Record<string, unknown>): string | null {
  const lines: string[] = [];
  const name = factText(profile['penName']);
  const real = profile['isRealPerson'];
  if (name)
    lines.push(
      `Name on the book: ${name}${real === true ? ' (a real person writing under their own name)' : real === false ? ' (a pen name; a persona, not a real person)' : ''}`,
    );
  const who = factText(profile['perspective']);
  if (who) lines.push(`Who the author is: ${who}`);
  const credentials = factText(profile['credentials']);
  lines.push(`Credentials: ${credentials ?? 'none listed (say nothing about credentials either way)'}`);
  const location = factText(profile['location']);
  if (location) lines.push(`Based in: ${location}`);
  const bio = factText(profile['bio']);
  if (bio) lines.push(`Approved bio (third person):\n${bio}`);
  const links = factText(profile['links']);
  if (links) lines.push(`Links: ${links}`);
  const thanks = factText(profile['acknowledgementNames']);
  lines.push(`People the owner has named for thanks: ${thanks ?? 'none (thank no one by name or by group)'}`);
  const dedication = factText(profile['dedicationNames']);
  if (dedication) lines.push(`Names the owner allows in a dedication: ${dedication}`);
  const illus = profile['illustrativeLine'];
  if (typeof illus === 'boolean') {
    lines.push(
      illus
        ? 'Illustrative stories note: the copyright page already says that stories are illustrative composites. Do not add that disclaimer in the text; at most one short label (such as "a composite") the first time each composite story appears.'
        : 'Illustrative stories note: none on the copyright page.',
    );
  }
  return lines.length ? lines.join('\n') : null;
}

function listText(v: unknown): string | undefined {
  if (Array.isArray(v)) return v.length ? v.map((x) => `- ${String(x)}`).join('\n') : undefined;
  return typeof v === 'string' && v.trim() ? v : undefined;
}

/** Voice DNA as prompt text: notes, characteristics, the "does not sound like" sample and memory items. */
export function formatVoice(voice: string | VoiceDna | null | undefined, acceptedEdits?: unknown): string | null | undefined {
  if (voice === undefined) return undefined;
  if (voice === null) return null;
  const memory = listText(acceptedEdits);
  if (typeof voice === 'string') return voice;
  const parts: string[] = [];
  if (voice.notes) parts.push(voice.notes);
  if (voice.characteristics?.length) parts.push(`Characteristics: ${voice.characteristics.join('; ')}.`);
  if (voice.notLike) parts.push(`Does not sound like this:\n${voice.notLike}`);
  const mem = [...(voice.memory ?? [])];
  if (mem.length) parts.push(`Remember:\n${mem.map((m) => `- ${m}`).join('\n')}`);
  else if (memory && parts.length === 0) parts.push(memory);
  return parts.length ? parts.join('\n\n') : null;
}

function compactJson(v: unknown): unknown {
  if (v === undefined || v === null) return v;
  if (typeof v === 'string') return v;
  return JSON.stringify(v);
}

function quotesText(q: unknown): unknown {
  if (!Array.isArray(q)) return q;
  if (q.length === 0) return null;
  return q
    .map((x) => {
      const o = asObject(x);
      return o ? `"${asString(o['text']) ?? ''}" (${asString(o['attribution']) ?? ''})` : String(x);
    })
    .join('\n');
}

/** Build every prompt variable from a stage input plus config. */
export function buildVariables(input: Record<string, unknown>, config: ConfigBundle, level: PackLevel = PACK_LEVELS[0] as PackLevel): Record<string, unknown> {
  const v: Record<string, unknown> = {};
  for (const [k, val] of Object.entries(input)) {
    v[k] = val;
    const o = asObject(val);
    if (o) for (const [s, sv] of Object.entries(o)) v[`${k}.${s}`] = sv;
  }

  const profile = asObject(input['profile']) ?? {};
  if (asObject(input['profile'])) v['profile.facts'] = formatProfileFacts(profile);
  const voiceRaw = profile['voice'] as string | VoiceDna | null | undefined;
  if ('voice' in profile) v['profile.voice'] = formatVoice(voiceRaw, profile['acceptedEdits']);
  const dna = asObject(voiceRaw) as VoiceDna | undefined;
  const ownSample = profile['voiceSample'];
  if ((ownSample === undefined || ownSample === null || ownSample === '') && dna?.soundsLike?.length) {
    v['profile.voiceSample'] = dna.soundsLike.slice(0, level.maxVoiceSamples).join('\n\n');
  } else if (typeof profile['voiceSample'] === 'string' && level.maxVoiceSamples < 2) {
    v['profile.voiceSample'] = truncateWords(profile['voiceSample'], 250);
  }

  const book = asObject(input['book']) ?? {};
  if ('quotes' in book) v['book.quotes'] = quotesText(book['quotes']);

  if (input['sources'] !== undefined) {
    const sources = assignSourceIds(input['sources'] as SourceInput[] | null);
    v['research.sources'] = formatSources(sources, !level.dropExcerpts);
  }
  if (input['previousSummaries'] !== undefined && input['previousSummaries'] !== null) {
    v['previousSummaries'] = formatSummaries(
      input['previousSummaries'] as Array<{ number: number; title: string; summary: string }>,
      level.shortenOlderSummaries,
    );
  }
  if (input['ledger'] !== undefined && input['ledger'] !== null) {
    v['ledger'] = formatLedger(input['ledger'] as Array<{ kind: string; key: string; detail?: string | null }>);
  }
  for (const k of ['blueprint', 'template', 'research', 'direction', 'brief', 'concept']) {
    if (k in input) v[k] = compactJson(input[k]);
  }
  if ('storyResult' in input) v['story'] = compactJson(input['storyResult']);

  const chapter = asObject(input['chapter']);
  if (chapter?.['isLast'] === true && input['nextChapter'] === undefined) {
    v['nextChapter.title'] = null;
    v['nextChapter.summary'] = null;
  }
  // Cover concepts: the book setting (1 to 4), three when it is not set.
  if (v['cover.conceptCount'] === undefined || v['cover.conceptCount'] === null) v['cover.conceptCount'] = 3;
  if (typeof input['kdpSelect'] === 'boolean') {
    v['kdpSelect'] = input['kdpSelect'] ? 'Enrolled in KDP Select (eBook exclusive to the Kindle Store for 90 days)' : 'Not enrolled in KDP Select';
  }

  const banned = Array.isArray(profile['bannedPhrases']) ? (profile['bannedPhrases'] as string[]) : [];
  const cfg = configVariables(config, banned);
  for (const [k, val] of Object.entries(cfg)) {
    if (k === 'goLiveNote') {
      if (v[k] === undefined) v[k] = val;
    } else {
      v[k] = val;
    }
  }
  return v;
}

export interface PackedPrompt {
  rendered: RenderedPrompt;
  estimatedTokens: number;
  /** Pack level used (0 = nothing trimmed). */
  level: number;
  trimmed: string[];
}

/**
 * Render a prompt, trimming the input until it fits `limitTokens` (60% of the model's context length).
 * The final throw is ContextTooLargeError.
 */
export function packAndRender(
  loader: PromptLoader,
  promptId: string,
  input: Record<string, unknown>,
  config: ConfigBundle,
  opts: { limitTokens: number; version?: number | undefined; extraValues?: Record<string, unknown> | undefined },
): PackedPrompt {
  let last: { rendered: RenderedPrompt; tokens: number } | undefined;
  const notes = ['source excerpts dropped', 'older chapter summaries shortened to 40 words', 'voice samples cut to one'];
  for (let i = 0; i < PACK_LEVELS.length; i += 1) {
    const level = PACK_LEVELS[i] as PackLevel;
    const values = { ...buildVariables(input, config, level), ...(opts.extraValues ?? {}) };
    const rendered = loader.render(promptId, values, { version: opts.version, fence: FENCED_VARIABLES });
    const tokens = rendered.messages.reduce((n, m) => n + estimateTokens(m.content), 0);
    last = { rendered, tokens };
    if (tokens <= opts.limitTokens) return { rendered, estimatedTokens: tokens, level: i, trimmed: notes.slice(0, i) };
  }
  throw new ContextTooLargeError(last?.tokens ?? 0, opts.limitTokens);
}
