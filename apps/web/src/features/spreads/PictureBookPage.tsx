import { useCallback, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useBookLive } from "../../api/events";
import { queryKeys, useBookJobs, useJob, useJobControl } from "../../api/hooks";
import {
  usePaintSpread,
  usePatchSpread,
  usePictureBook,
  usePictureCharacters,
  usePictureEstimate,
  useStartPictureBook,
  type PictureBookView,
  type SpreadLayout,
  type SpreadView,
} from "../../api/picture";
import { isTerminalJob, type ApiBookDetail } from "../../api/types";
import { errorText, useJobWatch } from "../../api/wire-c";
import { EmptyState } from "../../components/ui";
import type { Book } from "../../demo/types";
import { useCanWrite } from "../../lib/access";
import { isCreditsMessage } from "../books/BudgetPausedBanner";
import { bookStepPath } from "../../screens";
import { ErrorPanel, LoadingBlock, useScreenState } from "../writing/screenState";
import { demoPictureStories } from "../../demo/pictureBook";
import { demoPaint, demoSaveText, demoSetLayout, demoStartRun, hasDemoStory, useDemoPictureBook } from "./demoStore";
import { bleedPageSize, demoPlan } from "./geometry";
import {
  mergeRunChildren,
  nextRunPeak,
  pageCountFor,
  runLineFromChildren,
  runProgressFromChildren,
  runSteps,
  storyFormFrom,
  type RunChild,
  type RunPeak,
} from "./model";
import { PictureBookScreen } from "./PictureBookScreen";

/* The Writing step for picture books (P7-6). API books read and write through api/picture.ts with live progress
   from the book's event stream; demo books use the in-memory demo store. Both render PictureBookScreen. */

interface PageProps {
  book: Book;
  apiBook: ApiBookDetail | undefined;
}

export default function PictureBookPage({ book, apiBook }: PageProps) {
  if (apiBook) return <ApiPictureBook key={book.id} book={book} apiBook={apiBook} />;
  return <DemoPictureBook key={book.id} book={book} />;
}

function Loading() {
  return (
    <div className="px-4 py-6 sm:px-8 lg:px-10 lg:py-7">
      <LoadingBlock label="Loading the picture book" rows={8} className="max-w-[960px]" />
    </div>
  );
}

/* ---------- Server books ---------- */

function ApiPictureBook({ book, apiBook }: { book: Book; apiBook: ApiBookDetail }) {
  const bookId = book.id;
  const qc = useQueryClient();
  const canWrite = useCanWrite();
  const viewQ = usePictureBook(bookId);
  const charsQ = usePictureCharacters(bookId);
  const estimateQ = usePictureEstimate(bookId);
  const start = useStartPictureBook();
  const patch = usePatchSpread();
  const paint = usePaintSpread();
  const control = useJobControl();
  const jobs = useBookJobs(bookId, { limit: 100 });
  const live = useBookLive(bookId);
  const [startedId, setStartedId] = useState<string | null>(null);

  const view = viewQ.data;
  const latest = view?.job ?? null;
  const runId = startedId ?? (latest && !isTerminalJob(latest.status) ? latest.id : null);
  const refresh = useCallback(() => {
    void qc.invalidateQueries({ queryKey: queryKeys.book.spreads(bookId) });
    void qc.invalidateQueries({ queryKey: queryKeys.book.characters(bookId) });
  }, [qc, bookId]);
  const watch = useJobWatch(bookId, runId, () => {
    setStartedId(null);
    refresh();
  });
  const runDetail = useJob(runId ?? undefined, { pollMs: 3000 });

  // The run's steps come from its children: the polled record plus the live stream, so they move as events arrive.
  const runChildren = useMemo((): RunChild[] => {
    if (!runId) return [];
    const record = runDetail.data?.children ?? [];
    const liveChildren = Object.values(live.data.jobs)
      .filter((j) => j.parentId === runId)
      .map((j) => ({ id: j.jobId, kind: j.kind, status: j.status, progress: j.progress, message: j.message }));
    return mergeRunChildren(record, liveChildren);
  }, [runId, runDetail.data?.children, live.data.jobs]);
  // Progress from finished and running children, never lower than the most seen for this run (the parent's own
  // figure jumps about as the run adds steps).
  const rawProgress = Math.max(runProgressFromChildren(runChildren), watch.finished ? 1 : 0);
  const [peak, setPeak] = useState<RunPeak>({ runId: null, value: 0 });
  const nextPeak = nextRunPeak(peak, runId, rawProgress);
  if (nextPeak !== peak) setPeak(nextPeak);

  // Spreads being painted (a repaint, or the run's own pictures), with live progress when the stream has it.
  const painting = useMemo(() => {
    const out: Record<string, number> = {};
    for (const j of jobs.data ?? []) {
      if (j.kind !== "spread_image" || isTerminalJob(j.status)) continue;
      const sectionId = j.payload["sectionId"];
      if (typeof sectionId !== "string") continue;
      out[sectionId] = live.data.jobs[j.id]?.progress ?? j.progress ?? 0;
    }
    return out;
  }, [jobs.data, live.data.jobs]);

  if (viewQ.isPending) return <Loading />;
  if (viewQ.isError || !view)
    return (
      <div className="grid gap-5 px-4 py-6 sm:px-8 lg:px-10 lg:py-7">
        <h1 className="font-book text-title text-ink">Story and spreads</h1>
        <ErrorPanel
          className="max-w-[720px]"
          title="Could not load the picture book"
          body={`${errorText(viewQ.error)} Your story and pictures are safe on the server.`}
          onRetry={() => void viewQ.refetch()}
        />
      </div>
    );

  const run = watch.running
    ? {
        progress: nextPeak.value,
        message: runLineFromChildren(runChildren) ?? watch.message ?? (watch.status === "queued" ? "Waiting to start" : null),
        steps: runSteps(runChildren),
        onCancel: runId ? () => control.mutate({ jobId: runId, action: "cancel" }) : undefined,
        cancelling: control.isPending,
      }
    : null;

  let runError: string | null = null;
  if (!run && latest) {
    if (latest.status === "needs_attention" && view.safety && !view.safety.passed)
      runError = "The writer's safety check flagged the story, so no pictures were made. Change the idea if you need to, then write it again.";
    else if (latest.status === "failed") runError = latest.error ?? "The run failed. Carry on to try the step again.";
    else if (latest.status === "cancelled") runError = "The run was stopped. Carry on to finish it; finished steps are kept.";
    else if (latest.status === "paused_budget")
      runError = isCreditsMessage(latest.error ?? null)
        ? "The run paused because the AI provider ran out of credit. Top up, then carry on; finished steps are kept."
        : (latest.error ?? "The run is paused. Carry on to finish it; finished steps are kept.");
  }

  const throwPlain = (e: unknown): never => {
    throw new Error(errorText(e));
  };

  return (
    <PictureBookScreen
      bookTitle={book.title}
      view={view}
      characters={charsQ.data ?? []}
      charactersLoading={charsQ.isPending}
      charactersError={charsQ.isError ? errorText(charsQ.error) : null}
      run={run}
      runError={runError}
      initialForm={storyFormFrom(apiBook.settings, apiBook.idea, view.plan.spreads || null)}
      canWrite={canWrite}
      painting={painting}
      spentUsd={apiBook.costToDateUsd}
      exportPath={bookStepPath(bookId, "export")}
      estimate={estimateQ.data ?? null}
      onStart={(story, spreads, regenerateStory) =>
        start.mutateAsync({ bookId, input: { story, spreads, regenerateStory } }).then(
          (r) => setStartedId(r.jobId),
          (e: unknown) => throwPlain(e),
        )
      }
      onSaveText={(s: SpreadView, text: string) =>
        patch.mutateAsync({ bookId, sectionId: s.sectionId, patch: { text, baseVersionId: s.versionId } }).then(
          () => undefined,
          (e: unknown) => throwPlain(e),
        )
      }
      onLayout={(s: SpreadView, layout: SpreadLayout) =>
        patch.mutateAsync({ bookId, sectionId: s.sectionId, patch: { layout } }).then(
          () => undefined,
          (e: unknown) => throwPlain(e),
        )
      }
      onPaint={(s: SpreadView) => paint.mutateAsync({ bookId, sectionId: s.sectionId }).then(() => undefined)}
    />
  );
}

