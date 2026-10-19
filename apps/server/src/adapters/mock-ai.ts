import { crc32, deflateSync } from 'node:zlib';
import { sha256Hex } from '../lib/util.js';
import {
  AiModelUnavailableError,
  AiRetryableError,
  type AiCostEstimate,
  type AiImageEstimate,
  type AiImageResult,
  type AiPort,
  type AiSource,
  type AiStage,
  type AiStageInput,
  type AiStageOutputMap,
  type AiStageResult,
  type GenerateImageOptions,
  type RunStageOptions,
} from '../ports/ai.js';

/**
 * MOCK AI adapter. Deterministic fixture content, clearly marked "[MOCK]",
 * so every flow works end to end without a key or any network call.
 * Replaced by an @volume/ai adapter once packages/ai is ready.
 */

export const MOCK_COST_PER_CALL_USD = 0.001;
const MOCK_MARK = '[MOCK]';
/**
 * The matter stage's mock blurb and description (the listing job). The pack and the wrap use them over the blueprint
 * drafts, so the blurb reads like a short real one (the e2e pack check wants more than 20 characters).
 */
export const MOCK_MATTER_BLURB = `${MOCK_MARK} Back-cover blurb from the matter stage: what the finished book does for the reader, from its written chapters.`;
export const MOCK_MATTER_DESCRIPTION = `<p>${MOCK_MARK} Amazon description from the matter stage.</p>`;

function str(v: unknown, fallback: string): string {
  return typeof v === 'string' && v.trim().length > 0 ? v : fallback;
}

/** Marketing items the mock returns: the job's count (1 to 20), else 1. */
function mockCount(v: unknown): number {
  return typeof v === 'number' && Number.isInteger(v) && v >= 1 ? Math.min(20, v) : 1;
}

