import type { ReactNode } from "react";
import { cn } from "../../lib/cn";

interface MarginNoteProps {
  /** profile and general notes: border-strong rule. selection: pencil. claim: proof red. */
  kind: "profile" | "selection" | "claim";
  label: string;
  id?: string | undefined;
  className?: string | undefined;
  children: ReactNode;
}

/** Margin note: Literata italic 14 px with a Schibsted label and a 2 px rule on the left. */
export function MarginNote({ kind, label, id, className, children }: MarginNoteProps) {
  return (
    <p
      id={id}
      className={cn(
        "border-l-2 pl-3 font-book text-[14px] leading-5 text-ink-secondary italic",
        kind === "profile" && "border-border-strong",
        kind === "selection" && "border-select",
        kind === "claim" && "border-claim",
        className,
      )}
    >
      <b
        className={cn(
          "mb-1 block font-ui text-[12.5px] leading-4 font-semibold not-italic",
          kind === "selection" ? "text-select" : kind === "claim" ? "text-claim" : "text-ink",
        )}
      >
        {label}
      </b>
      {children}
    </p>
  );
}
