import type { ButtonHTMLAttributes, MouseEvent, ReactNode, Ref } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "../../lib/cn";
import { Loader } from "./Loader";
import { Tooltip } from "./Tooltip";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  /** primary = navy, one per screen. ghost = the guide's "quiet" button. danger = destructive, confirm first. */
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

/* Approved design: .btn and .pill-btn are 40 px with a 12 px radius; .sm is 32 px with a 9 px radius. */
const sizes: Record<ButtonSize, string> = {
  sm: "h-8 rounded-sm px-[11px] text-[13px] hit-44",
  md: "h-10 rounded-md px-4 text-label hit-44",
  lg: "h-11 rounded-md px-4 text-label",
};

/* primary is .btn (navy, one per screen); secondary is .pill-btn (strong glass with a light edge). */
const variants: Record<ButtonVariant, string> = {
  primary: "border-transparent bg-btn font-semibold text-on-btn",
  secondary: "border-edge bg-panel-2 font-medium text-ink shadow-control",
  ghost: "border-transparent bg-transparent font-medium text-ink-2",
  danger: "border-transparent bg-claim font-semibold text-on-claim",
};
const hovers: Record<ButtonVariant, string> = {
  primary: "hover:bg-accent-hover active:bg-accent-pressed",
  secondary: "hover:brightness-[1.03]",
  ghost: "hover:bg-soft hover:text-ink",
  danger: "hover:opacity-90",
};

const disabledClasses = "cursor-not-allowed opacity-50 active:scale-100";

const base =
  "relative inline-flex items-center justify-center gap-[7px] border font-ui whitespace-nowrap select-none transition-[filter,transform,background-color] duration-(--vol-dur-fast) ease-out active:scale-[.98]";

/** Button classes for a router Link that looks like a button (Up next card, Published shelf). */
export function buttonClasses(variant: ButtonVariant = "secondary", size: ButtonSize = "md"): string {
  return cn(base, sizes[size], variants[variant], hovers[variant]);
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
      className={cn(base, sizes[size], variants[variant], isDisabled ? disabledClasses : hovers[variant], fullWidth && "w-full", className)}
      {...rest}
    >
      <span className="grid place-items-center [grid-template-areas:'stack']">
        <span className={cn("inline-flex items-center gap-[7px] [grid-area:stack]", loading && "invisible")}>
          {Icon && <Icon size={iconSize} strokeWidth={1.8} aria-hidden />}
          <span>{children}</span>
          {estimate && <small className="text-[0.92em] font-medium opacity-70">{estimate}</small>}
          {IconRight && <IconRight size={iconSize} strokeWidth={1.8} aria-hidden />}
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
