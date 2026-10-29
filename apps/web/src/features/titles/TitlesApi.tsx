import { useState } from "react";
import { useCanWrite } from "../../lib/access";
import { ArrowDown, RefreshCw, RotateCcw, Sparkles } from "lucide-react";
import {
  Banner,
  Button,
  Chip,
  EmptyState,
  Inspector,
  InspectorSection,
  KeyValueList,
  LiveDot,
  Modal,
  ModelName,
  PageHeader,
  ProgressBar,
  Select,
  Skeleton,
  Textarea,
} from "../../components/ui";
import { titleDirections, toTitleOptions } from "../../api/adapters";
import { useChooseTitle, useEstimate, useGenerateTitles, useResearch, useSetFavourite, useTitleSets } from "../../api/hooks";
import type { ApiBookDetail, ApiTitleDirection, ApiTitleSet } from "../../api/types";
import { estimateWords, guardrailsOf, isFavourite, plainError, runMeta, useBookJobsLive, usePromptRunFor, useStageJob, whenMs } from "../../api/wire-b";
import { formatUsd } from "../../lib/format";
import { GuardrailNote } from "../research/GuardrailNote";
import { TITLE_SUBTITLE_MAX, titleLength, type Book, type TitleOption } from "../../demo";
import { cn } from "../../lib/cn";
import { scrollBehavior } from "../../lib/motion";
import { useStepAction } from "../../lib/stepAction";
import { bookStepPath } from "../../screens";
import { TitleCard } from "./TitleCard";
import { checkTitle } from "./titlesExtras";
import { RebuildBook } from "../rebuild/RebuildBook";

/* Titles for a book on the server (API mode). The writer suggests directions and title options; the
   owner can pick a direction and ask for titles for it alone, edit an option, and choose one, which
   saves the title and subtitle to the book. */

type Filter = "all" | "favourites" | "valid";

