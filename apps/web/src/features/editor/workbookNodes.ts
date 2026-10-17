import { Node, mergeAttributes, type JSONContent } from "@tiptap/core";
import { exerciseKindLabels, LINES_MAX, LINES_MIN, type ExerciseKind, type WbNode } from "../../lib/workbookMarkdown";

/* TipTap nodes for the workbook blocks (P6-5), built with @tiptap/core Node.create (free, no paid extension).
   One small editor holds one workbook block: an exercise with its paragraphs, checklist, ruled lines and
   fill-in prompts, or one of those on its own. The Markdown round trip is in lib/workbookMarkdown.ts; this
   file maps it to and from the editor's JSON. Tick boxes and ruled lines are drawn, never typed. */

function attrsOf(node: { attrs: Record<string, unknown> }): Record<string, unknown> {
  return node.attrs;
}
const str = (v: unknown, d = ""): string => (typeof v === "string" ? v : d);
const num = (v: unknown, d: number): number => (typeof v === "number" && Number.isFinite(v) ? v : d);

export function exerciseLabel(kind: string, title: string): string {
  const k = exerciseKindLabels[kind as ExerciseKind] ?? "Exercise";
  return title ? `${k} exercise: ${title}` : `${k} exercise`;
}

export const ExerciseNode = Node.create({
  name: "exercise",
  group: "block",
  content: "(paragraph | checklist | ruledLines | fillIn)+",
  defining: true,
  isolating: true,
  addAttributes() {
    return { kind: { default: "reflection" }, title: { default: "" } };
  },
  parseHTML() {
    return [{ tag: "section[data-exercise]" }];
  },
  renderHTML({ node, HTMLAttributes }) {
    const a = attrsOf(node);
    const label = exerciseLabel(str(a["kind"], "reflection"), str(a["title"]));
    return [
      "section",
      mergeAttributes(HTMLAttributes, {
        "data-exercise": str(a["kind"], "reflection"),
        "aria-label": label,
        class: "my-2 grid gap-3 rounded-md border border-border-strong bg-canvas px-4 py-4 sm:px-5",
      }),
      ["p", { contenteditable: "false", class: "font-ui text-label text-ink-secondary select-none" }, label],
      ["div", { class: "grid gap-3" }, 0],
    ];
  },
});

export const ChecklistNode = Node.create({
  name: "checklist",
  group: "block",
  content: "checkItem+",
  parseHTML() {
    return [{ tag: "ul[data-checklist]" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["ul", mergeAttributes(HTMLAttributes, { "data-checklist": "", "aria-label": "Checklist", class: "grid gap-2 font-ui text-body" }), 0];
  },
});

export const CheckItemNode = Node.create({
  name: "checkItem",
  content: "text*",
  defining: true,
  addAttributes() {
    return { checked: { default: false } };
  },
  parseHTML() {
    return [{ tag: "li[data-check]" }];
  },
  renderHTML({ HTMLAttributes }) {
    return [
      "li",
      mergeAttributes(HTMLAttributes, { "data-check": "", class: "flex items-start gap-3" }),
      ["span", { contenteditable: "false", "aria-hidden": "true", class: "mt-1 size-4 shrink-0 rounded-xs border-2 border-border-strong select-none" }],
      ["span", { class: "min-w-0 flex-1" }, 0],
    ];
  },
});

export const RuledLinesNode = Node.create({
  name: "ruledLines",
  group: "block",
  atom: true,
  selectable: true,
  draggable: false,
  addAttributes() {
    return { count: { default: 6 }, closed: { default: true } };
  },
  parseHTML() {
    return [{ tag: "div[data-lines]" }];
  },
  renderHTML({ node, HTMLAttributes }) {
    const count = Math.min(LINES_MAX, Math.max(LINES_MIN, Math.round(num(attrsOf(node)["count"], 6))));
    // At most 12 lines are drawn on screen; the count says how many print.
    const drawn = Math.min(count, 12);
    const rules: ["span", Record<string, string>][] = Array.from({ length: drawn }, () => ["span", { class: "block h-7 border-b border-border-strong" }]);
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-lines": String(count),
        contenteditable: "false",
        role: "img",
        "aria-label": `${count} ruled ${count === 1 ? "line" : "lines"} to write on`,
        class: "grid select-none",
      }),
      ...rules,
      ["span", { class: "mt-1 font-ui text-caption text-ink-tertiary" }, `${count} ${count === 1 ? "line" : "lines"} to write on`],
    ];
  },
});

