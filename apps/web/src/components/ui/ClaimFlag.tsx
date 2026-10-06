import { Flag } from "lucide-react";
import { cn } from "../../lib/cn";

interface ClaimFlagProps {
  /** Number of open claims. 1 shows the flag alone unless showCount is set. */
  count?: number | undefined;
  showCount?: boolean | undefined;
  /** Text after the flag, for example "1 claim". */
  label?: string | undefined;
  className?: string | undefined;
}

/** Proof red flag for claims to verify. Always has a spoken label, so colour never works alone. */
export function ClaimFlag({ count = 1, showCount = false, label, className }: ClaimFlagProps) {
  const spoken = `${count} ${count === 1 ? "claim" : "claims"} to verify`;
  return (
    <span className={cn("inline-flex items-center gap-1 text-claim", className)} aria-label={label ? undefined : spoken} role={label ? undefined : "img"}>
      <Flag size={14} strokeWidth={2} aria-hidden />
      {label ? (
        <span className="text-caption">{label}</span>
      ) : (
        showCount && (
          <span className="num text-caption" aria-hidden>
            {count}
          </span>
        )
      )}
    </span>
  );
}
