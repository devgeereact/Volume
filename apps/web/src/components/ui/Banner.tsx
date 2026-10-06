import type { ReactNode } from "react";
import { Check, CircleAlert, Flag, Info } from "lucide-react";
import { cn } from "../../lib/cn";

interface BannerProps {
  /** error: proof red (assertive). attention: gilt text with a flag. success: green. info: neutral. */
  tone: "error" | "attention" | "success" | "info";
  title: ReactNode;
  children?: ReactNode | undefined;
  /** One action, for example <Button size="sm">Retry</Button>. */
  action?: ReactNode | undefined;
  className?: string | undefined;
}

const tones = {
  error: { cls: "bg-claim-wash text-claim", icon: CircleAlert },
  attention: { cls: "bg-accent-wash text-accent-text", icon: Flag },
  success: { cls: "bg-success-wash text-success", icon: Check },
  info: { cls: "bg-sunken text-ink-secondary", icon: Info },
};

/** Inline banner for errors and notices: what happened, what to do, and a retry when it makes sense. */
export function Banner({ tone, title, children, action, className }: BannerProps) {
  const { cls, icon: Icon } = tones[tone];
  return (
    <div role={tone === "error" ? "alert" : "status"} className={cn("flex flex-wrap items-start gap-3 rounded-md px-4 py-3", cls, className)}>
      <Icon size={16} className="mt-0.5 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-label font-semibold">{title}</p>
        {children && <div className="text-[13.5px] leading-[19px] text-ink">{children}</div>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
