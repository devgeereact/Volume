import { useState, type ReactNode } from "react";
import { useCanWrite } from "../../lib/access";
import { Check, CircleAlert, ExternalLink, Globe, RotateCcw, X } from "lucide-react";
import {
  Banner,
  Button,
  Checkbox,
  EmptyState,
  Inspector,
  InspectorSection,
  LiveDot,
  ModelName,
  Modal,
  PageHeader,
  ProgressBar,
  Select,
  Skeleton,
  Textarea,
  buttonClasses,
} from "../../components/ui";
import { useEstimate, useJobControl, useResearch, useResearchRun, useSetSourceUse, useStartResearch } from "../../api/hooks";
import type { ApiBookDetail, ApiResearchRun, ApiResearchRunWithSources } from "../../api/types";
import { isTerminalJob } from "../../api/types";
import {
  estimateWords,
  guardrailsOf,
  plainError,
  runMeta,
  toSourceView,
  useBookJobsLive,
  usePromptRunFor,
  whenMs,
  type SourceView,
  type StageJob,
} from "../../api/wire-b";
import { GuardrailNote } from "./GuardrailNote";
import type { Book } from "../../demo";
import { cn } from "../../lib/cn";
import { formatUsd } from "../../lib/format";
import { useStepAction } from "../../lib/stepAction";
import { bookStepPath } from "../../screens";

/* Research for a book on the server (API mode). Start a run, follow its progress over the event
   stream, read the dossier and tick the sources the writer may use. Nothing here is demo data: an
   empty value says so instead of being filled in. */

interface Dossier {
  audience: { who: string; situation: string; level: string };
  problems: string[];
  angles: { angle: string; why: string }[];
  competing: string[];
  gaps: string[];
  keywords: string[];
  notes: string;
}

function strs(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim().length > 0) : [];
}
function s(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}
function rec(v: unknown): Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

function dossierOf(run: ApiResearchRun): Dossier {
  const o = rec(run.output);
  const a = rec(o["audience"]);
  return {
    audience: { who: s(a["who"]), situation: s(a["situation"]), level: s(a["level"]) },
    problems: strs(o["problems"]),
    angles: Array.isArray(o["angles"]) ? o["angles"].map((x) => ({ angle: s(rec(x)["angle"]), why: s(rec(x)["why"]) })).filter((x) => x.angle) : [],
    competing: strs(o["competing_themes"]),
    gaps: strs(o["gaps"]),
    keywords: strs(o["keyword_ideas"]),
    notes: s(o["notes"]),
  };
}

type RunState = "running" | "done" | "failed" | "cancelled";

function runState(run: ApiResearchRun, job: StageJob | undefined): RunState {
  if (run.status === "done") return "done";
  if (run.status === "failed" || job?.status === "failed" || job?.status === "needs_attention") return "failed";
  if (job && job.status === "cancelled") return "cancelled";
  if (job && isTerminalJob(job.status)) return "failed";
  return "running";
}

