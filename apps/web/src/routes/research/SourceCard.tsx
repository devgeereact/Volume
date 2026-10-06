import { ExternalLink, Globe } from "lucide-react";
import { buttonClasses, Checkbox } from "../../components/ui";
import type { ResearchSource } from "../../data";
import { cn } from "../../lib/cn";
import { formatTime } from "../../lib/format";
import { citedIn, plainSource, sourceMeta } from "./researchExtras";

interface SourceCardProps {
  source: ResearchSource;
  number: number;
  useInBook: boolean;
  onUseChange: (use: boolean) => void;
  /** Highlighted after a citation marker in the dossier was followed. */
  highlighted: boolean;
  onShowCitation: (anchor: string) => void;
}

/**
 * Source card (08-DESIGN-GUIDE, "not on the board yet"): title, publisher, domain, retrieved time,
 * where the dossier cites it, and the "use in book" tick. "Open site" opens the publisher's site in a
 * new tab; the app itself never fetches it.
 */
export function SourceCard({ source, number, useInBook, onUseChange, highlighted, onShowCitation }: SourceCardProps) {
  const meta = sourceMeta[source.id];
  const cites = citedIn(source.id);
  const shown = plainSource(source);
  return (
    <li
      id={`source-${source.id}`}
      tabIndex={-1}
      className={cn(
        "grid gap-2 rounded-md border px-4 pt-3.5 pb-1.5 transition-colors duration-(--vol-dur-fast)",
        highlighted ? "vol-pencil-edge border-select bg-select-wash" : "border-border bg-sheet",
      )}
    >
      <div className="flex items-start gap-3">
        <span className="num mt-0.5 grid size-6 shrink-0 place-items-center rounded-xs bg-sunken text-caption text-ink-secondary">{number}</span>
        <div className="grid min-w-0 gap-1">
          <p className="text-[14px] leading-5 font-semibold text-ink">{shown.title}</p>
          <p className="text-small text-ink-secondary">{shown.publisher}</p>
        </div>
      </div>
      <dl className="ml-9 grid gap-1 text-small text-ink-secondary">
        <div className="flex min-w-0 items-center gap-1.5">
          <dt className="sr-only">Domain</dt>
          <dd className="flex min-w-0 items-center gap-1.5">
            <Globe size={14} strokeWidth={2} aria-hidden className="shrink-0 text-ink-tertiary" />
            <span className="[overflow-wrap:anywhere]">{shown.domain}</span>
          </dd>
        </div>
        {meta && (
          <div className="flex gap-1">
            <dt>Retrieved</dt>
            <dd className="num">today, {formatTime(meta.retrievedAt)}</dd>
          </div>
        )}
        <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-1">
          <dt>Cited in</dt>
          {cites.length === 0 ? (
            <dd className="text-ink-tertiary">not cited yet</dd>
          ) : (
            cites.map((c) => (
              <dd key={c.anchor}>
                <button
                  type="button"
                  onClick={() => onShowCitation(c.anchor)}
                  className="hit-44 rounded-xs px-1 text-select underline decoration-select/40 underline-offset-2 hover:decoration-select"
                >
                  {c.label}
                </button>
              </dd>
            ))
          )}
        </div>
      </dl>
      <div className="ml-6 flex flex-wrap items-center justify-between gap-x-3">
        <Checkbox label="Use in book" checked={useInBook} onChange={onUseChange} />
        <a href={`https://${shown.domain}`} target="_blank" rel="noreferrer noopener" className={buttonClasses("ghost", "sm")}>
          <ExternalLink size={16} aria-hidden />
          Open site
          <span className="sr-only">, {shown.domain}, opens in a new tab</span>
        </a>
      </div>
    </li>
  );
}
