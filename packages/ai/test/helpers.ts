// house-style:off (test data quotes banned phrases, ISBNs and claims on purpose)
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
export const ROOT = resolve(here, '..', '..', '..');
export const PROMPTS_DIR = join(ROOT, 'prompts');
export const CONFIG_DIR = join(ROOT, 'config');
export const FIXTURES_DIR = join(here, 'fixtures');

/** One input object rich enough for every stage runner (zod strips what a task does not use). */
export const FULL_INPUT = {
  profile: {
    penName: 'Amira Hale',
    perspective: 'A London nurse with twenty years of night shifts who writes about staying calm at work.',
    credentials: 'Registered nurse',
    voice: {
      notes: 'Warm, direct and a little dry.',
      characteristics: ['short sentences', 'kitchen-table tone', 'plain words'],
      soundsLike: [
        'I came home at seven and sat in the car for ten minutes before I could go in.',
        'Nobody tells you that the quiet hours are the loud ones in your head.',
      ],
      notLike: 'Corporate memo prose full of jargon and long lists.',
      memory: ['Prefers "shift" to "rota".'],
    },
    voiceSample: null,
    isRealPerson: true,
    bio: 'Amira Hale is a nurse who has worked nights in London hospitals for twenty years.',
    shortBio: 'Amira Hale is a London nurse.',
    links: ['https://amirahale.example.com'],
    brand: 'Navy and cream',
    dedicationNames: ['Sam'],
    acknowledgementNames: ['Jo', 'Priya'],
    acceptedEdits: ['Keep contractions.'],
    bannedPhrases: ['circle back'],
  },
  book: {
    idea: 'A calm guide for new nurses facing their first night shifts',
    type: 'nonfiction',
    variant: 'narrative',
    genre: 'Health and nursing',
    title: 'Quiet Hours',
    subtitle: 'A Calm Guide To Night Shifts For New Nurses',
    audience: 'Newly qualified nurses in the UK',
    tone: 'warm and steady',
    toneNotes: 'Warm, plain, first person.',
    wordTarget: 40000,
    wordCount: 39500,
    chapterCount: 10,
    hookStyle: 'scene',
    takeaways: true,
    illustrativeStories: true,
    quotes: [],
    format: 'ebook' as const,
    isbns: ['9781234567897'],
  },
  blueprint: {
    title: 'Quiet Hours',
    subtitle: 'A Calm Guide To Night Shifts For New Nurses',
    chapters: [
      { number: 1, title: 'Arrival', summary: 'The first night.' },
      { number: 2, title: 'The Long Middle', summary: 'The hours between two and five.' },
    ],
  },
  template: { id: 'nonfiction', variant: 'narrative', chapterWords: [2500, 4000] },
  research: { ideaSummary: 'New nurses struggle with nights.', keywordIdeas: [{ phrase: 'night shift nurse', basis: 'S1' }] },
  sources: [
    { title: 'Sleep after night shifts', url: 'https://www.example.org/night-shift-sleep', snippet: 'Advice on recovering sleep after a run of nights.' },
    { title: 'Guides for new nurses', url: 'https://www.example.org/new-nurse-guides', snippet: 'What first-year nurses say they need.' },
  ],
  previousSummaries: [{ number: 1, title: 'Arrival', summary: 'The author describes her first night and the fear of the empty corridor.' }],
  ledger: [{ kind: 'story', key: 'car park', detail: 'Sitting in the car after a shift' }],
  cta: null,
  direction: { workingTitle: 'Quiet Hours', focus: 'Nights as a learnable skill' },
  regenerate: { target: 'chapters[1].summary', instruction: null },
  chapter: {
    number: 2,
    title: 'The Long Middle',
    partTitle: null,
    subheadings: ['The Hours Nobody Warns You About', 'Small Rituals That Hold You Steady', 'When The Ward Goes Quiet'],
    summary: 'What happens between two and five in the morning, and how to stay steady.',
    wordTarget: 180,
    isLast: false,
  },
  nextChapter: { title: 'Handover', summary: 'Passing the night on well.' },
  sections: ['dedication', 'acknowledgements'],
  glossaryTerms: ['handover'],
  selection: { text: 'The ward was quiet.', before: 'It was three in the morning.', after: 'Then the phone rang.' },
  rewrite: { mode: 'rephrase' as const, instruction: null, tone: 'warmer', targetWords: 20 },
  note: { text: 'bit about the vending machine at 4am, always out of the good crisps, made me laugh every time', intent: null },
  weave: { before: 'By four the ward had settled.', after: 'I went back to bay three.' },
  text: 'The ward lights dim at eleven. Studies show that 40% of nurses sleep badly.',
  section: { id: 'sec_2', title: 'The Long Middle' },
  mode: 'standard' as const,
  scope: 'chapter' as const,
  keepLines: null,
  categoriesSeen: null,
  pageCount: 212,
  currentWords: 120,
  cover: { ownerIdeas: null, shelfNotes: null, formats: ['ebook', 'paperback'], target: 'ebook-front', aspectRatio: '2:3' },
  brief: { mood: 'calm night', palette: ['navy', 'cream'] },
  concept: { name: 'Window at night', idea: 'A ward window with a soft lamp glow.' },
  count: 2,
  lengthSeconds: 30,
  description: 'A calm guide to night shifts.',
  launchDate: '1 December 2026',
  bookLink: 'https://www.amazon.co.uk/dp/EXAMPLE',
  kdpSelect: true,
  goLiveNote: null,
  story: {
    topic: 'a sleepy hedgehog',
    newWord: 'gentle',
    ageRange: '3 to 5',
    characterCount: 2,
    characterIdeas: null,
    theme: null,
    wordLimit: 600,
    spreadCount: 12,
    goodnightMessage: 'Sleep tight',
    rhyme: false,
    artStyle: 'soft watercolour',
    includeSounds: true,
  },
  storyResult: { title: 'Hattie Goes To Sleep', spreads: [{ n: 1, text: 'Hattie yawned.', sceneSummary: 'A hedgehog yawns.' }] },
};

export interface FakeRequest {
  method: string;
  url: string;
  headers: IncomingMessage['headers'];
  body: unknown;
}

export interface FakeServer {
  url: string;
  requests: FakeRequest[];
  close(): Promise<void>;
}

/** A local HTTP server for client tests. No network. */
export async function startFakeServer(handler: (req: FakeRequest, res: ServerResponse, n: number) => void | Promise<void>): Promise<FakeServer> {
  const requests: FakeRequest[] = [];
  const server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      const text = Buffer.concat(chunks).toString('utf8');
      let body: unknown;
      try {
        body = text ? JSON.parse(text) : undefined;
      } catch {
        body = text;
      }
      const r: FakeRequest = { method: req.method ?? 'GET', url: req.url ?? '/', headers: req.headers, body };
      requests.push(r);
      void Promise.resolve(handler(r, res, requests.length)).catch(() => res.destroy());
    });
  });
  await new Promise<void>((ok) => server.listen(0, '127.0.0.1', ok));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}/api/v1`,
    requests,
    close: () =>
      new Promise<void>((ok) => {
        server.closeAllConnections();
        server.close(() => ok());
      }),
  };
}

export function sendJson(res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}): void {
  res.writeHead(status, { 'Content-Type': 'application/json', ...headers });
  res.end(JSON.stringify(body));
}

export function sseChunk(data: unknown): string {
  return `data: ${typeof data === 'string' ? data : JSON.stringify(data)}\n\n`;
}
