import { EditorContent, useEditor } from "@tiptap/react";
import { Extension, type JSONContent } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { Plugin } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Check, ChevronDown, ClipboardPaste, MessageSquarePlus, PenLine, Plus, X } from "lucide-react";
import { Banner, Button, EmptyState, GalleySheet, IconButton, Kbd, Loader, modKey } from "../../components/ui";
import { cn } from "../../lib/cn";
import { fadeOnly, popover } from "../../lib/motion";
import type { InteriorLook } from "../../lib/interiorLook";
import type { MsBlock, MsClaim, MsNote, MsSection, NoteMode } from "./manuscript";
import { NoteCard, ProposedText } from "./NoteCard";
import { DiffText } from "./DiffText";
import { findRanges, mockRewrite, rewriteLabels, type RewriteKind } from "./textTools";
import { exerciseKindLabels, newBlockMarkdown, type ExerciseKind, type InsertKind } from "../../lib/workbookMarkdown";
import { SceneBreak, WorkbookBlock } from "./WorkbookBlock";
import { GeneratedPagePreview, OwnerPagePrompt } from "./GeneratedPagePreview";

interface Selection {
  blockId: string;
  start: number;
  end: number;
  text: string;
  top: number;
  bottom: number;
  left: number;
  /** The sheet's width when the selection was made, to keep the rewrite card inside it. */
  width: number;
}

interface Rewrite extends Selection {
  kind: RewriteKind;
  status: "working" | "ready";
  proposed: string;
  /** Why the editor proposes it (server rewrites). */
  reason?: string | undefined;
  /** The text the proposal replaces, when the server reports it. */
  original?: string | undefined;
}

interface EditorCanvasProps {
  /** The book and its pen name, for the links on a built page's preview. */
  bookId?: string | undefined;
  penNameId?: string | undefined;
  section: MsSection;
  label: string;
  metaRight: ReactNode;
  look: InteriorLook;
  notes: MsNote[];
  voiceOf: string;
  focusNoteId: string | null;
  onNoteFocused: () => void;
  onAddNote: (afterBlockId: string) => void;
  onNoteText: (id: string, text: string) => void;
  onNoteRun: (id: string, mode: NoteMode) => void;
  onNoteDiscard: (id: string) => void;
  onNoteAccept: (id: string) => void;
  onNoteReject: (id: string) => void;
  claims: MsClaim[];
  findRe: RegExp | null;
  currentMatch: { blockId: string; index: number } | null;
  pendingFocus: string | null;
  onFocused: () => void;
  onDraft: (blockId: string, text: string) => void;
  onCommit: (blockId: string, text: string) => void;
  onSplit: (blockId: string, offset: number, text: string) => void;
  onAcceptRewrite: (blockId: string, original: string, proposed: string, start: number) => void;
  onWriteSection: () => void;
  writing: boolean;
  writeDisabledReason: string | undefined;
  onPasteOwn: () => void;
  /** Clicking a claim's underline in the text: shows that claim's card so it can be dealt with. */
  onClaimClick?: ((claimId: string) => void) | undefined;
  /** False hides the selection rewrite toolbar. */
  rewrites?: boolean | undefined;
  /** A viewer's role: the text shows, nothing can be typed, noted or inserted. */
  readOnly?: boolean | undefined;
  /** Blocks the Insert menu offers for this book's template (scene breaks for fiction, exercises for workbooks). */
  insertKinds?: InsertKind[] | undefined;
  /** Adds a scene break or workbook block after a block (null: at the end). */
  onInsert?: ((afterBlockId: string | null, kind: "scene" | "workbook", text: string) => void) | undefined;
  /** Removes a scene break or workbook block. */
  onRemoveBlock?: ((blockId: string) => void) | undefined;
  /**
   * API mode: asks the server for a rewrite of the selection. Resolves with the proposal, or null when
   * it failed (the screen shows why). Without it, the demo's local rewrite is used.
   */
  onRewrite?:
    | ((
        sel: { blockId: string; start: number; end: number; text: string },
        kind: RewriteKind,
      ) => Promise<{ proposed: string; original: string; reason: string | null } | null>)
    | undefined;
}

