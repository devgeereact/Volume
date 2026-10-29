import type { ReactNode } from "react";
import { Link, useLocation } from "react-router";
import { Eye } from "lucide-react";
import { Banner, Button, ChipDot, chipClasses, type ChipTone } from "../../components/ui";
import { cn } from "../../lib/cn";
import type { BatchStatus, QualityGate } from "../../api/types";
import { READ_ONLY_NOTE, roleLabels, type VolumeMe } from "../../api/wire-d";
import { gateSummary, runLabel, type Tone } from "./model";

const sections = [
  { to: "/volume", label: "Batches", match: (p: string) => p === "/volume" || p.startsWith("/volume/batches") },
  { to: "/volume/schedule", label: "Release schedule", match: (p: string) => p.startsWith("/volume/schedule") },
];

/** Page frame for Volume mode screens: the approved 24 px gutters on desktop, 16 px on phones. */
export const volumePageClasses = "grid w-full min-w-0 grid-cols-1 content-start gap-5 px-4 pt-1.5 pb-8 min-[861px]:px-6";

/**
 * The Volume mode header (approved design): the two sections as a segmented pair of links on the left and the
 * screen's actions on the right. The top bar already shows the page title, so the h1 is for screen readers
 * unless `titleVisible` is set (a batch, whose name the top bar does not show).
 */
export function VolumeHeader({
  title,
  summary,
  actions,
  titleVisible = false,
  lead,
}: {
  title: ReactNode;
  /** Above a visible title, for example a link back to all batches. */
  lead?: ReactNode | undefined;
  summary?: ReactNode | undefined;
  actions?: ReactNode | undefined;
  titleVisible?: boolean | undefined;
}) {
  const { pathname } = useLocation();
  return (
    <div className="grid gap-4 pb-2.5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Volume mode sections" className="min-w-0">
          <ul className="inline-flex h-10 items-stretch rounded-md border border-edge bg-soft p-[3px]">
            {sections.map((s) => {
              const on = s.match(pathname);
              return (
                <li key={s.to} className="flex">
                  <Link
                    to={s.to}
                    aria-current={on ? "page" : undefined}
                    className={cn(
                      "inline-flex items-center rounded-sm px-3 text-[13px] font-medium whitespace-nowrap focus-visible:outline-offset-1",
                      on ? "bg-panel-2 text-ink shadow-segment" : "text-ink-2 hover:text-ink",
                    )}
                  >
                    {s.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {titleVisible ? (
        <header className="grid gap-1.5">
          {lead}
          <h1 className="text-[22px] leading-7 font-bold tracking-[-0.01em] text-ink">{title}</h1>
          {summary && <div className="text-body text-ink-2">{summary}</div>}
        </header>
      ) : (
        <header className="sr-only">
          <h1>{title}</h1>
          {summary && <p>{summary}</p>}
        </header>
      )}
    </div>
  );
}

/* Batch and run tones mapped onto the approved chip tones. */
const chipTone: Record<Tone, ChipTone> = {
  live: "run",
  attention: "warn",
  error: "bad",
  success: "good",
  neutral: "info",
};

/** 24 px chip for a batch or book run (.chip): a dot plus a word, so colour never works alone. */
export function RunChip({ status, children, className }: { status: BatchStatus | null | undefined; children?: ReactNode | undefined; className?: string }) {
  const { label, tone } = runLabel(status);
  return (
    <span className={cn(chipClasses(chipTone[tone]), className)}>
      <ChipDot pulse={tone === "live"} />
      {children ?? label}
    </span>
  );
}

/** The quality gate for one book: Checks passed, or what still blocks it (claims are red, blocks need attention). */
export function GateChip({ gate }: { gate: QualityGate | undefined }) {
  if (!gate) return <span className="text-small text-ink-3">Checking</span>;
  const tone: ChipTone = gate.ok ? "good" : gate.openClaims > 0 ? "bad" : "warn";
  return (
    <span className={chipClasses(tone)}>
      <ChipDot />
      {gateSummary(gate)}
    </span>
  );
}

/** Shown in place of the write buttons when the caller's role reads only. */
export function ReadOnlyNote({ me }: { me: VolumeMe }) {
  if (me.state !== "ready" || me.canWrite) return null;
  return (
    <Banner tone="info" title={`Read only: you are a ${roleLabels[me.role].toLowerCase()}`}>
      <span className="inline-flex items-center gap-1.5">
        <Eye size={14} aria-hidden />
        {READ_ONLY_NOTE}
      </span>
    </Banner>
  );
}

/** The standard load failure with a retry. */
export function LoadError({ title, message, retry }: { title: string; message: string | null; retry: () => void }) {
  return (
    <Banner
      tone="error"
      title={title}
      action={
        <Button size="sm" onClick={retry}>
          Retry
        </Button>
      }
    >
      {message ?? "The Volume server did not answer. Nothing has been lost. Try again in a moment."}
    </Banner>
  );
}