/* ---------- Demo books ---------- */

const DEMO_MATTER = { front: 3, back: 1 };

function DemoPictureBook({ book }: { book: Book }) {
  const { state, retry } = useScreenState();
  const s = useDemoPictureBook(book.id);
  const canWrite = useCanWrite();
  const plan = useMemo(() => demoPlan("premium", DEMO_MATTER.front, DEMO_MATTER.back), []);
  const story = demoPictureStories[book.id];

  if (!hasDemoStory(book.id) || !story)
    return (
      <div className="px-4 py-6 sm:px-8 lg:px-10 lg:py-7">
        <EmptyState
          title="No demo story for this book"
          body="Open Pip and the Sleepy Stars or Milo and the Moon Kite to try the picture-book flow."
          drawing="page"
        />
      </div>
    );
  if (state === "loading") return <Loading />;
  if (state === "error")
    return (
      <div className="grid gap-5 px-4 py-6 sm:px-8 lg:px-10 lg:py-7">
        <h1 className="font-book text-title text-ink">Story and spreads</h1>
        <ErrorPanel
          className="max-w-[720px]"
          title="Could not load the picture book"
          body="The server did not answer. Your story and pictures are safe. Retry to load them again."
          onRetry={retry}
        />
      </div>
    );

  const demoView = state === "empty" ? null : s.view;
  const view: PictureBookView | null = demoView
    ? {
        ...demoView,
        pageSizeIn: bleedPageSize(),
        plan,
        pageCount: pageCountFor(DEMO_MATTER.front, demoView.spreads.length, DEMO_MATTER.back),
      }
    : null;
  const settings = { genre: { ageRange: story.ageRange, newWord: story.newWord }, chapters: plan.spreads };

  return (
    <PictureBookScreen
      bookTitle={book.title}
      view={view}
      characters={state === "empty" ? [] : s.characters}
      run={s.run ? { progress: s.run.progress, message: s.run.message, steps: runSteps(s.run.children) } : null}
      runError={null}
      initialForm={storyFormFrom(settings, story.topic, plan.spreads)}
      canWrite={canWrite}
      painting={s.painting}
      spentUsd={s.spentUsd}
      exportPath={bookStepPath(book.id, "export")}
      onStart={(input, spreads) => demoStartRun(book.id, input, spreads)}
      onSaveText={(sp, text) => demoSaveText(book.id, sp.sectionId, text)}
      onLayout={(sp, layout) => demoSetLayout(book.id, sp.sectionId, layout)}
      onPaint={(sp) => demoPaint(book.id, sp.sectionId)}
    />
  );
}
