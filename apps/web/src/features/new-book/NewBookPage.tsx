import { useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { ReadOnlyBanner } from "../../lib/access";
import { useVolumeMe } from "../../api/wire-d";
import { Link, useNavigate } from "react-router";
import { ArrowLeft, Check, Plus, Save } from "lucide-react";
import {
  Banner,
  Button,
  Checkbox,
  Cover,
  EmptyState,
  Input,
  KeyValueList,
  ModelPicker,
  PageHeader,
  SegmentedControl,
  Select,
  Skeleton,
  Switch,
  Textarea,
} from "../../components/ui";
import {
  booksForPenName,
  coverFromStyle,
  coverStyles,
  getBookType,
  getCoverStyle,
  getInteriorTheme,
  getModel,
  interiorThemes,
  penNames,
  type AuthorProfile,
  type BookType,
  type CoverDesign,
} from "../../demo";
import { DEMO_NOW } from "../../demo/books";
import { useCreateBook, useUpdateBook } from "../../api/hooks";
import type { BookInput } from "../../api/types";
import { apiErrorText, profileBookCount, toServerTrim, usePenNames, useWireMode } from "../../api/wire-a";
import type { PenName } from "../../demo/types";
import { formatNumber, formatTime, formatUsd } from "../../lib/format";
import { DemoStates, useScreenState } from "../research/DemoStates";
import { textModels } from "../research/RunModelModal";
import { estimateFor } from "../research/sim";
import { BookTypeStep } from "./BookTypeStep";
import { ChoiceCard } from "./ChoiceCard";
import {
  ageRanges,
  applyProfile,
  applyType,
  emptyDraft,
  exampleIdea,
  exerciseStyles,
  fieldGroups,
  heatLabels,
  isPictureBook,
  pageTypes,
  parseNum,
  pipelineExamples,
  poemForms,
  RESEARCH_DEFAULT,
  trimSizes,
  unitLabel,
  usesClues,
  usesNewWord,
  workingTitle,
  splitPov,
  tenseOptions,
  writingArrives,
  type Draft,
} from "./wizardData";
import { WizardSteps, type WizardStep } from "./WizardSteps";
import { GENTLE_PROBLEM_RULE, messageOptions, runEstimate } from "../spreads/model";

/* New book wizard (docs/03-design/UX-SPEC.md, M3). Owner: screen agent B. With the server running, profiles
   come from it, Save draft creates (then updates) the book through POST /books and PATCH /books/:id, and
   Start research or Skip to titles saves it the same way and opens that book.
   Five steps: profile, book type (all 36 from config/book-types.json, by category), idea, details,
   review. Choosing a profile fills in its defaults (book type, word target, trim, interior theme,
   cover style, models); choosing a type fills in that type's. Cancel on the first step, Back on every
   other, Save draft throughout; "Start research" on the last. Values are kept when anything fails. */

const steps: WizardStep[] = [
  { id: "profile", label: "Profile" },
  { id: "type", label: "Book type" },
  { id: "idea", label: "Idea" },
  { id: "details", label: "Details" },
  { id: "review", label: "Review" },
];

type Errors = Partial<Record<keyof Draft, string>>;

/** Example estimate for the whole book on the chosen models, as a low and high figure. */
function estimate(d: Draft): { low: number; high: number; research: number } {
  const research = estimateFor(pipelineExamples.researchUsd, RESEARCH_DEFAULT, d.researchModel);
  const perBook = getModel(d.writingModel)?.exampleBookCostUsd ?? 2.8;
  const words = parseNum(d.words) || 35000;
  const writing = Math.round(perBook * (words / 40000) * 100) / 100;
  const total = research + pipelineExamples.titlesUsd + pipelineExamples.blueprintUsd + writing + pipelineExamples.restUsd;
  return { low: Math.round(total * 0.85 * 100) / 100, high: Math.round(total * 1.25 * 100) / 100, research };
}

function validate(step: number, d: Draft): Errors {
  const e: Errors = {};
  const type = getBookType(d.bookTypeId ?? undefined);
  if (step === 0 && !d.profileId) e.profileId = "Choose the profile this book is written under.";
  if (step === 1 && !type) e.bookTypeId = "Choose a book type.";
  if (step === 2 && d.idea.trim().length < 12) e.idea = "Add a sentence about the book, or a working title.";
  if (step === 3 && type) {
    const w = parseNum(d.words);
    if (!w || w < type.wordRange.min || w > type.wordRange.max)
      e.words = `Pick a word target from ${formatNumber(type.wordRange.min)} to ${formatNumber(type.wordRange.max)}.`;
    const c = parseNum(d.chapters);
    const unit = type.structure.bodyUnit;
    if (!c || c < type.chapterRange.min || c > type.chapterRange.max) e.chapters = `Use ${type.chapterRange.min} to ${type.chapterRange.max} ${unit}.`;
    if (d.inSeries && !d.seriesName.trim()) e.seriesName = "Name the series, or switch Part of a series off.";
  }
  return e;
}

/** The wizard's choices as the server's book body. Genre fields, models and the audience go in settings. */
export function bookInput(d: Draft, type: BookType | undefined, profileId: string): BookInput {
  const groups = type ? fieldGroups(type) : [];
  const genre: Record<string, unknown> = {};
  const story = groups.includes("story");
  if (story) {
    genre["pov"] = d.pov;
    genre["tense"] = d.tense;
    genre["heat"] = d.heat;
    if (type && usesClues(type)) {
      genre["twistPlan"] = d.twistPlan;
      genre["clueLedger"] = d.clueLedger;
    }
  }
  if (groups.includes("young")) {
    genre["ageRange"] = d.ageRange;
    if (type && usesNewWord(type)) genre["newWord"] = d.newWord ? d.newWordText.trim() || "writer suggests" : null;
    if (isPictureBook(type)) {
      genre["problem"] = d.problem.trim().slice(0, 300) || null;
      genre["message"] = d.message;
    }
  }
  if (groups.includes("exercises")) genre["exercises"] = d.exercises;
  if (groups.includes("pages")) genre["pages"] = d.pages;
  if (groups.includes("poems")) genre["poemForm"] = d.poemForm;
  if (groups.includes("takeaways")) genre["takeaways"] = d.takeaways;
  const trim = toServerTrim(d.trim);
  const budget = parseNum(d.budget);
  return {
    profileId,
    bookTypeId: type?.id ?? null,
    interiorThemeId: d.interiorTheme || null,
    coverStyleId: d.coverStyle || null,
    ...(type ? { template: type.templateFile.replace(/\.json$/, "") } : {}),
    idea: d.idea.trim() || null,
    notes: d.notes.trim() || null,
    title: workingTitle(d.idea),
    ...(trim ? { trim } : {}),
    paper: d.paper,
    wordTarget: parseNum(d.words) || null,
    ...(budget > 0 ? { budgetUsd: budget } : {}),
    settings: {
      audience: d.audience.trim() || null,
      chapters: parseNum(d.chapters) || null,
      // The size as the wizard shows it, next to the server's compact trim.
      trimLabel: d.trim,
      models: { research: d.researchModel, writing: d.writingModel },
      series: d.inSeries ? { name: d.seriesName.trim(), number: parseNum(d.seriesNumber) || 1 } : null,
      // Fiction: the server sends these to the fiction blueprint and writer (book settings pov and tense).
      ...(story ? { pov: d.pov.trim().slice(0, 200) || null, tense: d.tense } : {}),
      genre,
    },
  };
}

function coverPreview(styleId: string, title: string): CoverDesign | null {
  const style = getCoverStyle(styleId);
  const palette = style?.palettes[0];
  if (!style || !palette) return null;
  const words = title.split(" ");
  const lines = words.length > 2 ? [words.slice(0, Math.ceil(words.length / 2)).join(" "), words.slice(Math.ceil(words.length / 2)).join(" ")] : [title];
  return coverFromStyle(style.id, palette.id, lines);
}

/** Starting a book is a write: a viewer gets the read-only note and a way back instead of the wizard. */
export default function NewBookPage() {
  const me = useVolumeMe();
  if (me.state === "loading")
    return (
      <div role="status" className="px-4 py-6 text-small text-ink-secondary sm:px-8 lg:px-10">
        Checking what your account can do
      </div>
    );
  if (!me.canWrite)
    return (
      <div className="grid max-w-[760px] content-start gap-5 px-4 py-6 sm:px-8 lg:px-10 lg:py-7">
        <PageHeader title="New book" />
        <ReadOnlyBanner />
        <p>
          <Link to="/library" className="text-label text-select underline underline-offset-2">
            Back to the Library
          </Link>
        </p>
      </div>
    );
  return <NewBookWizard />;
}

function NewBookWizard() {
  const navigate = useNavigate();
  const [demoScreen, setScreen] = useScreenState("ready");
  const mode = useWireMode();
  const api = mode === "api";
  const pens = usePenNames(mode, penNames);
  const createBook = useCreateBook();
  const updateBook = useUpdateBook();
  const [bookId, setBookId] = useState<string | null>(null);
  const [startMessage, setStartMessage] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savingDraft, setSavingDraft] = useState(false);
  const screen = mode === "mock" ? demoScreen : pens.state === "ready" ? (pens.list.length === 0 ? "empty" : "ready") : pens.state;
  const [step, setStep] = useState(0);
  const [reached, setReached] = useState(0);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [errors, setErrors] = useState<Errors>({});
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState(false);
  const [modelFor, setModelFor] = useState<"research" | "writing">("writing");
  const headingRef = useRef<HTMLHeadingElement>(null);

  const pen = pens.list.find((p) => p.id === draft.profileId);
  const countFor = (id: string): number => {
    if (!api) return booksForPenName(id).length;
    const raw = pens.raw.find((p) => p.id === id);
    return raw ? (profileBookCount(raw) ?? 0) : 0;
  };
  const profile = pen?.profile;
  const type = getBookType(draft.bookTypeId ?? undefined);
  const est = useMemo(() => estimate(draft), [draft]);
  const title = workingTitle(draft.idea) ?? "Working title";
  const picture = isPictureBook(type);

  function set<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
    setErrors((e) => ({ ...e, [key]: undefined }));
    setSavedAt(null);
  }

  function go(i: number) {
    setStep(i);
    setReached((r) => Math.max(r, i));
    requestAnimationFrame(() => headingRef.current?.focus());
  }

  function next(e?: FormEvent) {
    e?.preventDefault();
    const found = validate(step, draft);
    setErrors(found);
    if (Object.keys(found).length > 0) {
      const first = Object.keys(found)[0];
      requestAnimationFrame(() => document.getElementById(`field-${first}`)?.focus());
      return;
    }
    if (step < steps.length - 1) go(step + 1);
  }

  function chooseProfile(id: string) {
    const p = pens.list.find((x) => x.id === id)?.profile;
    if (!p) return;
    setDraft((d) => applyProfile(d, p));
    setErrors({});
    setSavedAt(null);
  }

  function chooseType(t: BookType) {
    setDraft((d) => applyType(d, t, profile));
    setErrors({});
    setSavedAt(null);
  }

  /** Creates the book on the server, or updates the one Save draft already made. Resolves with its id. */
  async function saveToServer(): Promise<string> {
    if (!draft.profileId) throw new Error("Choose a profile first.");
    const input = bookInput(draft, type, draft.profileId);
    if (bookId) {
      const { profileId, ...patch } = input;
      await updateBook.mutateAsync({ bookId, patch: { ...patch, profileId } });
      return bookId;
    }
    const created = await createBook.mutateAsync(input);
    setBookId(created.id);
    return created.id;
  }

  function saveDraft() {
    if (!api) {
      setSavedAt(DEMO_NOW);
      return;
    }
    setSavingDraft(true);
    setSaveError(null);
    saveToServer().then(
      () => {
        setSavingDraft(false);
        setSavedAt(new Date().toISOString());
      },
      (e: unknown) => {
        setSavingDraft(false);
        setSaveError(apiErrorText(e));
      },
    );
  }

  function start(skipResearch: boolean) {
    setStarting(true);
    setStartError(false);
    setStartMessage(null);
    if (api) {
      saveToServer().then(
        (id) => navigate(picture ? `/books/${id}/writing` : skipResearch ? `/books/${id}/titles` : `/books/${id}/research?run=new`),
        (e: unknown) => {
          setStarting(false);
          setStartError(true);
          setStartMessage(apiErrorText(e));
        },
      );
      return;
    }
    window.setTimeout(() => {
      if (screen === "error") {
        setStarting(false);
        setStartError(true);
        return;
      }
      void navigate(picture ? "/books/milo-and-the-moon-kite/writing" : skipResearch ? "/books/the-calm-ward/titles" : "/books/the-calm-ward/research?run=new");
    }, 1100);
  }

  return (
    <div className="grid grid-cols-1 gap-10 px-4 py-6 sm:px-8 lg:px-10 lg:py-7 xl:grid-cols-[minmax(0,1fr)_300px]">
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] content-start gap-7">
        <PageHeader title="New book" summary="Start from a rough idea or a working title. It takes about a minute." />
        <WizardSteps steps={steps} current={step} reached={reached} onGo={go} />

        <form onSubmit={next} noValidate className="grid gap-6">
          <h2 ref={headingRef} tabIndex={-1} className="font-book text-heading text-ink focus:outline-none">
            {step === 0 && "Who is writing this book?"}
            {step === 1 && "What kind of book is it?"}
            {step === 2 && "What is the book about?"}
            {step === 3 && `Shape the ${type ? type.name.toLowerCase() : "book"}`}
            {step === 4 && "Check and start"}
          </h2>

          {step === 0 && (
            <ProfileStep
              state={screen}
              onRetry={() => (api ? pens.retry() : setScreen("ready"))}
              value={draft.profileId}
              error={errors.profileId}
              onChange={chooseProfile}
              list={pens.list}
              countFor={countFor}
              errorText={api ? pens.error : null}
            />
          )}

          {step === 1 && <BookTypeStep value={draft.bookTypeId} profile={profile} error={errors.bookTypeId} onChoose={chooseType} />}

          {step === 2 && (
            <div className="grid max-w-[760px] gap-5">
              <Textarea
                id="field-idea"
                label="Idea or working title"
                prose
                rows={5}
                value={draft.idea}
                onChange={(e) => set("idea", e.target.value)}
                error={errors.idea}
                hint={
                  type?.category === "fiction"
                    ? "One or two sentences: who it is about, what they want and what stands in the way."
                    : type?.category === "childrens"
                      ? "One or two sentences: the child or animal at the heart of it, and the gentle problem they solve."
                      : "One or two sentences is enough. Say who it is for and what they will be able to do."
                }
                placeholder={
                  type?.category === "fiction"
                    ? "For example: a café owner in a Cornish harbour town falls for the man buying the building next door."
                    : type?.category === "childrens"
                      ? "For example: a small fox who cannot sleep learns to count the stars."
                      : "For example: a guide for night-shift nurses on sleeping and eating well."
                }
              />
              {(!type || type.category === "nonfiction") && (
                <div className="-mt-2">
                  <Button size="sm" variant="ghost" onClick={() => set("idea", exampleIdea)}>
                    Use the example
                  </Button>
                </div>
              )}
              <Input
                label={type?.category === "childrens" ? "Who will read or hear it (optional)" : "Audience hint (optional)"}
                value={draft.audience}
                onChange={(e) => set("audience", e.target.value)}
                placeholder={
                  type?.category === "fiction"
                    ? "For example: readers of small-town romance"
                    : type?.category === "childrens"
                      ? "For example: read aloud at bedtime"
                      : "For example: nurses on adult wards"
                }
              />
              <Textarea
                label="Notes for the researcher (optional)"
                rows={3}
                value={draft.notes}
                onChange={(e) => set("notes", e.target.value)}
                hint="Anything to include or avoid. Stories from your own work stay illustrative."
              />
            </div>
          )}

          {step === 3 && type && (
            <DetailsStep
              draft={draft}
              type={type}
              profile={profile}
              errors={errors}
              set={set}
              modelFor={modelFor}
              onModelFor={setModelFor}
              est={est}
              title={title}
            />
          )}

          {step === 4 && (
            <div className="grid max-w-[760px] gap-5">
              <ReviewBlock title="Profile" onChange={() => go(0)}>
                {pen ? `${pen.name}${pen.imprint ? `, ${pen.imprint}` : ""}` : "Not chosen"}
              </ReviewBlock>
              <ReviewBlock title="Book type" onChange={() => go(1)}>
                {type ? type.name : "Not chosen"}
              </ReviewBlock>
              <ReviewBlock title="Idea" onChange={() => go(2)}>
                <span className="font-book text-prose-sm">{draft.idea}</span>
                {draft.audience && <span className="mt-1 block text-small text-ink-secondary">Audience: {draft.audience}</span>}
                {draft.notes && <span className="mt-1 block text-small text-ink-secondary">Notes: {draft.notes}</span>}
              </ReviewBlock>
              <ReviewBlock title="Details" onChange={() => go(3)}>
                <KeyValueList items={reviewItems(draft, type)} />
              </ReviewBlock>
              <div className="grid gap-1 rounded-md border border-border bg-sheet p-4">
                {picture ? (
                  <p className="text-body text-ink">
                    Next, the Story and spreads step writes the story, paints the character references and one picture for each spread. The pictures cost{" "}
                    {runEstimate(parseNum(draft.chapters) || 10)}, and you see the cost again before anything runs.
                  </p>
                ) : (
                  <p className="text-body text-ink">
                    Research runs first, {`about $${est.research.toFixed(2)}`}, and takes about a minute. The whole book should cost {formatUsd(est.low)} to{" "}
                    {formatUsd(est.high)}.
                  </p>
                )}
                {type && writingArrives(type) && (
                  <p className="text-small text-ink-secondary">
                    Research, titles and the blueprint work for every book type now. Automatic writing for this type arrives in {writingArrives(type)}.
                  </p>
                )}
              </div>
              {startError && (
                <Banner
                  tone="error"
                  title={startMessage ? "The book was not created" : "Could not reach the Volume server"}
                  action={
                    <Button size="sm" onClick={() => start(false)}>
                      Retry
                    </Button>
                  }
                >
                  {startMessage
                    ? `${startMessage} Your answers are kept on this page.`
                    : "Your answers are kept on this page. Check the server is running, then retry."}
                </Banner>
              )}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3 border-t border-border pt-5">
            {step > 0 ? (
              <Button variant="ghost" icon={ArrowLeft} onClick={() => go(step - 1)}>
                Back
              </Button>
            ) : (
              <Button variant="ghost" onClick={() => void navigate("/library")}>
                Cancel
              </Button>
            )}
            <Button
              variant="ghost"
              icon={Save}
              onClick={saveDraft}
              loading={savingDraft}
              loadingLabel="Saving"
              disabledReason={draft.profileId ? undefined : "Choose a profile first."}
            >
              Save draft
            </Button>
            <p role="status" className={saveError ? "text-small text-claim" : "text-small text-success"}>
              {saveError && `Draft not saved. ${saveError}`}
              {!saveError && savedAt && (
                <span className="inline-flex items-center gap-1">
                  <Check size={14} strokeWidth={2} aria-hidden /> Draft saved at {formatTime(savedAt)}
                </span>
              )}
            </p>
            <div className="ml-auto flex flex-wrap gap-3">
              {step < steps.length - 1 ? (
                <Button type="submit" variant="primary" disabledReason={step === 0 && screen !== "ready" ? "Profiles need to load first." : undefined}>
                  Next: {steps[step + 1]?.label}
                </Button>
              ) : picture ? (
                <Button variant="primary" loading={starting} loadingLabel="Creating the book" onClick={() => start(false)}>
                  Create picture book
                </Button>
              ) : (
                <>
                  <Button disabled={starting} onClick={() => start(true)}>
                    Skip to titles
                  </Button>
                  <Button
                    variant="primary"
                    loading={starting}
                    loadingLabel="Creating the book"
                    estimate={`about $${est.research.toFixed(2)}`}
                    onClick={() => start(false)}
                  >
                    Start research
                  </Button>
                </>
              )}
            </div>
          </div>
        </form>

        {mode === "mock" && (
          <DemoStates
            value={demoScreen}
            onChange={(s) => {
              setScreen(s);
              setStartError(false);
              if (s !== "ready") go(s === "error" ? step : 0);
            }}
          />
        )}
      </div>

      <aside aria-label="Your book so far" className="hidden xl:block">
        <div className="sticky top-[calc(var(--shell-topbar)+28px)] grid gap-4 rounded-md border border-border bg-sheet p-5">
          <h2 className="text-[13px] font-semibold text-ink-secondary">Your book so far</h2>
          {type && (
            <div className="flex items-end gap-4">
              <Cover title={title} author={pen?.name ?? ""} design={coverPreview(draft.coverStyle, title)} width={88} hideSubtitle decorative />
              <p className="pb-1 text-small text-ink-secondary">
                {getCoverStyle(draft.coverStyle)?.name ?? "Cover style"} cover, {getInteriorTheme(draft.interiorTheme)?.name ?? "default"} interior
              </p>
            </div>
          )}
          <KeyValueList
            items={[
              { label: "Profile", value: pen?.name ?? "Not chosen" },
              { label: "Type", value: type?.name ?? "Not chosen" },
              ...(type
                ? [
                    { label: "Words", value: formatNumber(parseNum(draft.words) || 0) },
                    { label: unitLabel(type), value: draft.chapters },
                    { label: "Trim", value: draft.trim },
                  ]
                : []),
            ]}
          />
          {type && (
            <div className="border-t border-border pt-4">
              <p className="text-small text-ink-secondary">Estimate</p>
              <p className="num font-book text-[22px] leading-7 text-ink">
                {formatUsd(est.low)} to {formatUsd(est.high)}
              </p>
            </div>
          )}
          {draft.idea && <p className="border-t border-border pt-4 font-book text-[14px] leading-5 text-ink-secondary italic">{draft.idea}</p>}
        </div>
      </aside>
    </div>
  );
}

