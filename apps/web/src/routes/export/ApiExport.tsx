import { lazy, Suspense, useMemo, useState } from "react";
import { Download, FileArchive, FileImage, FileText, FileType, Package, Sparkles } from "lucide-react";
import {
  Banner,
  Button,
  buttonClasses,
  EmptyState,
  Inspector,
  InspectorSection,
  KeyValueList,
  Loader,
  Modal,
  PageHeader,
  ProgressBar,
} from "../../components/ui";
import type { Book, PreflightItem } from "../../data";
import { assetsApi } from "../../api/assets";
import { sizeLabel, toPreflightItem } from "../../api/adapters";
import { useCover, useExports, usePreflight, useStartExports } from "../../api/hooks";
import { productionApi } from "../../api/production";
import type { ApiBookDetail, ApiExportRecord, ApiPreflightItem } from "../../api/types";
import { errorText, jobStatusText, useJobWatch } from "../../api/wire-c";
import { cn } from "../../lib/cn";
import { formatRelative } from "../../lib/format";
import { useStepAction } from "../../lib/stepAction";
import { ErrorPanel, LoadingBlock } from "../writing/screenState";
import { InteriorPreview } from "./InteriorPreview";
import { Preflight, type PreflightRow } from "./Preflight";
import type { Paper } from "./kdpRules";

/* Export on the Volume server (API mode): preflight from GET /preflight, Build pack as a job with
   progress over SSE, the built files from GET /exports with the stale flag, downloads by id, and
   royalties from the book's list prices and the print PDF's page count (ApiRoyalties). */

// The KDP maths in @volume/core (with zod) loads only when this screen shows, in its own chunk.
const ApiRoyalties = lazy(() => import("./ApiRoyalties").then((m) => ({ default: m.ApiRoyalties })));

const KIND_ORDER = ["pdf_print", "docx", "epub", "txt", "md", "pack"];
const KIND_LABEL: Record<string, string> = {
  pdf_print: "Print PDF",
  docx: "Word document (DOCX)",
  epub: "EPUB 3",
  txt: "Plain text (TXT)",
  md: "Markdown (MD)",
  pack: "KDP upload pack (ZIP)",
};
const KIND_USE: Record<string, string> = {
  pdf_print: "Upload as the paperback manuscript.",
  docx: "Kindle conversion, or edit in Word.",
  epub: "Upload as the Kindle eBook manuscript.",
  txt: "Your own format with section breaks.",
  md: "The canonical manuscript. Volume imports it back.",
  pack: "Everything above plus the covers, listing and reports, in one zip.",
};
const KIND_ICON: Record<string, typeof FileText> = { pdf_print: FileText, docx: FileText, epub: FileType, txt: FileText, md: FileText, pack: FileArchive };

function toRow(i: ApiPreflightItem, bookId: string): PreflightItem {
  const base = toPreflightItem(i);
  const cut = i.message.indexOf(": ");
  const label = cut > 0 ? i.message.slice(0, cut) : i.message;
  const detail = cut > 0 ? i.message.slice(cut + 2) : "";
  const route = i.fix?.route ? (i.fix.route.startsWith("/") ? i.fix.route : `/books/${bookId}/${i.fix.route}`) : null;
  return { ...base, label, detail, ruleId: null, fixRoute: route };
}

