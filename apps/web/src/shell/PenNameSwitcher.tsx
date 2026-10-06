import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Check, ChevronDown } from "lucide-react";
import { profileBookCount, useApiBooks, usePenNames, useWireMode } from "../api/wire-a";
import { booksForPenName } from "../data/books";
import { penNames } from "../data/penNames";
import { cn } from "../lib/cn";
import { fadeOnly, popover } from "../lib/motion";
import { usePenNameFilter } from "../lib/penName";

/** Avatar circle in gilt with initials (spine). */
export function Avatar({ initials, className }: { initials: string; className?: string | undefined }) {
  return (
    <span
      aria-hidden
      className={cn("grid size-7 shrink-0 place-items-center rounded-full bg-accent text-[11px] leading-none font-bold text-on-accent", className)}
    >
      {initials}
    </span>
  );
}

interface SwitcherOption {
  id: string | null;
  name: string;
  initials: string;
  count: number;
}

/** All profiles, then each profile with its book count: the server's in API mode, the demo's otherwise. */
function useSwitcherOptions(): { options: SwitcherOption[]; ready: boolean } {
  const mode = useWireMode();
  const api = mode === "api";
  const pens = usePenNames(mode, penNames);
  const books = useApiBooks(api);
  if (!api)
    return {
      ready: mode === "mock",
      options: [
        { id: null, name: "All profiles", initials: "All", count: mode === "mock" ? booksForPenName(null).length : 0 },
        ...(mode === "mock" ? penNames.map((p) => ({ id: p.id, name: p.name, initials: p.initials, count: booksForPenName(p.id).length })) : []),
      ],
    };
  const all = books.data?.length ?? pens.raw.reduce((n, p) => n + (p.status === "archived" ? 0 : (profileBookCount(p) ?? 0)), 0);
  return {
    ready: pens.state === "ready",
    options: [
      { id: null, name: "All profiles", initials: "All", count: all },
      ...pens.list.map((p) => {
        const raw = pens.raw.find((r) => r.id === p.id);
        const fromList = books.data?.filter((b) => b.profileId === p.id).length;
        return { id: p.id, name: p.name, initials: p.initials, count: (raw ? profileBookCount(raw) : null) ?? fromList ?? 0 };
      }),
    ],
  };
}

/**
 * Pen name switcher on the spine. A button that opens a listbox: All pen names, then each pen name
 * with its book count. Arrow keys, Home, End, Enter and Escape work; focus returns to the button.
 * With the server running it lists the server's profiles, so Library and Published filter by their ids.
 */
export function PenNameSwitcher() {
  const { selectedId, setSelectedId } = usePenNameFilter();
  const reduce = useReducedMotion();
  const id = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const { options, ready } = useSwitcherOptions();
  // A profile id from the other data source (demo or server) means nothing here: go back to All.
  useEffect(() => {
    if (ready && selectedId && !options.some((o) => o.id === selectedId)) setSelectedId(null);
  }, [ready, selectedId, options, setSelectedId]);
  const selectedIndex = Math.max(
    0,
    options.findIndex((o) => o.id === selectedId),
  );
  const current = options[selectedIndex] ?? options[0];

  useEffect(() => {
    if (open) requestAnimationFrame(() => listRef.current?.focus());
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  function openList() {
    setActive(selectedIndex);
    setOpen(true);
  }
  function choose(i: number) {
    const o = options[i];
    if (!o) return;
    setSelectedId(o.id);
    setOpen(false);
    buttonRef.current?.focus();
  }
  function onListKey(e: KeyboardEvent<HTMLUListElement>) {
    if (e.key === "ArrowDown") setActive((a) => Math.min(options.length - 1, a + 1));
    else if (e.key === "ArrowUp") setActive((a) => Math.max(0, a - 1));
    else if (e.key === "Home") setActive(0);
    else if (e.key === "End") setActive(options.length - 1);
    else if (e.key === "Enter" || e.key === " ") choose(active);
    else if (e.key === "Escape") {
      setOpen(false);
      buttonRef.current?.focus();
    } else if (e.key === "Tab") {
      setOpen(false);
      return;
    } else return;
    e.preventDefault();
  }

  const preset = reduce ? fadeOnly : popover;

  return (
    <div ref={wrapRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? `${id}-list` : undefined}
        aria-label={`Profile: ${current?.name ?? "All profiles"}. Change profile`}
        onClick={() => (open ? setOpen(false) : openList())}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            openList();
          }
        }}
        className="flex min-h-[52px] w-full items-center gap-3 rounded-md bg-spine-raised px-3 py-2 text-left text-ink-on-spine"
      >
        <Avatar initials={current?.initials ?? "All"} />
        <span className="min-w-0 flex-1">
          <b className="block truncate text-[14px] leading-[18px] font-semibold">{current?.name}</b>
          <small className="block text-[12.5px] leading-4 text-ink-on-spine-muted">
            {current?.count} {current?.count === 1 ? "book" : "books"}
          </small>
        </span>
        <ChevronDown size={16} className="text-ink-on-spine-muted" aria-hidden />
      </button>
      <AnimatePresence>
        {open && (
          <motion.ul
            ref={listRef}
            id={`${id}-list`}
            role="listbox"
            tabIndex={-1}
            aria-label="Profiles"
            aria-activedescendant={`${id}-opt-${active}`}
            onKeyDown={onListKey}
            initial={preset.initial}
            animate={preset.animate}
            exit={preset.exit}
            className="absolute top-full right-0 left-0 z-40 mt-1.5 grid gap-0.5 rounded-md border border-border bg-raised p-1.5 text-ink shadow-pop outline-none"
          >
            {options.map((o, i) => {
              const selected = i === selectedIndex;
              return (
                <li
                  key={o.id ?? "all"}
                  id={`${id}-opt-${i}`}
                  role="option"
                  aria-selected={selected}
                  onPointerMove={() => setActive(i)}
                  onClick={() => choose(i)}
                  className={cn(
                    "flex min-h-10 cursor-pointer items-center gap-2.5 rounded-sm px-2 text-[14px]",
                    selected ? "bg-select-wash font-semibold text-select" : "",
                    i === active && !selected && "bg-sunken",
                    i === active && "outline-2 -outline-offset-2 outline-select",
                  )}
                >
                  <span className="grid w-4 place-items-center">{selected && <Check size={16} aria-hidden />}</span>
                  <span className="flex-1 truncate">{o.name}</span>
                  <small className="num text-small font-normal text-ink-tertiary">{o.count}</small>
                </li>
              );
            })}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}
