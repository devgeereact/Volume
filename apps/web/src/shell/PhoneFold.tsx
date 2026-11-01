import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "../lib/cn";
import { useMediaQuery } from "../lib/useMediaQuery";

/**
 * Secondary detail on a book step that folds away on phones (under 761 px), so the step's main content
 * comes first. On wider screens it renders its children as they are, with no wrapper, so grid and flex
 * layouts are unchanged. On phones it is a native disclosure: a quiet row with the label, closed until
 * opened, and the full card inside. Nothing is removed, only folded.
 */
export function PhoneFold({
  label,
  hint,
  className,
  children,
}: {
  label: string;
  hint?: string | undefined;
  className?: string | undefined;
  children: ReactNode;
}) {
  const phone = useMediaQuery("(max-width: 760px)");
  if (!phone) return <>{children}</>;
  return (
    <details className={cn("group min-w-0", className)}>
      <summary
        className={cn(
          "flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 rounded-card border border-line bg-panel px-4 py-2.5 text-ink [&::-webkit-details-marker]:hidden",
          "hover:bg-soft group-open:mb-2 group-open:min-h-10 group-open:border-transparent group-open:bg-transparent group-open:py-1.5",
        )}
      >
        <span className="min-w-0">
          <span className="block text-label font-semibold">{label}</span>
          {hint && <span className="block text-small text-ink-2 group-open:hidden">{hint}</span>}
        </span>
        <ChevronDown
          size={18}
          strokeWidth={1.8}
          aria-hidden
          className="shrink-0 text-ink-2 transition-transform duration-(--vol-dur-fast) ease-out group-open:rotate-180 motion-reduce:transition-none"
        />
      </summary>
      {children}
    </details>
  );
}
