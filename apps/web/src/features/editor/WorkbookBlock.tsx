import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Settings2, Trash2 } from "lucide-react";
import { Button, IconButton, Input, Modal, Select, Switch } from "../../components/ui";
import { EXERCISE_KINDS, exerciseKindLabels, LINES_MAX, LINES_MIN, parseWorkbookMarkdown, serialiseWorkbook, type WbNode } from "../../lib/workbookMarkdown";
import type { MsBlock } from "./manuscript";
import { docFromWorkbook, workbookFromDoc, workbookNodes } from "./workbookNodes";

/* Scene breaks and workbook blocks on the Editor's galley sheet (P6-5). A scene break is drawn as the
   centred ornament the book prints. A workbook block (exercise, ruled lines, fill-in, checklist) is a
   small TipTap editor: its words are typed in place, and its details (kind, title, how many lines, a
   full fill-in page) change in a dialog. Both save back to the same Markdown the writer uses. */

/** The scene break between two scenes of a fiction chapter. */
export function SceneBreak({ block, onRemove }: { block: MsBlock; onRemove?: (() => void) | undefined }) {
  return (
    <div data-block-id={block.id} className="group/scene relative my-4 flex items-center justify-center">
      <span role="separator" aria-label="Scene break" className="font-book text-prose tracking-[0.6em] text-ink-secondary select-none">
        * * *
      </span>
      {onRemove && (
        <span className="absolute right-0 opacity-100 transition-opacity duration-(--vol-dur-fast) sm:opacity-0 sm:group-hover/scene:opacity-100 sm:focus-within:opacity-100">
          <IconButton icon={Trash2} size="sm" variant="ghost" label="Remove scene break" onClick={onRemove} />
        </span>
      )}
    </div>
  );
}

interface WorkbookBlockProps {
  block: MsBlock;
  readOnly: boolean;
  onDraft: (blockId: string, text: string) => void;
  onCommit: (blockId: string, text: string) => void;
  onRemove?: (() => void) | undefined;
}

/** A workbook block, edited in place with TipTap. Markdown in, the same Markdown out when nothing changes. */
export function WorkbookBlock({ block, readOnly, onDraft, onCommit, onRemove }: WorkbookBlockProps) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  // The block as it came in, and its Markdown as the editor would write it: when the editor's output equals
  // that baseline the owner changed nothing, so the original text is kept byte for byte.
  const latest = useRef({ text: block.text, baseline: serialiseWorkbook(parseWorkbookMarkdown(block.text)) });
  useLayoutEffect(() => {
    latest.current = { text: block.text, baseline: serialiseWorkbook(parseWorkbookMarkdown(block.text)) };
  }, [block.text]);
  const out = (json: Parameters<typeof workbookFromDoc>[0]) => {
    const md = serialiseWorkbook(workbookFromDoc(json));
    return md === latest.current.baseline ? latest.current.text : md;
  };
  const editor = useEditor(
    {
      extensions: [
        StarterKit.configure({
          bold: false,
          italic: false,
          strike: false,
          underline: false,
          link: false,
          code: false,
          codeBlock: false,
          blockquote: false,
          bulletList: false,
          orderedList: false,
          listItem: false,
          listKeymap: false,
          horizontalRule: false,
          hardBreak: false,
          heading: false,
          trailingNode: false,
        }),
        ...workbookNodes,
      ],
      content: docFromWorkbook(parseWorkbookMarkdown(block.text)),
      editable: !readOnly,
      immediatelyRender: false,
      shouldRerenderOnTransaction: false,
      editorProps: {
        attributes: {
          role: "textbox",
          "aria-multiline": "true",
          "aria-label": "Workbook block",
          spellcheck: "true",
          class: "rounded-md outline-none font-book text-prose-sm",
        },
        handlePaste(view, event) {
          // Plain text only, so pasted formatting cannot break the block's Markdown.
          const text = event.clipboardData?.getData("text/plain") ?? "";
          view.dispatch(view.state.tr.insertText(text.replace(/\s*\n+\s*/g, " ")));
          return true;
        },
      },
      onUpdate({ editor: current }) {
        onDraft(block.id, out(current.getJSON()));
      },
      onBlur({ editor: current }) {
        onCommit(block.id, out(current.getJSON()));
      },
    },
    [block.id, block.rev, readOnly],
  );
  useEffect(() => {
    editor?.setEditable(!readOnly);
  }, [editor, readOnly]);

  const nodes = useMemo(() => parseWorkbookMarkdown(block.text), [block.text]);
  const kindName =
    nodes[0]?.type === "exercise" ? "exercise" : nodes[0]?.type === "lines" ? "ruled lines" : nodes[0]?.type === "fillIn" ? "fill-in" : "checklist";

  return (
    <div data-block-id={block.id} className="group/wb relative my-2">
      {!readOnly && (
        <div className="mb-1 flex justify-end gap-1 opacity-100 transition-opacity duration-(--vol-dur-fast) sm:opacity-0 sm:group-hover/wb:opacity-100 sm:group-focus-within/wb:opacity-100">
          <IconButton icon={Settings2} size="sm" variant="ghost" label={`Change ${kindName} details`} onClick={() => setDetailsOpen(true)} />
          {onRemove && <IconButton icon={Trash2} size="sm" variant="ghost" label={`Remove ${kindName}`} onClick={onRemove} />}
        </div>
      )}
      {/* The 2 px pencil ring shows while the caret is anywhere in the block. */}
      <EditorContent
        editor={editor}
        className="rounded-md has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-select"
      />
      {!readOnly && (
        <WorkbookDetails
          open={detailsOpen}
          nodes={nodes}
          onClose={() => setDetailsOpen(false)}
          onSave={(next) => {
            setDetailsOpen(false);
            onCommit(block.id, serialiseWorkbook(next));
          }}
        />
      )}
    </div>
  );
}

