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
        "relative grid cursor-pointer content-start gap-2 rounded-[18px] border-[1.5px] p-4 transition-[transform,border-color] duration-(--vol-dur-base) ease-out",
        "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-select",
        checked
          ? "border-btn bg-panel-2 shadow-[0_0_0_3px_var(--vol-mint-wash)]"
          : disabled
            ? "cursor-not-allowed border-edge bg-soft opacity-70"
            : "border-edge bg-soft hover:-translate-y-0.5 hover:border-mint-2 motion-reduce:hover:translate-y-0",
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
      {checked && (
        <span aria-hidden className="absolute top-3.5 right-3.5 grid size-5 place-items-center rounded-full bg-btn text-on-btn">
          <Check size={12} strokeWidth={3} />
        </span>
      )}
      {children}
    </label>
  );
}
