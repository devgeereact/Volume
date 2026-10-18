import type { ReactNode } from "react";
import { Link } from "react-router";
import { Check, CircleX, Download, FileArchive, FileText, Flag, Info } from "lucide-react";
import type { PictureBookView } from "../../api/picture";
import { Banner, Button, EmptyState, Inspector, InspectorSection, KeyValueList, PageHeader, ProgressBar } from "../../components/ui";
import { buttonClasses } from "../../components/ui/Button";
import { cn } from "../../lib/cn";
import { useStepAction } from "../../lib/stepAction";
import { inchesLabel, pictureRulesVersion } from "./geometry";
import { disclosureText, sortPreflight, type PicturePreflightItem } from "./model";

export interface ExportFileRow {
  id: string;
  label: string;
  detail: string;
  /** Download link, or null in demo mode. */
  href: string | null;
  kind: "pdf" | "pack";
}

export interface PictureExportScreenProps {
  view: PictureBookView | null;
  writingPath: string;
  disclosure: { text: string; images: string };
  preflight: PicturePreflightItem[];
  files: ExportFileRow[];
  /** 0 to 1 while the export runs, else null. */
  building: number | null;
  buildMessage: string | null;
  buildError: string | null;
  canWrite: boolean;
  stale: boolean;
  demo: boolean;
  onBuild: () => void;
  /** Book status actions (Mark as published, Archive) under the header, for a server book. */
  statusActions?: ReactNode | undefined;
}

function SeverityChip({ severity }: { severity: PicturePreflightItem["severity"] }) {
  if (severity === "pass")
    return (
      <span className="inline-flex items-center gap-1 text-small font-semibold text-success">
        <Check size={14} strokeWidth={2} aria-hidden /> Passed
      </span>
    );
  if (severity === "warn")
    return (
      <span className="inline-flex items-center gap-1 text-small font-semibold text-accent-text">
        <Flag size={14} strokeWidth={2} aria-hidden /> Check
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 text-small font-semibold text-claim">
      <CircleX size={14} strokeWidth={2} aria-hidden /> Blocked
    </span>
  );
}

/**
 * Export for picture books (P7-6, D-044): one full-bleed print PDF in premium colour and the KDP pack. Shows the page
 * size with bleed, the page count, the ink, the AI disclosure for text and pictures, the preflight from the last build
 * and the files. EPUB and Word are not made for picture books.
 */
