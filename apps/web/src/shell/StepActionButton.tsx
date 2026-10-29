import { useNavigate } from "react-router";
import { Button } from "../components/ui/Button";
import { cn } from "../lib/cn";
import type { StepAction } from "../lib/stepAction";

/**
 * The screen's one navy button, from useStepAction (D-016): its label, the cost before the click, and
 * the reason when it cannot run yet. Wrapped in a group named "Step action", so it is easy to find
 * wherever it sits (the step head, or the step rail on full-height steps).
 */
export function StepActionButton({
  action,
  compact = false,
  size = "md",
  className,
}: {
  action: StepAction;
  compact?: boolean;
  /** sm (32 px) in the step head, md (40 px) in the step bar. */
  size?: "sm" | "md" | undefined;
  className?: string | undefined;
}) {
  const navigate = useNavigate();
  return (
    <div role="group" aria-label="Step action" className={cn("flex min-w-0", className)}>
      <Button
        variant="primary"
        size={size}
        title={action.label}
        className={cn(
          "min-w-0 max-w-full overflow-hidden [&>span]:min-w-0 [&>span]:max-w-full [&>span>span]:min-w-0 [&>span>span]:max-w-full [&>span>span>span]:truncate",
          compact && "max-sm:w-full max-sm:[&_small]:hidden",
        )}
        estimate={action.estimate}
        disabledReason={action.disabledReason}
        onClick={() => {
          if (action.onClick) action.onClick();
          else if (action.to) void navigate(action.to);
        }}
      >
        {action.label}
      </Button>
    </div>
  );
}
