import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { Flag, History, MessageSquarePlus, PanelRightClose, PanelRightOpen, Save } from "lucide-react";
import { Button, EmptyState, IconButton, Modal, modKey } from "../../components/ui";
import { DEMO_NOW, getPenName, stageOrder, type Book } from "../../data";
import { useBook } from "../../lib/useBook";
import { cn } from "../../lib/cn";
import { formatNumber, formatTime } from "../../lib/format";
import { useStepAction } from "../../lib/stepAction";
import { NotFound } from "../../shell/NotFound";
import { interiorLook } from "../../lib/interiorLook";
import { ErrorPanel, LoadingBlock, useScreenState } from "../writing/screenState";
import { EditorCanvas } from "./EditorCanvas";
import { EditorInspector, type InspectorTab } from "./EditorInspector";
import { FindReplace, type FindState } from "./FindReplace";
import {
  getManuscript,
  type Manuscript,
  type MsBlock,
  type MsClaim,
  type MsSection,
  type MsSuggestion,
  type MsVersion,
  type NoteMode,
  type SuggestionPass,
} from "./manuscript";
import { ManuscriptTree } from "./ManuscriptTree";
import { countWords, expandNote, findIssues, findRanges, findRegex, weaveNote, type Issue } from "./textTools";
import { makeSuggestions, newId, useManuscript } from "./useManuscript";
import { VersionDrawer } from "./VersionDrawer";
import { ApiEditor } from "./ApiEditor";

/* Editor (docs/09-UX-FLOWS.md, M9). A mock of the TipTap editor: paragraphs are editable in place on the
   galley sheet. Checks run as you type, claims and suggestions change the text only when accepted, and
   every save or restore is a version. */

const defaultSection: Record<string, string> = { "the-new-charge-nurse": "ch-6", handover: "ch-3" };
const PASS_MS = 1400;
const WRITE_MS = 1600;
const NOTE_MS = 1500;

export default function EditorPage() {
  const { book, from, apiBook, penName } = useBook();
  if (book && from === "api") return <ApiEditor key={book.id} book={book} apiBook={apiBook} penName={penName} />;
  return <DemoEditorPage />;
}

function DemoEditorPage() {
  const { book } = useBook();
  const { state, retry } = useScreenState();
  if (!book) return <NotFound what="book" />;
  if (state === "loading")
    return (
      <div className="px-4 py-6 sm:px-8 lg:px-10">
        <LoadingBlock label="Loading the manuscript" rows={8} className="mx-auto max-w-[760px]" />
      </div>
    );
  if (state === "error")
    return (
      <div className="px-4 py-6 sm:px-8 lg:px-10">
        <h1 className="font-book text-title text-ink">Editor</h1>
        <ErrorPanel
          className="mt-5 max-w-[720px]"
          title="Could not open the manuscript"
          body="The server did not send the sections. Your text is saved on this computer. Retry to load it again."
          onRetry={retry}
        />
      </div>
    );
  const ms = state === "empty" ? null : getManuscript(book.id);
  if (!ms) return <NoManuscript book={book} />;
  return <Editor key={book.id} book={book} initial={ms} />;
}

function NoManuscript({ book }: { book: Book }) {
  const before = stageOrder.indexOf(book.stage) <= stageOrder.indexOf("writing") && book.words.written === 0;
  return (
    <div className="px-4 py-6 sm:px-8 lg:px-10 lg:py-7">
      <h1 className="font-book text-title text-ink">Editor</h1>
      <EmptyState
        className="mt-6 max-w-[640px]"
        drawing="page"
        title={before ? "Nothing to edit yet" : "Manuscript not loaded"}
        body={
          before
            ? "The writer has not started this book. Sections appear here as soon as they are written."
            : "Only The New Charge Nurse and Handover carry their full text in this preview. Open one of those to try the editor."
        }
        action={
          before ? (
            <Link
              to={`/books/${book.id}/writing`}
              className="inline-flex h-10 items-center rounded-sm border border-border-strong bg-sheet px-4 text-label font-semibold text-ink hover:bg-sunken"
            >
              Open Writing
            </Link>
          ) : (
            <Link
              to="/books/the-new-charge-nurse/editor"
              className="inline-flex h-10 items-center rounded-sm border border-border-strong bg-sheet px-4 text-label font-semibold text-ink hover:bg-sunken"
            >
              Open The New Charge Nurse
            </Link>
          )
        }
      />
    </div>
  );
}