/* ---------- Review ---------- */

function reviewItems(d: Draft, type: BookType | undefined): { label: string; value: ReactNode; mono?: boolean }[] {
  const items: { label: string; value: ReactNode; mono?: boolean }[] = [
    { label: "Word target", value: formatNumber(parseNum(d.words)) },
    { label: unitLabel(type), value: d.chapters },
  ];
  const groups = type ? fieldGroups(type) : [];
  if (groups.includes("story")) {
    items.push({ label: "Point of view", value: d.pov || "Close third person" });
    items.push({ label: "Tense", value: tenseOptions.find((t) => t.value === d.tense)?.label ?? d.tense });
    items.push({ label: "Heat level", value: heatLabels[d.heat] ?? d.heat });
    items.push({ label: "Series", value: d.inSeries ? `${d.seriesName}, book ${d.seriesNumber}` : "Stand-alone" });
    if (type && usesClues(type))
      items.push({ label: "Planning", value: [d.twistPlan && "Twist plan", d.clueLedger && "Clue ledger"].filter(Boolean).join(", ") || "None" });
  }
  if (groups.includes("young")) {
    items.push({ label: "Reader age", value: d.ageRange });
    if (type && usesNewWord(type)) items.push({ label: "New word", value: d.newWord ? d.newWordText || "The writer suggests one" : "Off" });
    if (isPictureBook(type)) {
      items.push({ label: "Gentle problem", value: d.problem.trim() || "The writer picks one" });
      items.push({ label: "Message", value: d.message.charAt(0).toUpperCase() + d.message.slice(1) });
    }
  }
  if (groups.includes("exercises")) items.push({ label: "Exercises", value: d.exercises.join(", ") || "None" });
  if (groups.includes("pages")) items.push({ label: "Pages", value: d.pages.join(", ") || "None" });
  if (groups.includes("poems")) items.push({ label: "Poems", value: poemForms.find((f) => f.value === d.poemForm)?.label ?? d.poemForm });
  if (groups.includes("takeaways")) items.push({ label: "Key Takeaways", value: d.takeaways ? "On" : "Off" });
  items.push(
    { label: "Trim and paper", value: `${d.trim}, ${d.paper}` },
    { label: "Interior theme", value: getInteriorTheme(d.interiorTheme)?.name ?? d.interiorTheme },
    { label: "Cover style", value: getCoverStyle(d.coverStyle)?.name ?? d.coverStyle },
    { label: "Research model", value: d.researchModel, mono: true },
    { label: "Writing model", value: d.writingModel, mono: true },
  );
  return items;
}

