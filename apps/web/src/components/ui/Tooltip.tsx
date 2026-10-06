import { cloneElement, useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ReactElement, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "../../lib/cn";
import { Kbd } from "./Kbd";

type Side = "top" | "bottom" | "right" | "left";

interface TooltipProps {
  content: ReactNode;
  /** Keyboard shortcut shown after the text, for example ["⌘", "K"]. */
  shortcut?: string[] | undefined;
  side?: Side | undefined;
  /** The trigger. It receives aria-describedby. Must accept focus (or wrap a focusable element). */
  children: ReactElement<{ "aria-describedby"?: string | undefined }>;
  /** Classes for the wrapper span (default inline-flex). Use "flex w-full" for full-width triggers. */
  className?: string | undefined;
}

const DELAY = 400;
const GAP = 8;

/**
 * Tooltip on the spine colour. Shows on hover and keyboard focus after 400 ms, hides on leave,
 * blur or Escape. Rendered in a portal with fixed position, so it is never clipped by a scroll area.
 */
export function Tooltip({ content, shortcut, side = "top", children, className }: TooltipProps) {
  const id = useId();
  const wrapRef = useRef<HTMLSpanElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const timer = useRef<number | undefined>(undefined);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);

  const show = useCallback(() => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setOpen(true), DELAY);
  }, []);
  const hide = useCallback(() => {
    window.clearTimeout(timer.current);
    setOpen(false);
    setPos(null);
  }, []);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") hide();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("scroll", hide, true);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", hide, true);
    };
  }, [open, hide]);

  useLayoutEffect(() => {
    if (!open || !wrapRef.current || !tipRef.current) return;
    const r = wrapRef.current.getBoundingClientRect();
    const t = tipRef.current.getBoundingClientRect();
    let x: number;
    let y: number;
    if (side === "top") {
      x = r.left + r.width / 2 - t.width / 2;
      y = r.top - t.height - GAP;
    } else if (side === "bottom") {
      x = r.left + r.width / 2 - t.width / 2;
      y = r.bottom + GAP;
    } else if (side === "right") {
      x = r.right + GAP;
      y = r.top + r.height / 2 - t.height / 2;
    } else {
      x = r.left - t.width - GAP;
      y = r.top + r.height / 2 - t.height / 2;
    }
    const maxX = window.innerWidth - t.width - 8;
    setPos({ x: Math.max(8, Math.min(x, maxX)), y: Math.max(8, y) });
  }, [open, side]);

  return (
    <span ref={wrapRef} className={cn("inline-flex", className)} onPointerEnter={show} onPointerLeave={hide} onFocus={show} onBlur={hide}>
      {cloneElement(children, { "aria-describedby": open ? id : undefined })}
      {open &&
        createPortal(
          <div
            ref={tipRef}
            id={id}
            role="tooltip"
            className={cn(
              "pointer-events-none fixed z-[70] max-w-[280px] rounded-sm bg-spine px-3 py-2 text-small text-ink-on-spine shadow-pop",
              "transition-opacity duration-(--vol-dur-base) ease-out",
              pos ? "opacity-100" : "opacity-0",
            )}
            style={{ left: pos?.x ?? -9999, top: pos?.y ?? -9999 }}
          >
            <span className="inline-flex flex-wrap items-center gap-2">
              <span>{content}</span>
              {shortcut && <Kbd keys={shortcut} tone="spine" />}
            </span>
          </div>,
          document.body,
        )}
    </span>
  );
}
