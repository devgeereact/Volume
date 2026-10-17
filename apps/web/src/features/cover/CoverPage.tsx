import { useEffect, useMemo, useRef, useState } from "react";
import { useCanWrite } from "../../lib/access";
import { Link } from "react-router";
import { Check, Download, RotateCw, Sparkles, X } from "lucide-react";
import {
  Banner,
  Button,
  Chip,
  Cover,
  Inspector,
  InspectorSection,
  KeyValueList,
  Loader,
  PageHeader,
  ProgressBar,
  SegmentedControl,
  Skeleton,
  StatusChip,
  Switch,
  Textarea,
} from "../../components/ui";
import type { Book, CoverDesign } from "../../demo";
import { cn } from "../../lib/cn";
import { formatDayMonth } from "../../lib/format";
import { useBook } from "../../lib/useBook";
import { useStepAction, type StepAction } from "../../lib/stepAction";
import { NotFound } from "../../shell/NotFound";
import { ErrorPanel, LoadingBlock, useScreenState } from "../writing/screenState";
import {
  coverBleedIn,
  coverMinDpi,
  ebookCoverPx,
  ebookMinRatio,
  inches,
  pageLimits,
  parseTrim,
  rulesVerifiedOn,
  spinePerPage,
  spineTextMinPages,
  wrapSize,
  type Paper,
} from "../export/kdpRules";
import {
  blurbFor,
  briefFor,
  conceptsFor,
  genreOptions,
  interiorPages,
  layoutCover,
  moodOptions,
  withPalette,
  type Concept,
  type CoverBrief,
  type TitlePosition,
} from "./concepts";
import { WrapPreview } from "./WrapPreview";
import { ApiCover } from "./ApiCover";

/* Cover studio (docs/03-design/UX-SPEC.md, M10): brief, four concepts, typography, eBook and wrap previews,
   then Build covers. Concepts are abstract and typographic; the type is set by Volume, never painted. */

type Step = "brief" | "concepts" | "choose" | "build";
type ConceptState = { status: "ready" } | { status: "making" } | { status: "failed" };
type Preview = "ebook" | "wrap" | "thumb";

const MAKE_MS = 650;
const BUILD_STEPS = [
  "Compose the eBook cover",
  "Save JPEG, 1600 x 2560, RGB",
  "Compose the paperback wrap",
  `Check images are ${coverMinDpi} DPI or more`,
  "Save the wrap PDF",
];

export default function CoverPage() {
  const { book, penName, from, apiBook } = useBook();
  const { state, retry } = useScreenState();
  if (!book) return <NotFound what="book" />;
  if (from === "api")
    return (
      <div className="px-4 py-6 sm:px-8 lg:px-10 lg:py-7">
        <ApiCover key={book.id} book={book} apiBook={apiBook} penName={penName} />
      </div>
    );
  return (
    <div className="px-4 py-6 sm:px-8 lg:px-10 lg:py-7">
      {state === "loading" && <LoadingBlock label="Loading the cover studio" rows={6} />}
      {state === "error" && (
        <>
          <h1 className="font-book text-title text-ink">Cover studio</h1>
          <ErrorPanel
            className="mt-5 max-w-[720px]"
            title="Could not load the cover studio"
            body="The concepts and brief did not arrive. Nothing was charged. Retry to load them again."
            onRetry={retry}
          />
        </>
      )}
      {(state === "ready" || state === "empty") && (
        <Studio key={book.id + state} book={book} author={penName?.name ?? ""} fresh={state === "empty" || !book.cover} />
      )}
    </div>
  );
}

