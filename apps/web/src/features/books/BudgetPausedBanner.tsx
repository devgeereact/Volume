import { useState } from "react";
import { Banner, Button, Input } from "../../components/ui";
import { useJobControl, useUpdateBook } from "../../api/hooks";
import { errorText } from "../../api/wire-c";
import { useCanManage } from "../../lib/access";

/* A job stopped at the book's budget (status paused_budget). Spending is the owner's call, so this says how
   much the step needs, takes the new budget and resumes the job; nothing runs until the owner raises it. */

/** "about $0.49 more" from the server's budget message, or null. */
export function neededUsd(message: string | null): number | null {
  const m = message?.match(/\$(\d+(?:\.\d+)?) more/);
  return m ? Number(m[1]) : null;
}

export function BudgetPausedBanner({
  bookId,
  jobId,
  message,
  budgetUsd,
  spentUsd,
  onResumed,
  className,
}: {
  bookId: string;
  jobId: string;
  message: string | null;
  budgetUsd: number;
  spentUsd: number;
  onResumed?: (() => void) | undefined;
  className?: string | undefined;
}) {
  const canManage = useCanManage();
  const update = useUpdateBook();
  const control = useJobControl();
  const need = neededUsd(message);
  const suggested = Math.max(5, Math.ceil((Math.max(budgetUsd, spentUsd) + (need ?? 1)) * 2) / 2);
  const [value, setValue] = useState(String(suggested));
  const [error, setError] = useState<string | null>(null);
  const to = Number(value);
  const valid = Number.isFinite(to) && to > budgetUsd;

  async function raiseAndContinue() {
    try {
      if (to > budgetUsd) await update.mutateAsync({ bookId, patch: { budgetUsd: to } });
      await control.mutateAsync({ jobId, action: "resume" });
      setError(null);
      onResumed?.();
    } catch (e) {
      setError(errorText(e));
    }
  }

  return (
    <Banner tone="attention" title="Stopped at this book's budget" className={className}>
      <p>
        This book's AI budget is ${budgetUsd.toFixed(2)} and ${spentUsd.toFixed(2)} is spent
        {need !== null ? `; this step needs about $${need.toFixed(2)} more` : ""}. Nothing was charged for it. Raise the budget to carry on.
      </p>
      {canManage ? (
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <Input
            label="New budget for this book ($)"
            type="number"
            inputMode="decimal"
            min={0}
            step={0.5}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="w-[200px]"
          />
          <Button
            onClick={() => void raiseAndContinue()}
            loading={update.isPending || control.isPending}
            loadingLabel="Continuing"
            disabledReason={valid ? undefined : `Enter more than $${budgetUsd.toFixed(2)}.`}
          >
            Raise budget and continue
          </Button>
        </div>
      ) : (
        <p className="mt-2">Ask the owner of this Volume to raise the budget.</p>
      )}
      {error && <p className="mt-2 text-claim">{error}</p>}
    </Banner>
  );
}
