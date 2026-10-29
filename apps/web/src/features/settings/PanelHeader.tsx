import { createContext, useContext, type ReactNode } from "react";
import { useCanManage } from "../../lib/access";
import { Check, type LucideIcon } from "lucide-react";
import { Button } from "../../components/ui";
import { cn } from "../../lib/cn";

/** The current section's icon (26 px, drawn by SettingsPage), so each panel's hero shows it without passing it down. */
export const SettingsIconContext = createContext<ReactNode>(null);

/**
 * The panel's hero card (approved design, .set-hero): the section's icon on a navy tile, its title and one line
 * of help, and the panel's status or actions on the right. Wraps under the text on phones.
 */
export function PanelHeader({ title, body, actions }: { title: string; body?: ReactNode | undefined; actions?: ReactNode | undefined }) {
  const icon = useContext(SettingsIconContext);
  return (
    <div className="vol-glass flex flex-wrap items-center gap-[18px] rounded-card p-[22px] max-[560px]:p-4">
      {icon && (
        <span aria-hidden className="grid size-14 shrink-0 place-items-center rounded-[18px] bg-btn text-on-btn">
          {icon}
        </span>
      )}
      <div className="grid min-w-[180px] flex-1 gap-1">
        <h2 className="text-[20px] leading-7 font-bold text-ink">{title}</h2>
        {body && <p className="max-w-[60ch] text-body text-ink-2">{body}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/** A Settings section card (approved design, .set-sec): an uppercase label, then the section's rows and fields. */
export function SettingsSection({
  title,
  aside,
  children,
  className,
}: {
  title?: string | undefined;
  aside?: ReactNode | undefined;
  children: ReactNode;
  className?: string | undefined;
}) {
  return (
    <section className={cn("vol-glass grid min-w-0 content-start gap-4 rounded-card p-[22px] max-[560px]:p-4", className)}>
      {(title || aside) && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          {title && <h3 className="text-[12px] leading-4 font-bold tracking-[0.08em] text-ink-3 uppercase">{title}</h3>}
          {aside}
        </div>
      )}
      {children}
    </section>
  );
}

/** One settings row (approved design, .srow): a bold label and a short line on the left, the value or control on the right. */
export function SettingRow({ title, body, children }: { title: ReactNode; body?: ReactNode | undefined; children?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-[18px] gap-y-3 border-b border-line py-4 first:pt-1 last:border-b-0 last:pb-1">
      <div className="min-w-[220px] flex-1">
        <p className="text-[14px] leading-5 font-semibold text-ink">{title}</p>
        {body && <p className="mt-0.5 max-w-[62ch] text-[12.5px] leading-[18px] text-ink-3">{body}</p>}
      </div>
      {children}
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
