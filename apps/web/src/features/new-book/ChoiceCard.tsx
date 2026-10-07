import type { ReactNode } from "react";
import { Check } from "lucide-react";
import { cn } from "../../lib/cn";

interface ChoiceCardProps {
  name: string;
  value: string;
  checked: boolean;
  onChange: (value: string) => void;
  /** Shown but not selectable; the reason is read out and printed on the card. */
  disabledReason?: string | undefined;
  describedBy?: string | undefined;
  className?: string | undefined;
  children: ReactNode;
}

/**
 * A card that is a native radio button underneath, so arrow keys move between cards and the group
 * has one tab stop. Selected: select-wash, pencil border and the pencil stroke on the leading edge.
 */
export function ChoiceCard({ name, value, checked, onChange, disabledReason, describedBy, className, children }: ChoiceCardProps) {
  const disabled = Boolean(disabledReason);
  return (
    <label
      className={cn(
        "relative grid cursor-pointer content-start gap-2 rounded-md border p-4 transition-colors duration-(--vol-dur-fast) sm:p-5",
        "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-select",
        checked
          ? "vol-pencil-edge border-select bg-select-wash"
          : disabled
            ? "cursor-not-allowed border-border bg-sunken"
            : "border-border bg-sheet hover:border-border-strong",
        className,
      )}
    >
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        disabled={disabled}
        onChange={() => onChange(value)}
        aria-describedby={describedBy}
        className="sr-only"
      />
      <span
        aria-hidden
        className={cn(
          "absolute top-4 right-4 grid size-5 place-items-center rounded-full border-[1.5px]",
          checked ? "border-select bg-select text-sheet" : "border-border-strong bg-sheet",
          disabled && "border-border",
        )}
      >
        {checked && <Check size={12} strokeWidth={3} />}
      </span>
      {children}
    </label>
  );
}
