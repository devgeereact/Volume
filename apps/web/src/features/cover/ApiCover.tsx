import { useEffect, useMemo, useState } from "react";
import { useCanWrite } from "../../lib/access";
import { Link } from "react-router";
import { Check, Download, RotateCw, Upload } from "lucide-react";
import { Banner, Button, buttonClasses, Loader, PageHeader, ProgressBar, SegmentedControl, Skeleton, StatusChip, Switch } from "../../components/ui";
import { coverFromStyle, coverStyles, getCoverStyle, type Book, type CoverDesign, type PenName } from "../../demo";
import { assetsApi } from "../../api/assets";
import { useBlueprint, useBuildCover, useChooseCover, useCover, useCoverConcepts, useCoverPreview, useExports, usePutCoverBrief } from "../../api/hooks";
import { isTerminalJob, type ApiBookDetail, type ApiCover, type CoverConcept } from "../../api/types";
import { BudgetPausedBanner } from "../books/BudgetPausedBanner";
import { errorText, jobStatusText, useJobWatch } from "../../api/wire-c";
import { cn } from "../../lib/cn";
import { useStepAction, type StepAction } from "../../lib/stepAction";
import { useToast } from "../../lib/toast";
import { ErrorPanel, LoadingBlock } from "../writing/screenState";
import {
  coverBleedIn,
  ebookCoverPx,
  ebookMinRatio,
  inches,
  pageLimits,
  parseTrim,
  spinePerPage,
  spineTextMinPages,
  wrapSize,
  type Paper,
} from "../export/kdpRules";
import { conceptsFor, layoutCover, withPalette, type CoverBrief, type TitlePosition } from "./concepts";
import {
  clearTops,
  editsFromSaved,
  editsToTypography,
  EDIT_KEYS,
  setAlign,
  setTop,
  stepScale,
  stepTitleSize,
  type CoverEdits,
  type CoverPart,
} from "./coverEdit";
import { CoverEditor, CoverToolbar, type LiveCover } from "./CoverEditor";
import { CoverFrame, type CoverMeasure } from "./CoverFrame";
import { BriefCard, CoverInspector } from "./CoverPage";
import { OwnCoverPanel } from "./OwnCoverPanel";
import { WrapPreview } from "./WrapPreview";
import { ModelFallbackBanner, modelProblemOf, type ModelProblem } from "../settings/ModelFallback";

/* Cover studio on the Volume server (API mode): the brief is saved with PUT /cover/brief, concepts and
   the final covers are jobs with progress over SSE, concept images come from /assets, and Volume's
   typographic layer is drawn on top in the book's own cover style. */

type Preview = "ebook" | "wrap" | "thumb";
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

export function ApiCover({ book, apiBook }: { book: Book; apiBook: ApiBookDetail | undefined; penName?: PenName | undefined }) {
  const coverQ = useCover(book.id);
  if (coverQ.isPending) return <LoadingBlock label="Loading the cover studio" rows={6} />;
  if (coverQ.isError)
    return (
      <>
        <h1 className="font-book text-title text-ink">Cover studio</h1>
        <ErrorPanel className="mt-5 max-w-180" title="Could not load the cover studio" body={errorText(coverQ.error)} onRetry={() => void coverQ.refetch()} />
      </>
    );
  return <Studio book={book} apiBook={apiBook} cover={coverQ.data ?? null} />;
}

