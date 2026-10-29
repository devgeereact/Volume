import type { ReactNode } from "react";
import { Link } from "react-router";
import { Check, CircleAlert, CircleX, RotateCw } from "lucide-react";
import { Button, Checkbox, ChipDot, chipClasses, Loader, StatusChip } from "../../components/ui";
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

/**
 * Preflight card (.pf in the approved design): one row per check with its icon, area, label and detail,
 * then a tick for each warning or a Pass chip, and Fix links. The summary chip counts what is left.
 */
export function Preflight({ rows, ticked, onTick, running, onRun, renderFix }: PreflightProps) {
  const counts = {
    pass: rows.filter((r) => r.result === "pass").length,
    warn: rows.filter((r) => r.result === "warn" && !ticked[r.id]).length,
    checked: rows.filter((r) => r.result === "warn" && ticked[r.id]).length,
    block: rows.filter((r) => r.result === "block").length,
  };
  const tone = running ? "info" : counts.block > 0 ? "bad" : counts.warn > 0 ? "warn" : "good";
  const sorted = areaOrder.flatMap((area) => rows.filter((r) => r.area === area));
  return (
    <section aria-labelledby="preflight-title" className="vol-glass min-w-0 rounded-card p-[18px] max-[560px]:p-[15px]">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h2 id="preflight-title" className="text-[15px] leading-5 font-semibold text-ink">
          Preflight
        </h2>
        <p className={cn(chipClasses(tone), "num")} role="status">
          <ChipDot pulse={running} />
          {running
            ? "Checking"
            : `${counts.pass} passed, ${counts.warn} ${counts.warn === 1 ? "warning" : "warnings"}${counts.checked > 0 ? `, ${counts.checked} checked by you` : ""}, ${counts.block} failed`}
        </p>
        <Button size="sm" variant="ghost" icon={RotateCw} className="ml-auto" loading={running} loadingLabel="Checking" onClick={onRun}>
          Run again
        </Button>
      </div>
      {!running && counts.warn === 0 && counts.block === 0 && (
        <p className="mt-2 flex items-center gap-1.5 text-[13px] text-good">
          <Check size={14} strokeWidth={2} aria-hidden />
          Every warning is confirmed
        </p>
      )}
      <ul className="mt-3 grid gap-1">
        {sorted.map((r) => {
          const fix =
            r.result !== "pass" && !r.checking && renderFix?.(r) ? (
              renderFix(r)
            ) : r.fixLabel && r.fixRoute && r.result !== "pass" && !r.checking ? (
              <Link
                to={r.fixRoute}
                className="inline-flex h-8 items-center rounded-sm px-2 text-[13px] font-semibold text-select underline-offset-2 hit-44 hover:underline"
              >
                {r.fixLabel}
              </Link>
            ) : null;
          return (
            <li
              key={r.id}
              className={cn(
                "grid grid-cols-[30px_70px_minmax(0,1fr)_auto] items-start gap-x-2.5 gap-y-1 rounded-[11px] px-2.5 py-[9px] odd:bg-soft max-[860px]:grid-cols-[30px_minmax(0,1fr)]",
                r.result === "block" && !r.checking && "bg-red-wash odd:bg-red-wash",
              )}
            >
              <ResultIcon row={r} checked={Boolean(ticked[r.id])} />
              <small className="pt-1 text-[12px] text-ink-3 max-[860px]:hidden">{r.area}</small>
              <div className="min-w-0 pt-0.5">
                <p className="text-[13.5px] leading-5 font-semibold text-ink">{r.label}</p>
                <p className="text-[12.5px] leading-[18px] text-ink-3">{r.detail}</p>
                {r.ruleId && (
                  <p className="mt-0.5 text-[11.5px] text-ink-3" title={`Rule id ${r.ruleId}`}>
                    Rule: {ruleLabel(r.ruleId)}
                  </p>
                )}
                {r.result === "warn" && !r.checking && (
                  <div className="mt-1">
                    <Checkbox label="I have checked this" checked={Boolean(ticked[r.id])} onChange={(v) => onTick(r.id, v)} />
                    <p className="text-[11.5px] text-ink-3">
                      {ticked[r.id]
                        ? "Saved. You checked this and are happy to go ahead. Untick it to flag it again."
                        : "Tick once you have read this and are happy to go ahead. Your tick is saved with the book."}
                    </p>
                  </div>
                )}
              </div>
              <div className="flex flex-col items-end gap-1 max-[860px]:col-start-2 max-[860px]:flex-row max-[860px]:flex-wrap max-[860px]:items-center">
                <ResultChip row={r} checked={Boolean(ticked[r.id])} />
                {fix}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** The row's icon tile (.pf-i): a check on mint, an alert on amber, a cross on red. The word is for screen readers. */
function ResultIcon({ row, checked }: { row: PreflightRow; checked: boolean }) {
  const base = "grid size-[26px] shrink-0 place-items-center rounded-[8px]";
  if (row.checking)
    return (
      <span className={cn(base, "bg-soft text-ink-2")}>
        <Loader />
        <span className="sr-only">Checking</span>
      </span>
    );
  if (row.result === "pass" || (row.result === "warn" && checked))
    return (
      <span className={cn(base, "bg-mint-wash text-mint-ink")}>
        <Check size={14} strokeWidth={2} aria-hidden />
        <span className="sr-only">{row.result === "pass" ? "Pass" : "Checked"}</span>
      </span>
    );
  if (row.result === "warn")
    return (
      <span className={cn(base, "bg-amber-wash text-amber")}>
        <CircleAlert size={14} strokeWidth={2} aria-hidden />
        <span className="sr-only">Warning</span>
      </span>
    );
  return (
    <span className={cn(base, "bg-red-wash text-red")}>
      <CircleX size={14} strokeWidth={2} aria-hidden />
      <span className="sr-only">Fail</span>
    </span>
  );
}

function ResultChip({ row, checked }: { row: PreflightRow; checked: boolean }) {
  if (row.checking) return <StatusChip tone="info">Checking</StatusChip>;
  if (row.result === "pass")
    return (
      <StatusChip tone="good" className="max-[860px]:hidden">
        Pass
      </StatusChip>
    );
  if (row.result === "warn") return checked ? <StatusChip tone="good">Checked</StatusChip> : <StatusChip tone="warn">Warn</StatusChip>;
  return <StatusChip tone="bad">Fail</StatusChip>;
}
