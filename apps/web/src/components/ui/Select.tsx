import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "../../lib/cn";
import { fadeOnly, popover } from "../../lib/motion";
import { FieldShell, describedBy, fieldBoxClasses } from "./FieldShell";

/**
 * Classes of the open list. It is capped at 320 px, or less on a short screen, and scrolls, so every option can be
 * reached with the mouse when there are many (a Volume mode plan lists every book).
 */
export const selectListClasses =
  "absolute top-full right-0 left-0 z-40 mt-1.5 grid max-h-[min(320px,50dvh)] gap-0.5 overflow-y-auto overscroll-contain rounded-md border border-border bg-raised p-1.5 shadow-pop outline-none";

/**
 * The scrollTop that brings the active option fully into view inside the list, moving as little as possible
 * (keyboard moves past the visible edge scroll the list). Offsets are relative to the list's content.
 */
export function scrollTopForOption(list: { scrollTop: number; clientHeight: number }, option: { offsetTop: number; offsetHeight: number }): number {
  const top = option.offsetTop;
  const bottom = top + option.offsetHeight;
  if (top < list.scrollTop) return top;
  if (bottom > list.scrollTop + list.clientHeight) return bottom - list.clientHeight;
  return list.scrollTop;
}

export interface SelectOption {
  value: string;
  label: string;
  /** Short hint on the right of the option, for example "10 to 14 chapters". */
  hint?: string | undefined;
}

interface SelectProps {
  label: ReactNode;
  options: SelectOption[];
  value: string | null;
  onChange: (value: string) => void;
  placeholder?: string | undefined;
  hint?: ReactNode | undefined;
  error?: ReactNode | undefined;
  disabled?: boolean | undefined;
  disabledReason?: ReactNode | undefined;
  id?: string | undefined;
  className?: string | undefined;
}

/**
 * Select with a menu on `raised` (40 px rows, hint on the right). Button plus listbox:
 * Enter, Space or Arrow keys open it; arrows, Home and End move; Enter or Space choose; Escape closes
 * and returns focus. The selected option has select-wash, pencil text, a check and aria-selected.
 */
export function Select({
  label,
  options,
  value,
  onChange,
  placeholder = "Choose one",
  hint,
  error,
  disabled,
  disabledReason,
  id: idProp,
  className,
}: SelectProps) {
  const autoId = useId();
  const id = idProp ?? autoId;
  const listId = `${id}-list`;
  const reduce = useReducedMotion();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const selected = options.find((o) => o.value === value) ?? null;

  /* Arrow keys pressed while the list is opening (before focus reaches it) are queued here and
     replayed once the list has focus, so a quick ArrowDown, ArrowDown is never lost. */
  const pending = useRef<number>(0);

  function openList() {
    if (disabled) return;
    const idx = Math.max(
      0,
      options.findIndex((o) => o.value === value),
    );
    pending.current = 0;
    setActive(idx);
    setOpen(true);
  }

  function close(returnFocus: boolean) {
    setOpen(false);
    if (returnFocus) buttonRef.current?.focus();
  }

  function choose(i: number) {
    const opt = options[i];
    if (!opt) return;
    onChange(opt.value);
    close(true);
  }

  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => {
      listRef.current?.focus();
      const step = pending.current;
      pending.current = 0;
      if (step !== 0) setActive((a) => Math.min(options.length - 1, Math.max(0, a + step)));
    });
    return () => cancelAnimationFrame(frame);
  }, [open, options.length]);

  // Keep the active option in view as the arrow keys, Home and End move it.
  useEffect(() => {
    if (!open) return;
    const list = listRef.current;
    const opt = list?.querySelector<HTMLElement>(`[data-index="${active}"]`);
    if (!list || !opt) return;
    const next = scrollTopForOption(list, opt);
    if (next !== list.scrollTop) list.scrollTop = next;
  }, [open, active]);

  useEffect(() => {
    if (!open) return;
    function onDown(e: PointerEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  function onButtonKey(e: KeyboardEvent<HTMLButtonElement>) {
    if (!["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)) return;
    e.preventDefault();
    if (open) {
      // The list is open but focus has not moved yet: queue arrows until it does.
      if (e.key === "ArrowDown") pending.current += 1;
      else if (e.key === "ArrowUp") pending.current -= 1;
      return;
    }
    openList();
  }

  function onListKey(e: KeyboardEvent<HTMLUListElement>) {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setActive((a) => Math.min(options.length - 1, a + 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        setActive((a) => Math.max(0, a - 1));
        break;
      case "Home":
        e.preventDefault();
        setActive(0);
        break;
      case "End":
        e.preventDefault();
        setActive(options.length - 1);
        break;
      case "Enter":
      case " ":
        e.preventDefault();
        choose(active);
        break;
      case "Escape":
        e.preventDefault();
        close(true);
        break;
      case "Tab":
        setOpen(false);
        break;
    }
  }

  const preset = reduce ? fadeOnly : popover;

  return (
    <FieldShell id={id} label={label} hint={hint} error={error} disabled={disabled} disabledReason={disabledReason} className={className}>
      <div ref={wrapRef} className="relative">
        <button
          ref={buttonRef}
          id={id}
          type="button"
          disabled={disabled}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={open ? listId : undefined}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(id, Boolean(error), Boolean(hint || (disabled && disabledReason)))}
          onClick={() => (open ? close(false) : openList())}
          onKeyDown={onButtonKey}
          className={cn(fieldBoxClasses({ error: Boolean(error), disabled: Boolean(disabled) }), "flex h-11 items-center justify-between gap-2 text-left")}
        >
          <span className={cn("truncate", !selected && "text-ink-tertiary")}>{selected ? selected.label : placeholder}</span>
          <ChevronDown size={16} className="shrink-0 text-ink-secondary" aria-hidden />
        </button>
        <AnimatePresence>
          {open && (
            <motion.ul
              ref={listRef}
              id={listId}
              role="listbox"
              tabIndex={-1}
              aria-labelledby={id}
              aria-activedescendant={`${id}-opt-${active}`}
              onKeyDown={onListKey}
              initial={preset.initial}
              animate={preset.animate}
              exit={preset.exit}
              className={selectListClasses}
            >
              {options.map((o, i) => {
                const isSelected = o.value === value;
                return (
                  <li
                    key={o.value}
                    id={`${id}-opt-${i}`}
                    data-index={i}
                    role="option"
                    aria-selected={isSelected}
                    onPointerMove={() => setActive(i)}
                    onClick={() => choose(i)}
                    className={cn(
                      "flex min-h-10 cursor-pointer items-center gap-2.5 rounded-sm px-2.5 text-label",
                      isSelected ? "bg-select-wash font-semibold text-select" : "text-ink",
                      i === active && !isSelected && "bg-sunken",
                      i === active && "outline-2 -outline-offset-2 outline-select",
                    )}
                  >
                    <span className="grid w-4 place-items-center">{isSelected && <Check size={16} aria-hidden />}</span>
                    <span className="flex-1">{o.label}</span>
                    {o.hint && <small className="text-small font-normal text-ink-tertiary">{o.hint}</small>}
                  </li>
                );
              })}
            </motion.ul>
          )}
        </AnimatePresence>
      </div>
    </FieldShell>
  );
}
