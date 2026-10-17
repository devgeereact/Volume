import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { ChevronRight, Layers } from "lucide-react";
import { Button, EmptyState, ProgressBar, Skeleton } from "../../components/ui";
import { useWireMode } from "../../api/wire-a";
import { useVolumeMe } from "../../api/wire-d";
import { formatDate } from "../../lib/format";
import { NewBatchDialog } from "./BatchDialogs";
import { isBusy, listWords } from "./model";
import { LoadError, ReadOnlyNote, RunChip, VolumeHeader } from "./parts";
import { useVolumeActions, useVolumeBatches } from "./useVolume";

function ListSkeleton() {
  return (
    <ul role="status" aria-label="Loading batches" className="grid gap-3">
      {Array.from({ length: 3 }, (_, i) => (
        <li key={i} className="grid gap-2 rounded-md border border-border bg-sheet p-4">
          <Skeleton className="h-5 w-1/3" />
          <Skeleton className="h-3 w-1/2" />
        </li>
      ))}
    </ul>
  );
}

/**
 * Volume mode, batches (phase 8, P8-4): every batch with its pen names, books ready and the live run.
 * Owner and editor create batches; a viewer reads only. Progress arrives over the workspace event stream
 * (api/events.ts applyVolumeEvent), so a running batch moves without a reload.
 */
export default function BatchesPage() {
  const mode = useWireMode();
  const me = useVolumeMe();
  const list = useVolumeBatches(mode);
  const actions = useVolumeActions(mode);
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  const running = list.batches.filter((b) => isBusy(b.status)).length;

  const summary =
    list.state === "ready"
      ? `${list.batches.length} ${list.batches.length === 1 ? "batch" : "batches"}${running > 0 ? `, ${running} running` : ""}`
      : undefined;

  return (
    <div className="mx-auto grid w-full max-w-[1240px] grid-cols-1 content-start gap-6 px-4 py-6 sm:px-8 lg:px-10 lg:py-7">
      <VolumeHeader
        title="Volume mode"
        summary={summary}
        actions={
          me.canWrite ? (
            <Button variant="primary" icon={Layers} onClick={() => setCreating(true)}>
              New batch
            </Button>
          ) : undefined
        }
      />
      <ReadOnlyNote me={me} />

      {list.state === "loading" && <ListSkeleton />}
      {list.state === "error" && <LoadError title="Could not load your batches" message={list.error} retry={list.retry} />}
      {list.state === "ready" && list.batches.length === 0 && (
        <EmptyState
          drawing="books"
          title="No batches yet"
          body="A batch runs several books one at a time with the usual pipeline. Each book still passes preflight and claims review before it can be scheduled."
          action={
            me.canWrite ? (
              <Button variant="primary" icon={Layers} onClick={() => setCreating(true)}>
                New batch
              </Button>
            ) : undefined
          }
        />
      )}
      {list.state === "ready" && list.batches.length > 0 && (
        <ul aria-label="Batches" className="grid gap-3">
          {list.batches.map((b) => {
            const busy = isBusy(b.status);
            const pct = Math.round(b.progress * 100);
            return (
              <li key={b.id}>
                <Link
                  to={`/volume/batches/${b.id}`}
                  className="group grid gap-3 rounded-md border border-border bg-sheet p-4 hover:bg-sunken sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-6"
                >
                  <span className="grid min-w-0 gap-1">
                    <span className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                      <span className="font-book text-[18px] leading-6 font-medium text-ink">{b.name}</span>
                      <RunChip status={b.status} />
                    </span>
                    <span className="text-small text-ink-secondary">
                      {b.itemCount} {b.itemCount === 1 ? "book" : "books"}, {b.readyCount} ready
                      {b.penNames.length > 0 ? `. ${listWords(b.penNames)}` : ""}
                    </span>
                    <span className="text-small text-ink-tertiary">
                      {b.startedAt
                        ? `Started ${formatDate(new Date(b.startedAt).toISOString())}`
                        : `Created ${formatDate(new Date(b.createdAt).toISOString())}`}
                    </span>
                  </span>
                  <span className="flex items-center gap-4">
                    {busy && (
                      <span className="grid w-full min-w-[160px] gap-1 sm:w-[200px]">
                        <span className="num text-small text-ink-secondary">{pct}% done</span>
                        <ProgressBar value={pct} max={100} label={`${b.name} progress`} valueText={`${pct}% done`} live />
                      </span>
                    )}
                    <ChevronRight size={18} aria-hidden className="hidden shrink-0 text-ink-tertiary sm:block" />
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      <NewBatchDialog
        open={creating}
        mode={mode}
        onClose={() => setCreating(false)}
        onCreate={(input) =>
          actions.createBatch(input).then((id) => {
            setCreating(false);
            void navigate(`/volume/batches/${id}`);
          })
        }
      />
    </div>
  );
}
