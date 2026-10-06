import { useSectionDiff, useSectionVersion } from "../../api/hooks";
import { blocksFromMarkdown, errorText } from "../../api/wire-c";
import type { DiffLine } from "../../api/types";
import { Banner, Skeleton } from "../../components/ui";
import type { MsBlock } from "./manuscript";
import { Column } from "./VersionDrawer";

/**
 * The two columns of the versions drawer in API mode. Two saved versions are compared with the
 * server's diff (GET /sections/:id/diff); a saved version against the text on screen reads that
 * version (GET /sections/:id/versions/:versionId) and compares it here, paragraph by paragraph.
 */
export function ApiCompare({
  sectionId,
  left,
  right,
  currentBlocks,
  leftName,
  rightName,
}: {
  sectionId: string;
  left: string | null;
  right: string | null;
  currentBlocks: MsBlock[];
  leftName: string;
  rightName: string;
}) {
  const read = useSectionVersion(right === null && left ? sectionId : undefined, right === null && left ? left : undefined);
  const diff = useSectionDiff(right !== null && left ? sectionId : undefined, right !== null && left ? left : undefined, right ?? undefined);
  const q = right === null ? read : diff;

  if (!left) return <p className="p-5 text-small text-ink-secondary sm:p-6">Pick a version on the left to compare.</p>;
  if (q.isError)
    return (
      <div className="p-5 sm:p-6">
        <Banner tone="error" title="Could not load this version">
          {errorText(q.error)}
        </Banner>
      </div>
    );
  if (q.isPending)
    return (
      <div role="status" aria-label="Loading the versions" className="grid grid-cols-1 gap-4 p-5 sm:p-6 lg:grid-cols-2">
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );

  let pairs: [MsBlock | undefined, MsBlock | undefined][];
  if (right === null && read.data) {
    pairs = alignBlocks(blocksFromMarkdown(read.data.bodyMd, "a"), currentBlocks);
  } else if (diff.data) {
    pairs = diff.data.lines
      ? pairLines(diff.data.lines)
      : alignBlocks(blocksFromMarkdown(diff.data.from.bodyMd, "a"), blocksFromMarkdown(diff.data.to.bodyMd, "b"));
  } else {
    pairs = [];
  }

  return (
    <div className="grid grid-cols-1 gap-4 p-5 sm:p-6 lg:grid-cols-2">
      <Column title={leftName} pairs={pairs} side="before" />
      <Column title={rightName} pairs={pairs} side="after" />
    </div>
  );
}

function block(text: string, i: number): MsBlock {
  const m = /^(#{1,6}\s+)(.*)$/.exec(text);
  return m ? { id: `l${i}`, kind: "h", text: m[2] ?? "", rev: 0 } : { id: `l${i}`, kind: "p", text, rev: 0 };
}

/** The server's line diff as paragraph pairs: removed and added lines between two equal ones pair in order. */
function pairLines(lines: DiffLine[]): [MsBlock | undefined, MsBlock | undefined][] {
  const out: [MsBlock | undefined, MsBlock | undefined][] = [];
  let gone: MsBlock[] = [];
  let added: MsBlock[] = [];
  const flush = () => {
    for (let x = 0; x < Math.max(gone.length, added.length); x++) out.push([gone[x], added[x]]);
    gone = [];
    added = [];
  };
  lines.forEach((l, i) => {
    if (l.text.trim().length === 0) return;
    if (l.op === "equal") {
      flush();
      out.push([block(l.text, i), block(l.text, i)]);
    } else if (l.op === "remove") gone.push(block(l.text, i));
    else added.push(block(l.text, i));
  });
  flush();
  return out;
}

/**
 * Lines up two lists of paragraphs: equal paragraphs pair by the longest common run, and the changed
 * paragraphs between two equal ones pair in order, so an edited paragraph compares with its old self.
 */
function alignBlocks(a: MsBlock[], b: MsBlock[]): [MsBlock | undefined, MsBlock | undefined][] {
  const key = (x: MsBlock) => `${x.kind}:${x.text.trim()}`;
  const n = a.length;
  const m = b.length;
  const L: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--) L[i]![j] = key(a[i]!) === key(b[j]!) ? L[i + 1]![j + 1]! + 1 : Math.max(L[i + 1]![j]!, L[i]![j + 1]!);
  const out: [MsBlock | undefined, MsBlock | undefined][] = [];
  let i = 0;
  let j = 0;
  let gapA: MsBlock[] = [];
  let gapB: MsBlock[] = [];
  const flush = () => {
    const k = Math.max(gapA.length, gapB.length);
    for (let x = 0; x < k; x++) out.push([gapA[x], gapB[x]]);
    gapA = [];
    gapB = [];
  };
  while (i < n || j < m) {
    if (i < n && j < m && key(a[i]!) === key(b[j]!)) {
      flush();
      out.push([a[i]!, b[j]!]);
      i++;
      j++;
    } else if (j >= m || (i < n && L[i + 1]![j]! >= L[i]![j + 1]!)) gapA.push(a[i++]!);
    else gapB.push(b[j++]!);
  }
  flush();
  return out;
}
