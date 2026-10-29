import { useState } from "react";
import { useCanWrite } from "../../lib/access";
import { ArrowDown, RefreshCw, Sparkles } from "lucide-react";
import { Banner, Button, Chip, EmptyState, KeyValueList, LiveDot, ModelName, PageHeader, ProgressBar, Skeleton } from "../../components/ui";
import { stageDefaults, TITLE_SUBTITLE_MAX, titleOptions, topicDirections, type Book, type TitleOption } from "../../demo";
import { formatUsd } from "../../lib/format";
import { scrollBehavior } from "../../lib/motion";
import { useStepAction } from "../../lib/stepAction";
import { useBook } from "../../lib/useBook";
import { bookStepPath } from "../../screens";
import { NotFound } from "../../shell/NotFound";
import { DemoStates, useScreenState } from "../research/DemoStates";
import { RunModelModal } from "../research/RunModelModal";
import { about, estimateFor, useSimulatedRun } from "../research/sim";

import { ChooseTitleButton, DirectionCard, TitleRow, TitleSide } from "./TitleCard";
import { TitlesApi } from "./TitlesApi";
import { alternates, checkTitle, directionDetails } from "./titlesExtras";

/* Titles screen (docs/03-design/UX-SPEC.md, M5; approved Volume Studio design, stTitles).
   A card per topic direction with its options as rows (length bar, favourite, inline edit, More like
   this), filters, and Regenerate all. Press a row to see it in the right card: the neutral store
   preview, the length meter, the checks and Use this title. Continue to blueprint is the step action. */

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
  const canWrite = useCanWrite();
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
  const [previewId, setPreviewId] = useState<string | null>(null);

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
  // The right card shows the option the owner pressed, else the chosen one, else the first.
  const previewed = options.find((o) => o.id === previewId) ?? chosen ?? options[0] ?? null;
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
      el?.scrollIntoView({ block: "center", behavior: scrollBehavior() });
      el?.focus({ preventScroll: true });
    });
  }

  return (
    <div className="grid gap-4 px-4 min-[861px]:px-6">
      <PageHeader
        title="Titles"
        summary="Five directions from the research, ten options to compare. Edit any of them."
        actions={
          canWrite && shown === "ready" && hasData ? (
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
            canWrite ? (
              <Button icon={Sparkles} estimate={about(RUN_COST)} onClick={() => regenerateAll(model)}>
                Generate titles
              </Button>
            ) : undefined
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

      {shown === "loading" && (
        <div role="status" aria-label="Writing title options" className="grid gap-3">
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="vol-glass grid gap-3 rounded-card p-[18px]">
              <Skeleton className="w-40" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ))}
        </div>
      )}

      {shown === "ready" && hasData && (
        <div className="grid items-start gap-4 min-[1180px]:grid-cols-[minmax(0,1fr)_320px]">
          <section aria-labelledby="directions-heading" className="grid min-w-0 gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 id="directions-heading" className="text-[15px] font-bold text-ink">
                Topic directions
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
            {visible.length === 0 && (
              <p className="vol-glass rounded-card p-5 text-body text-ink-2">No favourites yet. Star the options you like to compare them here.</p>
            )}
            {topicDirections.map((d, i) => {
              const group = visible.filter((o) => o.directionId === d.id);
              if (group.length === 0) return null;
              const detail = directionDetails[d.id];
              const busy = busyDirection === d.id && one.status === "running";
              return (
                <DirectionCard
                  key={`${d.id}-${altIndex}`}
                  index={i}
                  name={d.name}
                  pitch={d.pitch}
                  count={options.filter((o) => o.directionId === d.id).length}
                  details={[
                    { label: "Why it works", value: detail?.why ?? "" },
                    { label: "Readers", value: detail?.readers ?? "" },
                  ]}
                  tools={
                    canWrite ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        icon={RefreshCw}
                        loading={busy}
                        loadingLabel="Writing"
                        estimate={about(DIRECTION_COST)}
                        disabledReason={one.status === "running" ? "Wait for the current run." : undefined}
                        onClick={() => moreLikeThis(d.id)}
                      >
                        More like this
                      </Button>
                    ) : undefined
                  }
                >
                  <ul className="grid gap-1.5">
                    {group.map((o) => (
                      <TitleRow
                        key={o.id}
                        option={o}
                        directionName={d.name}
                        favourite={favourites.has(o.id)}
                        onFavourite={() => toggleFavourite(o.id)}
                        onSave={(t, s) => saveEdit(o.id, t, s)}
                        fresh={fresh.has(o.id)}
                        onPreview={() => setPreviewId(o.id)}
                        previewing={previewed?.id === o.id}
                      />
                    ))}
                  </ul>
                </DirectionCard>
              );
            })}
          </section>

          <aside
            aria-label="Titles details"
            className="vol-glass grid min-w-0 content-start rounded-card p-[18px] min-[1180px]:sticky min-[1180px]:top-(--shell-sticky-top)"
          >
            <TitleSide
              book={book}
              option={previewed}
              chosen={previewed?.chosen ?? false}
              action={
                canWrite && previewed ? (
                  <ChooseTitleButton fullWidth invalid={previewed.invalidReason !== null} onChoose={() => choose(previewed.id)} />
                ) : undefined
              }
            >
              <hr className="mt-4 border-line" />
              <h3 className="mt-4 text-[14px] font-bold text-ink">Chosen title</h3>
              {chosen ? (
                <div className="mt-2 grid gap-2">
                  <p className="font-book text-[14px] text-ink">
                    <span className="block font-semibold">{chosen.title}</span>
                    {chosen.subtitle && <span className="block text-ink-2 italic">{chosen.subtitle}</span>}
                  </p>
                  {chosen.invalidReason && <p className="text-small text-claim">It needs an edit before you continue.</p>}
                  <Button size="sm" variant="ghost" icon={ArrowDown} className="justify-self-start" onClick={showChosen}>
                    Show the chosen title
                  </Button>
                </div>
              ) : (
                <p className="mt-2 text-small text-ink-2">No title chosen yet. Pick one with Use this title.</p>
              )}
              <p className="mt-2 text-small text-ink-3">
                KDP allows up to {TITLE_SUBTITLE_MAX} characters for the title and subtitle together. Choosing sets the book's title.
              </p>
              <h3 className="mt-4 text-[14px] font-bold text-ink">This run</h3>
              <KeyValueList
                className="mt-2"
                items={[
                  { label: "Model", value: <ModelName slug={model} /> },
                  { label: "Options", value: `${options.length}, ${validCount} passing` },
                  { label: "Titles cost so far", value: formatUsd(spent) },
                ]}
              />
            </TitleSide>
          </aside>
        </div>
      )}

      {shown === "empty" && !hasData && titleSet && (
        <aside aria-label="Titles details" className="vol-glass grid max-w-[420px] content-start rounded-card p-[18px]">
          <TitleSide book={book} option={{ title: book.title, subtitle: book.subtitle, checks: [], invalidReason: null }} chosen />
        </aside>
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
