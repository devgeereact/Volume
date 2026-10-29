import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router";
import { Check, Keyboard, SlidersHorizontal, Sparkles } from "lucide-react";
import { Banner, Cover, Loader, PageHeader, ProgressBar, SegmentedControl, Switch } from "../../components/ui";
import type { Book, CoverDesign } from "../../demo";
import { cn } from "../../lib/cn";
import { formatDayMonth } from "../../lib/format";
import { useBook } from "../../lib/useBook";
import { useStepAction, type StepAction } from "../../lib/stepAction";
import { NotFound } from "../../shell/NotFound";
import { ErrorPanel, LoadingBlock, useScreenState } from "../writing/screenState";
import { coverMinDpi, ebookCoverPx, parseTrim, safeInsetIn } from "../export/kdpRules";
import {
  blurbFor,
  briefFor,
  conceptsFor,
  interiorPages,
  layoutCover,
  partBoxes,
  withPalette,
  type Concept,
  type CoverBrief,
  type TitlePosition,
} from "./concepts";
import { setAlign, setTop, stepScale, stepTitleSize, type CoverPart } from "./coverEdit";
import { CoverEditor, CoverToolbar } from "./CoverEditor";
import { BriefForm } from "./BriefForm";
import { DemoWrapArt } from "./DemoWrap";
import { useHistory } from "./history";
import { coloursOf, designFor, paletteColours, plainLook, type Look } from "./look";
import { bookPalettes, PALETTE_FAMILIES } from "./palettes";
import { paperbackSize } from "./paperback";
import {
  BarDot,
  checkScore,
  ChecksPanel,
  COVER_ROW,
  FitStage,
  FrontGuides,
  GuidesKey,
  InspectorHead,
  InspectorPanel,
  InspectorTabs,
  LayerList,
  PalettePicker,
  PanelTitle,
  Section,
  ShortcutsKey,
  startFrame,
  StudioBar,
  StudioBody,
  StudioCard,
  StudioToolbar,
  ThumbsView,
  type FrameState,
  type InspectorTab,
  type PaletteFamily,
} from "./Studio";
import {
  BriefSummary,
  ConceptGrid,
  coverChecks,
  FixedLayerInfo,
  guideItems,
  isPart,
  LAYER_ICON,
  LAYER_NAME,
  LAYER_SURFACE,
  layerGroups,
  pagesFrom,
  PaperbackPanel,
  SHORTCUTS,
  startInk,
  useStudioKeys,
  viewForLayer,
  type LayerId,
  type PaperbackState,
} from "./StudioParts";
import { ApiCover } from "./ApiCover";
import { WrapPreview } from "./WrapPreview";

/* Cover studio (docs/03-design/UX-SPEC.md, M10), in the approved Volume Studio layout: concepts and layers on the
   left, the cover in the middle (eBook, paperback wrap or thumbnails, fitted to the window), and the inspector on
   the right. This is the sample-book studio; ApiCover is the same studio on the Volume server. Concepts are
   abstract and typographic; the type is set by Volume, never painted. */

