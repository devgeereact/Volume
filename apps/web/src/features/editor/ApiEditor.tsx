import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { History, MessageSquarePlus, PanelRightClose, PanelRightOpen, RotateCw, Save, Undo2 } from "lucide-react";
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
  useSectionVersionList,
  useSectionVersions,
  useSuggestions,
  useWriteSection,
  useBookFind,
  useEstimate,
  useMe,
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
import { useToast } from "../../lib/toast";
import { interiorLook } from "../../lib/interiorLook";
import { ErrorPanel, LoadingBlock } from "../writing/screenState";
import { SummaryMissingNotice } from "../writing/SummaryMissingNotice";
import { TemplateRulesNotice } from "../writing/TemplateRulesNotice";
import { useCanWrite } from "../../lib/access";
import { workbookPlainText, type InsertKind } from "../../lib/workbookMarkdown";
import { ApiCompare } from "./ApiCompare";
import { EditorCanvas } from "./EditorCanvas";
import { EditorInspector, passName, type InspectorTab } from "./EditorInspector";
import { FindReplace, type FindState } from "./FindReplace";
import type { MsBlock, MsClaim, MsGroup, MsNote, MsSection, MsSuggestion, MsVersion, NoteMode, SuggestionPass } from "./manuscript";
import { ManuscriptTree } from "./ManuscriptTree";
import { findIssues, findRanges, findRegex, type Issue, type RewriteKind } from "./textTools";
import type { SuggestionState } from "./useManuscript";
import { VersionDrawer } from "./VersionDrawer";
import { autosaveText } from "./autosave";
import { ClaimRewrite } from "./ClaimRewrite";
import { BudgetPausedBanner } from "../books/BudgetPausedBanner";
import { ModelFallbackBanner, modelProblemOf, type ModelProblem } from "../settings/ModelFallback";
import { categoryLabel } from "./claimsOverview";
import { DiffText } from "./DiffText";
import { draftStore, useSectionAutosave } from "./useSectionAutosave";
import { draftBehind, draftKey, type LocalDraft } from "./autosave";

/* Editor on the Volume server (API mode). The same galley, tree and inspector as the demo editor, with
   the text, versions, suggestions, claims and author notes read from and saved to the server. Typing
   anywhere edits the text; it autosaves about 2 seconds after typing stops, on leaving the editor and
   before leaving the section, into one version per edit session (Save version keeps a named one). A
   copy waits in this browser until the server has it. A save that started from an old version gets a
   409, nothing is overwritten, and the owner keeps theirs as a new version or loads the newer text. */

/** One shared empty list, so hooks that depend on the blocks see a stable value before the section loads. */
const NO_BLOCKS: MsBlock[] = [];
/** Version source of the editor's autosave (apps/server repos/manuscript.ts). */
const AUTOSAVE_SOURCE = "owner:autosave";
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
    revision: cur?.updatedAt ?? null,
    autosaved: cur?.source === AUTOSAVE_SOURCE,
    blocks: blocksFromMarkdown(md, (cur?.id ?? detail.section.id).slice(-8)),
    savedMd: markdownFromBlocks(blocksFromMarkdown(md, "x")),
  };
}

