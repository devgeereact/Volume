import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useCanWrite } from "../../lib/access";
import { useSearchParams } from "react-router";
import { Check, RotateCcw, Search, X } from "lucide-react";
import {
  Banner,
  Button,
  EmptyState,
  Card,
  LiveDot,
  Loader,
  PageHeader,
  ModelName,
  ProgressBar,
  StatusChip,
  Select,
  Skeleton,
  StreamText,
} from "../../components/ui";
import { calmWardResearch, getModel, nightShiftResearchStatus, type Book, type ResearchSource } from "../../demo";
import { DEMO_NOW } from "../../demo/books";
import { cn } from "../../lib/cn";
import { scrollBehavior } from "../../lib/motion";
import { formatModel, formatRelative, formatUsd } from "../../lib/format";
import { useStepAction } from "../../lib/stepAction";
import { useBook } from "../../lib/useBook";
import { bookStepPath } from "../../screens";
import { NotFound } from "../../shell/NotFound";
import { DemoStates, useScreenState, type ScreenState } from "./DemoStates";
import { audienceChunks, citations, plainSource, runSteps, secondRun, type RunRecord } from "./researchExtras";
import { ResearchApi } from "./ResearchApi";
import { RunModelModal } from "./RunModelModal";
import { SourceCard } from "./SourceCard";
import { NoSourceMatch, ResearchCounts, SourceFilterBar, sourceMatches, useSourceFilter, type SourceFilterState } from "./SourceTools";
import { about, estimateFor, useSimulatedRun, type RunPlan } from "./sim";

/* Research screen (docs/03-design/UX-SPEC.md, M4; approved Volume Studio design, stResearch).
   States: running (the live card with its steps and the sources found so far beside it), the dossier
   as cards (counts, audience and reader pains, angles, themes, gaps, keyword ideas), the Sources card
   with "use in book" ticks, filter and search, empty, loading and error with retry. */

export default function ResearchPage() {
  const { book, apiBook } = useBook();
  if (!book) return <NotFound what="book" />;
  if (apiBook) return <ResearchApi key={book.id} book={book} apiBook={apiBook} />;
  return <Research key={book.id} book={book} />;
}

const BASE = calmWardResearch;
const RUN_MS = 6400;

const firstRun: RunRecord = { id: BASE.id, number: 1, at: BASE.at, model: BASE.model, costUsd: BASE.costUsd };