function Editor({ book, initial }: { book: Book; initial: Manuscript }) {
  const navigate = useNavigate();
  const { sectionId: param } = useParams();
  const store = useManuscript(initial, book.updatedAt);
  const { ms } = store;
  const fallbackId = defaultSection[book.id] ?? ms.sections.find((s) => s.group === "body")?.id ?? ms.sections[0]?.id ?? "";
  const section = ms.sections.find((s) => s.id === param) ?? ms.sections.find((s) => s.id === fallbackId) ?? ms.sections[0]!;

  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [tab, setTab] = useState<InspectorTab>(book.id === "handover" ? "claims" : "suggestions");
  const [pass, setPass] = useState<SuggestionPass>("line");
  const [passRunning, setPassRunning] = useState(false);
  const [findOpen, setFindOpen] = useState(false);
  const [find, setFind] = useState<FindState>({ query: "", replace: "", matchCase: false, wholeWord: false, scope: "section" });
  const [matchIdx, setMatchIdx] = useState(0);
  const [replaceResult, setReplaceResult] = useState<{ text: string; undo: Manuscript | null } | null>(null);
  const [drawer, setDrawer] = useState<{ open: boolean; left: number | null }>({ open: false, left: null });
  const [restoredNote, setRestoredNote] = useState<string | null>(null);
  const [saveNote, setSaveNote] = useState<string | null>(null);
  const [pendingFocus, setPendingFocus] = useState<string | null>(null);
  const [writing, setWriting] = useState(false);
  const [announce, setAnnounce] = useState("");
  const [panelOpen, setPanelOpen] = useState(true);
  const [focusNote, setFocusNote] = useState<string | null>(null);
  const [doneOpen, setDoneOpen] = useState(false);
  const look = useMemo(() => interiorLook(book), [book]);
  const pen = getPenName(book.penNameId);
  const voiceOf = pen?.name.split(" ")[0] ?? "the author";
  const blockSnapshots = useRef<Record<string, { blockId: string; text: string }>>({});
  const timers = useRef<number[]>([]);
  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);

  // Words: the full section's count, moved by the edits made here.
  const initialWords = useMemo(() => Object.fromEntries(initial.sections.map((s) => [s.id, s.blocks.reduce((n, b) => n + countWords(b.text), 0)])), [initial]);
  const textOf = useCallback((b: MsBlock) => drafts[b.id] ?? b.text, [drafts]);
  const wordsFor = useCallback(
    (s: MsSection) => Math.max(0, s.baseWords + s.blocks.reduce((n, b) => n + countWords(textOf(b)), 0) - (initialWords[s.id] ?? 0)),
    [initialWords, textOf],
  );
  const totalWords = ms.sections.filter((s) => s.enabled).reduce((n, s) => n + wordsFor(s), 0);
  const words = wordsFor(section);
  const versions = ms.versions[section.id] ?? [];
  const dirty = store.isDirty(section.id) || section.blocks.some((b) => drafts[b.id] !== undefined && drafts[b.id] !== b.text);

  const liveBlocks = useMemo(() => section.blocks.map((b) => ({ id: b.id, text: textOf(b) })), [section.blocks, textOf]);
  const issues = useMemo(() => findIssues(liveBlocks), [liveBlocks]);
  const sectionClaims = ms.claims.filter((c) => c.sectionId === section.id && c.status === "open");
  const sectionLabel = (id: string) => {
    const s = ms.sections.find((x) => x.id === id);
    return s ? (s.number !== null ? `Chapter ${s.number}` : s.title) : id;
  };

  /* ---------- Find ---------- */
  const findRe = useMemo(
    () => (findOpen ? findRegex({ query: find.query, matchCase: find.matchCase, wholeWord: find.wholeWord }) : null),
    [findOpen, find.query, find.matchCase, find.wholeWord],
  );
  const sectionMatches = useMemo(
    () => (findRe ? section.blocks.flatMap((b) => findRanges(b.text, findRe).map((r, i) => ({ blockId: b.id, index: i, range: r }))) : []),
    [findRe, section],
  );
  const bookCounts = useMemo(() => {
    if (!findRe) return { count: 0, sections: 0 };
    let count = 0;
    let sections = 0;
    for (const s of ms.sections) {
      const n = s.blocks.reduce((k, b) => k + findRanges(b.text, findRe).length, 0);
      count += n;
      if (n > 0) sections++;
    }
    return { count, sections };
  }, [findRe, ms.sections]);
  const current = sectionMatches.length ? sectionMatches[Math.min(matchIdx, sectionMatches.length - 1)] : undefined;

  useEffect(() => setMatchIdx(0), [find.query, find.matchCase, find.wholeWord, section.id]);
  const currentKey = current ? `${current.blockId}:${current.index}` : null;
  useEffect(() => {
    if (!currentKey) return;
    document.querySelector("[data-find-current]")?.scrollIntoView({ block: "center", behavior: "auto" });
  }, [currentKey]);

  /* ---------- Editing ---------- */
  const onDraft = useCallback((blockId: string, text: string) => setDrafts((d) => ({ ...d, [blockId]: text })), []);
  const clearDraft = (blockId: string) =>
    setDrafts((d) => {
      const { [blockId]: _gone, ...rest } = d;
      void _gone;
      return rest;
    });
  const onCommit = useCallback(
    (blockId: string, text: string) => {
      const b = section.blocks.find((x) => x.id === blockId);
      if (b && b.text !== text) store.setBlockText(section.id, blockId, text);
      clearDraft(blockId);
    },
    [section, store],
  );
  const onSplit = useCallback(
    (blockId: string, offset: number, text: string) => {
      const id = store.splitBlock(section.id, blockId, offset, text);
      clearDraft(blockId);
      setPendingFocus(id);
    },
    [section.id, store],
  );
  const onFocused = useCallback(() => setPendingFocus(null), []);
  const onNoteFocused = useCallback(() => setFocusNote(null), []);

  function commitActive() {
    const el = document.activeElement;
    if (el instanceof HTMLElement && el.dataset.blockId) onCommit(el.dataset.blockId, el.textContent ?? "");
  }

  function saveVersion() {
    commitActive();
    if (!dirty && !store.isDirty(section.id)) {
      setSaveNote("No changes to save.");
      return;
    }
    const num = (versions[versions.length - 1]?.number ?? 0) + 1;
    store.saveVersion(section.id, "Owner", "Your edits");
    setSaveNote(`Saved as version ${num} at ${formatTime(DEMO_NOW)}.`);
    setAnnounce(`Saved as version ${num}.`);
  }

  // Keyboard: Cmd S saves, Cmd F finds in this section, Cmd Shift F finds across the book.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      const k = e.key.toLowerCase();
      if (k === "s") {
        e.preventDefault();
        saveVersion();
      } else if (k === "f") {
        e.preventDefault();
        setFind((f) => ({ ...f, scope: e.shiftKey ? "book" : "section" }));
        setFindOpen(true);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  useEffect(() => {
    if (dirty) setSaveNote(null);
  }, [dirty]);

  useEffect(() => {
    setSaveNote(null);
    setRestoredNote(null);
    setReplaceResult(null);
  }, [section.id]);

  /* ---------- Checks, claims, suggestions ---------- */
  function onFixIssue(issue: Issue) {
    const b = section.blocks.find((x) => x.id === issue.blockId);
    if (!b) return;
    if (issue.kind === "em-dash") store.setBlockText(section.id, b.id, b.text.replace(/\s*\u2014\s*/, ", "));
    else if (issue.fix) store.replaceInBlock(section.id, b.id, issue.found, issue.fix);
    setAnnounce("Fixed.");
  }

  function snapshot(key: string, blockId: string) {
    const b = ms.sections.flatMap((s) => s.blocks).find((x) => x.id === blockId);
    if (b) blockSnapshots.current[key] = { blockId, text: b.text };
  }
  function restoreSnapshot(key: string, sectionId: string) {
    const snap = blockSnapshots.current[key];
    if (snap) store.setBlockText(sectionId, snap.blockId, snap.text);
    delete blockSnapshots.current[key];
  }

  function onClaim(claim: MsClaim, action: "verify" | "soften" | "remove" | "undo", note?: string) {
    if (action === "verify") {
      store.setClaim(claim.id, { status: "verified", note });
      setAnnounce("Claim marked verified.");
    } else if (action === "soften") {
      snapshot(claim.id, claim.blockId);
      store.replaceInBlock(claim.sectionId, claim.blockId, claim.sentence, claim.softened);
      store.setClaim(claim.id, { status: "softened" });
      setAnnounce("Softer wording used.");
    } else if (action === "remove") {
      snapshot(claim.id, claim.blockId);
      store.replaceInBlock(claim.sectionId, claim.blockId, claim.sentence, "");
      store.setClaim(claim.id, { status: "removed" });
      setAnnounce("Sentence removed.");
    } else {
      restoreSnapshot(claim.id, claim.sectionId);
      store.setClaim(claim.id, { status: "open", note: undefined });
      setAnnounce("Claim back to open.");
    }
  }

  function onSuggestion(s: MsSuggestion, action: "accept" | "reject" | "undo") {
    const st = store.suggestionState[s.id] ?? "pending";
    if (action === "accept") {
      snapshot(s.id, s.blockId);
      store.replaceInBlock(s.sectionId, s.blockId, s.original, s.proposed);
      store.setSuggestionState((m) => ({ ...m, [s.id]: "accepted" }));
    } else if (action === "reject") {
      store.setSuggestionState((m) => ({ ...m, [s.id]: "rejected" }));
    } else {
      if (st === "accepted") restoreSnapshot(s.id, s.sectionId);
      store.setSuggestionState((m) => ({ ...m, [s.id]: "pending" }));
    }
  }

  const sectionSuggestions = ms.suggestions.filter((s) => s.sectionId === section.id);
  function onAllSuggestions(action: "accept" | "reject") {
    for (const s of sectionSuggestions.filter((x) => x.pass === pass && (store.suggestionState[x.id] ?? "pending") === "pending")) onSuggestion(s, action);
    setAnnounce(action === "accept" ? "All suggestions accepted." : "All suggestions rejected.");
  }

  function runPass() {
    setPassRunning(true);
    const sec = section;
    const idx = ms.sections.findIndex((s) => s.id === sec.id);
    timers.current.push(
      window.setTimeout(() => {
        store.addSuggestions(sec.id, pass, makeSuggestions(sec, ms.sections[idx + 1], pass));
        setPassRunning(false);
        setAnnounce("Suggestions ready.");
      }, PASS_MS),
    );
  }

  /* ---------- Versions ---------- */
  function onRestore(v: MsVersion) {
    commitActive();
    let next = (versions[versions.length - 1]?.number ?? 0) + 1;
    if (store.isDirty(section.id)) {
      store.saveVersion(section.id, "Owner", "Saved before restoring");
      next++;
    }
    store.setBlocks(section.id, v.blocks);
    store.saveVersion(section.id, "Restore", `Restored from version ${v.number}`);
    setRestoredNote(`Version ${v.number} restored and saved as version ${next}. The text before it stays in the list.`);
    setAnnounce(`Version ${v.number} restored.`);
  }

  /* ---------- Find and replace ---------- */
  function replaceOne() {
    if (!current) return;
    const b = section.blocks.find((x) => x.id === current.blockId);
    if (!b) return;
    const [a, z] = current.range;
    store.setBlockText(section.id, b.id, b.text.slice(0, a) + find.replace + b.text.slice(z));
  }
  function replaceAll() {
    if (!findRe) return;
    commitActive();
    const before = ms;
    const scope = find.scope === "section" ? [section] : ms.sections;
    let count = 0;
    let touched = 0;
    for (const s of scope) {
      let n = 0;
      const blocks = s.blocks.map((b) => {
        const text = b.text.replace(findRe, () => {
          n++;
          return find.replace;
        });
        return text === b.text ? b : { ...b, text };
      });
      if (n > 0) {
        count += n;
        touched++;
        store.setBlocks(s.id, blocks);
        store.saveVersion(s.id, "Owner", `Replaced "${find.query}" with "${find.replace}"`);
      }
    }
    setReplaceResult({ text: `Replaced ${count} in ${touched} ${touched === 1 ? "section" : "sections"}. Saved one version per section.`, undo: before });
  }

  /* ---------- Author notes ---------- */
  const sectionNotes = ms.notes.filter((n) => n.sectionId === section.id);
  const openNotes = ms.notes.filter((n) => n.status === "draft" || n.status === "working" || n.status === "ready");
  const noteRuns = useRef(0);

  function addNote(afterBlockId?: string) {
    let anchor = afterBlockId;
    if (!anchor) {
      const el = document.activeElement;
      anchor = el instanceof HTMLElement && el.dataset.blockId ? el.dataset.blockId : section.blocks[section.blocks.length - 1]?.id;
    }
    if (!anchor) return;
    commitActive();
    setFocusNote(store.addNote(section.id, anchor));
    setAnnounce("Note added. Write your rough words, then weave them in.");
  }

  function runNote(id: string, mode: NoteMode) {
    const note = ms.notes.find((n) => n.id === id);
    if (!note || !note.text.trim()) return;
    store.updateNote(id, { status: "working", mode });
    const n = noteRuns.current++;
    timers.current.push(
      window.setTimeout(() => {
        const blocks: MsBlock[] =
          mode === "weave"
            ? [{ id: newId(), kind: "p", text: note.prepared?.weave ?? weaveNote(note.text, book.id, n), rev: 0 }]
            : (() => {
                const x = note.prepared?.expand ?? expandNote(note.text, book.id, n);
                return [
                  { id: newId(), kind: "h" as const, text: x.heading, rev: 0 },
                  ...x.paragraphs.map((t) => ({ id: newId(), kind: "p" as const, text: t, rev: 0 })),
                ];
              })();
        store.updateNote(id, { status: "ready", proposed: blocks });
        setAnnounce(
          mode === "weave" ? "Your note is woven in. Review it in blue pencil, then accept or reject." : "New section ready. Review it, then accept or reject.",
        );
      }, NOTE_MS),
    );
  }

  function acceptNote(id: string) {
    const note = ms.notes.find((n) => n.id === id);
    if (!note) return;
    store.insertAfter(note.sectionId, note.afterBlockId, note.proposed);
    store.updateNote(id, { status: note.mode === "expand" ? "expanded" : "woven", proposed: [] });
    setAnnounce("Accepted. Save a version to keep it.");
  }

  /* ---------- Empty section ---------- */
  const queuedInJob = book.id === "handover" && section.blocks.length === 0 && section.group !== "front";
  function writeSection() {
    setWriting(true);
    const id = section.id;
    timers.current.push(
      window.setTimeout(() => {
        store.addParagraph(id, "For the nurses who took the keys before they felt ready, and for the ones who will take them next.");
        setWriting(false);
        setAnnounce("Draft written. Review it, then save a version.");
      }, WRITE_MS),
    );
  }
  function pasteOwn() {
    setPendingFocus(store.addParagraph(section.id, ""));
  }

  const versionNo = versions[versions.length - 1]?.number ?? 1;
  const target = section.wordTarget;
  const over = target !== null && words > target ? words - target : 0;
  const overLimit = target !== null && words > target * 1.15;
  const metaRight =
    over > 0 ? (
      <span className="inline-flex items-center gap-1 text-accent-text">
        <Flag size={12} strokeWidth={2} aria-hidden />
        {formatNumber(over)} words over target{overLimit ? ", past the 15% allowance" : ""}
      </span>
    ) : (
      `Version ${versionNo}`
    );
  const openClaims = ms.claims.filter((c) => c.status === "open").length;

  useStepAction({ label: "Mark edit done", onClick: () => setDoneOpen(true) });

  return (
    <div
      className={cn(
        "grid grid-cols-1 xl:h-screen-fill xl:grid-rows-[minmax(0,1fr)]",
        panelOpen ? "xl:grid-cols-[256px_minmax(0,1fr)_352px]" : "xl:grid-cols-[256px_minmax(0,1fr)]",
      )}
    >
      <ManuscriptTree
        bookId={book.id}
        sections={ms.sections}
        current={section.id}
        wordsFor={wordsFor}
        claimsFor={(id) => ms.claims.filter((c) => c.sectionId === id && c.status === "open").length}
        dirty={store.isDirty}
        totalWords={totalWords}
        targetWords={book.words.target}
      />

      <div className="relative min-h-0 xl:overflow-y-auto">
        <div className="px-4 pt-4 pb-16 sm:px-6 xl:px-8">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <h1 className="text-[18px] leading-6 font-semibold text-ink">Editor</h1>
            <p className="num text-small text-ink-secondary" role="status">
              {saveNote ?? (dirty ? "Unsaved changes" : `Saved as version ${versionNo}`)}
            </p>
            <div className="ml-auto flex flex-wrap items-center gap-1.5">
              <Button
                variant="ghost"
                icon={MessageSquarePlus}
                onClick={() => addNote()}
                title={`Add a note after the paragraph you are in (${modKey()} Enter)`}
                disabledReason={section.blocks.length === 0 ? "Write or paste some text first." : undefined}
              >
                Add note
              </Button>
              <Button variant="ghost" icon={History} onClick={() => setDrawer({ open: true, left: null })}>
                Versions
              </Button>
              <Button icon={Save} onClick={saveVersion} aria-keyshortcuts="Meta+S Control+S" title={`Save version (${modKey()} S)`}>
                Save version
              </Button>
              <span className="hidden xl:inline-flex">
                <IconButton
                  icon={panelOpen ? PanelRightClose : PanelRightOpen}
                  label={panelOpen ? "Hide the side panel" : "Show the side panel"}
                  pressed={!panelOpen}
                  onClick={() => setPanelOpen((o) => !o)}
                />
              </span>
            </div>
          </div>
          {findOpen && (
            <div className="mt-4">
              <FindReplace
                state={find}
                onChange={(p) => {
                  setFind((f) => ({ ...f, ...p }));
                  setReplaceResult(null);
                }}
                onClose={() => setFindOpen(false)}
                countInSection={sectionMatches.length}
                countInBook={bookCounts.count}
                sectionsWithMatches={bookCounts.sections}
                current={Math.min(matchIdx, Math.max(0, sectionMatches.length - 1))}
                onStep={(d) => setMatchIdx((i) => (sectionMatches.length ? (i + d + sectionMatches.length) % sectionMatches.length : 0))}
                onReplaceOne={replaceOne}
                onReplaceAll={replaceAll}
                result={replaceResult?.text ?? null}
                onUndo={
                  replaceResult?.undo
                    ? () => {
                        store.replaceSnapshot(replaceResult.undo!);
                        setReplaceResult({ text: "Undone. The text is back as it was.", undo: null });
                      }
                    : null
                }
              />
            </div>
          )}
          <div className="mt-4">
            <EditorCanvas
              section={section}
              label={`${look.name} interior`}
              metaRight={metaRight}
              look={look}
              notes={sectionNotes}
              voiceOf={voiceOf}
              focusNoteId={focusNote}
              onNoteFocused={onNoteFocused}
              onAddNote={(id) => addNote(id)}
              onNoteText={(id, text) => store.updateNote(id, { text })}
              onNoteRun={runNote}
              onNoteDiscard={(id) => {
                store.removeNote(id);
                setAnnounce("Note discarded.");
              }}
              onNoteAccept={acceptNote}
              onNoteReject={(id) => {
                store.updateNote(id, { status: "draft", mode: null, proposed: [] });
                setFocusNote(id);
                setAnnounce("Rejected. Your note is back to edit.");
              }}
              claims={sectionClaims}
              findRe={findRe}
              currentMatch={current ? { blockId: current.blockId, index: current.index } : null}
              pendingFocus={pendingFocus}
              onFocused={onFocused}
              onDraft={onDraft}
              onCommit={onCommit}
              onSplit={onSplit}
              onAcceptRewrite={(blockId, original, proposed, start) => {
                store.replaceInBlock(section.id, blockId, original, proposed, start);
                setAnnounce("Rewrite accepted.");
              }}
              onWriteSection={writeSection}
              writing={writing}
              writeDisabledReason={queuedInJob ? "The running job writes this section after chapter 6." : undefined}
              onPasteOwn={pasteOwn}
            />
          </div>
        </div>
      </div>

      <div className={cn("min-h-0 border-t border-border xl:border-t-0", !panelOpen && "xl:hidden")}>
        <EditorInspector
          bookId={book.id}
          tab={tab}
          onTab={setTab}
          section={section}
          sectionLabel={sectionLabel}
          words={words}
          issues={issues}
          onFixIssue={onFixIssue}
          claims={ms.claims}
          onClaim={onClaim}
          pass={pass}
          onPass={setPass}
          passRun={(ms.passesRun[section.id] ?? []).includes(pass)}
          passRunning={passRunning}
          onRunPass={runPass}
          suggestions={sectionSuggestions}
          suggestionState={store.suggestionState}
          onSuggestion={onSuggestion}
          onAllSuggestions={onAllSuggestions}
          notes={ms.notes}
          onShowNote={(id) => {
            const n = ms.notes.find((x) => x.id === id);
            if (!n) return;
            if (n.sectionId !== section.id) void navigate(`/books/${book.id}/editor/${n.sectionId}`);
            setFocusNote(id);
          }}
          onAddNote={() => addNote()}
          canAddNote={section.blocks.length > 0}
        />
      </div>

      <Modal
        open={doneOpen}
        onClose={() => setDoneOpen(false)}
        size="sm"
        title="Mark the edit done?"
        description="The book moves on to the cover. You can come back and edit any time; every change stays a version."
        footer={
          <>
            <Button variant="ghost" onClick={() => setDoneOpen(false)}>
              Keep editing
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                commitActive();
                if (store.isDirty(section.id)) store.saveVersion(section.id, "Owner", "Saved when the edit was marked done");
                setDoneOpen(false);
                void navigate(`/books/${book.id}/cover`);
              }}
            >
              Mark edit done
            </Button>
          </>
        }
      >
        <ul className="grid gap-1.5 text-small text-ink-secondary">
          <li>{dirty ? "Your unsaved changes are saved as a new version first." : "Every change is saved."}</li>
          <li>
            {openClaims === 0
              ? "No claims are open."
              : `${openClaims} ${openClaims === 1 ? "claim is" : "claims are"} still open. Preflight warns about ${openClaims === 1 ? "it" : "them"} until you check ${openClaims === 1 ? "it" : "them"}.`}
          </li>
          {openNotes.length > 0 && (
            <li>{`${openNotes.length} ${openNotes.length === 1 ? "note is" : "notes are"} still open. They stay in the Notes list.`}</li>
          )}
        </ul>
      </Modal>

      <VersionDrawer
        open={drawer.open}
        onClose={() => setDrawer({ open: false, left: null })}
        sectionTitle={section.title}
        versions={versions}
        currentBlocks={section.blocks.map((b) => ({ ...b, text: textOf(b) }))}
        dirty={dirty}
        initialLeft={drawer.left}
        onRestore={onRestore}
        restoredNote={restoredNote}
      />
      <span className="sr-only" role="status" aria-live="polite">
        {announce}
      </span>
      {/* Navigating to an unknown section id falls back to the default section. */}
      {param && !ms.sections.some((s) => s.id === param) && <RedirectTo to={`/books/${book.id}/editor/${section.id}`} navigate={navigate} />}
    </div>
  );
}

function RedirectTo({ to, navigate }: { to: string; navigate: ReturnType<typeof useNavigate> }) {
  useEffect(() => {
    void navigate(to, { replace: true });
  }, [to, navigate]);
  return null;
}
