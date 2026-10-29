import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "../../lib/cn";

interface InspectorSectionProps {
  title: ReactNode;
  icon?: LucideIcon | undefined;
  /** "claim" titles the section in proof red (Claims to verify). "attention" uses amber text. */
  tone?: "default" | "claim" | "attention" | undefined;
  /** Something small on the right of the title row, such as a link or a date. */
  aside?: ReactNode | undefined;
  className?: string | undefined;
  children: ReactNode;
}

/** Inspector section: 13 px label, content, hairline above (none on the first section). */
export function InspectorSection({ title, icon: Icon, tone = "default", aside, className, children }: InspectorSectionProps) {
  return (
    <section className={cn("border-t border-border py-4 first:border-t-0 first:pt-0", className)}>
      <div className="mb-2.5 flex items-center justify-between gap-3">
        <h3
          className={cn(
            "flex items-center gap-1.5 text-[13px] leading-none font-semibold",
            tone === "claim" ? "text-claim" : tone === "attention" ? "text-accent-text" : "text-ink-secondary",
          )}
        >
          {Icon && <Icon size={14} strokeWidth={2} aria-hidden />}
          {title}
        </h3>
        {aside}
      </div>
      {children}
    </section>
  );
}
