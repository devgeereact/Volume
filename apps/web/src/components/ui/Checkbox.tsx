import { useId, type ReactNode } from "react";
import { Check } from "lucide-react";
import { cn } from "../../lib/cn";

interface CheckboxProps {
  label: ReactNode;
  description?: ReactNode | undefined;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean | undefined;
  id?: string | undefined;
  className?: string | undefined;
}

/** Checkbox with the whole row clickable (44 px tall). Checked fills with blue pencil. */
export function Checkbox({ label, description, checked, onChange, disabled, id: idProp, className }: CheckboxProps) {
  const autoId = useId();
  const id = idProp ?? autoId;
  return (
    <label htmlFor={id} className={cn("group flex min-h-11 items-start gap-3 py-2.5", disabled ? "cursor-not-allowed" : "cursor-pointer", className)}>
      <input
        id={id}
        type="checkbox"
        className="peer sr-only"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        aria-describedby={description ? `${id}-desc` : undefined}
      />
      <span
        aria-hidden
        className={cn(
          "mt-px grid size-5 shrink-0 place-items-center rounded-xs border-[1.5px] transition-colors duration-(--vol-dur-fast)",
          "peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-select",
          disabled
            ? "border-border bg-sunken text-ink-disabled"
            : checked
              ? "border-select bg-select text-sheet"
              : "border-border-strong bg-sheet group-hover:bg-sunken",
        )}
      >
        {checked && <Check size={14} strokeWidth={2.5} />}
      </span>
      <span className="grid gap-0.5">
        <span className={cn("text-label", disabled ? "text-ink-tertiary" : "text-ink")}>{label}</span>
        {description && (
          <span id={`${id}-desc`} className="text-small text-ink-secondary">
            {description}
          </span>
        )}
      </span>
    </label>
  );
}