function ReviewBlock({ title, onChange, children }: { title: string; onChange: () => void; children: ReactNode }) {
  return (
    <section className="grid gap-2 border-b border-border pb-4 sm:grid-cols-[140px_minmax(0,1fr)_auto] sm:gap-5">
      <h3 className="text-label text-ink-secondary">{title}</h3>
      <div className="min-w-0 text-body text-ink">{children}</div>
      <Button size="sm" variant="ghost" onClick={onChange} aria-label={`Change ${title.toLowerCase()}`}>
        Change
      </Button>
    </section>
  );
}

/* ---------- Details ---------- */

function Section({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="grid gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border pb-2">
        <h3 className="text-subhead text-ink">{title}</h3>
        {aside}
      </div>
      {children}
    </section>
  );
}

function toggle(list: string[], item: string, on: boolean): string[] {
  return on ? [...list.filter((x) => x !== item), item] : list.filter((x) => x !== item);
}

interface DetailsStepProps {
  draft: Draft;
  type: BookType;
  profile: AuthorProfile | undefined;
  errors: Errors;
  set: <K extends keyof Draft>(key: K, value: Draft[K]) => void;
  modelFor: "research" | "writing";
  onModelFor: (v: "research" | "writing") => void;
  est: { low: number; high: number };
  title: string;
}

