import { useState, type DragEvent } from "react";
import { ArrowDown, ArrowUp, ChevronDown, GripVertical, Lock } from "lucide-react";
import { ClaimFlag, IconButton } from "../../components/ui";
import { cn } from "../../lib/cn";
import { formatNumber } from "../../lib/format";
import { groupLabels, type GroupId, type OutlinePart } from "./blueprintExtras";

interface OutlineRailProps {
  parts: OutlinePart[];
  selectedId: string;
  onSelect: (id: string) => void;
  onToggle: (id: string) => void;
  onMove: (id: string, delta: number) => void;
  onDrop: (id: string, beforeId: string | null) => void;
  /** Part ids with open claims, and how many. */
  claimCounts: Record<string, number>;
  /** Chapter number by part id (only switched-on chapters are numbered). */
  numbers: Record<string, number>;
  locked: boolean;
}

const groups: GroupId[] = ["front", "parts", "chapters", "back", "publishing", "marketing"];

/** Small on and off switch for a rail row: a button with role="switch". */
function RowSwitch({ on, label, onToggle, disabled }: { on: boolean; label: string; onToggle: () => void; disabled: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={onToggle}
      className="hit-44 inline-flex items-center gap-1.5 rounded-pill text-caption text-ink-secondary disabled:cursor-not-allowed"
    >
      <span aria-hidden className="relative h-4 w-7 overflow-hidden rounded-pill bg-sunken shadow-[inset_0_0_0_1px_var(--vol-border-strong)]">
        <span className={cn("absolute inset-0 bg-progress transition-opacity duration-(--vol-dur-fast)", on ? "opacity-100" : "opacity-0")} />
        <span
          className={cn(
            "absolute top-[2px] left-[2px] size-3 rounded-full bg-sheet shadow-[0_1px_2px_rgb(10_12_30_/_0.3)] transition-transform duration-(--vol-dur-base) ease-out",
            on && "translate-x-3",
          )}
        />
      </span>
      {on ? "On" : "Off"}
    </button>
  );
}

/**
 * The blueprint's outline rail: title, summary and audience, then every section of the book in
 * groups. Normal view matches the board (number, title, claim flag, the selected row in blue pencil).
 * Arrange view adds a drag handle, an on and off switch, and Move up and Move down buttons per row.
 */
