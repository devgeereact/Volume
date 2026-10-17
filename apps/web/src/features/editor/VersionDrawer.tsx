import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { History, RotateCcw, X } from "lucide-react";
import { Button, IconButton, Select } from "../../components/ui";
import { dur, ease } from "../../lib/motion";
import { formatRelative } from "../../lib/format";
import { useFocusTrap } from "../../lib/useFocusTrap";
import type { MsBlock, MsVersion } from "./manuscript";
import { DiffText } from "./DiffText";
import { useKeyChanged } from "../../lib/useKeyChanged";

interface VersionDrawerProps {
  open: boolean;
  onClose: () => void;
  sectionTitle: string;
  versions: MsVersion[];
  currentBlocks: MsBlock[];
  dirty: boolean;
  initialLeft: number | null;
  onRestore: (version: MsVersion) => void;
  /** A viewer's role: compare only, no restore. */
  readOnly?: boolean | undefined;
  restoredNote: string | null;
  /** "Now" for the relative times (the demo's fixed date when left out). */
  now?: string | undefined;
  /** API mode: draws the two columns from the server (read and diff) instead of the blocks held here. */
  renderCompare?: ((left: string, right: string, nameOf: (key: string) => string) => ReactNode) | undefined;
  /** Restore is running. */
  restoring?: boolean | undefined;
}

const CURRENT = "current";

/**
 * Version history as a drawer from the right: pick any two versions and compare them side by side,
 * removed words struck through and added words underlined in blue pencil. Restore adds a new version.
 */
