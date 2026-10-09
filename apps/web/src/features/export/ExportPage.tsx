import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { Check, Download, FileArchive, FileImage, FileText, FileType, Package, Sparkles } from "lucide-react";
import { Banner, Button, EmptyState, Inspector, InspectorSection, KeyValueList, Loader, Modal, PageHeader, ProgressBar } from "../../components/ui";
import { sourdoughExport, stageOrder, type Book, type ExportFormat, type PreflightItem } from "../../demo";
import { cn } from "../../lib/cn";
import { formatDate, formatRelative } from "../../lib/format";
import { useBook } from "../../lib/useBook";
import { useStepAction } from "../../lib/stepAction";
import { NotFound } from "../../shell/NotFound";
import { ErrorPanel, LoadingBlock, useScreenState } from "../writing/screenState";
import { Calculator } from "./Calculator";
import { Cover } from "../../components/ui";
import { getPenName } from "../../demo";
import { InteriorPreview } from "./InteriorPreview";
import { interiorLook } from "../../lib/interiorLook";
import { inches, listing, pageLimits, ruleLabel, parseTrim, rulesRecheckDue, rulesVersion, spineWidthIn } from "./kdpRules";
import { Preflight, type PreflightRow } from "./Preflight";
import { ApiExport } from "./ApiExport";

/* Export (docs/03-design/UX-SPEC.md, M11, docs/book-production/EXPORT-SPEC.md). Sourdough on a Weeknight carries the demo's
   export state. Preflight checks are rebuilt here with numbers from config/kdp-rules. ?state=blocked adds a
   failing check to show how a block stops the pack. */

const PACK_DATE = "2026-10-04";
const BUILD_STEP_MS = 420;

export default function ExportPage() {
  const { book, from, apiBook } = useBook();
  const { state, retry } = useScreenState();
  if (!book) return <NotFound what="book" />;
  if (from === "api")
    return (
      <div className="px-4 py-6 sm:px-8 lg:px-10 lg:py-7">
        <ApiExport key={book.id} book={book} apiBook={apiBook} />
      </div>
    );
  return (
    <div className="px-4 py-6 sm:px-8 lg:px-10 lg:py-7">
      {state === "loading" && <LoadingBlock label="Loading the export" rows={8} />}
      {state === "error" && (
        <>
          <h1 className="font-book text-title text-ink">Export</h1>
          <ErrorPanel
            className="mt-5 max-w-[720px]"
            title="Preflight could not run"
            body="The export service did not answer. Your files and settings are unchanged. Retry to run preflight again."
            onRetry={retry}
          />
        </>
      )}
      {state === "empty" && <NothingBuilt book={book} />}
      {state === "ready" && (book.id === sourdoughExport.bookId ? <ExportReady book={book} /> : <NothingBuilt book={book} />)}
    </div>
  );
}

function NothingBuilt({ book }: { book: Book }) {
  const ready = stageOrder.indexOf(book.stage) >= stageOrder.indexOf("export");
  return (
    <>
      <PageHeader title="Export" summary="Check, build and download the KDP upload pack." />
      <EmptyState
        className="mt-6 max-w-[640px]"
        drawing="box"
        title="Nothing built yet"
        body={
          ready
            ? "This book's pack lives with the published files. The demo's export state is on Sourdough on a Weeknight."
            : "Export opens once the manuscript is edited and the covers are built. Preflight then checks every KDP rule."
        }
        action={
          <Link
            to={ready ? "/books/sourdough-on-a-weeknight/export" : `/books/${book.id}/cover`}
            className="inline-flex h-10 items-center rounded-sm border border-border-strong bg-sheet px-4 text-label font-semibold text-ink hover:bg-sunken"
          >
            {ready ? "Open Sourdough on a Weeknight" : "Open the cover studio"}
          </Link>
        }
      />
    </>
  );
}

