import type { ButtonHTMLAttributes, MouseEvent, ReactNode, Ref } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "../../lib/cn";
import { Loader } from "./Loader";
import { Tooltip } from "./Tooltip";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  /** primary = gilt, one per screen. ghost = the guide's "quiet" button. danger = destructive, confirm first. */
  variant?: ButtonVariant | undefined;
  /** sm 32 px (44 px hit area), md 40 px (default), lg 44 px. */
  size?: ButtonSize | undefined;
  icon?: LucideIcon | undefined;
  iconRight?: LucideIcon | undefined;
  /** Shows the pen loader and loadingLabel, keeps the button's width, sets aria-busy. */
  loading?: boolean | undefined;
  /** Verb shown while loading, for example "Building". */
  loadingLabel?: string | undefined;
  /** Cost before the click, for example "about $0.04". */
  estimate?: string | undefined;
  /** Disables the button but keeps it focusable, and shows this reason in a tooltip. */
  disabledReason?: string | undefined;
  fullWidth?: boolean | undefined;
  ref?: Ref<HTMLButtonElement> | undefined;
  children: ReactNode;
}

const sizes: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-small font-semibold hit-44",
  md: "h-10 px-4 text-label font-semibold hit-44",
  lg: "h-11 px-4 text-label font-semibold",
};

const variants: Record<ButtonVariant, string> = {
  primary: "border-transparent bg-accent text-on-accent shadow-button hover:bg-accent-hover active:bg-accent-pressed",
  secondary: "border-border-strong bg-sheet text-ink hover:bg-sunken",
  ghost: "border-transparent bg-transparent text-ink-secondary hover:bg-sunken hover:text-ink",
  danger: "border-transparent bg-claim text-on-claim hover:opacity-90",
};

const disabledClasses = "bg-sunken text-ink-tertiary border-border shadow-none hover:bg-sunken hover:text-ink-tertiary cursor-not-allowed active:translate-y-0";

const base =
  "relative inline-flex items-center justify-center rounded-sm border font-ui whitespace-nowrap select-none transition-transform duration-(--vol-dur-fast) ease-out active:translate-y-px";

/** Button classes for a router Link that looks like a button (StepFooter, Published shelf). */
export function buttonClasses(variant: ButtonVariant = "secondary", size: ButtonSize = "md"): string {
  return cn(base, sizes[size], variants[variant], "gap-2");
}

/** Volume's button. Labels say what happens ("Build pack"), never "Submit". */
export function Button({
  variant = "secondary",
  size = "md",
  icon: Icon,
  iconRight: IconRight,
  loading = false,
  loadingLabel,
  estimate,
  disabledReason,
  fullWidth = false,
  disabled,
  className,
  onClick,
  type = "button",
  ref,
  children,
  ...rest
}: ButtonProps) {
  const softDisabled = Boolean(disabledReason) && !disabled;
  const isDisabled = Boolean(disabled) || softDisabled;
  const iconSize = size === "sm" ? 14 : 16;

  function handleClick(e: MouseEvent<HTMLButtonElement>) {
    if (softDisabled || loading) {
      e.preventDefault();
      return;
    }
    onClick?.(e);
  }

  const button = (
    <button
      ref={ref}
      type={type}
      disabled={disabled}
      aria-disabled={softDisabled || loading ? true : undefined}
      aria-busy={loading || undefined}
      onClick={handleClick}
      className={cn(base, sizes[size], isDisabled ? disabledClasses : variants[variant], fullWidth && "w-full", className)}
      {...rest}
    >
      <span className="grid place-items-center [grid-template-areas:'stack']">
        <span className={cn("inline-flex items-center gap-2 [grid-area:stack]", loading && "invisible")}>
          {Icon && <Icon size={iconSize} aria-hidden />}
          <span>{children}</span>
          {estimate && <small className="text-small font-medium opacity-80">{estimate}</small>}
          {IconRight && <IconRight size={iconSize} aria-hidden />}
        </span>
        {loadingLabel !== undefined && (
          <span className={cn("inline-flex items-center gap-2 [grid-area:stack]", !loading && "invisible")} aria-hidden={!loading}>
            <Loader />
            <span>{loadingLabel}</span>
          </span>
        )}
        {loading && loadingLabel === undefined && (
          <span className="inline-flex items-center [grid-area:stack]">
            <Loader label="Working" />
          </span>
        )}
      </span>
    </button>
  );

  if (disabledReason) {
    return (
      <Tooltip content={disabledReason} className={fullWidth ? "flex w-full" : undefined}>
        {button}
      </Tooltip>
    );
  }
  return button;
}
