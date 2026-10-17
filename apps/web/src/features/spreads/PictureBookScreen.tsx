import { useMemo, useState } from "react";
import { Flag, Images, RotateCw, ShieldCheck } from "lucide-react";
import type { CharacterView, PictureBookView, PictureEstimate, PictureStoryInput, SpreadLayout, SpreadView } from "../../api/picture";
import { Banner, Button, Inspector, InspectorSection, KeyValueList, PageHeader, Switch } from "../../components/ui";
import { formatUsd } from "../../lib/format";
import { useStepAction } from "../../lib/stepAction";
import { CharacterSheet } from "./CharacterSheet";
import { inchesLabel, spreadOverlay } from "./geometry";
import {
  clampSpreads,
  pictureEstimateFrom,
  runEstimate,
  runEstimateFrom,
  storyInput,
  validateStory,
  type RunStep,
  type StoryForm,
  type StoryFormErrors,
} from "./model";
import { PaintDialog } from "./PaintDialog";
import { RunProgress } from "./RunProgress";
import { SpreadCard } from "./SpreadCard";
import { StoryStart } from "./StoryStart";

export interface RunState {
  progress: number;
  message: string | null;
  steps: RunStep[];
  onCancel?: (() => void) | undefined;
  cancelling?: boolean | undefined;
}

export interface PictureBookScreenProps {
  bookTitle: string;
  view: PictureBookView | null;
  characters: CharacterView[];
  charactersLoading?: boolean | undefined;
  charactersError?: string | null | undefined;
  /** Set while a run is going. */
  run: RunState | null;
  /** The last run failed or stopped: what happened, in words. */
  runError: string | null;
  initialForm: StoryForm;
  canWrite: boolean;
  /** Progress (0 to 1) of each spread being repainted, by section id. */
  painting: Record<string, number>;
  spentUsd: number | null;
  budgetUsd: number | null;
  exportPath: string;
  onStart: (story: PictureStoryInput, spreads: number, regenerateStory: boolean) => Promise<void>;
  onSaveText: (spread: SpreadView, text: string) => Promise<void>;
  onLayout: (spread: SpreadView, layout: SpreadLayout) => Promise<void>;
  onPaint: (spread: SpreadView) => Promise<void>;
  onRaiseBudget: ((toUsd: number) => Promise<void>) | null;
  /** The server's price for a run and one picture (POST /books/:id/picture-book/estimate). Demo books leave it out. */
  estimate?: PictureEstimate | null | undefined;
}

/**
 * The Writing step of a picture book (UX-SPEC M7 for picture books, P7-6): the story form before the run, the live
 * run while it goes, then the spreads board with the character sheet in the inspector. The one primary action
 * (Write the story, then Check and export) sits in the step footer.
 */
