/* The workbook and fiction block dialect of the Volume Markdown (packages/core/src/markdown.ts, P6-1), for the
   Editor. Core parses it for export; the Editor needs a lossless round trip instead, so a block the owner
   does not touch is saved exactly as it was written.

     ::: exercise <kind> [title]      an exercise, closed by ":::", holding paragraphs, checklists,
     ...                              ruled lines and fill-in prompts
     :::
     ::: lines N                      ruled lines to write on (1 to 30); the closing ":::" is optional
     ::: fill-in [page]               one prompt per line, each followed by a line to write on
     - [ ] item                       a checklist item
     ***  (or * * *)                  a scene break

   Fence rules match core: fences nest, and `::: lines N` owns a close only when the next non-blank line
   is `:::`, so an exercise that ends straight after its lines still closes. */

export const EXERCISE_KINDS = ["reflection", "checklist", "fill-in", "tracker", "scenario"] as const;
export type ExerciseKind = (typeof EXERCISE_KINDS)[number];

export const exerciseKindLabels: Record<ExerciseKind, string> = {
  reflection: "Reflection",
  checklist: "Checklist",
  "fill-in": "Fill-in",
  tracker: "Tracker",
  scenario: "Scenario",
};

export const LINES_MIN = 1;
export const LINES_MAX = 30;

export type WbNode =
  | { type: "exercise"; kind: string; title: string; children: WbNode[] }
  | { type: "paragraph"; text: string }
  | { type: "checklist"; items: { text: string; checked: boolean }[] }
  | { type: "lines"; count: number; closed: boolean }
  | { type: "fillIn"; page: boolean; prompts: string[] };

const FENCE_OPEN = /^:::\s+(\S.*?)\s*$/;
const isClose = (ln: string) => ln.trim() === ":::";
const LINES_RE = /^lines\s+(\d+)$/i;
const EXERCISE_RE = /^exercise\s+(\S+)(?:\s+(.+))?$/i;
const FILL_IN_RE = /^fill-in(?:\s+(page))?$/i;
const CHECK_RE = /^- \[([ xX])\]\s+(.*)$/;
/** `***` or `* * *` (any spacing), as core reads a scene break. */
export const SCENE_BREAK_RE = /^\*(?:\s*\*){2}$/;

export const SCENE_BREAK_MD = "***";

/** True when a fence name is one of the workbook blocks the Editor draws (exercise, lines, fill-in). */
export function isWorkbookFence(line: string): boolean {
  const m = FENCE_OPEN.exec(line.trim());
  const name = m?.[1]?.trim() ?? "";
  return LINES_RE.test(name) || EXERCISE_RE.test(name) || FILL_IN_RE.test(name);
}

/** A paragraph that is all checklist items. */
export function isChecklistText(text: string): boolean {
  const ls = text.split("\n").filter((l) => l.trim());
  return ls.length > 0 && ls.every((l) => CHECK_RE.test(l.trimEnd()));
}

export function isSceneBreak(text: string): boolean {
  return SCENE_BREAK_RE.test(text.trim());
}

function nextNonBlank(lines: string[], from: number): number {
  for (let j = from; j < lines.length; j++) if ((lines[j] ?? "").trim()) return j;
  return -1;
}

function linesCloses(lines: string[], start: number): boolean {
  const k = nextNonBlank(lines, start + 1);
  return k >= 0 && isClose(lines[k] ?? "");
}

/**
 * The fence that opens at `start`: its name, body lines and the index after it. For `lines`, `closed`
 * says whether it owns a closing ":::". Null when `start` does not open a fence.
 */
export function readFence(lines: string[], start: number): { name: string; body: string[]; next: number; closed: boolean } | null {
  const m = FENCE_OPEN.exec((lines[start] ?? "").trim());
  if (!m?.[1]) return null;
  const name = m[1].trim();
  if (LINES_RE.test(name)) {
    const closed = linesCloses(lines, start);
    const k = closed ? nextNonBlank(lines, start + 1) : start;
    return { name, body: [], next: k + 1, closed };
  }
  const body: string[] = [];
  let depth = 0;
  let j = start + 1;
  while (j < lines.length) {
    const ln = lines[j] ?? "";
    if (isClose(ln)) {
      if (depth === 0) break;
      depth--;
    } else {
      const inner = FENCE_OPEN.exec(ln.trim());
      if (inner?.[1] && (!LINES_RE.test(inner[1].trim()) || linesCloses(lines, j))) depth++;
    }
    body.push(ln);
    j++;
  }
  return { name, body, next: Math.min(j + 1, lines.length), closed: j < lines.length };
}

/** Raw text of the lines from `start` up to (not including) `next`. */
function rawSpan(lines: string[], start: number, next: number): string {
  return lines.slice(start, next).join("\n");
}

const clampLines = (n: number) => Math.min(LINES_MAX, Math.max(LINES_MIN, Math.round(n) || LINES_MIN));