export function OutlineRail({ parts, selectedId, onSelect, onToggle, onMove, onDrop, claimCounts, numbers, locked }: OutlineRailProps) {
  const [arrange, setArrange] = useState(false);
  const [open, setOpen] = useState<Record<GroupId, boolean>>({ front: false, parts: false, chapters: true, back: false, publishing: false, marketing: false });
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [announce, setAnnounce] = useState("");
  const selected = parts.find((p) => p.id === selectedId);

  function move(p: OutlinePart, delta: number, siblings: OutlinePart[]) {
    const i = siblings.findIndex((s) => s.id === p.id);
    const to = i + delta;
    if (to < 0 || to >= siblings.length) return;
    onMove(p.id, delta);
    setAnnounce(`${p.title} moved to position ${to + 1} of ${siblings.length} in ${groupLabels[p.group].toLowerCase()}.`);
  }

  function dragStart(e: DragEvent, id: string) {
    setDragId(id);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", id);
  }
  function dragOver(e: DragEvent, target: OutlinePart) {
    const dragged = parts.find((p) => p.id === dragId);
    if (!dragged || dragged.group !== target.group) return;
    e.preventDefault();
    setOverId(target.id);
  }
  function drop(e: DragEvent, target: OutlinePart) {
    e.preventDefault();
    if (dragId && dragId !== target.id) {
      onDrop(dragId, target.id);
      const moved = parts.find((p) => p.id === dragId);
      if (moved) setAnnounce(`${moved.title} moved before ${target.title}.`);
    }
    setDragId(null);
    setOverId(null);
  }

  return (
    <nav aria-label="Blueprint outline" className="grid content-start gap-4 px-4 pt-5 pb-8 xl:px-5">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-[13px] font-semibold text-ink-secondary">Outline</h2>
        <button
          type="button"
          aria-pressed={arrange}
          disabled={locked}
          onClick={() => setArrange((a) => !a)}
          className={cn(
            "hit-44 inline-flex h-7 items-center gap-1.5 rounded-pill border px-2.5 text-caption",
            arrange ? "border-select bg-select-wash text-select" : "border-border bg-sheet text-ink-secondary hover:bg-sunken hover:text-ink",
            locked && "cursor-not-allowed opacity-60",
          )}
        >
          {locked ? <Lock size={12} strokeWidth={2} aria-hidden /> : <GripVertical size={12} strokeWidth={2} aria-hidden />}
          Arrange sections
        </button>
      </div>
      {arrange && (
        <p className="-mt-2 text-small text-ink-tertiary">Switch sections on or off. Drag the handle, or use the arrows, to reorder within a group.</p>
      )}

      <div className="grid gap-1">
        <button
          type="button"
          aria-current={selectedId === "overview" ? "true" : undefined}
          onClick={() => onSelect("overview")}
          className={cn(
            "flex w-full items-baseline gap-2.5 rounded-sm px-2.5 py-1.5 text-left text-[13.5px] leading-[18px]",
            selectedId === "overview" ? "vol-pencil-edge bg-select-wash font-semibold text-select" : "text-ink hover:bg-sunken",
          )}
        >
          <span className="w-[18px] shrink-0" />
          Title, summary and audience
        </button>

        {groups.map((g) => {
          const siblings = parts.filter((p) => p.group === g);
          const onCount = siblings.filter((p) => p.on).length;
          const isOpen = open[g] || arrange || selected?.group === g;
          return (
            <section key={g} aria-label={groupLabels[g]} className="grid gap-0.5">
              <button
                type="button"
                aria-expanded={isOpen}
                onClick={() => setOpen((o) => ({ ...o, [g]: !isOpen }))}
                className="flex w-full items-center gap-2.5 rounded-sm px-2.5 py-1.5 text-left text-[13.5px] leading-[18px] text-ink hover:bg-sunken"
              >
                <ChevronDown
                  size={14}
                  strokeWidth={2}
                  aria-hidden
                  className={cn("w-[18px] shrink-0 text-ink-tertiary transition-transform duration-(--vol-dur-fast)", !isOpen && "-rotate-90")}
                />
                <span className="flex-1">{groupLabels[g]}</span>
                <span className="num text-caption font-normal text-ink-tertiary">
                  {onCount} of {siblings.length} on
                </span>
              </button>
              {isOpen && (
                <ul className="grid gap-0.5">
                  {siblings.map((p, i) => {
                    const current = p.id === selectedId;
                    const n = numbers[p.id];
                    const claims = claimCounts[p.id] ?? 0;
                    return (
                      <li
                        key={p.id}
                        onDragOver={arrange ? (e) => dragOver(e, p) : undefined}
                        onDragLeave={arrange ? () => setOverId((o) => (o === p.id ? null : o)) : undefined}
                        onDrop={arrange ? (e) => drop(e, p) : undefined}
                        className={cn(
                          "rounded-sm",
                          overId === p.id && dragId !== p.id && "shadow-[inset_0_2px_0_var(--vol-select)]",
                          dragId === p.id && "opacity-50",
                        )}
                      >
                        <div className="flex items-start gap-1">
                          {arrange && (
                            <span
                              draggable
                              onDragStart={(e) => dragStart(e, p.id)}
                              onDragEnd={() => {
                                setDragId(null);
                                setOverId(null);
                              }}
                              aria-hidden
                              title="Drag to reorder"
                              className="mt-1 grid h-7 w-5 shrink-0 cursor-grab place-items-center rounded-xs text-ink-tertiary hover:bg-sunken active:cursor-grabbing"
                            >
                              <GripVertical size={14} />
                            </span>
                          )}
                          <button
                            type="button"
                            aria-current={current ? "true" : undefined}
                            onClick={() => onSelect(p.id)}
                            className={cn(
                              "flex min-w-0 flex-1 items-baseline gap-2.5 rounded-sm px-2.5 py-1.5 text-left text-[13.5px] leading-[18px]",
                              current
                                ? "vol-pencil-edge bg-select-wash font-semibold text-select"
                                : p.on
                                  ? "text-ink hover:bg-sunken"
                                  : "text-ink-tertiary hover:bg-sunken",
                            )}
                          >
                            <span className={cn("num w-[18px] shrink-0 text-right", current ? "text-select" : "text-ink-tertiary")}>{n ?? ""}</span>
                            <span className={cn("min-w-0 flex-1", !p.on && "line-through decoration-ink-tertiary/60")}>{p.title}</span>
                            {claims > 0 && p.on && <ClaimFlag count={claims} className="ml-auto self-center" />}
                            {!p.on && !arrange && <span className="ml-auto shrink-0 text-caption font-normal text-ink-tertiary">Off</span>}
                            {p.on && !arrange && claims === 0 && p.group !== "chapters" && p.wordTarget !== null && (
                              <span className="num ml-auto shrink-0 text-caption font-normal text-ink-tertiary">{formatNumber(p.wordTarget)}</span>
                            )}
                          </button>
                        </div>
                        {arrange && (
                          <div className="mb-1 ml-[34px] flex items-center gap-1">
                            <RowSwitch on={p.on} label={`Include ${p.title}`} onToggle={() => onToggle(p.id)} disabled={locked} />
                            <span className="ml-auto flex gap-0.5">
                              <IconButton icon={ArrowUp} size="sm" label={`Move ${p.title} up`} disabled={i === 0} onClick={() => move(p, -1, siblings)} />
                              <IconButton
                                icon={ArrowDown}
                                size="sm"
                                label={`Move ${p.title} down`}
                                disabled={i === siblings.length - 1}
                                onClick={() => move(p, 1, siblings)}
                              />
                            </span>
                          </div>
                        )}
                        {current && !arrange && p.chapter && p.chapter.subheadings.length > 0 && (
                          <ul className="mt-0.5 mb-1.5 ml-[38px] grid gap-1 border-l border-border pl-2.5 text-[12.5px] leading-[17px] text-ink-secondary">
                            {p.chapter.subheadings.map((s) => (
                              <li key={s}>{s}</li>
                            ))}
                          </ul>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          );
        })}
      </div>
      <p className="sr-only" role="status" aria-live="polite">
        {announce}
      </p>
    </nav>
  );
}