export function PictureBookScreen(props: PictureBookScreenProps) {
  const { view, run, canWrite } = props;
  const [form, setForm] = useState<StoryForm>(props.initialForm);
  const [errors, setErrors] = useState<StoryFormErrors>({});
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [rewriteOpen, setRewriteOpen] = useState(false);
  const [showSafe, setShowSafe] = useState(false);
  const [paintFor, setPaintFor] = useState<SpreadView | null>(null);
  const overlay = useMemo(() => spreadOverlay(view?.pageCount ?? 24), [view?.pageCount]);
  const made = !!view && view.spreads.length > 0;
  const spreads = clampSpreads(Number(form.spreads));
  const estimate = props.estimate ? runEstimateFrom(props.estimate, spreads) : runEstimate(spreads);
  const pictureCost = pictureEstimateFrom(props.estimate);

  function change<K extends keyof StoryForm>(key: K, value: StoryForm[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => ({ ...e, [key]: undefined }));
  }

  function start(regenerateStory: boolean) {
    const found = validateStory(form);
    setErrors(found);
    const first = Object.keys(found)[0];
    if (first) {
      setRewriteOpen(true);
      requestAnimationFrame(() => document.getElementById(`story-${first}`)?.focus());
      return;
    }
    setStarting(true);
    setStartError(null);
    props.onStart(storyInput(form), spreads, regenerateStory).then(
      () => {
        setStarting(false);
        setRewriteOpen(false);
      },
      (e: unknown) => {
        setStarting(false);
        setStartError(e instanceof Error ? e.message : "The run did not start. Try again.");
      },
    );
  }

  useStepAction(
    run
      ? null
      : made && !rewriteOpen
        ? { label: "Check and export", to: props.exportPath }
        : canWrite
          ? {
              label: made ? "Write the story again" : "Write the story",
              estimate,
              onClick: () => start(made),
              disabledReason: starting ? "The run is starting." : undefined,
            }
          : null,
  );

  const missing = view ? view.spreads.filter((s) => !s.imageUrl).length : 0;
  const summary = view
    ? `${view.spreads.length} spreads, ${view.pageCount} pages${view.newWord ? `, new word: ${view.newWord}` : ""}.`
    : "Tell the writer about the story, then it writes, plans the scenes and paints every spread.";

  return (
    <div className="grid grid-cols-1 gap-8 px-4 py-6 sm:px-8 lg:grid-cols-[minmax(0,1fr)_320px] lg:px-10 lg:py-7">
      <div className="grid min-w-0 content-start gap-6">
        <PageHeader title="Story and spreads" summary={summary} />

        {run && (
          <RunProgress
            progress={run.progress}
            message={run.message}
            steps={run.steps}
            onCancel={canWrite ? run.onCancel : undefined}
            cancelling={run.cancelling}
          />
        )}

        {props.runError && !run && (
          <Banner
            tone={view?.safety && !view.safety.passed ? "attention" : "error"}
            title={view?.safety && !view.safety.passed ? "The story did not pass the safety check" : "The run stopped"}
            action={
              canWrite ? (
                <Button size="sm" icon={RotateCw} onClick={() => start(!!(view?.safety && !view.safety.passed))} loading={starting} loadingLabel="Starting">
                  {view?.safety && !view.safety.passed ? "Write it again" : "Carry on"}
                </Button>
              ) : undefined
            }
          >
            {props.runError}
            {view?.safety && !view.safety.passed && view.safety.notes.length > 0 && (
              <ul className="mt-1 list-disc pl-5">
                {view.safety.notes.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            )}
          </Banner>
        )}

        {startError && (
          <Banner tone="error" title="The run did not start">
            {startError}
          </Banner>
        )}

        {!run && (!made || rewriteOpen) && (
          <section aria-labelledby="story-form-title" className="grid gap-4 rounded-md border border-border bg-sheet p-5 sm:p-6">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 id="story-form-title" className="font-book text-heading text-ink">
                {made ? "Write the story again" : "The story"}
              </h2>
              {made && (
                <Button size="sm" variant="ghost" onClick={() => setRewriteOpen(false)}>
                  Keep the current story
                </Button>
              )}
            </div>
            {made && (
              <p className="text-small text-ink-secondary">
                A new story replaces the text of every spread and paints new pictures. Edits you made to the spreads are replaced too.
              </p>
            )}
            <StoryStart form={form} errors={errors} onChange={change} disabled={!canWrite} />
            <p className="text-small text-ink-secondary">
              The run makes {spreads} spread pictures and one reference picture for each main character,{" "}
              {props.estimate ? `${estimate} in all, story included.` : `${estimate} in pictures, plus a few cents for the story.`}
              Use Write the story at the foot of the page.
            </p>
          </section>
        )}

        {made && view && (
          <section aria-labelledby="board-title" className="grid gap-4">
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
              <h2 id="board-title" className="font-book text-heading text-ink">
                Spreads
              </h2>
              <div className="flex flex-wrap items-center gap-3">
                <Switch label="Show trim and safe area" checked={showSafe} onChange={setShowSafe} nowrap />
                {canWrite && !run && !rewriteOpen && (
                  <Button size="sm" variant="ghost" icon={RotateCw} onClick={() => setRewriteOpen(true)}>
                    New story
                  </Button>
                )}
              </div>
            </div>
            {showSafe && (
              <p className="text-small text-ink-secondary">
                The shaded edge is bleed and is cut off in print. The dashed line is the trim. Keep text inside the light boxes, the safe area on each page.
                Each page is {inchesLabel(view.pageSizeIn)} with bleed.
              </p>
            )}
            {missing > 0 && !run && (
              <Banner tone="attention" title={`${missing} ${missing === 1 ? "spread has" : "spreads have"} no picture yet`}>
                Paint them again from their cards, or carry on the run. Export needs a picture on every spread.
              </Banner>
            )}
            <ol className="grid gap-5 2xl:grid-cols-2">
              {view.spreads.map((s) => (
                <li key={s.sectionId} className="min-w-0">
                  <SpreadCard
                    spread={s}
                    overlay={overlay}
                    showSafeArea={showSafe}
                    painting={props.painting[s.sectionId] ?? null}
                    canWrite={canWrite && !run}
                    onSaveText={(t) => props.onSaveText(s, t)}
                    onLayout={(l) => props.onLayout(s, l)}
                    onPaint={() => setPaintFor(s)}
                    pictureCost={pictureCost}
                  />
                </li>
              ))}
            </ol>
          </section>
        )}
      </div>

      <Inspector label="Picture book details" width="100%" className="lg:sticky lg:top-4 lg:self-start">
        <InspectorSection title="Book">
          <KeyValueList
            items={[
              { label: "Title", value: view?.title ?? props.bookTitle },
              { label: "Trim", value: "8.5 x 8.5 in" },
              { label: "Ink", value: "Premium colour" },
              { label: "Pages", value: view ? String(view.pageCount) : "Not planned yet" },
              ...(view?.newWord ? [{ label: "New word", value: view.newWord }] : []),
              ...(props.spentUsd !== null && props.budgetUsd !== null
                ? [{ label: "Spent", value: `${formatUsd(props.spentUsd)} of ${formatUsd(props.budgetUsd)}` }]
                : []),
            ]}
          />
        </InspectorSection>
        {view?.safety && (
          <InspectorSection title="Safety check" icon={view.safety.passed ? ShieldCheck : Flag} tone={view.safety.passed ? "default" : "attention"}>
            <p className="text-small text-ink-secondary">
              {view.safety.passed
                ? "The story passed the check for anything scary, unkind or unsafe."
                : "The story did not pass. Read the notes, then write it again."}
            </p>
          </InspectorSection>
        )}
        <InspectorSection title="Character sheet" icon={Images}>
          <CharacterSheet characters={props.characters} loading={props.charactersLoading} error={props.charactersError} />
        </InspectorSection>
        {view?.styleLine && (
          <InspectorSection title="Art style">
            <p className="font-book text-small text-ink-secondary">{view.styleLine}</p>
          </InspectorSection>
        )}
      </Inspector>

      <PaintDialog
        spread={paintFor}
        onClose={() => setPaintFor(null)}
        onPaint={props.onPaint}
        spentUsd={props.spentUsd}
        budgetUsd={props.budgetUsd}
        onRaiseBudget={props.onRaiseBudget}
        pictureCost={pictureCost}
        pictureUsd={props.estimate?.image.highUsd}
      />
    </div>
  );
}
