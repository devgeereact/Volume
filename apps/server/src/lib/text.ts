/** Small text helpers used for section versions. No external parser on purpose. */

export function markdownToPlaintext(md: string): string {
  return md
    .replace(/\r\n/g, '\n')
    .replace(/^:::.*$/gm, '')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^>\s?/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^\s*\d+\.\s+/gm, '')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/(\*\*|__)(.*?)\1/g, '$2')
    .replace(/(\*|_)(.*?)\1/g, '$2')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function wordCount(text: string): number {
  const words = text.trim().match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu);
  return words ? words.length : 0;
}

export interface DiffLine {
  op: 'equal' | 'add' | 'remove';
  text: string;
}

/** Line diff by longest common subsequence. Returns null when the texts are too long to diff cheaply. */
export function lineDiff(a: string, b: string, maxLines = 4000): DiffLine[] | null {
  const x = a.split('\n');
  const y = b.split('\n');
  if (x.length > maxLines || y.length > maxLines) return null;
  const n = x.length;
  const m = y.length;
  const dp: Uint32Array[] = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i -= 1) {
    const row = dp[i] as Uint32Array;
    const below = dp[i + 1] as Uint32Array;
    for (let j = m - 1; j >= 0; j -= 1) {
      row[j] = x[i] === y[j] ? (below[j + 1] as number) + 1 : Math.max(below[j] as number, row[j + 1] as number);
    }
  }
  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (x[i] === y[j]) {
      out.push({ op: 'equal', text: x[i] as string });
      i += 1;
      j += 1;
    } else if (((dp[i + 1] as Uint32Array)[j] as number) >= ((dp[i] as Uint32Array)[j + 1] as number)) {
      out.push({ op: 'remove', text: x[i] as string });
      i += 1;
    } else {
      out.push({ op: 'add', text: y[j] as string });
      j += 1;
    }
  }
  while (i < n) out.push({ op: 'remove', text: x[i++] as string });
  while (j < m) out.push({ op: 'add', text: y[j++] as string });
  return out;
}
