import type { ReactNode } from "react";
import { useCanManage } from "../../lib/access";
import { Check, type LucideIcon } from "lucide-react";
import { Button } from "../../components/ui";

/** Heading row for a Settings panel: title, one line of help, and the panel's actions on the right. */
export function PanelHeader({ title, body, actions }: { title: string; body?: ReactNode | undefined; actions?: ReactNode | undefined }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3 border-b border-border pb-5">
      <div className="grid max-w-[62ch] gap-1">
        <h2 className="font-book text-heading text-ink">{title}</h2>
        {body && <p className="text-body text-ink-secondary">{body}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/** Inline result line under an action ("Saved at 14:40"). Polite, so screen readers hear it once. */
export function InlineStatus({ children, tone = "success" }: { children: ReactNode; tone?: "success" | "neutral" | undefined }) {
  return (
    <p role="status" className={tone === "success" ? "text-small font-semibold text-success" : "text-small text-ink-secondary"}>
      {children}
    </p>
  );
}

/**
 * The panel's save action. While nothing has changed it shows a quiet "No changes to save" line instead
 * of a greyed-out button, so there is nothing hard to read and nothing to click in vain. With changes it
 * is the gilt button; if a field is wrong it stays focusable and its tooltip says what to fix.
 */
export function SaveAction({
  dirty,
  invalidReason,
  onSave,
  icon,
  children,
}: {
  dirty: boolean;
  invalidReason?: string | undefined;
  onSave: () => void;
  icon?: LucideIcon | undefined;
  children: ReactNode;
}) {
  const canManage = useCanManage();
  // Only the owner changes settings (D-047); everyone else reads them.
  if (!canManage) return null;
  if (!dirty)
    return (
      <span className="inline-flex h-11 items-center gap-1.5 text-small text-ink-secondary">
        <Check size={16} aria-hidden className="text-success" />
        No changes to save
      </span>
    );
  return (
    <Button variant="primary" icon={icon} disabledReason={invalidReason} onClick={onSave}>
      {children}
    </Button>
  );
}
