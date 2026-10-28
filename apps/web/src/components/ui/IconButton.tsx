import type { ButtonHTMLAttributes, MouseEvent, Ref } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "../../lib/cn";
import { Tooltip } from "./Tooltip";

interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children" | "aria-label"> {
  icon: LucideIcon;
  /** Spoken name and tooltip text. Required: icon-only buttons always need a label. */
  label: string;
  variant?: "secondary" | "ghost" | "spine" | "glass" | undefined;
  /** md is 44 x 44. sm is 32 x 32 with a 44 px hit area. */
  size?: "sm" | "md" | undefined;
  /** For toggle buttons: sets aria-pressed. */
  pressed?: boolean | undefined;
  shortcut?: string[] | undefined;
  /** Disables the button but keeps it focusable (aria-disabled); the tooltip adds this reason. */
  disabledReason?: string | undefined;
  tooltipSide?: "top" | "bottom" | "right" | "left" | undefined;
  ref?: Ref<HTMLButtonElement> | undefined;
}

const variants = {
  secondary: "bg-sheet text-ink border-border-strong hover:bg-sunken",
  ghost: "bg-transparent text-ink-secondary border-transparent hover:bg-sunken hover:text-ink",
  spine: "bg-transparent text-ink-on-spine-muted border-transparent hover:bg-spine-raised hover:text-ink-on-spine",
  // Frosted chip for the top bar and the phone menu (studio redesign).
  glass: "bg-glass-strong text-ink-secondary border-glass-edge shadow-glass-sm hover:bg-glass-drawer hover:text-ink",
};

/** Square icon button with an aria-label and a tooltip. disabledReason keeps it focusable, like Button. */
export function IconButton({
  icon: Icon,
  label,
  variant = "ghost",
  size = "md",
  pressed,
  shortcut,
  disabledReason,
  tooltipSide = "top",
  className,
  disabled,
  onClick,
  type = "button",
  ref,
  ...rest
}: IconButtonProps) {
  const softDisabled = Boolean(disabledReason) && !disabled;
  const isDisabled = Boolean(disabled) || softDisabled;

  function handleClick(e: MouseEvent<HTMLButtonElement>) {
    if (softDisabled) {
      e.preventDefault();
      return;
    }
    onClick?.(e);
  }

  return (
    <Tooltip content={disabledReason ? `${label}. ${disabledReason}` : label} shortcut={shortcut} side={tooltipSide}>
      <button
        ref={ref}
        type={type}
        aria-label={label}
        aria-pressed={pressed}
        disabled={disabled}
        aria-disabled={softDisabled ? true : undefined}
        onClick={handleClick}
        className={cn(
          "inline-grid shrink-0 place-items-center border transition-transform duration-(--vol-dur-fast) ease-out",
          variant === "glass" ? "rounded-control" : "rounded-sm",
          size === "md" ? "size-11" : "size-8 hit-44",
          isDisabled
            ? "cursor-not-allowed border-transparent bg-sunken text-ink-disabled"
            : cn("active:translate-y-px", pressed && variant !== "spine" ? "border-select bg-select-wash text-select" : variants[variant]),
          className,
        )}
        {...rest}
      >
        <Icon size={size === "md" ? 18 : 16} aria-hidden />
      </button>
    </Tooltip>
  );
}