/* ---------- Details dialog ---------- */

type Path = number[];

/** Every node with details to change, with its path in the tree. */
function detailTargets(nodes: WbNode[], base: Path = []): { path: Path; node: WbNode }[] {
  return nodes.flatMap((n, i) => {
    const path = [...base, i];
    if (n.type === "exercise") return [{ path, node: n }, ...detailTargets(n.children, path)];
    if (n.type === "lines" || n.type === "fillIn") return [{ path, node: n }];
    return [];
  });
}

function update(nodes: WbNode[], path: Path, fn: (n: WbNode) => WbNode): WbNode[] {
  const [head, ...rest] = path;
  return nodes.map((n, i) => {
    if (i !== head) return n;
    if (rest.length === 0) return fn(n);
    return n.type === "exercise" ? { ...n, children: update(n.children, rest, fn) } : n;
  });
}

function WorkbookDetails({ open, nodes, onClose, onSave }: { open: boolean; nodes: WbNode[]; onClose: () => void; onSave: (n: WbNode[]) => void }) {
  const [draft, setDraft] = useState(nodes);
  const [opened, setOpened] = useState(open);
  if (open !== opened) {
    setOpened(open);
    if (open) setDraft(nodes);
  }
  // Each target's number among its own kind, for labels when a block holds two of them.
  const targets = detailTargets(draft).map((t, i, all) => ({ ...t, nth: all.slice(0, i + 1).filter((x) => x.node.type === t.node.type).length }));
  const badCount = targets.some(({ node }) => node.type === "lines" && (node.count < LINES_MIN || node.count > LINES_MAX || !Number.isInteger(node.count)));

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Block details"
      description="These change how the block prints. Its words are edited on the page."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button disabledReason={badCount ? `Use ${LINES_MIN} to ${LINES_MAX} lines.` : undefined} onClick={() => onSave(draft)}>
            Save details
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        {targets.length === 0 && <p className="text-small text-ink-secondary">A checklist has no details to change. Edit its items on the page.</p>}
        {targets.map(({ path, node, nth }) => {
          const key = path.join(".");
          if (node.type === "exercise")
            return (
              <div key={key} className="grid gap-3 sm:grid-cols-2">
                <Select
                  label="Exercise kind"
                  value={node.kind}
                  options={[...new Set([...EXERCISE_KINDS, node.kind])].map((k) => ({
                    value: k,
                    label: exerciseKindLabels[k as keyof typeof exerciseKindLabels] ?? k,
                  }))}
                  onChange={(v) => setDraft((d) => update(d, path, (n) => (n.type === "exercise" ? { ...n, kind: v } : n)))}
                />
                <Input
                  label="Exercise title"
                  value={node.title}
                  maxLength={120}
                  onChange={(e) => setDraft((d) => update(d, path, (n) => (n.type === "exercise" ? { ...n, title: e.target.value } : n)))}
                />
              </div>
            );
          if (node.type === "lines") {
            const label = nth > 1 ? `Lines to write on, block ${nth}` : "Lines to write on";
            const bad = node.count < LINES_MIN || node.count > LINES_MAX || !Number.isInteger(node.count);
            return (
              <Input
                key={key}
                label={label}
                type="number"
                inputMode="numeric"
                min={LINES_MIN}
                max={LINES_MAX}
                value={Number.isFinite(node.count) ? String(node.count) : ""}
                error={bad ? `Use a whole number from ${LINES_MIN} to ${LINES_MAX}.` : undefined}
                hint={`From ${LINES_MIN} to ${LINES_MAX}. PDF and Word draw them; the ebook says "Space to write your answer."`}
                onChange={(e) => setDraft((d) => update(d, path, (n) => (n.type === "lines" ? { ...n, count: Number(e.target.value) } : n)))}
              />
            );
          }
          if (node.type === "fillIn") {
            return (
              <Switch
                key={key}
                label={nth > 1 ? `Print fill-in ${nth} as a full page` : "Print the fill-in as a full page"}
                description="A full page starts on a new page with room under each prompt."
                checked={node.page}
                onChange={(on) => setDraft((d) => update(d, path, (n) => (n.type === "fillIn" ? { ...n, page: on } : n)))}
              />
            );
          }
          return null;
        })}
      </div>
    </Modal>
  );
}
