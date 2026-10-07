import { Check } from "lucide-react";
import type { StageId } from "../../demo/types";
import { stageLabels } from "../../demo/books";
import { cn } from "../../lib/cn";
import { LiveDot } from "./LiveDot";

interface StageChipProps {
  stage: StageId;
  /** A job is running in this stage (gilt live dot). */
  live?: boolean | undefined;
  className?: string | undefined;
}

/** Pipeline stage as a pill: Idea, Research, Title, Blueprint, Writing, Editing, Cover, Export, Published. */
export function StageChip({ stage, live = false, className }: StageChipProps) {
  const published = stage === "published";
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-1.5 rounded-pill px-2.5 text-[12.5px] leading-none font-semibold whitespace-nowrap",
        live ? "bg-accent-wash text-accent-text" : published ? "bg-success-wash text-success" : "bg-sunken text-ink-secondary",
        className,
      )}
    >
      {live && <LiveDot />}
      {published && <Check size={14} strokeWidth={2} aria-hidden />}
      {!live && !published && <span aria-hidden className="size-1.5 rounded-full border-[1.5px] border-current" />}
      {stageLabels[stage]}
    </span>
  );
}
