import { Check } from "lucide-react";
import { cn } from "../../lib/cn";

export interface WizardStep {
  id: string;
  label: string;
  /** The line under the label: what the step is for, or what was chosen there ("Harni Muharami"). */
  hint?: string | undefined;
}

interface WizardStepsProps {
  steps: WizardStep[];
  current: number;
  /** Highest step the owner has reached; steps up to it can be revisited. */
  reached: number;
  onGo: (index: number) => void;
  className?: string | undefined;
}

/**
 * The wizard's step rail (approved design, .nb-rail): a glass card titled New book with one row per step. The
 * current step's number sits on navy, done steps show a tick on green, later steps a plain number. Reached steps
 * are buttons; the rest are shown but cannot be opened yet. On phones the rail is one row that scrolls sideways.
 */
export function WizardSteps({ steps, current, reached, onGo, className }: WizardStepsProps) {
  return (
    <nav
      aria-label="New book steps"
      className={cn(
        "vol-glass min-w-0 rounded-card p-4 max-[860px]:overflow-x-auto max-[860px]:p-2 max-[860px]:[scrollbar-width:none] min-[861px]:sticky min-[861px]:top-[calc(var(--shell-topbar)+12px)]",
        className,
      )}
    >
      <p aria-hidden className="px-2 pt-1 pb-2.5 text-[15px] font-bold text-ink max-[860px]:hidden">
        New book
      </p>
      <ol className="grid gap-1 max-[860px]:flex">
        {steps.map((s, i) => {
          const state = i < current ? "done" : i === current ? "current" : "upcoming";
          const reachable = i <= reached && i !== current;
          const tick = i !== current && i < reached;
          const body = (
            <>
              <em
                aria-hidden
                className={cn(
                  "grid size-[30px] shrink-0 place-items-center rounded-[10px] border text-[12.5px] font-bold not-italic",
                  state === "current" && "border-transparent bg-btn text-on-btn",
                  state !== "current" && tick && "border-transparent bg-good-wash text-good",
                  state !== "current" && !tick && "border-edge bg-soft text-ink-3",
                )}
              >
                {tick ? <Check size={14} strokeWidth={2.4} /> : i + 1}
              </em>
              <span className="grid min-w-0 text-left">
                <span className="text-[13.5px] leading-5 font-bold text-ink">
                  <span className="sr-only">Step {i + 1}: </span>
                  {s.label}
                  {state === "done" && <span className="sr-only">, done</span>}
                </span>
                {s.hint && <span className="max-w-[160px] truncate text-[12px] leading-[18px] text-ink-3 max-[860px]:hidden">{s.hint}</span>}
              </span>
            </>
          );
          const row = cn(
            "flex w-full items-center gap-3 rounded-lg p-2.5 max-[860px]:w-auto max-[860px]:flex-none",
            state === "current" && "bg-panel-2 shadow-control",
          );
          return (
            <li key={s.id} className="min-w-0 max-[860px]:flex-none" aria-current={state === "current" ? "step" : undefined}>
              {reachable ? (
                <button type="button" onClick={() => onGo(i)} className={cn(row, "hover:bg-soft")}>
                  {body}
                </button>
              ) : (
                <span className={row}>{body}</span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
