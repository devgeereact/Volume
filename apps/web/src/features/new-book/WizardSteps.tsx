import { Check } from "lucide-react";
import { cn } from "../../lib/cn";

export interface WizardStep {
  id: string;
  label: string;
}

interface WizardStepsProps {
  steps: WizardStep[];
  current: number;
  /** Highest step the owner has reached; steps up to it can be revisited. */
  reached: number;
  onGo: (index: number) => void;
}

/**
 * Step header for the wizard, drawn like the stage track: done steps are ink with a tick, the
 * current one is gilt with a dot, later ones are outlined. Reached steps are buttons.
 */
export function WizardSteps({ steps, current, reached, onGo }: WizardStepsProps) {
  return (
    <nav aria-label="New book steps">
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-3">
        {steps.map((s, i) => {
          const state = i < current ? "done" : i === current ? "current" : "upcoming";
          const reachable = i <= reached && i !== current;
          const marker = (
            <span
              aria-hidden
              className={cn(
                "grid size-[22px] shrink-0 place-items-center rounded-full border-[1.5px]",
                state === "done" && "border-ink bg-ink text-canvas",
                state === "current" && "animate-page-turn border-accent-pressed bg-accent",
                state === "upcoming" && "border-border-strong bg-transparent",
              )}
            >
              {state === "done" && <Check size={12} strokeWidth={3} />}
              {state === "current" && <span className="size-2 rounded-full bg-on-accent" />}
            </span>
          );
          const label = (
            <span
              className={cn("text-label whitespace-nowrap", state === "upcoming" ? "text-ink-tertiary" : "text-ink", state === "current" && "font-semibold")}
            >
              <span className="sr-only">Step {i + 1}: </span>
              {s.label}
              {state === "done" && <span className="sr-only">, done</span>}
            </span>
          );
          return (
            <li key={s.id} className="flex items-center gap-2" aria-current={state === "current" ? "step" : undefined}>
              {reachable ? (
                <button type="button" onClick={() => onGo(i)} className="hit-44 flex items-center gap-2 rounded-sm hover:underline">
                  {marker}
                  {label}
                </button>
              ) : (
                <span className="flex items-center gap-2">
                  {marker}
                  {label}
                </span>
              )}
              {i < steps.length - 1 && <span aria-hidden className="mx-1 hidden h-px w-5 bg-border-strong sm:block" />}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
