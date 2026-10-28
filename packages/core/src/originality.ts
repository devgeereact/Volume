// Originality (owner, 27 October 2026): the book's text should be its own. This finds passages copied word for word
// from texts the writer was shown: the pen name's voice samples (the prompt says "do not copy sentences") and the
// excerpts of the research sources. Repetition inside the book is repetition.ts. Deterministic and model-free; the app
// turns the result into one warning per section, never a block.

/** A text the book must not copy: a voice sample or a research source excerpt. */
export interface OriginalitySource {
  /** Display name for messages, for example "your voice sample" or the source's title. */
  label: string;
  text: string;
}

/** One run of words in the text that matches a source word for word. */
export interface CopiedPassage {
  /** The label of the source it matches. */
  source: string;
  /** Offsets into the checked text (UTF-16 code units). */
  start: number;
  end: number;
  /** The passage as written in the checked text. */
  text: string;
  words: number;
}

export interface OriginalityOptions {
  /** Shortest run of matching words that counts as copied. Default ORIGINALITY_MIN_WORDS. */
  minWords?: number;
}

/** Runs of 12 words in a row are rare by chance in prose, and long enough to be a copied sentence. */
export const ORIGINALITY_MIN_WORDS = 12;

interface Word {
  norm: string;
  start: number;
  end: number;
}

const WORD = /[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu;

/** The words of a text, lower case with straight apostrophes, with their offsets. */
function words(text: string): Word[] {
  return [...text.matchAll(WORD)].map((m) => ({ norm: m[0].toLowerCase().replace(/’/g, "'"), start: m.index, end: m.index + m[0].length }));
}

/** Spans of text inside curly or straight double quotation marks: quoting with attribution is not copying. */
function quotedSpans(text: string): Array<[number, number]> {
  return [...text.matchAll(/“[^”]*”|"[^"\n]*"/g)].map((m) => [m.index, m.index + m[0].length]);
}

const gram = (ws: readonly Word[], at: number, n: number): string =>
  ws
    .slice(at, at + n)
    .map((w) => w.norm)
    .join(' ');

/**
 * The passages of `text` that repeat `minWords` or more words in a row from one of the sources, in order of
 * appearance. Case, punctuation and line breaks are ignored. A passage wholly inside quotation marks is left out.
 * Empty when nothing matches.
 */
export function findCopiedPassages(text: string, sources: readonly OriginalitySource[], options: OriginalityOptions = {}): CopiedPassage[] {
  const n = Math.max(1, options.minWords ?? ORIGINALITY_MIN_WORDS);
  const tw = words(text);
  if (tw.length < n) return [];
  const quotes = quotedSpans(text);
  const out: CopiedPassage[] = [];
  for (const src of sources) {
    const sw = words(src.text);
    if (sw.length < n) continue;
    const grams = new Set<string>();
    for (let i = 0; i + n <= sw.length; i++) grams.add(gram(sw, i, n));
    let i = 0;
    while (i + n <= tw.length) {
      if (!grams.has(gram(tw, i, n))) {
        i++;
        continue;
      }
      // Extend the run while the next window still matches; the passage covers every word of every window.
      let j = i + 1;
      while (j + n <= tw.length && grams.has(gram(tw, j, n))) j++;
      const first = tw[i] as Word;
      const last = tw[j + n - 2] as Word;
      const quoted = quotes.some(([a, b]) => a <= first.start && last.end <= b);
      if (!quoted) out.push({ source: src.label, start: first.start, end: last.end, text: text.slice(first.start, last.end), words: j + n - 1 - i });
      i = j + n - 1;
    }
  }
  return out.sort((a, b) => a.start - b.start);
}

/** The warning text for a section with copied passages: how many, from where, and the start of the first one. */
export function originalityMessage(passages: readonly CopiedPassage[]): string {
  const sources = [...new Set(passages.map((p) => p.source))];
  const first = passages[0];
  const sample = first ? first.text.split(/\s+/).slice(0, 10).join(' ') : '';
  const what = passages.length === 1 ? 'One passage repeats' : `${passages.length} passages repeat`;
  return `${what} ${sources.join(', ')} word for word, starting "${sample}...". Put it in your own words, or quote it and cite the source.`;
}