type ConceptState = { status: "ready" } | { status: "making" } | { status: "failed" };

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
      <div className="px-4 pb-4 min-[861px]:px-6 min-[861px]:pb-6">
        <ApiCover key={book.id} book={book} apiBook={apiBook} penName={penName} />
      </div>
    );
  return (
    <div className="px-4 pb-4 min-[861px]:px-6 min-[861px]:pb-6">
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
  const allConcepts = useMemo(() => conceptsFor(book), [book]);
  const [brief, setBrief] = useState<CoverBrief>(() => briefFor(book));
  const [briefDone, setBriefDone] = useState(!fresh);
  const [concepts, setConcepts] = useState<Record<string, ConceptState>>(() =>
    fresh ? {} : Object.fromEntries(allConcepts.map((c) => [c.id, { status: "ready" }])),
  );
  const [failOnce, setFailOnce] = useState(true);
  const [chosen, setChosen] = useState<string | null>(fresh ? null : "a");
  const [used, setUsed] = useState(false);
  const history = useHistory<Look>(() => plainLook(allConcepts[0]?.paletteIndex ?? 0));
  const look = history.value;
  const [frame, setFrame] = useState<FrameState>(() => startFrame("ebook"));
  const [selected, setSelected] = useState<LayerId | null>(null);
  const [tab, setTab] = useState<InspectorTab>("edit");
  const [locked, setLocked] = useState<CoverPart[]>([]);
  const [sig, setSig] = useState(0);
  const interior = interiorPages[book.id];
  const bookTrim = parseTrim(book.trim);
  const [paperback, setPaperback] = useState<PaperbackState>(() => ({ trim: bookTrim, ink: startInk(book.template), paper: interior?.paper ?? "cream" }));
  const [pagesText, setPagesText] = useState("");
  const [build, setBuild] = useState<{ step: number; done: boolean } | null>(null);
  const [announce, setAnnounce] = useState("");
  const timers = useRef<number[]>([]);
  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);

  const { pages, typedOk } = pagesFrom(pagesText, interior?.pages ?? 160, paperback);
  const size = paperbackSize(paperback.trim, pages, paperback.ink, paperback.paper);

  const concept = allConcepts.find((c) => c.id === chosen) ?? null;
  const subtitle = look.showSubtitle ? book.subtitle : undefined;
  const palette = concept?.style.palettes[look.paletteIdx];
  const design: CoverDesign | null = concept ? designFor(concept.base, palette, look, subtitle) : null;
  const making = Object.values(concepts).some((c) => c.status === "making");
  const madeCount = Object.values(concepts).filter((c) => c.status === "ready").length;
  const step = !briefDone ? "brief" : madeCount === 0 || making ? "concepts" : !used ? "choose" : "build";
  const blurb = blurbFor(book);
  const part = isPart(selected) ? selected : null;

  function makeConcepts() {
    setChosen(null);
    setUsed(false);
    setBuild(null);
    setSelected(null);
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

  function pick(c: Concept) {
    setChosen(c.id);
    setUsed(false);
    setBuild(null);
    history.replace(plainLook(c.paletteIndex));
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
            : !typedOk
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

  /* ---------- editing ---------- */

  const editLook = (f: (l: Look) => Look, group?: string) => history.set(f(look), group);
  const handlers = {
    onSelect: (p: CoverPart | null) => select(p),
    onAlign: (p: CoverPart, a: "left" | "center" | "right") => editLook((l) => ({ ...l, edits: setAlign(l.edits, p, a) })),
    onTop: (p: CoverPart, top: number) => editLook((l) => ({ ...l, edits: setTop(l.edits, p, top) }), `top-${p}`),
    onSmaller: (p: CoverPart) => resize(p, -1),
    onLarger: (p: CoverPart) => resize(p, 1),
    onUppercase: (on: boolean) => editLook((l) => ({ ...l, edits: { ...l.edits, titleUppercase: on } })),
  };
  function resize(p: CoverPart, dir: -1 | 1) {
    if (p === "title") editLook((l) => ({ ...l, size: stepTitleSize(l.size, dir) }), "size-title");
    else {
      const key = p === "subtitle" ? "subtitleSize" : "authorSize";
      editLook((l) => ({ ...l, edits: { ...l.edits, [key]: stepScale(l.edits[key] ?? 1, dir) } }), `size-${p}`);
    }
  }
  function select(id: LayerId | null) {
    setSelected(id);
    setTab("edit");
    if (id) setFrame((f) => ({ ...f, view: viewForLayer(id, f.view) }));
  }
  const escape = useCallback(() => setSelected(null), []);
  useStudioKeys(Boolean(concept), { undo: history.undo, redo: history.redo, escape });

  /* ---------- checks ---------- */

  const checks = coverChecks({
    author,
    colours: design ? coloursOf(design) : null,
    showSubtitle: look.showSubtitle && Boolean(book.subtitle),
    titleSize: design ? design.titleSize : null,
    pages,
    paperback,
    blurb,
    built: build?.done ? { stale: false } : null,
    show: (id) => select(id),
  });
  const score = checkScore(checks);

  /* ---------- palettes ---------- */

  const families: PaletteFamily[] = [
    {
      id: "book",
      label: "This book",
      palettes: bookPalettes(book.id, sig),
      note: "Made from this book alone, so every book starts with its own colours.",
      onMore: () => setSig((n) => n + 4),
    },
    ...(concept ? [{ id: "design", label: "Design", palettes: concept.style.palettes.map((p) => ({ name: p.name, colours: paletteColours(p) })) }] : []),
    ...PALETTE_FAMILIES.map((f) => ({ id: f.name, label: f.name, palettes: f.palettes })),
  ];

  /* ---------- the canvas ---------- */

  const drawCover = (width: number, d: CoverDesign = design ?? allConcepts[0]!.base) => (
    <Cover title={book.title} subtitle={subtitle} author={author} design={d} width={width} decorative />
  );
  const canvasLabel = "Cover canvas. Click the title, subtitle or author to select it, drag to move it, arrow keys nudge it.";
  let stage;
  if (!concept || !design) {
    stage = (
      <div className="grid flex-1 place-items-center p-7 text-center">
        <div className="grid max-w-80 justify-items-center gap-2">
          {making ? <Loader /> : <SlidersHorizontal size={22} aria-hidden className="text-ink-3" />}
          <p className="text-[15px] font-bold text-ink">
            {making ? "Making four concepts" : madeCount > 0 ? "Pick a concept" : briefDone ? "No concepts yet" : "Write a cover brief"}
          </p>
          <p className="text-[13px] leading-normal text-ink-2">{status}</p>
        </div>
      </div>
    );
  } else if (frame.view === "thumbs") {
    stage = (
      <div tabIndex={0} role="region" aria-label="Thumbnails" className="min-h-0 flex-1 overflow-auto p-7 max-[760px]:p-3.5">
        <ThumbsView fx={frame.fx} draw={(w) => drawCover(w)} />
      </div>
    );
  } else if (frame.view === "wrap") {
    const W = size.widthIn;
    const H = size.heightIn;
    stage = (
      <FitStage ratio={W / H} zoom={frame.zoom} baseWidth={900} label="Paperback wrap canvas">
        {(width) => (
          <WrapPreviewFit
            width={width}
            design={design}
            book={book}
            subtitle={subtitle}
            author={author}
            blurb={blurb}
            paperback={paperback}
            pages={pages}
            spineIn={size.spineIn}
            spineText={size.spineText}
            guides={frame.guides}
          />
        )}
      </FitStage>
    );
  } else {
    stage = (
      <FitStage ratio={2 / 3} zoom={frame.zoom} baseWidth={380} label={canvasLabel}>
        {(width) => (
          <CoverEditor
            design={design}
            subtitle={subtitle}
            width={width}
            selected={part}
            locked={locked}
            overlay={<FrontGuides safePct={(100 * safeInsetIn) / paperback.trim.w} guides={frame.guides} thirds={frame.thirds} ratio={2 / 3} />}
            {...handlers}
          >
            {drawCover(width)}
          </CoverEditor>
        )}
      </FitStage>
    );
  }

  const readout =
    frame.view === "wrap"
      ? `Wrap ${size.widthIn.toFixed(3)} x ${size.heightIn.toFixed(3)} in, spine ${size.spineIn.toFixed(3)} in`
      : frame.view === "ebook"
        ? `eBook ${ebookCoverPx.width} x ${ebookCoverPx.height} px`
        : "Sizes as shoppers see them";

  /* ---------- the inspector ---------- */

  const editingBrief = !briefDone;
  let edit;
  if (editingBrief) {
    edit = (
      <>
        <InspectorHead icon={SlidersHorizontal} title="Cover brief" />
        <BriefForm brief={brief} onChange={setBrief} />
      </>
    );
  } else if (selected && concept && design) {
    const name = LAYER_NAME[selected];
    edit = (
      <>
        <InspectorHead icon={LAYER_ICON[selected]} title={name} surface={LAYER_SURFACE[selected]} onClose={() => setSelected(null)} />
        {part ? (
          <>
            <Section title="Text">
              <p className="text-[13px] leading-normal font-semibold text-ink">
                {part === "title" ? book.title : part === "subtitle" ? book.subtitle : author}
              </p>
              <p className="text-[12px] leading-[1.45] text-ink-2">
                {part === "author" ? "The pen name, word for word. Change it on the profile." : "From the book. Change it on Titles, and the cover follows."}
              </p>
            </Section>
            <CoverToolbar part={part} design={design} subtitle={subtitle} titleSizePct={look.size} locked={locked.includes(part)} {...handlers} />
          </>
        ) : (
          <FixedLayerInfo id={selected} blurb={blurb} author={author} spineText={size.spineText} spineIn={size.spineIn}>
            <Section title="Artwork">
              <p className="text-[13px] leading-normal text-ink">
                {concept.style.name}
                {concept.own ? ", the book's style" : ""}. {concept.note}
              </p>
              <p className="text-[12px] leading-[1.45] text-ink-2">Background art from the image model, marked AI-generated. Its colours follow the palette.</p>
            </Section>
          </FixedLayerInfo>
        )}
      </>
    );
  } else {
    edit = (
      <>
        <InspectorHead icon={SlidersHorizontal} title="Cover settings" />
        <p role="status" className="pb-3 text-[12.5px] leading-[1.45] text-ink-2 max-[1240px]:col-span-full">
          <b className="font-semibold text-ink">Now: </b>
          {status}
        </p>
        {build && <BuildSection build={build} book={book} paperback={paperback} pages={pages} />}
        {concept && (
          <>
            <Section title="Colours">
              <PalettePicker
                families={families}
                current={design ? coloursOf(design) : null}
                onPick={(p, fam) => {
                  if (fam.id === "design") {
                    const i = concept.style.palettes.findIndex((x) => x.name === p.name);
                    history.set({ ...look, paletteIdx: Math.max(0, i), colours: null });
                  } else history.set({ ...look, colours: p.colours });
                  setAnnounce(`${p.name} applied to the whole cover. Undo brings the old colours back.`);
                }}
              />
            </Section>
            <Section title="Type">
              <label className="grid gap-1.5">
                <span className="flex justify-between text-[12.5px] text-ink-2">
                  Title size <output className="num font-semibold text-ink">{look.size}%</output>
                </span>
                <input
                  type="range"
                  min={70}
                  max={130}
                  step={5}
                  value={Math.min(130, Math.max(70, look.size))}
                  onChange={(e) => history.set({ ...look, size: Number(e.target.value) }, "size-title")}
                  className="w-full accent-(--vol-btn)"
                />
              </label>
              <div className="grid gap-1.5">
                <span aria-hidden className="text-[12.5px] text-ink-2">
                  Title position
                </span>
                <SegmentedControl
                  label="Title position"
                  size="sm"
                  value={look.position}
                  onChange={(p: TitlePosition) => history.set({ ...look, position: p, edits: { ...look.edits, titleTop: undefined, subtitleTop: undefined } })}
                  options={[
                    { value: "style", label: "Style" },
                    { value: "top", label: "Top" },
                    { value: "middle", label: "Middle" },
                    { value: "bottom", label: "Bottom" },
                  ]}
                />
              </div>
              {book.subtitle && <Switch label="Show the subtitle" checked={look.showSubtitle} onChange={(v) => history.set({ ...look, showSubtitle: v })} />}
            </Section>
          </>
        )}
        <PaperbackPanel
          value={paperback}
          onChange={setPaperback}
          bookTrim={bookTrim}
          pagesText={pagesText}
          onPagesText={setPagesText}
          pages={pages}
          pagesHint={
            interior
              ? `The interior PDF has ${interior.pages} pages (built ${formatDayMonth(interior.builtAt)}). Try other counts here; the build always uses the real one.`
              : "No interior PDF yet, so this uses 160 pages. The build uses the interior PDF's real count."
          }
          note={`The build uses the book's trim, ${book.trim}, and the interior PDF's real page count.`}
        />
        <Section title="eBook cover">
          <p className="num text-[12.5px] leading-[1.45] text-ink-2">
            {ebookCoverPx.width} x {ebookCoverPx.height} px, JPEG, RGB. {build?.done ? "Built." : "Not built yet."}
          </p>
        </Section>
        <Section title="AI disclosure">
          <p className="flex items-start gap-1.5 text-[12.5px] leading-[1.45] text-ink">
            <Sparkles size={14} strokeWidth={2} className="mt-0.5 shrink-0 text-ink-2" aria-hidden />
            Cover art: AI-generated by the image model. Recorded for the KDP AI disclosure.
          </p>
          <p className="text-[12px] leading-[1.45] text-ink-2">The title, subtitle and author are set by Volume in the chosen fonts.</p>
        </Section>
      </>
    );
  }

  const tiles = allConcepts.map((c) => {
    const st = concepts[c.id];
    return {
      id: c.id,
      letter: c.name.slice(-1),
      name: `${c.name}, ${c.style.name}`,
      inUse: used && chosen === c.id,
      art:
        !st || st.status === "making" ? null : (
          <Cover
            title={book.title}
            subtitle={book.subtitle}
            author={author}
            design={chosen === c.id && design ? design : styled(c, c.paletteIndex, { subtitle: book.subtitle })}
            className="w-full"
            decorative
          />
        ),
      failed: st?.status === "failed" ? { onRetry: () => retryConcept(c.id) } : undefined,
    };
  });

  return (
    <>
      <PageHeader title="Cover studio" titleHidden />
      <StudioCard
        toolbar={
          <StudioToolbar
            frame={frame}
            onFrame={setFrame}
            canUndo={history.canUndo}
            canRedo={history.canRedo}
            onUndo={history.undo}
            onRedo={history.redo}
            onReset={concept ? () => history.set(plainLook(concept.paletteIndex)) : undefined}
            editable={Boolean(concept)}
            checks={score}
            onChecks={() => setTab("checks")}
          />
        }
      >
        <StudioBody
          wide={frame.wide && Boolean(concept)}
          left={
            <>
              <PanelTitle first>Concepts</PanelTitle>
              {Object.keys(concepts).length === 0 ? (
                <p className="px-2 text-[12.5px] leading-[1.45] text-ink-2 max-[760px]:flex-none">
                  {briefDone ? "No concepts yet. Make concepts to get four directions to compare." : "Write the brief first. The concepts follow it."}
                </p>
              ) : (
                <ConceptGrid
                  tiles={tiles}
                  checked={chosen}
                  onPick={(id) => {
                    const c = allConcepts.find((x) => x.id === id);
                    if (c) pick(c);
                  }}
                  caption={concept ? `${concept.style.name}${concept.own ? ", the book's style" : ""}` : "Pick the one you like best."}
                />
              )}
              <BriefSummary brief={brief} onEdit={briefDone ? () => setBriefDone(false) : undefined} />
              {concept && (
                <LayerList
                  groups={layerGroups({
                    hasSubtitle: Boolean(book.subtitle),
                    showSubtitle: look.showSubtitle,
                    onToggleSubtitle: () => history.set({ ...look, showSubtitle: !look.showSubtitle }),
                    locked,
                    onToggleLock: (p) => setLocked((l) => (l.includes(p) ? l.filter((x) => x !== p) : [...l, p])),
                    spineText: size.spineText,
                    hasArt: true,
                    artName: "Artwork",
                  })}
                  selected={selected ?? COVER_ROW}
                  onSelect={(id) => select(id === COVER_ROW || id === null ? null : (id as LayerId))}
                />
              )}
            </>
          }
          mid={
            <>
              {stage}
              <StudioBar
                tools={
                  concept && frame.view !== "thumbs" ? (
                    <>
                      <GuidesKey items={guideItems(frame.view)} />
                      <ShortcutsKey items={SHORTCUTS} />
                    </>
                  ) : undefined
                }
              >
                <span>{readout}</span>
                {selected && (
                  <>
                    <BarDot />
                    <span>
                      <b className="mr-1 font-semibold text-ink">{LAYER_NAME[selected]}</b>
                      {part && design ? `${partTop(design, part, subtitle).toFixed(1)} from the top` : LAYER_SURFACE[selected].toLowerCase()}
                    </span>
                  </>
                )}
                {!selected && concept && frame.view !== "thumbs" && (
                  <>
                    <BarDot />
                    <span className="inline-flex items-center gap-1">
                      <Keyboard size={13} aria-hidden className="max-[760px]:hidden" />
                      Click any part to edit it
                    </span>
                  </>
                )}
              </StudioBar>
            </>
          }
          inspector={
            <>
              <InspectorTabs value={tab} onChange={setTab} warnings={score.total - score.ok} />
              <InspectorPanel tab={tab}>{tab === "checks" ? <ChecksPanel checks={checks} /> : edit}</InspectorPanel>
            </>
          }
        />
      </StudioCard>
      <span className="sr-only" role="status" aria-live="polite">
        {announce}
      </span>
    </>
  );
}

const partTop = (d: CoverDesign, part: CoverPart, subtitle: string | undefined): number => partBoxes(d, subtitle)[part]?.top ?? 0;

/** The sample wrap at the fitted width: the drawing from DemoWrap with the print guides over it. */
function WrapPreviewFit(props: {
  width: number;
  design: CoverDesign;
  book: Book;
  subtitle: string | undefined;
  author: string;
  blurb: string;
  paperback: PaperbackState;
  pages: number;
  spineIn: number;
  spineText: boolean;
  guides: boolean;
}) {
  const { width, design, book, subtitle, author, blurb, paperback, pages, spineIn, spineText, guides } = props;
  return (
    <WrapPreview
      page={undefined}
      art={
        <DemoWrapArt
          design={design}
          title={book.title}
          subtitle={subtitle}
          author={author}
          blurb={blurb}
          trim={paperback.trim}
          spineIn={spineIn}
          spineText={spineText}
        />
      }
      trim={paperback.trim}
      pages={pages}
      paper={paperback.ink === "black" ? paperback.paper : "white"}
      spineIn={spineIn}
      width={width}
      guides={guides}
      legend={false}
    />
  );
}

function BuildSection({ build, book, paperback, pages }: { build: { step: number; done: boolean }; book: Book; paperback: PaperbackState; pages: number }) {
  return (
    <Section title={build.done ? "Covers built" : "Building covers"}>
      <ProgressBar
        value={build.step}
        max={BUILD_STEPS.length}
        live={!build.done}
        label="Cover build progress"
        valueText={`${build.step} of ${BUILD_STEPS.length} steps`}
      />
      <ol className="grid gap-1.5 text-[13px]">
        {BUILD_STEPS.map((s, i) => (
          <li key={s} className={cn("flex items-center gap-2", i < build.step ? "text-ink" : "text-ink-3")}>
            {i < build.step ? (
              <Check size={14} strokeWidth={2} className="text-good" aria-hidden />
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
        <Banner tone="success" title="Two files ready for the upload pack">
          {book.id}-ebook-cover.jpg and {book.id}-paperback-wrap-{parseTrim(book.trim).w}x{parseTrim(book.trim).h}-{paperback.paper}-{pages}p.pdf. The AI
          disclosure now records AI-generated images.{" "}
          <Link to={`/books/${book.id}/export`} className="font-medium text-select underline underline-offset-2">
            Open Export
          </Link>
        </Banner>
      )}
    </Section>
  );
}

export function styled(c: Concept, paletteIdx: number, opts: Parameters<typeof layoutCover>[1]): CoverDesign {
  const pal = c.style.palettes[paletteIdx];
  return layoutCover(pal ? withPalette(c.base, pal) : c.base, opts);
}
