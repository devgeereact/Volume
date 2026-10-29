import { useRef, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import { AlignCenter, AlignLeft, AlignRight, ArrowDown, ArrowUp, CaseUpper, Minus, Plus } from "lucide-react";
import type { CoverDesign } from "../../demo";
import { cn } from "../../lib/cn";
import { dragTop, NUDGE, nudgeTop, SCALE_MAX, SCALE_MIN, TITLE_SIZE_MAX, TITLE_SIZE_MIN, TOP_MAX, type CoverPart, type PartAlign } from "./coverEdit";
import { partBoxes } from "./concepts";

/* Edit the cover where you see it: click the title, subtitle or author to select it, then use the toolbar or drag it
   up and down. Plain pointer events; arrow keys move the focused line. The numbers feed the same typography the
   build uses (see coverEdit.ts), so the preview and the built cover agree. */

export const PART_NAME: Record<CoverPart, string> = { title: "title", subtitle: "subtitle", author: "author name" };

/** The alignment a line actually has: its own, else the cover's, else left. */
export const alignOfPart = (d: CoverDesign, part: CoverPart): PartAlign =>
  (part === "title" ? d.titleAlign : part === "subtitle" ? d.subtitleAlign : d.authorAlign) ?? d.align ?? "left";

/** Where the lines really are, measured from the page the build renders (see CoverFrame), and the page's height. */
export interface LiveCover {
  boxes: Record<CoverPart, { top: number; height: number } | null>;
  unitsH: number;
}

export interface CoverEditHandlers {
  onSelect: (part: CoverPart | null) => void;
  onAlign: (part: CoverPart, align: PartAlign) => void;
  /** Move a line to an exact top, in cover-width units. */
  onTop: (part: CoverPart, top: number) => void;
  onSmaller: (part: CoverPart) => void;
  onLarger: (part: CoverPart) => void;
  onUppercase: (on: boolean) => void;
}

/** A cover preview whose title, subtitle and author can be selected and dragged. `children` is the drawn cover. */
export function CoverEditor({
  design,
  subtitle,
  width,
  selected,
  disabled,
  children,
  live,
  locked = [],
  overlay,
  ...handlers
}: CoverEditHandlers & {
  live?: LiveCover | undefined;
  /** Parts the owner locked: they can be selected but not moved. */
  locked?: readonly CoverPart[] | undefined;
  /** Drawn over the cover, under the handles (guides). */
  overlay?: ReactNode;
  design: CoverDesign;
  subtitle: string | undefined;
  width: number;
  selected: CoverPart | null;
  disabled?: boolean;
  children: ReactNode;
}) {
  const boxes = live?.boxes ?? partBoxes(design, subtitle);
  const units = live?.unitsH ?? TOP_MAX;
  const area = useRef<HTMLDivElement>(null);
  const drag = useRef<{ y: number; top: number } | null>(null);

  function hit(part: CoverPart) {
    const box = boxes[part];
    if (!box) return null;
    const on = selected === part;
    const fixed = locked.includes(part);
    const height = Math.max(box.height, 7);
    const startDrag = (e: PointerEvent<HTMLButtonElement>) => {
      if (e.button !== 0 || disabled) return;
      handlers.onSelect(part);
      if (fixed) return;
      e.currentTarget.setPointerCapture(e.pointerId);
      drag.current = { y: e.clientY, top: box.top };
    };
    const move = (e: PointerEvent<HTMLButtonElement>) => {
      const start = drag.current;
      const h = area.current?.getBoundingClientRect().height ?? 0;
      if (start && Math.abs(e.clientY - start.y) > 2) handlers.onTop(part, dragTop(start.top, e.clientY - start.y, h, units));
    };
    const end = (e: PointerEvent<HTMLButtonElement>) => {
      drag.current = null;
      if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    };
    const key = (e: KeyboardEvent<HTMLButtonElement>) => {
      if (disabled) return;
      if (e.key === "ArrowUp" || e.key === "ArrowDown") {
        e.preventDefault();
        handlers.onSelect(part);
        if (!fixed) handlers.onTop(part, nudgeTop(box.top, e.key === "ArrowUp" ? -1 : 1, e.shiftKey ? 10 * NUDGE : NUDGE));
      } else if (e.key === "Escape" && on) handlers.onSelect(null);
    };
    return (
      <button
        key={part}
        type="button"
        aria-pressed={on}
        aria-label={`Edit the ${PART_NAME[part]}${on ? (fixed ? " (selected, locked)" : " (selected). Arrow up and down move it") : ""}`}
        disabled={disabled}
        onClick={() => handlers.onSelect(part)}
        onPointerDown={startDrag}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
        onKeyDown={key}
        style={{ top: `${(box.top / units) * 100}%`, height: `${(height / units) * 100}%`, touchAction: "none" }}
        className={cn(
          "absolute inset-x-[4%] rounded-xs bg-transparent",
          fixed ? "cursor-pointer" : "cursor-grab active:cursor-grabbing",
          "outline-offset-2 hover:outline-1 hover:outline-dashed hover:outline-select focus-visible:outline-2 focus-visible:outline-select",
          on && "outline-2 outline-select",
        )}
      />
    );
  }

  return (
    <div className="relative" style={{ width }}>
      {children}
      {overlay}
      <div ref={area} className="absolute inset-0 z-[6]">
        {hit("title")}
        {hit("subtitle")}
        {hit("author")}
      </div>
    </div>
  );
}

const tool =
  "inline-flex h-9 min-w-9 items-center justify-center gap-1.5 rounded-[10px] border border-line-2 bg-panel-2 px-2.5 text-[12.5px] font-medium text-ink " +
  "hover:bg-soft aria-pressed:border-mint aria-pressed:bg-mint-wash aria-pressed:font-semibold aria-pressed:text-mint-ink " +
  "disabled:cursor-not-allowed disabled:text-ink-disabled disabled:hover:bg-panel-2";

const sectionTitle = "text-[10.5px] font-bold tracking-[.09em] text-ink-3 uppercase";

/**
 * The inspector controls for the selected line: type (size, alignment, capitals for the title) and position (move up
 * and down). `children` goes at the top of the type section (the title font, where the studio offers one).
 */
export function CoverToolbar({
  part,
  design,
  subtitle,
  titleSizePct,
  onAlign,
  onTop,
  onSmaller,
  onLarger,
  onUppercase,
  live,
  locked = false,
  children,
}: Omit<CoverEditHandlers, "onSelect"> & {
  part: CoverPart;
  design: CoverDesign;
  subtitle: string | undefined;
  titleSizePct: number;
  /** Read from the page the build renders: the line's real position and alignment, the title's real size and case. */
  live?: { top: number; align: PartAlign; uppercase: boolean; titleSize: number } | undefined;
  /** Locked lines keep their place: the move buttons are off. */
  locked?: boolean | undefined;
  children?: ReactNode;
}) {
  const name = PART_NAME[part];
  const top = live?.top ?? partBoxes(design, subtitle)[part]?.top ?? 0;
  const align = live?.align ?? alignOfPart(design, part);
  const uppercase = live?.uppercase ?? design.titleUppercase;
  const scale = part === "subtitle" ? (design.subtitleScale ?? 1) : (design.authorScale ?? 1);
  const atSmallest = part === "title" ? titleSizePct <= TITLE_SIZE_MIN : scale <= SCALE_MIN + 0.001;
  const atLargest = part === "title" ? titleSizePct >= TITLE_SIZE_MAX : scale >= SCALE_MAX - 0.001;
  const aligns: { value: PartAlign; label: string; Icon: typeof AlignLeft }[] = [
    { value: "left", label: "Align left", Icon: AlignLeft },
    { value: "center", label: "Align centre", Icon: AlignCenter },
    { value: "right", label: "Align right", Icon: AlignRight },
  ];
  const sizeText = part === "title" ? `${titleSizePct}%` : `${Math.round(scale * 100)}%`;
  return (
    <div role="toolbar" aria-label={`Edit the ${name}`} className="contents">
      <section className="grid min-w-0 gap-2.5 border-t border-line py-3.5" aria-label="Type">
        <h3 className={sectionTitle}>Type</h3>
        {children}
        <div className="grid gap-1.5">
          <p className="flex items-baseline justify-between text-[12.5px] text-ink-2">
            Size <output className="num font-semibold text-ink">{sizeText}</output>
          </p>
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              aria-label={`Make the ${name} smaller`}
              title="Smaller"
              className={tool}
              disabled={atSmallest}
              onClick={() => onSmaller(part)}
            >
              <Minus size={15} aria-hidden />
              <span>Smaller</span>
            </button>
            <button type="button" aria-label={`Make the ${name} larger`} title="Larger" className={tool} disabled={atLargest} onClick={() => onLarger(part)}>
              <Plus size={15} aria-hidden />
              <span>Larger</span>
            </button>
          </div>
          {part === "title" && live && live.titleSize > 0 && (
            <p className="num text-[12px] text-ink-2" data-testid="title-size-readout">
              Title size {titleSizePct}% of the design's, which is {live.titleSize.toFixed(1)} on the page (cover width is 100).
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div role="group" aria-label="Align" className="inline-flex h-10 gap-0.5 rounded-md border border-edge bg-soft p-[3px]">
            {aligns.map(({ value, label, Icon }) => (
              <button
                key={value}
                type="button"
                aria-pressed={align === value}
                aria-label={`${label} (${name})`}
                title={label}
                className={cn(
                  "inline-grid w-9 place-items-center rounded-sm text-ink-2 hover:text-ink",
                  align === value && "bg-panel-2 text-ink shadow-segment",
                )}
                onClick={() => onAlign(part, value)}
              >
                <Icon size={15} aria-hidden />
              </button>
            ))}
          </div>
          {part === "title" && (
            <button type="button" aria-pressed={uppercase} className={tool} onClick={() => onUppercase(!uppercase)}>
              <CaseUpper size={15} aria-hidden />
              <span>Capital letters</span>
            </button>
          )}
        </div>
      </section>
      <section className="grid min-w-0 gap-2.5 border-t border-line py-3.5" aria-label="Position">
        <h3 className={sectionTitle}>Position</h3>
        <p className="flex items-baseline justify-between text-[12.5px] text-ink-2">
          From the top <output className="num font-semibold text-ink">{top.toFixed(1)}</output>
        </p>
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            aria-label={`Move the ${name} up`}
            title="Move up"
            className={tool}
            disabled={locked || top <= 0}
            onClick={() => onTop(part, nudgeTop(top, -1))}
          >
            <ArrowUp size={15} aria-hidden />
            <span>Move up</span>
          </button>
          <button
            type="button"
            aria-label={`Move the ${name} down`}
            title="Move down"
            className={tool}
            disabled={locked || top >= TOP_MAX}
            onClick={() => onTop(part, nudgeTop(top, 1))}
          >
            <ArrowDown size={15} aria-hidden />
            <span>Move down</span>
          </button>
        </div>
        <p className="text-[12px] leading-[1.45] text-ink-2">
          {locked
            ? "Locked, so it keeps its place. Press its lock in the layers again to move it."
            : "Drag it up or down on the cover, or focus it and use the arrow keys (Shift moves further). The cover is 100 wide."}
        </p>
      </section>
    </div>
  );
}