function DetailsStep({ draft, type, profile, errors, set, modelFor, onModelFor, est, title }: DetailsStepProps) {
  const groups = fieldGroups(type);
  const words = parseNum(draft.words) || 0;
  const count = parseNum(draft.chapters) || 1;
  const fromProfile = profile?.publishing.defaultBookType === type.id;
  const heatOptions = ["none", ...(profile?.voice.heatLevelOptions ?? ["sweet", "clean", "warm, door closed"]).filter((h) => h !== "none")];
  const themeOptions = [...interiorThemes]
    .sort((a, b) => Number(b.suitsBookTypes.includes(type.id)) - Number(a.suitsBookTypes.includes(type.id)))
    .map((t) => ({
      value: t.id,
      label: t.name,
      hint:
        t.id === type.defaultInteriorTheme
          ? "Default for this type"
          : t.suitsBookTypes.includes(type.id)
            ? "Suits this type"
            : `${t.bodyFont}, ${t.sizes.bodyPt} pt`,
    }));
  const coverOptions = coverStyles.map((s) => ({ value: s.id, label: s.name, hint: s.id === type.defaultCoverStyle ? "Default for this type" : undefined }));
  const trimOptions = trimSizes.map((t) => ({ value: t.value, label: t.value, hint: t.value === type.defaultTrim ? "Default for this type" : t.hint }));
  const design = coverPreview(draft.coverStyle, title);

  return (
    <div className="grid gap-9">
      <p className="-mt-2 max-w-[68ch] text-body text-ink-secondary">
        {fromProfile && profile ? `Filled in from ${profile.name}'s defaults.` : `Filled in from the ${type.name.toLowerCase()} defaults.`} Change anything you
        like; it can all be changed later, before export.
      </p>

      <Section title="Length">
        <div className="grid gap-5 sm:grid-cols-2">
          <Input
            id="field-words"
            label="Word target"
            inputMode="numeric"
            value={draft.words}
            onChange={(e) => set("words", e.target.value)}
            error={errors.words}
            hint={`${type.name}: ${formatNumber(type.wordRange.min)} to ${formatNumber(type.wordRange.max)} words`}
          />
          <Input
            id="field-chapters"
            label={unitLabel(type)}
            inputMode="numeric"
            value={draft.chapters}
            onChange={(e) => set("chapters", e.target.value)}
            error={errors.chapters}
            hint={`${type.chapterRange.min} to ${type.chapterRange.max}, about ${formatNumber(Math.max(1, Math.round(words / count / 10) * 10))} words each`}
          />
        </div>
      </Section>

      {groups.includes("story") && (
        <Section title="Story">
          <div className="grid gap-5 sm:grid-cols-2">
            <Input
              label="Point of view"
              value={draft.pov}
              maxLength={200}
              onChange={(e) => set("pov", e.target.value)}
              hint={
                profile && splitPov(profile.voice.pov).pov === draft.pov && draft.pov
                  ? `From ${profile.name}'s voice`
                  : "For example: close third person, or first person, Mara"
              }
            />
            <Select
              label="Tense"
              options={tenseOptions}
              value={draft.tense}
              onChange={(v) => set("tense", v === "present" ? "present" : "past")}
              hint="The writer keeps every chapter in this tense."
            />
            <Select
              label="Heat level"
              options={heatOptions.map((h) => ({ value: h, label: heatLabels[h] ?? h.charAt(0).toUpperCase() + h.slice(1) }))}
              value={draft.heat}
              onChange={(v) => set("heat", v)}
              hint="How much romance is on the page. Nothing explicit is ever written."
            />
          </div>
          <Switch
            label="Part of a series"
            description={
              profile?.voice.series?.ready ? profile.voice.series.note : "The series name and number go on the cover, the title page and the listing."
            }
            checked={draft.inSeries}
            onChange={(v) => set("inSeries", v)}
          />
          {draft.inSeries && (
            <div className="grid gap-5 sm:grid-cols-[minmax(0,1fr)_160px]">
              <Input
                id="field-seriesName"
                label="Series name"
                value={draft.seriesName}
                onChange={(e) => set("seriesName", e.target.value)}
                error={errors.seriesName}
              />
              <Input label="Book number" inputMode="numeric" value={draft.seriesNumber} onChange={(e) => set("seriesNumber", e.target.value)} />
            </div>
          )}
          {usesClues(type) && (
            <div className="grid gap-3">
              <Checkbox
                label="Twist plan"
                description="The blueprint records what the reader believes, what is true and the chapter where it flips."
                checked={draft.twistPlan}
                onChange={(v) => set("twistPlan", v)}
              />
              <Checkbox
                label="Clue ledger"
                description="Every clue and red herring is logged with its chapter, so the solution is fair."
                checked={draft.clueLedger}
                onChange={(v) => set("clueLedger", v)}
              />
            </div>
          )}
        </Section>
      )}

      {groups.includes("young") && (
        <Section title="For young readers">
          <div className="grid gap-5 sm:grid-cols-2">
            <Select
              label="Reader age"
              options={[...new Set([...ageRanges, draft.ageRange])].map((a) => ({ value: a, label: `Ages ${a}` }))}
              value={draft.ageRange}
              onChange={(v) => set("ageRange", v)}
              hint="Sets the reading level, sentence length and the gentle content rules."
            />
            {usesNewWord(type) && (
              <Input
                label="New word (optional)"
                value={draft.newWordText}
                onChange={(e) => set("newWordText", e.target.value)}
                disabledReason={draft.newWord ? undefined : "Switch on Teach one new word first."}
                hint="Leave blank and the writer suggests one."
                placeholder="For example: gentle"
              />
            )}
          </div>
          {usesNewWord(type) && (
            <Switch
              label="Teach one new word"
              description="Used at least three times in the story and explained on a Word of the day page."
              checked={draft.newWord}
              onChange={(v) => set("newWord", v)}
            />
          )}
          {isPictureBook(type) && (
            <div className="grid gap-5 sm:grid-cols-2">
              <Input
                label="Gentle problem (optional)"
                value={draft.problem}
                maxLength={300}
                onChange={(e) => set("problem", e.target.value)}
                placeholder="For example: the kite will not fly"
                hint={`${GENTLE_PROBLEM_RULE} Leave blank and the writer picks one.`}
              />
              <Select
                label="Message"
                options={messageOptions.map((m) => ({ value: m, label: m.charAt(0).toUpperCase() + m.slice(1) }))}
                value={draft.message}
                onChange={(v) => set("message", v)}
                hint="One positive message for the whole story."
              />
            </div>
          )}
        </Section>
      )}

      {groups.includes("exercises") && (
        <Section title="Exercises" aside={<span className="text-small text-ink-tertiary">Two to four in each chapter</span>}>
          <fieldset className="grid gap-2 sm:grid-cols-2">
            <legend className="sr-only">Exercise styles</legend>
            {exerciseStyles.map((x) => (
              <Checkbox key={x} label={x} checked={draft.exercises.includes(x)} onChange={(v) => set("exercises", toggle(draft.exercises, x, v))} />
            ))}
          </fieldset>
        </Section>
      )}

      {groups.includes("pages") && (
        <Section title="Pages">
          <fieldset className="grid gap-2 sm:grid-cols-2">
            <legend className="sr-only">Page types</legend>
            {pageTypes.map((x) => (
              <Checkbox key={x} label={x} checked={draft.pages.includes(x)} onChange={(v) => set("pages", toggle(draft.pages, x, v))} />
            ))}
          </fieldset>
        </Section>
      )}

      {groups.includes("poems") && (
        <Section title="Poems">
          <div className="grid content-start gap-2">
            <span className="text-label text-ink">Form</span>
            <SegmentedControl<string> label="Form" options={poemForms} value={draft.poemForm} onChange={(v) => set("poemForm", v)} />
          </div>
        </Section>
      )}

      {groups.includes("takeaways") && (
        <Section title="Content">
          <Switch
            label="Key Takeaways in every chapter"
            description="3 to 5 points after each chapter. Switch off for a purely narrative book."
            checked={draft.takeaways}
            onChange={(v) => set("takeaways", v)}
          />
        </Section>
      )}

      <Section title="Print and look">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_auto] xl:grid-cols-1">
          <div className="grid content-start gap-5 sm:grid-cols-2">
            <Select label="Trim size" options={trimOptions} value={draft.trim} onChange={(v) => set("trim", v)} hint="Paperback page size." />
            <div className="grid content-start gap-2">
              <span className="text-label text-ink">Paper</span>
              <SegmentedControl<"white" | "cream">
                label="Paper"
                options={[
                  { value: "cream", label: "Cream" },
                  { value: "white", label: "White" },
                ]}
                value={draft.paper}
                onChange={(v) => set("paper", v)}
              />
              <span className="text-small text-ink-secondary">{type.interior === "colour" ? "Colour interior" : "Black and white interior"}</span>
            </div>
            <Select
              label="Interior theme"
              options={themeOptions}
              value={draft.interiorTheme}
              onChange={(v) => set("interiorTheme", v)}
              hint={getInteriorTheme(draft.interiorTheme)?.description}
            />
            <Select
              label="Cover style"
              options={coverOptions}
              value={draft.coverStyle}
              onChange={(v) => set("coverStyle", v)}
              hint={getCoverStyle(draft.coverStyle)?.description}
            />
          </div>
          <figure className="grid justify-items-start gap-2 lg:justify-items-center xl:hidden">
            <Cover title={title} author={profile?.name ?? ""} design={design} width={132} hideSubtitle decorative />
            <figcaption className="text-small text-ink-tertiary">Cover style preview</figcaption>
          </figure>
        </div>
      </Section>

      <Section
        title="Models"
        aside={
          <SegmentedControl<"research" | "writing">
            label="Choose the model for"
            size="sm"
            options={[
              { value: "writing", label: "Writing" },
              { value: "research", label: "Research" },
            ]}
            value={modelFor}
            onChange={onModelFor}
          />
        }
      >
        {modelFor === "research" ? (
          <>
            <ModelPicker label="Research model" models={textModels} value={draft.researchModel} onChange={(v) => set("researchModel", v)} />
            {!getModel(draft.researchModel)?.capabilities.includes("Web search") && (
              <Banner tone="attention" title="This model cannot search the web">
                Research keeps only sources the model cites from a live search. Pick a model marked Web search, or skip research later.
              </Banner>
            )}
          </>
        ) : (
          <ModelPicker label="Writing model" models={textModels} value={draft.writingModel} onChange={(v) => set("writingModel", v)} />
        )}
        <p className="text-small text-ink-secondary">
          {profile?.models.writing && modelFor === "writing"
            ? `${profile.name}'s profile picks this writer.`
            : "Defaults come from Settings and the profile. Change them per book here."}
        </p>
      </Section>

      <Section title="Estimated cost">
        <div className="rounded-md border border-border bg-sheet p-4 sm:max-w-md">
          <p className="text-small text-ink-secondary">Estimated cost for the whole book</p>
          <p className="num mt-1 font-book text-figure text-ink">
            {formatUsd(est.low)} <span className="font-ui text-label text-ink-secondary normal-nums">to {formatUsd(est.high)}</span>
          </p>
          <p className="mt-1 text-small text-ink-tertiary">
            Example prices. The app reads live prices from OpenRouter and your Anthropic account. Nothing stops a book at a limit: if the credit runs out, the
            book pauses and tells you to top up.
          </p>
        </div>
      </Section>
    </div>
  );
}