export function ApiExport({ book, apiBook }: { book: Book; apiBook: ApiBookDetail | undefined }) {
  const bookId = book.id;
  const preflightQ = usePreflight(bookId);
  const exportsQ = useExports(bookId);
  const coverQ = useCover(bookId);
  const start = useStartExports();
  const [ticked, setTicked] = useState<Record<string, boolean>>({});
  const [confirm, setConfirm] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [finished, setFinished] = useState<string | null>(null);
  const [selected, setSelected] = useState("pack");
  const [announce, setAnnounce] = useState("");

  const watch = useJobWatch(bookId, jobId, (w) => {
    setJobId(null);
    void exportsQ.refetch();
    void preflightQ.refetch();
    if (w.ok) {
      setFinished("The pack is built. Download it below.");
      setAnnounce("Pack ready to download.");
    } else if (w.errorCode === "preflight_blocked") {
      setProblem(null);
      setAnnounce("The final preflight blocked the pack. The other files are built.");
    } else if (w.status === "needs_attention") setProblem("Preflight found a check that fails, so the pack was not built. Fix it, then build again.");
    else setProblem(`The pack was not built. ${w.error ?? "Try again."}`);
  });
  const building = start.isPending || watch.running;

  const items = useMemo(() => (preflightQ.data?.items ?? []).map((i) => toRow(i, bookId)), [preflightQ.data, bookId]);
  const rows: PreflightRow[] = items.map((it) => ({ ...it, checking: preflightQ.isFetching && !preflightQ.isPending }));
  // Cover blocks (ids "cover.") stop only the pack: the single files still build, and the server's
  // final preflight refuses the pack. Every other block stops the build.
  const coverBlocks = items.filter((i) => i.result === "block" && i.id.startsWith("cover."));
  const blocks = items.filter((i) => i.result === "block" && !i.id.startsWith("cover."));
  const warns = items.filter((i) => i.result === "warn");
  const unticked = warns.filter((w) => !ticked[w.id]);

  const latest = useMemo(() => {
    const m = new Map<string, ApiExportRecord>();
    for (const r of exportsQ.data ?? []) {
      const prev = m.get(r.kind);
      if (!prev || r.createdAt > prev.createdAt) m.set(r.kind, r);
    }
    return m;
  }, [exportsQ.data]);
  const pack = latest.get("pack");
  // The final preflight runs on the built files; when it blocks, the pack record is saved as failed
  // with the reason, and the files built before it stay downloadable.
  const packBlocked = pack && pack.status !== "done" ? pack : undefined;
  const pdf = latest.get("pdf_print");
  const cover = coverQ.data ?? null;
  const now = new Date().toISOString();
  const paper: Paper = apiBook?.paper === "white" ? "white" : "cream";

  const disabledReason = building
    ? "The pack is building."
    : preflightQ.isPending
      ? "Preflight is running."
      : preflightQ.isError
        ? "Preflight could not run."
        : blocks.length > 0
          ? `${blocks.length} ${blocks.length === 1 ? "check fails" : "checks fail"}. Fix ${blocks.length === 1 ? "it" : "them"} first.`
          : unticked.length > 0
            ? `Tick ${unticked.length === 1 ? "the warning" : `the ${unticked.length} warnings`} to confirm you have checked ${unticked.length === 1 ? "it" : "them"}.`
            : undefined;
  useStepAction({
    label: building ? "Building pack" : pack && pack.status === "done" && !pack.stale ? "Build pack again" : "Build pack",
    onClick: () => setConfirm(true),
    disabledReason,
  });

  async function startBuild() {
    setConfirm(false);
    setFinished(null);
    try {
      const r = await start.mutateAsync({ bookId, input: { pack: true } });
      setJobId(r.jobId);
      setProblem(null);
    } catch (e) {
      setProblem(errorText(e));
    }
  }

  const fileStatus = (r: ApiExportRecord | undefined) =>
    !r
      ? "Not built"
      : r.status !== "done"
        ? r.kind === "pack"
          ? "Blocked by the final preflight"
          : "Did not finish"
        : r.stale
          ? "Stale, older than the latest change"
          : `Built ${formatRelative(new Date(r.createdAt).toISOString(), now)}`;
  const sel = latest.get(selected);

  return (
    <>
      <PageHeader title="Export" summary="Check, build and download the KDP upload pack." />
      {disabledReason && !building && (
        <p className="mt-2 text-small text-ink-secondary" role="status">
          {disabledReason}
        </p>
      )}
      {blocks.length > 0 && (
        <Banner tone="error" title="The pack is blocked" className="mt-4 max-w-[860px]">
          {blocks.map((b) => b.label).join(", ")} must pass before Volume builds the pack.
        </Banner>
      )}
      {coverBlocks.length > 0 && (
        <Banner tone="attention" title="The pack needs a cover" className="mt-4 max-w-[860px]">
          {coverBlocks.map((b) => b.label.replace(/\.$/, "")).join(", ")}. Build the eBook cover and paperback wrap in the cover studio. The single files still
          build without them.
        </Banner>
      )}
      {problem && (
        <Banner
          tone="error"
          title="That did not work"
          className="mt-4 max-w-[860px]"
          action={
            <Button size="sm" variant="ghost" onClick={() => setProblem(null)}>
              Dismiss
            </Button>
          }
        >
          {problem}
        </Banner>
      )}

      {packBlocked && !building && (
        <Banner tone="error" title="The final preflight blocked the upload pack" className="mt-4 max-w-[860px]">
          {packBlocked.error ?? "The built files did not pass the final checks, so no pack was made. The single files below are built and ready to download."}{" "}
          Fix the cause, then build again.
        </Banner>
      )}

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_var(--vol-inspector)]">
        <div className="grid min-w-0 content-start gap-6">
          {(building || (finished && pack?.status === "done")) && (
            <section aria-labelledby="build-title" className="rounded-md border border-border bg-sheet p-5 sm:p-6">
              <h2 id="build-title" className="font-book text-heading text-ink">
                {building ? "Building the pack" : "Pack ready"}
              </h2>
              {building ? (
                <>
                  <ProgressBar
                    className="mt-3"
                    value={Math.round(watch.progress * 100)}
                    max={100}
                    live
                    label="Pack build progress"
                    valueText={watch.message ?? jobStatusText(watch.status)}
                  />
                  <p className="mt-3 flex items-center gap-2 text-small text-ink-secondary">
                    <Loader />
                    {watch.message ?? jobStatusText(watch.status)}
                  </p>
                </>
              ) : (
                pack?.assetId && (
                  <div className="mt-4 flex flex-wrap items-center gap-3 rounded-md bg-success-wash px-4 py-3">
                    <FileArchive size={18} className="text-success" aria-hidden />
                    <p className="min-w-0 flex-1 text-[14px] leading-5 text-ink">
                      <b className="block font-semibold">{KIND_LABEL.pack}</b>
                      <span className="text-small text-ink-secondary">
                        {sizeLabel(pack.bytes) ?? "Size unknown"}
                        {pack.mock ? ". Built by the test exporter." : "."}
                      </span>
                    </p>
                    <a href={productionApi.exportDownloadUrl(pack.id)} download className={buttonClasses("secondary")}>
                      <Download size={16} aria-hidden />
                      Download
                    </a>
                  </div>
                )
              )}
            </section>
          )}

          {preflightQ.isError ? (
            <ErrorPanel title="Preflight could not run" body={errorText(preflightQ.error)} onRetry={() => void preflightQ.refetch()} />
          ) : preflightQ.isPending ? (
            <LoadingBlock label="Running preflight" rows={6} />
          ) : (
            <Preflight
              rows={rows}
              ticked={ticked}
              onTick={(id, on) => setTicked((t) => ({ ...t, [id]: on }))}
              running={preflightQ.isFetching}
              onRun={() => void preflightQ.refetch()}
            />
          )}

          <section aria-labelledby="formats-title" className="rounded-md border border-border bg-sheet p-5 sm:p-6">
            <h2 id="formats-title" className="font-book text-heading text-ink">
              Files
            </h2>
            <p className="mt-1 text-small text-ink-secondary">
              Build pack rebuilds every format and zips them with the covers. Select a file to see its details.
            </p>
            {exportsQ.isError ? (
              <ErrorPanel className="mt-4" title="Could not list the files" body={errorText(exportsQ.error)} onRetry={() => void exportsQ.refetch()} />
            ) : exportsQ.isPending ? (
              <LoadingBlock className="mt-4" label="Loading the files" rows={3} />
            ) : latest.size === 0 ? (
              <EmptyState
                className="mt-4"
                drawing="box"
                headingLevel={3}
                title="Nothing built yet"
                body="Build pack, at the foot of the page, makes every format and the upload pack."
              />
            ) : (
              <div role="radiogroup" aria-label="Files" className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 2xl:grid-cols-3">
                {KIND_ORDER.map((kind) => {
                  const r = latest.get(kind);
                  const Icon = KIND_ICON[kind] ?? FileText;
                  const checked = selected === kind;
                  return (
                    <label
                      key={kind}
                      className={cn(
                        "relative flex cursor-pointer items-start gap-3 rounded-md border p-3.5",
                        "has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-select",
                        checked ? "vol-pencil-edge border-select bg-select-wash" : "border-border hover:bg-sunken",
                      )}
                    >
                      <input type="radio" name="format" className="sr-only" checked={checked} onChange={() => setSelected(kind)} />
                      <Icon size={20} className={cn("mt-0.5 shrink-0", checked ? "text-select" : "text-ink-secondary")} aria-hidden />
                      <span className="grid min-w-0 gap-0.5">
                        <span className={cn("text-label font-semibold", checked ? "text-select" : "text-ink")}>{KIND_LABEL[kind]}</span>
                        <span
                          className={cn(
                            "num text-small",
                            !r ? "text-ink-tertiary" : r.status !== "done" ? "text-claim" : r.stale ? "text-accent-text" : "text-success",
                          )}
                        >
                          {fileStatus(r)}
                          {r?.bytes ? `, ${sizeLabel(r.bytes)}` : ""}
                        </span>
                        {r?.assetId && (
                          <a href={productionApi.exportDownloadUrl(r.id)} download className="text-small font-medium text-select underline underline-offset-2">
                            Download
                          </a>
                        )}
                      </span>
                    </label>
                  );
                })}
              </div>
            )}
            {cover && (cover.ebookAssetId || cover.wrapAssetId) && (
              <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border pt-3">
                <FileImage size={18} className="text-ink-secondary" aria-hidden />
                <span className="text-small text-ink-secondary">Covers from the cover studio:</span>
                {cover.ebookAssetId && (
                  <a href={assetsApi.downloadUrl(cover.ebookAssetId)} download className="text-small font-medium text-select underline underline-offset-2">
                    eBook cover (JPEG)
                  </a>
                )}
                {cover.wrapAssetId && (
                  <a href={assetsApi.downloadUrl(cover.wrapAssetId)} download className="text-small font-medium text-select underline underline-offset-2">
                    Paperback wrap (PDF)
                  </a>
                )}
              </div>
            )}
          </section>

          <section aria-labelledby="ai-title" className="rounded-md border border-border bg-sheet p-5 sm:p-6">
            <h2 id="ai-title" className="flex items-center gap-2 font-book text-heading text-ink">
              <Sparkles size={18} aria-hidden className="text-ink-secondary" />
              AI disclosure
            </h2>
            <p className="mt-2 max-w-[68ch] text-body text-ink">
              Text: <b className="font-semibold">{disclosure(apiBook?.aiDisclosure.text)}</b>. Images:{" "}
              <b className="font-semibold">{disclosure(apiBook?.aiDisclosure.images)}</b>. Declare these when you publish.
            </p>
            <p className="mt-2 text-small text-ink-secondary">Saved in the pack with the listing.</p>
          </section>

          <Suspense fallback={null}>
            <ApiRoyalties listPrices={apiBook?.listPrices} pdf={pdf} epub={latest.get("epub")} />
          </Suspense>
        </div>

        <Inspector label="File details" width="100%" className="self-start rounded-md border xl:sticky xl:top-[calc(var(--shell-topbar)+16px)]">
          <InspectorSection title="Selected file">
            <p className="text-label font-semibold text-ink">{KIND_LABEL[selected]}</p>
            <KeyValueList
              className="mt-3"
              items={[
                {
                  label: sel && sel.status !== "done" ? "Last tried" : "Last built",
                  value: sel ? formatRelative(new Date(sel.createdAt).toISOString(), now) : "Never",
                },
                { label: "Size", value: sizeLabel(sel?.bytes ?? null) ?? "Not built" },
                { label: "Up to date", value: !sel ? "No file yet" : sel.status !== "done" ? "Not built" : sel.stale ? "No, rebuild" : "Yes" },
                ...(sel?.pageCount ? [{ label: "Pages", value: String(sel.pageCount) }] : []),
              ]}
            />
            <p className="mt-3 text-small text-ink-secondary">{KIND_USE[selected]}</p>
          </InspectorSection>
          {selected !== "pack" && (
            <InspectorSection title="Preview">
              <InteriorPreview book={book} paper={paper} width={220} />
            </InspectorSection>
          )}
          <InspectorSection title="Book">
            <KeyValueList
              items={[
                { label: "Trim", value: book.trim },
                { label: "Pages", value: pdf?.pageCount ? String(pdf.pageCount) : "Not built yet" },
                { label: "Paper", value: paper === "white" ? "White" : "Cream" },
              ]}
            />
          </InspectorSection>
          <InspectorSection title="KDP rules">
            <p className="text-[14px] text-ink">{preflightQ.data?.rulesVersion ? `Version ${preflightQ.data.rulesVersion}` : "Version not reported"}</p>
          </InspectorSection>
        </Inspector>
      </div>

      <Modal
        open={confirm}
        onClose={() => setConfirm(false)}
        title="Build pack"
        description="Volume runs preflight once more, builds every format and zips them with the covers, listing and reports."
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirm(false)}>
              Cancel
            </Button>
            <Button variant="primary" icon={Package} onClick={() => void startBuild()}>
              Build pack
            </Button>
          </>
        }
      >
        <ul className="grid gap-1.5 text-small text-ink-secondary">
          <li>No AI is used, so building costs nothing.</li>
          {coverBlocks.length > 0 && <li>The pack needs a cover, so only the single files are built this time.</li>}
          {warns.length > 0 && (
            <li>
              You ticked {warns.length} {warns.length === 1 ? "warning" : "warnings"}. They are listed in the preflight report in the pack.
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

function disclosure(level: string | undefined): string {
  if (level === "ai_generated") return "AI-generated";
  if (level === "ai_assisted") return "AI-assisted";
  if (level === "none") return "None";
  return "Not set yet";
}
