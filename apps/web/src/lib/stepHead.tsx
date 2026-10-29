import { createContext, useContext } from "react";

/** A part of the step head that a screen's PageHeader fills. */
export type StepHeadPart = "title" | "summary" | "actions";

/**
 * Where a book screen's PageHeader draws inside the step head (shell/StepHead). The shell owns the head
 * (step marker, title, purpose, tools, main action); the screen keeps its own title, summary and tools,
 * which PageHeader puts into these slots with a portal. Outside a step head the value is null and
 * PageHeader draws as usual.
 */
export interface StepHeadSlots {
  title: HTMLElement | null;
  summary: HTMLElement | null;
  actions: HTMLElement | null;
  /** Tells the head a part is filled, so it hides its own default. Returns the release. */
  claim: (part: StepHeadPart) => () => void;
}

export const StepHeadContext = createContext<StepHeadSlots | null>(null);

export function useStepHeadSlots(): StepHeadSlots | null {
  return useContext(StepHeadContext);
}
