import { useState } from "react";
import { ArrowDown, RefreshCw, Sparkles } from "lucide-react";
import {
  Banner,
  Button,
  Chip,
  EmptyState,
  Inspector,
  InspectorSection,
  KeyValueList,
  LiveDot,
  ModelName,
  PageHeader,
  ProgressBar,
  Skeleton,
} from "../../components/ui";
import { stageDefaults, titleOptions, topicDirections, type Book, type TitleOption } from "../../demo";
import { formatUsd } from "../../lib/format";
import { useStepAction } from "../../lib/stepAction";
import { useBook } from "../../lib/useBook";
import { bookStepPath } from "../../screens";
import { NotFound } from "../../shell/NotFound";
import { DemoStates, useScreenState } from "../research/DemoStates";
import { RunModelModal } from "../research/RunModelModal";
import { about, estimateFor, useSimulatedRun } from "../research/sim";
import { TitleCard } from "./TitleCard";
import { TitlesApi } from "./TitlesApi";
import { alternates, checkTitle, directionDetails } from "./titlesExtras";

/* Titles screen (docs/03-design/UX-SPEC.md, M5). Owner: screen agent B.
   Five topic directions, then ten options grouped by direction with a character counter, checks,
   favourites, inline edit, "More like this" per direction and Regenerate all. The chosen option is
   shown once, as the highlighted card; the inspector only points to it. The one primary action,
   Continue to blueprint, sits in the step footer (D-016). */

export default function TitlesPage() {
  const { book, apiBook } = useBook();
  if (!book) return <NotFound what="book" />;
  if (apiBook) return <TitlesApi key={book.id} book={book} apiBook={apiBook} />;
  return <Titles key={book.id} book={book} />;
}

const TITLES_MODEL = stageDefaults.find((s) => s.stage === "titles")?.defaultModel ?? "~anthropic/claude-sonnet-latest";
const RUN_COST = 0.04;
const DIRECTION_COST = 0.01;
const steps = ["Reading the research", "Writing 5 directions", "Writing 10 options", "Checking length, spelling and phrases"];

type Filter = "all" | "favourites" | "valid";

