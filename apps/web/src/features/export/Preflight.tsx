import type { ReactNode } from "react";
import { Link } from "react-router";
import { Check, CircleX, Flag, RotateCw } from "lucide-react";
import { Button, Checkbox, Loader } from "../../components/ui";
import type { PreflightItem } from "../../demo";
import { ruleLabel } from "./kdpRules";
import { cn } from "../../lib/cn";

export interface PreflightRow extends PreflightItem {
  checking: boolean;
}

interface PreflightProps {
  rows: PreflightRow[];
  ticked: Record<string, boolean>;
  onTick: (id: string, on: boolean) => void;
  running: boolean;
  onRun: () => void;
  /** API mode: an action in place of the Fix link (for example Run checks again); null keeps the link. */
  renderFix?: ((row: PreflightRow) => ReactNode) | undefined;
}

const areaOrder: PreflightItem["area"][] = ["Manuscript", "Listing", "Interior", "Cover", "eBook"];

/** Preflight ledger: pass, warn or fail per check, grouped by area, with Fix links and a tick for each warning. */
export function Preflight({ rows, ticked, onTick, running, onRun, renderFix }: PreflightProps) {
  const counts = {
    pass: rows.filter((r) => r.result === "pass").length,
    warn: rows.filter((r) => r.result === "warn" && !ticked[r.id]).length,
    checked: rows.filter((r) => r.result === "warn" && ticked[r.id]).length,
    block: rows.filter((r) => r.result === "block").length,
  };
  return (
    <section aria-labelledby="preflight-title" className="rounded-md border border-border bg-sheet">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border px-5 py-4 sm:px-6">
        <h2 id="preflight-title" className="font-book text-heading text-ink">
          Preflight
        </h2>
        <p className="num text-small text-ink-secondary" role="status">
          {running
            ? "Checking"
            : `${counts.pass} passed, ${counts.warn} ${counts.warn === 1 ? "warning" : "warnings"}${counts.checked > 0 ? `, ${counts.checked} checked by you` : ""}, ${counts.block} failed`}
        </p>
        <Button size="sm" variant="ghost" icon={RotateCw} className="ml-auto" loading={running} loadingLabel="Checking" onClick={onRun}>
          Run again
        </Button>
      </div>
      {areaOrder.map((area) => {
        const list = rows.filter((r) => r.area === area);
        if (list.length === 0) return null;
        return (
          <div key={area} className="border-b border-border last:border-b-0">
            <h3 className="bg-canvas px-5 py-2 text-[13px] font-semibold text-ink-secondary sm:px-6">{area}</h3>
            <ul>
              {list.map((r) => (
                <li
                  key={r.id}
                  className={cn(
                    "grid grid-cols-[88px_minmax(0,1fr)] gap-x-3 gap-y-1 border-t border-border px-5 py-3 first:border-t-0 sm:grid-cols-[96px_minmax(0,1fr)_auto] sm:px-6",
                    r.result === "block" && !r.checking && "bg-claim-wash",
                  )}
                >
                  <ResultChip row={r} checked={Boolean(ticked[r.id])} />
                  <div className="min-w-0">
                    <p className="text-[14px] leading-5 font-semibold text-ink">{r.label}</p>
                    <p className="text-small text-ink-secondary">{r.detail}</p>
                    {r.ruleId && (
                      <p className="mt-0.5 text-caption text-ink-tertiary" title={`Rule id ${r.ruleId}`}>
                        Rule: {ruleLabel(r.ruleId)}
                      </p>
                    )}
                    {r.result === "warn" && !r.checking && (
                      <div className="mt-1">
                        <Checkbox label="I have checked this" checked={Boolean(ticked[r.id])} onChange={(v) => onTick(r.id, v)} />
                        <p className="text-caption text-ink-tertiary">
                          {ticked[r.id]
                            ? "Saved. You checked this and are happy to go ahead. Untick it to flag it again."
                            : "Tick once you have read this and are happy to go ahead. Your tick is saved with the book."}
                        </p>
                      </div>
                    )}
                  </div>
                  {r.result !== "pass" && !r.checking && renderFix?.(r) ? (
                    renderFix(r)
                  ) : r.fixLabel && r.fixRoute && r.result !== "pass" && !r.checking ? (
                    <Link
                      to={r.fixRoute}
                      className="col-start-2 inline-flex h-8 items-center self-start justify-self-start rounded-sm px-2 text-small font-semibold text-select underline-offset-2 hover:underline sm:col-start-3 hit-44"
                    >
                      {r.fixLabel}
                    </Link>
                  ) : (
                    <span className="hidden sm:block" />
                  )}
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </section>
  );
}

function ResultChip({ row, checked }: { row: PreflightRow; checked: boolean }) {
  const base = "inline-flex h-6 items-center gap-1 self-start justify-self-start rounded-pill px-2 text-caption font-semibold";
  if (row.checking)
    return (
      <span className={cn(base, "bg-sunken text-ink-secondary")}>
        <Loader />
        Checking
      </span>
    );
  if (row.result === "pass")
    return (
      <span className={cn(base, "bg-success-wash text-success")}>
        <Check size={14} strokeWidth={2} aria-hidden />
        Pass
      </span>
    );
  if (row.result === "warn" && checked)
    return (
      <span className={cn(base, "bg-success-wash text-success")}>
        <Check size={14} strokeWidth={2} aria-hidden />
        Checked
      </span>
    );
  if (row.result === "warn")
    return (
      <span className={cn(base, "bg-accent-wash text-accent-text")}>
        <Flag size={14} strokeWidth={2} aria-hidden />
        Warn
      </span>
    );
  return (
    <span className={cn(base, "bg-sheet text-claim ring-1 ring-claim")}>
      <CircleX size={14} strokeWidth={2} aria-hidden />
      Fail
    </span>
  );
}
