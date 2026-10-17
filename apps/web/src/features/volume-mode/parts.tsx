import type { ReactNode } from "react";
import { Link, useLocation } from "react-router";
import { Ban, Check, CircleAlert, Clock, Eye, Flag, Pause } from "lucide-react";
import { Banner, Button, LiveDot, PageHeader } from "../../components/ui";
import { cn } from "../../lib/cn";
import type { BatchStatus, QualityGate } from "../../api/types";
import { READ_ONLY_NOTE, roleLabels, type VolumeMe } from "../../api/wire-d";
import { gateSummary, runLabel, type Tone } from "./model";

const sections = [
  { to: "/volume", label: "Batches", match: (p: string) => p === "/volume" || p.startsWith("/volume/batches") },
  { to: "/volume/schedule", label: "Release schedule", match: (p: string) => p.startsWith("/volume/schedule") },
];

/** The Volume mode header: the screen's h1, a summary, its actions, then the two sections as links. */
export function VolumeHeader({ title, summary, actions }: { title: ReactNode; summary?: ReactNode | undefined; actions?: ReactNode | undefined }) {
  const { pathname } = useLocation();
  return (
    <div className="grid gap-4">
      <PageHeader title={title} summary={summary} actions={actions} />
      <nav aria-label="Volume mode sections" className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <ul className="flex gap-1 border-b border-border">
          {sections.map((s) => (
            <li key={s.to} className="shrink-0">
              <Link
                to={s.to}
                aria-current={s.match(pathname) ? "page" : undefined}
                className={cn(
                  "relative flex h-11 items-center px-3 text-label whitespace-nowrap -outline-offset-2",
                  s.match(pathname)
                    ? "font-semibold text-ink after:absolute after:inset-x-3 after:bottom-[-1px] after:h-0.5 after:bg-select"
                    : "text-ink-secondary hover:text-ink",
                )}
              >
                {s.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}

const toneClasses: Record<Tone, string> = {
  live: "bg-accent-wash text-accent-text",
  attention: "bg-accent-wash text-accent-text",
  error: "bg-claim-wash text-claim",
  success: "bg-success-wash text-success",
  neutral: "bg-sunken text-ink-secondary",
};

function toneIcon(tone: Tone, status: BatchStatus | null | undefined): ReactNode {
  if (tone === "live") return <LiveDot />;
  if (tone === "success") return <Check size={14} strokeWidth={2} aria-hidden />;
  if (tone === "error") return <CircleAlert size={14} strokeWidth={2} aria-hidden />;
  if (status === "paused" || status === "paused_budget") return <Pause size={14} strokeWidth={2} aria-hidden />;
  if (tone === "attention") return <Flag size={14} strokeWidth={2} aria-hidden />;
  if (status === "cancelled") return <Ban size={14} strokeWidth={2} aria-hidden />;
  return <Clock size={14} strokeWidth={2} aria-hidden />;
}

/** 24 px chip for a batch or book run: icon plus word, so colour never works alone. */
export function RunChip({ status, children }: { status: BatchStatus | null | undefined; children?: ReactNode | undefined }) {
  const { label, tone } = runLabel(status);
  return (
    <span
      className={cn("inline-flex h-6 items-center gap-1.5 rounded-pill px-2.5 text-[12.5px] leading-none font-semibold whitespace-nowrap", toneClasses[tone])}
    >
      {toneIcon(tone, status)}
      {children ?? label}
    </span>
  );
}

/** The quality gate for one book: Checks passed, or what still blocks it (claims use proof red, blocks needs attention). */
export function GateChip({ gate }: { gate: QualityGate | undefined }) {
  if (!gate) return <span className="text-small text-ink-tertiary">Checking</span>;
  const tone: Tone = gate.ok ? "success" : gate.openClaims > 0 ? "error" : "attention";
  return (
    <span
      className={cn("inline-flex h-6 items-center gap-1.5 rounded-pill px-2.5 text-[12.5px] leading-none font-semibold whitespace-nowrap", toneClasses[tone])}
    >
      {gate.ok ? <Check size={14} strokeWidth={2} aria-hidden /> : <Flag size={14} strokeWidth={2} aria-hidden />}
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
