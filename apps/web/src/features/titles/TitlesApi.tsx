import { useState } from "react";
import { useCanWrite } from "../../lib/access";
import { ArrowDown, RefreshCw, RotateCcw, Sparkles } from "lucide-react";
import {
  Banner,
  Button,
  Chip,
  EmptyState,
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
import { scrollBehavior } from "../../lib/motion";
import { useStepAction } from "../../lib/stepAction";
import { bookStepPath } from "../../screens";
import { ChooseTitleButton, DirectionCard, TitleRow, TitleSide } from "./TitleCard";
import { checkTitle } from "./titlesExtras";
import { RebuildBook } from "../rebuild/RebuildBook";

/* Titles for a book on the server (API mode), in the approved layout: a card per direction with its
   options as rows, and the right card with the store preview, the checks and Use this title. The writer
   suggests directions and title options; the owner can ask for titles for one direction alone, star and
   edit an option, and choose one, which saves the title and subtitle to the book. */

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
  const [previewId, setPreviewId] = useState<string | null>(null);

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
  // The right card shows the option pressed, else the chosen one, else the first; with no set, the saved title.
  const previewOption = options.find((o) => o.id === previewId) ?? chosenHere ?? options[0] ?? null;
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
  // One card per direction (all of them, so each keeps its own button), then any option without one.
  const cards = groupByDirection(visible, directions, filter === "all");
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
    <div className="grid gap-4 px-4 min-[861px]:px-6">
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

      {set && guard && guard.needsAttention.length > 0 && <GuardrailNote items={guard.needsAttention} />}

      {set && (
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
            {options.length === 0 ? (
              <p className="vol-glass rounded-card p-5 text-body text-ink-2">This set has no title options.</p>
            ) : (
              visible.length === 0 && (
                <p className="vol-glass rounded-card p-5 text-body text-ink-2">
                  {filter === "favourites" ? "No favourites yet. Star the options you like to compare them here." : "No option passes every check."}
                </p>
              )
            )}
            {cards.map((c, i) => {
              const d = directions.find((x) => x.key === c.key);
              const busy = active && busyDirection === c.key;
              return (
                <DirectionCard
                  key={c.key || i}
                  index={i}
                  name={c.name}
                  pitch={d?.angle ?? ""}
                  count={options.filter((o) => o.directionId === c.key).length}
                  details={
                    d
                      ? [
                          { label: "Readers", value: d.audience },
                          { label: "Promise", value: d.promise },
                        ]
                      : undefined
                  }
                  tools={
                    canWrite && d ? (
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
                    ) : undefined
                  }
                >
                  {c.options.length === 0 ? (
                    <p className="text-small text-ink-2">No options for this direction in this set.</p>
                  ) : (
                    <ul className="grid gap-1.5">
                      {c.options.map((o) => (
                        <TitleRow
                          key={o.id}
                          option={o}
                          directionName={c.name}
                          favourite={favourites.has(o.id)}
                          onFavourite={() => {
                            if (!set) return;
                            const index = Number(o.id.slice(o.id.lastIndexOf(":") + 1));
                            favMut.mutate({ bookId, titleSetId: set.id, index, favourite: !favourites.has(o.id) });
                          }}
                          onSave={(t, s) => saveEdit(o, t, s)}
                          fresh={false}
                          onPreview={() => setPreviewId(o.id)}
                          previewing={previewOption?.id === o.id}
                        />
                      ))}
                    </ul>
                  )}
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
              option={previewOption ?? (bookTitle ? { title: bookTitle, subtitle: apiBook.subtitle ?? "", checks: [], invalidReason: null } : null)}
              chosen={previewOption ? previewOption.chosen : true}
              action={
                canWrite && previewOption ? (
                  <ChooseTitleButton
                    fullWidth
                    invalid={previewOption.invalidReason !== null}
                    saving={savingChoiceId === previewOption.id}
                    busy={savingChoiceId !== null}
                    onChoose={() => chooseOption(previewOption)}
                  />
                ) : undefined
              }
            >
              <hr className="mt-4 border-line" />
              <h3 className="mt-4 text-[14px] font-bold text-ink">Chosen title</h3>
              {bookTitle ? (
                <div className="mt-2 grid gap-2">
                  <p className="font-book text-[14px] text-ink">
                    <span className="block font-semibold">{bookTitle}</span>
                    {apiBook.subtitle && <span className="block text-ink-2 italic">{apiBook.subtitle}</span>}
                  </p>
                  <p className="num text-small text-ink-3">
                    {titleLength(bookTitle, apiBook.subtitle ?? "")} of {TITLE_SUBTITLE_MAX} characters. Saved to the book.
                  </p>
                  {chosenHere && (
                    <Button size="sm" variant="ghost" icon={ArrowDown} className="justify-self-start" onClick={showChosen}>
                      Show it in the list
                    </Button>
                  )}
                </div>
              ) : (
                <p className="mt-2 text-small text-ink-2">Not set yet. Pick one with Use this title.</p>
              )}
              {choose.isPending && (
                <p className="mt-2 text-small text-ink-2" role="status">
                  Saving the title
                </p>
              )}
              <p className="mt-2 text-small text-ink-3">
                KDP allows up to {TITLE_SUBTITLE_MAX} characters for the title and subtitle together. Choosing sets the book's title.
              </p>
              {/* Once the book has text, a new title only reaches the blueprint and chapters through a rebuild. */}
              {bookTitle && <RebuildBook bookId={bookId} title={bookTitle} onlyWithText className="mt-5" />}
              <h3 className="mt-4 text-[14px] font-bold text-ink">This set</h3>
              <div className="mt-2 grid gap-3">
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
                  <p className="text-small text-ink-2">Titles for {directions.find((d) => setDirectionKeys.has(d.key))?.label ?? "one direction"} only.</p>
                )}
              </div>
            </TitleSide>
          </aside>
        </div>
      )}

      {!set && bookTitle && sets.isSuccess && (
        <aside aria-label="Titles details" className="vol-glass grid max-w-[420px] content-start rounded-card p-[18px]">
          <TitleSide book={book} option={{ title: bookTitle, subtitle: apiBook.subtitle ?? "", checks: [], invalidReason: null }} chosen>
            <RebuildBook bookId={bookId} title={bookTitle} onlyWithText className="mt-5" />
          </TitleSide>
        </aside>
      )}

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

function groupByDirection(
  options: TitleOption[],
  directions: ApiTitleDirection[],
  keepEmpty: boolean,
): { key: string; name: string; options: TitleOption[] }[] {
  const out: { key: string; name: string; options: TitleOption[] }[] = [];
  for (const d of directions) {
    const g = options.filter((o) => o.directionId === d.key);
    if (g.length > 0 || keepEmpty) out.push({ key: d.key, name: d.label || "Untitled direction", options: g });
  }
  const known = new Set(directions.map((d) => d.key));
  const rest = options.filter((o) => !known.has(o.directionId));
  if (rest.length > 0) out.push({ key: "__other", name: "Other options", options: rest });
  return out;
}

function OptionsSkeleton() {
  return (
    <div role="status" aria-label="Loading title options" className="grid gap-3">
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} className="vol-glass grid gap-3 rounded-card p-[18px]">
          <Skeleton className="w-24" />
          <Skeleton className="h-6 w-3/4" />
          <Skeleton className="w-full" />
        </div>
      ))}
    </div>
  );
}
