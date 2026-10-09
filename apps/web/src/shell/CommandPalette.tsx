import { Fragment, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useLocation, useNavigate } from "react-router";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { LucideIcon } from "lucide-react";
import { BookOpen, BookSearch, Component, FileArchive, Moon, Pause, Play, Search, Sun, TextSearch, UserPlus } from "lucide-react";
import { useBook as useServerBook } from "../api/hooks";
import { apiErrorText, downloadProjectFile, useWireMode } from "../api/wire-a";
import { useToast } from "../lib/toast";
import { Kbd } from "../components/ui/Kbd";
import { bookSteps, books, currentStep, getBook } from "../demo/books";
import { getPenName } from "../demo/penNames";
import { cn } from "../lib/cn";
import { useCommandPalette } from "../lib/commandPalette";
import { useWritingJob } from "../lib/job";
import { dialog, fadeOnly, scrim } from "../lib/motion";
import { useTheme } from "../lib/theme";
import { useFocusTrap } from "../lib/useFocusTrap";
import { bookStepPath, globalNav, stepScreens } from "../screens";
import { useKeyChanged } from "../lib/useKeyChanged";

const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

interface Command {
  id: string;
  group: string;
  label: string;
  hint?: string | undefined;
  icon: LucideIcon;
  keywords?: string | undefined;
  run: () => void;
}

/** Wrap matches of the query in <mark> (pencil, bold). */
function highlight(text: string, q: string): ReactNode {
  if (!q) return text;
  const lower = text.toLowerCase();
  const out: ReactNode[] = [];
  let i = 0;
  let k = 0;
  while (i < text.length) {
    const at = lower.indexOf(q, i);
    if (at < 0) {
      out.push(text.slice(i));
      break;
    }
    if (at > i) out.push(text.slice(i, at));
    out.push(
      <mark key={k++} className="bg-transparent font-bold text-select">
        {text.slice(at, at + q.length)}
      </mark>,
    );
    i = at + q.length;
  }
  return out;
}

/**
 * Command menu (Cmd K or Ctrl K). Our own combobox and listbox: the input keeps focus and
 * aria-activedescendant points at the highlighted option, which follows the arrow keys and pointer
 * movement. Enter runs, Escape closes and focus returns to where it was. The result count is announced.
 */
