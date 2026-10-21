import { useState } from "react";
import { Link } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Banner, Button } from "../../components/ui";
import { booksApi } from "../../api/books";
import { errorText, type JobWatch } from "../../api/wire-c";

/* A job failed because its stage's model is gone (errorCode model_unavailable). Fallbacks are offered, never
   silent (D-003). The model can be set on the book, its pen name or the workspace (D-019: the book wins), so one
   click removes the withdrawn model from all three; each stage then uses what Settings, Models shows, and the
   job runs again. */

export interface ModelProblem {
  stage: string;
  model: string;
  next: string | null;
}

/** The stage, model and next fallback from a failed job, or null when it failed for another reason. */
export function modelProblemOf(w: Pick<JobWatch, "errorCode" | "result">): ModelProblem | null {
  if (w.errorCode !== "model_unavailable") return null;
  const r = (w.result ?? {}) as { stage?: unknown; model?: unknown; nextFallback?: unknown };
  if (typeof r.stage !== "string" || typeof r.model !== "string") return null;
  return { stage: r.stage, model: r.model, next: typeof r.nextFallback === "string" ? r.nextFallback : null };
}

const stageName = (stage: string) => stage.replace(/_/g, " ");

export function ModelFallbackBanner({
  bookId,
  problem,
  onRetry,
  onDismiss,
  className,
}: {
  bookId: string;
  problem: ModelProblem;
  onRetry: () => void;
  onDismiss: () => void;
  className?: string;
}) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function fixAndRetry() {
    setBusy(true);
    try {
      await booksApi.withdrawModel(bookId, problem.model);
      await qc.invalidateQueries();
      setError(null);
      onDismiss();
      onRetry();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Banner
      tone="error"
      title={`The ${stageName(problem.stage)} model is not available`}
      className={className}
      action={
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => void fixAndRetry()} loading={busy} loadingLabel="Switching">
            Use the Settings model and try again
          </Button>
          <Button size="sm" variant="ghost" onClick={onDismiss}>
            Dismiss
          </Button>
        </div>
      }
    >
      {problem.model} is no longer offered by its provider, so this step was not done. It is still chosen for this book or its pen name, which wins over{" "}
      <Link to="/settings" className="font-semibold underline underline-offset-2">
        Settings, Models
      </Link>
      . One click removes it everywhere it is set, so every step uses the model Settings shows, then runs this step again.
      {error && <span className="mt-1 block text-claim">{error}</span>}
    </Banner>
  );
}