export function PictureExportScreen(props: PictureExportScreenProps) {
  const { view } = props;
  const missing = view ? view.spreads.filter((s) => !s.imageUrl).length : 0;
  const blocks = props.preflight.filter((p) => p.severity === "block").length;
  const warns = props.preflight.filter((p) => p.severity === "warn").length;
  const passes = props.preflight.filter((p) => p.severity === "pass").length;
  const imagesDisclosed = props.disclosure.images === "ai_generated";

  useStepAction(
    view && view.spreads.length > 0 && props.canWrite
      ? {
          label: props.files.length > 0 ? "Build print PDF again" : "Build print PDF",
          onClick: props.onBuild,
          disabledReason:
            props.building !== null
              ? "The print PDF is being built."
              : missing > 0
                ? `${missing} ${missing === 1 ? "spread has" : "spreads have"} no picture yet.`
                : undefined,
        }
      : null,
  );

  if (!view || view.spreads.length === 0)
    return (
      <div className="grid gap-6 px-4 py-6 sm:px-8 lg:px-10 lg:py-7">
        <PageHeader title="Export" />
        <EmptyState
          title="Make the picture book first"
          body="The print PDF needs the story and a picture on every spread."
          drawing="page"
          headingLevel={2}
          action={
            <Link to={props.writingPath} className={buttonClasses("secondary", "md")}>
              Go to Story and spreads
            </Link>
          }
        />
      </div>
    );

  const spreadPages = view.spreads.length * 2;
  const facts = [
    { label: "Format", value: "Paperback, print PDF only" },
    { label: "Trim", value: "8.5 x 8.5 in" },
    { label: "Page size with bleed", value: inchesLabel(view.pageSizeIn) },
    { label: "Pages", value: `${view.pageCount} (${view.spreads.length} spreads, ${view.pageCount - spreadPages} other pages)` },
    { label: "Ink", value: "Premium colour" },
    { label: "Paper", value: "White" },
  ];

  return (
    <div className="grid grid-cols-1 gap-8 px-4 py-6 sm:px-8 lg:grid-cols-[minmax(0,1fr)_320px] lg:px-10 lg:py-7">
      <div className="grid min-w-0 content-start gap-6">
        <PageHeader title="Export" summary="A full-bleed print PDF for a KDP paperback, and the pack with the listing and covers." />
        {props.statusActions}

        {props.demo && (
          <Banner tone="info" title="Demo book">
            The build is simulated and there is no file to download. Start the Volume server to build a real PDF.
          </Banner>
        )}

        <section aria-labelledby="print-title" className="grid gap-4 rounded-md border border-border bg-sheet p-5 sm:p-6">
          <h2 id="print-title" className="font-book text-heading text-ink">
            Print PDF
          </h2>
          <KeyValueList items={facts} className="max-w-[480px]" />
          <p className="flex items-start gap-2 text-small text-ink-secondary">
            <Info size={16} className="mt-0.5 shrink-0" aria-hidden />
            Every page is the trim plus bleed, so the pictures run to the edge. Picture books have no ebook, Word or EPUB file yet.
          </p>
          {props.building !== null && (
            <div className="grid gap-2" role="status">
              <p className="text-small text-ink">{props.buildMessage ?? "Building the print PDF"}</p>
              <ProgressBar value={Math.round(props.building * 100)} max={100} label="Print PDF build" valueText={`${Math.round(props.building * 100)}%`} live />
            </div>
          )}
          {props.buildError && (
            <Banner tone="error" title="The print PDF was not finished">
              {props.buildError}
            </Banner>
          )}
          {props.stale && props.building === null && (
            <Banner tone="attention" title="The book changed since the last build">
              Build the print PDF again so the file matches the spreads.
            </Banner>
          )}
        </section>

        <section aria-labelledby="pf-title" className="rounded-md border border-border bg-sheet">
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 border-b border-border px-5 py-4 sm:px-6">
            <h2 id="pf-title" className="font-book text-heading text-ink">
              Preflight
            </h2>
            {props.preflight.length > 0 && (
              <p className="num text-small text-ink-secondary">
                {passes} passed, {warns} to check, {blocks} blocked
              </p>
            )}
          </div>
          {props.preflight.length === 0 ? (
            <p className="px-5 py-4 text-small text-ink-secondary sm:px-6">Preflight runs when you build the print PDF.</p>
          ) : (
            <ul>
              {sortPreflight(props.preflight).map((p) => (
                <li
                  key={p.id}
                  className={cn(
                    "grid grid-cols-[96px_minmax(0,1fr)] gap-3 border-t border-border px-5 py-3 first:border-t-0 sm:px-6",
                    p.severity === "block" && "bg-claim-wash",
                  )}
                >
                  <SeverityChip severity={p.severity} />
                  <p className="text-small text-ink">{p.message}</p>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="files-title" className="grid gap-3 rounded-md border border-border bg-sheet p-5 sm:p-6">
          <h2 id="files-title" className="font-book text-heading text-ink">
            Files
          </h2>
          {props.files.length === 0 ? (
            <p className="text-small text-ink-secondary">Nothing built yet.</p>
          ) : (
            <ul className="grid gap-2">
              {props.files.map((f) => {
                const Icon = f.kind === "pdf" ? FileText : FileArchive;
                return (
                  <li key={f.id} className="flex flex-wrap items-center gap-3 rounded-md border border-border bg-canvas px-4 py-3">
                    <Icon size={18} className="text-ink-secondary" aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="block text-label text-ink">{f.label}</span>
                      <span className="block text-small text-ink-secondary">{f.detail}</span>
                    </span>
                    {f.href ? (
                      <a href={f.href} download className={buttonClasses("secondary", "sm")}>
                        <Download size={16} aria-hidden /> Download
                      </a>
                    ) : (
                      <Button size="sm" variant="secondary" icon={Download} disabledReason="Demo files are not saved.">
                        Download
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      <Inspector label="Export details" width="100%" className="rounded-md border lg:sticky lg:top-4 lg:self-start">
        <InspectorSection title="KDP AI disclosure" icon={imagesDisclosed ? Check : Flag} tone={imagesDisclosed ? "default" : "attention"}>
          <KeyValueList
            items={[
              { label: "Text", value: disclosureText(props.disclosure.text) },
              { label: "Images", value: disclosureText(props.disclosure.images) },
            ]}
          />
          <p className="mt-2 text-small text-ink-secondary">
            {imagesDisclosed
              ? "Every picture in this book was made by AI, so answer AI-generated for images when you upload to KDP."
              : "The pictures were made by AI. The disclosure for images is set when a picture is made; build again if this still says not set."}
          </p>
        </InspectorSection>
        <InspectorSection title="Page plan">
          <p className="text-small text-ink-secondary">
            {view.plan.spreads} spreads fill the shortest premium colour book on this trim. Rules: {view.plan.ruleIds.join(", ") || "print.bleed"}.
          </p>
          {view.plan.warnings.length > 0 && (
            <ul className="mt-2 grid gap-1 text-small text-accent-text">
              {view.plan.warnings.map((w) => (
                <li key={w} className="flex gap-1.5">
                  <Flag size={14} className="mt-0.5 shrink-0" aria-hidden /> {w}
                </li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-caption text-ink-tertiary">KDP rules file {pictureRulesVersion}</p>
        </InspectorSection>
        <InspectorSection title="Back to the spreads">
          <Link to={props.writingPath} className="text-label text-select underline-offset-2 hover:underline">
            Story and spreads
          </Link>
        </InspectorSection>
      </Inspector>
    </div>
  );
}
