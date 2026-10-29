import { ImportManuscriptDialog } from "./ImportManuscriptDialog";
import { ImportProjectDialog } from "./ImportProjectDialog";
import { ReadOnlyBanner, useCanWrite } from "../../lib/access";
import { useId, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { ChevronDown, GalleryHorizontalEnd, LayoutGrid, Plus, Rows3 } from "lucide-react";
import { Banner, Button, Card, EmptyState, FilterField, PageHeader, SegmentedControl, Skeleton } from "../../components/ui";
import { fieldBoxClasses } from "../../components/ui/FieldShell";
import { useActivity } from "../../api/hooks";
import { isoFromMs, isToday, useApiSettings, usePenNames, useRunningJobs, useWiredBooks, useWireMode } from "../../api/wire-a";
import { books as allBooks } from "../../demo/books";
import { penNames } from "../../demo/penNames";
import { workspace } from "../../demo/workspace";
import type { PenName } from "../../demo/types";
import { cn } from "../../lib/cn";
import { useWritingJob } from "../../lib/job";
import { usePenNameFilter } from "../../lib/penName";
import { groupOf, matchesQuery, type BookGroup } from "./bookStatus";
import { readPref, useDemoState, writePref } from "./demoState";
import { LedgerView } from "./LedgerView";
import { LibraryGrid, LibraryGridSkeletonCards } from "./LibraryGrid";
import { LibrarySide, NeedsYou, Releases } from "./LibrarySide";
import { LibraryTiles, type SpendFigures } from "./LibraryTiles";
import { LivePanel } from "./LivePanel";
import { PipelineView } from "./PipelineView";
import { TodayStrip, type TodayItem } from "./TodayStrip";

/**
 * grid: the 3 by 3 cover grid, labelled "Covers" as in the approved design (default). covers: the Shelves lanes (the
 * name is kept so ?view=covers links and saved choices still open the Shelves). ledger: the table.
 */
type View = "grid" | "covers" | "ledger";
/* A new key with the grid (studio redesign stage 3), so a choice saved before the grid existed does not hide it. */
const VIEW_KEY = "volume.library.layout";

function readView(asked: string | null): View {
  return asked === "ledger" || asked === "covers" ? asked : "grid";
}
const demoActive = allBooks.filter((b) => !b.archived);

function TilesSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-4 max-[560px]:gap-2.5 min-[1201px]:grid-cols-4" aria-hidden>
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} className="vol-glass grid gap-2.5 rounded-card p-4.5">
          <Skeleton className="w-2/3" />
          <Skeleton className="h-6 w-1/3" />
          <Skeleton className="w-3/4" />
        </div>
      ))}
    </div>
  );
}

function LibrarySkeleton({ view }: { view: View }) {
  if (view === "grid") return <LibraryGridSkeletonCards />;
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 lg:grid-cols-6">
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="grid gap-2">
          <Skeleton variant="cover" />
          <Skeleton className="mt-1.5 h-3 w-4/5" />
          <Skeleton className="h-3 w-3/5" />
        </div>
      ))}
    </div>
  );
}