export function ResearchApi({ book, apiBook }: { book: Book; apiBook: ApiBookDetail }) {
  const canWrite = useCanWrite();
  const bookId = apiBook.id;
  const research = useResearch(bookId);
  const { jobs } = useBookJobsLive(bookId);
  const start = useStartResearch();
  const control = useJobControl();
  const [pickedRun, setPickedRun] = useState<string | null>(null);
  const [againOpen, setAgainOpen] = useState(false);
  const [hint, setHint] = useState("");
  const [cancelError, setCancelError] = useState<string | null>(null);

  const latest = research.data?.latest ?? null;
  const runs = research.data?.runs ?? [];
  const selectedId = pickedRun && runs.some((r) => r.id === pickedRun) ? pickedRun : (latest?.id ?? null);
  const older = useResearchRun(selectedId && selectedId !== latest?.id ? selectedId : undefined);
  const run: ApiResearchRunWithSources | null = selectedId === latest?.id ? latest : (older.data ?? null);
  const job = run?.jobId ? jobs.find((j) => j.id === run.jobId) : undefined;
  const state = run ? runState(run, job) : null;
  const latestJob = latest?.jobId ? jobs.find((j) => j.id === latest.jobId) : undefined;
  const latestRunning = latest ? runState(latest, latestJob) === "running" : false;
  const anyDone = runs.some((r) => r.status === "done");
  const prompt = usePromptRunFor(bookId, "research", job ?? null);
  const estimate = useEstimate(bookId, "research");
  const meta = runMeta(run);
  const guard = guardrailsOf(run);

  function runResearch(audienceHint?: string) {
    setPickedRun(null);
    setCancelError(null);
    start.mutate(audienceHint ? { bookId, audienceHint } : { bookId });
  }

  const titlesPath = bookStepPath(book.id, "titles");
  // The one gilt button lives in the step footer (D-016).
  useStepAction(
    research.isPending || research.isError
      ? { label: "Continue to titles", to: titlesPath, disabledReason: research.isPending ? "Loading the research." : "The research could not be loaded." }
      : !anyDone && !latestRunning
        ? {
            label: start.isPending ? "Starting research" : "Run research",
            estimate: estimateWords(estimate.data),
            onClick: () => runResearch(),
            disabledReason: start.isPending ? "Starting research." : undefined,
          }
        : {
            label: "Continue to titles",
            to: titlesPath,
            disabledReason: latestRunning ? "Research is still running." : undefined,
          },
  );

  const sources = (run?.sources ?? []).map(toSourceView);
  const usedCount = sources.filter((x) => x.useInBook).length;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_auto]">
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] content-start gap-7 px-4 py-6 sm:px-8 lg:px-10 lg:py-7">
        <PageHeader
          title="Research"
          summary="Who the book is for, what they struggle with, and where it fits. Sources are cited, never invented."
          actions={
            canWrite && runs.length > 0 && !latestRunning ? (
              <Button icon={RotateCcw} estimate={estimateWords(estimate.data)} onClick={() => setAgainOpen(true)}>
                Run again
              </Button>
            ) : undefined
          }
        />

        {start.isError && (
          <Banner tone="error" title="Research did not start">
            {plainError(start.error)}
          </Banner>
        )}

        {research.isPending && <DossierSkeleton />}

        {research.isError && (
          <Banner
            tone="error"
            title="The research could not be loaded"
            action={
              <Button size="sm" icon={RotateCcw} onClick={() => void research.refetch()}>
                Retry
              </Button>
            }
          >
            {plainError(research.error)}
          </Banner>
        )}

        {research.isSuccess && runs.length === 0 && (
          <EmptyState
            drawing="search"
            title="Research has not run yet"
            body="The researcher searches the web, reads the sources it cites and writes up the audience, their problems and the gaps. Start it with Run research below. Earlier runs are always kept."
          />
        )}

        {run && state && (
          <RunHeader
            runs={runs}
            runId={selectedId}
            onRunChange={setPickedRun}
            state={state}
            model={meta.model ?? prompt.model}
            cost={meta.costUsd ?? prompt.costUsd}
            at={state === "running" ? run.createdAt : run.updatedAt}
          />
        )}

        {selectedId && selectedId !== latest?.id && older.isPending && <DossierSkeleton />}

        {run && state === "running" && (
          <LivePanel
            job={job}
            onCancel={
              job && canWrite
                ? () =>
                    control.mutate(
                      { jobId: job.id, action: "cancel" },
                      { onError: (e) => setCancelError(plainError(e)), onSuccess: () => setCancelError(null) },
                    )
                : undefined
            }
            cancelling={control.isPending}
            cancelError={cancelError}
          />
        )}

        {run && state === "failed" && (
          <Banner
            tone="error"
            title="This research run stopped"
            action={
              canWrite ? (
                <Button size="sm" icon={RotateCcw} onClick={() => runResearch()} loading={start.isPending} loadingLabel="Starting">
                  Run again
                </Button>
              ) : undefined
            }
          >
            {job?.error ?? "The run did not finish."} Earlier runs are kept.
          </Banner>
        )}

        {run && state === "cancelled" && (
          <Banner tone="info" title="This run was cancelled">
            Nothing from it was kept. Run research again when you are ready{anyDone ? ", or pick an earlier run above" : ""}.
          </Banner>
        )}

        {run && state === "done" && guard && guard.needsAttention.length > 0 && <GuardrailNote items={guard.needsAttention} />}

        {run && state === "done" && <DossierView dossier={dossierOf(run)} />}
      </div>

      <Inspector label="Sources" className="lg:sticky lg:top-(--shell-topbar) lg:h-screen-fill">
        <InspectorSection
          title="Sources"
          aside={
            state === "done" && sources.length > 0 ? (
              <span className="num text-small text-ink-secondary">
                {usedCount} of {sources.length} in book
              </span>
            ) : undefined
          }
        >
          {research.isPending ? (
            <div role="status" aria-label="Loading sources" className="grid gap-3">
              {[0, 1].map((i) => (
                <Skeleton key={i} variant="block" className="h-28" />
              ))}
            </div>
          ) : !run ? (
            <p className="text-small text-ink-secondary">No sources yet. They appear here when a research run finishes.</p>
          ) : state === "running" ? (
            <p className="text-small text-ink-secondary">Sources appear here when this run finishes.</p>
          ) : sources.length === 0 ? (
            <p className="text-small text-ink-secondary">
              {state === "done" ? "This run cited no sources. The writer will not add references for it." : "This run kept no sources."}
            </p>
          ) : (
            <ul className="grid gap-3">
              {sources.map((src, i) => (
                <ApiSourceCard key={src.id} bookId={bookId} source={src} number={i + 1} />
              ))}
            </ul>
          )}
        </InspectorSection>
        <InspectorSection title="How sources work">
          <p className="text-small text-ink-secondary">
            Only sources the model cites from a live web search are kept. Tick the ones the writer may use; only ticked sources can appear in References.
          </p>
        </InspectorSection>
      </Inspector>

      <Modal
        open={againOpen}
        onClose={() => setAgainOpen(false)}
        title="Run research again"
        description="A new run keeps the old ones. You can switch between runs above the dossier."
        footer={
          <>
            <Button variant="ghost" onClick={() => setAgainOpen(false)}>
              Cancel
            </Button>
            <Button
              icon={RotateCcw}
              estimate={estimateWords(estimate.data)}
              onClick={() => {
                setAgainOpen(false);
                runResearch(hint.trim() || undefined);
                setHint("");
              }}
            >
              Run research
            </Button>
          </>
        }
      >
        <Textarea
          label="Who the book is for (optional)"
          rows={3}
          value={hint}
          maxLength={2000}
          onChange={(e) => setHint(e.target.value)}
          hint="For example: newly qualified nurses on their first night shifts."
        />
        {estimate.data?.model && (
          <p className="mt-3 text-small text-ink-secondary">
            Researched by <ModelName slug={estimate.data.model} className="text-ink" />, {estimateWords(estimate.data)}.
          </p>
        )}
      </Modal>
    </div>
  );
}

