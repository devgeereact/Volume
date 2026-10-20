import { useState } from "react";
import { Link } from "react-router";
import { Banner, Button } from "../../components/ui";
import { usePutModelSettings } from "../../api/hooks";
import { errorText, type JobWatch } from "../../api/wire-c";

/* A job failed because its stage's model is gone (errorCode model_unavailable). Fallbacks are offered, never
   silent (D-003): this banner names the model that failed and the next fallback, and one click sets the
   fallback for that stage in the workspace's model settings, then runs the job again. */

export interface ModelProblem {
  stage: string;
  model: string;
  next: string | null;
}

/** The stage, model and next fallback from a failed job, or null when it failed for another reason. */
export function modelProblemOf(w: Pick<JobWatch, "errorCode" | "result">): ModelProblem | null {
  if (w.errorCode !== "model_unavailable") return null;
  const r = (w.result ?? {}) as { stage?: unknown; model?: unknown; nextFallback?: unknown };
  if (typeof r.stage !== "string") return null;
  return {
    stage: r.stage,
    model: typeof r.model === "string" ? r.model : "the chosen model",
    next: typeof r.nextFallback === "string" ? r.nextFallback : null,
  };
}

const stageName = (stage: string) => stage.replace(/_/g, " ");

export function ModelFallbackBanner({
  problem,
  onRetry,
  onDismiss,
  className,
}: {
  problem: ModelProblem;
  onRetry: () => void;
  onDismiss: () => void;
  className?: string;
}) {
  const put = usePutModelSettings();
  const [error, setError] = useState<string | null>(null);
  async function switchAndRetry() {
    if (!problem.next) return;
    try {
      await put.mutateAsync({ stages: { [problem.stage]: { model: problem.next } } });
      setError(null);
      onDismiss();
      onRetry();
    } catch (e) {
      setError(errorText(e));
    }
  }
  return (
    <Banner
      tone="error"
      title={`The ${stageName(problem.stage)} model is not available`}
      className={className}
      action={
        <div className="flex flex-wrap gap-2">
          {problem.next && (
            <Button size="sm" onClick={() => void switchAndRetry()} disabledReason={put.isPending ? "Switching the model." : undefined}>
              Use {problem.next} and try again
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={onDismiss}>
            Dismiss
          </Button>
        </div>
      }
    >
      {problem.model} did not answer, so this step was not done.{" "}
      {problem.next ? (
        <>
          Switch this step to {problem.next} with one click. You can change it again any time in{" "}
          <Link to="/settings" className="font-semibold underline underline-offset-2">
            Settings, Models
          </Link>
          .
        </>
      ) : (
        <>
          Choose another model for this step in{" "}
          <Link to="/settings" className="font-semibold underline underline-offset-2">
            Settings, Models
          </Link>
          .
        </>
      )}
      {error && <span className="mt-1 block text-claim">{error}</span>}
    </Banner>
  );
}
