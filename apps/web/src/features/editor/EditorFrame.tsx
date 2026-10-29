import { useState, type ReactNode } from "react";
import { Focus, Redo2, Replace, Search, Undo2 } from "lucide-react";
import { Kbd, modKey } from "../../components/ui";
import { cn } from "../../lib/cn";
import { formatNumber } from "../../lib/format";
import { glassCard, stepBody, studioGrid, studioSide } from "../writing/studio";
import { runHistory } from "./EditorCanvas";

/* The Editor in the approved design (.editor-g): the manuscript list, the page card with its toolbar and
   status line, and the side card with the Style, Claims, AI edits and Notes tabs. Focus mode hides both
   side cards. Shared by the demo editor and the server editor. */

/** The three cards. In focus mode only the page shows; the side cards stay mounted, so nothing typed in them is lost. */
export function EditorFrame({ head, focus, tree, side, children }: { head: ReactNode; focus: boolean; tree: ReactNode; side: ReactNode; children: ReactNode }) {
  return (
    <div className={cn(stepBody, "grid gap-4")}>
      {head}
      <div className={focus ? "grid grid-cols-1 items-start gap-4" : studioGrid}>
        <div className={cn("min-w-0", focus && "hidden")}>{tree}</div>
        {children}
        <div className={cn(studioSide, focus && "hidden")}>{side}</div>
      </div>
    </div>
  );
}

/** The page card (.ed): toolbar, page, status line. */
export function EditorPageCard({ toolbar, status, children }: { toolbar: ReactNode; status: ReactNode; children: ReactNode }) {
  return (
    <section aria-label="Chapter" className={cn(glassCard, "flex min-w-0 flex-col overflow-clip")}>
      {toolbar}
      <div className="min-w-0 flex-1">{children}</div>
      {status}
    </section>
  );
}

const tool =
  "inline-flex h-8 min-w-8 shrink-0 items-center justify-center gap-1.5 rounded-[8px] px-2 text-[13px] font-medium text-ink-2 hover:bg-panel hover:text-ink aria-disabled:cursor-not-allowed aria-disabled:opacity-50 aria-disabled:hover:bg-transparent";

/**
 * A toolbar button. Mouse clicks keep the caret in the text, so Undo and Redo act where you were typing.
 * A button that cannot run stays focusable and says why in its tooltip (disabledReason).
 */
export function ToolButton({
  icon: Icon,
  label,
  onClick,
  pressed,
  disabledReason,
  keys,
  showLabel = false,
  children,
}: {
  icon: typeof Undo2;
  label: string;
  onClick: () => void;
  pressed?: boolean | undefined;
  /** Why it cannot run now; the button stays focusable and does nothing. */
  disabledReason?: string | undefined;
  keys?: string | undefined;
  /** Show the label beside the icon when the toolbar is at least 700 px wide (screen readers always get it). */
  showLabel?: boolean | undefined;
  children?: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={showLabel ? undefined : label}
      title={disabledReason ?? (keys ? `${label} (${keys})` : label)}
      aria-pressed={pressed}
      aria-disabled={disabledReason ? true : undefined}
      onMouseDown={(e) => e.preventDefault()}
      onClick={disabledReason ? undefined : onClick}
      className={cn(tool, pressed && "bg-mint-wash font-semibold text-mint-ink hover:bg-mint-wash hover:text-mint-ink")}
    >
      <Icon size={16} strokeWidth={1.8} aria-hidden />
      {showLabel && <span className="sr-only @min-[700px]/edtb:not-sr-only">{label}</span>}
      {children}
    </button>
  );
}

export function ToolSep() {
  return <span aria-hidden className="mx-1 h-5 w-px shrink-0 bg-line-2" />;
}

interface ToolbarProps {
  /** Find in this section: the query, and the "2 of 5" line beside it. */
  query: string;
  onQuery: (q: string) => void;
  matchText: string | null;
  onStep: (dir: 1 | -1) => void;
  /** Opens find and replace (match case, whole word, whole book, replace). */
  onReplace: () => void;
  replaceOpen: boolean;
  focus: boolean;
  onFocus: () => void;
  /** The screen's own tools: Add note, Versions, Save version. */
  children?: ReactNode;
  readOnly?: boolean | undefined;
}

/**
 * The page card's toolbar (.ed-tb): Undo and Redo from TipTap's history, find with highlights in the text,
 * find and replace, the screen's tools and Focus. It sticks under the step bar while the page scrolls.
 */
export function EditorToolbar({ query, onQuery, matchText, onStep, onReplace, replaceOpen, focus, onFocus, children, readOnly }: ToolbarProps) {
  const [hint, setHint] = useState("");
  function history(cmd: "undo" | "redo") {
    setHint(runHistory(cmd) ? "" : "Click in the text first, then undo or redo there.");
  }
  return (
    <div
      role="toolbar"
      aria-label="Editor tools"
      className="@container/edtb sticky top-(--shell-sticky-top) z-[4] flex flex-wrap items-center gap-0.5 border-b border-line bg-panel-2-solid/90 px-2 py-1.5 backdrop-blur-md"
    >
      {!readOnly && (
        <>
          <ToolButton icon={Undo2} label="Undo" keys={`${modKey()} Z`} onClick={() => history("undo")} />
          <ToolButton icon={Redo2} label="Redo" keys={`${modKey()} Shift Z`} onClick={() => history("redo")} />
          <ToolSep />
        </>
      )}
      {children}
      <span className="flex-1" />
      <label className="inline-flex h-[30px] items-center gap-1.5 rounded-[10px] border border-line-2 bg-panel-2 px-2.5 text-ink-3 focus-within:border-mint focus-within:shadow-[0_0_0_3px_var(--vol-mint-wash)] @max-[459px]/edtb:hidden">
        <Search size={15} strokeWidth={1.8} aria-hidden />
        <input
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              onStep(e.shiftKey ? -1 : 1);
            } else if (e.key === "Escape" && query) {
              e.preventDefault();
              onQuery("");
            }
          }}
          placeholder="Find"
          aria-label="Find in this section"
          autoComplete="off"
          className="w-24 min-w-0 border-0 bg-transparent text-[13px] text-ink outline-none placeholder:text-ink-3"
        />
        <small aria-live="polite" className="num text-[11.5px] whitespace-nowrap text-ink-2">
          {matchText}
        </small>
      </label>
      <ToolButton icon={Replace} label="Find and replace" keys={`${modKey()} F`} pressed={replaceOpen} onClick={onReplace} />
      <ToolButton icon={Focus} label="Focus" pressed={focus} showLabel onClick={onFocus} />
      {hint && (
        <p role="status" className="basis-full px-1 pt-1 text-[12px] text-ink-3">
          {hint}
        </p>
      )}
    </div>
  );
}

/** The page card's status line (.ed-st): words, reading time, the save state and the save shortcut. */
export function EditorStatus({ words, children }: { words: number; children: ReactNode }) {
  return (
    <div className="sticky bottom-0 z-[3] flex flex-wrap items-center gap-x-3.5 gap-y-1 border-t border-line bg-panel-2-solid/90 px-4 py-2 text-[12px] text-ink-3 backdrop-blur-md">
      <span className="num">{formatNumber(words)} words in this part</span>
      <span className="num max-[560px]:hidden">About {Math.max(1, Math.round(words / 230))} min to read</span>
      <span className="flex-1" />
      {children}
      <Kbd keys={[modKey(), "S"]} className="max-[560px]:hidden" />
    </div>
  );
}
