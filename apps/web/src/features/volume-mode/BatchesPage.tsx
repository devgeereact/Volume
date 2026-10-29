import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { ArrowUpRight, Plus } from "lucide-react";
import { Button, buttonClasses, EmptyState, ProgressBar, Skeleton } from "../../components/ui";
import { useWireMode } from "../../api/wire-a";
import { useVolumeMe } from "../../api/wire-d";
import { cn } from "../../lib/cn";
import { formatDate } from "../../lib/format";
import { NewBatchDialog } from "./BatchDialogs";
import { isBusy, listWords } from "./model";
import { LoadError, ReadOnlyNote, RunChip, VolumeHeader, volumePageClasses } from "./parts";
import { useVolumeActions, useVolumeBatches } from "./useVolume";

function ListSkeleton() {
  return (
    <ul role="status" aria-label="Loading batches" className="grid gap-4">
      {Array.from({ length: 2 }, (_, i) => (
        <li key={i} className="vol-glass grid gap-2 rounded-card p-[18px]">
          <Skeleton className="h-5 w-1/3" />
          <Skeleton className="h-3 w-1/2" />
          <Skeleton className="h-3 w-1/4" />
        </li>
      ))}
    </ul>
  );
}

/**
 * Volume mode, batches (phase 8, P8-4): every batch with its pen names, books ready and the live run.
 * Owner and editor create batches; a viewer reads only. Progress arrives over the workspace event stream
 * (api/events.ts applyVolumeEvent), so a running batch moves without a reload.
 * Approved design: one glass card per batch, the run's progress bar, its share done, its chip and an Open control.
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
    <div className={volumePageClasses}>
      <VolumeHeader
        title="Volume mode"
        summary={summary}
        actions={
          me.canWrite ? (
            <Button variant="primary" icon={Plus} onClick={() => setCreating(true)}>
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
              <Button variant="primary" icon={Plus} onClick={() => setCreating(true)}>
                New batch
              </Button>
            ) : undefined
          }
        />
      )}
      {list.state === "ready" && list.batches.length > 0 && (
        <ul aria-label="Batches" className="grid gap-4">
          {list.batches.map((b) => {
            const busy = isBusy(b.status);
            const pct = Math.round(b.progress * 100);
            return (
              <li key={b.id}>
                <Link
                  to={`/volume/batches/${b.id}`}
                  className={cn(
                    "vol-glass group grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-3 rounded-card p-[18px] transition-[border-color] duration-(--vol-dur-fast)",
                    "hover:border-mint-2 min-[861px]:grid-cols-[minmax(0,1fr)_minmax(160px,330px)_auto_auto_auto] min-[861px]:gap-x-4",
                  )}
                >
                  <span className="order-1 grid min-w-0 gap-0.5">
                    <span className="text-[14px] leading-5 font-bold text-ink">{b.name}</span>
                    <span className="text-[12.5px] leading-[18px] text-ink-2">
                      {b.itemCount} {b.itemCount === 1 ? "book" : "books"}, {b.readyCount} ready
                      {b.penNames.length > 0 ? `. ${listWords(b.penNames)}` : ""}
                    </span>
                    <span className="text-[12.5px] leading-[18px] text-ink-2">
                      {b.startedAt
                        ? `Started ${formatDate(new Date(b.startedAt).toISOString())}`
                        : `Created ${formatDate(new Date(b.createdAt).toISOString())}`}
                    </span>
                  </span>
                  <ProgressBar
                    value={pct}
                    max={100}
                    label={`${b.name} progress`}
                    valueText={`${pct}% done`}
                    live={busy}
                    className="order-5 col-span-2 min-[861px]:order-2 min-[861px]:col-span-1"
                  />
                  <span aria-hidden className="num order-2 text-[14px] whitespace-nowrap text-ink min-[861px]:order-3">
                    {pct}% done
                  </span>
                  <RunChip status={b.status} className="order-3 justify-self-stretch min-[861px]:order-4 min-[861px]:justify-self-auto" />
                  <span
                    aria-hidden
                    className={cn(buttonClasses("secondary", "sm"), "order-4 justify-self-end group-hover:brightness-[1.03] min-[861px]:order-5")}
                  >
                    <ArrowUpRight size={14} strokeWidth={1.8} />
                    Open
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      <p className="text-[12.5px] leading-[18px] text-ink-2">
        A batch runs several books in turn with the usual steps. Each book passes a quality gate before its release can be confirmed.
      </p>

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
