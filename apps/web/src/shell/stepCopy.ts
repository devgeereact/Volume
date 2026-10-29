import { Book, Globe, Image, Layers2, Megaphone, Package, PenLine, Zap, type LucideIcon } from "lucide-react";
import type { BookStepId } from "../demo/types";

/** Each step's icon in the approved design (the Up next card). */
export const stepIcons: Record<BookStepId, LucideIcon> = {
  research: Globe,
  titles: PenLine,
  blueprint: Layers2,
  writing: Zap,
  editor: Book,
  cover: Image,
  marketing: Megaphone,
  export: Package,
};

/**
 * Words for the step rail, the step head and the Up next card (studio redesign, stage 2).
 * `purpose` is the head's line until the screen's own header gives one; it reuses each screen's summary.
 * `short` is the Up next card's line. Plain British English, no em dashes.
 */
export const stepCopy: Record<BookStepId, { purpose: string; short: string }> = {
  research: {
    purpose: "Who the book is for, what they struggle with, and where it fits. Sources are cited, never invented.",
    short: "Readers, problems and cited sources",
  },
  titles: {
    purpose: "Directions from the research and title options to compare. Edit any of them, then choose one.",
    short: "Pick the title and subtitle",
  },
  blueprint: {
    purpose: "The whole plan for the book, part by part, ready to approve.",
    short: "Plan every section before writing",
  },
  writing: {
    purpose: "The writer drafts every section in book order and checks each one as it lands.",
    short: "Write each section in order",
  },
  editor: {
    purpose: "Read, edit and polish every section.",
    short: "Read, change and check the text",
  },
  cover: {
    purpose: "From brief to final eBook cover and paperback wrap.",
    short: "eBook cover and paperback wrap",
  },
  marketing: {
    purpose: "Launch content for this book. Copy what you need, change what you do not.",
    short: "Scripts and posts for the launch",
  },
  export: {
    purpose: "Check, build and download the KDP upload pack.",
    short: "KDP checks and the upload pack",
  },
};

/**
 * Steps whose screen is a full-height workspace with its own header and tools (writing, editor, cover
 * studio). They get no step head and no Up next card; their main action sits in the step rail instead.
 */
export const fullSteps: ReadonlySet<BookStepId> = new Set<BookStepId>(["writing", "editor", "cover"]);