/** "All profiles" or one profile: narrows the whole page. The same choice as the side menu's switcher (lib/penName). */
function ProfileSelect({ pens, value, onChange }: { pens: readonly PenName[]; value: string | null; onChange: (id: string | null) => void }) {
  const id = useId();
  return (
    <span className="relative flex min-w-0 flex-[0_1_180px] max-[560px]:flex-[1_1_100%]">
      <label htmlFor={id} className="sr-only">
        Profile
      </label>
      <select
        id={id}
        value={value ?? "all"}
        onChange={(e) => onChange(e.target.value === "all" ? null : e.target.value)}
        className={cn(fieldBoxClasses({ error: false, disabled: false }), "h-10 cursor-pointer appearance-none truncate pr-9")}
      >
        <option value="all">All profiles</option>
        {pens.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
      <ChevronDown size={16} strokeWidth={1.8} aria-hidden className="pointer-events-none absolute top-3 right-3 text-ink-2" />
    </span>
  );
}

/**
 * Library, the app's home (09-UX-FLOWS, M2, D-016), as the approved Volume Studio design: four stat tiles (In
 * progress, Ready to publish and Published narrow the books to that stage; the month's AI spend), the live "Writing
 * now" card while a job runs, then the All books panel with a filter, the profile select, Covers, Shelves or Ledger
 * and New book. Beside it, from 1201 px, a column that stays in view: Needs you, Releases in the next 7 days and
 * Today. The top bar shows the page title, so the h1 here is for screen readers only, and it holds the one search.
 * The profile select and the side menu's switcher share one choice. Demo states: ?state=loading, error or empty.
 * With the server running the books, profiles, spend and releases come from it (api/wire-a.ts); the live card stays
 * a demo until the library has a server feed of running jobs, and Needs you waits for the server to report it.
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
  const settings = useApiSettings(api);
  const runningJobs = useRunningJobs(api);
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
  // The side menu's switcher may hold a demo id while the screen shows server profiles: ignore an id this list does not know.
  const penId = chosenPen && pens.get(chosenPen) ? chosenPen : null;
  const demoJob = useWritingJob();
  const { job, wordsWritten, costSpent } = demoJob;
  const running = demoJob.running && !api;
  const paused = demoJob.paused;
  const [params] = useSearchParams();
  const [view, setViewState] = useState<View>(() => readView(params.get("view") ?? readPref(VIEW_KEY)));
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState<BookGroup | null>(null);
  const [selectedBook, setSelectedBook] = useState<string | null>(null);

  function setView(v: View) {
    setViewState(v);
    writePref(VIEW_KEY, v);
  }

  const active = useMemo(() => (state === "empty" ? [] : wired.books), [state, wired.books]);
  const byPen = useMemo(() => (penId ? active.filter((b) => b.penNameId === penId) : active), [active, penId]);
  const getPen = pens.get;
  const shown = useMemo(() => byPen.filter((b) => matchesQuery(b, getPen(b.penNameId)?.name ?? "", query)), [byPen, query, getPen]);
  // The stage tiles narrow every view to one stage.
  const inGroup = useMemo(() => (group ? shown.filter((b) => groupOf(b) === group) : shown), [shown, group]);
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

  /* Tile lines, each from what this mode really knows. */
  const needYou = byPen.filter((b) => b.attentionSteps.length > 0).length;
  const penBookIds = new Set(byPen.map((b) => b.id));
  const jobsHere = runningJobs.filter((j) => penBookIds.has(j.bookId)).length;
  const progressFoot = api
    ? jobsHere > 0
      ? `${jobsHere} ${jobsHere === 1 ? "job" : "jobs"} running now`
      : "Nothing running now"
    : `${needYou} need you, ${liveInView ? (paused ? "1 paused" : "1 writing now") : "none writing"}`;
  const published = byPen.filter((b) => groupOf(b) === "published");
  const formats = published.reduce((n, b) => n + (b.published?.formats.length ?? 0), 0);
  const markets = [...new Set(published.map((b) => b.published?.marketplace).filter((m): m is string => Boolean(m)))];
  const publishedFoot =
    formats > 0 ? `${formats} ${formats === 1 ? "format" : "formats"}${markets.length === 1 ? ` on ${markets[0] ?? ""}` : ""}` : "Live on the shelf";
  const month = new Intl.DateTimeFormat("en-GB", { month: "long" }).format(new Date());
  const spend: SpendFigures | null | "none" =
    mode === "mock"
      ? { month: workspace.spend.monthLabel, spentUsd: workspace.spend.spentUsd, creditUsd: workspace.openRouter.creditUsd }
      : mode === "checking" || settings.isPending
        ? null
        : settings.isError
          ? "none"
          : { month, spentUsd: settings.data.budgets.monthSpendUsd, creditUsd: settings.data.openRouterCredit?.limitRemainingUsd ?? null };

  const newBook = !canWrite ? null : (
    <>
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
    </>
  );

  function renderBooks() {
    if (state === "loading")
      return (
        <div role="status" aria-label="Loading books">
          <LibrarySkeleton view={view} />
        </div>
      );
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
    if (inGroup.length === 0) {
      const groupTitle = group === "progress" ? "in progress" : group === "ready" ? "ready to publish" : "published";
      return (
        <EmptyState
          drawing="books"
          title={`No books ${groupTitle}`}
          body="Pick another stage, or show every book."
          action={<Button onClick={() => setGroup(null)}>Show all books</Button>}
        />
      );
    }
    if (view === "grid") return <LibraryGrid books={inGroup} group={group} live={liveInfo} penName={getPen} statusActions={api && canWrite} />;
    return view === "covers" ? (
      <PipelineView books={inGroup} live={liveInfo} penName={getPen} statusActions={api && canWrite} />
    ) : (
      <LedgerView
        books={inGroup}
        live={liveInfo}
        selectedId={selectedBook}
        onSelect={setSelectedBook}
        penName={getPen}
        now={api ? new Date().toISOString() : undefined}
      />
    );
  }

  const ready = state === "ready";
  const hasBooks = active.length > 0;
  // The Shelves lanes need the full width; Covers and Ledger sit beside the side column from 1201 px.
  const withSide = view !== "covers";

  const panel = (
    <Card as="section" aria-label="Books" className="min-w-0 p-5 max-[560px]:p-3.75">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <FilterField
          label="Filter books"
          placeholder="Filter by title or profile"
          value={query}
          onChange={setQuery}
          count={shown.length}
          className="min-w-0 flex-[1_1_220px]"
        />
        {pens.list.length > 0 && <ProfileSelect pens={pens.list} value={penId} onChange={setPenId} />}
        <SegmentedControl<View>
          label="View"
          value={view}
          onChange={setView}
          options={[
            { value: "grid", label: "Covers", icon: LayoutGrid },
            { value: "covers", label: "Shelves", icon: GalleryHorizontalEnd },
            { value: "ledger", label: "Ledger", icon: Rows3 },
          ]}
        />
        {newBook && <div className="flex flex-wrap gap-2 min-[1201px]:ml-auto">{newBook}</div>}
      </div>
      {renderBooks()}
    </Card>
  );

  const side = (
    <LibrarySide>
      <NeedsYou books={byPen} api={api} />
      <Releases mode={mode} />
      <TodayStrip layout="column" bookIds={new Set(byPen.map((b) => b.id))} items={today} />
    </LibrarySide>
  );

  return (
    <div className="flex w-full flex-col gap-4 px-4 pt-1 pb-6 min-[861px]:px-6">
      <PageHeader title="Library" titleHidden />
      <ReadOnlyBanner />

      {state === "error" ? (
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
      ) : ready && !hasBooks ? (
        <Card>
          <EmptyState
            drawing="books"
            title="No books yet"
            body="Start one from an idea or a working title."
            action={newBook && <div className="flex flex-wrap gap-2">{newBook}</div>}
          />
        </Card>
      ) : (
        <>
          {ready ? (
            <LibraryTiles books={byPen} group={group} onGroup={setGroup} progressFoot={progressFoot} publishedFoot={publishedFoot} spend={spend} />
          ) : (
            <TilesSkeleton />
          )}
          {withSide ? (
            <div className="grid items-start gap-4 min-[1201px]:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
              <div className="grid min-w-0 content-start gap-4">
                {ready && liveInView && <LivePanel />}
                {panel}
              </div>
              {ready && side}
            </div>
          ) : (
            <>
              {ready && liveInView && <LivePanel />}
              {panel}
              {ready && byPen.length > 0 && <TodayStrip bookIds={new Set(byPen.map((b) => b.id))} items={today} />}
            </>
          )}
        </>
      )}

      {importOpen && <ImportManuscriptDialog profiles={pens.list} onClose={() => setImportOpen(false)} />}
      {projectOpen && canWrite && <ImportProjectDialog profiles={pens.list} filterId={penId} onClose={() => setProjectOpen(false)} />}
    </div>
  );
}
