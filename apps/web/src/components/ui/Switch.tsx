import { useId, type ReactNode } from "react";
import { cn } from "../../lib/cn";

interface SwitchProps {
  label: ReactNode;
  description?: ReactNode | undefined;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean | undefined;
  id?: string | undefined;
  /** Keep the label on one line (short labels in toolbars). Off by default, so long labels wrap. */
  nowrap?: boolean | undefined;
  className?: string | undefined;
}

/**
 * Switch: 40 x 24 track, the knob slides 16 px (transform) and the fill fades in (opacity).
 * Label to the right, the whole row is clickable and 44 px tall.
 */
export function Switch({ label, description, checked, onChange, disabled, id: idProp, nowrap = false, className }: SwitchProps) {
  const autoId = useId();
  const id = idProp ?? autoId;
  return (
    <label htmlFor={id} className={cn("group inline-flex min-h-11 items-center gap-3", disabled ? "cursor-not-allowed" : "cursor-pointer", className)}>
      <input
        id={id}
        type="checkbox"
        role="switch"
        className="peer sr-only"
        checked={checked}
        disabled={disabled}
        aria-checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        aria-describedby={description ? `${id}-desc` : undefined}
      />
      <span
        aria-hidden
        className={cn(
          "relative h-6 w-10 shrink-0 overflow-hidden rounded-pill bg-sunken shadow-[inset_0_0_0_1px_var(--vol-border-strong)]",
          "peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-select",
          disabled && "opacity-60",
        )}
      >
        <span className={cn("absolute inset-0 bg-progress transition-opacity duration-(--vol-dur-fast) ease-out", checked ? "opacity-100" : "opacity-0")} />
        <span
          className={cn(
            "absolute top-[3px] left-[3px] size-[18px] rounded-full bg-sheet shadow-[0_1px_2px_rgb(10_12_30_/_0.3)] transition-transform duration-(--vol-dur-base) ease-out",
            checked && "translate-x-4",
          )}
        />
      </span>
      <span className="grid min-w-0 gap-0.5">
        <span className={cn("text-label", nowrap && "whitespace-nowrap", disabled ? "text-ink-tertiary" : "text-ink")}>{label}</span>
        {description && (
          <span id={`${id}-desc`} className="text-small text-ink-secondary">
            {description}
          </span>
        )}
      </span>
    </label>
  );
}