/* ---------- Run header ---------- */

function RunHeader({
  runs,
  runId,
  onRunChange,
  state,
  model,
  cost,
  at,
}: {
  runs: ApiResearchRun[];
  runId: string | null;
  onRunChange: (id: string) => void;
  state: RunState;
  model: string | null;
  cost: number | null;
  at: number;
}) {
  const running = state === "running";
  return (
    <div className="grid gap-4 rounded-md border border-border bg-sheet px-5 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
      <dl className="grid grid-cols-2 gap-x-8 gap-y-3 sm:flex sm:flex-wrap">
        <div className="grid gap-1">
          <dt className="text-small text-ink-secondary">Model</dt>
          <dd className="text-label text-ink">
            {model ? <ModelName slug={model} /> : <span className="text-ink-tertiary">{running ? "Not known yet" : "Not recorded"}</span>}
          </dd>
        </div>
        <div className="grid gap-1">
          <dt className="text-small text-ink-secondary">{running ? "Cost so far" : "Cost"}</dt>
          <dd className="num text-label text-ink">{cost === null ? <span className="text-ink-tertiary">Not recorded</span> : formatUsd(cost)}</dd>
        </div>
        <div className="grid gap-1">
          <dt className="text-small text-ink-secondary">{running ? "Started" : "Finished"}</dt>
          <dd className="num text-label text-ink">{whenMs(at)}</dd>
        </div>
        <div className="grid gap-1">
          <dt className="text-small text-ink-secondary">Status</dt>
          <dd className="flex items-center gap-1.5 text-label text-ink">
            {running ? (
              <>
                <LiveDot /> Running
              </>
            ) : state === "done" ? (
              <>
                <Check size={14} strokeWidth={2} aria-hidden className="text-success" /> Done
              </>
            ) : state === "failed" ? (
              <>
                <CircleAlert size={14} strokeWidth={2} aria-hidden className="text-claim" /> Stopped
              </>
            ) : (
              <>
                <X size={14} strokeWidth={2} aria-hidden className="text-ink-tertiary" /> Cancelled
              </>
            )}
          </dd>
        </div>
      </dl>
      {runs.length > 1 && (
        <Select
          className="sm:w-[260px]"
          label="Run"
          value={runId}
          onChange={onRunChange}
          options={runs.map((r, i) => ({
            value: r.id,
            label: `Run ${runs.length - i}, ${whenMs(r.createdAt)}`,
            hint: r.status === "done" ? "Done" : r.status === "failed" ? "Stopped" : "Not finished",
          }))}
          disabled={running}
        />
      )}
    </div>
  );
}

