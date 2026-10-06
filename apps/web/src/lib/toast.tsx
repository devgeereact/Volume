import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Toast, type ToastTone } from "../components/ui/Toast";
import { fadeOnly, popover } from "./motion";

/* Toasts are only for background work that finished elsewhere (08-DESIGN-GUIDE). They sit above the
   job bar, are announced politely, and stay until dismissed when they carry an action. */

export interface ToastInput {
  tone: ToastTone;
  title: string;
  body?: string | undefined;
  action?: { label: string; onClick: () => void } | undefined;
  /** Default: stays when it has an action, otherwise closes after 6 seconds. */
  persist?: boolean | undefined;
}

interface ToastItem extends ToastInput {
  id: number;
}

interface ToastContextValue {
  show: (t: ToastInput) => number;
  dismiss: (id: number) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);
  const reduce = useReducedMotion();

  const dismiss = useCallback((id: number) => setItems((list) => list.filter((t) => t.id !== id)), []);
  const show = useCallback(
    (t: ToastInput) => {
      const id = nextId.current++;
      setItems((list) => [...list.slice(-2), { ...t, id }]);
      const persist = t.persist ?? Boolean(t.action);
      if (!persist) window.setTimeout(() => dismiss(id), 6000);
      return id;
    },
    [dismiss],
  );

  const value = useMemo(() => ({ show, dismiss }), [show, dismiss]);
  const preset = reduce ? fadeOnly : popover;

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        aria-label="Notifications"
        className="pointer-events-none fixed right-4 z-[55] grid w-[min(440px,calc(100vw-32px))] justify-items-end gap-2"
        style={{ bottom: "calc(var(--shell-jobbar) + 16px)" }}
      >
        <AnimatePresence initial={false}>
          {items.map((t) => (
            <motion.div key={t.id} layout={!reduce} initial={preset.initial} animate={preset.animate} exit={preset.exit} className="pointer-events-auto w-full">
              <Toast
                tone={t.tone}
                title={t.title}
                body={t.body}
                action={
                  t.action
                    ? {
                        label: t.action.label,
                        onClick: () => {
                          t.action?.onClick();
                          dismiss(t.id);
                        },
                      }
                    : undefined
                }
                onDismiss={() => dismiss(t.id)}
              />
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside ToastProvider");
  return ctx;
}
