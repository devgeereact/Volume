import { useCallback, useEffect, useMemo, useState } from "react";
import { useCanWrite } from "../../lib/access";
import { Link } from "react-router";
import { Check, Download, Keyboard, RotateCw, SlidersHorizontal, Sparkles } from "lucide-react";
import { Banner, Button, Loader, PageHeader, ProgressBar, SegmentedControl, Skeleton, Switch } from "../../components/ui";
import { coverFromStyle, coverStyles, getCoverStyle, type Book, type PenName } from "../../demo";
import { assetsApi } from "../../api/assets";
import { useBlueprint, useBuildCover, useChooseCover, useCover, useCoverConcepts, useCoverPreview, useExports, usePutCoverBrief } from "../../api/hooks";
import { isTerminalJob, type ApiBookDetail, type ApiCover, type CoverConcept } from "../../api/types";
import { BudgetPausedBanner } from "../books/BudgetPausedBanner";
import { errorText, jobStatusText, useJobWatch } from "../../api/wire-c";
import { useStepAction, type StepAction } from "../../lib/stepAction";
import { useToast } from "../../lib/toast";
import { ErrorPanel, LoadingBlock } from "../writing/screenState";
import { ebookCoverPx, inches, parseTrim, safeInsetIn, wrapSize, type Paper } from "../export/kdpRules";
import { conceptsFor, layoutCover, type CoverBrief, type TitlePosition } from "./concepts";
import { editsFromSaved, editsToTypography, EDIT_KEYS, setAlign, setTop, stepScale, stepTitleSize, type CoverPart } from "./coverEdit";
import { CoverEditor, CoverToolbar, type LiveCover } from "./CoverEditor";
import { CoverFrame, type CoverMeasure } from "./CoverFrame";
import { BriefForm } from "./BriefForm";
import { useHistory } from "./history";
import { designFor, paletteColours, plainLook, type Look } from "./look";
import { OwnCoverPanel } from "./OwnCoverPanel";
import { bookPalettes, coloursFromSaved, PALETTE_FAMILIES } from "./palettes";
import { paperbackSize } from "./paperback";
import {
  BarDot,
  checkScore,
  ChecksPanel,
  COVER_ROW,
  fieldInput,
  fieldLabel,
  FitStage,
  FrontGuides,
  GuidesKey,
  InspectorHead,
  InspectorPanel,
  InspectorTabs,
  LayerList,
  PalettePicker,
  PanelTitle,
  pillButton,
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
import { WrapPreview } from "./WrapPreview";
import { ModelFallbackBanner, modelProblemOf, type ModelProblem } from "../settings/ModelFallback";

/* Cover studio on the Volume server (API mode), in the approved Volume Studio layout: the brief is saved with
   PUT /cover/brief, concepts and the final covers are jobs with progress over SSE, concept images come from
   /assets, and Volume's typographic layer is drawn on top in the book's own cover style. The preview is the
   build's own page (POST /cover/preview from the same typography), so what the owner sees is what is built. */

type Obj = Record<string, unknown>;

const strs = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim().length > 0) : typeof v === "string" && v.trim() ? [v] : [];

/** The server's brief (mood, palette, use, avoid, plus genre when the owner set it) as the screen's brief. */
function toBrief(b: Obj): CoverBrief {
  return {
    genre: strs(b["genre"]),
    mood: typeof b["mood"] === "string" ? strs(b["mood"].split(/,\s*/)) : strs(b["mood"]),
    colours: strs(b["palette"]),
    symbols: strs(b["use"]),
    avoid: strs(b["avoid"]).join(", "),
  };
}

/** Back to the server's keys, keeping everything else it stored (concept prompts, audience). */
function fromBrief(prev: Obj, b: CoverBrief): Obj {
  return {
    ...prev,
    genre: b.genre,
    mood: b.mood.join(", "),
    palette: b.colours,
    use: b.symbols,
    avoid: b.avoid
      .split(/[,\n]/)
      .map((s) => s.trim())
      .filter(Boolean),
  };
}

/** Title fonts the owner can pick: installed OFL families that both the preview and the build have. */
const TITLE_FONTS = [
  "DM Serif Display",
  "Playfair Display",
  "Fraunces",
  "Bodoni Moda",
  "Cormorant Garamond",
  "Young Serif",
  "Libre Franklin",
  "Space Grotesk",
  "Big Shoulders Display",
  "Nunito",
  "Literata",
  "Lora",
] as const;

/** The studio's look on the server: the shared look plus the cover design (style) it is set in. */
type ApiLook = Look & { styleId: string };

export function ApiCover({ book, apiBook, penName }: { book: Book; apiBook: ApiBookDetail | undefined; penName?: PenName | undefined }) {
  const coverQ = useCover(book.id);
  if (coverQ.isPending) return <LoadingBlock label="Loading the cover studio" rows={6} />;
  if (coverQ.isError)
    return (
      <>
        <h1 className="font-book text-title text-ink">Cover studio</h1>
        <ErrorPanel className="mt-5 max-w-180" title="Could not load the cover studio" body={errorText(coverQ.error)} onRetry={() => void coverQ.refetch()} />
      </>
    );
  return <Studio book={book} apiBook={apiBook} cover={coverQ.data ?? null} author={penName?.name ?? ""} />;
}

