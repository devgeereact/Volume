import { useState } from "react";
import { Banner, Button } from "../../components/ui";
import { useJobControl } from "../../api/hooks";
import { errorText } from "../../api/wire-c";
import { useCanManage } from "../../lib/access";

/* A job saved as paused_budget (D-057). There is no book or monthly cap any more, so this status now means the
   AI provider ran out of credit (top up, then continue) or, in another workspace, the owner's cap for guest
   workspaces (D-047). Older jobs paused at a book budget simply continue. Finished work is always kept. */

/** True when the job stopped because the AI provider has no credits left. */
export function isCreditsMessage(message: string | null): boolean {
  return /out of credits/i.test(message ?? "");
}

export function BudgetPausedBanner({
  jobId,
  message,
  onResumed,
  className,
}: {
  jobId: string;
  message: string | null;
  onResumed?: (() => void) | undefined;
  className?: string | undefined;
}) {
  const canManage = useCanManage();
  const control = useJobControl();
  const [error, setError] = useState<string | null>(null);

  async function resume() {
    try {
      await control.mutateAsync({ jobId, action: "resume" });
      setError(null);
      onResumed?.();
    } catch (e) {
      setError(errorText(e));
    }
  }

  const continueButton = canManage && (
    <Button onClick={() => void resume()} loading={control.isPending} loadingLabel="Continuing">
      Continue
    </Button>
  );

  if (isCreditsMessage(message)) {
    return (
      <Banner tone="attention" title="AI credits have run out" className={className}>
        <p>OpenRouter has no credits left, so this step stopped. Nothing was charged for it and finished work is kept. Top up, then continue.</p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <a href="https://openrouter.ai/settings/credits" target="_blank" rel="noreferrer" className="font-semibold text-select underline underline-offset-2">
            Top up on OpenRouter
          </a>
          {continueButton}
        </div>
        {error && <p className="mt-2 text-claim">{error}</p>}
      </Banner>
    );
  }

  return (
    <Banner tone="attention" title="This step is paused" className={className}>
      <p>{message?.trim() ? message : "This step stopped before it finished. Nothing was charged for it and finished work is kept."}</p>
      {continueButton ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">{continueButton}</div>
      ) : (
        <p className="mt-2">Ask the owner of this Volume to continue it.</p>
      )}
      {error && <p className="mt-2 text-claim">{error}</p>}
    </Banner>
  );
}