export const FillInNode = Node.create({
  name: "fillIn",
  group: "block",
  content: "fillPrompt+",
  defining: true,
  addAttributes() {
    return { page: { default: false } };
  },
  parseHTML() {
    return [{ tag: "div[data-fill-in]" }];
  },
  renderHTML({ node, HTMLAttributes }) {
    const page = attrsOf(node)["page"] === true;
    return [
      "div",
      mergeAttributes(HTMLAttributes, { "data-fill-in": page ? "page" : "", class: "grid gap-1" }),
      ["p", { contenteditable: "false", class: "font-ui text-small text-ink-secondary select-none" }, page ? "Fill-in page" : "Fill in the blanks"],
      ["div", { class: "grid gap-2" }, 0],
    ];
  },
});

export const FillPromptNode = Node.create({
  name: "fillPrompt",
  content: "text*",
  defining: true,
  parseHTML() {
    return [{ tag: "p[data-prompt]" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["p", mergeAttributes(HTMLAttributes, { "data-prompt": "", class: "border-b border-border-strong pb-1" }), 0];
  },
});

export const workbookNodes = [ExerciseNode, ChecklistNode, CheckItemNode, RuledLinesNode, FillInNode, FillPromptNode];

/* ---------- JSON <-> nodes ---------- */

const textContent = (text: string): JSONContent[] => (text ? [{ type: "text", text }] : []);

function toJson(n: WbNode): JSONContent {
  switch (n.type) {
    case "paragraph":
      return { type: "paragraph", content: textContent(n.text) };
    case "checklist":
      return {
        type: "checklist",
        content: (n.items.length ? n.items : [{ text: "", checked: false }]).map((it) => ({
          type: "checkItem",
          attrs: { checked: it.checked },
          content: textContent(it.text),
        })),
      };
    case "lines":
      return { type: "ruledLines", attrs: { count: n.count, closed: n.closed } };
    case "fillIn":
      return {
        type: "fillIn",
        attrs: { page: n.page },
        content: (n.prompts.length ? n.prompts : [""]).map((p) => ({ type: "fillPrompt", content: textContent(p) })),
      };
    case "exercise":
      return {
        type: "exercise",
        attrs: { kind: n.kind, title: n.title },
        content: n.children.length ? n.children.map(toJson) : [{ type: "paragraph", content: [] }],
      };
  }
}

/** Workbook nodes as the editor's document. */
export function docFromWorkbook(nodes: WbNode[]): JSONContent {
  return { type: "doc", content: nodes.length ? nodes.map(toJson) : [{ type: "paragraph", content: [] }] };
}

function plain(n: JSONContent): string {
  return (n.content ?? []).map((c) => (c.type === "text" ? (c.text ?? "") : plain(c))).join("");
}

function fromJson(n: JSONContent): WbNode | null {
  const a: Record<string, unknown> = n.attrs ?? {};
  const kids = n.content ?? [];
  switch (n.type) {
    case "paragraph":
      return { type: "paragraph", text: plain(n) };
    case "checklist":
      return { type: "checklist", items: kids.map((k) => ({ text: plain(k), checked: (k.attrs ?? {})["checked"] === true })) };
    case "ruledLines":
      return { type: "lines", count: num(a["count"], 6), closed: a["closed"] !== false };
    case "fillIn":
      return { type: "fillIn", page: a["page"] === true, prompts: kids.map(plain) };
    case "exercise":
      return {
        type: "exercise",
        kind: str(a["kind"], "reflection"),
        title: str(a["title"]),
        children: kids.map(fromJson).filter((x): x is WbNode => x !== null),
      };
    default:
      return null;
  }
}

/** The editor's document back to workbook nodes. */
export function workbookFromDoc(doc: JSONContent): WbNode[] {
  return (doc.content ?? []).map(fromJson).filter((x): x is WbNode => x !== null);
}