export function VersionDrawer({
  open,
  onClose,
  sectionTitle,
  versions,
  currentBlocks,
  dirty,
  initialLeft,
  onRestore,
  readOnly,
  restoredNote,
  now,
  renderCompare,
  restoring,
}: VersionDrawerProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const reduce = useReducedMotion();
  const last = versions[versions.length - 1];
  const [left, setLeft] = useState<string>("");
  const [right, setRight] = useState<string>(CURRENT);
  useFocusTrap(panelRef, open, titleRef);

  // Reset the compared versions each time the drawer opens.
  if (useKeyChanged(open) && open) {
    const prev = versions[versions.length - 2];
    setLeft(String(initialLeft ?? (dirty ? last?.number : (prev?.number ?? last?.number)) ?? ""));
    setRight(CURRENT);
  }
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const blocksOf = (key: string): MsBlock[] => (key === CURRENT ? currentBlocks : (versions.find((v) => String(v.number) === key)?.blocks ?? []));
  const nameOf = (key: string) => {
    if (key === CURRENT) return dirty ? "Now, unsaved" : `Now, version ${last?.number ?? 1}`;
    const v = versions.find((x) => String(x.number) === key);
    return v ? `Version ${v.number}, ${v.origin}` : "";
  };
  const leftBlocks = blocksOf(left);
  const rightBlocks = blocksOf(right);
  const pairs = pairBlocks(leftBlocks, rightBlocks);
  const leftVersion = versions.find((v) => String(v.number) === left);
  const options = [
    { value: CURRENT, label: dirty ? "Now (unsaved)" : "Now", hint: "" },
    ...[...versions].reverse().map((v) => ({ value: String(v.number), label: `Version ${v.number}`, hint: v.origin })),
  ];

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[60]">
          <motion.div
            aria-hidden
            className="absolute inset-0"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, transition: { duration: dur.base } }}
            exit={{ opacity: 0, transition: { duration: dur.fast } }}
            onClick={onClose}
          >
            <div className="absolute inset-0 bg-scrim" style={{ opacity: "var(--vol-scrim-opacity)" }} />
          </motion.div>
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="versions-title"
            initial={reduce ? { opacity: 0 } : { x: "100%" }}
            animate={reduce ? { opacity: 1 } : { x: 0, transition: { duration: dur.slow, ease: ease.out } }}
            exit={reduce ? { opacity: 0 } : { x: "100%", transition: { duration: dur.base, ease: ease.in } }}
            className="absolute inset-y-0 right-0 flex w-[min(1040px,100vw)] flex-col bg-raised shadow-modal"
          >
            <header className="flex items-start gap-3 border-b border-border px-5 py-4 sm:px-6">
              <History size={18} aria-hidden className="mt-1 text-ink-secondary" />
              <div className="min-w-0 flex-1">
                <h2 id="versions-title" ref={titleRef} tabIndex={-1} className="font-book text-heading text-ink focus:outline-none">
                  Versions of {sectionTitle}
                </h2>
                <p className="text-small text-ink-secondary">Every save is a version. Restoring adds a new one, so nothing is lost.</p>
              </div>
              <IconButton icon={X} label="Close versions" variant="ghost" onClick={onClose} shortcut={["Esc"]} />
            </header>

            <div className="grid min-h-0 flex-1 grid-cols-1 overflow-y-auto md:grid-cols-[240px_minmax(0,1fr)] md:overflow-hidden">
              <ol aria-label="Version list" className="grid content-start gap-1 border-border p-3 md:overflow-y-auto md:border-r">
                {[...versions].reverse().map((v) => {
                  const selected = String(v.number) === left;
                  return (
                    <li key={v.number}>
                      <button
                        type="button"
                        aria-pressed={selected}
                        onClick={() => setLeft(String(v.number))}
                        className={`grid w-full gap-0.5 rounded-sm px-3 py-2 text-left ${selected ? "vol-pencil-edge bg-select-wash" : "hover:bg-sunken"}`}
                      >
                        <span className={`text-label ${selected ? "text-select" : "text-ink"}`}>
                          Version {v.number}
                          {v.number === last?.number && !dirty ? ", current" : ""}
                        </span>
                        <span className="text-small text-ink-secondary">
                          {v.origin}, {formatRelative(v.at, now)}
                        </span>
                        <span className="text-small text-ink-tertiary">{v.note}</span>
                      </button>
                    </li>
                  );
                })}
              </ol>

              <div className="flex min-h-0 flex-col md:overflow-y-auto">
                <div className="flex flex-wrap items-end gap-3 border-b border-border px-5 py-3 sm:px-6">
                  <Select className="w-[200px]" label="Compare" value={left} onChange={setLeft} options={options} />
                  <Select className="w-[200px]" label="With" value={right} onChange={setRight} options={options} />
                  {leftVersion && !readOnly && (
                    <Button icon={RotateCcw} className="sm:ml-auto" loading={restoring} loadingLabel="Restoring" onClick={() => onRestore(leftVersion)}>
                      Restore version {leftVersion.number}
                    </Button>
                  )}
                </div>
                {restoredNote && (
                  <p role="status" className="mx-5 mt-3 rounded-sm bg-success-wash px-3 py-2 text-small text-success sm:mx-6">
                    {restoredNote}
                  </p>
                )}
                {renderCompare ? (
                  renderCompare(left, right, nameOf)
                ) : (
                  <div className="grid grid-cols-1 gap-4 p-5 sm:p-6 lg:grid-cols-2">
                    <Column title={nameOf(left)} pairs={pairs} side="before" />
                    <Column title={nameOf(right)} pairs={pairs} side="after" />
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

export function Column({ title, pairs, side }: { title: string; pairs: [MsBlock | undefined, MsBlock | undefined][]; side: "before" | "after" }) {
  const changed = pairs.filter(([a, b]) => a?.text !== b?.text).length;
  return (
    <article aria-label={title} className="rounded-lg border border-border bg-sheet px-5 py-6 shadow-sheet sm:px-7">
      <p className="flex justify-between gap-3 text-[12.5px] font-medium text-ink-tertiary">
        <span>{title}</span>
        {side === "after" && <span>{changed === 0 ? "No changes" : `${changed} ${changed === 1 ? "paragraph" : "paragraphs"} changed`}</span>}
      </p>
      <div className="mt-4 grid gap-3 font-book text-prose-sm text-ink">
        {pairs.map(([a, b], i) => {
          const block = side === "before" ? a : b;
          if (!block)
            return (
              <p key={i} className="text-ink-tertiary italic">
                Not in this version.
              </p>
            );
          const Tag = block.kind === "h" ? "h3" : "p";
          return (
            <Tag key={i} className={block.kind === "h" ? "font-ui text-subhead" : undefined}>
              <DiffText before={a?.text ?? ""} after={b?.text ?? ""} show={side} />
            </Tag>
          );
        })}
      </div>
    </article>
  );
}

/** Line up blocks by id (falling back to position) so paragraphs compare with their partner. */
export function pairBlocks(a: MsBlock[], b: MsBlock[]): [MsBlock | undefined, MsBlock | undefined][] {
  const out: [MsBlock | undefined, MsBlock | undefined][] = [];
  const usedB = new Set<string>();
  for (const x of a) {
    const y = b.find((z) => z.id === x.id);
    if (y) usedB.add(y.id);
    out.push([x, y]);
  }
  for (const y of b) if (!usedB.has(y.id)) out.push([undefined, y]);
  return out;
}