/* ---------- Profile ---------- */

function ProfileStep({
  state,
  onRetry,
  value,
  error,
  onChange,
  list,
  countFor,
  errorText,
}: {
  state: string;
  onRetry: () => void;
  value: string | null;
  error: string | undefined;
  onChange: (id: string) => void;
  list: PenName[];
  countFor: (id: string) => number;
  errorText: string | null;
}) {
  if (state === "loading") {
    return (
      <div role="status" aria-label="Loading profiles" className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="grid gap-2.5 rounded-md border border-border bg-sheet p-5">
            <div className="flex items-center gap-3">
              <Skeleton variant="circle" className="size-10" />
              <Skeleton className="w-32" />
            </div>
            <Skeleton className="w-full" />
            <Skeleton className="w-2/3" />
          </div>
        ))}
      </div>
    );
  }
  if (state === "empty") {
    return (
      <EmptyState
        drawing="pen"
        title="Add a profile first"
        body="Every book is written under a profile, with its voice, bio, defaults and models. Add one, then come back."
        action={
          <Link
            to="/profiles/new"
            className="inline-flex h-11 items-center gap-2 rounded-sm border border-border-strong bg-sheet px-4 text-label font-semibold text-ink hover:bg-sunken"
          >
            <Plus size={16} aria-hidden /> Add profile
          </Link>
        }
      />
    );
  }
  if (state === "error") {
    return (
      <Banner
        tone="error"
        title="Could not load your profiles"
        action={
          <Button size="sm" onClick={onRetry}>
            Retry
          </Button>
        }
      >
        {errorText ?? "The Volume server did not answer. Nothing you entered is lost."}
      </Banner>
    );
  }
  return (
    <fieldset className="grid gap-3" aria-describedby={error ? "profile-error" : undefined}>
      <legend className="sr-only">Profile</legend>
      <div id="field-profileId" tabIndex={-1} className="grid gap-3 focus:outline-none md:grid-cols-2 2xl:grid-cols-3">
        {list.map((p) => {
          const count = countFor(p.id);
          const defType = getBookType(p.profile.publishing.defaultBookType);
          return (
            <ChoiceCard key={p.id} name="profile" value={p.id} checked={value === p.id} onChange={onChange}>
              <span className="flex items-center gap-3 pr-8">
                <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-full bg-spine text-label font-semibold text-ink-on-spine">
                  {p.initials}
                </span>
                <span className="grid">
                  <span className="font-book text-[18px] leading-6 font-medium text-ink">{p.name}</span>
                  <span className="text-small text-ink-secondary">
                    {p.imprint ?? (p.realPerson ? "Own name" : "Pen name")}, {count} {count === 1 ? "book" : "books"}
                  </span>
                </span>
              </span>
              <span className="font-book text-[15px] leading-[22px] text-ink italic">{p.voice.slice(0, 2).join(". ")}.</span>
              {defType && (
                <span className="text-small text-ink-secondary">
                  Usual type: {defType.name}, {formatNumber(p.profile.publishing.defaultWordTarget)} words, {p.profile.publishing.defaultTrim}
                </span>
              )}
              <span className="flex flex-wrap gap-1.5 pt-1">
                {p.genres.slice(0, 3).map((g) => (
                  <span key={g} className="inline-flex h-6 items-center rounded-pill bg-sunken px-2 text-caption text-ink-secondary">
                    {g}
                  </span>
                ))}
              </span>
            </ChoiceCard>
          );
        })}
      </div>
      {error && (
        <p id="profile-error" role="alert" className="text-small text-claim">
          {error}
        </p>
      )}
    </fieldset>
  );
}
