import { ImportManuscriptDialog } from "./ImportManuscriptDialog";
import { ImportProjectDialog } from "./ImportProjectDialog";
import { ReadOnlyBanner, useCanWrite } from "../../lib/access";
import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { LayoutGrid, Plus, Rows3 } from "lucide-react";
import { Banner, Button, EmptyState, FilterField, PageHeader, SegmentedControl, Skeleton } from "../../components/ui";
import { useActivity } from "../../api/hooks";
import { isoFromMs, isToday, usePenNames, useWiredBooks, useWireMode } from "../../api/wire-a";
import { books as allBooks } from "../../demo/books";
import { penNames } from "../../demo/penNames";
import { useWritingJob } from "../../lib/job";
import { usePenNameFilter } from "../../lib/penName";
import { matchesQuery } from "./bookStatus";
import { readPref, useDemoState, writePref } from "./demoState";
import { LedgerView } from "./LedgerView";
import { LivePanel } from "./LivePanel";
import { PipelineView } from "./PipelineView";
import { TodayStrip, type TodayItem } from "./TodayStrip";

type View = "covers" | "ledger";
const VIEW_KEY = "volume.library.view";
const demoActive = allBooks.filter((b) => !b.archived);

function LibrarySkeleton() {
  return (
    <div role="status" aria-label="Loading books" className="grid gap-5.5">
      <div className="grid grid-cols-[72px_1fr] gap-5 rounded-lg border border-border bg-sheet p-5 sm:grid-cols-[112px_1fr]">
        <Skeleton variant="cover" />
        <div className="grid content-start gap-3">
          <Skeleton className="h-3 w-40" />
          <Skeleton className="h-5 w-3/5" />
          <Skeleton className="h-3 w-4/5" />
          <Skeleton className="h-3 w-2/3" />
          <Skeleton className="mt-2 h-1.5 w-full" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 lg:grid-cols-6">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="grid gap-2">
            <Skeleton variant="cover" />
            <Skeleton className="mt-1.5 h-3 w-4/5" />
            <Skeleton className="h-3 w-3/5" />
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Library (09-UX-FLOWS, M2, D-016). Header with a page filter, Covers or Ledger and New book; the live
 * "Writing now" panel while a job runs; books along the pipeline (the stage columns are the stage
 * filter) or in the ledger; the Today strip. The spine's profile switcher narrows the page; there is no
 * second copy of it here. The top bar holds the one search. Demo states: ?state=loading, error or empty.
 * With the server running the books and profiles come from it (api/wire-a.ts); the live panel stays a
 * demo until the library has a server feed of running jobs.
 */
export default function LibraryPage() {
  const navigate = useNavigate();
  const canWrite = useCanWrite();
  const demo = useDemoState();
  const mode = useWireMode();
  const api = mode === "api";
  const [importOpen, setImportOpen] = useState(false);
  const [projectOpen, setProjectOpen] = useState(false);
  const pens = usePenNames(mode, penNames);
  const wired = useWiredBooks(mode, demoActive);
  const apiState = pens.state === "error" || wired.state === "error" ? "error" : pens.state === "loading" || wired.state === "loading" ? "loading" : "ready";
  const state = mode === "mock" ? demo.state : apiState;
  const errorText = wired.error ?? pens.error;
  const retry =
    mode === "mock"
      ? demo.retry
      : () => {
          wired.retry();
          pens.retry();
        };
  const { selectedId: chosenPen, setSelectedId: setPenId } = usePenNameFilter();
  // The spine's switcher may hold a demo id while the screen shows server profiles: ignore an id this list does not know.
  const penId = chosenPen && pens.get(chosenPen) ? chosenPen : null;
  const demoJob = useWritingJob();
  const { job, wordsWritten, costSpent } = demoJob;
  const running = demoJob.running && !api;
  const paused = demoJob.paused;
  const [params] = useSearchParams();
  const [view, setViewState] = useState<View>(() => {
    const asked = params.get("view") ?? readPref(VIEW_KEY);
    return asked === "ledger" ? "ledger" : "covers";
  });
  const [query, setQuery] = useState("");
  const [selectedBook, setSelectedBook] = useState<string | null>(null);

  function setView(v: View) {
    setViewState(v);
    writePref(VIEW_KEY, v);
  }

  const active = useMemo(() => (state === "empty" ? [] : wired.books), [state, wired.books]);
  const byPen = useMemo(() => (penId ? active.filter((b) => b.penNameId === penId) : active), [active, penId]);
  const getPen = pens.get;
  const shown = useMemo(() => byPen.filter((b) => matchesQuery(b, getPen(b.penNameId)?.name ?? "", query)), [byPen, query, getPen]);
  const activity = useActivity(40, { enabled: api });
  const today = useMemo<TodayItem[] | undefined>(() => {
    if (!api) return undefined;
    const shownIds = new Set(byPen.map((b) => b.id));
    // GET /activity when the server has it; otherwise the books changed today.
    if (activity.data)
      return activity.data
        .filter((a) => a.projectId && shownIds.has(a.projectId) && isToday(isoFromMs(a.at)))
        .slice(0, 4)
        .map((a) => ({ id: a.id, at: isoFromMs(a.at), bookId: a.projectId ?? "", title: a.title, detail: a.detail, live: a.live }));
    return byPen
      .filter((b) => isToday(b.updatedAt))
      .slice(0, 4)
      .map((b) => ({ id: b.id, at: b.updatedAt, bookId: b.id, title: b.title, detail: b.statusLine, live: false }));
  }, [api, byPen, activity.data]);

  const pen = penId ? getPen(penId) : undefined;
  const liveInView = running && byPen.some((b) => b.id === job.bookId);
  const liveInfo = running ? { bookId: job.bookId, words: wordsWritten, costSpent, running: !paused } : null;

  const summary =
    state === "loading" || state === "error"
      ? undefined
      : `${byPen.length} ${byPen.length === 1 ? "book" : "books"}${liveInView ? (paused ? ", one paused" : ", one writing now") : ""}`;

  const newBook = !canWrite ? null : (
    <div className="flex flex-wrap gap-2">
      {mode === "api" && (
        <Button variant="secondary" onClick={() => setImportOpen(true)}>
          Import manuscript
        </Button>
      )}
      {mode === "api" && (
        <Button variant="secondary" onClick={() => setProjectOpen(true)}>
          Import project
        </Button>
      )}
      <Button variant="primary" icon={Plus} onClick={() => void navigate("/books/new")}>
        New book
      </Button>
    </div>
  );

  function renderBooks() {
    if (state === "loading") return <LibrarySkeleton />;
    if (state === "error")
      return (
        <Banner
          tone="error"
          title="Could not load your books"
          action={
            <Button size="sm" onClick={retry}>
              Retry
            </Button>
          }
        >
          {mode === "mock" ? "The local server did not answer. Your books are safe on disk. Try again in a moment." : errorText}
        </Banner>
      );
    if (active.length === 0) return <EmptyState drawing="books" title="No books yet" body="Start one from an idea or a working title." action={newBook} />;
    if (byPen.length === 0)
      return (
        <EmptyState
          drawing="books"
          title={`${pen?.name ?? "This profile"} has no books yet`}
          body="Start one from an idea or a working title, or show every profile."
          action={
            <div className="flex flex-wrap gap-2">
              {canWrite && <Button onClick={() => void navigate("/books/new")}>New book for {pen?.name ?? "this profile"}</Button>}
              <Button variant="ghost" onClick={() => setPenId(null)}>
                Show all profiles
              </Button>
            </div>
          }
        />
      );
    if (shown.length === 0)
      return (
        <EmptyState
          drawing="search"
          title={`No books match “${query.trim()}”`}
          body={pen ? `Showing ${pen.name} only. Clear the filter to see more.` : "Clear the filter to see every book."}
          action={<Button onClick={() => setQuery("")}>Clear filter</Button>}
        />
      );
    return view === "covers" ? (
      <PipelineView books={shown} live={liveInfo} penName={getPen} statusActions={api && canWrite} />
    ) : (
      <LedgerView
        books={shown}
        live={liveInfo}
        selectedId={selectedBook}
        onSelect={setSelectedBook}
        penName={getPen}
        now={api ? new Date().toISOString() : undefined}
      />
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-360 flex-col gap-5.5 px-4 pt-6 pb-10 sm:px-8 lg:px-10 lg:pt-7">
      <PageHeader
        title="Library"
        summary={summary}
        actions={
          <>
            {state === "ready" && byPen.length > 0 && (
              <FilterField
                label="Filter books"
                placeholder="Filter by title or profile"
                value={query}
                onChange={setQuery}
                count={shown.length}
                className="w-full sm:w-70"
              />
            )}
            <SegmentedControl<View>
              label="View"
              value={view}
              onChange={setView}
              options={[
                { value: "covers", label: "Covers", icon: LayoutGrid },
                { value: "ledger", label: "Ledger", icon: Rows3 },
              ]}
            />
            {newBook}
          </>
        }
      />
      <ReadOnlyBanner />

      {state === "ready" && liveInView && <LivePanel />}

      {state === "ready" && pen && byPen.length > 0 && (
        <p className="-mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-small text-ink-secondary">
          <span>
            Showing books by <b className="font-semibold text-ink">{pen.name}</b> only.
          </span>
          <button type="button" onClick={() => setPenId(null)} className="hit-44 relative rounded-xs font-semibold text-select underline underline-offset-2">
            Show all profiles
          </button>
        </p>
      )}

      {renderBooks()}
      {importOpen && <ImportManuscriptDialog profiles={pens.list} onClose={() => setImportOpen(false)} />}
      {projectOpen && canWrite && <ImportProjectDialog profiles={pens.list} filterId={penId} onClose={() => setProjectOpen(false)} />}

      {state === "ready" && byPen.length > 0 && <TodayStrip bookIds={new Set(byPen.map((b) => b.id))} items={today} />}
    </div>
  );
}