function Titles({ book }: { book: Book }) {
  const hasData = book.id === "the-calm-ward";
  const titleSet = !["idea", "research", "title"].includes(book.stage);
  const [screen, setScreen] = useScreenState(hasData ? "ready" : "empty");
  const [options, setOptions] = useState<TitleOption[]>(titleOptions);
  const [favourites, setFavourites] = useState<Set<string>>(() => new Set(["t-1", "t-5"]));
  const [filter, setFilter] = useState<Filter>("all");
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const [busyDirection, setBusyDirection] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [model, setModel] = useState(TITLES_MODEL);
  const [spent, setSpent] = useState(RUN_COST);
  const [altIndex, setAltIndex] = useState(0);

  const full = useSimulatedRun(() => {
    // Regenerate all: favourites stay, the rest are replaced by new options.
    setOptions((prev) => {
      const kept = prev.filter((o) => favourites.has(o.id));
      const keptIds = new Set(kept.map((o) => o.id));
      const next = alternates.filter((a) => !keptIds.has(a.id)).slice(0, 10 - kept.length);
      setFresh(new Set(next.map((o) => o.id)));
      return [...kept, ...next];
    });
    setSpent((s) => Math.round((s + estimateFor(RUN_COST, TITLES_MODEL, model)) * 100) / 100);
    setScreen("ready");
  });
  const one = useSimulatedRun(() => {
    if (!busyDirection) return;
    const pool = alternates.filter((a) => a.directionId === busyDirection && !options.some((o) => o.id === a.id));
    setOptions((prev) => {
      const out: TitleOption[] = [];
      let used = 0;
      for (const o of prev) {
        if (o.directionId === busyDirection && !favourites.has(o.id) && !o.chosen && pool[used]) {
          out.push(pool[used] as TitleOption);
          used += 1;
        } else out.push(o);
      }
      setFresh(new Set(pool.slice(0, used).map((p) => p.id)));
      return out;
    });
    setSpent((s) => Math.round((s + DIRECTION_COST) * 100) / 100);
    setBusyDirection(null);
    setAltIndex((i) => i + 1);
  });

  const running = full.status === "running";
  const failed = full.status === "failed";
  const shown = running ? "loading" : failed ? "error" : screen;
  const chosen = options.find((o) => o.chosen) ?? null;
  const estimate = estimateFor(RUN_COST, TITLES_MODEL, model);

  function regenerateAll(slug: string) {
    setModel(slug);
    const est = estimateFor(RUN_COST, TITLES_MODEL, slug);
    full.start({ durationMs: 3200, costUsd: est, steps });
  }

  function moreLikeThis(directionId: string) {
    setBusyDirection(directionId);
    one.start({ durationMs: 1800, costUsd: DIRECTION_COST, steps: ["Writing two more options"] });
  }

  function choose(id: string) {
    setOptions((prev) => prev.map((o) => ({ ...o, chosen: o.id === id })));
  }

  function saveEdit(id: string, title: string, subtitle: string) {
    const { checks, invalidReason } = checkTitle(title, subtitle);
    setOptions((prev) => prev.map((o) => (o.id === id ? { ...o, title, subtitle, checks, invalidReason, chosen: invalidReason ? false : o.chosen } : o)));
  }

  function toggleFavourite(id: string) {
    setFavourites((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const visible = options.filter((o) => (filter === "favourites" ? favourites.has(o.id) : filter === "valid" ? !o.invalidReason : true));
  const validCount = options.filter((o) => !o.invalidReason).length;
  const favCount = options.filter((o) => favourites.has(o.id)).length;
  const blueprintPath = bookStepPath(book.id, "blueprint");
  const continueReason =
    shown !== "ready"
      ? "Titles need to finish first."
      : !chosen
        ? "Choose a title first."
        : chosen.invalidReason
          ? "The chosen title has a problem. Edit it first."
          : undefined;

  useStepAction({ label: "Continue to blueprint", to: blueprintPath, disabledReason: continueReason });

  function showChosen() {
    if (!chosen) return;
    if (filter !== "all") setFilter("all");
    requestAnimationFrame(() => {
      const el = document.getElementById(`title-${chosen.id}`);
      el?.scrollIntoView({ block: "center", behavior: "smooth" });
      el?.focus({ preventScroll: true });
    });
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_auto]">
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] content-start gap-8 px-4 py-6 sm:px-8 lg:px-10 lg:py-7">
        <PageHeader
          title="Titles"
          summary="Five directions from the research, ten options to compare. Edit any of them."
          actions={
            shown === "ready" && hasData ? (
              <Button icon={RefreshCw} estimate={about(RUN_COST)} onClick={() => setModalOpen(true)}>
                Regenerate all
              </Button>
            ) : undefined
          }
        />

        {shown === "empty" && hasData && (
          <EmptyState
            drawing="pen"
            title="Generate title options"
            body="The writer reads the research and your idea, then suggests 5 directions and 10 titles with subtitles. Each one is checked for length, spelling and banned phrases."
            action={
              <Button icon={Sparkles} estimate={about(RUN_COST)} onClick={() => regenerateAll(model)}>
                Generate titles
              </Button>
            }
          />
        )}

        {shown === "empty" &&
          !hasData &&
          (titleSet ? (
            <section aria-labelledby="set-title" className="grid max-w-[68ch] gap-2 rounded-md border border-border bg-sheet p-5 sm:p-6">
              <h2 id="set-title" className="text-small font-semibold text-ink-secondary">
                The title is set
              </h2>
              <p className="font-book">
                <span className="block text-[24px] leading-[30px] font-medium text-ink">{book.title}</span>
                {book.subtitle && <span className="mt-1 block text-[16px] leading-[22px] text-ink-secondary italic">{book.subtitle}</span>}
              </p>
              <p className="text-small text-ink-secondary">This title was chosen earlier and is used on the cover, the interior and the listing.</p>
            </section>
          ) : (
            <EmptyState
              drawing="pen"
              title="Generate title options"
              body="Titles are written from the research and your idea: 5 directions and 10 titles with subtitles, each checked for length, spelling and banned phrases."
              action={
                <Button icon={Sparkles} estimate={about(RUN_COST)} disabledReason="Finish research first, or skip it from the Research step.">
                  Generate titles
                </Button>
              }
            />
          ))}

        {shown === "error" && (
          <Banner
            tone="error"
            title="The title run came back incomplete"
            action={
              <Button
                size="sm"
                icon={RefreshCw}
                onClick={() => {
                  full.reset();
                  setScreen("ready");
                  regenerateAll(model);
                }}
              >
                Retry
              </Button>
            }
          >
            Only 6 of 10 options arrived, so none were kept. Nothing was charged. Try again or pick another model.
          </Banner>
        )}

        {shown === "loading" && (
          <section aria-labelledby="titles-live" className="relative overflow-hidden rounded-lg border border-border bg-sheet px-5 py-4 shadow-sheet">
            <span aria-hidden className="absolute inset-y-0 left-0 w-[3px] bg-accent" />
            <p id="titles-live" className="flex items-center gap-2 text-label font-semibold text-ink">
              <LiveDot /> {steps[full.step] ?? "Writing titles"}
            </p>
            <ProgressBar
              className="mt-3"
              value={Math.round(full.progress * 100)}
              max={100}
              live
              label="Title run progress"
              valueText={`${formatUsd(full.cost)} so far, ${about(estimate)} in all. Favourites are kept.`}
            />
          </section>
        )}

        {(shown === "ready" || shown === "loading") && hasData && (
          <section aria-labelledby="directions-heading" className="grid gap-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 id="directions-heading" className="font-book text-heading text-ink">
                Topic directions
              </h2>
              <p className="text-small text-ink-tertiary">From the research angles and gaps</p>
            </div>
            <ol className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
              {topicDirections.map((d, i) => {
                const detail = directionDetails[d.id];
                const count = options.filter((o) => o.directionId === d.id).length;
                const busy = busyDirection === d.id && one.status === "running";
                return (
                  <li key={d.id} className="grid content-start gap-3 rounded-md border border-border bg-sheet p-4">
                    <div className="flex items-baseline gap-2.5">
                      <span className="num text-small text-ink-tertiary">{i + 1}</span>
                      <h3 className="font-book text-[19px] leading-6 font-medium text-ink">{d.name}</h3>
                    </div>
                    <dl className="grid gap-2 text-small">
                      <div className="grid gap-0.5">
                        <dt className="font-semibold text-ink-secondary">Focus</dt>
                        <dd className="text-ink">{d.pitch}</dd>
                      </div>
                      <div className="grid gap-0.5">
                        <dt className="font-semibold text-ink-secondary">Why it works</dt>
                        <dd className="text-ink">{detail?.why}</dd>
                      </div>
                      <div className="grid gap-0.5">
                        <dt className="font-semibold text-ink-secondary">Readers</dt>
                        <dd className="text-ink">{detail?.readers}</dd>
                      </div>
                    </dl>
                    <div className="flex items-center justify-between gap-2 border-t border-border pt-3">
                      <span className="num text-small text-ink-tertiary">{count} options</span>
                      <Button
                        size="sm"
                        variant="ghost"
                        icon={RefreshCw}
                        loading={busy}
                        loadingLabel="Writing"
                        estimate={about(DIRECTION_COST)}
                        disabledReason={shown === "loading" ? "Wait for the current run." : undefined}
                        onClick={() => moreLikeThis(d.id)}
                      >
                        More like this
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ol>
          </section>
        )}

        {shown === "loading" && (
          <div role="status" aria-label="Writing title options" className="grid gap-3 md:grid-cols-2">
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="grid gap-3 rounded-md border border-border bg-sheet p-5">
                <Skeleton className="w-24" />
                <Skeleton className="h-6 w-3/4" />
                <Skeleton className="w-full" />
                <Skeleton className="w-1/2" />
              </div>
            ))}
          </div>
        )}

        {shown === "ready" && hasData && (
          <section aria-labelledby="options-heading" className="grid gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 id="options-heading" className="font-book text-heading text-ink">
                Title options
              </h2>
              <div className="flex flex-wrap gap-2" role="group" aria-label="Show">
                <Chip pressed={filter === "all"} count={options.length} onClick={() => setFilter("all")}>
                  All
                </Chip>
                <Chip pressed={filter === "favourites"} count={favCount} onClick={() => setFilter("favourites")}>
                  Favourites
                </Chip>
                <Chip pressed={filter === "valid"} count={validCount} onClick={() => setFilter("valid")}>
                  Passing checks
                </Chip>
              </div>
            </div>
            {visible.length === 0 ? (
              <p className="rounded-md border border-dashed border-border-strong bg-sheet p-5 text-body text-ink-secondary">
                No favourites yet. Star the options you like to compare them here.
              </p>
            ) : (
              topicDirections.map((d) => {
                const group = visible.filter((o) => o.directionId === d.id);
                if (group.length === 0) return null;
                return (
                  <div key={`${d.id}-${altIndex}`} className="grid gap-2.5">
                    <h3 className="text-[13px] font-semibold text-ink-secondary">{d.name}</h3>
                    <ul className="grid gap-3 md:grid-cols-2">
                      {group.map((o) => (
                        <TitleCard
                          key={o.id}
                          option={o}
                          directionName={d.name}
                          favourite={favourites.has(o.id)}
                          onFavourite={() => toggleFavourite(o.id)}
                          onChoose={() => choose(o.id)}
                          onSave={(t, s) => saveEdit(o.id, t, s)}
                          fresh={fresh.has(o.id)}
                        />
                      ))}
                    </ul>
                  </div>
                );
              })
            )}
          </section>
        )}

        {hasData && (
          <DemoStates
            value={screen}
            onChange={(s) => {
              full.reset();
              setScreen(s);
              if (s === "loading") regenerateAll(model);
              if (s === "error") {
                setScreen("ready");
                full.start({ durationMs: 1600, costUsd: 0, steps, failAt: 0.6 });
              }
            }}
          />
        )}
      </div>

      <Inspector label="Titles details" className="lg:sticky lg:top-(--shell-topbar) lg:h-screen-fill">
        <InspectorSection title="Chosen title">
          {chosen && shown === "ready" ? (
            <div className="grid gap-3">
              <p className="text-body text-ink">
                <span className="font-book font-medium">{chosen.title}</span> is highlighted in the list
                {chosen.invalidReason ? ", but it needs an edit before you continue." : "."}
              </p>
              <Button size="sm" variant="ghost" icon={ArrowDown} onClick={showChosen}>
                Show the chosen title
              </Button>
            </div>
          ) : (
            <p className="text-small text-ink-secondary">No title chosen yet. Pick one with Use this title.</p>
          )}
          <p className="mt-3 text-small text-ink-tertiary">KDP needs the title and subtitle together under 200 characters. Choosing sets the book's title.</p>
        </InspectorSection>
        <InspectorSection title="This run">
          <KeyValueList
            items={[
              { label: "Model", value: <ModelName slug={model} /> },
              { label: "Options", value: `${options.length}, ${validCount} passing` },
              { label: "Titles cost so far", value: formatUsd(spent) },
            ]}
          />
        </InspectorSection>
      </Inspector>

      <RunModelModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Regenerate all titles"
        description="Favourites are kept. Everything else is replaced with new options."
        confirmLabel="Regenerate titles"
        baseUsd={RUN_COST}
        baseSlug={TITLES_MODEL}
        initialSlug={model}
        instructionHint="For example: shorter titles, or lean on the night shift."
        onConfirm={(slug) => {
          setModalOpen(false);
          regenerateAll(slug);
        }}
      />
    </div>
  );
}