function Studio({ book, apiBook, cover }: { book: Book; apiBook: ApiBookDetail | undefined; cover: ApiCover | null }) {
  const canWrite = useCanWrite();
  const bookId = book.id;
  const putBrief = usePutCoverBrief();
  const makeConcepts = useCoverConcepts();
  const choose = useChooseCover();
  const build = useBuildCover();
  const exportsQ = useExports(bookId);
  const blueprintQ = useBlueprint(bookId);

  const serverBrief: Obj = cover?.brief ?? {};
  const hasBrief = Object.keys(serverBrief).some((k) => k !== "concepts");
  const [editing, setEditing] = useState(false);
  const [brief, setBrief] = useState<CoverBrief>(() => toBrief(serverBrief));
  const [picked, setPicked] = useState<string | null>(cover?.chosenAssetId ?? null);
  // The typography the owner set last time (saved by Choose), so the controls open where they were left.
  const savedType: Obj = cover?.typography ?? {};
  const [showSubtitle, setShowSubtitle] = useState(savedType["showSubtitle"] !== false);
  const [size, setSize] = useState(typeof savedType["sizePct"] === "number" ? savedType["sizePct"] : 100);
  const [position, setPosition] = useState<TitlePosition>(
    savedType["titlePosition"] === "top" || savedType["titlePosition"] === "middle" || savedType["titlePosition"] === "bottom"
      ? savedType["titlePosition"]
      : "style",
  );
  const [preview, setPreview] = useState<Preview>("ebook");
  // A job still open from before a reload (queued, running or stopped at the budget) is watched again.
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
  const toast = useToast();
  const [modelFix, setModelFix] = useState<{ problem: ModelProblem; retry: "concepts" | "build" } | null>(null);

  // The typographic layer: the book's own cover style (concept A in the demo is always the book's style).
  const bookOwn = useMemo(() => conceptsFor(book)[0]!, [book]);
  // The owner can pick any cover style; it is saved as typography.styleId and the build uses it.
  const [styleId, setStyleId] = useState<string>(
    typeof savedType["styleId"] === "string" && getCoverStyle(savedType["styleId"]) ? savedType["styleId"] : bookOwn.style.id,
  );
  const own = useMemo(() => {
    const style = getCoverStyle(styleId);
    if (!style || style.id === bookOwn.style.id) return bookOwn;
    return { ...bookOwn, style, base: coverFromStyle(style.id, style.palettes[0]?.id ?? "", bookOwn.base.titleLines), paletteIndex: 0 };
  }, [bookOwn, styleId]);
  const savedFonts = savedType["fonts"] as Obj | undefined;
  const [titleFont, setTitleFont] = useState<string>(typeof savedFonts?.["title"] === "string" ? savedFonts["title"] : "");
  const [paletteIdx, setPaletteIdx] = useState(() => {
    const i = own.style.palettes.findIndex((p) => p.id === savedType["paletteId"]);
    return i >= 0 ? i : own.paletteIndex;
  });
  const subtitle = showSubtitle ? book.subtitle : undefined;
  const palette = own.style.palettes[paletteIdx];
  // Edits made on the preview (alignment, exact positions, sizes, capitals), restored from the saved typography.
  const [edits, setEdits] = useState<CoverEdits>(() => editsFromSaved(savedType, layoutCover(own.base, { subtitle, size, position }).titleTop));
  const [selected, setSelected] = useState<CoverPart | null>(null);
  const design = useMemo(() => {
    const base = palette ? withPalette(own.base, palette) : own.base;
    const styled: CoverDesign = {
      ...base,
      ...(titleFont ? { titleFamily: titleFont } : {}),
      ...(edits.titleAlign ? { titleAlign: edits.titleAlign } : {}),
      ...(edits.subtitleAlign ? { subtitleAlign: edits.subtitleAlign } : {}),
      ...(edits.authorAlign ? { authorAlign: edits.authorAlign } : {}),
      ...(edits.subtitleSize !== undefined ? { subtitleScale: edits.subtitleSize } : {}),
      ...(edits.authorSize !== undefined ? { authorScale: edits.authorSize } : {}),
      ...(edits.titleUppercase !== undefined ? { titleUppercase: edits.titleUppercase } : {}),
    };
    return layoutCover(styled, { subtitle, size, position, titleTop: edits.titleTop, subtitleTop: edits.subtitleTop, authorTop: edits.authorTop });
  }, [own, palette, subtitle, size, position, edits, titleFont]);
  const edit = (part: CoverPart, top: number) => setEdits((e) => setTop(e, part, top));
  const editHandlers = {
    onSelect: setSelected,
    onAlign: (part: CoverPart, a: "left" | "center" | "right") => setEdits((e) => setAlign(e, part, a)),
    onTop: edit,
    onSmaller: (part: CoverPart) =>
      part === "title"
        ? setSize((s) => stepTitleSize(s, -1))
        : setEdits((e) => ({
            ...e,
            [part === "subtitle" ? "subtitleSize" : "authorSize"]: stepScale((part === "subtitle" ? e.subtitleSize : e.authorSize) ?? 1, -1),
          })),
    onLarger: (part: CoverPart) =>
      part === "title"
        ? setSize((s) => stepTitleSize(s, 1))
        : setEdits((e) => ({
            ...e,
            [part === "subtitle" ? "subtitleSize" : "authorSize"]: stepScale((part === "subtitle" ? e.subtitleSize : e.authorSize) ?? 1, 1),
          })),
    onUppercase: (on: boolean) => setEdits((e) => ({ ...e, titleUppercase: on })),
  };
  /**
   * What Choose stores and the build applies: only what the owner decided (design, colours, font, size, position, edits).
   * Nothing is worked out here, so the build and the preview (both made by the server from these settings) agree.
   */
  const typography: Obj = {
    styleId: own.style.id,
    paletteId: palette?.id ?? null,
    ...(titleFont ? { fonts: { title: titleFont } } : {}),
    showSubtitle,
    ...(position !== "style" ? { titlePosition: position } : {}),
    // The title's size as a share of the cover width: the design's own size times the percentage chosen.
    ...(size !== 100 ? { titleSize: Math.round(own.base.titleSize * size) / 100 } : {}),
    sizePct: size,
    ...editsToTypography(edits),
  };
  // Compare every key we send, plus the edit keys, so taking an edit away also counts as a change.
  const typeKeys = [...new Set([...Object.keys(typography), ...EDIT_KEYS])];
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
    const look = looks[i % looks.length]!;
    return { styleId: look.styleId, paletteId: look.paletteId, showSubtitle: true };
  };
  function pickConcept(c: CoverConcept, i: number) {
    setPicked(c.assetId);
    if (c.assetId === cover?.chosenAssetId) return;
    const look = looks[i % looks.length]!;
    const style = getCoverStyle(look.styleId);
    setStyleId(look.styleId);
    setPaletteIdx(Math.max(0, style?.palettes.findIndex((p) => p.id === look.paletteId) ?? 0));
    setEdits({});
    setPosition("style");
    setSize(100);
    setTitleFont("");
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
  const trim = parseTrim(book.trim);
  const typed = Number.parseInt(pagesText, 10);
  const pagesValid = pagesText === "" || (Number.isFinite(typed) && typed >= pageLimits.min && typed <= pageLimits.max6x9);
  const pages = pagesText !== "" && pagesValid ? typed : (realPages ?? 120);
  const paper: Paper = apiBook?.paper === "white" ? "white" : "cream";
  const wrap = wrapSize(trim, pages, paper);
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

  const action: StepAction | null = editing
    ? { label: "Save brief", onClick: () => void saveBrief(), disabledReason: putBrief.isPending ? "Saving the brief." : undefined }
    : concepts.length === 0 || making
      ? {
          label: making ? "Making concepts" : "Make concepts",
          estimate: "about $0.16",
          onClick: () => void startConcepts(),
          disabledReason: making ? "Making the concepts now." : conceptsPaused ? "Raise the book's budget above to carry on." : undefined,
        }
      : !chosen || (pick && pick.assetId !== chosen.assetId)
        ? {
            label: "Use this concept",
            onClick: () => void chooseConcept(),
            disabledReason: pick ? (choose.isPending ? "Saving your choice." : undefined) : "Pick a concept first.",
          }
        : built && !building && !typeChanged && !stalePages && !styleStale
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
  const wrapPage = useCoverPreview(bookId, "wrap", settled, pagesValid ? pages : undefined, front?.assetId, previewOn && preview === "wrap");
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

  return (
    <>
      <PageHeader title="Cover studio" summary="Your cover is made here in four steps. Or skip them and upload a cover you already have." />
      {apiBook?.status === "published" && (
        <Banner tone="info" title="This book is already published" className="mt-4 max-w-215">
          You can still change its cover. Make or pick a new one and build it, then build the pack again on Export and upload the new files to KDP.
        </Banner>
      )}
      <CoverSteps
        steps={[
          {
            label: "Brief",
            help: "Optional. The mood, colours and symbols you want. Leave it and the AI writes one from your blueprint.",
            done: hasBrief,
            current: editing,
          },
          {
            label: "Make concepts",
            help: "The AI draws a few background designs to choose from.",
            done: concepts.length > 0,
            current: !editing && (concepts.length === 0 || making),
          },
          {
            label: "Pick one",
            help: "Click the design you like, then Use this concept. Set the title size and colours under it.",
            done: !!chosen,
            current: !editing && concepts.length > 0 && !making && (!chosen || (!!pick && pick.assetId !== chosen.assetId)),
          },
          {
            label: "Build covers",
            help: "Makes the final eBook cover and the paperback wrap with spine.",
            done: built,
            current: !editing && !!chosen && !(pick && pick.assetId !== chosen.assetId),
          },
        ]}
        status={status}
        action={canWrite ? action : null}
      />
      {conceptsPaused && conceptJob && (
        <BudgetPausedBanner
          className="mt-4 max-w-215"
          bookId={bookId}
          jobId={conceptJob}
          message={conceptWatch.error}
          budgetUsd={book.cost.budget}
          spentUsd={book.cost.spent}
        />
      )}
      {buildPaused && buildJob && (
        <BudgetPausedBanner
          className="mt-4 max-w-215"
          bookId={bookId}
          jobId={buildJob}
          message={buildWatch.error}
          budgetUsd={book.cost.budget}
          spentUsd={book.cost.spent}
        />
      )}
      {modelFix && (
        <ModelFallbackBanner
          bookId={bookId}
          className="mt-4 max-w-215"
          problem={modelFix.problem}
          onDismiss={() => setModelFix(null)}
          onRetry={() => void (modelFix.retry === "concepts" ? startConcepts() : startBuild())}
        />
      )}
      {problem && (
        <Banner
          tone="error"
          title="That did not work"
          className="mt-4 max-w-215"
          action={
            <Button size="sm" variant="ghost" onClick={() => setProblem(null)}>
              Dismiss
            </Button>
          }
        >
          {problem}
        </Banner>
      )}

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_var(--vol-inspector)]">
        <div className="grid min-w-0 content-start gap-6">
          <BriefCard
            brief={brief}
            onChange={setBrief}
            done={!editing}
            onEdit={() => {
              setBrief(toBrief(serverBrief));
              setEditing(true);
            }}
          />
          {editing && (
            <div className="-mt-3 flex flex-wrap gap-2">
              <Button variant="ghost" onClick={() => setEditing(false)}>
                Cancel
              </Button>
            </div>
          )}

          <section aria-labelledby="concepts-title" className="rounded-md border border-border bg-sheet p-5 sm:p-6">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 id="concepts-title" className="font-book text-heading text-ink">
                Concepts
              </h2>
              {concepts.length > 0 && !making && canWrite && (
                <Button size="sm" variant="ghost" icon={RotateCw} estimate="about $0.16" onClick={() => void startConcepts()}>
                  Make new concepts
                </Button>
              )}
            </div>
            <p className="mt-1 text-small text-ink-secondary">
              Background art from the image model, marked AI-generated. Volume sets the title, subtitle and author in the book's cover style. Making new
              concepts replaces these, so download any you want to keep first.
            </p>
            {making ? (
              <div role="status" aria-label="Making concepts" className="mt-4 grid gap-3">
                <ProgressBar
                  value={Math.round(conceptWatch.progress * 100)}
                  max={100}
                  live
                  label="Concept progress"
                  valueText={conceptWatch.message ?? jobStatusText(conceptWatch.status)}
                />
                <p className="flex items-center gap-2 text-small text-ink-secondary">
                  <Loader />
                  {conceptWatch.message ?? jobStatusText(conceptWatch.status)}
                </p>
                <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                  {[0, 1, 2, 3].map((i) => (
                    <Skeleton key={i} variant="cover" className="w-full" />
                  ))}
                </div>
              </div>
            ) : concepts.length === 0 ? (
              <div className="mt-4 rounded-md border border-dashed border-border-strong p-5">
                <p className="text-label text-ink">No concepts yet.</p>
                <p className="mt-1 text-small text-ink-secondary">Press Make concepts above to get designs to compare.</p>
              </div>
            ) : (
              <div role="radiogroup" aria-label="Concepts" className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-4">
                {concepts.map((c, i) => {
                  const checked = picked === c.assetId;
                  return (
                    <label key={c.assetId} className="group grid cursor-pointer content-start gap-2">
                      <input type="radio" name="concept" className="peer sr-only" checked={checked} onChange={() => pickConcept(c, i)} />
                      <span
                        className={cn(
                          "block rounded-sm p-1.5 ring-offset-2 ring-offset-sheet transition-colors duration-(--vol-dur-fast)",
                          "peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-select",
                          checked ? "bg-select-wash ring-2 ring-select" : "hover:bg-sunken",
                        )}
                      >
                        <ConceptThumb
                          bookId={bookId}
                          assetId={c.assetId}
                          typography={conceptTypography(c, i)}
                          title={`${c.name}, as the build draws it`}
                          enabled={!previewOn || !ebookPage.isPending}
                        />
                      </span>
                      <span className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
                        <span className={cn("text-label", checked ? "font-semibold text-select" : "text-ink")}>{c.name}</span>
                        {chosen?.assetId === c.assetId && <StatusChip status="passed">In use</StatusChip>}
                      </span>
                      {c.why && <span className="text-small text-ink-secondary">{c.why}</span>}
                      <a
                        href={assetsApi.downloadUrl(c.assetId)}
                        download
                        className="inline-flex items-center gap-1 text-small font-medium text-select underline-offset-2 hover:underline"
                      >
                        <Download size={14} aria-hidden />
                        Download art
                      </a>
                      {c.mock && <span className="text-small text-accent-text">Placeholder image from the test image model.</span>}
                    </label>
                  );
                })}
              </div>
            )}
          </section>

          <section aria-labelledby="type-title" className="rounded-md border border-border bg-sheet p-5 sm:p-6">
            <h2 id="type-title" className="font-book text-heading text-ink">
              Type and preview
            </h2>
            {!front ? (
              <p className="mt-2 text-body text-ink-secondary">Pick a concept to see the eBook cover and the wrap.</p>
            ) : (
              <div className="mt-4 grid grid-cols-1 gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
                <div className="grid content-start gap-4">
                  <p className="text-small text-ink-secondary">The build uses exactly what you set here.</p>
                  <div className="grid gap-1.5">
                    <label htmlFor="cover-design" className="text-label text-ink">
                      Design
                    </label>
                    <select
                      id="cover-design"
                      value={own.style.id}
                      disabled={!canWrite}
                      onChange={(e) => {
                        setStyleId(e.target.value);
                        setPaletteIdx(0);
                        setEdits({});
                        setPosition("style");
                        setSize(100);
                        setTitleFont("");
                      }}
                      className="h-11 w-full rounded-sm border border-border-strong bg-sheet px-3 text-body text-ink"
                    >
                      {coverStyles.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                    <p className="text-small text-ink-secondary">{own.style.description}</p>
                  </div>
                  <div className="grid gap-1.5">
                    <label htmlFor="cover-title-font" className="text-label text-ink">
                      Title font
                    </label>
                    <select
                      id="cover-title-font"
                      value={titleFont}
                      disabled={!canWrite}
                      onChange={(e) => setTitleFont(e.target.value)}
                      className="h-11 w-full rounded-sm border border-border-strong bg-sheet px-3 text-body text-ink"
                      style={titleFont ? { fontFamily: `'${titleFont}'` } : undefined}
                    >
                      <option value="">Design's own font</option>
                      {TITLE_FONTS.map((f) => (
                        <option key={f} value={f} style={{ fontFamily: `'${f}'` }}>
                          {f}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="title-size" className="flex justify-between text-label text-ink">
                      Title size <span className="num text-ink-secondary">{size}%</span>
                    </label>
                    <input
                      id="title-size"
                      type="range"
                      min={60}
                      max={180}
                      step={5}
                      value={size}
                      onChange={(e) => setSize(Number(e.target.value))}
                      className="mt-2 h-11 w-full accent-select"
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <span aria-hidden className="text-label text-ink">
                      Title position
                    </span>
                    <SegmentedControl
                      label="Title position"
                      value={position}
                      onChange={(p) => {
                        setPosition(p);
                        setEdits(clearTops);
                      }}
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
                      {own.style.palettes.map((pal, i) => (
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
                  {chosen && typeChanged && (
                    <p className="text-small text-accent-text">Type changed since you chose the concept. Build covers saves it first.</p>
                  )}
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
                  {preview === "ebook" && (
                    <figure className="grid justify-items-start gap-3">
                      <div className="flex flex-wrap items-start gap-5">
                        <CoverEditor design={design} subtitle={subtitle} width={300} selected={selected} disabled={!canWrite} live={live} {...editHandlers}>
                          {ebookPage.data ? (
                            <CoverFrame
                              html={ebookPage.data.html}
                              widthPx={ebookPage.data.widthPx}
                              heightPx={ebookPage.data.heightPx}
                              width={300}
                              title={`${book.title}, eBook cover as the build draws it`}
                              onMeasure={setMeasure}
                            />
                          ) : (
                            <div className="animate-pulse rounded-cover bg-sunken" style={{ width: 300, aspectRatio: "1600 / 2560" }} />
                          )}
                        </CoverEditor>
                        <div className="grid min-w-60 max-w-80 flex-1 content-start gap-3">
                          {selected && canWrite ? (
                            <CoverToolbar
                              part={selected}
                              design={design}
                              subtitle={subtitle}
                              titleSizePct={size}
                              live={
                                measure?.[selected]
                                  ? {
                                      top: measure[selected].top,
                                      align: measure[selected].align,
                                      uppercase: edits.titleUppercase ?? own.base.titleUppercase,
                                      titleSize: measure.titleSize,
                                    }
                                  : undefined
                              }
                              {...editHandlers}
                            />
                          ) : (
                            <p className="text-small text-ink-secondary">
                              {canWrite
                                ? "Click the title, subtitle or author name on the cover to change it. Drag it to move it."
                                : "You can look at the cover but not change it."}
                            </p>
                          )}
                          {typeChanged && (
                            <div role="status" className="grid gap-2 rounded-md bg-sunken p-2.5">
                              <p className="text-label text-accent-text">Unsaved changes</p>
                              {chosen ? (
                                <Button
                                  size="sm"
                                  loading={choose.isPending}
                                  loadingLabel="Saving"
                                  onClick={() => void saveType()}
                                  disabledReason={canWrite ? undefined : "You can look at the cover but not change it."}
                                >
                                  Save changes
                                </Button>
                              ) : (
                                <p className="text-small text-ink-secondary">They are saved when you press Use this concept.</p>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                      <figcaption className="num text-small text-ink-secondary">
                        {ebookCoverPx.width} x {ebookCoverPx.height} px, JPEG, RGB. Height to width {(ebookCoverPx.height / ebookCoverPx.width).toFixed(2)}; KDP
                        needs {ebookMinRatio} or more.
                      </figcaption>
                    </figure>
                  )}
                  {preview === "thumb" && (
                    <figure className="grid justify-items-start gap-3">
                      {ebookPage.data ? (
                        <CoverFrame
                          html={ebookPage.data.html}
                          widthPx={ebookPage.data.widthPx}
                          heightPx={ebookPage.data.heightPx}
                          width={160}
                          title={`${book.title}, thumbnail`}
                        />
                      ) : (
                        <div className="animate-pulse rounded-cover bg-sunken" style={{ width: 160, aspectRatio: "1600 / 2560" }} />
                      )}
                      <figcaption className="text-small text-ink-secondary">At 160 px wide, as on a search results page.</figcaption>
                    </figure>
                  )}
                  {preview === "wrap" && (
                    <div className="grid gap-4">
                      <div className="grid grid-cols-[minmax(0,160px)] gap-1.5">
                        <label htmlFor="pages" className="text-label text-ink">
                          Page count
                        </label>
                        <input
                          id="pages"
                          inputMode="numeric"
                          value={pagesText}
                          placeholder={realPages !== null ? String(realPages) : "Not built yet"}
                          onChange={(e) => setPagesText(e.target.value.replace(/[^\d]/g, ""))}
                          aria-invalid={!pagesValid}
                          aria-describedby="pages-hint"
                          className={cn(
                            "num h-11 w-full rounded-sm border bg-sheet px-3 text-body text-ink placeholder:text-ink-tertiary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-select",
                            pagesValid ? "border-border-strong" : "border-claim",
                          )}
                        />
                      </div>
                      <p id="pages-hint" className={cn("text-small", pagesValid ? "text-ink-secondary" : "text-claim")} role={pagesValid ? undefined : "alert"}>
                        {!pagesValid
                          ? `Use ${pageLimits.min} to ${pageLimits.max6x9} pages for ${book.trim}.`
                          : realPages !== null
                            ? `The interior PDF has ${realPages} pages. Try other counts here; the build always uses the real one.`
                            : "No interior PDF yet, so this preview uses 120 pages. Build covers makes the interior first and uses its real count."}
                      </p>
                      <WrapPreview page={wrapPage.data} trim={trim} pages={pages} paper={paper} />
                      {!blurb && <p className="text-small text-ink-secondary">No back blurb yet. It comes from the blueprint's listing.</p>}
                      <div className="rounded-md bg-canvas p-4 text-small text-ink-secondary">
                        <p className="num text-ink">
                          Spine = {pages} pages x {spinePerPage[paper]} in ({paper}) = <b className="font-semibold">{inches(wrap.spine)}</b>
                        </p>
                        <p className="num mt-1">
                          Wrap = {coverBleedIn} + {trim.w} + {wrap.spine.toFixed(4)} + {trim.w} + {coverBleedIn} = {inches(wrap.width)} wide,{" "}
                          {inches(wrap.height, 3)} high
                        </p>
                        <p className={cn("mt-1", pages >= spineTextMinPages ? "text-ink-secondary" : "text-accent-text")}>
                          {pages >= spineTextMinPages
                            ? `Spine text on: ${spineTextMinPages} pages or more.`
                            : `No spine text: Volume uses it from ${spineTextMinPages} pages.`}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </section>

          {(building || built) && (
            <section aria-labelledby="build-title" className="rounded-md border border-border bg-sheet p-5 sm:p-6">
              <h2 id="build-title" className="font-book text-heading text-ink">
                {building ? "Building covers" : "Covers built"}
              </h2>
              {building ? (
                <>
                  <ProgressBar
                    className="mt-3"
                    value={Math.round(buildWatch.progress * 100)}
                    max={100}
                    live
                    label="Cover build progress"
                    valueText={buildWatch.message ?? jobStatusText(buildWatch.status)}
                  />
                  <p className="mt-3 flex items-center gap-2 text-small text-ink-secondary">
                    <Loader />
                    {buildWatch.message ?? jobStatusText(buildWatch.status)}
                  </p>
                </>
              ) : (
                cover && (
                  <div className="mt-4 grid grid-cols-1 gap-5 sm:grid-cols-[180px_minmax(0,1fr)]">
                    {cover.ebookAssetId && (
                      <img
                        src={assetsApi.downloadUrl(cover.ebookAssetId, true)}
                        alt={`Built eBook cover of ${book.title}`}
                        className="w-45 rounded-cover"
                        style={{ boxShadow: "var(--vol-shadow-cover)" }}
                      />
                    )}
                    <div className="grid content-start gap-2">
                      <p className="flex items-center gap-1.5 text-small text-success">
                        <Check size={14} strokeWidth={2} aria-hidden />
                        Built{builtPages !== null ? ` for ${builtPages} ${paper} pages` : ""}. The AI disclosure records AI-generated images.
                      </p>
                      {styleStale && !stalePages && (
                        <p className="text-small text-accent-text">
                          The title, style, type settings or art changed after these covers were built, so the files below are out of date. Use Build covers
                          again below.
                        </p>
                      )}
                      {stalePages && (
                        <p className="text-small text-accent-text">
                          The book is now {pdf?.pageCount} pages, so the paperback wrap needs building again. Use Build covers again below.
                        </p>
                      )}
                      {cover.wrapSpec["mock"] === true && <p className="text-small text-accent-text">Built from placeholder art by the test image model.</p>}
                      <div className="flex flex-wrap gap-2">
                        {cover.ebookAssetId && (
                          <a href={assetsApi.downloadUrl(cover.ebookAssetId)} download className={buttonClasses("secondary")}>
                            <Download size={16} aria-hidden />
                            eBook cover (JPEG)
                          </a>
                        )}
                        {cover.wrapAssetId && (
                          <a href={assetsApi.downloadUrl(cover.wrapAssetId)} download className={buttonClasses("secondary")}>
                            <Download size={16} aria-hidden />
                            Paperback wrap (PDF)
                          </a>
                        )}
                        {canWrite && (
                          <button type="button" className={buttonClasses("secondary")} disabled={building} onClick={() => void startBuild()}>
                            <RotateCw size={16} aria-hidden />
                            {building ? "Building covers" : "Build again"}
                          </button>
                        )}
                      </div>
                      <Link to={`/books/${bookId}/export`} className="text-small font-medium text-select underline underline-offset-2">
                        Open Export
                      </Link>
                    </div>
                  </div>
                )
              )}
            </section>
          )}

          <OwnCoverPanel
            bookId={bookId}
            cover={cover}
            canWrite={canWrite}
            wrapHint={`${Number(wrap.width.toFixed(4))} x ${inches(wrap.height, 3)} for ${pages} ${paper} pages${realPages === null ? " (an estimate until the interior PDF is exported)" : ""}`}
            onAnnounce={setAnnounce}
          />
        </div>

        <CoverInspector
          book={book}
          pages={pages}
          paper={paper}
          interiorExists={realPages !== null}
          built={built}
          typographic={cover?.wrapSpec["typographic"] === true}
        />
      </div>
      <span className="sr-only" role="status" aria-live="polite">
        {announce}
      </span>
    </>
  );
}

/** The cover process at the top of the studio: four numbered steps, the current one with its button. */
function CoverSteps({
  steps,
  status,
  action,
}: {
  steps: { label: string; help: string; done: boolean; current: boolean }[];
  status: string;
  action: StepAction | null;
}) {
  return (
    <section aria-label="How your cover is made" className="mt-5 max-w-275 rounded-md border border-border bg-sheet p-4 sm:p-5">
      <ol className="grid gap-3 md:grid-cols-4">
        {steps.map((st, i) => (
          <li
            key={st.label}
            aria-current={st.current ? "step" : undefined}
            className={cn("grid content-start gap-1 rounded-sm p-3", st.current ? "bg-select-wash ring-2 ring-select" : "bg-canvas")}
          >
            <span className="flex items-center gap-2 text-label text-ink">
              <span
                className={cn(
                  "grid size-6 shrink-0 place-items-center rounded-full text-caption font-semibold",
                  st.done ? "bg-success text-sheet" : st.current ? "bg-select text-sheet" : "border border-border-strong text-ink-secondary",
                )}
              >
                {st.done ? <Check size={13} strokeWidth={2.5} aria-hidden /> : i + 1}
              </span>
              {st.label}
              <span className="sr-only">{st.done ? ", done" : st.current ? ", do this now" : ""}</span>
            </span>
            <span className="text-small text-ink-secondary">{st.help}</span>
          </li>
        ))}
      </ol>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <p role="status" className="min-w-0 flex-1 text-small text-ink">
          <b className="font-semibold">Now: </b>
          {status}
        </p>
        {action && (action.onClick || action.to) && (
          <Button
            icon={action.label.startsWith("Make") ? RotateCw : undefined}
            estimate={action.estimate}
            disabledReason={action.disabledReason}
            onClick={action.onClick}
          >
            {action.label}
          </Button>
        )}
        <a href="#own-cover-title" className={buttonClasses("ghost")}>
          <Upload size={16} aria-hidden />
          Use my own cover instead
        </a>
      </div>
    </section>
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