function obj(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

function arr(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

function mockChapter(n: number): AiStageOutputMap['blueprint']['chapters'][number] {
  return {
    number: n,
    title: `${MOCK_MARK} Chapter ${n}`,
    part: null,
    subheadings: [`First idea of chapter ${n}`, `Second idea of chapter ${n}`, `Third idea of chapter ${n}`],
    summary: `${MOCK_MARK} Summary of chapter ${n}. Placeholder text from the mock writer.`,
    word_target: 2500,
    key_points: [`Key point ${n}.1`, `Key point ${n}.2`],
    takeaways: true,
    bridge_note: `Leads into chapter ${n + 1}.`,
  };
}

/** The book's template id from the stage variables (templateId, the id in the template rules, or the template string). */
function templateOf(v: Record<string, unknown>): string {
  const t = v['template'];
  if (typeof v['templateId'] === 'string' && v['templateId']) return v['templateId'];
  if (typeof t === 'string' && t) return t;
  const id = obj(t)['id'];
  return typeof id === 'string' && id ? id : 'nonfiction';
}

/** A fiction chapter plan: no subheadings, no takeaways, a viewpoint character, a setting and scene beats (D-043). */
function mockFictionChapter(n: number): AiStageOutputMap['blueprint']['chapters'][number] {
  return {
    ...mockChapter(n),
    subheadings: [],
    key_points: [],
    takeaways: false,
    povCharacter: 'Mara Quill',
    setting: n % 2 === 1 ? 'The Lighthouse' : 'Harbour Market',
    scenes: [`Mara arrives at the scene of chapter ${n}.`, `A choice that turns chapter ${n}.`],
  };
}

/** A workbook chapter plan: two planned exercises per chapter (template asks for 2 to 4). */
function mockWorkbookChapter(n: number): AiStageOutputMap['blueprint']['chapters'][number] {
  return {
    ...mockChapter(n),
    exercises: [
      { kind: 'reflection', title: `Looking Back ${n}`, purpose: 'Notice what already works.', lines: 6 },
      { kind: 'checklist', title: `Ready List ${n}`, purpose: 'Small steps to start this week.', lines: null },
    ],
  };
}

const MOCK_STORY_BIBLE = {
  logline: `${MOCK_MARK} A lighthouse keeper's daughter finds the courage to keep the light burning.`,
  themes: ['courage', 'belonging'],
  characters: [
    {
      name: 'Mara Quill',
      role: 'protagonist',
      want: 'To leave the island',
      need: 'To stay and belong',
      flaw: 'Stubborn',
      voiceNotes: 'Dry, quick',
      appearance: 'Red coat',
    },
  ],
  settings: [
    { name: 'The Lighthouse', description: 'A white tower on the rocks.' },
    { name: 'Harbour Market', description: 'Stalls by the quay.' },
  ],
  timeline: ['The storm comes.', 'The light fails.', 'Mara keeps it burning.'],
  worldRules: ['No magic.'],
  povPlan: 'Close third on Mara throughout.',
  ending: 'Mara stays.',
};

function buildOutput<S extends AiStage>(stage: S, input: AiStageInput): AiStageOutputMap[S] {
  const v = input.variables;
  const title = str(v['title'], str(v['idea'], 'Untitled book'));
  let out: unknown;
  switch (stage) {
    case 'research':
      out = {
        audience: { who: `${MOCK_MARK} Busy readers interested in ${title}`, situation: 'Starting out', level: 'beginner' },
        problems: ['Not enough time', 'Too much conflicting advice'],
        angles: [
          { angle: 'Practical first steps', why: 'Readers want quick wins' },
          { angle: 'Plain-English explanations', why: 'Jargon puts beginners off' },
          { angle: 'Real routines', why: 'Habits stick better than theory' },
        ],
        competing_themes: ['Generic overviews'],
        gaps: ['Step-by-step plans for UK readers'],
        keyword_ideas: Array.from({ length: 10 }, (_, i) => `${title.toLowerCase()} idea ${i + 1}`),
        notes: `${MOCK_MARK} Mock research. No web search was run.`,
      };
      break;
    case 'titles': {
      const directions = ['practical', 'story', 'quick', 'deep', 'friendly'].map((key, i) => ({
        key,
        label: `${MOCK_MARK} Direction ${i + 1}`,
        angle: `${key} angle`,
        audience: 'Beginners',
        promise: 'A clear path forward',
      }));
      // A chosen direction (the owner picked one) gets all ten options, like the real adapter.
      const chosen = v['direction'] && typeof v['direction'] === 'object' ? (v['direction'] as Record<string, unknown>) : null;
      const chosenKey = chosen && typeof chosen['key'] === 'string' ? chosen['key'] : null;
      out = {
        directions: chosen ? [{ ...directions[0], ...chosen, key: chosenKey ?? 'chosen' }] : directions,
        options: Array.from({ length: 10 }, (_, i) => ({
          title: `${title} ${MOCK_MARK} Option ${i + 1}`,
          subtitle: `A plain guide, version ${i + 1}`,
          direction_key: chosen ? (chosenKey ?? 'chosen') : (directions[i % 5]?.key ?? 'practical'),
        })),
      };
      break;
    }
    case 'blueprint': {
      const template = templateOf(v);
      const chapterFor = template === 'fiction' ? mockFictionChapter : template === 'workbook' ? mockWorkbookChapter : mockChapter;
      const count = Math.max(1, Math.min(30, Number(v['chapterCount'] ?? 3) || 3));
      const total = typeof v['wordTarget'] === 'number' && v['wordTarget'] > 0 ? v['wordTarget'] : null;
      const split = total
        ? {
            introduction: Math.max(100, Math.round((total * 0.06) / 50) * 50),
            conclusion: Math.max(100, Math.round((total * 0.05) / 50) * 50),
            chapter: Math.max(100, Math.round((total * 0.89) / count / 50) * 50),
          }
        : { introduction: 1500, conclusion: 1200, chapter: 2500 };
      out = {
        title,
        subtitle: str(v['subtitle'], 'A mock subtitle'),
        summary: `${MOCK_MARK} Book summary for ${title}.`,
        audience: 'Beginners',
        usps: ['Clear', 'Practical', 'Kind'],
        tone_notes: 'Warm and direct',
        hook_style: 'question',
        parts: [],
        // Like a well-behaved model: the introduction, conclusion and chapters share the book's word target.
        chapters: Array.from({ length: count }, (_, i) => ({ ...chapterFor(i + 1), word_target: split.chapter })),
        front: { dedication: '', introduction: { summary: `${MOCK_MARK} Introduction plan`, word_target: split.introduction } },
        back: { conclusion: { summary: `${MOCK_MARK} Conclusion plan`, word_target: split.conclusion } },
        back_blurb: `${MOCK_MARK} Back cover blurb.`,
        description_draft: `${MOCK_MARK} Description draft.`,
        categories: ['Mock category 1', 'Mock category 2', 'Mock category 3'],
        keywords: Array.from({ length: 7 }, (_, i) => `mock keyword ${i + 1}`),
        ...(template === 'fiction' ? { storyBible: MOCK_STORY_BIBLE } : {}),
      };
      break;
    }
    case 'blueprint_part': {
      const part = str(v['part'], 'summary');
      const instruction = str(v['instruction'], '');
      let data: unknown;
      if (part === 'summary') data = { summary: `${MOCK_MARK} Regenerated summary. ${instruction}`.trim() };
      else if (part === 'chapters') data = { chapters: [mockChapter(1), mockChapter(2), mockChapter(3)] };
      else if (part.startsWith('chapter:')) {
        const n = Number(part.split(':')[1] ?? 1);
        data = { ...mockChapter(n), title: `${MOCK_MARK} Regenerated chapter ${n}` };
      } else if (part === 'listing') {
        data = {
          back_blurb: `${MOCK_MARK} Regenerated blurb.`,
          description_draft: `${MOCK_MARK} Regenerated description.`,
          categories: ['Mock A', 'Mock B', 'Mock C'],
          keywords: Array.from({ length: 7 }, (_, i) => `regenerated keyword ${i + 1}`),
        };
      } else data = { note: `${MOCK_MARK} Regenerated ${part}` };
      out = { part, data };
      break;
    }
    case 'writing': {
      if (input.promptId === 'writing.extend-section') {
        // The extend pass keeps the section and adds substance after it.
        out = { markdown: `${str(v['markdown'], '')}\n\n${MOCK_MARK} A further paragraph from the extend pass, with one more worked example.` };
        break;
      }
      const plan = obj(v['section']);
      const heading = str(plan['title'], 'Untitled section');
      const subs = arr(plan['subheadings']).filter((s): s is string => typeof s === 'string');
      const template = templateOf(v);
      if (template === 'fiction' && plan['kind'] === 'chapter') {
        // Fiction: scenes split by scene breaks, no subheadings, no takeaways.
        const scenes = arr(plan['scenes']).filter((s): s is string => typeof s === 'string');
        const beats = scenes.length ? scenes : ['The first scene.', 'The second scene.'];
        const body = beats.flatMap((b, i) => [...(i > 0 ? ['***', ''] : []), `${MOCK_MARK} ${b} Mara watched the harbour lights go out one by one.`, '']);
        out = { markdown: [`# ${heading}`, '', ...body].join('\n').trimEnd() };
        break;
      }
      const exercises =
        template === 'workbook' && plan['kind'] === 'chapter'
          ? arr(plan['exercises'])
              .map(obj)
              .flatMap((e) => {
                const title = str(e['title'], 'Exercise');
                if (e['kind'] === 'checklist')
                  return ['', `::: exercise checklist ${title}`, '- [ ] Pick one small step', '- [ ] Set a ten-minute timer', ':::'];
                const lines = typeof e['lines'] === 'number' ? e['lines'] : 6;
                return ['', `::: exercise reflection ${title}`, 'What already works for you, and why?', '', `::: lines ${lines}`, ':::', ':::'];
              })
          : [];
      const paras = [
        `# ${heading}`,
        '',
        `${MOCK_MARK} What if the next hour could change how you see this? This opening paragraph is placeholder text from the mock writer.`,
        '',
        ...subs.flatMap((s, i) => [`## ${s}`, '', `${MOCK_MARK} Paragraph ${i + 1} for "${s}". It is written in the first person and kept short.`, '']),
        `${MOCK_MARK} In the next chapter we build on this.`,
        ...exercises,
      ];
      out = { markdown: paras.join('\n') };
      break;
    }
    case 'summarise':
      out = {
        summary: `${MOCK_MARK} Short summary of the section.`,
        ledger: [
          { kind: 'metaphor', key: 'mock-metaphor', detail: 'Placeholder metaphor used once.' },
          // Fiction (summarise-and-ledger v5): characters and settings on the page.
          ...(templateOf(v) === 'fiction'
            ? [
                { kind: 'character', key: 'Mara Quill', detail: 'protagonist: red coat' },
                { kind: 'setting', key: 'The Lighthouse', detail: 'A white tower on the rocks.' },
              ]
            : []),
        ],
      };
      break;
    case 'checks': {
      const text = str(v['markdown'], '');
      const found = mockClaimSentence(text);
      out = {
        claims: [
          {
            sentence: found?.sentence ?? 'Mock sentence.',
            category: 'other_fact',
            check_needed: `${MOCK_MARK} Confirm this statement.`,
            start: found?.start ?? null,
            end: found ? found.start + found.sentence.length : null,
            softer: `${MOCK_MARK} A softer version of this sentence.`,
          },
        ],
        consistency: [],
      };
      break;
    }
    case 'editing': {
      const text = str(v['markdown'], '');
      const sel = obj(v['selection']);
      if (v['pass'] === 'selection' && typeof sel['start'] === 'number' && typeof sel['end'] === 'number') {
        const original = text.slice(sel['start'], sel['end']);
        const how = str(v['instruction'], 'Rephrased');
        out = {
          suggestions: [
            { original, proposed: `${MOCK_MARK} ${original.trim()} (rewritten)`, reason: `${MOCK_MARK} ${how}.`, start: sel['start'], end: sel['end'] },
          ],
        };
        break;
      }
      const line = text.split('\n').find((l) => l.trim().length > 0 && !l.startsWith('#')) ?? 'Mock line.';
      const start = text.indexOf(line);
      out = {
        suggestions: [
          {
            original: line,
            proposed: `${line.replace(/\s+$/, '')} (tightened)`,
            reason: `${MOCK_MARK} Shorter and clearer.`,
            start: start >= 0 ? start : null,
            end: start >= 0 ? start + line.length : null,
          },
        ],
      };
      break;
    }
    case 'weave': {
      const md = str(v['markdown'], '');
      const notes = arr(v['notes']).map(obj);
      const blocks = md.split(/\n{2,}/);
      const expand = v['mode'] === 'expand';
      for (const note of [...notes].reverse()) {
        const text = str(note['note'], '');
        if (!text) continue;
        const pos = typeof note['position'] === 'number' ? note['position'] : null;
        // Insert after the block that contains the character position (or at the end).
        let idx = blocks.length;
        if (pos !== null) {
          let acc = 0;
          for (let i = 0; i < blocks.length; i += 1) {
            acc += (blocks[i] ?? '').length + 2;
            if (acc > pos) {
              idx = i + 1;
              break;
            }
          }
        }
        if (expand) {
          blocks.splice(
            idx,
            0,
            `## ${MOCK_MARK} Expanded Note`,
            `${MOCK_MARK} Expanded from the author's note: ${text}`,
            `${MOCK_MARK} A second paragraph that follows the note through.`,
          );
        } else blocks.splice(idx, 0, `${MOCK_MARK} Woven from the author's note: ${text}`);
      }
      out = { markdown: blocks.join('\n\n'), woven_note_ids: notes.map((n) => str(n['id'], '')).filter((s) => s.length > 0) };
      break;
    }
    case 'matter_metadata':
      out = {
        dedication: `${MOCK_MARK} For everyone starting out.`,
        acknowledgements: `${MOCK_MARK} Thanks to the readers.`,
        review_request: `${MOCK_MARK} If this book helped, a short review helps others find it.`,
        newsletter_line: `${MOCK_MARK} Join the newsletter.`,
        back_blurb: MOCK_MATTER_BLURB,
        description_html: MOCK_MATTER_DESCRIPTION,
        keywords: Array.from({ length: 7 }, (_, i) => `mock keyword ${i + 1}`),
        categories: ['Mock 1', 'Mock 2', 'Mock 3'],
      };
      break;
    case 'cover_brief':
      out = {
        brief: {
          mood: `${MOCK_MARK} Calm and confident`,
          audience: 'Beginners',
          palette: ['#1f2a44', '#c9a24a', '#f5efe3'],
          composition: 'Strong central symbol, clear space at the top for the title',
          use: ['simple geometric symbol'],
          avoid: ['faces', 'text', 'logos'],
        },
        // As many concepts as the book asked for (settings.coverConcepts, 1 to 4, default 3).
        concepts: Array.from({ length: Math.min(4, Math.max(1, Math.round(Number(v['conceptCount'] ?? 3)) || 3)) }, (_, n) => n + 1).map((i) => ({
          name: `${MOCK_MARK} Concept ${i}`,
          image_prompt: `Mock image prompt ${i}, no text, no letters`,
          why: 'Placeholder',
        })),
      };
      break;
    case 'marketing':
      out = {
        // As many as the job asked for (the template's counts, D-049); one when it names none (a regenerate).
        tiktok: Array.from({ length: mockCount(v['tiktokCount']) }, (_, i) => ({
          hook: `${MOCK_MARK} Stop scrolling if you want ${title}.${i > 0 ? ` (${i + 1})` : ''}`,
          beats: ['Problem', 'Turn', 'Payoff'],
          on_screen: ['Hook', 'Tip'],
          cta: 'Link in bio',
          seconds: 30,
          hashtags: ['#booktok', '#newbook'],
        })),
        instagram: Array.from({ length: mockCount(v['instagramCount']) }, (_, i) => ({
          caption: `${MOCK_MARK} New book: ${title}.${i > 0 ? ` (${i + 1})` : ''}`,
          hashtags: ['#books', '#newbook'],
          cta: 'Read the first chapter',
          image_idea: `${MOCK_MARK} The book on a windowsill in morning light.`,
        })),
        email: {
          subjects: [`${MOCK_MARK} It is here`, `${MOCK_MARK} New book`, `${MOCK_MARK} Launch day`],
          preview: 'The book is out',
          body: `${MOCK_MARK} Email body for ${title}.`,
        },
      };
      break;
    case 'picture_story': {
      const story = obj(v['story']);
      const spreads = Math.max(1, Math.min(16, Number(story['spreadCount'] ?? story['spreads'] ?? 10) || 10));
      out = {
        title,
        newWord: 'Brave',
        newWordMeaning: 'Being brave means trying something even when you feel a little wobbly inside.',
        characters: [{ name: 'Pip', kind: 'rabbit', look: 'Small grey rabbit, blue scarf', personality: ['curious'], voice: 'soft' }],
        setting: 'A quiet meadow at dusk',
        spreads: Array.from({ length: spreads }, (_, i) => ({
          n: i + 1,
          text: `${MOCK_MARK} Pip hops on, page ${i + 1}.`,
          sceneSummary: `Pip in the meadow, spread ${i + 1}.`,
        })),
        safetyCheck: { passed: true, notes: [] },
      };
      break;
    }
    case 'scene_prompts': {
      const story = obj(v['storyResult']);
      const spreads = arr(story['spreads']).length || 10;
      const layouts = ['text-left', 'text-right', 'text-top', 'text-bottom'] as const;
      out = {
        characterSheets: [{ name: 'Pip', prompt: 'Small grey rabbit with a blue scarf, soft watercolour' }],
        styleLine: 'Soft watercolour, warm dusk light',
        scenes: Array.from({ length: spreads }, (_, i) => ({
          spread: i + 1,
          imagePrompt: `Mock scene prompt ${i + 1}, no text, no letters`,
          layout: layouts[i % layouts.length],
          characters: ['Pip'],
        })),
        cover: { imagePrompt: 'Mock cover prompt, no text' },
      };
      break;
    }
    case 'character_reference':
      out = { references: [{ name: 'Pip', imagePrompt: 'Mock neutral full-body reference of Pip, plain background' }] };
      break;
    case 'claim_fix': {
      // Three options: soften, attribute to the first ticked source (reframe when there is none), remove.
      const sentence = str(obj(v['claim'])['sentence'], 'Mock claim.').trim();
      const bare = sentence.replace(/[.!?]+$/, '');
      const hasSource = arr(v['sources']).length > 0;
      out = {
        options: [
          { text: `${MOCK_MARK} ${bare}, for some people.`, approach: 'soften', rationale: `${MOCK_MARK} Lower certainty.`, needsSource: false },
          hasSource
            ? { text: `${sentence} [[S1]]`, approach: 'attribute', rationale: `${MOCK_MARK} Cites the first research source.`, needsSource: false }
            : {
                text: `${MOCK_MARK} Check this against an official source before you rely on it.`,
                approach: 'reframe',
                rationale: `${MOCK_MARK} Sends the reader to the source.`,
                needsSource: false,
              },
          { text: '', approach: 'remove', rationale: `${MOCK_MARK} The passage reads well without it.`, needsSource: false },
        ],
      };
      break;
    }
    default:
      out = {};
  }
  return out as AiStageOutputMap[S];
}

/**
 * The first sentence holding the mock mark inside a paragraph (never a heading, never across a blank line),
 * with its offset in the Markdown, so a claim is always one sentence the editor can find.
 */
export function mockClaimSentence(markdown: string): { sentence: string; start: number } | null {
  const blocks = /[^\n]+(?:\n[^\n]+)*/g;
  for (let m = blocks.exec(markdown); m; m = blocks.exec(markdown)) {
    const block = m[0];
    if (/^\s*(#|>|[-*+] |\d+\. |:::)/.test(block)) continue;
    const sentences = /[^.!?]+[.!?]+(?=\s|$)|[^.!?]+$/g;
    for (let s = sentences.exec(block); s; s = sentences.exec(block)) {
      const raw = s[0];
      const lead = raw.length - raw.trimStart().length;
      const sentence = raw.trim();
      if (sentence.includes(MOCK_MARK)) return { sentence, start: m.index + s.index + lead };
    }
  }
  return null;
}

/** 1x1 PNG, gilt colour. Stands in for generated cover art. */
const MOCK_PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mN8eeNmPQAH1gLmZQzd9gAAAABJRU5ErkJggg==', 'base64');

/**
 * A solid-colour RGB PNG of the given size, built with node:zlib (no image package). The colour comes from `key`, so
 * the same prompt always gives the same picture. Spreads get a 2:1 picture the picture-book exporter can split.
 */
export function mockPng(width: number, height: number, key: string): Buffer {
  const h = sha256Hex(key);
  const rgb = [0, 2, 4].map((i) => 96 + (Number.parseInt(h.slice(i, i + 2), 16) % 128));
  const row = Buffer.alloc(1 + width * 3);
  for (let x = 0; x < width; x += 1) row.set(rgb, 1 + x * 3);
  const raw = Buffer.concat(Array.from({ length: height }, () => row));
  const chunk = (type: string, data: Buffer): Buffer => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body) >>> 0);
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.set([8, 2, 0, 0, 0], 8); // 8-bit RGB, no interlace
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

export interface MockAiOptions {
  /** Delay between streamed chunks, ms (0 in tests). */
  streamDelayMs?: number;
  /**
   * MOCK_FAIL_NEXT_WRITING: the nth writing call (1 is the first) fails once with a model-unavailable
   * error, for tests and demos. Later calls, retries included, succeed. Undefined or null: never fails.
   */
  failWritingCall?: number | null | undefined;
}

export class MockAiAdapter implements AiPort {
  readonly provider = 'mock' as const;
  private readonly streamDelayMs: number;
  /** The writing call that fails once, or null once it has failed (or when none should). */
  private failWritingCall: number | null;
  private writingCalls = 0;

  constructor(opts: MockAiOptions = {}) {
    this.streamDelayMs = opts.streamDelayMs ?? 0;
    this.failWritingCall = opts.failWritingCall ?? null;
  }

  /** Counts writing calls and throws on the one MOCK_FAIL_NEXT_WRITING named, once. */
  private writingFailureCheck(model: string): void {
    if (this.failWritingCall === null) return;
    this.writingCalls += 1;
    if (this.writingCalls !== this.failWritingCall) return;
    this.failWritingCall = null;
    throw new AiModelUnavailableError('Mock: the writing model is not available (MOCK_FAIL_NEXT_WRITING).', model);
  }

  estimate(): Promise<AiCostEstimate> {
    return Promise.resolve({ lowUsd: MOCK_COST_PER_CALL_USD, highUsd: MOCK_COST_PER_CALL_USD * 1.5 });
  }

  /** A mock picture costs what generateImage records for it. */
  estimateImage(opts: { model?: string } = {}): Promise<AiImageEstimate> {
    return Promise.resolve({ lowUsd: MOCK_COST_PER_CALL_USD, highUsd: MOCK_COST_PER_CALL_USD, model: opts.model ?? 'mock/cover_image', priced: true });
  }

  private scenarioCheck(scenario: string | undefined, model: string): void {
    if (scenario === 'rate_limit') throw new AiRetryableError('Mock rate limit (429).', 2000);
    if (scenario === 'server_error') throw new AiRetryableError('Mock provider error (502).');
    if (scenario === 'model_missing') throw new AiModelUnavailableError('Mock: the model is not available.', model);
  }

  async runStage<S extends AiStage>(stage: S, input: AiStageInput, opts: RunStageOptions = {}): Promise<AiStageResult<S>> {
    const model = opts.model ?? `mock/${stage}`;
    if (opts.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    this.scenarioCheck(opts.scenario, model);
    // Extend passes are extra calls on a section already written: only first writes count towards MOCK_FAIL_NEXT_WRITING.
    if (stage === 'writing' && input.promptId !== 'writing.extend-section') this.writingFailureCheck(model);
    const started = Date.now();
    const output = buildOutput(stage, input);
    const rawText = JSON.stringify(output);

    if ((stage === 'writing' || stage === 'weave') && opts.onDelta) {
      const md = (output as { markdown: string }).markdown;
      const size = 80;
      for (let i = 0; i < md.length; i += size) {
        if (opts.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
        opts.onDelta(md.slice(i, i + size));
        if (this.streamDelayMs > 0) await new Promise((r) => setTimeout(r, this.streamDelayMs));
      }
    }

    const promptId = input.promptId ?? `${stage}.default`;
    const sources: AiSource[] =
      stage === 'research'
        ? [
            {
              url: 'https://example.org/mock-source-1',
              title: `${MOCK_MARK} Example source 1`,
              excerpt: 'Mock excerpt one.',
              startIndex: 0,
              endIndex: 10,
              domain: 'example.org',
              redirectUrl: null,
              unresolved: false,
            },
            {
              url: 'https://example.org/mock-source-2',
              title: `${MOCK_MARK} Example source 2`,
              excerpt: 'Mock excerpt two.',
              startIndex: 11,
              endIndex: 20,
              domain: 'example.org',
              redirectUrl: null,
              unresolved: false,
            },
          ]
        : [];

    return {
      stage,
      output,
      rawText,
      usage: {
        provider: 'mock',
        model,
        generationId: `mock-${sha256Hex(stage + JSON.stringify(input.variables)).slice(0, 16)}`,
        inputTokens: Math.ceil(JSON.stringify(input.variables).length / 4),
        outputTokens: Math.ceil(rawText.length / 4),
        costUsd: MOCK_COST_PER_CALL_USD,
        latencyMs: Date.now() - started,
      },
      prompt: { id: promptId, version: input.promptVersion ?? 1, hash: sha256Hex(`mock:${promptId}`) },
      sources,
      mock: true,
      // The mock runs no guardrails: an empty, passing report so the UI path is exercised.
      guardrails: { passed: true, blocking: [], needsAttention: [], rules: [], styleRewrite: null },
    };
  }

  generateImage(prompt: string, opts: GenerateImageOptions = {}): Promise<AiImageResult> {
    const model = opts.model ?? 'mock/image';
    this.scenarioCheck(opts.scenario, model);
    // Spreads: a 2:1 picture (the exporter crops and splits it at the gutter). Covers and references: 1 x 1.
    const spread = opts.purpose === 'spread';
    return Promise.resolve({
      mime: 'image/png',
      data: new Uint8Array(spread ? mockPng(64, 32, prompt) : MOCK_PNG),
      width: spread ? 64 : 1,
      height: spread ? 32 : 1,
      usage: { provider: 'mock', model, generationId: null, inputTokens: 0, outputTokens: 0, costUsd: MOCK_COST_PER_CALL_USD, latencyMs: 0 },
      mock: true,
    });
  }
}
