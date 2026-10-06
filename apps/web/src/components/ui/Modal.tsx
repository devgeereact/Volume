import { useEffect, useId, useRef, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { X } from "lucide-react";
import { cn } from "../../lib/cn";
import { dialog, fadeOnly, scrim } from "../../lib/motion";
import { useFocusTrap } from "../../lib/useFocusTrap";
import { IconButton } from "./IconButton";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  /** Literata 22 px heading. Name the result, for example "Regenerate chapter 4". */
  title: ReactNode;
  description?: ReactNode | undefined;
  /** Actions, right-aligned. The primary action names the result. Cancel closes. */
  footer?: ReactNode | undefined;
  /** Element to focus first. Defaults to the first focusable element. */
  initialFocus?: RefObject<HTMLElement | null> | undefined;
  size?: "sm" | "md" | "lg" | undefined;
  /** Destructive confirmations should not close on a scrim click. */
  closeOnScrim?: boolean | undefined;
  children?: ReactNode | undefined;
}

const widths = { sm: "max-w-[400px]", md: "max-w-[480px]", lg: "max-w-[640px]" };

/**
 * Modal dialog on `raised` with the scrim behind. Focus is trapped and returns to the trigger,
 * Escape and Cancel close it, the page behind does not scroll. role="dialog" with aria-modal.
 */
export function Modal({ open, onClose, title, description, footer, initialFocus, size = "md", closeOnScrim = true, children }: ModalProps) {
  const reduce = useReducedMotion();
  const titleId = useId();
  const descId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  useFocusTrap(panelRef, open, initialFocus);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  const panel = reduce ? fadeOnly : dialog;
  const back = reduce ? fadeOnly : scrim;

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[60] grid place-items-center p-4">
          <motion.div
            aria-hidden
            className="absolute inset-0"
            initial={back.initial}
            animate={back.animate}
            exit={back.exit}
            onClick={closeOnScrim ? onClose : undefined}
          >
            <div className="absolute inset-0 bg-scrim" style={{ opacity: "var(--vol-scrim-opacity)" }} />
          </motion.div>
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={description ? descId : undefined}
            initial={panel.initial}
            animate={panel.animate}
            exit={panel.exit}
            className={cn("relative grid w-full gap-4 rounded-lg bg-raised p-6 shadow-modal", widths[size])}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="grid gap-1.5">
                <h2 id={titleId} className="font-book text-heading text-ink">
                  {title}
                </h2>
                {description && (
                  <p id={descId} className="text-body text-ink-secondary">
                    {description}
                  </p>
                )}
              </div>
              <IconButton icon={X} label="Close" size="sm" onClick={onClose} className="-mt-1 -mr-2" />
            </div>
            {children}
            {footer && <div className="flex flex-wrap justify-end gap-2">{footer}</div>}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