const REWRITE_MS = 1100;
/** Text column and, on wide sheets, a margin column for notes beside their paragraph. */
const rowGrid = "grid grid-cols-1 @min-[880px]/sheet:grid-cols-[minmax(0,1fr)_minmax(220px,260px)] @min-[880px]/sheet:gap-x-10";
const toneKinds: RewriteKind[] = ["warmer", "direct", "formal"];

/** The galley sheet with editable paragraphs in Literata, claim marks, find highlights and selection rewrites. */
export function EditorCanvas(props: EditorCanvasProps) {
  const { section, label, metaRight, look, notes, claims, findRe, currentMatch, pendingFocus, onFocused } = props;
  const wrapRef = useRef<HTMLDivElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const acceptRef = useRef<HTMLButtonElement>(null);
  const [sel, setSel] = useState<Selection | null>(null);
  const [rewrite, setRewrite] = useState<Rewrite | null>(null);
  const [toneOpen, setToneOpen] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  const reduce = useReducedMotion();
  const preset = reduce ? fadeOnly : popover;

  // Track a selection inside one paragraph of the sheet.
  useEffect(() => {
    function onChange() {
      const s = window.getSelection();
      const wrap = wrapRef.current;
      const sheet = sheetRef.current;
      if (!s || s.rangeCount === 0 || !wrap || !sheet) return;
      if (s.isCollapsed) {
        if (sheet.contains(s.anchorNode)) setSel(null);
        return;
      }
      const range = s.getRangeAt(0);
      const startEl = closestBlock(range.startContainer);
      const endEl = closestBlock(range.endContainer);
      if (!startEl || startEl !== endEl || !sheet.contains(startEl)) {
        setSel(null);
        return;
      }
      const pre = document.createRange();
      pre.setStart(startEl, 0);
      pre.setEnd(range.startContainer, range.startOffset);
      const start = pre.toString().length;
      const text = range.toString();
      if (!text.trim()) return setSel(null);
      const r = range.getBoundingClientRect();
      const w = wrap.getBoundingClientRect();
      setSel({
        blockId: startEl.dataset.blockId ?? "",
        start,
        end: start + text.length,
        text,
        top: r.top - w.top,
        bottom: r.bottom - w.top,
        left: Math.min(Math.max(r.left - w.left + r.width / 2, 150), w.width - 150),
        width: wrap.clientWidth,
      });
    }
    document.addEventListener("selectionchange", onChange);
    return () => document.removeEventListener("selectionchange", onChange);
  }, []);

  useEffect(() => () => window.clearTimeout(timer.current), []);
  // A new section clears the selection and any open rewrite (adjusted during render, not in an effect).
  const [selSection, setSelSection] = useState(section.id);
  if (selSection !== section.id) {
    setSelSection(section.id);
    setSel(null);
    setRewrite(null);
  }

  // Focus a new paragraph after Enter or "Paste your own".
  useLayoutEffect(() => {
    if (!pendingFocus) return;
    const el = sheetRef.current?.querySelector<HTMLElement>(`[data-block-id="${pendingFocus}"]`);
    if (el) {
      el.focus();
      const r = document.createRange();
      r.setStart(el, 0);
      r.collapse(true);
      const s = window.getSelection();
      s?.removeAllRanges();
      s?.addRange(r);
      onFocused();
    }
  }, [pendingFocus, section.blocks, onFocused]);

  useEffect(() => {
    if (rewrite?.status === "ready") acceptRef.current?.focus();
  }, [rewrite?.status]);

  const startRewrite = useCallback(
    (kind: RewriteKind) => {
      if (!sel) return;
      setToneOpen(false);
      const base = { ...sel, kind };
      setRewrite({ ...base, status: "working", proposed: "" });
      window.clearTimeout(timer.current);
      const ask = props.onRewrite;
      if (ask) {
        void ask({ blockId: sel.blockId, start: sel.start, end: sel.end, text: sel.text }, kind).then((r) =>
          setRewrite((cur) =>
            cur && cur.blockId === base.blockId && cur.start === base.start
              ? r
                ? { ...base, status: "ready", proposed: r.proposed, original: r.original, reason: r.reason ?? undefined }
                : null
              : cur,
          ),
        );
        return;
      }
      timer.current = window.setTimeout(() => setRewrite({ ...base, status: "ready", proposed: mockRewrite(kind, sel.text) }), REWRITE_MS);
    },
    [sel, props.onRewrite],
  );

  function closeRewrite() {
    setRewrite(null);
    setSel(null);
  }

  function onSheetKey(e: KeyboardEvent<HTMLDivElement>) {
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.key.toLowerCase() === "j" && sel) {
      e.preventDefault();
      toolbarRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
    }
    if (e.key === "Escape" && rewrite) closeRewrite();
  }

  const empty = section.blocks.length === 0;
  const readOnly = props.readOnly === true;
  // The block the caret was last in, so Insert puts the new block after it.
  const [lastBlock, setLastBlock] = useState<string | null>(null);
  const insertKinds = !readOnly && props.onInsert ? (props.insertKinds ?? []) : [];

  return (
    <div ref={wrapRef} className="relative" onKeyDown={onSheetKey}>
      <GalleySheet
        label={section.generated || section.isPart ? `${section.title}, read-only preview` : `${section.title}, editable`}
        metaLeft={label}
        metaRight={metaRight}
        className="px-5! sm:px-14!"
      >
        <p className="mt-6 text-label text-ink-secondary">{section.number !== null ? `Chapter ${section.number}` : sectionKind(section)}</p>
        <h2
          className="opsz-title mt-1 font-book text-[28px] leading-[34px] font-medium tracking-[-0.015em] text-ink sm:text-title sm:leading-[42px]"
          style={look.heading}
        >
          {section.title}
        </h2>

        {!section.enabled ? (
          <Banner tone="info" title="This page is off" className="mt-6">
            {section.offReason}
          </Banner>
        ) : section.generated && empty ? (
          <GeneratedPagePreview className="mt-6" page={section.generated} bookId={props.bookId ?? ""} penNameId={props.penNameId ?? ""} />
        ) : section.isPart && empty ? (
          <Banner tone="info" title="A container for chapters" className="mt-6">
            This part groups the chapters that follow it. The exported book prints a divider page with its number and title. It holds no text of its own.
          </Banner>
        ) : empty && readOnly ? (
          <>
            {section.ownerPrompt && <OwnerPagePrompt className="mt-6" prompt={section.ownerPrompt} />}
            {!section.ownerPrompt && (
              <EmptyState className="mt-8" drawing="page" headingLevel={3} title="This section is empty" body="Nothing has been written here yet." />
            )}
          </>
        ) : empty ? (
          <>
            {section.ownerPrompt && <OwnerPagePrompt className="mt-6" prompt={section.ownerPrompt} />}
            <EmptyState
              className="mt-8"
              drawing="page"
              headingLevel={3}
              title={section.ownerPrompt ? "Ready when you are" : "This section is empty"}
              body={
                props.writeDisabledReason ??
                (section.ownerPrompt ? "Ask the writer for a draft, or write your own." : "Ask the writer for a draft, or paste your own text.")
              }
              action={
                <div className="flex flex-wrap gap-2">
                  <Button
                    icon={PenLine}
                    estimate="about $0.02"
                    loading={props.writing}
                    loadingLabel="Writing"
                    onClick={props.onWriteSection}
                    disabledReason={props.writeDisabledReason}
                  >
                    Write this section
                  </Button>
                  <Button variant="ghost" icon={ClipboardPaste} onClick={props.onPasteOwn}>
                    Paste your own
                  </Button>
                </div>
              }
            />
          </>
        ) : (
          <>
            {section.ownerPrompt && <OwnerPagePrompt className="mt-6" prompt={section.ownerPrompt} />}
            {insertKinds.length > 0 && (
              <InsertMenu
                kinds={insertKinds}
                onPick={(kind, text) => props.onInsert?.(lastBlock && section.blocks.some((b) => b.id === lastBlock) ? lastBlock : null, kind, text)}
              />
            )}
            <div
              ref={sheetRef}
              onFocusCapture={(e) => {
                const el = closestBlock(e.target);
                if (el?.dataset.blockId) setLastBlock(el.dataset.blockId);
              }}
              role="group"
              aria-label={`${section.title} text. Select words for rewrite options, ${modKey()} J to reach them. ${modKey()} Enter adds a note.`}
              className="@container/sheet mt-6 font-book text-prose text-ink"
              style={look.body}
            >
              {section.blocks.map((b, i) => {
                if (b.kind === "scene")
                  return <SceneBreak key={b.id} block={b} onRemove={!readOnly && props.onRemoveBlock ? () => props.onRemoveBlock?.(b.id) : undefined} />;
                if (b.kind === "workbook")
                  return (
                    <div key={b.id} className={rowGrid}>
                      <div className="min-w-0">
                        <WorkbookBlock
                          block={b}
                          readOnly={readOnly}
                          onDraft={props.onDraft}
                          onCommit={props.onCommit}
                          onRemove={!readOnly && props.onRemoveBlock ? () => props.onRemoveBlock?.(b.id) : undefined}
                        />
                      </div>
                    </div>
                  );
                const notesHere = notes.filter((n) => n.afterBlockId === b.id && (n.status === "draft" || n.status === "working" || n.status === "ready"));
                const ready = notesHere.filter((n) => n.status === "ready");
                return (
                  <Fragment key={b.id}>
                    <div className={cn(rowGrid, "group/row relative", b.kind === "h" && "mt-7")}>
                      <div className="relative min-w-0">
                        {!readOnly && (
                          <span className="absolute top-0 -left-12 hidden opacity-0 transition-opacity duration-(--vol-dur-fast) group-hover/row:opacity-100 group-focus-within/row:opacity-100 focus-within:opacity-100 sm:block">
                            <IconButton
                              size="sm"
                              variant="ghost"
                              icon={MessageSquarePlus}
                              label="Add a note here"
                              shortcut={[modKey(), "Enter"]}
                              onClick={() => props.onAddNote(b.id)}
                            />
                          </span>
                        )}
                        <EditableBlock
                          key={`${b.id}:${b.rev}:${findRe?.source ?? ""}:${findRe?.flags ?? ""}:${claims.map((c) => c.id).join(",")}:${currentMatch?.blockId === b.id ? currentMatch.index : -1}`}
                          block={b}
                          indent={b.kind === "p" && section.blocks[i - 1]?.kind === "p"}
                          readOnly={readOnly}
                          heading={look.heading}
                          claims={claims.filter((c) => c.blockId === b.id)}
                          findRe={findRe}
                          currentIndex={currentMatch?.blockId === b.id ? currentMatch.index : -1}
                          onDraft={props.onDraft}
                          onCommit={props.onCommit}
                          onSplit={props.onSplit}
                          onAddNote={props.onAddNote}
                          onClaimClick={props.onClaimClick}
                        />
                      </div>
                      {notesHere.length > 0 && (
                        <div className="mt-3 mb-2 grid min-w-0 content-start gap-2 @min-[880px]/sheet:relative @min-[880px]/sheet:z-10 @min-[880px]/sheet:mt-1 @min-[880px]/sheet:mb-0 @min-[880px]/sheet:h-0">
                          {notesHere.map((n) => (
                            <NoteCard
                              key={n.id}
                              note={n}
                              voiceOf={props.voiceOf}
                              focus={props.focusNoteId === n.id}
                              onFocused={props.onNoteFocused}
                              onText={(t) => props.onNoteText(n.id, t)}
                              onWeave={() => props.onNoteRun(n.id, "weave")}
                              onExpand={() => props.onNoteRun(n.id, "expand")}
                              onDiscard={() => props.onNoteDiscard(n.id)}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                    {ready.map((n) => (
                      <div key={`${n.id}-proposed`} className={rowGrid}>
                        <ProposedText
                          note={n}
                          body={look.body}
                          heading={look.heading}
                          onAccept={() => props.onNoteAccept(n.id)}
                          onReject={() => props.onNoteReject(n.id)}
                        />
                      </div>
                    ))}
                  </Fragment>
                );
              })}
              {section.excerpt && (
                <div className="mt-6 font-ui text-small text-ink-tertiary italic">Showing the opening pages. Word counts are for the whole section.</div>
              )}
            </div>
          </>
        )}
      </GalleySheet>

      <AnimatePresence>
        {sel && !rewrite && props.rewrites !== false && !readOnly && (
          <motion.div
            ref={toolbarRef}
            key="toolbar"
            role="toolbar"
            aria-label="Rewrite the selection"
            initial={preset.initial}
            animate={preset.animate}
            exit={preset.exit}
            onMouseDown={(e) => e.preventDefault()}
            className="absolute z-20 flex -translate-x-1/2 items-center gap-0.5 rounded-md bg-raised p-1 shadow-pop"
            style={{ top: Math.max(0, sel.top - 52), left: sel.left }}
          >
            {(["expand", "shorten", "rephrase"] as RewriteKind[]).map((k) => (
              <ToolbarButton key={k} onClick={() => startRewrite(k)}>
                {rewriteLabels[k]}
              </ToolbarButton>
            ))}
            <span className="relative">
              <ToolbarButton onClick={() => setToneOpen((o) => !o)} expanded={toneOpen}>
                Change tone
                <ChevronDown size={14} aria-hidden />
              </ToolbarButton>
              {toneOpen && (
                <span role="menu" aria-label="Change tone" className="absolute top-full right-0 mt-1 grid min-w-[150px] rounded-md bg-raised p-1 shadow-pop">
                  {toneKinds.map((k) => (
                    <button
                      key={k}
                      role="menuitem"
                      type="button"
                      onClick={() => startRewrite(k)}
                      onKeyDown={(e) => e.key === "Escape" && setToneOpen(false)}
                      className="h-9 rounded-sm px-3 text-left text-label text-ink hover:bg-sunken"
                    >
                      {rewriteLabels[k]}
                    </button>
                  ))}
                </span>
              )}
            </span>
            <span className="ml-1 hidden pr-1.5 sm:inline">
              <Kbd keys={[modKey(), "J"]} />
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {rewrite && (
          <motion.div
            key="rewrite"
            role="dialog"
            aria-label={`${rewriteLabels[rewrite.kind]} suggestion`}
            initial={preset.initial}
            animate={preset.animate}
            exit={preset.exit}
            onKeyDown={(e) => e.key === "Escape" && closeRewrite()}
            className="absolute z-20 w-[min(440px,calc(100%-16px))] -translate-x-1/2 rounded-md bg-raised p-4 shadow-pop"
            style={{ top: rewrite.bottom + 10, left: Math.min(Math.max(rewrite.left, 220), rewrite.width - 220) }}
          >
            <p className="text-label font-semibold text-ink">{rewriteLabels[rewrite.kind]}</p>
            {rewrite.status === "working" ? (
              <p role="status" className="mt-3 flex items-center gap-2 text-small text-ink-secondary">
                <Loader />
                The editor is rewriting the selection
              </p>
            ) : (
              <>
                <p className="mt-2 font-book text-prose-sm text-ink">
                  <DiffText before={rewrite.original ?? rewrite.text} after={rewrite.proposed} />
                </p>
                {rewrite.reason && <p className="mt-2 text-small text-ink-secondary">{rewrite.reason}</p>}
                <p className="mt-2 text-small text-ink-secondary">A suggestion only. Nothing changes until you accept it.</p>
                <div className="mt-3 flex justify-end gap-2">
                  <Button size="sm" variant="ghost" icon={X} onClick={closeRewrite}>
                    Reject
                  </Button>
                  <Button
                    ref={acceptRef}
                    size="sm"
                    icon={Check}
                    onClick={() => {
                      props.onAcceptRewrite(rewrite.blockId, rewrite.text, rewrite.proposed, rewrite.start);
                      closeRewrite();
                    }}
                  >
                    Accept
                  </Button>
                </div>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

const insertLabels: Record<Exclude<InsertKind, "exercise">, string> = {
  scene: "Scene break",
  lines: "Ruled lines",
  "fill-in": "Fill-in prompts",
  checklist: "Checklist",
};
const exerciseKinds: ExerciseKind[] = ["reflection", "checklist", "fill-in", "tracker", "scenario"];

/** Insert a scene break or a workbook block after the paragraph the caret was last in. */
function InsertMenu({ kinds, onPick }: { kinds: InsertKind[]; onPick: (kind: "scene" | "workbook", text: string) => void }) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  type Item = { id: string; label: string; kind: "scene" | "workbook"; text: string };
  const items = kinds.flatMap((k): Item[] =>
    k === "exercise"
      ? exerciseKinds.map((e) => ({ id: `exercise-${e}`, label: `${exerciseKindLabels[e]} exercise`, kind: "workbook", text: newBlockMarkdown("exercise", e) }))
      : [{ id: k, label: insertLabels[k], kind: k === "scene" ? "scene" : "workbook", text: newBlockMarkdown(k) }],
  );
  useEffect(() => {
    if (open) menuRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
  }, [open]);
  function close() {
    setOpen(false);
    buttonRef.current?.focus();
  }
  function onMenuKey(e: KeyboardEvent<HTMLDivElement>) {
    const list = [...(menuRef.current?.querySelectorAll<HTMLButtonElement>("button") ?? [])];
    const i = list.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      close();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      list[(i + 1) % list.length]?.focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      list[(i - 1 + list.length) % list.length]?.focus();
    }
  }
  // A single kind (fiction: scene break) is one button, no menu.
  if (items.length === 1) {
    const only = items[0]!;
    return (
      <div className="mb-2 flex justify-end">
        <Button size="sm" variant="ghost" icon={Plus} onClick={() => onPick(only.kind, only.text)}>
          Insert {only.label.toLowerCase()}
        </Button>
      </div>
    );
  }
  return (
    <div className="relative mb-2 flex justify-end">
      <Button ref={buttonRef} size="sm" variant="ghost" icon={Plus} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        Insert
      </Button>
      {open && (
        <div
          ref={menuRef}
          role="menu"
          aria-label="Insert a block"
          onKeyDown={onMenuKey}
          onBlur={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget) && e.relatedTarget !== buttonRef.current) setOpen(false);
          }}
          className="absolute top-full right-0 z-20 mt-1 grid min-w-[220px] rounded-md bg-raised p-1 font-ui shadow-pop"
        >
          {items.map((it) => (
            <button
              key={it.id}
              role="menuitem"
              type="button"
              onClick={() => {
                onPick(it.kind, it.text);
                setOpen(false);
              }}
              className="h-10 rounded-sm px-3 text-left text-label text-ink hover:bg-sunken focus-visible:bg-sunken"
            >
              {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ToolbarButton({ children, onClick, expanded }: { children: ReactNode; onClick: () => void; expanded?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={expanded}
      aria-haspopup={expanded === undefined ? undefined : "menu"}
      className="inline-flex h-9 items-center gap-1 rounded-sm px-2.5 text-label whitespace-nowrap text-ink hover:bg-sunken"
    >
      {children}
    </button>
  );
}

function sectionKind(s: MsSection): string {
  return s.group === "front" ? "Front matter" : s.group === "back" ? "Back matter" : "Chapter";
}

function closestBlock(node: Node): HTMLElement | null {
  const el = node instanceof HTMLElement ? node : node.parentElement;
  return el?.closest<HTMLElement>("[data-block-id]") ?? null;
}

interface EditableBlockProps {
  block: MsBlock;
  indent: boolean;
  readOnly: boolean;
  heading: CSSProperties | undefined;
  onAddNote: (afterBlockId: string) => void;
  claims: MsClaim[];
  findRe: RegExp | null;
  currentIndex: number;
  onDraft: (blockId: string, text: string) => void;
  onCommit: (blockId: string, text: string) => void;
  onSplit: (blockId: string, offset: number, text: string) => void;
  onClaimClick?: ((claimId: string) => void) | undefined;
}

/** TipTap owns text and undo history; existing block callbacks preserve the manuscript and note layout. */
function EditableBlock(props: EditableBlockProps) {
  const { block, indent, heading, claims, findRe, currentIndex } = props;
  const [binding] = useState(() => new BlockBindings(props));
  useLayoutEffect(() => {
    binding.update(props);
  });
  const highlights = useMemo(
    () =>
      Extension.create({
        name: "volumeHighlights",
        addProseMirrorPlugins() {
          return [
            new Plugin({
              props: {
                decorations(state) {
                  const value = binding.read();
                  const text = state.doc.textContent;
                  const decorations: Decoration[] = [];
                  for (const claim of value.claims) {
                    const start = text.indexOf(claim.sentence);
                    if (start >= 0 && claim.sentence)
                      decorations.push(
                        Decoration.inline(start + 1, start + claim.sentence.length + 1, {
                          class: "vol-claim-mark",
                          "data-claim-id": claim.id,
                          title: "Claim to check. Click to verify, soften or remove it.",
                        }),
                      );
                  }
                  for (const [index, [start, end]] of findRanges(text, value.findRe).entries()) {
                    if (end > start)
                      decorations.push(
                        Decoration.inline(start + 1, end + 1, {
                          class: index === value.currentIndex ? "bg-select-wash outline-2 outline-select rounded-xs" : "bg-select-wash rounded-xs",
                          ...(index === value.currentIndex ? { "data-find-current": "true" } : {}),
                        }),
                      );
                  }
                  return DecorationSet.create(state.doc, decorations);
                },
              },
            }),
          ];
        },
      }),
    [binding],
  );
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
          trailingNode: false,
          heading: { levels: [3] },
        }),
        highlights,
      ],
      content: blockDocument(block),
      editable: !props.readOnly,
      immediatelyRender: false,
      shouldRerenderOnTransaction: false,
      editorProps: {
        attributes: {
          "data-block-id": block.id,
          role: "textbox",
          "aria-label": block.kind === "h" ? "Manuscript subheading" : "Manuscript paragraph",
          spellcheck: "true",
          lang: "en-GB",
          class: cn("rounded-xs outline-none focus-visible:bg-select-wash/40", indent && "indent-[1.5em]"),
        },
        handleKeyDown(view, event) {
          if (event.key !== "Enter" || view.composing) return false;
          const value = binding.read();
          if (event.metaKey || event.ctrlKey) {
            value.onCommit(value.block.id, view.state.doc.textContent);
            value.onAddNote(value.block.id);
            return true;
          }
          if (!event.shiftKey) {
            value.onSplit(value.block.id, view.state.selection.$from.parentOffset, view.state.doc.textContent);
            return true;
          }
          return true;
        },
        handleClick(_view, _pos, event) {
          const mark = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-claim-id]") : null;
          const id = mark?.dataset.claimId;
          const onClaimClick = binding.read().onClaimClick;
          if (!id || !onClaimClick) return false;
          onClaimClick(id);
          return false;
        },
        handlePaste(view, event) {
          const text = event.clipboardData?.getData("text/plain").replace(/\s*\n+\s*/g, " ") ?? "";
          view.dispatch(view.state.tr.insertText(text));
          return true;
        },
      },
      onUpdate({ editor: current }) {
        const value = binding.read();
        value.onDraft(value.block.id, current.getText());
      },
      onBlur({ editor: current }) {
        const value = binding.read();
        value.onCommit(value.block.id, current.getText());
      },
    },
    [block.id, props.readOnly],
  );
  useEffect(() => {
    if (editor && editor.getText() !== block.text && !editor.isFocused) editor.commands.setContent(blockDocument(block), { emitUpdate: false });
  }, [editor, block]);
  useEffect(() => {
    if (editor) editor.view.dispatch(editor.state.tr.setMeta("volumeHighlights", true));
  }, [editor, claims, findRe, currentIndex]);
  return <EditorContent editor={editor} style={heading} className={block.kind === "h" ? "mb-2 font-ui text-subhead text-ink" : undefined} />;
}

function blockDocument(block: MsBlock): JSONContent {
  return {
    type: "doc",
    content: [
      {
        type: block.kind === "h" ? "heading" : "paragraph",
        ...(block.kind === "h" ? { attrs: { level: 3 } } : {}),
        content: block.text ? [{ type: "text", text: block.text }] : [],
      },
    ],
  };
}

class BlockBindings {
  constructor(private value: EditableBlockProps) {}
  update(value: EditableBlockProps): void {
    this.value = value;
  }
  read(): EditableBlockProps {
    return this.value;
  }
}