function Studio({ book, apiBook, cover, author }: { book: Book; apiBook: ApiBookDetail | undefined; cover: ApiCover | null; author: string }) {
  const canWrite = useCanWrite();
  const bookId = book.id;
  const putBrief = usePutCoverBrief();
  const makeConcepts = useCoverConcepts();
  const choose = useChooseCover();
  const build = useBuildCover();
  const exportsQ = useExports(bookId);
  const blueprintQ = useBlueprint(bookId);
  const toast = useToast();

  const serverBrief: Obj = cover?.brief ?? {};
  const hasBrief = Object.keys(serverBrief).some((k) => k !== "concepts");
  const [editing, setEditing] = useState(false);
  const [brief, setBrief] = useState<CoverBrief>(() => toBrief(serverBrief));
  const [picked, setPicked] = useState<string | null>(cover?.chosenAssetId ?? null);
  // The typography the owner set last time (saved by Choose), so the studio opens where they left it.
  const savedType: Obj = cover?.typography ?? {};
  // The typographic layer: the book's own cover style (concept A in the demo is always the book's style).
  const bookOwn = useMemo(() => conceptsFor(book)[0]!, [book]);
  const ownFor = useCallback(
    (styleId: string) => {
      const style = getCoverStyle(styleId);
      if (!style || style.id === bookOwn.style.id) return bookOwn;
      return { ...bookOwn, style, base: coverFromStyle(style.id, style.palettes[0]?.id ?? "", bookOwn.base.titleLines), paletteIndex: 0 };
    },
    [bookOwn],
  );
  const history = useHistory<ApiLook>(() => {
    const styleId = typeof savedType["styleId"] === "string" && getCoverStyle(savedType["styleId"]) ? savedType["styleId"] : bookOwn.style.id;
    const own = ownFor(styleId);
    const i = own.style.palettes.findIndex((p) => p.id === savedType["paletteId"]);
    const showSubtitle = savedType["showSubtitle"] !== false;
    const size = typeof savedType["sizePct"] === "number" ? savedType["sizePct"] : 100;
    const p = savedType["titlePosition"];
    const position: TitlePosition = p === "top" || p === "middle" || p === "bottom" ? p : "style";
    const fonts = savedType["fonts"] as Obj | undefined;
    const subtitle = showSubtitle ? book.subtitle : undefined;
    return {
      styleId,
      paletteIdx: i >= 0 ? i : own.paletteIndex,
      colours: coloursFromSaved(savedType["colours"]),
      titleFont: typeof fonts?.["title"] === "string" ? fonts["title"] : "",
      size,
      position,
      showSubtitle,
      edits: editsFromSaved(savedType, layoutCover(own.base, { subtitle, size, position }).titleTop),
    };
  });
  const look = history.value;
  const own = useMemo(() => ownFor(look.styleId), [ownFor, look.styleId]);
  const palette = own.style.palettes[look.paletteIdx];
  const subtitle = look.showSubtitle ? book.subtitle : undefined;
  const design = useMemo(() => designFor(own.base, palette, look, subtitle), [own, palette, look, subtitle]);

  const [frame, setFrame] = useState<FrameState>(() => startFrame("ebook"));
  const [selected, setSelected] = useState<LayerId | null>(null);
  const [tab, setTab] = useState<InspectorTab>("edit");
  const [locked, setLocked] = useState<CoverPart[]>([]);
  const [sig, setSig] = useState(0);

  // A job still open from before a reload (queued, running or paused for credit) is watched again.
  const openJob = (kind: string) => apiBook?.recentJobs.find((j) => j.kind === kind && !isTerminalJob(j.status))?.id ?? null;
  const [conceptJob, setConceptJob] = useState<string | null>(() => openJob("cover_concepts"));
  const [buildJob, setBuildJob] = useState<string | null>(() => openJob("cover_build"));
  // The book detail can arrive after the studio opens: pick the open jobs up then, once (set during render).
  const [pickedUp, setPickedUp] = useState(!!apiBook);
  if (!pickedUp && apiBook) {
    setPickedUp(true);
    const c = apiBook.recentJobs.find((j) => j.kind === "cover_concepts" && !isTerminalJob(j.status))?.id;
    const b = apiBook.recentJobs.find((j) => j.kind === "cover_build" && !isTerminalJob(j.status))?.id;
    if (c && !conceptJob) setConceptJob(c);
    if (b && !buildJob) setBuildJob(b);
  }
  const [problem, setProblem] = useState<string | null>(null);
  const [announce, setAnnounce] = useState("");
  const [pagesText, setPagesText] = useState<string>("");
  const [modelFix, setModelFix] = useState<{ problem: ModelProblem; retry: "concepts" | "build" } | null>(null);

  /**
   * What Choose stores and the build applies: only what the owner decided (design, colours, font, size, position, edits).
   * Nothing is worked out here, so the build and the preview (both made by the server from these settings) agree.
   */
  const typography: Obj = {
    styleId: own.style.id,
    paletteId: palette?.id ?? null,
    ...(look.colours ? { colours: look.colours } : {}),
    ...(look.titleFont ? { fonts: { title: look.titleFont } } : {}),
    showSubtitle: look.showSubtitle,
    ...(look.position !== "style" ? { titlePosition: look.position } : {}),
    // The title's size as a share of the cover width: the design's own size times the percentage chosen.
    ...(look.size !== 100 ? { titleSize: Math.round(own.base.titleSize * look.size) / 100 } : {}),
    sizePct: look.size,
    ...editsToTypography(look.edits),
  };
  // Compare every key we send, plus the edit keys and the colours, so taking one away also counts as a change.
  const typeKeys = [...new Set([...Object.keys(typography), ...EDIT_KEYS, "colours"])];
  const typeChanged = JSON.stringify(typeKeys.map((k) => typography[k])) !== JSON.stringify(typeKeys.map((k) => savedType[k]));

  const concepts: CoverConcept[] = cover?.concepts ?? [];
  // Each concept comes with its own look (a different cover design and palette from the others), so the choices differ in
  // type, colour and layout as well as in art. The concept the owner already chose keeps the settings they saved.
  const looks = useMemo(
    () => conceptsFor(book).map((c) => ({ styleId: c.style.id, paletteId: c.style.palettes[c.paletteIndex]?.id ?? c.style.palettes[0]?.id ?? "" })),
    [book],
  );
  const conceptTypography = (c: CoverConcept, i: number): Obj => {
    if (c.assetId === cover?.chosenAssetId && cover.typography && Object.keys(cover.typography).length > 0) return cover.typography;
    const lk = looks[i % looks.length]!;
    return { styleId: lk.styleId, paletteId: lk.paletteId, showSubtitle: true };
  };
  const conceptLook = (i: number): ApiLook => {
    const lk = looks[i % looks.length]!;
    const style = getCoverStyle(lk.styleId);
    return { ...plainLook(Math.max(0, style?.palettes.findIndex((p) => p.id === lk.paletteId) ?? 0)), styleId: lk.styleId };
  };
  function pickConcept(c: CoverConcept, i: number) {
    setPicked(c.assetId);
    if (c.assetId === cover?.chosenAssetId) return;
    history.replace(conceptLook(i));
  }
  const chosen = concepts.find((c) => c.assetId === cover?.chosenAssetId) ?? null;
  const pick = concepts.find((c) => c.assetId === picked) ?? null;
  const built = cover?.status === "final" && !!cover.ebookAssetId;

  const conceptWatch = useJobWatch(bookId, conceptJob, (w) => {
    setConceptJob(null);
    if (w.ok) {
      setAnnounce("Concepts ready.");
      toast.show({ tone: "success", title: "Cover concepts ready", body: "Pick the one you like best, then press Use this concept." });
    } else {
      const mp = modelProblemOf(w);
      if (mp) setModelFix({ problem: mp, retry: "concepts" });
      else setProblem(`The concepts were not made. ${w.error ?? "Nothing was charged for images that did not arrive. Try again."}`);
      toast.show({
        tone: "error",
        title: "Cover concepts were not made",
        body: mp ? "The model for this step is not available. Use the button on the page to switch and try again." : (w.error ?? "Try again."),
      });
    }
  });
  const buildWatch = useJobWatch(bookId, buildJob, (w) => {
    setBuildJob(null);
    if (w.ok) {
      setAnnounce("Covers built.");
      toast.show({ tone: "success", title: "Covers built", body: "The eBook cover and paperback wrap are ready. They go into the pack on Export." });
    } else {
      const mp = modelProblemOf(w);
      if (mp) setModelFix({ problem: mp, retry: "build" });
      else setProblem(`The covers were not built. ${w.error ?? "Try again."}`);
      toast.show({
        tone: "error",
        title: "The covers were not built",
        body: mp ? "The model for this step is not available. Use the button on the page to switch and try again." : (w.error ?? "Try again."),
      });
    }
  });
  const conceptsPaused = conceptWatch.status === "paused_budget";
  const buildPaused = buildWatch.status === "paused_budget";
  const making = makeConcepts.isPending || (conceptWatch.running && !conceptsPaused);
  const building = build.isPending || (buildWatch.running && !buildPaused);

  // Page count for the wrap: the build records it; before that, the latest print PDF's count.
  const pdf = (exportsQ.data ?? []).filter((e) => e.kind === "pdf_print" && e.pageCount !== null).sort((a, b) => b.createdAt - a.createdAt)[0];
  const builtPages = typeof cover?.wrapSpec["pages"] === "number" ? cover.wrapSpec["pages"] : null;
  const realPages = builtPages ?? pdf?.pageCount ?? null;
  // The text can change after the covers are built (claim fixes, edits), which changes the page count and the spine.
  // The wrap is then the wrong size for the pack, so offer a rebuild instead of leaving the owner stuck.
  const stalePages = builtPages !== null && pdf?.pageCount != null && pdf.pageCount !== builtPages;
  // The title, subtitle, style, type settings or art can also change after the build; the build records what it used.
  const builtWith = cover?.wrapSpec["builtWith"] as Record<string, unknown> | undefined;
  const styleStale =
    builtWith !== undefined &&
    JSON.stringify([builtWith["typography"], builtWith["coverStyleId"], builtWith["title"], builtWith["subtitle"], builtWith["chosen"]]) !==
      JSON.stringify([cover?.typography, apiBook?.coverStyleId, book.title, book.subtitle, cover?.chosenAssetId]);
  const bookTrim = parseTrim(book.trim);
  const serverPaper: Paper = apiBook?.paper === "white" ? "white" : "cream";
  const [paperback, setPaperback] = useState<PaperbackState>(() => ({ trim: bookTrim, ink: startInk(book.template), paper: serverPaper }));
  const { pages, typedOk } = pagesFrom(pagesText, realPages ?? 120, paperback);
  const wrap = wrapSize(bookTrim, pages, serverPaper);
  const size = paperbackSize(paperback.trim, pages, paperback.ink, paperback.paper);
  const blurb = (() => {
    const v = blueprintQ.data?.blueprint?.data as Obj | undefined;
    return typeof v?.["back_blurb"] === "string" ? v["back_blurb"] : "";
  })();

  async function saveBrief() {
    try {
      await putBrief.mutateAsync({ bookId, brief: fromBrief(serverBrief, brief) });
      setEditing(false);
      setProblem(null);
      setAnnounce("Brief saved.");
    } catch (e) {
      setProblem(errorText(e));
    }
  }

  async function startConcepts() {
    try {
      const r = await makeConcepts.mutateAsync({ bookId });
      setConceptJob(r.jobId);
      setPicked(null);
      setSelected(null);
      setProblem(null);
      toast.show({
        tone: "working",
        title: "Making cover concepts",
        body: "The image model is drawing them. About a minute. A message shows when they are ready.",
      });
      setAnnounce("Making concepts.");
    } catch (e) {
      setProblem(errorText(e));
    }
  }

  async function chooseConcept() {
    if (!pick) return;
    try {
      await choose.mutateAsync({ bookId, assetId: pick.assetId, typography });
      setProblem(null);
      setAnnounce(`${pick.name} is in use.`);
    } catch (e) {
      setProblem(errorText(e));
    }
  }

  /** Save the type edits for the concept already in use (the same call Choose makes). The built covers are then out of date. */
  async function saveType() {
    if (!chosen) return;
    try {
      await choose.mutateAsync({ bookId, assetId: chosen.assetId, typography });
      setProblem(null);
      setAnnounce("Cover changes saved.");
    } catch (e) {
      setProblem(errorText(e));
    }
  }

  async function startBuild() {
    try {
      // Type changed since Choose: store it first, so the build uses what the preview shows.
      if (typeChanged && chosen) await choose.mutateAsync({ bookId, assetId: chosen.assetId, typography });
      const r = await build.mutateAsync({ bookId });
      setBuildJob(r.jobId);
      setProblem(null);
      toast.show({ tone: "working", title: "Building your covers", body: "The eBook cover and the paperback wrap. A message shows when they are ready." });
    } catch (e) {
      setProblem(errorText(e));
    }
  }

  const upToDate = built && !building && !typeChanged && !stalePages && !styleStale;
  const action: StepAction | null = editing
    ? { label: "Save brief", onClick: () => void saveBrief(), disabledReason: putBrief.isPending ? "Saving the brief." : undefined }
    : concepts.length === 0 || making
      ? {
          label: making ? "Making concepts" : "Make concepts",
          estimate: "about $0.16",
          onClick: () => void startConcepts(),
          disabledReason: making ? "Making the concepts now." : conceptsPaused ? "Paused. See the notice above." : undefined,
        }
      : !chosen || (pick && pick.assetId !== chosen.assetId)
        ? {
            label: "Use this concept",
            onClick: () => void chooseConcept(),
            disabledReason: pick ? (choose.isPending ? "Saving your choice." : undefined) : "Pick a concept first.",
          }
        : upToDate
          ? null
          : {
              label: building ? "Building covers" : built ? "Build covers again" : "Build covers",
              onClick: () => void startBuild(),
              disabledReason: building ? "The covers are building." : undefined,
            };
  useStepAction(action);

  const status = editing
    ? "Change the brief, then save it. The concepts follow its mood, colours and symbols."
    : making
      ? "Making concepts with the image model."
      : concepts.length === 0
        ? hasBrief
          ? "Brief saved. Make concepts to compare directions."
          : "No brief yet. Write one, or make concepts and the image model writes it from the blueprint."
        : !chosen
          ? pick
            ? `${pick.name} picked. Use it to set the type and build the covers.`
            : "Pick the concept you like best."
          : building
            ? "Building the eBook cover and the paperback wrap."
            : built
              ? "Covers built. They go into the upload pack on Export."
              : `${chosen.name} is in use. Check the wrap, then build the covers.`;

  const front = chosen ?? pick;

  // The preview is the build's own page: the server renders it from these same settings (see CoverFrame).
  const settled = useDebounced(typography, 350);
  const previewOn = !!front;
  const ebookPage = useCoverPreview(bookId, "ebook", settled, undefined, front?.assetId, previewOn);
  const wrapPage = useCoverPreview(bookId, "wrap", settled, typedOk ? pages : undefined, front?.assetId, previewOn && frame.view === "wrap");
  const [measure, setMeasure] = useState<CoverMeasure | null>(null);
  const live: LiveCover | undefined = measure
    ? {
        boxes: {
          title: measure.title ? { top: measure.title.top, height: measure.title.height } : null,
          subtitle: measure.subtitle ? { top: measure.subtitle.top, height: measure.subtitle.height } : null,
          author: measure.author ? { top: measure.author.top, height: measure.author.height } : null,
        },
        unitsH: measure.unitsH,
      }
    : undefined;

  /* ---------- editing ---------- */

  const part = isPart(selected) ? selected : null;
  const editLook = (f: (l: ApiLook) => ApiLook, group?: string) => history.set(f(look), group);
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
  const editHandlers = {
    onSelect: (p: CoverPart | null) => select(p),
    onAlign: (p: CoverPart, a: "left" | "center" | "right") => editLook((l) => ({ ...l, edits: setAlign(l.edits, p, a) })),
    onTop: (p: CoverPart, top: number) => editLook((l) => ({ ...l, edits: setTop(l.edits, p, top) }), `top-${p}`),
    onSmaller: (p: CoverPart) => resize(p, -1),
    onLarger: (p: CoverPart) => resize(p, 1),
    onUppercase: (on: boolean) => editLook((l) => ({ ...l, edits: { ...l.edits, titleUppercase: on } })),
  };
  const escape = useCallback(() => setSelected(null), []);
  useStudioKeys(Boolean(front) && canWrite, { undo: history.undo, redo: history.redo, escape });
  const resetLook = () => {
    const i = concepts.findIndex((c) => c.assetId === front?.assetId);
    history.set(conceptLook(Math.max(0, i)));
  };

  /* ---------- checks ---------- */

  const checks = coverChecks({
    author: author,
    // The art sits behind the type and the build picks the ink from it.
    colours: null,
    showSubtitle: look.showSubtitle && Boolean(book.subtitle),
    titleSize: measure?.titleSize ? measure.titleSize : null,
    pages,
    paperback,
    blurb,
    built: built ? { stale: typeChanged || stalePages || styleStale } : null,
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
    { id: "design", label: "Design", palettes: own.style.palettes.map((p) => ({ name: p.name, colours: paletteColours(p) })) },
    ...PALETTE_FAMILIES.map((f) => ({ id: f.name, label: f.name, palettes: f.palettes })),
  ];
  const currentColours = look.colours ?? (palette ? paletteColours(palette) : null);

  /* ---------- the canvas ---------- */

  const canvasLabel = "Cover canvas. Click the title, subtitle or author to select it, drag to move it, arrow keys nudge it.";
  const ebookFrame = (width: number, title: string, onM?: (m: CoverMeasure) => void) =>
    ebookPage.data ? (
      <CoverFrame html={ebookPage.data.html} widthPx={ebookPage.data.widthPx} heightPx={ebookPage.data.heightPx} width={width} title={title} onMeasure={onM} />
    ) : (
      <div className="animate-pulse rounded-cover bg-sunken" style={{ width, aspectRatio: `${ebookCoverPx.width} / ${ebookCoverPx.height}` }} />
    );
  let stage;
  if (!front) {
    stage = (
      <div className="grid flex-1 place-items-center p-7 text-center">
        <div className="grid w-full max-w-80 justify-items-center gap-2">
          {making ? <Loader /> : <SlidersHorizontal size={22} aria-hidden className="text-ink-3" />}
          <p className="text-[15px] font-bold text-ink">{making ? "Making concepts" : concepts.length ? "Pick a concept" : "No concepts yet"}</p>
          <p className="text-[13px] leading-normal text-ink-2">{status}</p>
          {making && (
            <ProgressBar
              className="mt-2 w-full"
              value={Math.round(conceptWatch.progress * 100)}
              max={100}
              live
              label="Concept progress"
              valueText={conceptWatch.message ?? jobStatusText(conceptWatch.status)}
            />
          )}
        </div>
      </div>
    );
  } else if (frame.view === "thumbs") {
    stage = (
      <div tabIndex={0} role="region" aria-label="Thumbnails" className="min-h-0 flex-1 overflow-auto p-7 max-[760px]:p-3.5">
        <ThumbsView fx={frame.fx} draw={(w) => ebookFrame(w, `${book.title}, thumbnail at ${w} px`)} />
      </div>
    );
  } else if (frame.view === "wrap") {
    stage = (
      <FitStage ratio={wrap.width / wrap.height} zoom={frame.zoom} baseWidth={900} label="Paperback wrap canvas">
        {(width) => <WrapPreview page={wrapPage.data} trim={bookTrim} pages={pages} paper={serverPaper} width={width} guides={frame.guides} legend={false} />}
      </FitStage>
    );
  } else {
    const ratio = ebookCoverPx.width / ebookCoverPx.height;
    stage = (
      <FitStage ratio={ratio} zoom={frame.zoom} baseWidth={380} label={canvasLabel}>
        {(width) => (
          <CoverEditor
            design={design}
            subtitle={subtitle}
            width={width}
            selected={part}
            disabled={!canWrite}
            live={live}
            locked={locked}
            overlay={<FrontGuides safePct={(100 * safeInsetIn) / bookTrim.w} guides={frame.guides} thirds={frame.thirds} ratio={ratio} />}
            {...editHandlers}
          >
            {ebookFrame(width, `${book.title}, eBook cover as the build draws it`, setMeasure)}
          </CoverEditor>
        )}
      </FitStage>
    );
  }

  const readout =
    frame.view === "wrap"
      ? `Wrap ${wrap.width.toFixed(3)} x ${wrap.height.toFixed(3)} in, spine ${wrap.spine.toFixed(3)} in`
      : frame.view === "ebook"
        ? `eBook ${ebookCoverPx.width} x ${ebookCoverPx.height} px`
        : "Sizes as shoppers see them";

  /* ---------- the inspector ---------- */

  let edit;
  if (editing) {
    edit = (
      <>
        <InspectorHead icon={SlidersHorizontal} title="Cover brief" onClose={() => setEditing(false)} />
        <BriefForm brief={brief} onChange={setBrief} />
        <div className="flex gap-2 border-t border-line pt-3.5">
          <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>
            Cancel
          </Button>
        </div>
      </>
    );
  } else if (selected && front) {
    edit = (
      <>
        <InspectorHead icon={LAYER_ICON[selected]} title={LAYER_NAME[selected]} surface={LAYER_SURFACE[selected]} onClose={() => setSelected(null)} />
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
            {canWrite ? (
              <CoverToolbar
                part={part}
                design={design}
                subtitle={subtitle}
                titleSizePct={look.size}
                locked={locked.includes(part)}
                live={
                  measure?.[part]
                    ? {
                        top: measure[part].top,
                        align: measure[part].align,
                        uppercase: look.edits.titleUppercase ?? own.base.titleUppercase,
                        titleSize: measure.titleSize,
                      }
                    : undefined
                }
                {...editHandlers}
              >
                {part === "title" && (
                  <label className="grid gap-1.25">
                    <span className={fieldLabel}>Title font</span>
                    <select
                      id="cover-title-font"
                      value={look.titleFont}
                      onChange={(e) => history.set({ ...look, titleFont: e.target.value })}
                      className={fieldInput}
                      style={look.titleFont ? { fontFamily: `'${look.titleFont}'` } : undefined}
                    >
                      <option value="">Design's own font</option>
                      {TITLE_FONTS.map((f) => (
                        <option key={f} value={f} style={{ fontFamily: `'${f}'` }}>
                          {f}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </CoverToolbar>
            ) : (
              <p className="pt-2 text-[12.5px] text-ink-2">You can look at the cover but not change it.</p>
            )}
          </>
        ) : (
          <FixedLayerInfo id={selected} blurb={blurb} author={author} spineText={size.spineText} spineIn={wrap.spine}>
            <Section title="Artwork">
              <p className="text-[13px] leading-normal font-semibold text-ink">{front.name}</p>
              {front.why && <p className="text-[12.5px] leading-[1.45] text-ink-2">{front.why}</p>}
              <p className="text-[12px] leading-[1.45] text-ink-2">Background art from the image model, marked AI-generated. Volume sets the type over it.</p>
              {front.mock && <p className="text-[12px] text-accent-text">Placeholder image from the test image model.</p>}
              <a
                href={assetsApi.downloadUrl(front.assetId)}
                download
                className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-select underline-offset-2 hover:underline"
              >
                <Download size={14} aria-hidden />
                Download art
              </a>
              <p className="text-[12px] leading-[1.45] text-ink-2">Making new concepts replaces these, so download any you want to keep first.</p>
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
        {(building || built) && (
          <Section title={building ? "Building covers" : "Covers built"}>
            {building ? (
              <>
                <ProgressBar
                  value={Math.round(buildWatch.progress * 100)}
                  max={100}
                  live
                  label="Cover build progress"
                  valueText={buildWatch.message ?? jobStatusText(buildWatch.status)}
                />
                <p className="flex items-center gap-2 text-[12.5px] text-ink-2">
                  <Loader />
                  {buildWatch.message ?? jobStatusText(buildWatch.status)}
                </p>
              </>
            ) : (
              cover && (
                <div className="grid grid-cols-[96px_minmax(0,1fr)] gap-3">
                  {cover.ebookAssetId && (
                    <img
                      src={assetsApi.downloadUrl(cover.ebookAssetId, true)}
                      alt={`Built eBook cover of ${book.title}`}
                      className="w-24 rounded-cover"
                      style={{ boxShadow: "var(--vol-shadow-cover)" }}
                    />
                  )}
                  <div className="grid content-start gap-2">
                    <p className="flex items-start gap-1.5 text-[12.5px] leading-[1.45] text-good">
                      <Check size={14} strokeWidth={2} aria-hidden className="mt-0.5 flex-none" />
                      Built{builtPages !== null ? ` for ${builtPages} ${serverPaper} pages` : ""}. The AI disclosure records AI-generated images.
                    </p>
                    {styleStale && !stalePages && (
                      <p className="text-[12px] leading-[1.45] text-accent-text">
                        The title, style, type settings or art changed after these covers were built, so the files are out of date. Build them again.
                      </p>
                    )}
                    {stalePages && (
                      <p className="text-[12px] leading-[1.45] text-accent-text">
                        The book is now {pdf?.pageCount} pages, so the paperback wrap needs building again.
                      </p>
                    )}
                    {cover.wrapSpec["mock"] === true && <p className="text-[12px] text-accent-text">Built from placeholder art by the test image model.</p>}
                  </div>
                  <div className="col-span-2 flex flex-wrap gap-2">
                    {cover.ebookAssetId && (
                      <a href={assetsApi.downloadUrl(cover.ebookAssetId)} download className={pillButton}>
                        <Download size={15} aria-hidden />
                        eBook cover (JPEG)
                      </a>
                    )}
                    {cover.wrapAssetId && (
                      <a href={assetsApi.downloadUrl(cover.wrapAssetId)} download className={pillButton}>
                        <Download size={15} aria-hidden />
                        Paperback wrap (PDF)
                      </a>
                    )}
                    <Link
                      to={`/books/${bookId}/export`}
                      className="inline-flex h-8 items-center text-[12.5px] font-semibold text-select underline underline-offset-2"
                    >
                      Open Export
                    </Link>
                  </div>
                </div>
              )
            )}
          </Section>
        )}
        {front && typeChanged && canWrite && (
          <Section title="Unsaved changes">
            {chosen ? (
              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" variant="secondary" loading={choose.isPending} loadingLabel="Saving" onClick={() => void saveType()}>
                  Save changes
                </Button>
                <span className="text-[12px] text-ink-2">Build covers saves them too.</span>
              </div>
            ) : (
              <p className="text-[12px] leading-[1.45] text-ink-2">They are saved when you press Use this concept.</p>
            )}
          </Section>
        )}
        {front && (
          <>
            <Section title="Colours">
              <PalettePicker
                families={families}
                current={currentColours}
                disabled={!canWrite}
                onPick={(p, fam) => {
                  if (fam.id === "design") {
                    const i = own.style.palettes.findIndex((x) => x.name === p.name);
                    history.set({ ...look, paletteIdx: Math.max(0, i), colours: null });
                  } else history.set({ ...look, colours: p.colours });
                  setAnnounce(`${p.name} applied to the whole cover. Undo brings the old colours back.`);
                }}
              />
              <p className="text-[12px] leading-[1.45] text-ink-2">Over the art, the build picks the text ink from the picture so it stays readable.</p>
            </Section>
            <Section title="Design and type">
              <label className="grid gap-1.25">
                <span className={fieldLabel}>Design</span>
                <select
                  id="cover-design"
                  value={own.style.id}
                  disabled={!canWrite}
                  onChange={(e) => history.set({ ...plainLook(0), styleId: e.target.value })}
                  className={fieldInput}
                >
                  {coverStyles.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
              <p className="text-[12px] leading-[1.45] text-ink-2">{own.style.description}</p>
              <label className="grid gap-1.5">
                <span className={fieldLabel}>
                  Title size <output className="num font-semibold text-ink">{look.size}%</output>
                </span>
                <input
                  id="title-size"
                  type="range"
                  min={60}
                  max={180}
                  step={5}
                  value={look.size}
                  disabled={!canWrite}
                  onChange={(e) => history.set({ ...look, size: Number(e.target.value) }, "size-title")}
                  className="w-full accent-(--vol-btn)"
                />
              </label>
              <div className="grid gap-1.5">
                <span aria-hidden className={fieldLabel}>
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
              {book.subtitle && (
                <Switch
                  label="Show the subtitle"
                  checked={look.showSubtitle}
                  disabled={!canWrite}
                  onChange={(v) => history.set({ ...look, showSubtitle: v })}
                />
              )}
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
            realPages !== null
              ? `The interior PDF has ${realPages} pages. Try other counts here; the build always uses the real one.`
              : "No interior PDF yet, so this uses 120 pages. Build covers makes the interior first and uses its real count."
          }
          note={`The preview and the build use the book's settings: ${book.trim}, ${serverPaper} paper, and the interior PDF's real page count.`}
        />
        {!blurb && front && <p className="pb-2 text-[12px] text-ink-2">No back blurb yet. It comes from the blueprint's listing.</p>}
        <OwnCoverPanel
          bookId={bookId}
          cover={cover}
          canWrite={canWrite}
          wrapHint={`${Number(wrap.width.toFixed(4))} x ${inches(wrap.height, 3)} for ${pages} ${serverPaper} pages${realPages === null ? " (an estimate until the interior PDF is exported)" : ""}`}
          onAnnounce={setAnnounce}
        />
        <Section title="AI disclosure">
          <p className="flex items-start gap-1.5 text-[12.5px] leading-[1.45] text-ink">
            <Sparkles size={14} strokeWidth={2} className="mt-0.5 shrink-0 text-ink-2" aria-hidden />
            {cover?.wrapSpec["typographic"] === true
              ? "Typographic cover: no artwork, so no AI images to disclose."
              : "Cover art: AI-generated by the image model. Recorded for the KDP AI disclosure."}
          </p>
          <p className="text-[12px] leading-[1.45] text-ink-2">The title, subtitle and author are set by Volume in the chosen fonts.</p>
        </Section>
      </>
    );
  }

  const tiles = making
    ? [0, 1, 2, 3].map((i) => ({
        id: `making-${i}`,
        letter: String.fromCharCode(65 + i),
        name: `Concept ${String.fromCharCode(65 + i)}`,
        inUse: false,
        art: null,
      }))
    : concepts.map((c, i) => ({
        id: c.assetId,
        letter: String.fromCharCode(65 + i),
        name: c.name,
        inUse: chosen?.assetId === c.assetId,
        art: (
          <ConceptThumb
            bookId={bookId}
            assetId={c.assetId}
            typography={c.assetId === front?.assetId ? settled : conceptTypography(c, i)}
            title={`${c.name}, as the build draws it`}
            enabled={!previewOn || !ebookPage.isPending}
          />
        ),
      }));

  return (
    <>
      <PageHeader title="Cover studio" titleHidden />
      <div className="grid gap-3 empty:hidden">
        {apiBook?.status === "published" && (
          <Banner tone="info" title="This book is already published" className="mb-3">
            You can still change its cover. Make or pick a new one and build it, then build the pack again on Export and upload the new files to KDP.
          </Banner>
        )}
        {conceptsPaused && conceptJob && <BudgetPausedBanner className="mb-3" jobId={conceptJob} message={conceptWatch.error} />}
        {buildPaused && buildJob && <BudgetPausedBanner className="mb-3" jobId={buildJob} message={buildWatch.error} />}
        {modelFix && (
          <ModelFallbackBanner
            bookId={bookId}
            className="mb-3"
            problem={modelFix.problem}
            onDismiss={() => setModelFix(null)}
            onRetry={() => void (modelFix.retry === "concepts" ? startConcepts() : startBuild())}
          />
        )}
        {problem && (
          <Banner
            tone="error"
            title="That did not work"
            className="mb-3"
            action={
              <Button size="sm" variant="ghost" onClick={() => setProblem(null)}>
                Dismiss
              </Button>
            }
          >
            {problem}
          </Banner>
        )}
      </div>
      <StudioCard
        toolbar={
          <StudioToolbar
            frame={frame}
            onFrame={setFrame}
            canUndo={history.canUndo}
            canRedo={history.canRedo}
            onUndo={history.undo}
            onRedo={history.redo}
            onReset={front && canWrite ? resetLook : undefined}
            editable={Boolean(front) && canWrite}
            checks={score}
            onChecks={() => setTab("checks")}
            end={
              upToDate && canWrite ? (
                <button type="button" className={pillButton} onClick={() => void startBuild()}>
                  <RotateCw size={15} aria-hidden />
                  Build again
                </button>
              ) : undefined
            }
          />
        }
      >
        <StudioBody
          wide={frame.wide && Boolean(front)}
          left={
            <>
              <PanelTitle first>Concepts</PanelTitle>
              {!making && concepts.length === 0 ? (
                <p className="px-2 text-[12.5px] leading-[1.45] text-ink-2 max-[760px]:flex-none">
                  No concepts yet. Press Make concepts to get designs to compare.{" "}
                  <a href="#own-cover-title" className="font-semibold text-select underline-offset-2 hover:underline">
                    Use my own cover instead
                  </a>
                </p>
              ) : (
                <ConceptGrid
                  tiles={tiles}
                  checked={picked}
                  onPick={(id) => {
                    const i = concepts.findIndex((c) => c.assetId === id);
                    const c = concepts[i];
                    if (c) pickConcept(c, i);
                  }}
                  caption={making ? (conceptWatch.message ?? "Making concepts") : (front?.name ?? "Pick the one you like best.")}
                />
              )}
              <BriefSummary
                brief={editing ? brief : toBrief(serverBrief)}
                onEdit={
                  canWrite && !editing
                    ? () => {
                        setBrief(toBrief(serverBrief));
                        setEditing(true);
                        setSelected(null);
                        setTab("edit");
                      }
                    : undefined
                }
              />
              {front && (
                <LayerList
                  groups={layerGroups({
                    hasSubtitle: Boolean(book.subtitle),
                    showSubtitle: look.showSubtitle,
                    onToggleSubtitle: canWrite ? () => history.set({ ...look, showSubtitle: !look.showSubtitle }) : undefined,
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
                  front && frame.view !== "thumbs" ? (
                    <>
                      <GuidesKey items={guideItems(frame.view)} />
                      <ShortcutsKey items={SHORTCUTS} />
                    </>
                  ) : undefined
                }
              >
                <span>{readout}</span>
                {selected ? (
                  <>
                    <BarDot />
                    <span>
                      <b className="mr-1 font-semibold text-ink">{LAYER_NAME[selected]}</b>
                      {part && measure?.[part] ? `${measure[part].top.toFixed(1)} from the top` : LAYER_SURFACE[selected].toLowerCase()}
                    </span>
                  </>
                ) : (
                  front &&
                  frame.view !== "thumbs" && (
                    <>
                      <BarDot />
                      <span className="inline-flex items-center gap-1">
                        <Keyboard size={13} aria-hidden className="max-[760px]:hidden" />
                        {canWrite ? "Click any part to edit it" : "You can look at the cover but not change it"}
                      </span>
                    </>
                  )
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

/** A value that follows `value` only after it has stopped changing for `ms`. */
function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  const key = JSON.stringify(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, ms]);
  return v;
}

/** One concept card: the build's own page for this concept's art and look, at card size. */
function ConceptThumb({
  bookId,
  assetId,
  typography,
  title,
  enabled,
}: {
  bookId: string;
  assetId: string;
  typography: Record<string, unknown>;
  title: string;
  /** Held back until the main preview is in, so the server renders one page at a time rather than five at once. */
  enabled: boolean;
}) {
  const page = useCoverPreview(bookId, "ebook", typography, undefined, assetId, enabled);
  return page.data ? (
    <CoverFrame html={page.data.html} widthPx={page.data.widthPx} heightPx={page.data.heightPx} title={title} />
  ) : (
    <Skeleton variant="cover" className="w-full" />
  );
}