interface Doc {
  sectionId: string;
  versionId: string | null;
  version: number;
  /** The held version's updatedAt, sent as autosave's baseRevision (null when the server did not say). */
  revision: number | null;
  /** True while the held version is an autosave: Save version still makes a named version then. */
  autosaved: boolean;
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
  const versionListQ = useSectionVersionList(sectionId);
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
  const [tab, setTab] = useState<InspectorTab>("fix");
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
  const [focusClaim, setFocusClaim] = useState<string | null>(null);
  const showClaim = (id: string) => {
    setTab("fix");
    setPanelOpen(true);
    setFocusClaim(id);
  };
  const [doneOpen, setDoneOpen] = useState(false);
  const [localNotes, setLocalNotes] = useState<MsNote[]>([]);
  const [noteText, setNoteText] = useState<Record<string, string>>({});
  const [review, setReview] = useState<Review | null>(null);
  const [writeJob, setWriteJob] = useState<string | null>(null);
  const toast = useToast();
  const [modelFix, setModelFix] = useState<{ problem: ModelProblem; retry: (() => void) | null } | null>(null);
  const [recovered, setRecovered] = useState<(LocalDraft & { sectionId: string }) | null>(null);
  const [prevOpen, setPrevOpen] = useState(false);
  const [keeping, setKeeping] = useState(false);
  const look = useMemo(() => interiorLook(book), [book]);
  const canWrite = useCanWrite();
  const template = apiBook?.template ?? book.template;
  const insertKinds: InsertKind[] = template === "fiction" ? ["scene"] : template === "workbook" ? ["exercise", "lines", "fill-in", "checklist"] : [];
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
  const stale = ready && serverVersionId !== null && doc.versionId !== serverVersionId;

  const words = useMemo(
    () =>
      liveBlocks.reduce((n, b) => {
        // Scene breaks are not words; a workbook block counts its prompts and items, not its fence lines.
        const t = b.kind === "scene" ? "" : b.kind === "workbook" ? workbookPlainText(b.text) : b.text;
        return n + (t.trim() ? t.trim().split(/\s+/).length : 0);
      }, 0),
    [liveBlocks],
  );

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
  const me = useMe();
  // Drafts are kept per user; without /me (an old server) they share one key in this browser.
  const userId = me.data?.userId ?? (me.isError ? "unknown" : null);
  const autosave = useSectionAutosave({
    bookId,
    sectionId,
    userId,
    doc: ready ? doc : null,
    onSaved: (md, v, savedSection) => {
      setDoc((d) =>
        d && d.sectionId === savedSection ? { ...d, versionId: v.id, version: v.version, revision: v.updatedAt ?? null, autosaved: true, savedMd: md } : d,
      );
    },
  });
  // While a draft from this browser waits for the owner's choice, the page is read only: nothing saves over either text.
  const choosing = !!recovered && recovered.sectionId === sectionId;
  const typingAllowed = canWrite && !review && !choosing;
  useEffect(() => {
    if (ready && typingAllowed) autosave.change(liveMd);
  }, [ready, typingAllowed, liveMd, autosave]);

  // A copy typed in this browser that never reached the server: offer it back once per section.
  const checkedDraft = useRef<string | null>(null);
  useEffect(() => {
    if (!ready || !userId || checkedDraft.current === sectionId) return;
    checkedDraft.current = sectionId;
    const local = draftStore.read(draftKey(sectionId, userId));
    if (local && local.bodyMd !== doc.savedMd) setRecovered({ ...local, sectionId });
    else if (local) draftStore.remove(draftKey(sectionId, userId));
  }, [ready, sectionId, doc, userId]);
  /** The server has text newer than the one the draft was typed on. */
  const recoveredBehind = choosing && !!doc && draftBehind(recovered, { versionId: doc.versionId, revision: doc.revision });
  const [compareDraft, setCompareDraft] = useState(false);

