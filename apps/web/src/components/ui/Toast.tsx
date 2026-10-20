import type { ReactNode } from "react";
import { Check, CircleAlert, Flag, Sparkles, X } from "lucide-react";
import { cn } from "../../lib/cn";
import { Button } from "./Button";
import { IconButton } from "./IconButton";

export type ToastTone = "success" | "attention" | "error" | "working";

export interface ToastProps {
  tone: ToastTone;
  title: ReactNode;
  body?: ReactNode | undefined;
  action?: { label: string; onClick: () => void } | undefined;
  onDismiss?: (() => void) | undefined;
  className?: string | undefined;
}

const icons = {
  success: { icon: Check, classes: "bg-success-wash text-success" },
  attention: { icon: Flag, classes: "bg-accent-wash text-accent-text" },
  error: { icon: CircleAlert, classes: "bg-claim-wash text-claim" },
  working: { icon: Sparkles, classes: "bg-select-wash text-select" },
};

/**
 * Toast on `raised`: icon in a wash circle, title, one line, one action or dismiss.
 * Only for background work that finished elsewhere. Use useToast() to show one.
 */
export function Toast({ tone, title, body, action, onDismiss, className }: ToastProps) {
  const { icon: Icon, classes } = icons[tone];
  return (
    <div className={cn("flex w-full max-w-[440px] items-start gap-3 rounded-md border border-border bg-raised py-3.5 pr-3.5 pl-4 shadow-pop", className)}>
      <span className={cn("grid size-7 shrink-0 place-items-center rounded-full", classes)}>
        <Icon size={16} aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[14px] leading-5 font-semibold text-ink">{title}</p>
        {body && <p className="text-[13.5px] leading-[19px] text-ink-secondary">{body}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {action && (
          <Button variant="ghost" size="sm" onClick={action.onClick}>
            {action.label}
          </Button>
        )}
        {onDismiss && <IconButton icon={X} label="Dismiss" size="sm" onClick={onDismiss} />}
      </div>
    </div>
  );
}