function Studio({ book, author, fresh }: { book: Book; author: string; fresh: boolean }) {
  const canWrite = useCanWrite();
  const allConcepts = useMemo(() => conceptsFor(book), [book]);
  const [brief, setBrief] = useState<CoverBrief>(() => briefFor(book));
  const [briefDone, setBriefDone] = useState(!fresh);
  const [concepts, setConcepts] = useState<Record<string, ConceptState>>(() =>
    fresh ? {} : Object.fromEntries(allConcepts.map((c) => [c.id, { status: "ready" }])),
  );
  const [failOnce, setFailOnce] = useState(true);
  const [chosen, setChosen] = useState<string | null>(fresh ? null : "a");
  const [used, setUsed] = useState(false);
  const [size, setSize] = useState(100);
  const [position, setPosition] = useState<TitlePosition>("style");
  const [paletteIdx, setPaletteIdx] = useState(() => allConcepts[0]?.paletteIndex ?? 0);
  const [showSubtitle, setShowSubtitle] = useState(true);
  const [preview, setPreview] = useState<Preview>("wrap");
  const interior = interiorPages[book.id];
  const [pagesText, setPagesText] = useState(String(interior?.pages ?? 160));
  const [paper, setPaper] = useState<Paper>(interior?.paper ?? "cream");
  const [build, setBuild] = useState<{ step: number; done: boolean } | null>(null);
  const [announce, setAnnounce] = useState("");
  const timers = useRef<number[]>([]);
  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);

  const trim = parseTrim(book.trim);
  const pages = Number.parseInt(pagesText, 10);
  const pagesValid = Number.isFinite(pages) && pages >= pageLimits.min && pages <= pageLimits.max6x9;
  const pagesForMaths = pagesValid ? pages : (interior?.pages ?? 160);
  const wrap = wrapSize(trim, pagesForMaths, paper);

  const concept = allConcepts.find((c) => c.id === chosen) ?? null;
  const design: CoverDesign | null = concept ? styled(concept, paletteIdx, { subtitle: showSubtitle ? book.subtitle : undefined, size, position }) : null;
  const making = Object.values(concepts).some((c) => c.status === "making");
  const madeCount = Object.values(concepts).filter((c) => c.status === "ready").length;
  const step: Step = !briefDone ? "brief" : madeCount === 0 || making ? "concepts" : !used ? "choose" : "build";

  function makeConcepts() {
    setChosen(null);
    setUsed(false);
    setBuild(null);
    setConcepts(Object.fromEntries(allConcepts.map((c) => [c.id, { status: "making" }])));
    setAnnounce("Making 4 concepts.");
    allConcepts.forEach((c, i) => {
      timers.current.push(
        window.setTimeout(
          () => {
            const fail = failOnce && c.id === "d";
            setConcepts((m) => ({ ...m, [c.id]: { status: fail ? "failed" : "ready" } }));
            if (i === allConcepts.length - 1) setAnnounce(failOnce ? "3 concepts ready. Concept D failed and was not charged." : "4 concepts ready.");
          },
          MAKE_MS * (i + 1),
        ),
      );
    });
    setFailOnce(false);
  }

  function retryConcept(id: string) {
    setConcepts((m) => ({ ...m, [id]: { status: "making" } }));
    timers.current.push(
      window.setTimeout(() => {
        setConcepts((m) => ({ ...m, [id]: { status: "ready" } }));
        setAnnounce("Concept ready.");
      }, MAKE_MS * 1.5),
    );
  }

  function buildCovers() {
    setBuild({ step: 0, done: false });
    BUILD_STEPS.forEach((_, i) => {
      timers.current.push(window.setTimeout(() => setBuild({ step: i + 1, done: i === BUILD_STEPS.length - 1 }), 600 * (i + 1)));
    });
    timers.current.push(window.setTimeout(() => setAnnounce("Covers built."), 600 * BUILD_STEPS.length));
  }

  const action: StepAction | null = (() => {
    switch (step) {
      case "brief":
        return { label: "Save brief", onClick: () => setBriefDone(true) };
      case "concepts":
        return { label: "Make concepts", estimate: "about $0.16", onClick: makeConcepts, disabledReason: making ? "Making the concepts now." : undefined };
      case "choose":
        return { label: "Use this concept", onClick: () => setUsed(true), disabledReason: chosen ? undefined : "Pick a concept first." };
      case "build":
        if (build?.done) return null;
        return {
          label: build ? "Building covers" : "Build covers",
          onClick: buildCovers,
          disabledReason: build
            ? "The covers are building."
            : !pagesValid
              ? "Fix the page count first."
              : interior
                ? undefined
                : "Build the interior PDF first. The wrap needs its real page count.",
        };
    }
  })();
  useStepAction(action);

  const status =
    step === "brief"
      ? "Start with the brief. The concepts follow its mood, colours and symbols."
      : step === "concepts"
        ? making
          ? "Making four concepts, one in each cover style."
          : "Brief saved. Make concepts to compare four directions."
        : step === "choose"
          ? concept
            ? `${concept.name} picked. Set the type, then use it.`
            : "Pick the concept you like best."
          : build?.done
            ? "Covers built and added to the upload pack."
            : `${concept?.name ?? "The concept"} is in use. Check the wrap, then build the covers.`;

  return (
    <>
      <PageHeader title="Cover studio" summary="Brief, concepts and type, then the eBook cover and the paperback wrap." />
      <p role="status" className="mt-2 text-small text-ink-secondary">
        {status}
      </p>

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_var(--vol-inspector)]">
        <div className="grid min-w-0 content-start gap-6">
          <BriefCard brief={brief} onChange={setBrief} done={briefDone} onEdit={() => setBriefDone(false)} />

          <section aria-labelledby="concepts-title" className="rounded-md border border-border bg-sheet p-5 sm:p-6">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 id="concepts-title" className="font-book text-heading text-ink">
                Concepts
              </h2>
              {madeCount > 0 && !making && canWrite && (
                <Button size="sm" variant="ghost" icon={RotateCw} estimate="about $0.16" onClick={makeConcepts}>
                  Make new concepts
                </Button>
              )}
            </div>
            <p className="mt-1 text-small text-ink-secondary">
              Background art from the image model, marked AI-generated. Volume sets the title, subtitle and author.
            </p>
            {Object.keys(concepts).length === 0 ? (
              <div className="mt-4 rounded-md border border-dashed border-border-strong p-5">
                <p className="text-label text-ink">{briefDone ? "No concepts yet." : "Write the brief first."}</p>
                <p className="mt-1 text-small text-ink-secondary">
                  {briefDone ? "Make concepts to get four directions to compare." : "The concepts follow the brief: mood, colours, symbols and what to avoid."}
                </p>
              </div>
            ) : (
              <div role="radiogroup" aria-label="Concepts" className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-4">
                {allConcepts.map((c) => (
                  <ConceptTile
                    key={c.id}
                    concept={c}
                    design={chosen === c.id && design ? design : styled(c, c.paletteIndex, { subtitle: book.subtitle })}
                    inUse={used && chosen === c.id}
                    state={concepts[c.id]}
                    title={book.title}
                    subtitle={book.subtitle}
                    author={author}
                    checked={chosen === c.id}
                    onPick={() => {
                      setChosen(c.id);
                      setUsed(false);
                      setPaletteIdx(c.paletteIndex);
                      setBuild(null);
                    }}
                    onRetry={() => retryConcept(c.id)}
                  />
                ))}
              </div>
            )}
          </section>

          <section aria-labelledby="type-title" className="rounded-md border border-border bg-sheet p-5 sm:p-6">
            <h2 id="type-title" className="font-book text-heading text-ink">
              Type and preview
            </h2>
            {!concept ? (
              <p className="mt-2 text-body text-ink-secondary">Pick a concept to set the title and see the eBook cover and wrap.</p>
            ) : (
              <div className="mt-4 grid grid-cols-1 gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
                <div className="grid content-start gap-4">
                  <div>
                    <label htmlFor="title-size" className="flex justify-between text-label text-ink">
                      Title size <span className="num text-ink-secondary">{size}%</span>
                    </label>
                    <input
                      id="title-size"
                      type="range"
                      min={70}
                      max={130}
                      step={5}
                      value={size}
                      onChange={(e) => setSize(Number(e.target.value))}
                      className="mt-2 h-11 w-full accent-(--vol-select)"
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <span aria-hidden className="text-label text-ink">
                      Title position
                    </span>
                    <SegmentedControl
                      label="Title position"
                      value={position}
                      onChange={setPosition}
                      options={[
                        { value: "style", label: "Style" },
                        { value: "top", label: "Top" },
                        { value: "middle", label: "Middle" },
                        { value: "bottom", label: "Bottom" },
                      ]}
                    />
                  </div>
                  <fieldset className="grid gap-1.5">
                    <legend className="mb-1.5 text-label text-ink">Colours</legend>
                    <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-3 lg:grid-cols-1">
                      {concept.style.palettes.map((pal, i) => (
                        <label
                          key={pal.id}
                          className="relative flex min-h-11 cursor-pointer items-center gap-2.5 rounded-sm border border-border-strong bg-sheet px-2.5 text-small text-ink has-checked:border-select has-checked:bg-select-wash has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-select"
                        >
                          <input type="radio" name="cover-colours" className="sr-only" checked={paletteIdx === i} onChange={() => setPaletteIdx(i)} />
                          <span
                            aria-hidden
                            className="relative h-6 w-5 shrink-0 overflow-hidden rounded-xs border border-border"
                            style={{ background: pal.background }}
                          >
                            <span className="absolute inset-x-1 top-1.5 h-1 rounded-pill" style={{ background: pal.title }} />
                            <span className="absolute inset-x-1 top-3.5 h-1 w-2 rounded-pill" style={{ background: pal.motif }} />
                          </span>
                          <span className="min-w-0">{pal.name}</span>
                        </label>
                      ))}
                    </div>
                  </fieldset>
                  <Switch label="Show the subtitle" checked={showSubtitle} onChange={setShowSubtitle} />
                </div>

                <div className="grid min-w-0 content-start gap-4">
                  <SegmentedControl
                    label="Preview"
                    value={preview}
                    onChange={setPreview}
                    options={[
                      { value: "ebook", label: "eBook" },
                      { value: "wrap", label: "Paperback wrap" },
                      { value: "thumb", label: "Thumbnail" },
                    ]}
                  />
                  {design && preview === "ebook" && (
                    <figure className="grid justify-items-start gap-3">
                      <Cover title={book.title} subtitle={showSubtitle ? book.subtitle : undefined} author={author} design={design} width={260} />
                      <figcaption className="num text-small text-ink-secondary">
                        {ebookCoverPx.width} x {ebookCoverPx.height} px, JPEG, RGB. Shown at {Math.round((260 / ebookCoverPx.width) * 100)}%. Height to width{" "}
                        {(ebookCoverPx.height / ebookCoverPx.width).toFixed(2)}; KDP needs {ebookMinRatio} or more.
                      </figcaption>
                    </figure>
                  )}
                  {design && preview === "thumb" && (
                    <figure className="grid justify-items-start gap-3">
                      <Cover title={book.title} subtitle={showSubtitle ? book.subtitle : undefined} author={author} design={design} width={160} />
                      <figcaption className="flex items-center gap-1.5 text-small text-success">
                        <Check size={14} strokeWidth={2} aria-hidden />
                        Title legible at 160 px wide, as on a search results page.
                      </figcaption>
                    </figure>
                  )}
                  {design && preview === "wrap" && (
                    <div className="grid gap-4">
                      <div className="grid grid-cols-[minmax(0,160px)_auto] items-center justify-start gap-x-4 gap-y-1.5">
                        <label htmlFor="pages" className="text-label text-ink">
                          Page count
                        </label>
                        <span aria-hidden className="text-label text-ink">
                          Paper
                        </span>
                        <input
                          id="pages"
                          inputMode="numeric"
                          value={pagesText}
                          onChange={(e) => setPagesText(e.target.value.replace(/[^\d]/g, ""))}
                          aria-invalid={!pagesValid}
                          aria-describedby="pages-hint"
                          className={cn(
                            "num h-11 w-full rounded-sm border bg-sheet px-3 text-body text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-select",
                            pagesValid ? "border-border-strong" : "border-claim",
                          )}
                        />
                        <SegmentedControl
                          label="Paper"
                          value={paper}
                          onChange={setPaper}
                          options={[
                            { value: "white", label: "White" },
                            { value: "cream", label: "Cream" },
                          ]}
                        />
                      </div>
                      <p id="pages-hint" className={cn("text-small", pagesValid ? "text-ink-secondary" : "text-claim")} role={pagesValid ? undefined : "alert"}>
                        {pagesValid
                          ? interior
                            ? `The interior PDF has ${interior.pages} pages (built ${formatDayMonth(interior.builtAt)}). Try other counts here; the build always uses the real one.`
                            : "Try a page count here. The build uses the interior PDF's real count."
                          : `Use ${pageLimits.min} to ${pageLimits.max6x9} pages for ${book.trim}.`}
                      </p>
                      <WrapPreview
                        title={book.title}
                        subtitle={book.subtitle}
                        author={author}
                        design={design}
                        showSubtitle={showSubtitle}
                        blurb={blurbFor(book)}
                        trim={trim}
                        pages={pagesForMaths}
                        paper={paper}
                      />
                      <div className="rounded-md bg-canvas p-4 text-small text-ink-secondary">
                        <p className="num text-ink">
                          Spine = {pagesForMaths} pages x {spinePerPage[paper]} in ({paper}) = <b className="font-semibold">{inches(wrap.spine)}</b>
                        </p>
                        <p className="num mt-1">
                          Wrap = {coverBleedIn} + {trim.w} + {wrap.spine.toFixed(4)} + {trim.w} + {coverBleedIn} = {inches(wrap.width)} wide,{" "}
                          {inches(wrap.height, 3)} high
                        </p>
                        <p className={cn("mt-1", pagesForMaths >= spineTextMinPages ? "text-ink-secondary" : "text-accent-text")}>
                          {pagesForMaths >= spineTextMinPages
                            ? `Spine text on: ${spineTextMinPages} pages or more.`
                            : `No spine text: KDP allows it from ${spineTextMinPages} pages. Volume uses ${spineTextMinPages} to be safe.`}
                        </p>
                        <p className="mt-1">KDP rules 3.8 to 3.10, checked {formatDayMonth(rulesVerifiedOn)}.</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </section>

          {build && (
            <section aria-labelledby="build-title" className="rounded-md border border-border bg-sheet p-5 sm:p-6">
              <h2 id="build-title" className="font-book text-heading text-ink">
                {build.done ? "Covers built" : "Building covers"}
              </h2>
              <ProgressBar
                className="mt-3"
                value={build.step}
                max={BUILD_STEPS.length}
                live={!build.done}
                label="Cover build progress"
                valueText={`${build.step} of ${BUILD_STEPS.length} steps`}
              />
              <ol className="mt-3 grid gap-1.5 text-[14px]">
                {BUILD_STEPS.map((s, i) => (
                  <li key={s} className={cn("flex items-center gap-2", i < build.step ? "text-ink" : "text-ink-tertiary")}>
                    {i < build.step ? (
                      <Check size={14} strokeWidth={2} className="text-success" aria-hidden />
                    ) : i === build.step ? (
                      <Loader />
                    ) : (
                      <span className="w-3.5" />
                    )}
                    {s}
                  </li>
                ))}
              </ol>
              {build.done && (
                <Banner tone="success" title="Two files ready for the upload pack" className="mt-4">
                  {slug(book)}-ebook-cover.jpg and {slug(book)}-paperback-wrap-{trim.w}x{trim.h}-{paper}-{pagesForMaths}p.pdf. The AI disclosure now records
                  AI-generated images.{" "}
                  <Link to={`/books/${book.id}/export`} className="font-medium text-select underline underline-offset-2">
                    Open Export
                  </Link>
                </Banner>
              )}
            </section>
          )}
        </div>

        <CoverInspector book={book} pages={pagesForMaths} paper={paper} interiorExists={Boolean(interior)} built={build?.done === true} />
      </div>
      <span className="sr-only" role="status" aria-live="polite">
        {announce}
      </span>
    </>
  );
}

export function styled(c: Concept, paletteIdx: number, opts: Parameters<typeof layoutCover>[1]): CoverDesign {
  const pal = c.style.palettes[paletteIdx];
  return layoutCover(pal ? withPalette(c.base, pal) : c.base, opts);
}

function slug(book: Book): string {
  return book.id;
}

export function BriefCard({ brief, onChange, done, onEdit }: { brief: CoverBrief; onChange: (b: CoverBrief) => void; done: boolean; onEdit: () => void }) {
  const canWrite = useCanWrite();
  const [colourText, setColourText] = useState("");
  const [symbolText, setSymbolText] = useState("");
  const toggle = (key: "genre" | "mood", v: string) =>
    onChange({ ...brief, [key]: brief[key].includes(v) ? brief[key].filter((x) => x !== v) : [...brief[key], v] });

  if (done)
    return (
      <section aria-labelledby="brief-title" className="rounded-md border border-border bg-sheet p-5 sm:p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="brief-title" className="font-book text-heading text-ink">
            Brief
          </h2>
          {canWrite && (
            <Button size="sm" variant="ghost" onClick={onEdit}>
              Edit brief
            </Button>
          )}
        </div>
        <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-2 text-[14px] leading-5 sm:grid-cols-[140px_minmax(0,1fr)]">
          <dt className="text-ink-secondary">Genre signals</dt>
          <dd className="text-ink">{brief.genre.join(", ") || "None yet"}</dd>
          <dt className="text-ink-secondary">Mood</dt>
          <dd className="text-ink">{brief.mood.join(", ") || "None yet"}</dd>
          <dt className="text-ink-secondary">Colours</dt>
          <dd className="text-ink">{brief.colours.join(", ") || "Open"}</dd>
          <dt className="text-ink-secondary">Symbols</dt>
          <dd className="text-ink">{brief.symbols.join(", ") || "Open"}</dd>
          <dt className="text-ink-secondary">Avoid</dt>
          <dd className="text-ink">{brief.avoid || "Nothing listed"}</dd>
        </dl>
      </section>
    );

  return (
    <section aria-labelledby="brief-title" className="rounded-md border border-border bg-sheet p-5 sm:p-6">
      <h2 id="brief-title" className="font-book text-heading text-ink">
        Brief
      </h2>
      <p className="mt-1 text-small text-ink-secondary">Written from the blueprint and the pen name's brand. Change anything before making concepts.</p>
      <fieldset className="mt-4">
        <legend className="text-label text-ink">Genre signals</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {genreOptions.map((g) => (
            <Chip key={g} pressed={brief.genre.includes(g)} onClick={() => toggle("genre", g)}>
              {g}
            </Chip>
          ))}
        </div>
      </fieldset>
      <fieldset className="mt-4">
        <legend className="text-label text-ink">Mood</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {moodOptions.map((m) => (
            <Chip key={m} pressed={brief.mood.includes(m)} onClick={() => toggle("mood", m)}>
              {m}
            </Chip>
          ))}
        </div>
      </fieldset>
      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
        <TagField
          label="Colours"
          items={brief.colours}
          text={colourText}
          setText={setColourText}
          onChange={(colours) => onChange({ ...brief, colours })}
          placeholder="For example: plum"
        />
        <TagField
          label="Symbols"
          items={brief.symbols}
          text={symbolText}
          setText={setSymbolText}
          onChange={(symbols) => onChange({ ...brief, symbols })}
          placeholder="For example: open door"
        />
      </div>
      <Textarea className="mt-4" label="What to avoid" rows={2} value={brief.avoid} onChange={(e) => onChange({ ...brief, avoid: e.target.value })} />
    </section>
  );
}

function TagField({
  label,
  items,
  text,
  setText,
  onChange,
  placeholder,
}: {
  label: string;
  items: string[];
  text: string;
  setText: (s: string) => void;
  onChange: (v: string[]) => void;
  placeholder: string;
}) {
  const id = `tag-${label.toLowerCase()}`;
  function add() {
    const v = text.trim();
    if (v && !items.includes(v)) onChange([...items, v]);
    setText("");
  }
  return (
    <div className="grid content-start gap-1.5">
      <label htmlFor={id} className="text-label text-ink">
        {label}
      </label>
      <div className="flex gap-2">
        <input
          id={id}
          value={text}
          placeholder={placeholder}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          className="h-11 min-w-0 flex-1 rounded-sm border border-border-strong bg-sheet px-3 text-body text-ink placeholder:text-ink-tertiary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-select"
        />
        <Button onClick={add}>Add</Button>
      </div>
      {items.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {items.map((it) => (
            <li key={it} className="inline-flex h-8 items-center gap-1 rounded-pill bg-sunken pr-1 pl-3 text-small text-ink">
              {it}
              <button
                type="button"
                onClick={() => onChange(items.filter((x) => x !== it))}
                className="grid size-6 place-items-center rounded-full text-ink-secondary hover:bg-border hover:text-ink hit-44"
              >
                <X size={12} strokeWidth={2} aria-hidden />
                <span className="sr-only">Remove {it}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ConceptTile({
  concept,
  design,
  inUse,
  state,
  title,
  subtitle,
  author,
  checked,
  onPick,
  onRetry,
}: {
  concept: Concept;
  design: CoverDesign;
  inUse: boolean;
  state: ConceptState | undefined;
  title: string;
  subtitle: string;
  author: string;
  checked: boolean;
  onPick: () => void;
  onRetry: () => void;
}) {
  if (!state || state.status === "making")
    return (
      <div role="status" aria-label={`Making ${concept.name}`} className="grid gap-2">
        <Skeleton variant="cover" className="w-full" />
        <p className="flex items-center gap-2 text-small text-ink-secondary">
          <Loader />
          Making {concept.name}
        </p>
      </div>
    );
  if (state.status === "failed")
    return (
      <div className="grid content-start gap-2">
        <div className="grid aspect-[2/3] w-full place-items-center rounded-cover border border-dashed border-claim bg-claim-wash p-3 text-center">
          <p className="text-small text-claim">{concept.name} failed. The image model did not answer. No charge.</p>
        </div>
        <Button size="sm" icon={RotateCw} onClick={onRetry}>
          Retry
        </Button>
      </div>
    );
  return (
    <label className="group grid cursor-pointer content-start gap-2">
      <input type="radio" name="concept" className="peer sr-only" checked={checked} onChange={onPick} />
      <span
        className={cn(
          "block rounded-sm p-1.5 ring-offset-2 ring-offset-sheet transition-colors duration-(--vol-dur-fast)",
          "peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-select",
          checked ? "bg-select-wash ring-2 ring-select" : "hover:bg-sunken",
        )}
      >
        <Cover title={title} subtitle={subtitle} author={author} design={design} className="w-full" decorative />
      </span>
      <span className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
        <span className={cn("text-label", checked ? "font-semibold text-select" : "text-ink")}>
          {concept.name}
          <span className="sr-only">, {concept.style.name}</span>
        </span>
        {inUse && <StatusChip status="passed">In use</StatusChip>}
      </span>
      <span className="text-small text-ink-secondary">
        <span className="font-medium text-ink">
          {concept.style.name}
          {concept.own ? ", the book's style" : ""}.
        </span>{" "}
        {concept.note}
      </span>
    </label>
  );
}

export function CoverInspector({
  book,
  pages,
  paper,
  interiorExists,
  built,
}: {
  book: Book;
  pages: number;
  paper: Paper;
  interiorExists: boolean;
  built: boolean;
}) {
  const trim = parseTrim(book.trim);
  const wrap = wrapSize(trim, pages, paper);
  return (
    <Inspector label="Cover spec" width="100%" className="self-start rounded-md border xl:sticky xl:top-[calc(var(--shell-topbar)+16px)]">
      <InspectorSection title="eBook cover">
        <KeyValueList
          items={[
            { label: "Size", value: `${ebookCoverPx.width} x ${ebookCoverPx.height} px` },
            { label: "Format", value: "JPEG, RGB" },
            { label: "Status", value: built ? "Built" : "Not built" },
          ]}
        />
      </InspectorSection>
      <InspectorSection title="Paperback wrap">
        <KeyValueList
          items={[
            { label: "Trim", value: book.trim },
            { label: "Pages used", value: interiorExists ? String(pages) : "Needs the interior PDF" },
            { label: "Paper", value: paper === "white" ? "White" : "Cream" },
            { label: "Spine", value: inches(wrap.spine) },
            { label: "Full wrap", value: `${inches(wrap.width)} x ${inches(wrap.height, 2)}` },
            { label: "Bleed", value: inches(coverBleedIn, 3) },
            { label: "Images", value: `${coverMinDpi} DPI or more` },
          ]}
        />
      </InspectorSection>
      <InspectorSection title="AI disclosure">
        <p className="flex items-start gap-1.5 text-[14px] leading-5 text-ink">
          <Sparkles size={14} strokeWidth={2} className="mt-0.5 shrink-0 text-ink-secondary" aria-hidden />
          Cover art: AI-generated by the image model. Recorded for the KDP AI disclosure.
        </p>
        <p className="mt-1.5 text-small text-ink-secondary">The title, subtitle and author are set by Volume in the chosen fonts.</p>
      </InspectorSection>
      {built && (
        <InspectorSection title="Files">
          <p className="flex items-center gap-1.5 text-small text-success">
            <Download size={14} strokeWidth={2} aria-hidden />
            Added to the upload pack
          </p>
        </InspectorSection>
      )}
    </Inspector>
  );
}