  const [restoring, setRestoring] = useState(false);
  async function restoreLocal() {
    if (!recovered || recovered.sectionId !== sectionId || !doc) return;
    const md = recovered.bodyMd;
    if (recoveredBehind) {
      // Newer text exists: keep it in history by saving the draft as a new named version on top of it.
      setRestoring(true);
      try {
        const v = await save.mutateAsync({
          bookId,
          sectionId,
          input: { bodyMd: md, note: "Restored my text from this browser", baseVersionId: doc.versionId },
        });
        setDrafts({});
        setDoc({
          sectionId,
          versionId: v.id,
          version: v.version,
          revision: v.updatedAt ?? null,
          autosaved: false,
          blocks: blocksFromMarkdown(md, v.id.slice(-8)),
          savedMd: md,
        });
        autosave.reset(md, v.id, v.updatedAt ?? null);
        setRecovered(null);
        setCompareDraft(false);
        setAnnounce(`Your text from this browser is saved as version ${v.version}. The newer text is the version before it in the list.`);
      } catch (e) {
        setProblem({
          conflict: isApiError(e) && e.isConflict,
          text:
            isApiError(e) && e.isConflict ? "The section changed again while restoring, so nothing was saved. Compare again." : `Not saved. ${errorText(e)}`,
        });
      } finally {
        setRestoring(false);
      }
      return;
    }
    setDrafts({});
    setDoc((d) => (d && d.sectionId === sectionId ? { ...d, blocks: blocksFromMarkdown(md, `r${Date.now().toString(36)}`) } : d));
    setRecovered(null);
    setCompareDraft(false);
    setAnnounce("Your text from this browser is back. It saves in a moment.");
  }
  function discardLocal() {
    if (userId) draftStore.remove(draftKey(sectionId, userId));
    setRecovered(null);
    setCompareDraft(false);
    setAnnounce("Kept the text on the server. The copy in this browser is gone.");
  }

  // Leaving the page with text not yet on the server: save it and ask the browser to wait.
  useEffect(() => {
    function onUnload(e: BeforeUnloadEvent) {
      if (!autosave.dirty()) return;
      void autosave.flush();
      e.preventDefault();
    }
    window.addEventListener("beforeunload", onUnload);
    return () => window.removeEventListener("beforeunload", onUnload);
  }, [autosave]);

