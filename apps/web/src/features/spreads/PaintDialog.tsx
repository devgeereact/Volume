import { useState } from "react";
import { isApiError } from "../../api/client";
import { budgetDetails, PICTURE_ESTIMATE_USD, type PictureBudgetDetails, type SpreadView } from "../../api/picture";
import { Banner, Button, KeyValueList, Modal } from "../../components/ui";
import { formatUsd } from "../../lib/format";
import { pictureEstimate } from "./model";

interface PaintDialogProps {
  spread: SpreadView | null;
  onClose: () => void;
  /** Starts the new picture. Rejects with the server's error (402 budget_exceeded included). */
  onPaint: (spread: SpreadView) => Promise<void>;
  spentUsd: number | null;
  budgetUsd: number | null;
  /** Only the owner changes budgets (D-047). Null hides the raise action. */
  onRaiseBudget: ((toUsd: number) => Promise<void>) | null;
  /** One picture's cost in words from the server's estimate; the demo figure when left out. */
  pictureCost?: string | undefined;
  /** The high end of one picture in USD, for the budget message when the server's 402 has no details. */
  pictureUsd?: number | undefined;
}

/** How much to add when the owner raises the budget from here: enough for this picture plus a little room. */
const RAISE_STEP_USD = 5;

/**
 * Confirms one new picture before it is made, with its cost. At the budget limit the server answers 402 and the
 * dialog says how much is spent, how much the picture needs and what to do: raise the budget (owner) or ask the owner.
 */
export function PaintDialog({
  spread,
  onClose,
  onPaint,
  spentUsd,
  budgetUsd,
  onRaiseBudget,
  pictureCost = pictureEstimate,
  pictureUsd = PICTURE_ESTIMATE_USD,
}: PaintDialogProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [budget, setBudget] = useState<PictureBudgetDetails | null>(null);
  const [raising, setRaising] = useState(false);

  function close() {
    if (busy) return;
    setError(null);
    setBudget(null);
    onClose();
  }

  function paint() {
    if (!spread) return;
    setBusy(true);
    setError(null);
    setBudget(null);
    onPaint(spread).then(
      () => {
        setBusy(false);
        onClose();
      },
      (e: unknown) => {
        setBusy(false);
        if (isApiError(e) && e.code === "budget_exceeded") {
          setBudget(budgetDetails(e.details) ?? { scope: "book", limitUsd: budgetUsd ?? 0, spentUsd: spentUsd ?? 0, estimateUsd: pictureUsd });
          return;
        }
        setError(isApiError(e) && e.code === "conflict" ? e.message : e instanceof Error ? e.message : "The picture was not started. Try again.");
      },
    );
  }

  function raise() {
    if (!onRaiseBudget || !budget) return;
    const to = Math.ceil(budget.spentUsd + budget.estimateUsd + RAISE_STEP_USD);
    setRaising(true);
    onRaiseBudget(to).then(
      () => {
        setRaising(false);
        setBudget(null);
      },
      (e: unknown) => {
        setRaising(false);
        setError(e instanceof Error ? e.message : "The budget was not changed.");
      },
    );
  }

  const n = spread?.n ?? 0;
  const items = [
    { label: "This picture", value: pictureCost },
    ...(spentUsd !== null && budgetUsd !== null ? [{ label: "Spent on this book", value: `${formatUsd(spentUsd)} of ${formatUsd(budgetUsd)}` }] : []),
  ];

  return (
    <Modal
      open={spread !== null}
      onClose={close}
      title={`Paint spread ${n} again`}
      description="The new picture replaces this one. It uses the same scene, the character references and the book's art style, so the characters stay the same."
      footer={
        <>
          <Button variant="ghost" onClick={close} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={paint}
            loading={busy}
            loadingLabel="Starting"
            estimate={pictureCost}
            disabledReason={budget ? "Raise the budget first." : undefined}
          >
            Paint spread {n}
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        <KeyValueList items={items} />
        <p className="text-small text-ink-secondary">The text and layout do not change.</p>
        {budget && (
          <Banner tone="attention" title="This book has reached its budget">
            {formatUsd(budget.spentUsd)} of {formatUsd(budget.limitUsd)} is spent and one more picture needs about {formatUsd(budget.estimateUsd)}.{" "}
            {onRaiseBudget ? "Raise the budget, then paint the spread." : "Ask the owner to raise this book's budget."}
            {onRaiseBudget && (
              <span className="mt-2 block">
                <Button size="sm" onClick={raise} loading={raising} loadingLabel="Raising">
                  Raise budget to {formatUsd(Math.ceil(budget.spentUsd + budget.estimateUsd + RAISE_STEP_USD))}
                </Button>
              </span>
            )}
          </Banner>
        )}
        {error && (
          <Banner tone="error" title="The picture was not started">
            {error}
          </Banner>
        )}
      </div>
    </Modal>
  );
}
