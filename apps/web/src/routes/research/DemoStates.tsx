import { useState } from "react";
import { useSearchParams } from "react-router";
import { SegmentedControl } from "../../components/ui";
import { cn } from "../../lib/cn";

/* Prototype-only control to preview each state of a screen (loading, empty, error, ready).
   The starting state can also come from the URL, for example ?state=error, so a reviewer or the
   screenshot script can open a screen straight in that state. It never ships to apps/web. */

export type ScreenState = "ready" | "loading" | "empty" | "error";

const order: ScreenState[] = ["ready", "loading", "empty", "error"];
const labels: Record<ScreenState, string> = { ready: "Ready", loading: "Loading", empty: "Empty", error: "Error" };

/** Screen state with its starting value read from ?state= in the URL. */
export function useScreenState(fallback: ScreenState = "ready"): [ScreenState, (s: ScreenState) => void] {
  const [params] = useSearchParams();
  const fromUrl = params.get("state");
  const initial = order.find((s) => s === fromUrl) ?? fallback;
  return useState<ScreenState>(initial);
}

interface DemoStatesProps {
  value: ScreenState;
  onChange: (s: ScreenState) => void;
  className?: string | undefined;
}

/** A quiet strip at the end of the page: "Prototype only. Preview this screen's states." */
export function DemoStates({ value, onChange, className }: DemoStatesProps) {
  return (
    <div className={cn("flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-dashed border-border pt-4", className)}>
      <p className="text-small text-ink-tertiary">Prototype only. Preview this screen in each state.</p>
      <SegmentedControl<ScreenState>
        label="Preview state"
        size="sm"
        options={order.map((s) => ({ value: s, label: labels[s] }))}
        value={value}
        onChange={onChange}
      />
    </div>
  );
}