/* ---------- Running ---------- */

function LivePanel({
  job,
  onCancel,
  cancelling,
  cancelError,
}: {
  job: StageJob | undefined;
  onCancel: (() => void) | undefined;
  cancelling: boolean;
  cancelError: string | null;
}) {
  const progress = job?.progress ?? 0;
  const message = job?.status === "queued" || !job ? "Waiting to start" : (job.message ?? "Researching");
  return (
    <section aria-labelledby="live-heading" className="relative overflow-hidden rounded-lg border border-border bg-sheet px-5 py-5 shadow-sheet sm:px-6">
      <span aria-hidden className="absolute inset-y-0 left-0 w-[3px] bg-accent" />
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="grid gap-1">
          <p className="flex items-center gap-2 text-small font-semibold text-accent-text">
            <LiveDot /> Researching now
          </p>
          <h2 id="live-heading" className="font-book text-heading text-ink">
            {message}
          </h2>
        </div>
        {onCancel && (
          <Button variant="ghost" icon={X} onClick={onCancel} loading={cancelling} loadingLabel="Cancelling">
            Cancel run
          </Button>
        )}
      </div>
      <ProgressBar
        className="mt-4"
        value={Math.round(progress * 100)}
        max={100}
        live
        label="Research progress"
        valueText={`${Math.round(progress * 100)} per cent`}
      />
      <p className="num mt-2 text-small text-ink-secondary">{Math.round(progress * 100)}% done. The dossier appears here when the run finishes.</p>
      {cancelError && (
        <p role="alert" className="mt-2 text-small text-claim">
          {cancelError}
        </p>
      )}
      <p className="sr-only" role="status" aria-live="polite">
        {message}
      </p>
    </section>
  );
}

/* ---------- Dossier ---------- */

