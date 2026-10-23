import { useRef, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import { AlignCenter, AlignLeft, AlignRight, ArrowDown, ArrowUp, CaseUpper, Minus, Plus } from "lucide-react";
import type { CoverDesign } from "../../demo";
import { cn } from "../../lib/cn";
import { dragTop, nudgeTop, SCALE_MAX, SCALE_MIN, TITLE_SIZE_MAX, TITLE_SIZE_MIN, TOP_MAX, type CoverPart, type PartAlign } from "./coverEdit";
import { partBoxes } from "./concepts";

/* Edit the cover where you see it: click the title, subtitle or author to select it, then use the toolbar or drag it
   up and down. Plain pointer events; arrow keys move the focused line. The numbers feed the same typography the
   build uses (see coverEdit.ts), so the preview and the built cover agree. */

export const PART_NAME: Record<CoverPart, string> = { title: "title", subtitle: "subtitle", author: "author name" };

/** The alignment a line actually has: its own, else the cover's, else left. */
export const alignOfPart = (d: CoverDesign, part: CoverPart): PartAlign =>
  (part === "title" ? d.titleAlign : part === "subtitle" ? d.subtitleAlign : d.authorAlign) ?? d.align ?? "left";

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
  ...handlers
}: CoverEditHandlers & {
  design: CoverDesign;
  subtitle: string | undefined;
  width: number;
  selected: CoverPart | null;
  disabled?: boolean;
  children: ReactNode;
}) {
  const boxes = partBoxes(design, subtitle);
  const area = useRef<HTMLDivElement>(null);
  const drag = useRef<{ y: number; top: number } | null>(null);

  function hit(part: CoverPart) {
    const box = boxes[part];
    if (!box) return null;
    const on = selected === part;
    const height = Math.max(box.height, 7);
    const startDrag = (e: PointerEvent<HTMLButtonElement>) => {
      if (e.button !== 0 || disabled) return;
      handlers.onSelect(part);
      e.currentTarget.setPointerCapture(e.pointerId);
      drag.current = { y: e.clientY, top: box.top };
    };
    const move = (e: PointerEvent<HTMLButtonElement>) => {
      const start = drag.current;
      const h = area.current?.getBoundingClientRect().height ?? 0;
      if (start && Math.abs(e.clientY - start.y) > 2) handlers.onTop(part, dragTop(start.top, e.clientY - start.y, h));
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
        handlers.onTop(part, nudgeTop(box.top, e.key === "ArrowUp" ? -1 : 1));
      } else if (e.key === "Escape" && on) handlers.onSelect(null);
    };
    return (
      <button
        key={part}
        type="button"
        aria-pressed={on}
        aria-label={`Edit the ${PART_NAME[part]}${on ? " (selected). Arrow up and down move it" : ""}`}
        disabled={disabled}
        onClick={() => handlers.onSelect(part)}
        onPointerDown={startDrag}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
        onKeyDown={key}
        style={{ top: `${(box.top / TOP_MAX) * 100}%`, height: `${(height / TOP_MAX) * 100}%`, touchAction: "none" }}
        className={cn(
          "absolute inset-x-[4%] cursor-grab rounded-xs bg-transparent active:cursor-grabbing",
          "outline-offset-2 hover:outline-1 hover:outline-dashed hover:outline-select focus-visible:outline-2 focus-visible:outline-select",
          on && "outline-2 outline-select",
        )}
      />
    );
  }

  return (
    <div className="relative" style={{ width }}>
      {children}
      <div ref={area} className="absolute inset-0">
        {hit("title")}
        {hit("subtitle")}
        {hit("author")}
      </div>
    </div>
  );
}

const tool =
  "inline-flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-sm border border-border-strong bg-sheet px-2.5 text-small text-ink " +
  "hover:bg-sunken focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-select aria-pressed:border-select aria-pressed:bg-select-wash aria-pressed:font-semibold " +
  "disabled:cursor-not-allowed disabled:text-ink-tertiary";

/** The small toolbar for the selected line: align, move, size, and capitals for the title. */
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
}: Omit<CoverEditHandlers, "onSelect"> & { part: CoverPart; design: CoverDesign; subtitle: string | undefined; titleSizePct: number }) {
  const name = PART_NAME[part];
  const top = partBoxes(design, subtitle)[part]?.top ?? 0;
  const align = alignOfPart(design, part);
  const scale = part === "subtitle" ? (design.subtitleScale ?? 1) : (design.authorScale ?? 1);
  const atSmallest = part === "title" ? titleSizePct <= TITLE_SIZE_MIN : scale <= SCALE_MIN + 0.001;
  const atLargest = part === "title" ? titleSizePct >= TITLE_SIZE_MAX : scale >= SCALE_MAX - 0.001;
  const aligns: { value: PartAlign; label: string; short: string; Icon: typeof AlignLeft }[] = [
    { value: "left", label: "Align left", short: "Left", Icon: AlignLeft },
    { value: "center", label: "Align centre", short: "Centre", Icon: AlignCenter },
    { value: "right", label: "Align right", short: "Right", Icon: AlignRight },
  ];
  return (
    <div role="toolbar" aria-label={`Edit the ${name}`} className="grid gap-2 rounded-md border border-border bg-canvas p-2.5">
      <p className="text-label text-ink">Editing the {name}</p>
      <div className="flex flex-wrap gap-1.5">
        {aligns.map(({ value, label, short, Icon }) => (
          <button
            key={value}
            type="button"
            aria-pressed={align === value}
            aria-label={`${label} (${name})`}
            title={label}
            className={tool}
            onClick={() => onAlign(part, value)}
          >
            <Icon size={16} aria-hidden />
            <span>{short}</span>
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          aria-label={`Move the ${name} up`}
          title="Move up"
          className={tool}
          disabled={top <= 0}
          onClick={() => onTop(part, nudgeTop(top, -1))}
        >
          <ArrowUp size={16} aria-hidden />
          <span>Move up</span>
        </button>
        <button
          type="button"
          aria-label={`Move the ${name} down`}
          title="Move down"
          className={tool}
          disabled={top >= TOP_MAX}
          onClick={() => onTop(part, nudgeTop(top, 1))}
        >
          <ArrowDown size={16} aria-hidden />
          <span>Move down</span>
        </button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        <button type="button" aria-label={`Make the ${name} smaller`} title="Smaller" className={tool} disabled={atSmallest} onClick={() => onSmaller(part)}>
          <Minus size={16} aria-hidden />
          <span>Smaller</span>
        </button>
        <button type="button" aria-label={`Make the ${name} larger`} title="Larger" className={tool} disabled={atLargest} onClick={() => onLarger(part)}>
          <Plus size={16} aria-hidden />
          <span>Larger</span>
        </button>
        {part === "title" && (
          <button type="button" aria-pressed={design.titleUppercase} className={tool} onClick={() => onUppercase(!design.titleUppercase)}>
            <CaseUpper size={16} aria-hidden />
            <span>Capital letters</span>
          </button>
        )}
      </div>
      <p className="text-small text-ink-secondary">You can also drag it up or down on the cover, or use the arrow keys when it is focused.</p>
    </div>
  );
}
