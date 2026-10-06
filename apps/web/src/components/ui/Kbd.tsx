import { cn } from "../../lib/cn";

interface KbdProps {
  keys: string[];
  /** "spine" for keys shown inside a tooltip or on the spine. */
  tone?: "default" | "spine" | undefined;
  className?: string | undefined;
}

/** Keyboard keys, for example <Kbd keys={["⌘", "K"]} />. Mono is used only for keys and model IDs. */
export function Kbd({ keys, tone = "default", className }: KbdProps) {
  return (
    <span className={cn("inline-flex items-center gap-1", className)}>
      {keys.map((k) => (
        <kbd
          key={k}
          className={cn(
            "inline-grid h-[22px] min-w-[22px] place-items-center rounded-xs border px-[5px] font-mono text-[11.5px] leading-none font-medium",
            tone === "spine" ? "border-spine-raised bg-spine-raised text-ink-on-spine" : "border-border bg-canvas text-ink-secondary",
          )}
        >
          {k}
        </kbd>
      ))}
    </span>
  );
}

/** The modifier key for this platform: ⌘ on Apple devices, Ctrl elsewhere. */
export function modKey(): string {
  if (typeof navigator === "undefined") return "Ctrl";
  return /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent) ? "⌘" : "Ctrl";
}