  /**
   * Save version: a named version now, apart from the autosave session. Any autosave (a pending one, or the
   * one leaving the editor to click this button started) finishes first, and the named version builds on it.
   */
  const saveNow = useCallback(
    async (note: string | null = null): Promise<boolean> => {
      // Typed text lives in drafts until the paragraph is left; it is saved as is, and the blocks are
      // left alone so the paragraph being typed in keeps its caret.
      if (!doc || doc.sectionId !== sectionId) return true;
      const md = markdownFromBlocks(blocks.map((b) => (drafts[b.id] !== undefined ? { ...b, text: drafts[b.id]! } : b)));
      autosave.change(md);
      if (!(await autosave.flush())) return false; // a conflict or an error shows its own message
      const held = autosave.base();
      const baseVersionId = held ? held.versionId : doc.versionId;
      // Nothing new since the last named version: no autosave holds the text and it matches what was saved.
      if (md === doc.savedMd && !doc.autosaved && baseVersionId === doc.versionId) return true;
      try {
        const v = await save.mutateAsync({ bookId, sectionId, input: { bodyMd: md, note: note ?? "Your edits", baseVersionId } });
        setDoc((d) =>
          d && d.sectionId === sectionId ? { ...d, versionId: v.id, version: v.version, revision: v.updatedAt ?? null, autosaved: false, savedMd: md } : d,
        );
        autosave.reset(md, v.id, v.updatedAt ?? null);
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
    [blocks, drafts, doc, sectionId, bookId, save, autosave],
  );

  /** Server-side text changes (suggestions, claims, notes, restore) start from saved text. */
  async function saveFirst(): Promise<boolean> {
    if (!dirty && !autosave.dirty()) return true;
    autosave.change(liveMd);
    return autosave.flush();
  }

  /** "Mark edit done": save any open changes, then go on to the Cover step. */
  async function markEditDone() {
    const saved = await saveFirst();
    setDoneOpen(false);
    if (saved) void navigate(`/books/${bookId}/cover`);
  }

  /** After a conflict: save the text on screen as a new version on top of the newer one. */
  async function keepMine() {
    if (!doc) return;
    setKeeping(true);
    try {
      const st = autosave.status;
      let base = st.kind === "conflict" ? st.currentVersionId : null;
      if (!base) base = (await sectionQ.refetch()).data?.current?.id ?? null;
      const v = await save.mutateAsync({ bookId, sectionId, input: { bodyMd: liveMd, note: "Kept my text after a conflict", baseVersionId: base } });
      setDrafts({});
      setDoc({
        sectionId,
        versionId: v.id,
        version: v.version,
        revision: v.updatedAt ?? null,
        autosaved: false,
        blocks: blocksFromMarkdown(liveMd, v.id.slice(-8)),
        savedMd: liveMd,
      });
      autosave.reset(liveMd, v.id, v.updatedAt ?? null);
      setProblem(null);
      setAnnounce(`Your text is saved as version ${v.version}. The other text stays in the version list.`);
    } catch (e) {
      setProblem({ conflict: false, text: `Not saved. ${errorText(e)}` });
    } finally {
      setKeeping(false);
    }
  }

  async function reloadSection() {
    setDrafts({});
    setProblem(null);
    const r = await sectionQ.refetch();
    if (r.data && r.data.section.id === sectionId) {
      const next = docFrom(r.data);
      setDoc(next);
      autosave.reset(next.savedMd, next.versionId, next.revision);
    }
  }

  useEffect(() => {
    setSaveNote(null);
    setRestoredNote(null);
    setReplaceResult(null);
    setProblem(null);
    setDrafts({});
    setPrevOpen(false);
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
  const onInsert = useCallback(
    (afterBlockId: string | null, kind: "scene" | "workbook", text: string) => {
      const id = `${sectionId.slice(-6)}-n${Date.now().toString(36)}${++idSeq.current}`;
      setBlocks((list) => {
        const i = afterBlockId ? list.findIndex((b) => b.id === afterBlockId) : -1;
        const at = i < 0 ? list.length : i + 1;
        return [...list.slice(0, at), { id, kind, text, rev: 0 }, ...list.slice(at)];
      });
      setAnnounce(kind === "scene" ? "Scene break added." : "Block added.");
    },
    [setBlocks, sectionId],
  );
  const onRemoveBlock = useCallback(
    (blockId: string) => {
      setBlocks((list) => list.filter((b) => b.id !== blockId));
      setAnnounce("Block removed.");
    },
    [setBlocks],
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
      setDoc({
        sectionId,
        versionId: v.id,
        version: v.version,
        revision: v.updatedAt ?? null,
        autosaved: false,
        blocks: blocksFromMarkdown(md, v.id.slice(-8)),
        savedMd: md,
      });
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
    const done = passJob;
    setPassJob(null);
    void suggestionsQ.refetch();
    const name = passName(done.pass);
    if (w.ok) {
      setAnnounce("Suggestions ready.");
      toast.show({
        tone: "success",
        title: `${name} finished`,
        body: `${sectionLabel(done.sectionId)}: the AI edits are ready to accept or reject.`,
        action: {
          label: "Show",
          onClick: () => {
            if (done.sectionId !== sectionId) void navigate(`/books/${bookId}/editor/${done.sectionId}`);
            setPass(done.pass);
            setTab("suggestions");
            setPanelOpen(true);
          },
        },
      });
    } else {
      const mp = modelProblemOf(w);
      if (mp) {
        const again = done.pass;
        setModelFix({
          problem: mp,
          retry: () => {
            setPass(again);
            void runPass(again);
          },
        });
      } else setProblem({ conflict: false, text: `The editor pass did not finish. ${w.error ?? "Try again."}` });
      toast.show({ tone: "error", title: `${name} did not finish`, body: w.error ?? "Nothing changed. Try again." });
    }
  });
  const passPaused = passWatch.status === "paused_budget";
  const passRunning = (!!passJob && passJob.sectionId === sectionId && passJob.pass === pass && !passWatch.finished && !passPaused) || editPass.isPending;
  const passRun = suggestions.some((s) => s.pass === pass) || (passesRun[sectionId] ?? []).includes(pass);

  async function runPass(which: SuggestionPass = pass) {
    if (!(await saveFirst())) return;
    try {
      const r = await editPass.mutateAsync({ bookId, sectionId, input: { pass: which } });
      setPassJob({ jobId: r.jobId, sectionId, pass: which });
      setProblem(null);
      toast.show({
        tone: "working",
        title: `${passName(which)} started`,
        body: "The AI is reading this section. About a minute. You can keep working; you will get a message when it is done.",
      });
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
      toast.show({
        tone: "success",
        title: review.mode === "weave" ? "Your note is woven in" : "New section ready",
        body: "It shows in blue in the text. Accept or reject it there.",
      });
      setAnnounce(
        review.mode === "weave"
          ? "Your note is woven in. Review it in blue pencil, then accept or reject."
          : "New section ready. Review it, then accept or reject.",
      );
    } else {
      setReview(null);
      const mp = modelProblemOf(w);
      if (mp) setModelFix({ problem: mp, retry: null });
      else setProblem({ conflict: false, text: `The note was not woven in. ${w.error ?? "Nothing changed. Try again."}` });
      toast.show({ tone: "error", title: "The note was not woven in", body: w.error ?? "Nothing changed. Try again." });
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
    if (w.ok || w.status === "needs_attention") {
      setAnnounce("Draft written. Review it; your edits save as you go.");
      toast.show({ tone: "success", title: "Section written", body: "Read it through. Anything underlined in red needs checking." });
    } else {
      const mp = modelProblemOf(w);
      if (mp) setModelFix({ problem: mp, retry: () => void writeThis() });
      else setProblem({ conflict: false, text: `The section was not written. ${w.error ?? "Try again."}` });
      toast.show({ tone: "error", title: "The section was not written", body: w.error ?? "Try again." });
    }
  });
  async function writeThis() {
    try {
      const r = await writeSection.mutateAsync({ bookId, sectionId });
      setWriteJob(r.jobId);
      toast.show({ tone: "working", title: "Writing this section", body: "The AI is drafting it now. This can take a few minutes." });
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
  const auto = autosave.status;
  const statusLine =
    save.isPending || auto.kind === "saving"
      ? "Saving"
      : auto.kind === "saved" || auto.kind === "error" || auto.kind === "conflict"
        ? autosaveText(auto, (at) => formatTime(new Date(at).toISOString()))
        : (saveNote ?? (dirty ? "Unsaved changes" : versionNo > 0 ? `Saved as version ${versionNo}` : "Nothing saved yet"));

  /* ---------- Previous version: the one before this edit session ---------- */
  const curVersion = detail?.section.id === sectionId ? detail.current : null;
  const prevId = versionListQ.data?.previousVersionId ?? curVersion?.previousVersionId ?? curVersion?.parentVersionId ?? null;
  const prevNumber = prevId ? (versionsQ.data ?? []).find((v) => v.id === prevId)?.version : undefined;
  const prevName = prevNumber !== undefined ? `Version ${prevNumber}` : "Previous version";

  async function restorePrevious() {
    if (!prevId) return;
    if (!(await saveFirst())) return;
    try {
      const r = await restore.mutateAsync({ bookId, sectionId, versionId: prevId });
      setPrevOpen(false);
      setRestoredNote(`${prevName} restored and saved as version ${r.version}. The text before it stays in the list.`);
      setAnnounce(`${prevName} restored as version ${r.version}.`);
    } catch (e) {
      setProblem({ conflict: false, text: errorText(e) });
    }
  }

  const claimEstimate = useEstimate(bookId, "claim_fix", { enabled: canWrite && tab === "fix" && sectionClaims.length > 0 });

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
            <p className={cn("num text-small", auto.kind === "error" || auto.kind === "conflict" ? "text-claim" : "text-ink-secondary")} role="status">
              {statusLine}
            </p>
            {auto.kind === "error" && (
              <Button size="sm" variant="ghost" icon={RotateCw} className="-ml-2" title={auto.message} onClick={() => void autosave.retry()}>
                Retry
              </Button>
            )}
            <div className="ml-auto flex flex-wrap items-center gap-1.5">
              {canWrite && (
                <Button
                  variant="ghost"
                  icon={MessageSquarePlus}
                  onClick={() => addNote()}
                  title={`Add a note after the paragraph you are in (${modKey()} Enter)`}
                  disabledReason={blocks.length === 0 ? "Write or paste some text first." : undefined}
                >
                  Add note
                </Button>
              )}
              <Button
                variant="ghost"
                icon={Undo2}
                onClick={() => setPrevOpen(true)}
                disabledReason={prevId ? undefined : "No earlier version of this section yet."}
              >
                Previous version
              </Button>
              <Button
                variant="ghost"
                icon={History}
                onClick={() => setDrawer({ open: true, left: null })}
                disabledReason={versions.length === 0 ? "No versions yet." : undefined}
              >
                Versions
              </Button>
              {canWrite && (
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
              )}
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
            {auto.kind === "conflict" && (
              <Banner
                tone="attention"
                title="This section changed somewhere else"
                className="mb-4"
                action={
                  <span className="flex flex-wrap gap-1.5">
                    <Button size="sm" variant="primary" loading={keeping} loadingLabel="Saving" onClick={() => void keepMine()}>
                      Keep mine as a new version
                    </Button>
                    <Button size="sm" icon={RotateCw} onClick={() => void reloadSection()}>
                      Load theirs
                    </Button>
                  </span>
                }
              >
                Your typing was not saved over the newer text, and it is still on screen. Keep yours as a new version (the newer text stays in the version
                list), or load the newer text and drop yours.
              </Banner>
            )}
            {choosing && (
              <Banner
                tone="attention"
                title="Unsaved text from this browser"
                className="mb-4"
                action={
                  <span className="flex flex-wrap gap-1.5">
                    {recoveredBehind ? (
                      <Button size="sm" variant="primary" onClick={() => setCompareDraft(true)}>
                        Compare and choose
                      </Button>
                    ) : (
                      <Button size="sm" variant="primary" onClick={() => void restoreLocal()}>
                        Restore my text
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" onClick={discardLocal}>
                      Keep the saved text
                    </Button>
                  </span>
                }
              >
                {`You typed this at ${formatTime(new Date(recovered.at).toISOString())} and it did not reach the server.`}
                {recoveredBehind ? " The section has newer text since then, so compare the two before you choose." : ""} The page is read only until you choose.
              </Banner>
            )}
            {(() => {
              // An AI job stopped at the book's budget: say so and offer to raise it, instead of a spinner that never ends.
              const paused =
                passJob && passPaused
                  ? { jobId: passJob.jobId, message: passWatch.error }
                  : review?.jobId && weaveWatch.status === "paused_budget"
                    ? { jobId: review.jobId, message: weaveWatch.error }
                    : writeJob && writeWatch.status === "paused_budget"
                      ? { jobId: writeJob, message: writeWatch.error }
                      : null;
              return paused ? (
                <BudgetPausedBanner
                  className="mb-4"
                  bookId={bookId}
                  jobId={paused.jobId}
                  message={paused.message}
                  budgetUsd={book.cost.budget}
                  spentUsd={book.cost.spent}
                />
              ) : null;
            })()}
            {modelFix && (
              <ModelFallbackBanner
                bookId={bookId}
                className="mb-4"
                problem={modelFix.problem}
                onDismiss={() => setModelFix(null)}
                onRetry={() => modelFix.retry?.()}
              />
            )}
            {notice}
            {detail?.section.id === sectionId && (
              <>
                <SummaryMissingNotice key={sectionId} bookId={bookId} sectionId={sectionId} checks={detail.checks} className="mb-4" />
                <TemplateRulesNotice checks={detail.checks} template={template} className="mb-4" />
              </>
            )}
            {!ready ? (
              sectionQ.isError ? (
                <ErrorPanel title="Could not open this section" body={errorText(sectionQ.error)} onRetry={() => void sectionQ.refetch()} />
              ) : (
                <LoadingBlock label="Loading the section" rows={8} />
              )
            ) : (
              <div
                onBlur={(e) => {
                  if (!(e.relatedTarget instanceof Node && e.currentTarget.contains(e.relatedTarget))) void autosave.flush();
                }}
              >
                <EditorCanvas
                  section={{ ...section, blocks: shownBlocks }}
                  readOnly={!canWrite || choosing}
                  insertKinds={insertKinds}
                  onInsert={onInsert}
                  onRemoveBlock={onRemoveBlock}
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
                  onClaimClick={showClaim}
                />
              </div>
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
          focusClaimId={focusClaim}
          aiBusy={
            passJob && !passWatch.finished
              ? `${passName(passJob.pass)} on ${sectionLabel(passJob.sectionId)}${passWatch.message ? `, ${passWatch.message}` : ""}.`
              : review && weaveWatch.running
                ? review.mode === "expand"
                  ? "writing a new section from your note."
                  : "weaving your note into the text."
                : writeJob && writeWatch.running
                  ? "writing this section."
                  : null
          }
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
          renderClaimTools={(c) => (
            <ClaimRewrite
              key={c.id}
              bookId={bookId}
              claim={c}
              estimate={claimEstimate.data ?? null}
              estimateLoading={claimEstimate.isFetching}
              estimateError={claimEstimate.isError ? errorText(claimEstimate.error) : null}
              onRetryEstimate={() => void claimEstimate.refetch()}
              beforeApply={saveFirst}
              onReload={() => {
                void reloadSection();
                void claimsQ.refetch();
              }}
              onAnnounce={setAnnounce}
            />
          )}
          softenEditable
          readOnly={!canWrite}
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

      <Modal
        open={compareDraft && choosing}
        onClose={() => setCompareDraft(false)}
        size="lg"
        title="Choose which text to keep"
        description="The section changed after you typed this. Removed words are the newer text on the server; added words are yours from this browser."
        footer={
          <>
            <Button variant="ghost" onClick={discardLocal}>
              Keep the newer text
            </Button>
            <Button variant="primary" loading={restoring} loadingLabel="Saving" onClick={() => void restoreLocal()}>
              Keep mine as a new version
            </Button>
          </>
        }
      >
        {compareDraft && choosing && doc && (
          <div className="max-h-[60vh] overflow-y-auto rounded-md border border-border bg-sheet p-4 font-book text-[15px] leading-[23px] whitespace-pre-wrap text-ink">
            <DiffText before={doc.savedMd} after={recovered.bodyMd} />
          </div>
        )}
      </Modal>

      <Modal
        open={prevOpen}
        onClose={() => setPrevOpen(false)}
        size="lg"
        title="Previous version"
        description={`${prevName}, from before this edit session, beside the text now. Restoring saves it as a new version; nothing is lost.`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setPrevOpen(false)}>
              Close
            </Button>
            {canWrite && (
              <Button variant="primary" icon={Undo2} loading={restore.isPending} loadingLabel="Restoring" onClick={() => void restorePrevious()}>
                Restore this version
              </Button>
            )}
          </>
        }
      >
        {prevOpen && prevId && (
          <div className="-mx-2 max-h-[60vh] overflow-y-auto rounded-md border border-border">
            <ApiCompare sectionId={sectionId} left={prevId} right={null} currentBlocks={liveBlocks} leftName={prevName} rightName="Now" />
          </div>
        )}
      </Modal>

      <VersionDrawer
        readOnly={!canWrite}
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

function RedirectTo({ to }: { to: string }) {
  const navigate = useNavigate();
  useEffect(() => {
    void navigate(to, { replace: true });
  }, [to, navigate]);
  return null;
}
