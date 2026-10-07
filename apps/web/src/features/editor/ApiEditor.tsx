import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { History, MessageSquarePlus, PanelRightClose, PanelRightOpen, RotateCw, Save } from "lucide-react";
import { Banner, Button, EmptyState, IconButton, Modal, modKey } from "../../components/ui";
import type { Book, PenName } from "../../demo";
import { isApiError } from "../../api/client";
import {
  useAcceptSuggestion,
  useAddNote,
  useBookNotes,
  useClaims,
  useEditPass,
  usePatchNote,
  useRejectSuggestion,
  useResolveClaim,
  useRestoreVersion,
  useSaveVersion,
  useSection,
  useSectionTree,
  useSectionVersion,
  useSectionVersions,
  useSuggestions,
  useWriteSection,
  useBookFind,
  useRememberJob,
  useTextChanged,
} from "../../api/hooks";
import { manuscriptApi } from "../../api/manuscript";
import { flattenSections } from "../../api/adapters";
import type {
  ApiAuthorNote,
  ApiBookDetail,
  ApiClaim,
  ApiSection,
  ApiSuggestion,
  FindSection,
  RewriteProposal,
  SectionDetail,
  SectionTree,
} from "../../api/types";
import {
  blocksFromMarkdown,
  errorText,
  markdownFromBlocks,
  offsetAfterBlock,
  sectionGuardrails,
  useJobWatch,
  versionOrigin,
  type MdBlock,
} from "../../api/wire-c";
import { jobsApi } from "../../api/jobs";
import { isTerminalJob } from "../../api/types";
import { cn } from "../../lib/cn";
import { formatNumber, formatTime } from "../../lib/format";
import { useStepAction } from "../../lib/stepAction";
import { interiorLook } from "../../lib/interiorLook";
import { ErrorPanel, LoadingBlock } from "../writing/screenState";
import { ApiCompare } from "./ApiCompare";
import { EditorCanvas } from "./EditorCanvas";
import { EditorInspector, type InspectorTab } from "./EditorInspector";
import { FindReplace, type FindState } from "./FindReplace";
import type { MsBlock, MsClaim, MsGroup, MsNote, MsSection, MsSuggestion, MsVersion, NoteMode, SuggestionPass } from "./manuscript";
import { ManuscriptTree } from "./ManuscriptTree";
import { findIssues, findRanges, findRegex, type Issue, type RewriteKind } from "./textTools";
import type { SuggestionState } from "./useManuscript";
import { VersionDrawer } from "./VersionDrawer";

/* Editor on the Volume server (API mode). The same galley, tree and inspector as the demo editor, with
   the text, versions, suggestions, claims and author notes read from and saved to the server. Typing
   anywhere edits the text; each change is saved as a "human" version a moment after you leave the
   paragraph (or at once with Save version). A save that started from an old version gets a 409 and a
   plain message, and nothing is overwritten. */

const AUTOSAVE_MS = 1500;
/** One shared empty list, so hooks that depend on the blocks see a stable value before the section loads. */
const NO_BLOCKS: MsBlock[] = [];
const KIND_TITLES: Record<string, string> = {
  title_page: "Title page",
  copyright: "Copyright",
  dedication: "Dedication",
  contents: "Contents",
  acknowledgements: "Acknowledgements",
  introduction: "Introduction",
  conclusion: "Conclusion",
  about_author: "About the author",
  also_by: "Also by",
  review_request: "A small request",
};

function sectionTitle(s: ApiSection): string {
  if (s.title) return s.title;
  if (s.kind === "chapter" && s.number !== null) return `Chapter ${s.number}`;
  return KIND_TITLES[s.kind] ?? s.kind.replace(/_/g, " ");
}

function toMsSection(s: ApiSection): MsSection {
  const group: MsGroup = s.area === "front" ? "front" : s.area === "back" ? "back" : "body";
  return {
    id: s.id,
    group,
    number: s.kind === "chapter" ? s.number : null,
    title: sectionTitle(s),
    baseWords: s.wordCount,
    wordTarget: s.wordTarget,
    blocks: [],
    source: "writer",
    enabled: s.enabled,
    excerpt: false,
    ...(s.enabled ? {} : { offReason: "This page is turned off for this book. Turn it on in the blueprint to include it." }),
  };
}

