// Inline Markdown of the dialect: **bold** and *italic* (nesting allowed: ***both***).
import type { InlineRun } from './model.ts';

/** Split inline Markdown into runs. Unmatched markers are kept as literal text. */
export function parseInline(text: string): InlineRun[] {
  const runs: InlineRun[] = [];
  let bold = false;
  let italic = false;
  let buf = '';
  const push = () => {
    if (!buf) return;
    const run: InlineRun = { text: buf };
    if (bold) run.bold = true;
    if (italic) run.italic = true;
    const prev = runs[runs.length - 1];
    if (prev && Boolean(prev.bold) === bold && Boolean(prev.italic) === italic) prev.text += buf;
    else runs.push(run);
    buf = '';
  };
  let i = 0;
  while (i < text.length) {
    if (text[i] === '*') {
      let n = 1;
      while (text[i + n] === '*') n++;
      const after = text[i + n];
      const closesSomething = (n === 1 && italic) || (n === 2 && bold) || (n === 3 && (bold || italic));
      const canOpen = after !== undefined && after !== ' ' && hasLaterMarker(text, i + n);
      if (n <= 3 && (closesSomething || canOpen)) {
        push();
        if (n === 1 || n === 3) italic = !italic;
        if (n === 2 || n === 3) bold = !bold;
        i += n;
        continue;
      }
      buf += text.slice(i, i + n);
      i += n;
      continue;
    }
    buf += text[i];
    i += 1;
  }
  push();
  return runs;
}

/** A later '*' that follows a non-space character (a possible closing marker). */
function hasLaterMarker(text: string, from: number): boolean {
  for (let j = from; j < text.length; j++) if (text[j] === '*' && text[j - 1] !== ' ') return true;
  return false;
}

/** Runs back to inline Markdown. */
export function serialiseInline(runs: InlineRun[]): string {
  return runs
    .map((r) => {
      let t = r.text;
      if (r.italic) t = `*${t}*`;
      if (r.bold) t = `**${t}**`;
      return t;
    })
    .join('');
}

/** Plain text with the bold and italic markers removed. */
export function stripInline(text: string): string {
  return parseInline(text)
    .map((r) => r.text)
    .join('');
}

const HTML_ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
export function escapeHtml(text: string): string {
  return text.replace(/[&<>"]/g, (c) => HTML_ESCAPES[c] ?? c);
}

/** Inline Markdown to HTML (<strong>, <em>), escaped. */
export function inlineToHtml(text: string): string {
  return parseInline(text)
    .map((r) => {
      let t = escapeHtml(r.text);
      if (r.italic) t = `<em>${t}</em>`;
      if (r.bold) t = `<strong>${t}</strong>`;
      return t;
    })
    .join('');
}