function buildPreflight(book: Book, blocked: boolean): PreflightItem[] {
  const data = sourdoughExport;
  const from = (id: string) => data.preflight.find((p) => p.id === id);
  const titleLen = book.title.length + book.subtitle.length;
  const trim = parseTrim(data.trim);
  const spine = spineWidthIn(data.pageCount, data.paper);
  const descLen = blocked ? 4212 : 1412;
  const fmt = new Intl.NumberFormat("en-GB");
  const item = (p: Omit<PreflightItem, "fixLabel" | "fixRoute"> & Partial<Pick<PreflightItem, "fixLabel" | "fixRoute">>): PreflightItem => ({
    fixLabel: null,
    fixRoute: null,
    ...p,
  });
  const list: (PreflightItem | undefined)[] = [
    from("pf-1"),
    item({
      id: "claims",
      area: "Manuscript",
      label: "Claims to verify",
      result: "pass",
      detail: "0 open. 3 sourced and 1 softened in the Editor.",
      ruleId: null,
    }),
    item({
      id: "title",
      area: "Listing",
      label: "Title and subtitle length",
      result: titleLen <= listing.titleMax ? "pass" : "block",
      detail: `${titleLen} characters. KDP allows up to ${listing.titleMax}.`,
      ruleId: "listing.titleSubtitle.maxChars",
    }),
    item({
      id: "description",
      area: "Listing",
      label: "Description length",
      result: descLen <= listing.descriptionMax ? "pass" : "block",
      detail: `${fmt.format(descLen)} of ${fmt.format(listing.descriptionMax)} characters including HTML tags.`,
      ruleId: "listing.description.maxChars",
      fixLabel: "Shorten in Blueprint",
      fixRoute: `/books/${book.id}/blueprint`,
    }),
    item({
      id: "keywords",
      area: "Listing",
      label: "Keywords",
      result: "pass",
      detail: `${listing.keywords} of ${listing.keywords}.`,
      ruleId: "listing.keywords",
    }),
    item({
      id: "categories",
      area: "Listing",
      label: "Categories",
      result: "pass",
      detail: `${listing.categories} of ${listing.categories}, to pick in KDP's own chooser.`,
      ruleId: "listing.categories",
    }),
    from("pf-11"),
    item({
      id: "trim",
      area: "Interior",
      label: "Trim size",
      result: "pass",
      detail: `${data.trim} in the interior PDF matches the listing.`,
      ruleId: "paperback.trimAndPages",
    }),
    item({
      id: "pages",
      area: "Interior",
      label: "Page count",
      result: data.pageCount >= pageLimits.min && data.pageCount <= pageLimits.max6x9 ? "pass" : "block",
      detail: `${data.pageCount} pages on ${data.trim}. KDP accepts ${pageLimits.min} to ${pageLimits.max6x9} for this trim.`,
      ruleId: "paperback.trimAndPages",
    }),
    item({
      id: "fonts",
      area: "Interior",
      label: "Fonts embedded",
      result: "pass",
      detail: `${interiorLook(book).fontsLine}, from the ${interiorLook(book).name} theme, embedded and subset in the PDF.`,
      ruleId: "manuscript.formats",
    }),
    from("pf-6"),
    item({
      id: "spine",
      area: "Cover",
      label: "Spine width",
      result: "pass",
      detail: `${inches(spine, 3)} for ${data.pageCount} ${data.paper} pages. Wrap ${inches(0.125 * 2 + trim.w * 2 + spine, 3)} wide.`,
      ruleId: "paperback.spine.widthPerPage",
    }),
    from("pf-8"),
    from("pf-10"),
  ];
  return list.filter((x): x is PreflightItem => Boolean(x));
}