function Block({ title, aside, children, className }: { title: string; aside?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn("grid content-start gap-3", className)}>
      <div className="flex items-baseline justify-between gap-3 border-b border-border pb-2">
        <h2 className="font-book text-heading text-ink">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

function None({ children = "None in this run." }: { children?: ReactNode }) {
  return <p className="text-small text-ink-tertiary">{children}</p>;
}

function DossierView({ dossier: d }: { dossier: Dossier }) {
  const audience = [d.audience.who, d.audience.situation, d.audience.level ? `Level: ${d.audience.level}` : ""].filter(Boolean);
  return (
    <div className="grid gap-10">
      <Block title="Audience">
        {audience.length === 0 ? (
          <None />
        ) : (
          <p className="max-w-[68ch] font-book text-prose-sm text-ink">{audience.map((x) => (/[.!?]$/.test(x) ? x : `${x}.`)).join(" ")}</p>
        )}
      </Block>

      <Block title="Reader pains" aside={<span className="num text-small text-ink-tertiary">{d.problems.length}</span>}>
        {d.problems.length === 0 ? (
          <None />
        ) : (
          <ol className="grid gap-px overflow-hidden rounded-md border border-border bg-border">
            {d.problems.map((p, i) => (
              <li key={`${i}-${p}`} className="flex gap-3 bg-sheet px-4 py-3">
                <span className="num w-4 shrink-0 text-small text-ink-tertiary">{i + 1}</span>
                <span className="text-body text-ink">{p}</span>
              </li>
            ))}
          </ol>
        )}
      </Block>

      <Block title="Angles">
        {d.angles.length === 0 ? (
          <None />
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2">
            {d.angles.map((a, i) => (
              <li key={`${i}-${a.angle}`} className="grid content-start gap-1.5 rounded-md border border-border bg-sheet p-4">
                <h3 className="font-book text-[18px] leading-6 font-medium text-ink">{a.angle}</h3>
                {a.why && <p className="text-body text-ink-secondary">{a.why}</p>}
              </li>
            ))}
          </ul>
        )}
      </Block>

      <div className="grid gap-10 md:grid-cols-2">
        <Block title="Competing themes">
          {d.competing.length === 0 ? (
            <None />
          ) : (
            <ul className="grid gap-2.5">
              {d.competing.map((t, i) => (
                <li key={`${i}-${t}`} className="border-l-2 border-border-strong pl-3 text-body text-ink">
                  {t}
                </li>
              ))}
            </ul>
          )}
        </Block>
        <Block title="Gaps this book can fill">
          {d.gaps.length === 0 ? (
            <None />
          ) : (
            <ul className="grid gap-2.5">
              {d.gaps.map((g, i) => (
                <li key={`${i}-${g}`} className="border-l-2 border-select pl-3 text-body text-ink">
                  {g}
                </li>
              ))}
            </ul>
          )}
        </Block>
      </div>

      <Block title="Keyword ideas" aside={<span className="text-small text-ink-tertiary">Starting points for the 7 KDP keywords</span>}>
        {d.keywords.length === 0 ? (
          <None />
        ) : (
          <ul className="flex flex-wrap gap-2">
            {d.keywords.map((k) => (
              <li key={k} className="inline-flex h-[30px] items-center rounded-pill border border-border bg-sheet px-3 text-[13px] text-ink">
                {k}
              </li>
            ))}
          </ul>
        )}
      </Block>

      {d.notes && (
        <Block title="Researcher's notes">
          <p className="max-w-[68ch] text-body text-ink-secondary">{d.notes}</p>
        </Block>
      )}
    </div>
  );
}

function DossierSkeleton() {
  return (
    <div role="status" aria-label="Loading the research dossier" className="grid gap-8">
      <div className="grid gap-2 rounded-md border border-border bg-sheet p-5">
        <Skeleton className="w-40" />
        <Skeleton className="w-full" />
        <Skeleton className="w-10/12" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {[0, 1].map((i) => (
          <div key={i} className="grid gap-2 rounded-md border border-border bg-sheet p-4">
            <Skeleton className="w-1/2" />
            <Skeleton className="w-full" />
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------- Source card ---------- */

function ApiSourceCard({ bookId, source, number }: { bookId: string; source: SourceView; number: number }) {
  const canWrite = useCanWrite();
  const setUse = useSetSourceUse();
  const [optimistic, setOptimistic] = useState<boolean | null>(null);
  const checked = optimistic ?? source.useInBook;
  return (
    <li id={`source-${source.id}`} className="grid gap-2 rounded-md border border-border bg-sheet px-4 pt-3.5 pb-1.5">
      <div className="flex items-start gap-3">
        <span className="num mt-0.5 grid size-6 shrink-0 place-items-center rounded-xs bg-sunken text-caption text-ink-secondary">{number}</span>
        <div className="grid min-w-0 gap-1">
          <p className="text-[14px] leading-5 font-semibold [overflow-wrap:anywhere] text-ink">{source.title}</p>
          <p className="flex min-w-0 items-center gap-1.5 text-small text-ink-secondary">
            <Globe size={14} strokeWidth={2} aria-hidden className="shrink-0 text-ink-tertiary" />
            {source.unresolved ? (
              <span className="text-accent-text">Real page unknown: the link is still a search redirect</span>
            ) : (
              <span className="[overflow-wrap:anywhere]">{source.domain}</span>
            )}
          </p>
        </div>
      </div>
      {source.excerpt && <p className="ml-9 text-small text-ink-secondary [overflow-wrap:anywhere]">{source.excerpt}</p>}
      <div className="ml-6 flex flex-wrap items-center justify-between gap-x-3">
        <Checkbox
          label="Use in book"
          checked={checked}
          disabled={setUse.isPending || !canWrite}
          onChange={(v) => {
            setOptimistic(v);
            setUse.mutate({ bookId, sourceId: source.id, useInBook: v }, { onSettled: () => setOptimistic(null) });
          }}
        />
        <a href={source.url} target="_blank" rel="noreferrer noopener" className={buttonClasses("ghost", "sm")}>
          <ExternalLink size={16} aria-hidden />
          {source.unresolved ? "Open link" : "Open source"}
          <span className="sr-only">, {source.unresolved ? "search redirect link" : source.domain}, opens in a new tab</span>
        </a>
      </div>
      {setUse.isError && (
        <p role="alert" className="ml-9 pb-2 text-small text-claim">
          {plainError(setUse.error)}
        </p>
      )}
    </li>
  );
}
