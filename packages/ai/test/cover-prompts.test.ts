import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PromptLoader } from '../src/index.ts';
import { PROMPTS_DIR } from './helpers.ts';

const loader = new PromptLoader(PROMPTS_DIR);

describe('cover prompts (24 October 2026)', () => {
  it('the brief is v4: four different art directions, vivid colour, sharp authentic art, nothing murky', () => {
    const file = loader.load('cover.cover-brief');
    expect(file.meta.version).toBe(4);
    const text = readFileSync(`${PROMPTS_DIR}/cover/cover-brief.v4.md`, 'utf8');
    expect(text).toContain('four different covers, not four colourways');
    expect(text).toContain('a symbolic or abstract image');
    expect(text).toContain('a typographic-led cover');
    expect(text).toContain('fully saturated');
    expect(text).toContain('authentic');
    expect(text).toContain('differ from the author');
  });

  it('the image prompt is v3 and keeps the title area clearly light or dark without a vignette', () => {
    const file = loader.load('cover.cover-image');
    expect(file.meta.version).toBe(3);
    const text = readFileSync(`${PROMPTS_DIR}/cover/cover-image.v3.md`, 'utf8');
    expect(text).toContain('no dark vignette');
    expect(text).toContain('tactile detail');
  });
});