export function CommandPalette() {
  const { open, setOpen } = useCommandPalette();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { theme, setTheme } = useTheme();
  const job = useWritingJob();
  const reduce = useReducedMotion();
  const id = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  useFocusTrap(panelRef, open, inputRef);

  const bookInView = getBook(pathname.split("/")[2]);
  const onEditor = /^\/books\/[^/]+\/editor(\/|$)/.test(pathname);
  const api = useWireMode() === "api";
  const toast = useToast();
  const urlBookId = pathname.split("/")[1] === "books" ? pathname.split("/")[2] : undefined;
  const serverBookId = api && urlBookId && urlBookId !== "new" && !bookInView ? urlBookId : undefined;
  const serverBook = useServerBook(serverBookId).data;

  const commands = useMemo<Command[]>(() => {
    const go = (to: string) => () => void navigate(to);
    const list: Command[] = [];
    if (onEditor) {
      // The editor listens for Cmd F and Cmd Shift F on window (features/editor/EditorPage.tsx); send the same keys.
      // Wait a frame so the menu has closed and handed focus back before the find bar opens.
      const find = (book: boolean) => () =>
        requestAnimationFrame(() =>
          window.dispatchEvent(
            new KeyboardEvent("keydown", { key: "f", code: "KeyF", metaKey: isMac, ctrlKey: !isMac, shiftKey: book, bubbles: true, cancelable: true }),
          ),
        );
      list.push({
        id: "find-section",
        group: "Editor",
        label: "Find in this chapter",
        hint: isMac ? "Cmd F" : "Ctrl F",
        icon: TextSearch,
        keywords: "search replace",
        run: find(false),
      });
      list.push({
        id: "find-book",
        group: "Editor",
        label: "Find across the book",
        hint: isMac ? "Cmd Shift F" : "Ctrl Shift F",
        icon: BookSearch,
        keywords: "search replace",
        run: find(true),
      });
    }
    if (serverBook) {
      const title = serverBook.title ?? "Untitled book";
      list.push({
        id: "export-project",
        group: title,
        label: "Export project file",
        hint: "A .zip to move or keep this book",
        icon: FileArchive,
        keywords: "download backup zip move",
        run: () => {
          downloadProjectFile(serverBook.id, title).then(
            (name) => toast.show({ tone: "success", title: "Project file ready", body: `${name} is in your downloads.` }),
            (e: unknown) => toast.show({ tone: "error", title: "Project file not made", body: apiErrorText(e) }),
          );
        },
      });
    }
    if (bookInView) {
      for (const s of bookSteps) {
        list.push({
          id: `step-${s.id}`,
          group: bookInView.title,
          label: stepScreens[s.id].title,
          icon: stepScreens[s.id].icon,
          run: go(bookStepPath(bookInView.id, s.id)),
        });
      }
    }
    for (const s of globalNav) {
      list.push({ id: `go-${s.id}`, group: "Go to", label: s.title, icon: s.icon, keywords: s.purpose, run: go(s.id === "settings" ? "/settings" : s.path) });
    }
    list.push({ id: "go-components", group: "Go to", label: "Components", hint: "Style guide", icon: Component, run: go("/components") });
    for (const b of books) {
      list.push({
        id: `book-${b.id}`,
        group: "Books",
        label: b.title,
        hint: getPenName(b.penNameId)?.name,
        icon: BookOpen,
        keywords: b.subtitle,
        run: go(bookStepPath(b.id, currentStep(b))),
      });
    }
    list.push({ id: "add-pen", group: "Actions", label: "Add profile", icon: UserPlus, run: go("/profiles/new") });
    list.push({
      id: "theme",
      group: "Actions",
      label: theme === "dark" ? "Switch to light theme" : "Switch to dark theme",
      icon: theme === "dark" ? Sun : Moon,
      run: () => setTheme(theme === "dark" ? "light" : "dark"),
    });
    if (job.running) {
      list.push({
        id: "job",
        group: "Actions",
        label: job.paused ? "Resume writing" : "Pause writing",
        hint: job.job.label.replace("Writing ", ""),
        icon: job.paused ? Play : Pause,
        run: job.paused ? job.resume : job.pause,
      });
    }
    return list;
  }, [bookInView, serverBook, toast, onEditor, navigate, theme, setTheme, job]);

  const q = query.trim().toLowerCase();
  const results = useMemo(
    () => (q ? commands.filter((c) => `${c.label} ${c.hint ?? ""} ${c.keywords ?? ""} ${c.group}`.toLowerCase().includes(q)) : commands),
    [commands, q],
  );
  const groups = useMemo(() => {
    const map = new Map<string, Command[]>();
    for (const c of results) map.set(c.group, [...(map.get(c.group) ?? []), c]);
    return [...map.entries()];
  }, [results]);

  // Focus the input in the same commit that opens the menu, so keys typed straight after Cmd K are
  // never lost (the focus trap's own focus waits a frame). Clear the query on close, not on open, for
  // the same reason.
  useLayoutEffect(() => {
    if (open) inputRef.current?.focus({ preventScroll: true });
  }, [open]);
  if (!open && (query !== "" || active !== 0)) {
    setQuery("");
    setActive(0);
  }
  const queryChanged = useKeyChanged(q);
  if (queryChanged && active !== 0) setActive(0);
  useEffect(() => {
    if (!open) return;
    const onEsc = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [open, setOpen]);
  useEffect(() => {
    if (!open) return;
    document.getElementById(`${id}-opt-${active}`)?.scrollIntoView({ block: "nearest" });
  }, [active, open, id]);

  function run(c: Command | undefined) {
    if (!c) return;
    setOpen(false);
    c.run();
  }

  function onKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => (results.length ? (a + 1) % results.length : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => (results.length ? (a - 1 + results.length) % results.length : 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      run(results[active]);
    }
  }

  const panel = reduce ? fadeOnly : dialog;
  const back = reduce ? fadeOnly : scrim;
  let index = -1;

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[65] flex justify-center px-4 pt-[min(12vh,96px)]">
          <motion.div aria-hidden className="absolute inset-0" initial={back.initial} animate={back.animate} exit={back.exit} onClick={() => setOpen(false)}>
            <div className="absolute inset-0 bg-scrim" style={{ opacity: "calc(var(--vol-scrim-opacity) * 0.6)" }} />
          </motion.div>
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label="Command menu"
            initial={panel.initial}
            animate={panel.animate}
            exit={panel.exit}
            className="relative flex h-fit max-h-[min(560px,calc(100dvh-120px))] w-full max-w-[540px] flex-col overflow-hidden rounded-lg bg-raised shadow-modal"
          >
            <div className="flex h-[52px] shrink-0 items-center gap-2.5 border-b border-border px-4">
              <Search size={16} className="text-ink-tertiary" aria-hidden />
              <input
                ref={inputRef}
                role="combobox"
                aria-expanded="true"
                aria-controls={`${id}-list`}
                aria-autocomplete="list"
                aria-activedescendant={results.length ? `${id}-opt-${active}` : undefined}
                aria-label="Search books, screens and actions"
                placeholder="Search books, screens and actions"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onKey}
                className="min-w-0 flex-1 bg-transparent text-[15px] text-ink outline-none placeholder:text-ink-tertiary focus-visible:outline-none"
              />
              <span className="num shrink-0 text-[12.5px] text-ink-tertiary" aria-hidden>
                {results.length} {results.length === 1 ? "result" : "results"}
              </span>
            </div>
            <span className="sr-only" role="status" aria-live="polite">
              {q ? `${results.length} ${results.length === 1 ? "result" : "results"}` : ""}
            </span>
            <div ref={listRef} id={`${id}-list`} role="listbox" aria-label="Commands" className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-1.5">
              {results.length === 0 && (
                <p className="px-3 py-6 text-center text-body text-ink-secondary">Nothing matches "{query}". Try a book title or a screen name.</p>
              )}
              {groups.map(([group, items]) => (
                <Fragment key={group}>
                  <div role="group" aria-labelledby={`${id}-g-${group}`}>
                    <p id={`${id}-g-${group}`} className="px-2.5 pt-3 pb-1.5 text-caption font-semibold text-ink-tertiary">
                      {group}
                    </p>
                    {items.map((c) => {
                      index += 1;
                      const i = index;
                      const selected = i === active;
                      const Icon = c.icon;
                      return (
                        <div
                          key={c.id}
                          id={`${id}-opt-${i}`}
                          role="option"
                          aria-selected={selected}
                          onPointerMove={() => setActive(i)}
                          onClick={() => run(c)}
                          className={cn(
                            "relative flex h-11 cursor-pointer items-center gap-3 rounded-sm px-2.5 text-[14px] text-ink",
                            selected && "vol-pencil-edge bg-select-wash",
                          )}
                        >
                          <Icon size={16} className="shrink-0 text-ink-secondary" aria-hidden />
                          <span className="truncate">{highlight(c.label, q)}</span>
                          {c.hint && <small className="truncate text-[13px] text-ink-tertiary">{highlight(c.hint, q)}</small>}
                          {selected && <Kbd keys={["↵"]} className="ml-auto" />}
                        </div>
                      );
                    })}
                  </div>
                </Fragment>
              ))}
            </div>
            <div className="flex shrink-0 gap-4 border-t border-border px-4 py-2.5 text-[12.5px] text-ink-tertiary" aria-hidden>
              <span className="inline-flex items-center gap-1.5">
                <Kbd keys={["↑", "↓"]} /> move
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Kbd keys={["↵"]} /> run
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Kbd keys={["esc"]} /> close
              </span>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
