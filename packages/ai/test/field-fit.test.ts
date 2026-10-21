// Field fit (owner, 21 October 2026): each book stays in its own pen name's world. The writing prompts carry the
// "Stay in this pen name's world" block and the pen name's field ({{profile.field}}). No network: rendering only.
import { describe, expect, it } from 'vitest';
import { FENCED_VARIABLES, PromptLoader, TASKS, buildVariables, formatProfileField, loadConfig, type TaskId } from '../src/index.ts';
import { CONFIG_DIR, FULL_INPUT, PROMPTS_DIR } from './helpers.ts';

const loader = new PromptLoader(PROMPTS_DIR);
const config = loadConfig(CONFIG_DIR);

const WRITERS: [TaskId, number][] = [
  ['writing.chapter', 8],
  ['writing.introduction', 8],
  ['writing.conclusion', 8],
  ['writing.back-matter', 8],
  ['writing.front-matter', 7],
  ['writing.extend-section', 6],
];

const TECH_PROFILE = {
  ...FULL_INPUT.profile,
  penName: 'Gideon Akinlotan',
  perspective: 'A web designer who writes about AI side hustles.',
  credentials: null,
  bio: 'Gideon Akinlotan is a London web designer. He builds sites for small firms and teaches AI tools. He lives in London.',
};

function system(task: TaskId, input: Record<string, unknown>): string {
  const def = TASKS[task];
  const values = buildVariables(def.input.parse(input), config);
  const r = loader.render(def.promptId, values, { fence: FENCED_VARIABLES });
  return r.messages.find((m) => m.role === 'system')?.content ?? '';
}

describe('field fit in the writing prompts', () => {
  for (const [task, version] of WRITERS) {
    it(`${task} v${version} renders the pen name's world block with the field`, () => {
      expect(loader.load(TASKS[task].promptId).meta.version).toBe(version);
      const text = system(task, { ...FULL_INPUT, profile: TECH_PROFILE });
      expect(text).toContain("## Stay in this pen name's world");
      expect(text).toContain(
        "The pen name's field, from the profile (may be empty): Gideon Akinlotan is a London web designer. He builds sites for small firms and teaches AI tools.\n",
      );
      expect(text).toContain("appear only when this book's topic or the pen name's field is health or care");
      expect(text).toContain('a bank, the council, an energy supplier, a school, an online shop');
      expect(text).toContain('a nursing or care book does not reach for coding, software or start-up examples');
    });
  }

  it('the field is the first two bio sentences, then the credentials', () => {
    expect(formatProfileField({ bio: 'Amira Hale is a nurse. She works nights. She lives in Leeds.', credentials: 'Registered nurse' })).toBe(
      'Amira Hale is a nurse. She works nights. Credentials: Registered nurse.',
    );
    expect(formatProfileField({ perspective: 'A web designer.' })).toBe('A web designer.');
    expect(formatProfileField({})).toBeNull();
  });

  it('sends None when the profile has no bio, credentials or perspective', () => {
    const text = system('writing.chapter', {
      ...FULL_INPUT,
      profile: { ...FULL_INPUT.profile, perspective: null, credentials: null, bio: null, shortBio: null },
    });
    expect(text).toContain("The pen name's field, from the profile (may be empty): None");
  });
});