export function TitlesApi({ book, apiBook }: { book: Book; apiBook: ApiBookDetail }) {
  const canWrite = useCanWrite();
  const bookId = apiBook.id;
  const sets = useTitleSets(bookId);
  const research = useResearch(bookId);
  const { job, active } = useStageJob(bookId, ["titles"]);
  const gen = useGenerateTitles();
  const choose = useChooseTitle();
  const [pickedSet, setPickedSet] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const favMut = useSetFavourite();
  const estimate = useEstimate(bookId, "titles");
  const [edits, setEdits] = useState<Record<string, { title: string; subtitle: string }>>({});
  const [busyDirection, setBusyDirection] = useState<string | null>(null);
  const [againOpen, setAgainOpen] = useState(false);
  const [instruction, setInstruction] = useState("");

  const list = sets.data ?? [];
  const set: ApiTitleSet | null = list.find((x) => x.id === pickedSet) ?? list[0] ?? null;
  const directions = set ? titleDirections(set) : [];
  const options: TitleOption[] = set
    ? toTitleOptions(set).map((o) => {
        const e = edits[o.id];
        if (!e) return o;
        const { checks, invalidReason } = checkTitle(e.title, e.subtitle);
        return { ...o, title: e.title, subtitle: e.subtitle, checks, invalidReason };
      })
    : [];
  const failed = job && !active && (job.status === "failed" || job.status === "needs_attention") ? job : null;
  const { jobs } = useBookJobsLive(bookId);
  const setJob = set?.jobId ? (jobs.find((j) => j.id === set.jobId) ?? null) : null;
  const prompt = usePromptRunFor(bookId, "titles", setJob);
  const meta = runMeta(set);
  const setModel = meta.model ?? prompt.model;
  const setCost = meta.costUsd ?? prompt.costUsd;
  const guard = guardrailsOf(set);
  const hasResearch = (research.data?.runs ?? []).some((r) => r.status === "done");
  const bookTitle = apiBook.title;

  function generate(v: { directionKey?: string; instruction?: string } = {}) {
    setPickedSet(null);
    setBusyDirection(v.directionKey ?? null);
    const input: { bookId: string; directionKey?: string; titleSetId?: string; instruction?: string } = { bookId };
    if (v.directionKey && set) {
      input.directionKey = v.directionKey;
      input.titleSetId = set.id;
    }
    if (v.instruction) input.instruction = v.instruction;
    gen.mutate(input);
  }

  // The option being saved as the book's title, so its button shows Saving and the others wait.
  const savingChoiceId = choose.isPending && choose.variables ? `${choose.variables.titleSetId}:${choose.variables.input.index}` : null;

  function chooseOption(o: TitleOption) {
    // One choice at a time: a second press while the first saves does nothing.
    if (!set || choose.isPending) return;
    const index = Number(o.id.slice(o.id.lastIndexOf(":") + 1));
    const e = edits[o.id];
    choose.mutate({ bookId, titleSetId: set.id, input: e ? { index, title: e.title, subtitle: e.subtitle } : { index } });
  }

  function saveEdit(o: TitleOption, title: string, subtitle: string) {
    setEdits((prev) => ({ ...prev, [o.id]: { title, subtitle } }));
    // Editing the chosen title saves the new words to the book straight away.
    if (o.chosen && set && !checkTitle(title, subtitle).invalidReason) {
      const index = Number(o.id.slice(o.id.lastIndexOf(":") + 1));
      choose.mutate({ bookId, titleSetId: set.id, input: { index, title, subtitle } });
    }
  }

  const blueprintPath = bookStepPath(book.id, "blueprint");
  const chosenHere = options.find((o) => o.chosen) ?? null;
  useStepAction(
    sets.isPending || sets.isError
      ? { label: "Continue to blueprint", to: blueprintPath, disabledReason: sets.isPending ? "Loading titles." : "Titles could not be loaded." }
      : list.length === 0 && !active
        ? {
            label: gen.isPending ? "Starting" : "Generate titles",
            estimate: estimateWords(estimate.data),
            onClick: () => generate(),
            disabledReason: gen.isPending ? "Starting the title run." : undefined,
          }
        : {
            label: "Continue to blueprint",
            to: blueprintPath,
            disabledReason: active ? "Titles are still being written." : !bookTitle ? "Choose a title first." : undefined,
          },
  );

  // Stars are saved on the server (option.favourite); a click shows at once while the save runs.
  const favourites = new Set(options.filter((_o, i) => (set ? isFavourite(set, i) : false)).map((o) => o.id));
  if (favMut.isPending && favMut.variables && set && favMut.variables.titleSetId === set.id) {
    const id = `${set.id}:${favMut.variables.index}`;
    if (favMut.variables.favourite) favourites.add(id);
    else favourites.delete(id);
  }
  const visible = options.filter((o) => (filter === "favourites" ? favourites.has(o.id) : filter === "valid" ? !o.invalidReason : true));
  const validCount = options.filter((o) => !o.invalidReason).length;
  const favCount = options.filter((o) => favourites.has(o.id)).length;
  const groups = groupByDirection(visible, directions);
  const setDirectionKeys = new Set(options.map((o) => o.directionId));
  const forOneDirection = set !== null && setDirectionKeys.size === 1 && directions.length > 1;

  function showChosen() {
    if (!chosenHere) return;
    if (filter !== "all") setFilter("all");
    requestAnimationFrame(() => {
      const el = document.getElementById(`title-${chosenHere.id}`);
      el?.scrollIntoView({ block: "center", behavior: scrollBehavior() });
      el?.focus({ preventScroll: true });
    });
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_auto]">
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] content-start gap-8 px-4 py-6 sm:px-8 lg:px-10 lg:py-7">
        <PageHeader
          title="Titles"
          summary="Directions from the research and title options to compare. Pick a direction for more titles in it, edit any option, then choose one."
          actions={
            canWrite && list.length > 0 && !active ? (
              <Button icon={RefreshCw} estimate={estimateWords(estimate.data)} onClick={() => setAgainOpen(true)}>
                Regenerate all
              </Button>
            ) : undefined
          }
        />

        {gen.isError && (
          <Banner tone="error" title="The title run did not start">
            {plainError(gen.error)}
          </Banner>
        )}
        {favMut.isError && (
          <Banner tone="error" title="The star was not saved">
            {plainError(favMut.error)}
          </Banner>
        )}
        {choose.isError && (
          <Banner tone="error" title="The title was not saved">
            {plainError(choose.error)}
          </Banner>
        )}

        {sets.isPending && <OptionsSkeleton />}

        {sets.isError && (
          <Banner
            tone="error"
            title="Titles could not be loaded"
            action={
              <Button size="sm" icon={RotateCcw} onClick={() => void sets.refetch()}>
                Retry
              </Button>
            }
          >
            {plainError(sets.error)}
          </Banner>
        )}

        {sets.isSuccess && list.length === 0 && !active && (
          <EmptyState
            drawing="pen"
            title="No title options yet"
            body={
              hasResearch
                ? "The writer reads the research and your idea, then suggests directions and titles with subtitles. Each one is checked for length and em dashes. Start it with Generate titles below."
                : "Research has not finished for this book, so titles are written from your idea alone. Start them with Generate titles below, or run research first."
            }
          />
        )}

        {active && job && (
          <section aria-labelledby="titles-live" className="relative overflow-hidden rounded-lg border border-border bg-sheet px-5 py-4 shadow-sheet">
            <span aria-hidden className="absolute inset-y-0 left-0 w-[3px] bg-accent" />
            <p id="titles-live" className="flex items-center gap-2 text-label font-semibold text-ink">
              <LiveDot />{" "}
              {busyDirection
                ? `Writing titles for ${directions.find((d) => d.key === busyDirection)?.label ?? "the chosen direction"}`
                : job.status === "queued"
                  ? "Waiting to start"
                  : (job.message ?? "Writing titles")}
            </p>
            <ProgressBar
              className="mt-3"
              value={Math.round(job.progress * 100)}
              max={100}
              live
              label="Title run progress"
              valueText={`${Math.round(job.progress * 100)} per cent`}
            />
            <p className="mt-2 text-small text-ink-secondary">The new options appear here when the run finishes. Earlier sets are kept.</p>
          </section>
        )}

        {failed && (
          <Banner
            tone="error"
            title="The title run stopped"
            action={
              canWrite ? (
                <Button size="sm" icon={RefreshCw} onClick={() => generate()} loading={gen.isPending} loadingLabel="Starting">
                  Retry
                </Button>
              ) : undefined
            }
          >
            {failed.error ?? "It did not finish."} Nothing from it was kept.
          </Banner>
        )}

        {set && directions.length > 0 && (
          <section aria-labelledby="directions-heading" className="grid gap-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 id="directions-heading" className="font-book text-heading text-ink">
                Topic directions
              </h2>
              <p className="text-small text-ink-tertiary">Pick one to get titles for it alone</p>
            </div>
            <ol className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
              {directions.map((d, i) => {
                const count = options.filter((o) => o.directionId === d.key).length;
                const busy = active && busyDirection === d.key;
                return (
                  <li
                    key={d.key || i}
                    className={cn(
                      "grid content-start gap-3 rounded-md border bg-sheet p-4",
                      forOneDirection && setDirectionKeys.has(d.key) ? "border-select" : "border-border",
                    )}
                  >
                    <div className="flex items-baseline gap-2.5">
                      <span className="num text-small text-ink-tertiary">{i + 1}</span>
                      <h3 className="font-book text-[19px] leading-6 font-medium text-ink">{d.label || "Untitled direction"}</h3>
                    </div>
                    <dl className="grid gap-2 text-small">
                      <DirectionRow label="Focus" value={d.angle} />
                      <DirectionRow label="Readers" value={d.audience} />
                      <DirectionRow label="Promise" value={d.promise} />
                    </dl>
                    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
                      <span className="num text-small text-ink-tertiary">
                        {count} {count === 1 ? "option" : "options"} in this set
                      </span>
                      {canWrite && (
                        <Button
                          size="sm"
                          variant="ghost"
                          icon={Sparkles}
                          loading={busy}
                          loadingLabel="Writing"
                          estimate={estimateWords(estimate.data)}
                          disabledReason={active ? "Wait for the current run." : !d.key ? "This direction has no key, so it cannot be picked." : undefined}
                          onClick={() => generate({ directionKey: d.key })}
                        >
                          Titles for this direction
                        </Button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
          </section>
        )}

        {set && guard && guard.needsAttention.length > 0 && <GuardrailNote items={guard.needsAttention} />}

        {set && (
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
            {options.length === 0 ? (
              <p className="rounded-md border border-dashed border-border-strong bg-sheet p-5 text-body text-ink-secondary">This set has no title options.</p>
            ) : visible.length === 0 ? (
              <p className="rounded-md border border-dashed border-border-strong bg-sheet p-5 text-body text-ink-secondary">
                {filter === "favourites" ? "No favourites yet. Star the options you like to compare them here." : "No option passes every check."}
              </p>
            ) : (
              groups.map((g) => (
                <div key={g.key} className="grid gap-2.5">
                  <h3 className="text-[13px] font-semibold text-ink-secondary">{g.name}</h3>
                  <ul className="grid gap-3 md:grid-cols-2">
                    {g.options.map((o) => (
                      <TitleCard
                        key={o.id}
                        option={o}
                        directionName={g.name}
                        favourite={favourites.has(o.id)}
                        onFavourite={() => {
                          if (!set) return;
                          const index = Number(o.id.slice(o.id.lastIndexOf(":") + 1));
                          favMut.mutate({ bookId, titleSetId: set.id, index, favourite: !favourites.has(o.id) });
                        }}
                        onChoose={() => chooseOption(o)}
                        onSave={(t, s) => saveEdit(o, t, s)}
                        fresh={false}
                        saving={savingChoiceId === o.id}
                        busy={savingChoiceId !== null}
                      />
                    ))}
                  </ul>
                </div>
              ))
            )}
          </section>
        )}
      </div>

      <Inspector label="Titles details" className="lg:sticky lg:top-(--shell-sticky-top) lg:h-screen-fill">
        <InspectorSection title="Chosen title">
          {bookTitle ? (
            <div className="grid gap-3">
              <p className="font-book text-body text-ink">
                <span className="block font-medium">{bookTitle}</span>
                {apiBook.subtitle && <span className="block text-ink-secondary italic">{apiBook.subtitle}</span>}
              </p>
              <p className="num text-small text-ink-tertiary">
                {titleLength(bookTitle, apiBook.subtitle ?? "")} of {TITLE_SUBTITLE_MAX} characters. Saved to the book.
              </p>
              {chosenHere && (
                <Button size="sm" variant="ghost" icon={ArrowDown} onClick={showChosen}>
                  Show it in the list
                </Button>
              )}
            </div>
          ) : (
            <p className="text-small text-ink-secondary">Not set yet. Pick one with Use this title.</p>
          )}
          {choose.isPending && (
            <p className="mt-2 text-small text-ink-secondary" role="status">
              Saving the title
            </p>
          )}
          <p className="mt-3 text-small text-ink-tertiary">KDP needs the title and subtitle together under 200 characters. Choosing sets the book's title.</p>
        </InspectorSection>
        {/* Once the book has text, a new title only reaches the blueprint and chapters through a rebuild. */}
        {bookTitle && <RebuildBook bookId={bookId} title={bookTitle} onlyWithText className="mt-5" />}
        <InspectorSection title="This set">
          {set ? (
            <div className="grid gap-3">
              {list.length > 1 && (
                <Select
                  label="Set"
                  value={set.id}
                  onChange={setPickedSet}
                  options={list.map((x, i) => ({ value: x.id, label: `Set ${list.length - i}, ${whenMs(x.createdAt)}` }))}
                  disabled={active}
                />
              )}
              <KeyValueList
                items={[
                  { label: "Model", value: setModel ? <ModelName slug={setModel} /> : "Not recorded" },
                  { label: "Cost", value: setCost === null ? "Not recorded" : formatUsd(setCost) },
                  { label: "Options", value: `${options.length}, ${validCount} passing` },
                  { label: "Written", value: whenMs(set.createdAt) },
                ]}
              />
              {forOneDirection && (
                <p className="text-small text-ink-secondary">
                  Titles for {directions.find((d) => setDirectionKeys.has(d.key))?.label ?? "one direction"} only.
                </p>
              )}
            </div>
          ) : (
            <p className="text-small text-ink-secondary">No title run yet.</p>
          )}
        </InspectorSection>
      </Inspector>

      <Modal
        open={againOpen}
        onClose={() => setAgainOpen(false)}
        title="Regenerate all titles"
        description="The writer suggests new directions and options. This set is kept, so you can switch back to it."
        footer={
          <>
            <Button variant="ghost" onClick={() => setAgainOpen(false)}>
              Cancel
            </Button>
            <Button
              icon={RefreshCw}
              estimate={estimateWords(estimate.data)}
              onClick={() => {
                setAgainOpen(false);
                generate(instruction.trim() ? { instruction: instruction.trim() } : {});
                setInstruction("");
              }}
            >
              Regenerate titles
            </Button>
          </>
        }
      >
        <Textarea
          label="Instruction (optional)"
          rows={3}
          value={instruction}
          maxLength={2000}
          onChange={(e) => setInstruction(e.target.value)}
          hint="For example: shorter titles, or lean on the night shift."
        />
        {estimate.data?.model && (
          <p className="mt-3 text-small text-ink-secondary">
            Written by <ModelName slug={estimate.data.model} className="text-ink" />, {estimateWords(estimate.data)}.
          </p>
        )}
      </Modal>
    </div>
  );
}

function DirectionRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-0.5">
      <dt className="font-semibold text-ink-secondary">{label}</dt>
      <dd className={value ? "text-ink" : "text-ink-tertiary"}>{value || "Not given"}</dd>
    </div>
  );
}

function groupByDirection(options: TitleOption[], directions: ApiTitleDirection[]): { key: string; name: string; options: TitleOption[] }[] {
  const out: { key: string; name: string; options: TitleOption[] }[] = [];
  for (const d of directions) {
    const g = options.filter((o) => o.directionId === d.key);
    if (g.length > 0) out.push({ key: d.key, name: d.label || "Untitled direction", options: g });
  }
  const known = new Set(directions.map((d) => d.key));
  const rest = options.filter((o) => !known.has(o.directionId));
  if (rest.length > 0) out.push({ key: "__other", name: "Other options", options: rest });
  return out;
}

function OptionsSkeleton() {
  return (
    <div role="status" aria-label="Loading title options" className="grid gap-3 md:grid-cols-2">
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} className="grid gap-3 rounded-md border border-border bg-sheet p-5">
          <Skeleton className="w-24" />
          <Skeleton className="h-6 w-3/4" />
          <Skeleton className="w-full" />
        </div>
      ))}
    </div>
  );
}