/** The block a sentence sits in: whole match first, then its last line (claims can span a heading). */
function blockFor(blocks: MsBlock[], text: string): string {
  const t = text.trim();
  if (!t) return "";
  const whole = blocks.find((b) => b.text.includes(t));
  if (whole) return whole.id;
  const lines = t
    .split(/\n+/)
    .map((l) => l.replace(/^#+\s*/, "").trim())
    .filter(Boolean);
  for (const line of lines.reverse()) {
    const hit = blocks.find((b) => b.text.includes(line));
    if (hit) return hit.id;
  }
  return "";
}

const PASSES: SuggestionPass[] = ["structure", "line", "voice"];

/** What the rewrite toolbar's buttons ask the editor for. */
const REWRITE_INSTRUCTIONS: Record<RewriteKind, string> = {
  expand: "Expand this a little, keeping the meaning.",
  shorten: "Shorten this, keeping the meaning.",
  rephrase: "Rephrase this more clearly.",
  warmer: "Make this warmer in tone.",
  direct: "Make this more direct.",
  formal: "Make this more formal.",
};

/** The section's current server text as the editor's document. */
function docFrom(detail: SectionDetail): Doc {
  const cur = detail.current;
  const md = cur?.bodyMd ?? "";
  return {
    sectionId: detail.section.id,
    versionId: cur?.id ?? null,
    version: cur?.version ?? 0,
    blocks: blocksFromMarkdown(md, (cur?.id ?? detail.section.id).slice(-8)),
    savedMd: markdownFromBlocks(blocksFromMarkdown(md, "x")),
  };
}

interface Doc {
  sectionId: string;
  versionId: string | null;
  version: number;
  blocks: MdBlock[];
  /** Markdown as last loaded or saved. */
  savedMd: string;
}

interface Review {
  sectionId: string;
  noteIds: string[];
  text: string;
  position: number | null;
  anchorText: string | null;
  mode: NoteMode;
  jobId: string;
  versionId: string | null;
}

export function ApiEditor({ book, apiBook, penName }: { book: Book; apiBook: ApiBookDetail | undefined; penName: PenName | undefined }) {
  const tree = useSectionTree(book.id);
  if (tree.isPending)
    return (
      <div className="px-4 py-6 sm:px-8 lg:px-10">
        <LoadingBlock label="Loading the manuscript" rows={8} className="mx-auto max-w-[760px]" />
      </div>
    );
  if (tree.isError)
    return (
      <div className="px-4 py-6 sm:px-8 lg:px-10">
        <h1 className="font-book text-title text-ink">Editor</h1>
        <ErrorPanel className="mt-5 max-w-[720px]" title="Could not open the manuscript" body={errorText(tree.error)} onRetry={() => void tree.refetch()} />
      </div>
    );
  const sections = flattenSections(tree.data).filter((s) => s.kind !== "part");
  if (sections.length === 0 || tree.data.totals.words === 0)
    return (
      <div className="px-4 py-6 sm:px-8 lg:px-10 lg:py-7">
        <h1 className="font-book text-title text-ink">Editor</h1>
        <EmptyState
          className="mt-6 max-w-[640px]"
          drawing="page"
          title="Nothing to edit yet"
          body={
            sections.length === 0
              ? "This book has no sections yet. Approve the blueprint, then write the book; the sections appear here."
              : "No section has text yet. Write the book first, or open a section and write it on its own."
          }
          action={
            <Link
              to={`/books/${book.id}/${sections.length === 0 ? "blueprint" : "writing"}`}
              className="inline-flex h-10 items-center rounded-sm border border-border-strong bg-sheet px-4 text-label font-semibold text-ink hover:bg-sunken"
            >
              {sections.length === 0 ? "Open Blueprint" : "Open Writing"}
            </Link>
          }
        />
      </div>
    );
  return <Body book={book} apiBook={apiBook} penName={penName} tree={tree.data} sections={sections} />;
}

function Body({
  book,
  apiBook,
  penName,
  tree,
  sections: apiSections,
}: {
  book: Book;
  apiBook: ApiBookDetail | undefined;
  penName: PenName | undefined;
  tree: SectionTree;
  sections: ApiSection[];
}) {
  const navigate = useNavigate();
  const { sectionId: param } = useParams();
  const bookId = book.id;
  const fallback = apiSections.find((s) => s.area === "body" && s.wordCount > 0) ?? apiSections.find((s) => s.wordCount > 0) ?? apiSections[0]!;
  const apiSection = apiSections.find((s) => s.id === param) ?? fallback;
  const sectionId = apiSection.id;

  const sectionQ = useSection(sectionId);
  const versionsQ = useSectionVersions(sectionId);
  const claimsQ = useClaims(bookId);
  const suggestionsQ = useSuggestions(sectionId);
  const notesQ = useBookNotes(bookId);

  const save = useSaveVersion();
  const restore = useRestoreVersion();
  const editPass = useEditPass();
  const acceptSug = useAcceptSuggestion();
  const rejectSug = useRejectSuggestion();
  const resolveClaim = useResolveClaim();
  const addNoteApi = useAddNote();
  const patchNote = usePatchNote();
  const rememberJobC = useRememberJob();
  const textChanged = useTextChanged();
  const [weaving, setWeaving] = useState(false);
  const writeSection = useWriteSection();

  const [doc, setDoc] = useState<Doc | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [tab, setTab] = useState<InspectorTab>("suggestions");
  const [pass, setPass] = useState<SuggestionPass>("line");
  const [passJob, setPassJob] = useState<{ jobId: string; sectionId: string; pass: SuggestionPass } | null>(null);
  const [passesRun, setPassesRun] = useState<Record<string, SuggestionPass[]>>({});
  const [remember, setRemember] = useState(false);
  const [findOpen, setFindOpen] = useState(false);
  const [find, setFind] = useState<FindState>({ query: "", replace: "", matchCase: false, wholeWord: false, scope: "section" });
  const [matchIdx, setMatchIdx] = useState(0);
  const [replaceResult, setReplaceResult] = useState<string | null>(null);
  const [drawer, setDrawer] = useState<{ open: boolean; left: number | null }>({ open: false, left: null });
  const [restoredNote, setRestoredNote] = useState<string | null>(null);
  const [saveNote, setSaveNote] = useState<string | null>(null);
  const [problem, setProblem] = useState<{ text: string; conflict: boolean } | null>(null);
  const [pendingFocus, setPendingFocus] = useState<string | null>(null);
  const [announce, setAnnounce] = useState("");
  const [panelOpen, setPanelOpen] = useState(true);
  const [focusNote, setFocusNote] = useState<string | null>(null);
  const [doneOpen, setDoneOpen] = useState(false);
  const [localNotes, setLocalNotes] = useState<MsNote[]>([]);
  const [noteText, setNoteText] = useState<Record<string, string>>({});
  const [review, setReview] = useState<Review | null>(null);
  const [writeJob, setWriteJob] = useState<string | null>(null);
  const look = useMemo(() => interiorLook(book), [book]);
  const voiceOf = penName?.name.split(" ")[0] ?? "the author";
  const now = new Date().toISOString();
  const idSeq = useRef(0);

  /* ---------- The section text ---------- */
  const detail = sectionQ.data;
  const serverVersionId = detail?.current?.id ?? null;
  const draftsRef = useRef(drafts);
  draftsRef.current = drafts;
  // Load the server text when the section opens, and again when its version changes elsewhere
  // (accepted suggestion, softened claim, woven note, restore) while nothing here is unsaved.
  useEffect(() => {
    if (!detail || detail.section.id !== sectionId) return;
    const cur = detail.current;
    setDoc((d) => {
      if (d && d.sectionId === sectionId && d.versionId === (cur?.id ?? null)) return d;
      const typed = draftsRef.current;
      if (
        d &&
        d.sectionId === sectionId &&
        markdownFromBlocks(d.blocks.map((b) => (typed[b.id] !== undefined ? { ...b, text: typed[b.id]! } : b))) !== d.savedMd
      )
        return d; // unsaved here: keep it, the save will report the conflict
      return docFrom(detail);
    });
  }, [detail, sectionId]);

  const ready = doc !== null && doc.sectionId === sectionId;
  const blocks: MsBlock[] = ready ? doc.blocks : NO_BLOCKS;
  const textOf = useCallback((b: MsBlock) => drafts[b.id] ?? b.text, [drafts]);
  const liveBlocks = useMemo(() => blocks.map((b) => ({ ...b, text: textOf(b) })), [blocks, textOf]);
  const liveMd = markdownFromBlocks(liveBlocks);
  const dirty = ready && liveMd !== doc.savedMd;
  const committedDirty = ready && markdownFromBlocks(blocks) !== doc.savedMd;
  const stale = ready && serverVersionId !== null && doc.versionId !== serverVersionId;

  const words = useMemo(() => liveBlocks.reduce((n, b) => n + (b.text.trim() ? b.text.trim().split(/\s+/).length : 0), 0), [liveBlocks]);

  const msSections = useMemo(() => apiSections.map(toMsSection), [apiSections]);
  const section: MsSection = useMemo(() => {
    const base = msSections.find((s) => s.id === sectionId) ?? toMsSection(apiSection);
    return { ...base, blocks, baseWords: ready ? words : base.baseWords };
  }, [msSections, sectionId, apiSection, blocks, ready, words]);
  const treeSections = useMemo(() => msSections.map((s) => (s.id === sectionId ? section : s)), [msSections, section, sectionId]);
  const wordsFor = useCallback((s: MsSection) => (s.id === sectionId ? words : s.baseWords), [sectionId, words]);
  const totalWords = tree.totals.words - apiSection.wordCount + (ready ? words : apiSection.wordCount);
  const target = apiBook?.wordTarget ?? apiSections.reduce((n, s) => n + (s.enabled ? (s.wordTarget ?? 0) : 0), 0);

  /* ---------- Saving ---------- */
  const saveNow = useCallback(
    async (note: string | null = null): Promise<boolean> => {
      // Typed text lives in drafts until the paragraph is left; it is saved as is, and the blocks are
      // left alone so the paragraph being typed in keeps its caret.
      if (!doc || doc.sectionId !== sectionId) return true;
      const md = markdownFromBlocks(blocks.map((b) => (drafts[b.id] !== undefined ? { ...b, text: drafts[b.id]! } : b)));
      if (md === doc.savedMd) return true;
      try {
        const v = await save.mutateAsync({ bookId, sectionId, input: { bodyMd: md, note: note ?? "Your edits", baseVersionId: doc.versionId } });
        setDoc((d) => (d && d.sectionId === sectionId ? { ...d, versionId: v.id, version: v.version, savedMd: md } : d));
        setProblem(null);
        setSaveNote(`Saved as version ${v.version} at ${formatTime(new Date(v.createdAt).toISOString())}.`);
        setAnnounce(`Saved as version ${v.version}.`);
        return true;
      } catch (e) {
        const conflict = isApiError(e) && e.isConflict;
        setProblem({
          conflict,
          text: conflict
            ? "This section changed somewhere else since you opened it, so your edit was not saved over it. Your text is still here. Open Versions to compare, or reload the section to see the latest."
            : `Not saved. ${errorText(e)}`,
        });
        return false;
      }
    },
    [blocks, drafts, doc, sectionId, bookId, save],
  );

  // Autosave: a moment after a paragraph is committed (blur, Enter, a fix), save a human version.
  const saveRef = useRef(saveNow);
  useEffect(() => {
    saveRef.current = saveNow;
  });
  useEffect(() => {
    if (!committedDirty || review || problem?.conflict || save.isPending) return;
    const t = window.setTimeout(() => void saveRef.current(), AUTOSAVE_MS);
    return () => window.clearTimeout(t);
  }, [committedDirty, blocks, review, problem?.conflict, save.isPending]);

  // Leaving the section saves what is left.
  useEffect(() => () => void saveRef.current(), [sectionId]);

  /** Server-side text changes (suggestions, claims, notes, restore) start from saved text. */
  async function saveFirst(): Promise<boolean> {
    if (!dirty) return true;
    return saveNow("Saved before an editor change");
  }

  /** "Mark edit done": save any open changes, then go on to the Cover step. */
  async function markEditDone() {
    const saved = await saveFirst();
    setDoneOpen(false);
    if (saved) void navigate(`/books/${bookId}/cover`);
  }

  async function reloadSection() {
    setDrafts({});
    setProblem(null);
    const r = await sectionQ.refetch();
    if (r.data && r.data.section.id === sectionId) setDoc(docFrom(r.data));
  }

  useEffect(() => {
    setSaveNote(null);
    setRestoredNote(null);
    setReplaceResult(null);
    setProblem(null);
    setDrafts({});
  }, [sectionId]);
  useEffect(() => {
    if (dirty) setSaveNote(null);
  }, [dirty]);

  /* ---------- Editing ---------- */
  const setBlocks = useCallback(
    (fn: (b: MsBlock[]) => MsBlock[]) => setDoc((d) => (d && d.sectionId === sectionId ? { ...d, blocks: fn(d.blocks) } : d)),
    [sectionId],
  );
  const clearDraft = (blockId: string) =>
    setDrafts((d) => {
      const { [blockId]: _gone, ...rest } = d;
      void _gone;
      return rest;
    });
  const onDraft = useCallback((blockId: string, text: string) => setDrafts((d) => ({ ...d, [blockId]: text })), []);
  const onCommit = useCallback(
    (blockId: string, text: string) => {
      setBlocks((list) => list.map((b) => (b.id === blockId && b.text !== text ? { ...b, text, rev: b.rev + 1 } : b)));
      clearDraft(blockId);
    },
    [setBlocks],
  );
  const newId = () => `${sectionId.slice(-6)}-n${Date.now().toString(36)}${++idSeq.current}`;
  const onSplit = useCallback(
    (blockId: string, offset: number, text: string) => {
      const id = `${sectionId.slice(-6)}-n${Date.now().toString(36)}${++idSeq.current}`;
      setBlocks((list) => {
        const i = list.findIndex((b) => b.id === blockId);
        if (i < 0) return list;
        const b = list[i]!;
        return [
          ...list.slice(0, i),
          { ...b, text: text.slice(0, offset).trimEnd(), rev: b.rev + 1 },
          { id, kind: "p", text: text.slice(offset).trimStart(), rev: 0 },
          ...list.slice(i + 1),
        ];
      });
      clearDraft(blockId);
      setPendingFocus(id);
    },
    [setBlocks, sectionId],
  );
  const onFocused = useCallback(() => setPendingFocus(null), []);
  const onNoteFocused = useCallback(() => setFocusNote(null), []);

  function replaceText(blockId: string, from: string, to: string) {
    setBlocks((list) => list.map((b) => (b.id === blockId && b.text.includes(from) ? { ...b, text: b.text.replace(from, to), rev: b.rev + 1 } : b)));
  }

  function onFixIssue(issue: Issue) {
    const b = blocks.find((x) => x.id === issue.blockId);
    if (!b) return;
    if (issue.kind === "em-dash") setBlocks((list) => list.map((x) => (x.id === b.id ? { ...x, text: x.text.replace(/\s*—\s*/, ", "), rev: x.rev + 1 } : x)));
    else if (issue.fix) replaceText(b.id, issue.found, issue.fix);
    setAnnounce("Fixed.");
  }

  // Keyboard: Cmd S saves, Cmd F finds in this section.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!(e.metaKey || e.ctrlKey)) return;
      const k = e.key.toLowerCase();
      if (k === "s") {
        e.preventDefault();
        void saveNow();
      } else if (k === "f") {
        e.preventDefault();
        setFind((f) => ({ ...f, scope: e.shiftKey ? "book" : "section" }));
        setFindOpen(true);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  /* ---------- Selection rewrite (POST /sections/:id/rewrite-selection, a job) ---------- */
  const proposalRef = useRef<RewriteProposal | null>(null);

  async function askRewrite(sel: { blockId: string; start: number; end: number; text: string }, kind: RewriteKind) {
    proposalRef.current = null;
    if (!(await saveFirst())) return null;
    const idx = liveBlocks.findIndex((b) => b.id === sel.blockId);
    if (idx < 0) return null;
    const b = liveBlocks[idx]!;
    // Offsets in the saved Markdown: the paragraphs before, the blank line between, any heading marks.
    const md = markdownFromBlocks(liveBlocks);
    const blockStart = (idx > 0 ? markdownFromBlocks(liveBlocks.slice(0, idx)).length + 2 : 0) + (b.kind === "h" ? (b.prefix ?? "## ").length : 0);
    const lead = b.text.length - b.text.trimStart().length;
    let from = blockStart + Math.max(0, sel.start - lead);
    if (md.slice(from, from + sel.text.length) !== sel.text) {
      const at = md.indexOf(sel.text, blockStart);
      if (at < 0) {
        setProblem({ conflict: false, text: "Could not find that selection in the saved text. Select it again." });
        return null;
      }
      from = at;
    }
    try {
      const r = await manuscriptApi.rewriteSelection(sectionId, { from, to: from + sel.text.length, instruction: REWRITE_INSTRUCTIONS[kind] });
      rememberJobC(r);
      for (let i = 0; i < 240; i++) {
        const j = await jobsApi.get(r.jobId);
        if (isTerminalJob(j.status)) {
          if (j.status !== "succeeded") {
            setProblem({ conflict: false, text: `The rewrite did not finish. ${j.error ?? "Try again."}` });
            return null;
          }
          const p = j.result as RewriteProposal;
          proposalRef.current = p;
          return { proposed: p.text, original: p.original, reason: p.reason };
        }
        await new Promise((res) => window.setTimeout(res, 500));
      }
      setProblem({ conflict: false, text: "The rewrite is taking too long. Try again." });
      return null;
    } catch (e) {
      setProblem({ conflict: false, text: errorText(e) });
      return null;
    }
  }

  async function acceptRewrite() {
    const p = proposalRef.current;
    proposalRef.current = null;
    if (!p || !doc) return;
    const base = doc.savedMd;
    let md: string;
    if (base.slice(p.from, p.to) === p.original) md = base.slice(0, p.from) + p.text + base.slice(p.to);
    else if (base.includes(p.original)) md = base.replace(p.original, p.text);
    else {
      setProblem({ conflict: true, text: "The text changed since the rewrite was asked for, so it was not applied. Reload the section and try again." });
      return;
    }
    try {
      const v = await save.mutateAsync({
        bookId,
        sectionId,
        input: { bodyMd: md, note: "Accepted a rewrite", baseVersionId: p.baseVersionId ?? doc.versionId },
      });
      setDoc({ sectionId, versionId: v.id, version: v.version, blocks: blocksFromMarkdown(md, v.id.slice(-8)), savedMd: md });
      setDrafts({});
      setProblem(null);
      setAnnounce(`Rewrite accepted and saved as version ${v.version}.`);
    } catch (e) {
      const conflict = isApiError(e) && e.isConflict;
      setProblem({
        conflict,
        text: conflict
          ? "This section changed somewhere else since the rewrite was asked for, so it was not saved. Reload the section to see the latest."
          : `Not saved. ${errorText(e)}`,
      });
    }
  }

  /* ---------- Find: this section here, the whole book on the server ---------- */
  const [bookQuery, setBookQuery] = useState<{ q: string; caseSensitive: boolean; word: boolean } | null>(null);
  useEffect(() => {
    if (!findOpen || find.scope !== "book" || !find.query) {
      setBookQuery(null);
      return;
    }
    const t = window.setTimeout(() => setBookQuery({ q: find.query, caseSensitive: find.matchCase, word: find.wholeWord }), 300);
    return () => window.clearTimeout(t);
  }, [findOpen, find.scope, find.query, find.matchCase, find.wholeWord]);
  const bookFind = useBookFind(bookId, bookQuery);
  const [replacing, setReplacing] = useState(false);

  async function replaceInBook() {
    if (!find.query) return;
    if (!(await saveFirst())) return;
    setReplacing(true);
    try {
      const r = await manuscriptApi.replace(bookId, { q: find.query, replacement: find.replace, case: find.matchCase, word: find.wholeWord });
      await textChanged(
        bookId,
        r.versions.map((v) => v.sectionId),
      );
      setProblem(null);
      setReplaceResult(
        r.replacements === 0
          ? "Nothing to replace."
          : `Replaced ${r.replacements} in ${r.sectionsChanged} ${r.sectionsChanged === 1 ? "section" : "sections"}. Saved one version per section.`,
      );
    } catch (e) {
      const conflict = isApiError(e) && e.isConflict;
      setProblem({
        conflict,
        text: conflict ? "A section changed while replacing, so nothing more was saved. Reload the section, then try again." : `Not replaced. ${errorText(e)}`,
      });
    } finally {
      setReplacing(false);
    }
  }

  /* ---------- Find in this section ---------- */
  const findRe = useMemo(
    () => (findOpen ? findRegex({ query: find.query, matchCase: find.matchCase, wholeWord: find.wholeWord }) : null),
    [findOpen, find.query, find.matchCase, find.wholeWord],
  );
  const matches = useMemo(
    () => (findRe ? blocks.flatMap((b) => findRanges(b.text, findRe).map((r, i) => ({ blockId: b.id, index: i, range: r }))) : []),
    [findRe, blocks],
  );
  const current = matches.length ? matches[Math.min(matchIdx, matches.length - 1)] : undefined;
  useEffect(() => setMatchIdx(0), [find.query, find.matchCase, find.wholeWord, sectionId]);
  function replaceOne() {
    if (!current) return;
    const b = blocks.find((x) => x.id === current.blockId);
    if (!b) return;
    const [a, z] = current.range;
    setBlocks((list) => list.map((x) => (x.id === b.id ? { ...x, text: b.text.slice(0, a) + find.replace + b.text.slice(z), rev: x.rev + 1 } : x)));
  }
  function replaceAll() {
    if (!findRe) return;
    let count = 0;
    setBlocks((list) =>
      list.map((b) => {
        const text = b.text.replace(findRe, () => {
          count++;
          return find.replace;
        });
        return text === b.text ? b : { ...b, text, rev: b.rev + 1 };
      }),
    );
    window.setTimeout(() => setReplaceResult(`Replaced ${count} in this section. It saves as a new version in a moment.`), 0);
  }

  /* ---------- Claims ---------- */
  const sectionsById = useMemo(() => new Map(apiSections.map((s) => [s.id, s])), [apiSections]);
  const claims: MsClaim[] = useMemo(
    () =>
      (claimsQ.data ?? [])
        .filter((c: ApiClaim) => c.sectionId && sectionsById.has(c.sectionId))
        .map((c) => ({
          id: c.id,
          sectionId: c.sectionId ?? "",
          blockId: c.sectionId === sectionId ? blockFor(blocks, c.sentence) : "",
          sentence: c.sentence,
          category: categoryLabel(c.category),
          check: c.checkNeeded ?? "Check this statement before you publish.",
          softened: c.suggestedSoftening?.trim() ? c.suggestedSoftening : "",
          status:
            c.status === "verified" || c.status === "author_experience"
              ? "verified"
              : c.status === "softened"
                ? "softened"
                : c.status === "removed"
                  ? "removed"
                  : "open",
          note: c.ownerNote ?? c.sourceUrl ?? undefined,
        })),
    [claimsQ.data, sectionsById, sectionId, blocks],
  );
  const sectionClaims = claims.filter((c) => c.sectionId === sectionId && c.status === "open");
  const openClaims = claims.filter((c) => c.status === "open").length;
  const sectionLabel = (id: string) => {
    const s = msSections.find((x) => x.id === id);
    return s ? (s.number !== null ? `Chapter ${s.number}` : s.title) : "Another section";
  };

  async function onClaim(claim: MsClaim, action: "verify" | "soften" | "remove" | "undo", note?: string) {
    if (action === "undo") return;
    if (action !== "verify" && !(await saveFirst())) return;
    try {
      if (action === "verify") await resolveClaim.mutateAsync({ bookId, claimId: claim.id, action, input: note ? { note } : {} });
      else if (action === "soften") await resolveClaim.mutateAsync({ bookId, claimId: claim.id, action, input: { replacement: note ?? claim.sentence } });
      else await resolveClaim.mutateAsync({ bookId, claimId: claim.id, action, input: {} });
      setProblem(null);
      setAnnounce(
        action === "verify"
          ? "Claim marked verified."
          : action === "soften"
            ? "Softer wording saved as a new version."
            : "Sentence removed and saved as a new version.",
      );
    } catch (e) {
      setProblem({ conflict: false, text: errorText(e) });
    }
  }

  /* ---------- Suggestions ---------- */
  const suggestions: MsSuggestion[] = useMemo(
    () =>
      (suggestionsQ.data ?? []).map((s: ApiSuggestion) => ({
        id: s.id,
        pass: (PASSES as string[]).includes(s.pass) ? (s.pass as SuggestionPass) : "line",
        sectionId: s.sectionId,
        blockId: blockFor(blocks, s.original),
        original: s.original,
        proposed: s.proposed,
        reason: s.reason ?? "",
      })),
    [suggestionsQ.data, blocks],
  );
  const suggestionState: Record<string, SuggestionState> = useMemo(
    () => Object.fromEntries((suggestionsQ.data ?? []).map((s) => [s.id, s.status === "open" ? "pending" : (s.status as SuggestionState)])),
    [suggestionsQ.data],
  );
  const passWatch = useJobWatch(bookId, passJob?.jobId, (w) => {
    if (!passJob) return;
    setPassesRun((m) => ({ ...m, [passJob.sectionId]: [...new Set([...(m[passJob.sectionId] ?? []), passJob.pass])] }));
    setPassJob(null);
    void suggestionsQ.refetch();
    if (w.ok) setAnnounce("Suggestions ready.");
    else setProblem({ conflict: false, text: `The editor pass did not finish. ${w.error ?? "Try again."}` });
  });
  const passRunning = (!!passJob && passJob.sectionId === sectionId && passJob.pass === pass && !passWatch.finished) || editPass.isPending;
  const passRun = suggestions.some((s) => s.pass === pass) || (passesRun[sectionId] ?? []).includes(pass);

  async function runPass() {
    if (!(await saveFirst())) return;
    try {
      const r = await editPass.mutateAsync({ bookId, sectionId, input: { pass } });
      setPassJob({ jobId: r.jobId, sectionId, pass });
      setProblem(null);
    } catch (e) {
      setProblem({ conflict: false, text: errorText(e) });
    }
  }

  async function onSuggestion(s: MsSuggestion, action: "accept" | "reject" | "undo") {
    if (action === "undo") return;
    try {
      if (action === "accept") {
        if (!(await saveFirst())) return;
        const r = await acceptSug.mutateAsync({ bookId, sectionId, suggestionId: s.id, remember });
        setAnnounce(r.memory ? "Accepted and remembered for this profile." : "Accepted. Saved as a new version.");
      } else {
        await rejectSug.mutateAsync({ sectionId, suggestionId: s.id });
        setAnnounce("Rejected.");
      }
      setProblem(null);
    } catch (e) {
      setProblem({
        conflict: false,
        text:
          isApiError(e) && e.isConflict
            ? "The text this suggestion refers to has changed, so it is marked out of date. Run the pass again for fresh ones."
            : errorText(e),
      });
    }
  }

  async function onAllSuggestions(action: "accept" | "reject") {
    for (const s of suggestions.filter((x) => x.pass === pass && suggestionState[x.id] === "pending")) await onSuggestion(s, action);
    setAnnounce(action === "accept" ? "All suggestions accepted." : "All suggestions rejected.");
  }

  /* ---------- Author notes ---------- */
  const anchorOf = useCallback(
    (n: ApiAuthorNote): string => {
      if (n.sectionId !== sectionId || blocks.length === 0) return "";
      if (n.anchorText) {
        const hit = blocks.find((b) => b.text.endsWith(n.anchorText!) || b.text.includes(n.anchorText!));
        if (hit) return hit.id;
      }
      if (n.position !== null) {
        for (let i = 0; i < blocks.length; i++) if (offsetAfterBlock(blocks, i) >= n.position) return blocks[i]!.id;
      }
      return blocks[blocks.length - 1]!.id;
    },
    [blocks, sectionId],
  );

  // While a woven result waits for Accept or Reject, the page shows the text without the new blocks,
  // and the new blocks in blue pencil after the paragraph the note was on.
  const wovenQ = useSectionVersion(review?.versionId ? review.sectionId : undefined, review?.versionId ?? undefined);
  const parentQ = useSectionVersion(wovenQ.data?.parentVersionId ? review?.sectionId : undefined, wovenQ.data?.parentVersionId ?? undefined);
  const reviewReady = !!review && review.sectionId === sectionId && !!wovenQ.data && !!parentQ.data && doc?.versionId === wovenQ.data.id;
  const proposal = useMemo(() => {
    if (!reviewReady || !parentQ.data) return null;
    const before = new Set(blocksFromMarkdown(parentQ.data.bodyMd, "p").map((b) => b.text.trim()));
    const added = new Set(blocks.filter((b) => !before.has(b.text.trim())).map((b) => b.id));
    const first = blocks.findIndex((b) => added.has(b.id));
    const after = first > 0 ? blocks[first - 1]!.id : (blocks.find((b) => !added.has(b.id))?.id ?? "");
    return { added, after, proposed: blocks.filter((b) => added.has(b.id)).map((b) => ({ ...b, id: `${b.id}-proposed` })) };
  }, [reviewReady, parentQ.data, blocks]);
  const shownBlocks = proposal ? blocks.filter((b) => !proposal.added.has(b.id)) : blocks;

  const weaveWatch = useJobWatch(bookId, review?.jobId, (w) => {
    if (!review) return;
    const res = (w.result ?? {}) as { versionId?: unknown };
    if (w.ok && typeof res.versionId === "string") {
      setReview((r) => (r ? { ...r, versionId: res.versionId as string } : r));
      setAnnounce(
        review.mode === "weave"
          ? "Your note is woven in. Review it in blue pencil, then accept or reject."
          : "New section ready. Review it, then accept or reject.",
      );
    } else {
      setReview(null);
      setProblem({ conflict: false, text: `The note was not woven in. ${w.error ?? "Nothing changed. Try again."}` });
    }
  });

  const notes: MsNote[] = useMemo(() => {
    const server = (notesQ.data ?? [])
      .filter((n) => n.status !== "dismissed" && sectionsById.has(n.sectionId))
      .map((n): MsNote => {
        const inReview = review && review.noteIds.includes(n.id);
        const status: MsNote["status"] =
          inReview && proposal
            ? "ready"
            : inReview || n.status === "queued"
              ? "working"
              : n.status === "woven"
                ? review?.mode === "expand" && inReview
                  ? "expanded"
                  : "woven"
                : "draft";
        return {
          id: n.id,
          sectionId: n.sectionId,
          afterBlockId: status === "ready" && proposal ? proposal.after : anchorOf(n),
          text: noteText[n.id] ?? n.note,
          status,
          mode: inReview ? (review?.mode ?? null) : null,
          proposed: status === "ready" && proposal ? proposal.proposed : [],
        };
      });
    return [...server, ...localNotes];
  }, [notesQ.data, sectionsById, review, proposal, anchorOf, noteText, localNotes]);
  const sectionNotes = notes.filter((n) => n.sectionId === sectionId);

  function addNote(afterBlockId?: string) {
    let anchor = afterBlockId;
    if (!anchor) {
      const el = document.activeElement;
      anchor = el instanceof HTMLElement && el.dataset.blockId ? el.dataset.blockId : blocks[blocks.length - 1]?.id;
    }
    if (!anchor) return;
    const id = `local-${newId()}`;
    setLocalNotes((l) => [...l, { id, sectionId, afterBlockId: anchor, text: "", status: "draft", mode: null, proposed: [] }]);
    setFocusNote(id);
    setAnnounce("Note added. Write your rough words, then weave them in.");
  }

  async function runNote(id: string, mode: NoteMode) {
    const note = notes.find((n) => n.id === id);
    if (!note || !note.text.trim() || weaving) return;
    if (review) {
      setProblem({ conflict: false, text: "Accept or reject the woven text first." });
      return;
    }
    if (!(await saveFirst())) return;
    const idx = blocks.findIndex((b) => b.id === note.afterBlockId);
    const position = idx >= 0 ? offsetAfterBlock(blocks, idx) : null;
    const anchorText = idx >= 0 ? blocks[idx]!.text.slice(-120) : null;
    try {
      let noteId = id;
      if (id.startsWith("local-")) {
        const created = await addNoteApi.mutateAsync({ bookId, sectionId, input: { note: note.text.trim(), position, anchorText } });
        noteId = created.id;
        setLocalNotes((l) => l.filter((n) => n.id !== id));
      } else if (noteText[id] !== undefined) {
        await patchNote.mutateAsync({ bookId, sectionId, noteId: id, patch: { note: note.text.trim() } });
      }
      setWeaving(true);
      const r = await manuscriptApi.weaveNotes(sectionId, { noteIds: [noteId], mode });
      rememberJobC(r);
      void textChanged(bookId, []);
      setReview({ sectionId, noteIds: [noteId], text: note.text.trim(), position, anchorText, mode, jobId: r.jobId, versionId: null });
      setProblem(null);
    } catch (e) {
      setProblem({ conflict: false, text: errorText(e) });
    } finally {
      setWeaving(false);
    }
  }

  function acceptNote() {
    if (!review) return;
    setAnnounce(`Accepted. The woven text is saved as version ${doc?.version ?? ""}.`);
    setReview(null);
  }

  async function rejectNote() {
    if (!review || !wovenQ.data?.parentVersionId) return;
    const r = review;
    try {
      await restore.mutateAsync({ bookId, sectionId: r.sectionId, versionId: wovenQ.data.parentVersionId });
      // The note goes back to open with your words, ready to change and run again.
      const again = await Promise.all(r.noteIds.map((id) => manuscriptApi.reopenNote(id)));
      await textChanged(bookId, [r.sectionId]);
      setReview(null);
      setFocusNote(again[0]?.id ?? null);
      setAnnounce("Rejected. The text is back as it was, and your note is open to edit.");
    } catch (e) {
      setProblem({ conflict: false, text: errorText(e) });
    }
  }

  async function discardNote(id: string) {
    if (id.startsWith("local-")) {
      setLocalNotes((l) => l.filter((n) => n.id !== id));
      setAnnounce("Note discarded.");
      return;
    }
    try {
      await patchNote.mutateAsync({ bookId, sectionId, noteId: id, patch: { status: "dismissed" } });
      setAnnounce("Note discarded.");
    } catch (e) {
      setProblem({ conflict: false, text: errorText(e) });
    }
  }

  /* ---------- Versions ---------- */
  const versions: MsVersion[] = useMemo(
    () =>
      [...(versionsQ.data ?? [])]
        .sort((a, b) => a.version - b.version)
        .map((v) => ({ number: v.version, at: new Date(v.createdAt).toISOString(), origin: versionOrigin(v), note: v.note ?? v.summary ?? "", blocks: [] })),
    [versionsQ.data],
  );
  const versionIds = useMemo(() => new Map((versionsQ.data ?? []).map((v) => [v.version, v.id])), [versionsQ.data]);

  async function onRestore(v: MsVersion) {
    const id = versionIds.get(v.number);
    if (!id) return;
    if (!(await saveFirst())) return;
    try {
      const r = await restore.mutateAsync({ bookId, sectionId, versionId: id });
      setRestoredNote(`Version ${v.number} restored and saved as version ${r.version}. The text before it stays in the list.`);
      setAnnounce(`Version ${v.number} restored.`);
    } catch (e) {
      setRestoredNote(null);
      setProblem({ conflict: false, text: errorText(e) });
    }
  }

  /* ---------- Empty section: write it ---------- */
  const writeWatch = useJobWatch(bookId, writeJob, (w) => {
    setWriteJob(null);
    void sectionQ.refetch();
    if (w.ok || w.status === "needs_attention") setAnnounce("Draft written. Review it; your edits save as you go.");
    else setProblem({ conflict: false, text: `The section was not written. ${w.error ?? "Try again."}` });
  });
  async function writeThis() {
    try {
      const r = await writeSection.mutateAsync({ bookId, sectionId });
      setWriteJob(r.jobId);
    } catch (e) {
      setProblem({ conflict: false, text: errorText(e) });
    }
  }
  function pasteOwn() {
    const id = newId();
    setDoc((d) => (d ? { ...d, blocks: [...d.blocks, { id, kind: "p", text: "", rev: 0 }] } : d));
    setPendingFocus(id);
  }

  /* ---------- Header ---------- */
  const versionNo = ready ? doc.version : 0;
  const sTarget = section.wordTarget;
  const over = sTarget !== null && words > sTarget ? words - sTarget : 0;
  const metaRight = over > 0 ? `${formatNumber(over)} words over target` : versionNo > 0 ? `Version ${versionNo}` : "Not written yet";
  const issues = useMemo(() => findIssues(liveBlocks), [liveBlocks]);
  const statusLine = save.isPending
    ? "Saving"
    : (saveNote ?? (dirty ? "Unsaved changes, saving when you leave the paragraph" : versionNo > 0 ? `Saved as version ${versionNo}` : "Nothing saved yet"));

  useStepAction({ label: "Mark edit done", onClick: () => setDoneOpen(true) });

  const notice = (problem || stale) && (
    <Banner
      tone={problem && !problem.conflict ? "error" : "attention"}
      title={problem?.conflict || (!problem && stale) ? "Newer text on the server" : "That did not work"}
      className="mb-4"
      action={
        problem?.conflict || (!problem && stale) ? (
          <Button size="sm" icon={RotateCw} onClick={() => void reloadSection()}>
            Reload section
          </Button>
        ) : (
          <Button size="sm" variant="ghost" onClick={() => setProblem(null)}>
            Dismiss
          </Button>
        )
      }
    >
      {problem?.text ??
        "This section has a newer version than the one on screen. Save to see the conflict, or reload to see the latest (your unsaved text here is dropped)."}
    </Banner>
  );

  return (
    <div
      className={cn(
        "grid grid-cols-1 xl:h-screen-fill xl:grid-rows-[minmax(0,1fr)]",
        panelOpen ? "xl:grid-cols-[256px_minmax(0,1fr)_352px]" : "xl:grid-cols-[256px_minmax(0,1fr)]",
      )}
    >
      <ManuscriptTree
        bookId={bookId}
        sections={treeSections}
        current={sectionId}
        wordsFor={wordsFor}
        claimsFor={(id) => claims.filter((c) => c.sectionId === id && c.status === "open").length}
        dirty={(id) => id === sectionId && dirty}
        totalWords={totalWords}
        targetWords={target}
      />

      <div className="relative min-h-0 xl:overflow-y-auto">
        <div className="px-4 pt-4 pb-16 sm:px-6 xl:px-8">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <h1 className="text-[18px] leading-6 font-semibold text-ink">Editor</h1>
            <p className="num text-small text-ink-secondary" role="status">
              {statusLine}
            </p>
            <div className="ml-auto flex flex-wrap items-center gap-1.5">
              <Button
                variant="ghost"
                icon={MessageSquarePlus}
                onClick={() => addNote()}
                title={`Add a note after the paragraph you are in (${modKey()} Enter)`}
                disabledReason={blocks.length === 0 ? "Write or paste some text first." : undefined}
              >
                Add note
              </Button>
              <Button
                variant="ghost"
                icon={History}
                onClick={() => setDrawer({ open: true, left: null })}
                disabledReason={versions.length === 0 ? "No versions yet." : undefined}
              >
                Versions
              </Button>
              <Button
                icon={Save}
                onClick={() => void saveNow()}
                loading={save.isPending}
                loadingLabel="Saving"
                aria-keyshortcuts="Meta+S Control+S"
                title={`Save version (${modKey()} S)`}
              >
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
                countInSection={matches.length}
                countInBook={bookFind.data?.total ?? 0}
                sectionsWithMatches={bookFind.data?.sections.length ?? 0}
                current={Math.min(matchIdx, Math.max(0, matches.length - 1))}
                onStep={(d) => setMatchIdx((i) => (matches.length ? (i + d + matches.length) % matches.length : 0))}
                onReplaceOne={replaceOne}
                onReplaceAll={() => (find.scope === "book" ? void replaceInBook() : replaceAll())}
                result={replaceResult}
                onUndo={null}
              />
              {find.scope === "book" && find.query && (
                <BookMatches
                  bookId={bookId}
                  loading={bookFind.isFetching || replacing}
                  error={bookFind.isError ? errorText(bookFind.error) : null}
                  sections={bookFind.data?.sections ?? []}
                  current={sectionId}
                  label={(id) => sectionLabel(id)}
                />
              )}
            </div>
          )}
          <div className="mt-4">
            {notice}
            {!ready ? (
              sectionQ.isError ? (
                <ErrorPanel title="Could not open this section" body={errorText(sectionQ.error)} onRetry={() => void sectionQ.refetch()} />
              ) : (
                <LoadingBlock label="Loading the section" rows={8} />
              )
            ) : (
              <EditorCanvas
                section={{ ...section, blocks: shownBlocks }}
                label={`${look.name} interior`}
                metaRight={metaRight}
                look={look}
                notes={sectionNotes}
                voiceOf={voiceOf}
                focusNoteId={focusNote}
                onNoteFocused={onNoteFocused}
                onAddNote={(id) => addNote(id)}
                onNoteText={(id, text) => {
                  if (id.startsWith("local-")) setLocalNotes((l) => l.map((n) => (n.id === id ? { ...n, text } : n)));
                  else setNoteText((m) => ({ ...m, [id]: text }));
                }}
                onNoteRun={(id, mode) => void runNote(id, mode)}
                onNoteDiscard={(id) => void discardNote(id)}
                onNoteAccept={acceptNote}
                onNoteReject={() => void rejectNote()}
                claims={sectionClaims}
                findRe={findRe}
                currentMatch={current ? { blockId: current.blockId, index: current.index } : null}
                pendingFocus={pendingFocus}
                onFocused={onFocused}
                onDraft={onDraft}
                onCommit={onCommit}
                onSplit={onSplit}
                onAcceptRewrite={() => void acceptRewrite()}
                onRewrite={askRewrite}
                onWriteSection={() => void writeThis()}
                writing={writeSection.isPending || writeWatch.running}
                writeDisabledReason={undefined}
                onPasteOwn={pasteOwn}
              />
            )}
            {review && !proposal && weaveWatch.running && (
              <p role="status" className="mt-3 text-small text-ink-secondary">
                {review.mode === "expand" ? "Writing a new section from your note" : `Weaving your note in, in ${voiceOf}'s voice`}
                {weaveWatch.message ? `: ${weaveWatch.message}` : "."}
              </p>
            )}
          </div>
        </div>
      </div>

      <div className={cn("min-h-0 border-t border-border xl:border-t-0", !panelOpen && "xl:hidden")}>
        <EditorInspector
          bookId={bookId}
          tab={tab}
          onTab={setTab}
          section={section}
          sectionLabel={sectionLabel}
          words={words}
          issues={issues}
          onFixIssue={onFixIssue}
          claims={claims}
          onClaim={(c, a, n) => void onClaim(c, a, n)}
          pass={pass}
          onPass={setPass}
          passRun={passRun}
          passRunning={passRunning}
          onRunPass={() => void runPass()}
          suggestions={suggestions}
          suggestionState={suggestionState}
          onSuggestion={(s, a) => void onSuggestion(s, a)}
          onAllSuggestions={(a) => void onAllSuggestions(a)}
          notes={notes}
          onShowNote={(id) => {
            const n = notes.find((x) => x.id === id);
            if (!n) return;
            if (n.sectionId !== sectionId) void navigate(`/books/${bookId}/editor/${n.sectionId}`);
            setFocusNote(id);
          }}
          onAddNote={() => addNote()}
          canAddNote={blocks.length > 0}
          remember={{ checked: remember, onChange: setRemember }}
          guardrails={(() => {
            const g = sectionGuardrails(detail?.section.id === sectionId ? detail.section : apiSection);
            return g ? { passed: g.passed, items: g.needsAttention } : null;
          })()}
          canUndo={false}
          softenEditable
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
            <Button variant="primary" loading={save.isPending} loadingLabel="Saving" onClick={() => void markEditDone()}>
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
        </ul>
      </Modal>

      <VersionDrawer
        open={drawer.open}
        onClose={() => setDrawer({ open: false, left: null })}
        sectionTitle={section.title}
        versions={versions}
        currentBlocks={liveBlocks}
        dirty={dirty}
        initialLeft={drawer.left}
        onRestore={(v) => void onRestore(v)}
        restoredNote={restoredNote}
        now={now}
        restoring={restore.isPending}
        renderCompare={(left, right, nameOf) => (
          <ApiCompare
            sectionId={sectionId}
            left={versionIds.get(Number(left)) ?? null}
            right={right === "current" ? null : (versionIds.get(Number(right)) ?? null)}
            currentBlocks={liveBlocks}
            leftName={nameOf(left)}
            rightName={nameOf(right)}
          />
        )}
      />
      <span className="sr-only" role="status" aria-live="polite">
        {announce}
      </span>
      {param && !apiSections.some((s) => s.id === param) && <RedirectTo to={`/books/${bookId}/editor/${sectionId}`} />}
    </div>
  );
}

function BookMatches({
  bookId,
  loading,
  error,
  sections,
  current,
  label,
}: {
  bookId: string;
  loading: boolean;
  error: string | null;
  sections: FindSection[];
  current: string;
  label: (id: string) => string;
}) {
  if (error) return <p className="mt-2 text-small text-claim">{error}</p>;
  if (loading && sections.length === 0) return <p className="mt-2 text-small text-ink-secondary">Searching the book</p>;
  if (sections.length === 0) return null;
  return (
    <ul aria-label="Matches by section" className="mt-2 grid gap-1 rounded-md border border-border bg-sheet p-2">
      {sections.map((s) => {
        const first = s.matches[0];
        return (
          <li key={s.sectionId}>
            <Link
              to={`/books/${bookId}/editor/${s.sectionId}`}
              aria-current={s.sectionId === current ? "true" : undefined}
              className={cn("grid min-w-0 gap-0.5 rounded-sm px-3 py-2 hover:bg-sunken", s.sectionId === current && "bg-select-wash")}
            >
              <span className="flex justify-between gap-3 text-label text-ink">
                <span className="min-w-0 truncate">{label(s.sectionId)}</span>
                <span className="num shrink-0 text-ink-secondary">
                  {s.count} {s.count === 1 ? "match" : "matches"}
                </span>
              </span>
              {first && (
                <span className="truncate text-small text-ink-secondary">
                  {first.before}
                  <mark className="rounded-xs bg-select-wash text-ink">{first.match}</mark>
                  {first.after}
                </span>
              )}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function categoryLabel(c: string): string {
  const map: Record<string, string> = {
    medical: "Medical",
    clinical: "Clinical",
    legal: "Legal",
    safety: "Safety",
    statistical: "Statistical",
    financial: "Financial",
    personal: "Personal",
    regulatory: "Named firm",
    other_fact: "Fact",
  };
  return map[c] ?? c;
}

function RedirectTo({ to }: { to: string }) {
  const navigate = useNavigate();
  useEffect(() => {
    void navigate(to, { replace: true });
  }, [to, navigate]);
  return null;
}