const formatIcon: Record<string, typeof FileText> = {
  pdf: FileText,
  wrap: FileImage,
  epub: FileType,
  "ebook-cover": FileImage,
  docx: FileText,
  txt: FileText,
  md: FileText,
};
const formatOrder = ["pdf", "docx", "epub", "txt", "md", "ebook-cover", "wrap"];
const formatLabel: Record<string, string> = {
  pdf: "Print PDF, 6 x 9 in",
  docx: "Word document (DOCX)",
  epub: "EPUB 3",
  txt: "Plain text (TXT)",
  md: "Markdown (MD)",
  "ebook-cover": "eBook cover (JPEG)",
  wrap: "Paperback cover (PDF)",
};
const formatUse: Record<string, string> = {
  pdf: "Upload as the paperback manuscript.",
  docx: "Kindle conversion, or edit in Word.",
  epub: "Upload as the Kindle eBook manuscript.",
  txt: "Your own format with ==== section breaks.",
  md: "The canonical manuscript. Volume imports it back.",
  "ebook-cover": "Upload as the Kindle eBook cover.",
  wrap: "Upload as the paperback cover.",
};

function ExportReady({ book }: { book: Book }) {
  const [params] = useSearchParams();
  const blocked = params.get("state") === "blocked";
  const data = sourdoughExport;
  const slug = book.id;
  const trimSlug = data.trim.replace(/\s*in$/, "").replace(/\s/g, "");
  const items = useMemo(() => buildPreflight(book, blocked), [book, blocked]);
  const [checking, setChecking] = useState<number | null>(null);
  const [ticked, setTicked] = useState<Record<string, boolean>>({});
  const [selected, setSelected] = useState("pdf");
  const [confirm, setConfirm] = useState(false);
  const [build, setBuild] = useState<{ step: number; done: boolean } | null>(null);
  const [announce, setAnnounce] = useState("");
  const timers = useRef<number[]>([]);
  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);

  const rows: PreflightRow[] = items.map((it, i) => ({ ...it, checking: checking !== null && i >= checking }));
  const blocks = items.filter((i) => i.result === "block");
  const warns = items.filter((i) => i.result === "warn");
  const unticked = warns.filter((w) => !ticked[w.id]);
  const formats = formatOrder.map((id) => data.formats.find((f) => f.id === id)).filter((f): f is ExportFormat => Boolean(f));
  const fileName = (f: ExportFormat) => {
    switch (f.id) {
      case "pdf":
        return `${slug}-interior-${trimSlug}.pdf`;
      case "wrap":
        return `${slug}-paperback-wrap-${trimSlug}-${data.paper}-${data.pageCount}p.pdf`;
      case "ebook-cover":
        return `${slug}-ebook-cover.jpg`;
      default:
        return `${slug}.${f.id}`;
    }
  };
  const packName = `${slug}-kdp-pack-${PACK_DATE}.zip`;
  const packFiles = [
    ["README.txt", "What each file is and the KDP upload order"],
    ...formats.map((f) => [`${f.id === "ebook-cover" || f.id === "wrap" ? "cover" : "manuscript"}/${fileName(f)}`, formatLabel[f.id] ?? f.label]),
    ["listing/metadata.txt", "Title, subtitle, author, prices, keywords, categories"],
    ["listing/description.html", "The Amazon description"],
    ["listing/ai-disclosure.txt", "What was AI-generated and why"],
    ["reports/preflight.txt", "These checks, with the date"],
    ["reports/claims-to-verify.csv", "Every claim and how it was resolved"],
    ["reports/kdp-rules-used.txt", `Rules ${rulesVersion}, fact ids and dates`],
    ["marketing/tiktok-scripts.txt", "From Marketing"],
    ["marketing/instagram-captions.txt", "From Marketing"],
    ["marketing/launch-email.txt", "From Marketing"],
  ] as [string, string][];
  const buildSteps = ["Interior PDF", "EPUB", "DOCX", "TXT and Markdown", "Covers", "Listing and reports", `Zip ${packName}`];

  function runPreflight() {
    setChecking(0);
    items.forEach((_, i) => timers.current.push(window.setTimeout(() => setChecking(i + 1 >= items.length ? null : i + 1), 140 * (i + 1))));
    timers.current.push(window.setTimeout(() => setAnnounce("Preflight finished."), 140 * items.length));
  }

  function startBuild() {
    setConfirm(false);
    setBuild({ step: 0, done: false });
    buildSteps.forEach((_, i) =>
      timers.current.push(window.setTimeout(() => setBuild({ step: i + 1, done: i === buildSteps.length - 1 }), BUILD_STEP_MS * (i + 1))),
    );
    timers.current.push(window.setTimeout(() => setAnnounce("Pack ready to download."), BUILD_STEP_MS * buildSteps.length));
  }

  function download() {
    const text = [
      `${book.title}: KDP upload pack (demo)`,
      `Built ${formatDate(`${PACK_DATE}T12:00:00+01:00`)} by Volume. This demo file lists the pack; the real app saves ${packName}.`,
      "",
      ...packFiles.map(([p, d]) => `${p}    ${d}`),
      "",
      "AI disclosure: AI-generated text and AI-generated images. Declare both in KDP.",
    ].join("\n");
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${slug}-kdp-pack-${PACK_DATE}-contents.txt`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setAnnounce("Download started.");
  }

  const disabledReason =
    checking !== null
      ? "Preflight is running."
      : blocks.length > 0
        ? `${blocks.length} ${blocks.length === 1 ? "check fails" : "checks fail"}. Fix ${blocks.length === 1 ? "it" : "them"} first.`
        : unticked.length > 0
          ? `Tick ${unticked.length === 1 ? "the warning" : `the ${unticked.length} warnings`} to confirm you have checked ${unticked.length === 1 ? "it" : "them"}.`
          : undefined;
  const sel = formats.find((f) => f.id === selected);
  useStepAction(
    build?.done
      ? null
      : { label: build ? "Building pack" : "Build pack", onClick: () => setConfirm(true), disabledReason: build ? "The pack is building." : disabledReason },
  );

  return (
    <>
      <PageHeader title="Export" summary="Check, build and download the KDP upload pack." />
      {disabledReason && !build && (
        <p className="mt-2 text-small text-ink-secondary" role="status">
          {disabledReason}
        </p>
      )}
      {blocks.length > 0 && (
        <Banner tone="error" title="The pack is blocked" className="mt-4 max-w-[860px]">
          {blocks.map((b) => b.label).join(", ")} must pass before Volume builds the pack.
        </Banner>
      )}

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_var(--vol-inspector)]">
        <div className="grid min-w-0 content-start gap-6">
          {build && (
            <section aria-labelledby="build-title" className="rounded-md border border-border bg-sheet p-5 sm:p-6">
              <h2 id="build-title" className="font-book text-heading text-ink">
                {build.done ? "Pack ready" : "Building the pack"}
              </h2>
              <ProgressBar
                className="mt-3"
                value={build.step}
                max={buildSteps.length}
                live={!build.done}
                label="Pack build progress"
                valueText={`${build.step} of ${buildSteps.length} steps`}
              />
              <ol className="mt-3 grid grid-cols-1 gap-1.5 text-[14px] sm:grid-cols-2">
                {buildSteps.map((s, i) => (
                  <li key={s} className={cn("flex min-w-0 items-center gap-2", i < build.step ? "text-ink" : "text-ink-tertiary")}>
                    {i < build.step ? (
                      <Check size={14} strokeWidth={2} className="shrink-0 text-success" aria-hidden />
                    ) : i === build.step ? (
                      <Loader />
                    ) : (
                      <span className="w-3.5 shrink-0" />
                    )}
                    <span className="truncate">{s}</span>
                  </li>
                ))}
              </ol>
              {build.done && (
                <div className="mt-4 flex flex-wrap items-center gap-3 rounded-md bg-success-wash px-4 py-3">
                  <FileArchive size={18} className="text-success" aria-hidden />
                  <p className="min-w-0 flex-1 text-[14px] leading-5 text-ink">
                    <b className="block font-semibold">{breakable(packName)}</b>
                    <span className="text-small text-ink-secondary">{packFiles.length} files, about 24 MB. Demo download saves a list of the contents.</span>
                  </p>
                  <Button icon={Download} onClick={download}>
                    Download
                  </Button>
                </div>
              )}
            </section>
          )}

          <Preflight rows={rows} ticked={ticked} onTick={(id, on) => setTicked((t) => ({ ...t, [id]: on }))} running={checking !== null} onRun={runPreflight} />

          <Calculator defaultPages={data.pageCount} defaultPrice={9.99} defaultEbookPrice={3.99} defaultSizeMb={2.4} />

          <section aria-labelledby="formats-title" className="rounded-md border border-border bg-sheet p-5 sm:p-6">
            <h2 id="formats-title" className="font-book text-heading text-ink">
              Formats
            </h2>
            <p className="mt-1 text-small text-ink-secondary">Build pack rebuilds anything stale or missing. Select a file to see its details.</p>
            <div role="radiogroup" aria-label="Files" className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 2xl:grid-cols-3">
              {formats.map((f) => {
                const Icon = formatIcon[f.id] ?? FileText;
                const built = build?.done === true;
                const status = built
                  ? "Built today"
                  : f.lastBuilt === null
                    ? "Not built"
                    : f.stale
                      ? "Stale, older than the latest change"
                      : `Built ${formatRelative(f.lastBuilt)}`;
                const checked = selected === f.id;
                return (
                  <label
                    key={f.id}
                    className={cn(
                      "relative flex cursor-pointer items-start gap-3 rounded-md border p-3.5",
                      "has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-select",
                      checked ? "vol-pencil-edge border-select bg-select-wash" : "border-border hover:bg-sunken",
                    )}
                  >
                    <input type="radio" name="format" className="sr-only" checked={checked} onChange={() => setSelected(f.id)} />
                    <Icon size={20} className={cn("mt-0.5 shrink-0", checked ? "text-select" : "text-ink-secondary")} aria-hidden />
                    <span className="grid min-w-0 gap-0.5">
                      <span className={cn("text-label font-semibold", checked ? "text-select" : "text-ink")}>{formatLabel[f.id] ?? f.label}</span>
                      <span className="text-small text-ink-secondary">{breakable(fileName(f))}</span>
                      <span
                        className={cn(
                          "num text-small",
                          !built && f.stale ? "text-accent-text" : !built && f.lastBuilt === null ? "text-ink-tertiary" : "text-success",
                        )}
                      >
                        {status}
                        {f.sizeLabel && !(f.lastBuilt === null && !built) ? `, ${f.sizeLabel}` : ""}
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>
          </section>

          <section aria-labelledby="pack-title" className="rounded-md border border-border bg-sheet p-5 sm:p-6">
            <h2 id="pack-title" className="font-book text-heading text-ink">
              Upload pack
            </h2>
            <p className="mt-1 text-small text-ink-secondary">{breakable(packName)}</p>
            <ul className="mt-4 grid gap-1.5">
              {packFiles.map(([path, desc]) => (
                <li
                  key={path}
                  className="grid grid-cols-1 gap-x-4 border-t border-border pt-1.5 first:border-t-0 first:pt-0 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]"
                >
                  <span className="text-[14px] text-ink">{breakable(path)}</span>
                  <span className="text-small text-ink-secondary">{desc}</span>
                </li>
              ))}
            </ul>
          </section>

          <section aria-labelledby="ai-title" className="rounded-md border border-border bg-sheet p-5 sm:p-6">
            <h2 id="ai-title" className="flex items-center gap-2 font-book text-heading text-ink">
              <Sparkles size={18} aria-hidden className="text-ink-secondary" />
              AI disclosure
            </h2>
            <p className="mt-2 max-w-[68ch] text-body text-ink">
              Set to <b className="font-semibold">AI-generated</b> for text and for images. The writer drafted the text and the image model made the cover art,
              so KDP counts both as AI-generated even after your edits. Declare both when you publish.
            </p>
            <p className="mt-2 text-small text-ink-secondary">Saved as listing/ai-disclosure.txt in the pack. Rule: {ruleLabel("ai.disclosure")}.</p>
          </section>
        </div>

        <Inspector label="File details" width="100%" className="self-start rounded-md border xl:sticky xl:top-[calc(var(--shell-topbar)+16px)]">
          {sel && (
            <InspectorSection title="Selected file">
              <p className="text-label font-semibold text-ink">{formatLabel[sel.id]}</p>
              <p className="mt-0.5 text-small text-ink-secondary">{breakable(fileName(sel))}</p>
              <KeyValueList
                className="mt-3"
                items={[
                  { label: "Last built", value: build?.done ? "Today" : sel.lastBuilt ? formatRelative(sel.lastBuilt) : "Never" },
                  { label: "Size", value: sel.sizeLabel ?? "Not built" },
                  { label: "Up to date", value: build?.done ? "Yes" : sel.lastBuilt === null ? "No file yet" : sel.stale ? "No, rebuild" : "Yes" },
                ]}
              />
              <p className="mt-3 text-small text-ink-secondary">{formatUse[sel.id]}</p>
            </InspectorSection>
          )}
          {sel && (
            <InspectorSection title="Preview">
              {sel.id === "ebook-cover" || sel.id === "wrap" ? (
                <figure className="grid justify-items-start gap-2">
                  <Cover title={book.title} subtitle={book.subtitle} author={getPenName(book.penNameId)?.name ?? ""} design={book.cover} width={170} />
                  <figcaption className="text-small text-ink-secondary">The book's own cover style, as built in the cover studio.</figcaption>
                </figure>
              ) : (
                <InteriorPreview book={book} paper={data.paper} width={220} />
              )}
            </InspectorSection>
          )}
          <InspectorSection title="Book">
            <KeyValueList
              items={[
                { label: "Trim", value: data.trim },
                { label: "Pages", value: String(data.pageCount) },
                { label: "Paper", value: data.paper === "white" ? "White" : "Cream" },
                { label: "Ink", value: "Black" },
              ]}
            />
          </InspectorSection>
          <InspectorSection title="KDP rules">
            <p className="text-[14px] text-ink">Version {rulesVersion}</p>
            <p className="text-small text-ink-secondary">Recheck due {formatDate(`${rulesRecheckDue}T12:00:00+00:00`)}.</p>
          </InspectorSection>
        </Inspector>
      </div>

      <Modal
        open={confirm}
        onClose={() => setConfirm(false)}
        title="Build pack"
        description={`Volume rebuilds stale files, runs preflight once more and zips everything into ${packName}.`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirm(false)}>
              Cancel
            </Button>
            <Button variant="primary" icon={Package} onClick={startBuild}>
              Build pack
            </Button>
          </>
        }
      >
        <ul className="grid gap-1.5 text-small text-ink-secondary">
          <li>No AI is used, so building costs nothing.</li>
          {warns.length > 0 && (
            <li>
              You ticked {warns.length} {warns.length === 1 ? "warning" : "warnings"}. They are listed in reports/preflight.txt.
            </li>
          )}
        </ul>
      </Modal>
      <span className="sr-only" role="status" aria-live="polite">
        {announce}
      </span>
    </>
  );
}

/** Lets a file name wrap after a hyphen, slash or dot instead of in the middle of a word. */
function breakable(name: string) {
  const parts = name.split(/(?<=[-/])/);
  return parts.map((p, i) => (
    <span key={i}>
      {p}
      {i < parts.length - 1 && <wbr />}
    </span>
  ));
}