function Research({ book }: { book: Book }) {
  const canWrite = useCanWrite();
  const hasDossier = book.id === "the-calm-ward";
  const isNightShift = book.id === "night-shift-survival";
  const [params] = useSearchParams();
  // Arriving from the wizard (?run=new) starts a fresh run, so the demo dossier's first run is not shown.
  const freshRun = params.get("run") === "new" && hasDossier;
  const [screen, setScreen] = useScreenState(hasDossier ? "ready" : "empty");
  const [runs, setRuns] = useState<RunRecord[]>(hasDossier && !freshRun ? [firstRun] : []);
  const [runId, setRunId] = useState<string | null>(hasDossier && !freshRun ? firstRun.id : null);
  const [pendingModel, setPendingModel] = useState(BASE.model);
  const [modalOpen, setModalOpen] = useState(false);
  const [uses, setUses] = useState<Record<string, boolean>>(() => Object.fromEntries(BASE.sources.map((s) => [s.id, s.useInBook])));
  const [highlight, setHighlight] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const estimateRef = useRef(BASE.costUsd);

  const sim = useSimulatedRun(() => {
    const number = runs.length + 1;
    const record: RunRecord = { id: `run-${number}`, number, at: DEMO_NOW, model: pendingModel, costUsd: estimateRef.current };
    setRuns((r) => [...r, record]);
    setRunId(record.id);
    setScreen("ready");
  });

  // Night Shift Survival is mid-run in the demo data: show its live state on arrival.
  // Arriving from the wizard (?run=new) starts a fresh run.
  useEffect(() => {
    if (isNightShift) {
      sim.start({ durationMs: 9000, costUsd: 0.62, steps: nightShiftResearchStatus, holdAt: 0.45 });
    } else if (freshRun) {
      startRun(BASE.model);
    }
    // Runs once on arrival: the page is keyed by book, and a later ?run=new must not restart the run.
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function startRun(slug: string, failAt?: number) {
    const estimate = estimateFor(BASE.costUsd, BASE.model, slug);
    estimateRef.current = estimate;
    setPendingModel(slug);
    const plan: RunPlan = { durationMs: RUN_MS, costUsd: estimate, steps: runSteps, failAt };
    sim.start(plan);
  }

  // Error preview: a run that stops part way through.
  const shownState: ScreenState | "running" = sim.status === "running" ? "running" : sim.status === "failed" ? "error" : screen;

  const run = runs.find((r) => r.id === runId) ?? null;
  const later = run !== null && run.number > 1;
  const keywordIdeas = later ? secondRun.keywordIdeas : BASE.keywordIdeas;
  const gaps = later ? [...BASE.gaps, secondRun.extraGap] : BASE.gaps;
  const sourceNumber = useMemo(() => new Map(BASE.sources.map((s, i) => [s.id, i + 1])), []);
  const usedCount = Object.values(uses).filter(Boolean).length;
  const filter = useSourceFilter();

  function showSource(id: string) {
    setHighlight(id);
    // A citation always leads to its source, so a filter that hides it is cleared first.
    if (filter.active) filter.clear();
    requestAnimationFrame(() => {
      const el = document.getElementById(`source-${id}`);
      el?.scrollIntoView({ block: "nearest", behavior: scrollBehavior() });
      el?.focus({ preventScroll: true });
    });
  }
  function showCitation(anchor: string) {
    setFlash(anchor);
    const el = document.getElementById(`cite-${anchor}`);
    el?.scrollIntoView({ block: "center", behavior: scrollBehavior() });
    el?.focus({ preventScroll: true });
  }

  const titlesPath = bookStepPath(book.id, "titles");
  const canContinue = shownState === "ready" && hasDossier;
  const model = getModel(run?.model ?? pendingModel);

  // The one gilt button lives in the step footer (D-016).
  useStepAction({
    label: "Continue to titles",
    to: titlesPath,
    disabledReason: canContinue ? undefined : shownState === "running" ? "Research is still running." : "Research needs to finish first.",
  });

  const actions =
    canWrite && (shownState === "ready" || shownState === "error") && hasDossier ? (
      <Button icon={RotateCcw} estimate={about(BASE.costUsd)} onClick={() => setModalOpen(true)}>
        Run again
      </Button>
    ) : undefined;

  return (
    <div className="grid gap-4 px-4 min-[861px]:px-6">
      <PageHeader
        title="Research"
        summary="Who the book is for, what they struggle with, and where it fits. Sources are cited, never invented."
        actions={actions}
      />

      {shownState !== "empty" && shownState !== "loading" && shownState !== "running" && run && (
        <RunHeader runs={runs} runId={runId} onRunChange={setRunId} running={false} modelSlug={run.model} cost={run.costUsd} at={run.at} />
      )}

      {shownState === "loading" && <DossierSkeleton />}

      {shownState === "empty" && (
        <EmptyState
          drawing="search"
          title="Research has not run yet"
          body={`The researcher searches the web, reads the sources it cites and writes up the audience, their problems and the gaps. It takes about a minute with ${model ? formatModel(model.slug) : "the research model"}.`}
          action={
            canWrite ? (
              <Button icon={Search} estimate={about(BASE.costUsd)} onClick={() => startRun(BASE.model)}>
                Run research
              </Button>
            ) : undefined
          }
        />
      )}

      {shownState === "error" && (
        <Banner
          tone="error"
          title="The research run stopped part way"
          action={
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                icon={RotateCcw}
                onClick={() => {
                  sim.reset();
                  startRun(pendingModel);
                }}
              >
                Retry
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setModalOpen(true)}>
                Pick another model
              </Button>
            </div>
          }
        >
          OpenRouter did not answer in time. Nothing was charged, and the last finished run is kept.
        </Banner>
      )}

      {shownState === "running" && (
        <div className="grid items-start gap-4 min-[1180px]:grid-cols-[minmax(0,1fr)_320px]">
          <div className="grid min-w-0 gap-4">
            <LivePanel
              step={sim.step}
              steps={isNightShift ? nightShiftResearchStatus : runSteps}
              progress={sim.progress}
              cost={sim.cost}
              estimate={isNightShift ? 0.62 : estimateRef.current}
              onCancel={isNightShift ? undefined : () => sim.cancel()}
            />
            {hasDossier && <StreamedFindings progress={sim.progress} />}
          </div>
          <aside aria-label="Sources" className="vol-glass grid min-w-0 content-start gap-3 rounded-card p-[18px]">
            <h2 className="text-[14px] font-bold text-ink">Run</h2>
            <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3.5 gap-y-2 text-[13px]">
              <dt className="text-ink-3">Model</dt>
              <dd className="text-right font-medium text-ink">
                <ModelName slug={pendingModel} />
              </dd>
              <dt className="text-ink-3">Spent</dt>
              <dd className="num text-right font-medium text-ink" aria-live="off">
                {formatUsd(sim.cost)}
              </dd>
              <dt className="text-ink-3">Started</dt>
              <dd className="num text-right font-medium text-ink">{formatRelative(DEMO_NOW)}</dd>
            </dl>
            <h3 className="mt-2 text-[14px] font-bold text-ink">Sources so far</h3>
            <SourcesPane
              state={shownState}
              hasDossier={hasDossier}
              progress={sim.progress}
              uses={uses}
              onUse={(id, v) => setUses((u) => ({ ...u, [id]: v }))}
              highlight={highlight}
              onShowCitation={showCitation}
              filter={filter}
            />
          </aside>
        </div>
      )}

      {shownState === "ready" && hasDossier && (
        <ResearchCounts
          items={[
            { label: "Sources read", value: BASE.sources.length },
            { label: "Used in the book", value: usedCount },
            { label: "Reader pains", value: BASE.problems.length },
            { label: "Angles", value: BASE.angles.length },
            { label: "Keyword ideas", value: keywordIdeas.length },
          ]}
        />
      )}

      {shownState === "ready" && hasDossier && (
        <Dossier keywordIdeas={keywordIdeas} gaps={gaps} sourceNumber={sourceNumber} onCite={showSource} flash={flash} />
      )}

      {shownState === "ready" && hasDossier && (
        <Card as="section" aria-labelledby="sources-heading" className="grid gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="sources-heading" className="flex items-center gap-2 text-[15px] font-bold text-ink">
              Sources
              <span className="num text-small font-medium text-ink-3">
                {usedCount} of {BASE.sources.length} used
              </span>
            </h2>
            <p className="text-small text-ink-2">Only sources cited from a live web search are kept. Only ticked ones can appear in References.</p>
          </div>
          <SourcesPane
            state={shownState}
            hasDossier={hasDossier}
            progress={sim.progress}
            uses={uses}
            onUse={(id, v) => setUses((u) => ({ ...u, [id]: v }))}
            highlight={highlight}
            onShowCitation={showCitation}
            filter={filter}
          />
        </Card>
      )}

      {shownState === "ready" && !hasDossier && (
        <Banner tone="success" title="Research finished">
          The dossier for {book.title} is saved with this run. Run it again with another model at any time; earlier runs are kept.
        </Banner>
      )}

      {hasDossier && (
        <DemoStates
          value={screen}
          onChange={(s) => {
            sim.reset();
            if (s === "ready" && runs.length === 0) {
              setRuns([firstRun]);
              setRunId(firstRun.id);
            }
            setScreen(s);
            if (s === "error") startRun(pendingModel, 0.4);
          }}
        />
      )}

      <RunModelModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Run research again"
        description="A new run keeps the old ones. You can switch between runs above the dossier."
        confirmLabel="Run research"
        baseUsd={BASE.costUsd}
        baseSlug={BASE.model}
        initialSlug={pendingModel === BASE.model ? "~google/gemini-flash-latest" : pendingModel}
        requireWebSearch
        instructionHint="For example: more on night shifts, or on healthcare assistants."
        onConfirm={(slug) => {
          setModalOpen(false);
          setScreen("ready");
          startRun(slug);
        }}
      />
    </div>
  );
}

/* ---------- Run header ---------- */

function RunHeader({
  runs,
  runId,
  onRunChange,
  running,
  modelSlug,
  cost,
  at,
}: {
  runs: RunRecord[];
  runId: string | null;
  onRunChange: (id: string) => void;
  running: boolean;
  modelSlug: string;
  cost: number;
  at: string;
}) {
  return (
    <div className="vol-glass grid gap-4 rounded-card px-[18px] py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
      <dl className="grid grid-cols-2 gap-x-8 gap-y-3 sm:flex sm:flex-wrap">
        <div className="grid gap-1">
          <dt className="text-small text-ink-secondary">Model</dt>
          <dd className="text-label text-ink">
            <ModelName slug={modelSlug} />
          </dd>
        </div>
        <div className="grid gap-1">
          <dt className="text-small text-ink-secondary">{running ? "Cost so far" : "Cost"}</dt>
          <dd className="num text-label text-ink" aria-live={running ? "off" : undefined}>
            {formatUsd(cost)}
          </dd>
        </div>
        <div className="grid gap-1">
          <dt className="text-small text-ink-secondary">{running ? "Started" : "Finished"}</dt>
          <dd className="num text-label text-ink">{formatRelative(at)}</dd>
        </div>
        <div className="grid gap-1">
          <dt className="text-small text-ink-secondary">Status</dt>
          <dd className="flex items-center gap-1.5 text-label text-ink">
            {running ? (
              <>
                <LiveDot /> Running
              </>
            ) : (
              <>
                <Check size={14} strokeWidth={2} aria-hidden className="text-success" /> Done
              </>
            )}
          </dd>
        </div>
      </dl>
      {runs.length > 0 && (
        <Select
          className="sm:w-[260px]"
          label="Run"
          value={runId}
          onChange={onRunChange}
          options={[...runs].reverse().map((r) => ({
            value: r.id,
            label: `Run ${r.number}, ${formatRelative(r.at)}`,
            hint: formatUsd(r.costUsd),
          }))}
          disabled={running}
        />
      )}
    </div>
  );
}

/* ---------- Running ---------- */

function LivePanel({
  step,
  steps,
  progress,
  cost,
  estimate,
  onCancel,
}: {
  step: number;
  steps: string[];
  progress: number;
  cost: number;
  estimate: number;
  onCancel: (() => void) | undefined;
}) {
  return (
    <section aria-labelledby="live-heading" className="vol-glass rounded-card p-[18px]">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="grid gap-1">
          <p className="flex items-center gap-2">
            <StatusChip status="writing">Live</StatusChip>
          </p>
          <h2 id="live-heading" className="text-[15px] font-bold text-ink">
            {steps[step]}
          </h2>
        </div>
        {onCancel && (
          <Button variant="ghost" icon={X} onClick={onCancel}>
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
        valueText={`${formatUsd(cost)} so far, ${about(estimate)} in all`}
      />
      <ol className="mt-4 grid gap-1.5 sm:grid-cols-2" aria-label="Run steps">
        {steps.map((s, i) => (
          <li
            key={s}
            className={cn("flex items-center gap-2 text-small", i < step ? "text-ink-secondary" : i === step ? "font-semibold text-ink" : "text-ink-tertiary")}
          >
            {i < step ? (
              <Check size={14} strokeWidth={2} aria-hidden className="text-success" />
            ) : i === step ? (
              <Loader />
            ) : (
              <span aria-hidden className="size-3.5 rounded-full border border-border-strong" />
            )}
            {s}
            <span className="sr-only">{i < step ? ", done" : i === step ? ", in progress" : ", waiting"}</span>
          </li>
        ))}
      </ol>
      <p className="sr-only" role="status" aria-live="polite">
        {steps[step]}
      </p>
    </section>
  );
}

function StreamedFindings({ progress }: { progress: number }) {
  const chunks = useMemo(() => audienceChunks(BASE.audience), []);
  // Audience streams from 35% to 65% of the run; pains arrive after that.
  const share = Math.max(0, Math.min(1, (progress - 0.35) / 0.3));
  const shown = chunks.slice(0, Math.ceil(share * chunks.length));
  const painsShown = progress < 0.62 ? 0 : Math.min(BASE.problems.length, Math.ceil(((progress - 0.62) / 0.2) * BASE.problems.length));
  return (
    <div className="grid gap-6">
      <DossierBlock title="Audience">
        {shown.length === 0 ? (
          <div role="status" aria-label="Waiting for the audience" className="grid gap-2">
            <Skeleton className="w-11/12" />
            <Skeleton className="w-9/12" />
          </div>
        ) : (
          <StreamText chunks={shown} live={share < 1} size="prose-sm" className="max-w-[68ch]" />
        )}
      </DossierBlock>
      <DossierBlock title="Reader pains">
        {painsShown === 0 ? (
          <div role="status" aria-label="Waiting for reader pains" className="grid gap-2">
            <Skeleton className="w-10/12" />
            <Skeleton className="w-8/12" />
            <Skeleton className="w-9/12" />
          </div>
        ) : (
          <ul className="grid gap-2">
            {BASE.problems.slice(0, painsShown).map((p) => (
              <li key={p} className="animate-ink-in text-body text-ink">
                {p}
              </li>
            ))}
          </ul>
        )}
      </DossierBlock>
    </div>
  );
}

/* ---------- Dossier ---------- */

function DossierBlock({ title, aside, children, className }: { title: string; aside?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <Card as="section" className={cn("grid content-start gap-3", className)}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-[15px] font-bold text-ink">{title}</h2>
        {aside}
      </div>
      {children}
    </Card>
  );
}

function CiteMarks({ anchor, sourceNumber, onCite }: { anchor: string; sourceNumber: Map<string, number>; onCite: (id: string) => void }) {
  const ids = citations[anchor];
  if (!ids || ids.length === 0) return null;
  return (
    <span className="ml-1 inline-flex gap-0.5 align-super">
      {ids.map((id) => {
        const n = sourceNumber.get(id);
        const src = BASE.sources.find((s) => s.id === id);
        return (
          <button
            key={id}
            type="button"
            onClick={() => onCite(id)}
            aria-label={`Source ${n}: ${src ? plainSource(src).publisher : ""}`}
            className="hit-44 num grid h-4 min-w-4 place-items-center rounded-xs bg-select-wash px-1 font-ui text-[11px] leading-none font-semibold text-select hover:bg-select hover:text-sheet"
          >
            {n}
          </button>
        );
      })}
    </span>
  );
}

function Cited({
  anchor,
  flash,
  children,
  as = "li",
  className,
  n,
}: {
  anchor: string;
  flash: string | null;
  children: ReactNode;
  as?: "li" | "div";
  className?: string;
  /** A number drawn before the item (angles). */
  n?: number;
}) {
  const Tag = as;
  return (
    <Tag
      id={`cite-${anchor}`}
      data-n={n}
      tabIndex={-1}
      className={cn("rounded-xs transition-colors duration-(--vol-dur-base)", flash === anchor && "bg-select-wash", className)}
    >
      {children}
    </Tag>
  );
}

function Dossier({
  keywordIdeas,
  gaps,
  sourceNumber,
  onCite,
  flash,
}: {
  keywordIdeas: string[];
  gaps: string[];
  sourceNumber: Map<string, number>;
  onCite: (id: string) => void;
  flash: string | null;
}) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <DossierBlock title="Audience">
        <Cited anchor="audience" flash={flash} as="div">
          <p className="max-w-[68ch] text-[14.5px] leading-[1.6] text-ink">
            {BASE.audience}
            <CiteMarks anchor="audience" sourceNumber={sourceNumber} onCite={onCite} />
          </p>
        </Cited>
      </DossierBlock>

      <DossierBlock title="Reader pains" aside={<span className="num text-small text-ink-tertiary">{BASE.problems.length}</span>}>
        <ol className="grid gap-1.5">
          {BASE.problems.map((p, i) => (
            <Cited key={p} anchor={`pain-${i}`} flash={flash} className="flex gap-3 rounded-control bg-soft px-3 py-2.5">
              <span className="num w-4 shrink-0 text-small text-ink-3">{i + 1}</span>
              <span className="text-[13.5px] text-ink">
                {p}
                <CiteMarks anchor={`pain-${i}`} sourceNumber={sourceNumber} onCite={onCite} />
              </span>
            </Cited>
          ))}
        </ol>
      </DossierBlock>

      <DossierBlock title="Angles">
        <ol className="grid gap-2.5">
          {BASE.angles.map((a, i) => (
            <Cited
              key={a.title}
              anchor={`angle-${i}`}
              flash={flash}
              className="grid grid-cols-[26px_minmax(0,1fr)] gap-x-2.5 gap-y-0.5 before:row-span-2 before:grid before:size-[26px] before:place-items-center before:rounded-[8px] before:bg-mint-wash before:text-[12px] before:font-bold before:text-mint-ink before:content-[attr(data-n)]"
              n={i + 1}
            >
              <h3 className="text-[13.5px] font-bold text-ink">
                {a.title}
                <CiteMarks anchor={`angle-${i}`} sourceNumber={sourceNumber} onCite={onCite} />
              </h3>
              <p className="text-[13px] leading-normal text-ink-2">{a.detail}</p>
            </Cited>
          ))}
        </ol>
      </DossierBlock>

      <DossierBlock title="Competing themes">
        <ul className="grid gap-2.5">
          {BASE.competingThemes.map((t, i) => (
            <Cited key={t} anchor={`theme-${i}`} flash={flash} className="border-l-2 border-border-strong pl-3 text-body text-ink">
              {t}
              <CiteMarks anchor={`theme-${i}`} sourceNumber={sourceNumber} onCite={onCite} />
            </Cited>
          ))}
        </ul>
      </DossierBlock>
      <DossierBlock title="Gaps this book can fill">
        <ul className="grid gap-2.5">
          {gaps.map((g, i) => (
            <Cited key={g} anchor={`gap-${i}`} flash={flash} className="border-l-2 border-select pl-3 text-body text-ink">
              {g}
              <CiteMarks anchor={`gap-${i}`} sourceNumber={sourceNumber} onCite={onCite} />
            </Cited>
          ))}
        </ul>
      </DossierBlock>

      <DossierBlock title="Keyword ideas" aside={<span className="text-small text-ink-tertiary">Starting points for the 7 KDP keywords</span>}>
        <ul className="flex flex-wrap gap-2">
          {keywordIdeas.map((k) => (
            <li key={k} className="inline-flex items-center rounded-pill bg-mint-wash px-2.5 py-1 text-[12px] text-mint-ink">
              {k}
            </li>
          ))}
        </ul>
      </DossierBlock>
    </div>
  );
}

function DossierSkeleton() {
  return (
    <div role="status" aria-label="Loading the research dossier" className="grid gap-4">
      <div className="vol-glass grid gap-2 rounded-card p-[18px]">
        <Skeleton className="w-40" />
        <Skeleton className="w-full" />
        <Skeleton className="w-10/12" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="vol-glass grid gap-2 rounded-card p-[18px]">
            <Skeleton className="w-1/2" />
            <Skeleton className="w-full" />
            <Skeleton className="w-9/12" />
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------- Sources pane ---------- */

function SourcesPane({
  state,
  hasDossier,
  progress,
  uses,
  onUse,
  highlight,
  onShowCitation,
  filter,
}: {
  state: ScreenState | "running";
  hasDossier: boolean;
  progress: number;
  uses: Record<string, boolean>;
  onUse: (id: string, v: boolean) => void;
  highlight: string | null;
  onShowCitation: (anchor: string) => void;
  filter: SourceFilterState;
}) {
  if (state === "loading") {
    return (
      <div role="status" aria-label="Loading sources" className="grid gap-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} variant="block" className="h-28" />
        ))}
      </div>
    );
  }
  if (state === "empty" || (!hasDossier && state !== "running")) {
    return <p className="text-small text-ink-secondary">No sources yet. They appear here as the research run reads them.</p>;
  }
  if (state === "error") {
    return <p className="text-small text-ink-secondary">This run kept no sources. Retry, or pick another model with web search.</p>;
  }
  const list: ResearchSource[] = BASE.sources;
  const shown = state === "running" ? Math.min(list.length, Math.floor(Math.max(0, progress - 0.25) / 0.05)) : list.length;
  const ready = state === "ready";
  const used = list.filter((s) => uses[s.id]).length;
  // Numbers stay those of the full list, so a filtered card keeps the number the dossier cites.
  const visible = list
    .slice(0, shown)
    .map((s, i) => ({ s, number: i + 1 }))
    .filter(({ s }) => !ready || sourceMatches(filter, uses[s.id] ?? false, Object.values(plainSource(s))));
  const cards = (
    <ul className={cn("grid gap-3", ready && "md:grid-cols-2")}>
      {visible.map(({ s, number }) => (
        <SourceCard
          key={s.id}
          source={s}
          number={number}
          useInBook={uses[s.id] ?? false}
          onUseChange={(v) => onUse(s.id, v)}
          highlighted={highlight === s.id}
          onShowCitation={onShowCitation}
        />
      ))}
      {state === "running" && shown < list.length && (
        <li role="status" aria-label="Reading more sources" className="grid gap-2 rounded-md border border-dashed border-border p-4">
          <Skeleton className="w-3/4" />
          <Skeleton className="w-1/2" />
        </li>
      )}
    </ul>
  );
  if (!ready) return cards;
  return (
    <div className="grid gap-3">
      <SourceFilterBar filter={filter} total={list.length} used={used} shown={visible.length} />
      {visible.length === 0 ? <NoSourceMatch filter={filter} /> : cards}
    </div>
  );
}