/** Parse the lines inside an exercise (or a whole workbook block) into Editor nodes. */
export function parseWorkbookLines(lines: string[]): WbNode[] {
  const out: WbNode[] = [];
  let para: string[] = [];
  const flush = () => {
    const text = para.join("\n").replace(/^\n+|\n+$/g, "");
    if (text.trim()) out.push(isChecklistText(text) ? checklistOf(text) : { type: "paragraph", text });
    para = [];
  };
  let i = 0;
  while (i < lines.length) {
    const ln = lines[i] ?? "";
    if (!ln.trim()) {
      flush();
      i++;
      continue;
    }
    if (para.length === 0 && FENCE_OPEN.test(ln.trim())) {
      const f = readFence(lines, i);
      if (f) {
        const node = fenceNode(f);
        // A fence the Editor does not draw stays as written, in a plain paragraph.
        out.push(node ?? { type: "paragraph", text: rawSpan(lines, i, f.next) });
        i = f.next;
        continue;
      }
    }
    para.push(ln.trimEnd());
    i++;
  }
  flush();
  return out;
}

function checklistOf(text: string): WbNode {
  return {
    type: "checklist",
    items: text
      .split("\n")
      .filter((l) => l.trim())
      .map((l) => {
        const m = CHECK_RE.exec(l.trimEnd());
        return { text: m?.[2] ?? l, checked: (m?.[1] ?? " ") !== " " };
      }),
  };
}

function fenceNode(f: { name: string; body: string[]; closed: boolean }): WbNode | null {
  const lines = LINES_RE.exec(f.name);
  if (lines) return { type: "lines", count: Number(lines[1]), closed: f.closed };
  const fill = FILL_IN_RE.exec(f.name);
  if (fill) return { type: "fillIn", page: !!fill[1], prompts: f.body.map((l) => l.trim()).filter(Boolean) };
  const ex = EXERCISE_RE.exec(f.name);
  if (ex) return { type: "exercise", kind: (ex[1] ?? "reflection").toLowerCase(), title: ex[2]?.trim() ?? "", children: parseWorkbookLines(f.body) };
  return null;
}

/** Workbook block Markdown (one exercise, lines, fill-in or checklist block) to Editor nodes. */
export function parseWorkbookMarkdown(md: string): WbNode[] {
  return parseWorkbookLines(md.replace(/\r\n?/g, "\n").split("\n"));
}

/** Editor nodes back to Markdown, in the form core writes. */
export function serialiseWorkbook(nodes: WbNode[]): string {
  return nodes
    .map(nodeMarkdown)
    .filter((s) => s.trim())
    .join("\n\n");
}

function nodeMarkdown(n: WbNode): string {
  switch (n.type) {
    case "paragraph":
      return n.text.replace(/^\n+|\n+$/g, "");
    case "checklist":
      return n.items
        .filter((it) => it.text.trim())
        .map((it) => `- [${it.checked ? "x" : " "}] ${it.text.trim()}`)
        .join("\n");
    case "lines":
      return `::: lines ${clampLines(n.count)}${n.closed ? "\n:::" : ""}`;
    case "fillIn": {
      const prompts = n.prompts.map((p) => p.trim()).filter(Boolean);
      return [`::: fill-in${n.page ? " page" : ""}`, ...prompts, ":::"].join("\n");
    }
    case "exercise": {
      const open = `::: exercise ${n.kind || "reflection"}${n.title.trim() ? ` ${n.title.trim()}` : ""}`;
      const body = serialiseWorkbook(n.children);
      return body ? `${open}\n${body}\n:::` : `${open}\n:::`;
    }
  }
}

/** Plain words of a workbook block, for word counts and find. Fence lines and tick boxes are left out. */
export function workbookPlainText(md: string): string {
  const words: string[] = [];
  const walk = (ns: WbNode[]) => {
    for (const n of ns) {
      if (n.type === "paragraph") words.push(n.text);
      else if (n.type === "checklist") words.push(...n.items.map((i) => i.text));
      else if (n.type === "fillIn") words.push(...n.prompts);
      else if (n.type === "exercise") {
        if (n.title) words.push(n.title);
        walk(n.children);
      }
    }
  };
  walk(parseWorkbookMarkdown(md));
  return words.join("\n");
}

/* ---------- New blocks for the Insert menu ---------- */

export type InsertKind = "scene" | "exercise" | "lines" | "fill-in" | "checklist";

/** Markdown for a new block, ready to edit. */
export function newBlockMarkdown(kind: InsertKind, exerciseKind: ExerciseKind = "reflection"): string {
  switch (kind) {
    case "scene":
      return SCENE_BREAK_MD;
    case "lines":
      return "::: lines 6\n:::";
    case "fill-in":
      return "::: fill-in\nWrite a prompt here:\n:::";
    case "checklist":
      return "- [ ] First step";
    case "exercise":
      return exerciseKind === "checklist"
        ? "::: exercise checklist New exercise\n- [ ] First step\n:::"
        : exerciseKind === "fill-in"
          ? "::: exercise fill-in New exercise\nFill in each line.\n\n::: fill-in\nWrite a prompt here:\n:::\n:::"
          : `::: exercise ${exerciseKind} New exercise\nWrite the question here.\n\n::: lines 6\n:::\n:::`;
  }
}
