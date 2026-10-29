import { useMemo, useState, type ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { ArrowLeft, BadgeCheck, CalendarPlus, Play, Plus, Trash2, X } from "lucide-react";
import { Banner, Button, EmptyState, IconButton, LiveDot, Modal, PageHeader, ProgressBar, Skeleton } from "../../components/ui";
import type { ApiBatchDetail, ApiBatchItemView, QualityGate } from "../../api/types";
import { apiErrorText, useWireMode } from "../../api/wire-a";
import { useVolumeMe } from "../../api/wire-d";
import { formatDate } from "../../lib/format";
import { InlineStatus } from "../settings/PanelHeader";
import { AddBooksDialog } from "./BatchDialogs";
import { formatLabels, isBusy, listWords, runProgress } from "./model";
import { GateChip, LoadError, ReadOnlyNote, RunChip, VolumeHeader } from "./parts";
import { useVolumeActions, useVolumeBatch } from "./useVolume";

function DetailSkeleton() {
  return (
    <div role="status" aria-label="Loading batch" className="grid gap-4">
      <Skeleton className="h-8 w-1/3" />
      <Skeleton className="h-4 w-1/2" />
      <div className="grid gap-3 rounded-md border border-border bg-sheet p-4">
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    </div>
  );
}

function titleOf(item: ApiBatchItemView): string {
  return item.book.title ?? item.book.idea ?? "Untitled book";
}

/** The live line while the batch runs: which book is being written, books done of total, and the bar. */
function LivePanel({ batch }: { batch: ApiBatchDetail }) {
  const { done, total, current } = runProgress(batch.items);
  const pct = Math.round(batch.progress * 100);
  return (
    <section aria-label="Batch progress" className="grid gap-3 rounded-lg border border-border border-l-[3px] border-l-accent bg-sheet p-5 shadow-sheet">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <LiveDot />
        <p className="text-label font-semibold text-accent-text">{batch.status === "running" || batch.status === "waiting" ? "Running now" : "Waiting"}</p>
        {/* Polite and short, so a screen reader hears each book change once, not every percentage. */}
        <p aria-live="polite" className="text-body text-ink">
          {current ? `Writing ${current}.` : "Waiting for the next book."} {done} of {total} {total === 1 ? "book" : "books"} done.
        </p>
      </div>
      <ProgressBar value={pct} max={100} label="Batch progress" valueText={`${pct}% done, ${done} of ${total} ${total === 1 ? "book" : "books"}`} live />
      <p className="text-small text-ink-secondary">Books run one at a time, so your other work keeps moving. You can leave this page; the run carries on.</p>
    </section>
  );
}

function GateDetails({ bookId, gate }: { bookId: string; gate: QualityGate }) {
  if (gate.ok) return null;
  return (
    <ul className="grid gap-1 text-small text-ink-secondary">
      {gate.blocks.map((b) => (
        <li key={b.id}>
          {b.message}{" "}
          <Link to={`/books/${bookId}/export`} className="font-semibold text-select underline-offset-2 hover:underline">
            Open preflight
          </Link>
        </li>
      ))}
      {gate.openClaims > 0 && (
        <li>
          {gate.openClaims === 1 ? "1 claim still needs checking." : `${gate.openClaims} claims still need checking.`}{" "}
          <Link to={`/books/${bookId}/editor`} className="font-semibold text-select underline-offset-2 hover:underline">
            Review claims
          </Link>
        </li>
      )}
    </ul>
  );
}

/**
 * One batch (phase 8, P8-4): its books in order, each with its run, quality gate and planned releases.
 * Start batch runs every book that is not ready, one at a time. A book can be marked ready only when preflight
 * has no block and no claim is open; the server checks again (409 quality_gate). Viewers read only.
 */
export default function BatchDetailPage() {
  const { batchId } = useParams();
  const mode = useWireMode();
  const me = useVolumeMe();
  const data = useVolumeBatch(mode, batchId);
  const actions = useVolumeActions(mode);
  const navigate = useNavigate();
  const [adding, setAdding] = useState(false);
  const [confirmStart, setConfirmStart] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<{ title: string; body: string } | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const batch = data.batch;
  const inBatch = useMemo(() => new Set((batch?.items ?? []).map((i) => i.bookId)), [batch]);

  if (data.state === "loading" || (data.state === "ready" && !batch))
    return (
      <Page>
        <DetailSkeleton />
      </Page>
    );
  if (data.state === "error")
    return (
      <Page>
        <BackLink />
        <PageHeader title="Batch" />
        <LoadError title="Could not load this batch" message={data.error} retry={data.retry} />
      </Page>
    );
  if (data.state === "missing" || !batch)
    return (
      <Page>
        <BackLink />
        <PageHeader title="Batch not found" />
        <EmptyState
          drawing="search"
          title="This batch is not here"
          body="It may have been deleted. Your books are safe in the Library."
          action={
            <Link to="/volume" className="font-semibold text-select underline-offset-2 hover:underline">
              See all batches
            </Link>
          }
        />
      </Page>
    );

  const b = batch;
  const busy = isBusy(b.status);
  const toRun = b.items.filter((i) => i.status !== "ready").length;
  const idleReason = busy ? "This batch is running. Wait for the run to finish first." : undefined;
  const startLabel = b.status === "draft" ? "Start batch" : "Start again";

  function run(key: string, work: () => Promise<void>, failTitle: string, done?: string) {
    setPending(key);
    setError(null);
    setStatus(null);
    work().then(
      () => {
        setPending(null);
        if (done) setStatus(done);
      },
      (e: unknown) => {
        setPending(null);
        setError({ title: failTitle, body: apiErrorText(e) });
      },
    );
  }

  const failedRun = b.job && (b.status === "failed" || b.status === "needs_attention") ? b.job.error : null;

  return (
    <Page>
      <BackLink />
      <VolumeHeader
        title={b.name}
        summary={
          <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">
            <RunChip status={b.status} />
            <span>
              {b.itemCount} {b.itemCount === 1 ? "book" : "books"}, {b.readyCount} ready
              {b.penNames.length > 0 ? `. ${listWords(b.penNames)}` : ""}
            </span>
          </span>
        }
        actions={
          me.canWrite ? (
            <>
              <IconButton icon={Trash2} label="Delete batch" disabledReason={idleReason} onClick={() => setConfirmDelete(true)} />
              <Button icon={Plus} disabledReason={idleReason} onClick={() => setAdding(true)}>
                Add books
              </Button>
              <Button
                variant="primary"
                icon={Play}
                loading={pending === "start"}
                loadingLabel="Starting"
                disabledReason={idleReason ?? (toRun === 0 ? "Every book in this batch is ready. Nothing is left to run." : undefined)}
                onClick={() => setConfirmStart(true)}
              >
                {startLabel}
              </Button>
            </>
          ) : undefined
        }
      />
      <ReadOnlyNote me={me} />
      {b.notes && <p className="max-w-[68ch] text-body text-ink-secondary">{b.notes}</p>}
      {busy && <LivePanel batch={b} />}
      {failedRun && (
        <Banner
          tone={b.status === "failed" ? "error" : "attention"}
          title={b.status === "failed" ? "The run stopped" : "The run finished, with books to look at"}
        >
          {failedRun}
        </Banner>
      )}
      {status && <InlineStatus>{status}</InlineStatus>}
      {error && (
        <Banner tone="error" title={error.title}>
          {error.body}
        </Banner>
      )}

      {b.items.length === 0 ? (
        <EmptyState
          drawing="books"
          title="No books in this batch"
          body="Add books from any pen name. They run one at a time when you start the batch."
          action={
            me.canWrite ? (
              <Button variant="primary" icon={Plus} onClick={() => setAdding(true)}>
                Add books
              </Button>
            ) : undefined
          }
        />
      ) : (
        <ol aria-label="Books in this batch" className="grid overflow-hidden rounded-md border border-border bg-sheet">
          {b.items.map((item) => {
            const gate = data.gates.get(item.id);
            const itemRunning = item.run?.status === "running" || item.run?.status === "waiting";
            const pct = Math.round((item.run?.progress ?? 0) * 100);
            const canMark = me.canWrite && item.status !== "ready" && !itemRunning && !busy;
            return (
              <li
                key={item.id}
                className="grid gap-3 border-t border-border px-4 py-4 first:border-t-0 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1.3fr)_176px] lg:items-start lg:gap-5"
              >
                <div className="flex min-w-0 gap-3">
                  <span className="num w-6 shrink-0 pt-0.5 text-small text-ink-tertiary">{item.position}</span>
                  <div className="grid min-w-0 gap-0.5">
                    <Link to={`/books/${item.bookId}`} className="font-book text-[16px] leading-5 font-medium text-ink underline-offset-2 hover:underline">
                      {titleOf(item)}
                    </Link>
                    <span className="text-small text-ink-secondary">{item.book.penName}</span>
                  </div>
                </div>
                <div className="grid gap-1.5">
                  <span className="flex flex-wrap items-center gap-2">
                    {item.status === "ready" ? (
                      <span className="inline-flex h-6 items-center gap-1.5 rounded-pill bg-success-wash px-2.5 text-[12.5px] font-semibold text-success">
                        <BadgeCheck size={14} strokeWidth={2} aria-hidden />
                        Ready
                      </span>
                    ) : (
                      <RunChip status={item.run?.status ?? null} />
                    )}
                  </span>
                  {itemRunning && <ProgressBar value={pct} max={100} size="thin" label={`${titleOf(item)} progress`} valueText={`${pct}% done`} live />}
                  {item.run?.error && <p className="text-small text-claim">{item.run.error}</p>}
                </div>
                <div className="grid gap-1.5">
                  {data.gatesState === "error" ? <span className="text-small text-ink-secondary">Gate not checked</span> : <GateChip gate={gate} />}
                  {gate && <GateDetails bookId={item.bookId} gate={gate} />}
                  {item.slots.length > 0 && (
                    <ul className="grid gap-0.5 text-small text-ink-secondary">
                      {item.slots.map((s) => (
                        <li key={s.id} className="inline-flex items-center gap-1.5">
                          <CalendarPlus size={14} aria-hidden />
                          {formatLabels[s.format]} {formatDate(new Date(s.plannedAt).toISOString())}
                          {s.status === "confirmed" ? ", confirmed" : ", planned"}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                {me.canWrite && (
                  <div className="flex items-center gap-1 lg:justify-end">
                    {canMark && (
                      <Button
                        size="sm"
                        icon={BadgeCheck}
                        loading={pending === `ready:${item.id}`}
                        loadingLabel="Checking"
                        disabledReason={gate && !gate.ok ? "Clear the blocking items and open claims first." : undefined}
                        onClick={() =>
                          run(`ready:${item.id}`, () => actions.markReady(b.id, item.id), `${titleOf(item)} is not ready yet`, `${titleOf(item)} is ready.`)
                        }
                      >
                        Mark ready<span className="sr-only"> {titleOf(item)}</span>
                      </Button>
                    )}
                    <IconButton
                      icon={X}
                      size="sm"
                      label={`Remove ${titleOf(item)} from this batch`}
                      disabledReason={idleReason}
                      onClick={() =>
                        run(
                          `remove:${item.id}`,
                          () => actions.removeBook(b.id, item.bookId),
                          "The book was not removed",
                          `${titleOf(item)} left the batch. The book itself is unchanged.`,
                        )
                      }
                    />
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      )}
      <p className="text-small text-ink-secondary">
        Plan release dates on the{" "}
        <Link to="/volume/schedule" className="font-semibold text-select underline-offset-2 hover:underline">
          release schedule
        </Link>
        . A book can be confirmed for release only after it passes the quality gate.
      </p>

      <AddBooksDialog
        open={adding}
        mode={mode}
        batchId={b.id}
        inBatch={inBatch}
        onClose={() => setAdding(false)}
        onAdd={(ids) =>
          actions.addBooks(b.id, ids).then(() => {
            setAdding(false);
            setStatus(ids.length === 1 ? "Added 1 book." : `Added ${ids.length} books.`);
          })
        }
      />

      <Modal
        open={confirmStart}
        onClose={() => setConfirmStart(false)}
        title={`${startLabel}: ${toRun === 1 ? "1 book" : `${toRun} books`}`}
        description="Each book runs in turn: blueprint, approval, then writing, with the usual checks. There is no spending cap. A book pauses only if the AI provider runs out of credit, and finished work is kept."
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmStart(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              icon={Play}
              onClick={() => {
                setConfirmStart(false);
                run("start", () => actions.startBatch(b.id), "The batch did not start", "The batch has started.");
              }}
            >
              {startLabel}
            </Button>
          </>
        }
      >
        <p className="text-body text-ink-secondary">Books already marked ready are skipped.</p>
      </Modal>

      <Modal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        size="sm"
        closeOnScrim={false}
        title={`Delete ${b.name}?`}
        description="This removes the batch only. Its books, their text and their planned releases stay as they are."
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
              Keep it
            </Button>
            <Button
              variant="danger"
              icon={Trash2}
              loading={pending === "delete"}
              loadingLabel="Deleting"
              onClick={() => {
                setPending("delete");
                actions.deleteBatch(b.id).then(
                  () => {
                    setPending(null);
                    setConfirmDelete(false);
                    void navigate("/volume");
                  },
                  (e: unknown) => {
                    setPending(null);
                    setConfirmDelete(false);
                    setError({ title: "The batch was not deleted", body: apiErrorText(e) });
                  },
                );
              }}
            >
              Delete batch
            </Button>
          </>
        }
      />
    </Page>
  );
}

function Page({ children }: { children: ReactNode }) {
  return <div className="mx-auto grid w-full max-w-[1240px] grid-cols-1 content-start gap-6 px-4 py-6 sm:px-8 lg:px-10 lg:py-7">{children}</div>;
}

function BackLink() {
  return (
    <Link to="/volume" className="inline-flex min-h-11 w-fit items-center gap-1.5 rounded-xs text-small font-semibold text-ink-secondary hover:text-ink">
      <ArrowLeft size={16} aria-hidden />
      All batches
    </Link>
  );
}
