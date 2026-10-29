import type { ReactNode } from "react";
import { CircleAlert } from "lucide-react";
import { cn } from "../../lib/cn";

interface FieldShellProps {
  id: string;
  label: ReactNode;
  hint?: ReactNode | undefined;
  error?: ReactNode | undefined;
  /** Shown as the hint when the field is disabled, to say why. */
  disabledReason?: ReactNode | undefined;
  disabled?: boolean | undefined;
  /** Right side of the label row, for example a character count. */
  aside?: ReactNode | undefined;
  className?: string | undefined;
  children: ReactNode;
}

/** Label above, field, then hint or error in words with an icon. Shared by Input, Textarea and Select. */
export function FieldShell({ id, label, hint, error, disabledReason, disabled, aside, className, children }: FieldShellProps) {
  const hintText = disabled && disabledReason ? disabledReason : hint;
  return (
    <div className={cn("grid content-start gap-1.5", className)}>
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-[13px] font-medium text-ink">
          {label}
        </label>
        {aside}
      </div>
      {children}
      {error ? (
        <p id={`${id}-error`} className="flex items-start gap-1.5 text-small font-medium text-claim">
          <CircleAlert size={14} strokeWidth={2} className="mt-0.5 shrink-0" aria-hidden />
          <span>{error}</span>
        </p>
      ) : hintText ? (
        <p id={`${id}-hint`} className="text-small text-ink-tertiary">
          {hintText}
        </p>
      ) : null}
    </div>
  );
}

/** Classes for the field box in its states. */
export function fieldBoxClasses(opts: { error: boolean; disabled: boolean }): string {
  return cn(
    "w-full rounded-md border bg-panel-2 px-3 text-body text-ink shadow-inset placeholder:text-ink-3 transition-[border-color,box-shadow] duration-(--vol-dur-fast)",
    "focus-visible:border-mint focus-visible:shadow-[0_0_0_3px_var(--vol-mint-wash)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint",
    opts.error && "border-claim shadow-[0_0_0_1px_var(--vol-claim)]",
    opts.disabled ? "cursor-not-allowed border-edge bg-sunken text-ink-disabled" : !opts.error && "border-edge",
  );
}

/** aria-describedby value for a field. */
export function describedBy(id: string, hasError: boolean, hasHint: boolean): string | undefined {
  if (hasError) return `${id}-error`;
  return hasHint ? `${id}-hint` : undefined;
}
