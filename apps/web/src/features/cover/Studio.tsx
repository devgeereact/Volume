import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import {
  Check,
  Frame,
  Grid3x3,
  Info,
  Keyboard,
  Lock,
  LockOpen,
  Maximize2,
  Redo2,
  RotateCcw,
  Shuffle,
  SlidersHorizontal,
  TriangleAlert,
  Undo2,
  X,
  ZoomIn,
  type LucideIcon,
  Eye,
  EyeOff,
} from "lucide-react";
import { Tooltip } from "../../components/ui";
import { cn } from "../../lib/cn";
import { type CoverColours, type NamedPalette, sameColours } from "./palettes";

/* The cover studio's frame from the approved Volume Studio design: one card that fits the window, with a toolbar,
   concepts and layers on the left, the canvas in the middle (it fits the space, or zooms and scrolls), and the
   inspector on the right with Edit and Checks tabs. Both studios (demo and server) draw into it. */

export type StudioView = "ebook" | "wrap" | "thumbs";
export type StudioZoom = "fit" | "1" | "1.5" | "2";

export const STUDIO_VIEWS: { value: StudioView; label: string }[] = [
  { value: "ebook", label: "eBook" },
  { value: "wrap", label: "Paperback wrap" },
  { value: "thumbs", label: "Thumbnails" },
];

const ZOOMS: { value: StudioZoom; label: string }[] = [
  { value: "fit", label: "Fit" },
  { value: "1", label: "100%" },
  { value: "1.5", label: "150%" },
  { value: "2", label: "200%" },
];

export interface ThumbFx {
  dark: boolean;
  grey: boolean;
  squint: boolean;
}

/** UI state of the studio frame that both studios share. */
export interface FrameState {
  view: StudioView;
  zoom: StudioZoom;
  guides: boolean;
  thirds: boolean;
  wide: boolean;
  fx: ThumbFx;
}

export const startFrame = (view: StudioView = "ebook"): FrameState => ({
  view,
  zoom: "fit",
  guides: true,
  thirds: false,
  wide: false,
  fx: { dark: false, grey: false, squint: false },
});

/* ---------- small pieces ---------- */

const quiet =
  "inline-flex h-8 items-center gap-1.5 rounded-[9px] px-2.5 text-[13px] text-ink-2 hover:bg-soft hover:text-ink disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:bg-transparent";
const pressedTone = "aria-pressed:bg-mint-wash aria-pressed:font-semibold aria-pressed:text-mint-ink";

function ToolButton({
  icon: Icon,
  label,
  pressed,
  onClick,
  disabled,
  shortcut,
}: {
  icon: LucideIcon;
  label: string;
  pressed?: boolean | undefined;
  onClick: () => void;
  disabled?: boolean | undefined;
  shortcut?: string[] | undefined;
}) {
  return (
    <Tooltip content={label} shortcut={shortcut}>
      <button
        type="button"
        aria-label={label}
        aria-pressed={pressed}
        disabled={disabled}
        onClick={onClick}
        className={cn(quiet, "w-[34px] justify-center px-0 hit-44", pressedTone)}
      >
        <Icon size={16} strokeWidth={1.8} aria-hidden />
      </button>
    </Tooltip>
  );
}

const Divider = () => <span aria-hidden className="mx-0.5 h-[22px] w-px bg-line-2 max-[760px]:hidden" />;

/** The views as a quiet segmented control (aria-pressed buttons, as in the approved design). */
function ViewSwitch({ value, onChange }: { value: StudioView; onChange: (v: StudioView) => void }) {
  return (
    <div
      role="group"
      aria-label="Preview"
      className="inline-flex h-10 items-center gap-0.5 rounded-md border border-edge bg-soft p-[3px] max-[760px]:w-full max-[760px]:overflow-x-auto"
    >
      {STUDIO_VIEWS.map((v) => (
        <button
          key={v.value}
          type="button"
          aria-pressed={value === v.value}
          onClick={() => onChange(v.value)}
          className={cn(
            "h-full shrink-0 rounded-sm px-3 text-[13px] font-medium whitespace-nowrap max-[760px]:flex-1",
            value === v.value ? "bg-panel-2 text-ink shadow-segment" : "text-ink-2 hover:text-ink",
          )}
        >
          {v.label}
        </button>
      ))}
    </div>
  );
}

export interface ToolbarProps {
  frame: FrameState;
  onFrame: (f: FrameState) => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  /** Back to the concept as made. Missing hides the button. */
  onReset?: (() => void) | undefined;
  /** False while there is nothing to edit (no concept yet). */
  editable: boolean;
  checks: { ok: number; total: number };
  onChecks: () => void;
  /** Extra tools at the end, for example Build again. */
  end?: ReactNode;
}

export function StudioToolbar({ frame, onFrame, canUndo, canRedo, onUndo, onRedo, onReset, editable, checks, onChecks, end }: ToolbarProps) {
  const f = frame;
  const set = (p: Partial<FrameState>) => onFrame({ ...f, ...p });
  const canvas = f.view === "ebook" || f.view === "wrap";
  const warn = checks.ok < checks.total;
  return (
    <div role="toolbar" aria-label="Cover tools" className="flex flex-none flex-wrap items-center gap-1.5 border-b border-line bg-panel-2/55 px-2.5 py-2">
      <ViewSwitch value={f.view} onChange={(view) => set({ view })} />
      <span className="flex-1 max-[760px]:hidden" />
      {canvas ? (
        <>
          <label className="relative inline-flex h-8 items-center gap-1 rounded-[9px] pr-1 pl-2 text-[13px] text-ink-2 hover:bg-soft">
            <ZoomIn size={15} strokeWidth={1.8} aria-hidden />
            <select
              aria-label="Zoom"
              value={f.zoom}
              onChange={(e) => set({ zoom: e.target.value as StudioZoom })}
              className="cursor-pointer appearance-none border-0 bg-transparent pr-4 pl-0.5 font-semibold text-ink"
            >
              {ZOOMS.map((z) => (
                <option key={z.value} value={z.value}>
                  {z.label}
                </option>
              ))}
            </select>
            <span aria-hidden className="pointer-events-none absolute right-1.5 text-[9px] text-ink-2">
              ▼
            </span>
          </label>
          <ToolButton icon={Frame} label="Guides" pressed={f.guides} onClick={() => set({ guides: !f.guides })} />
          <ToolButton icon={Grid3x3} label="Thirds grid" pressed={f.thirds} onClick={() => set({ thirds: !f.thirds })} />
          <ToolButton icon={Maximize2} label="Hide the side panels for a bigger canvas" pressed={f.wide} onClick={() => set({ wide: !f.wide })} />
        </>
      ) : (
        <>
          {(
            [
              ["dark", "Dark page"],
              ["grey", "Greyscale"],
              ["squint", "Squint test"],
            ] as const
          ).map(([k, label]) => (
            <button key={k} type="button" aria-pressed={f.fx[k]} onClick={() => set({ fx: { ...f.fx, [k]: !f.fx[k] } })} className={cn(quiet, pressedTone)}>
              {label}
            </button>
          ))}
        </>
      )}
      <Divider />
      <ToolButton icon={Undo2} label="Undo" shortcut={["Ctrl", "Z"]} disabled={!editable || !canUndo} onClick={onUndo} />
      <ToolButton icon={Redo2} label="Redo" shortcut={["Ctrl", "Shift", "Z"]} disabled={!editable || !canRedo} onClick={onRedo} />
      {onReset && <ToolButton icon={RotateCcw} label="Back to the concept as made" disabled={!editable} onClick={onReset} />}
      <Divider />
      <button
        type="button"
        onClick={onChecks}
        title="Open the checks"
        className={cn(
          "num inline-flex h-8 items-center gap-1.5 rounded-pill px-3 text-[12.5px] font-bold",
          warn ? "bg-amber-wash text-amber" : "bg-good-wash text-good",
        )}
      >
        {warn ? <TriangleAlert size={14} strokeWidth={2.4} aria-hidden /> : <Check size={14} strokeWidth={2.4} aria-hidden />}
        <span>
          {checks.ok} of {checks.total}
        </span>
        <span className="sr-only">checks pass. Open the checks.</span>
      </button>
      {end}
    </div>
  );
}

/* ---------- the body: left panel, stage, inspector ---------- */

export function StudioCard({ toolbar, children, label = "Cover studio" }: { toolbar: ReactNode; children: ReactNode; label?: string }) {
  return (
    <section
      aria-label={label}
      className="vol-glass flex min-h-[560px] flex-col overflow-clip rounded-card min-[1241px]:h-[calc(100dvh-var(--shell-topbar)-var(--shell-bookbar)-24px)] max-[1240px]:min-h-0"
    >
      {toolbar}
      {children}
    </section>
  );
}

export function StudioBody({ left, mid, inspector, wide }: { left: ReactNode | null; mid: ReactNode; inspector: ReactNode; wide: boolean }) {
  const hasLeft = Boolean(left) && !wide;
  return (
    <div
      className={cn(
        "grid min-h-0 flex-1",
        wide
          ? "grid-cols-[minmax(0,1fr)] max-[1240px]:grid-rows-[calc(100dvh-var(--shell-topbar)-var(--shell-bookbar)-120px)] max-[760px]:grid-rows-[auto]"
          : hasLeft
            ? "grid-cols-[216px_minmax(0,1fr)_312px] grid-rows-[minmax(0,1fr)] max-[1240px]:grid-cols-[200px_minmax(0,1fr)] max-[1240px]:grid-rows-[calc(100dvh-var(--shell-topbar)-var(--shell-bookbar)-150px)_auto]"
            : "grid-cols-[minmax(0,1fr)_312px] grid-rows-[minmax(0,1fr)] max-[1240px]:grid-cols-[minmax(0,1fr)] max-[1240px]:grid-rows-[calc(100dvh-var(--shell-topbar)-var(--shell-bookbar)-150px)_auto]",
        "max-[760px]:grid-cols-[minmax(0,1fr)] max-[760px]:grid-rows-[auto]",
      )}
    >
      {hasLeft && (
        <aside
          aria-label="Concepts and layers"
          className="flex min-h-0 flex-col gap-0.5 overflow-y-auto overscroll-contain border-r border-line bg-panel-2/40 px-2.5 pt-3 pb-4 max-[760px]:flex-row max-[760px]:items-start max-[760px]:gap-1.5 max-[760px]:overflow-x-auto max-[760px]:overflow-y-hidden max-[760px]:border-r-0 max-[760px]:border-b max-[760px]:p-2"
        >
          {left}
        </aside>
      )}
      <div className={cn("flex min-h-0 min-w-0 flex-col", !wide && "border-r border-line max-[1240px]:border-r-0")}>{mid}</div>
      {!wide && (
        <aside
          aria-label="Inspector"
          className="flex min-h-0 min-w-0 flex-col overflow-y-auto overscroll-contain bg-panel-2/40 px-4 pt-3 pb-5 max-[1240px]:col-span-full max-[1240px]:overflow-visible max-[1240px]:border-t max-[1240px]:border-line max-[760px]:px-3.5"
        >
          {inspector}
        </aside>
      )}
    </div>
  );
}

/** Measures the free space and gives the largest width with the given aspect (width / height) that fits it. */
export function FitStage({
  ratio,
  zoom,
  baseWidth,
  label,
  onKeyDown,
  children,
}: {
  ratio: number;
  zoom: StudioZoom;
  /** Width at 100% zoom, in px. */
  baseWidth: number;
  label: string;
  onKeyDown?: ((e: KeyboardEvent<HTMLDivElement>) => void) | undefined;
  children: (width: number) => ReactNode;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const read = () => {
      const r = el.getBoundingClientRect();
      setSize({ w: r.width, h: r.height });
    };
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const fit = zoom === "fit";
  const width = fit ? Math.floor(Math.max(0, Math.min(size.w, size.h * ratio))) : Math.round(baseWidth * Number(zoom));
  return (
    <div
      tabIndex={0}
      role="region"
      aria-label={label}
      onKeyDown={onKeyDown}
      className={cn(
        "relative min-h-0 flex-1 overflow-auto bg-[radial-gradient(var(--vol-grid)_1px,transparent_1px)] bg-size-[14px_14px] outline-none focus-visible:shadow-[inset_0_0_0_2px_var(--vol-mint)]",
        "max-[760px]:h-[min(62vh,520px)] max-[760px]:flex-none",
      )}
    >
      <div ref={box} className={cn(fit ? "absolute inset-x-7 inset-y-[22px] grid place-items-center max-[760px]:inset-3.5" : "absolute inset-0")} />
      <div
        className={cn(
          fit
            ? "absolute inset-x-7 inset-y-[22px] grid place-items-center max-[760px]:inset-3.5"
            : "relative flex min-h-full min-w-max items-start justify-center p-7",
        )}
      >
        {width > 0 && children(width)}
      </div>
    </div>
  );
}

/** The thin bar under the canvas: what is shown on the left, the guides key and shortcuts on the right. */
export function StudioBar({ children, tools }: { children: ReactNode; tools?: ReactNode }) {
  return (
    <div className="flex min-h-10 flex-none items-center justify-between gap-2.5 border-t border-line py-1 pr-2 pl-3.5 text-[12.5px] text-ink-2">
      <div className="num flex min-w-0 items-center gap-2 overflow-hidden text-ellipsis whitespace-nowrap">{children}</div>
      {tools && <div className="flex flex-none gap-0.5 max-[760px]:hidden">{tools}</div>}
    </div>
  );
}

export const BarDot = () => <span aria-hidden className="size-[3px] flex-none rounded-full bg-ink-3" />;

/** A small popover from a quiet icon button. Escape or a click outside closes it; focus goes back to the button. */
export function Popover({ icon: Icon, label, title, children }: { icon: LucideIcon; label: string; title: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const id = useId();
  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", down);
    return () => document.removeEventListener("mousedown", down);
  }, [open]);
  return (
    <div
      ref={wrap}
      className="relative"
      onKeyDown={(e) => {
        if (e.key === "Escape" && open) {
          e.stopPropagation();
          setOpen(false);
          button.current?.focus();
        }
      }}
    >
      <button
        ref={button}
        type="button"
        aria-label={label}
        title={label}
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
        className={cn(quiet, "w-[34px] justify-center px-0 hit-44", open && "bg-mint-wash text-mint-ink")}
      >
        <Icon size={16} strokeWidth={1.8} aria-hidden />
      </button>
      {open && (
        <div
          id={id}
          role="dialog"
          aria-label={title}
          className="absolute right-0 bottom-[calc(100%+8px)] z-30 w-[270px] rounded-[14px] border border-edge bg-raised px-4 py-3.5 text-ink shadow-glass"
        >
          <p className="mb-2 text-[13px] font-bold">{title}</p>
          {children}
        </div>
      )}
    </div>
  );
}

export interface GuideKeyItem {
  /** Sample: "trim", "bleed", "fold", "safe", "barcode", "thirds". */
  kind: "trim" | "bleed" | "fold" | "safe" | "barcode" | "thirds";
  name: string;
  note: string;
}

const sample: Record<GuideKeyItem["kind"], string> = {
  trim: "h-3.5 w-5 border border-select",
  bleed: "h-3.5 w-5 bg-scrim/35",
  fold: "h-3.5 w-5 border-x border-dashed border-select",
  safe: "h-3.5 w-5 border border-dashed border-select/70",
  barcode: "h-3.5 w-5 border border-dashed border-select",
  thirds: "h-3.5 w-5 border-t border-l border-hot/60",
};

export function GuidesKey({ items }: { items: GuideKeyItem[] }) {
  return (
    <Popover icon={Frame} label="What the guides mean" title="Guides">
      <ul className="grid gap-2">
        {items.map((it) => (
          <li key={it.kind} className="flex items-start gap-2.5">
            <i aria-hidden className={cn("mt-0.5 block flex-none", sample[it.kind])} />
            <span className="grid text-[12.5px] leading-[1.35]">
              <b className="font-semibold">{it.name}</b>
              <small className="text-[12px] text-ink-2">{it.note}</small>
            </span>
          </li>
        ))}
      </ul>
    </Popover>
  );
}

export function ShortcutsKey({ items }: { items: [string, string][] }) {
  return (
    <Popover icon={Keyboard} label="Keyboard shortcuts" title="Shortcuts">
      <dl className="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-1.5 text-[12.5px]">
        {items.map(([k, d]) => (
          <div key={k} className="contents">
            <dt>
              <kbd className="rounded-xs border border-line-2 bg-soft px-1.5 py-0.5 font-mono text-[11px] text-ink">{k}</kbd>
            </dt>
            <dd className="text-ink-2">{d}</dd>
          </div>
        ))}
      </dl>
    </Popover>
  );
}

/* ---------- left panel ---------- */

export function PanelTitle({ children, first = false }: { children: ReactNode; first?: boolean }) {
  return (
    <h2
      className={cn(
        "mx-2 mb-2 text-[11px] font-bold tracking-[.09em] text-ink-3 uppercase max-[760px]:hidden",
        first ? "mt-1" : "mt-[18px] border-t border-line pt-3.5",
      )}
    >
      {children}
    </h2>
  );
}

export interface LayerItem {
  id: string;
  name: string;
  icon: LucideIcon;
  /** Hidden on the cover (struck through). */
  off?: boolean | undefined;
  /** A short note under the row, for example "Needs 80 pages". */
  note?: string | undefined;
  /** Show or hide, when the layer can be hidden. */
  onToggleHide?: (() => void) | undefined;
  /** Lock it in place (a toggle), when the layer can move. */
  locked?: boolean | undefined;
  onToggleLock?: (() => void) | undefined;
  /** Fixed by KDP: a lock with no button. */
  fixed?: boolean | undefined;
}

export function LayerList({
  groups,
  selected,
  onSelect,
}: {
  groups: { name: string; items: LayerItem[] }[];
  selected: string | null;
  onSelect: (id: string | null) => void;
}) {
  const row = (l: LayerItem) => {
    const on = selected === l.id;
    return (
      <div key={l.id} className="max-[760px]:contents">
        <div
          className={cn(
            "group/l flex items-center rounded-[10px] transition-colors duration-(--vol-dur-fast) hover:bg-soft",
            on && "bg-panel-2 shadow-[inset_0_0_0_1px_var(--vol-line-2),0_1px_2px_rgb(28_40_64/.06)]",
            "max-[760px]:flex-none max-[760px]:border max-[760px]:border-line max-[760px]:bg-panel-2",
          )}
        >
          <button
            type="button"
            aria-pressed={on}
            onClick={() => onSelect(l.id)}
            className={cn(
              "flex h-[34px] min-w-0 flex-1 items-center gap-[9px] rounded-[10px] px-2 text-left text-[13px] text-ink",
              l.off && "text-ink-3",
              "max-[760px]:h-9 max-[760px]:px-3",
            )}
          >
            <l.icon size={16} strokeWidth={1.8} aria-hidden className={cn("flex-none", on ? "text-mint" : "text-ink-3")} />
            <span className={cn("truncate", l.off && "line-through decoration-line-2")}>{l.name}</span>
            {l.off && <span className="sr-only">, hidden</span>}
          </button>
          {l.fixed && (
            <span title="Fixed by KDP" className="grid size-[26px] flex-none place-items-center text-ink-3 max-[760px]:hidden">
              <Lock size={14} strokeWidth={1.8} aria-hidden />
              <span className="sr-only">Fixed by KDP</span>
            </span>
          )}
          {l.onToggleHide && (
            <button
              type="button"
              onClick={l.onToggleHide}
              aria-pressed={Boolean(l.off)}
              aria-label={`${l.off ? "Show" : "Hide"} ${l.name.toLowerCase()}`}
              title={l.off ? "Show" : "Hide"}
              className={cn(
                "grid size-[26px] flex-none place-items-center rounded-[7px] text-ink-3 hover:bg-panel-2 hover:text-ink max-[760px]:hidden",
                "opacity-0 group-hover/l:opacity-100 focus-visible:opacity-100 aria-pressed:text-mint-ink aria-pressed:opacity-100",
                on && "opacity-100",
              )}
            >
              {l.off ? <EyeOff size={14} strokeWidth={1.8} aria-hidden /> : <Eye size={14} strokeWidth={1.8} aria-hidden />}
            </button>
          )}
          {l.onToggleLock && (
            <button
              type="button"
              onClick={l.onToggleLock}
              aria-pressed={Boolean(l.locked)}
              aria-label={`Lock ${l.name.toLowerCase()}`}
              title={l.locked ? "Locked. Press to let it move" : "Lock in place"}
              className={cn(
                "mr-0.5 grid size-[26px] flex-none place-items-center rounded-[7px] text-ink-3 hover:bg-panel-2 hover:text-ink max-[760px]:hidden",
                "opacity-0 group-hover/l:opacity-100 focus-visible:opacity-100 aria-pressed:text-mint-ink aria-pressed:opacity-100",
                on && "opacity-100",
              )}
            >
              {l.locked ? <Lock size={14} strokeWidth={1.8} aria-hidden /> : <LockOpen size={14} strokeWidth={1.8} aria-hidden />}
            </button>
          )}
        </div>
        {l.note && <p className="pr-2 pb-1 pl-[33px] text-[11px] text-ink-3 max-[760px]:hidden">{l.note}</p>}
      </div>
    );
  };
  return (
    <>
      <PanelTitle>Layers</PanelTitle>
      {groups.map((g) => (
        <div key={g.name} role="group" aria-label={g.name} className="grid gap-0.5 max-[760px]:contents">
          <p className="px-2 pt-2.5 pb-[3px] text-[10px] font-bold tracking-[.09em] text-ink-3 uppercase max-[760px]:hidden">{g.name}</p>
          {g.items.map(row)}
        </div>
      ))}
      <div role="group" aria-label="Cover" className="grid gap-0.5 max-[760px]:contents">
        <p className="px-2 pt-2.5 pb-[3px] text-[10px] font-bold tracking-[.09em] text-ink-3 uppercase max-[760px]:hidden">Cover</p>
        {row({ id: "__cover", name: "Colours, design and paper", icon: SlidersHorizontal })}
      </div>
    </>
  );
}

/** The id LayerList uses for the cover settings row. */
export const COVER_ROW = "__cover";

/* ---------- inspector ---------- */

export type InspectorTab = "edit" | "checks";

export function InspectorTabs({ value, onChange, warnings }: { value: InspectorTab; onChange: (t: InspectorTab) => void; warnings: number }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const tabs: { id: InspectorTab; label: string }[] = [
    { id: "edit", label: "Edit" },
    { id: "checks", label: "Checks" },
  ];
  return (
    <div
      role="tablist"
      aria-label="Inspector"
      onKeyDown={(e) => {
        if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
        e.preventDefault();
        const next = value === "edit" ? "checks" : "edit";
        onChange(next);
        refs.current[next === "edit" ? 0 : 1]?.focus();
      }}
      className="mb-2.5 grid h-10 flex-none grid-cols-2 gap-0.5 rounded-md border border-edge bg-soft p-[3px] max-[1240px]:col-span-full"
    >
      {tabs.map((t, i) => (
        <button
          key={t.id}
          ref={(el) => {
            refs.current[i] = el;
          }}
          type="button"
          role="tab"
          id={`cv-tab-${t.id}`}
          aria-selected={value === t.id}
          aria-controls={`cv-panel-${t.id}`}
          tabIndex={value === t.id ? 0 : -1}
          onClick={() => onChange(t.id)}
          className={cn(
            "inline-flex items-center justify-center gap-1.5 rounded-sm text-[13px] font-medium",
            value === t.id ? "bg-panel-2 text-ink shadow-segment" : "text-ink-2 hover:text-ink",
          )}
        >
          {t.label}
          {t.id === "checks" && (
            <span
              className={cn(
                "num inline-grid h-[18px] min-w-[18px] place-items-center rounded-pill px-[5px] text-[11px] font-bold",
                warnings > 0 ? "bg-amber-wash text-amber" : "bg-good-wash text-good",
              )}
            >
              {warnings > 0 ? warnings : <Check size={11} strokeWidth={2.6} aria-hidden />}
              <span className="sr-only">{warnings > 0 ? " to look at" : " all pass"}</span>
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

export function InspectorPanel({ tab, children }: { tab: InspectorTab; children: ReactNode }) {
  return (
    <div
      role="tabpanel"
      id={`cv-panel-${tab}`}
      aria-labelledby={`cv-tab-${tab}`}
      className="min-w-0 max-[1240px]:grid max-[1240px]:grid-cols-[repeat(auto-fill,minmax(280px,1fr))] max-[1240px]:items-start max-[1240px]:gap-x-6 max-[760px]:flex max-[760px]:flex-col"
    >
      {children}
    </div>
  );
}

/** The heading of the inspector: what is being edited, where it lives, and a way back to the cover settings. */
export function InspectorHead({ icon: Icon, title, surface, onClose }: { icon: LucideIcon; title: string; surface?: string; onClose?: () => void }) {
  return (
    <div className="flex items-center gap-2 pt-0.5 pb-2.5 max-[1240px]:col-span-full">
      <Icon size={18} strokeWidth={1.8} aria-hidden className="flex-none text-mint" />
      <h2 className="flex-1 text-[15px] font-bold text-ink">{title}</h2>
      {surface && <span className="inline-flex h-[22px] items-center rounded-pill bg-soft px-2.5 text-[12px] font-semibold text-ink-2">{surface}</span>}
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          aria-label="Close and show the cover settings"
          title="Cover settings"
          className={cn(quiet, "w-[34px] justify-center px-0 hit-44")}
        >
          <X size={16} strokeWidth={1.8} aria-hidden />
        </button>
      )}
    </div>
  );
}

/** One section of the inspector: a small capitals heading and its controls. */
export function Section({ title, children, className, id }: { title: string; children: ReactNode; className?: string; id?: string }) {
  const hid = useId();
  return (
    <section aria-labelledby={hid} id={id} className={cn("grid min-w-0 gap-2.5 border-t border-line py-3.5", className)}>
      <h3 id={hid} className="text-[10.5px] font-bold tracking-[.09em] text-ink-3 uppercase">
        {title}
      </h3>
      {children}
    </section>
  );
}

export const fieldLabel = "flex items-baseline justify-between gap-1.5 text-[12.5px] text-ink-2";
export const fieldInput =
  "h-10 w-full min-w-0 rounded-[10px] border border-line-2 bg-panel-2 px-2.5 text-[13px] text-ink transition-[border-color,box-shadow] duration-(--vol-dur-fast) focus:border-mint focus:shadow-[0_0_0_3px_var(--vol-mint-wash)] focus:outline-none disabled:cursor-not-allowed disabled:text-ink-disabled";

/** Quiet segmented toggle with aria-pressed buttons (align, ink, paper). */
export function Toggles<T extends string>({
  label,
  options,
  value,
  onChange,
  full = false,
}: {
  label: string;
  options: { value: T; label: string; icon?: LucideIcon | undefined; disabledReason?: string | undefined }[];
  value: T;
  onChange: (v: T) => void;
  full?: boolean;
}) {
  return (
    <div role="group" aria-label={label} className={cn("inline-flex h-10 gap-0.5 rounded-md border border-edge bg-soft p-[3px]", full && "flex w-full")}>
      {options.map((o) => {
        const Icon = o.icon;
        const off = Boolean(o.disabledReason);
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={value === o.value}
            aria-label={Icon ? o.label : undefined}
            aria-disabled={off || undefined}
            title={o.disabledReason ?? (Icon ? o.label : undefined)}
            onClick={() => {
              if (!off) onChange(o.value);
            }}
            className={cn(
              "inline-flex items-center justify-center gap-1.5 rounded-sm px-2.5 text-[12.5px] font-medium whitespace-nowrap",
              full && "flex-1",
              value === o.value ? "bg-panel-2 text-ink shadow-segment" : "text-ink-2 hover:text-ink",
              off && "cursor-not-allowed opacity-40 hover:text-ink-2",
            )}
          >
            {Icon ? <Icon size={15} strokeWidth={1.8} aria-hidden /> : o.label}
          </button>
        );
      })}
    </div>
  );
}

export const pillButton =
  "inline-flex h-8 items-center gap-1.5 rounded-pill border border-edge bg-panel-2 px-3 text-[12.5px] font-semibold text-ink shadow-control hover:bg-soft disabled:cursor-not-allowed disabled:opacity-50";

/* ---------- palettes ---------- */

export interface PaletteFamily {
  id: string;
  label: string;
  palettes: NamedPalette[];
  /** A note under the tabs for this family. */
  note?: string | undefined;
  /** A "Four more" button for families made on the fly. */
  onMore?: (() => void) | undefined;
}

export function PalettePicker({
  families,
  current,
  onPick,
  disabled,
}: {
  families: PaletteFamily[];
  current: CoverColours | null;
  onPick: (p: NamedPalette, family: PaletteFamily) => void;
  disabled?: boolean | undefined;
}) {
  const [fam, setFam] = useState(families[0]?.id ?? "");
  const family = families.find((f) => f.id === fam) ?? families[0];
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  if (!family) return null;
  const at = families.indexOf(family);
  return (
    <div className="grid min-w-0 gap-2.5">
      <div
        role="tablist"
        aria-label="Palette family"
        onKeyDown={(e) => {
          const step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
          if (!step) return;
          e.preventDefault();
          const next = families[(at + step + families.length) % families.length];
          if (!next) return;
          setFam(next.id);
          tabRefs.current[families.indexOf(next)]?.focus();
        }}
        className="-mx-0.5 flex gap-1 overflow-x-auto p-0.5 [scrollbar-width:none]"
      >
        {families.map((f, i) => (
          <button
            key={f.id}
            ref={(el) => {
              tabRefs.current[i] = el;
            }}
            type="button"
            role="tab"
            aria-selected={f.id === family.id}
            tabIndex={f.id === family.id ? 0 : -1}
            onClick={() => setFam(f.id)}
            className={cn(
              "h-7 flex-none rounded-pill border px-2.5 text-[12px] font-semibold",
              f.id === family.id ? "border-transparent bg-btn text-on-btn" : "border-line text-ink-2 hover:bg-soft hover:text-ink",
            )}
          >
            {f.label}
          </button>
        ))}
      </div>
      {family.note && <p className="text-[12px] leading-[1.45] text-ink-2">{family.note}</p>}
      <div role="group" aria-label={`${family.label} palettes`} className="grid grid-cols-4 gap-2">
        {family.palettes.map((p) => {
          const on = sameColours(current, p.colours);
          const c = p.colours;
          return (
            <button
              key={p.name + c.background}
              type="button"
              aria-pressed={on}
              aria-label={`Use ${p.name}`}
              title={p.name}
              disabled={disabled}
              onClick={() => onPick(p, family)}
              className={cn(
                "group/p grid min-w-0 gap-[5px] rounded-[10px] p-[3px] text-center text-[10.5px] leading-[1.2] text-ink-2 disabled:cursor-not-allowed",
                on && "bg-mint-wash font-semibold text-ink",
              )}
            >
              <span
                aria-hidden
                className={cn(
                  "relative block aspect-[2/3] rounded-[3px_5px_5px_3px] shadow-[inset_0_0_0_1px_rgb(0_0_0/.12),0_4px_10px_-6px_rgb(20_30_50/.5)] transition-transform duration-(--vol-dur-fast) group-hover/p:-translate-y-0.5",
                  on && "shadow-[0_0_0_2px_var(--vol-panel-2),0_0_0_4px_var(--vol-mint)]",
                )}
                style={{ background: c.background }}
              >
                <i className="absolute top-[16%] left-[14%] h-[7%] w-[66%] rounded-[2px]" style={{ background: c.title }} />
                <i className="absolute top-[28%] left-[14%] h-[4%] w-[44%] rounded-[2px]" style={{ background: c.subtitle }} />
                <em className="absolute bottom-[12%] left-[14%] aspect-square w-[20%] rounded-full" style={{ background: c.accent }} />
                <em className="absolute bottom-[12%] left-[38%] aspect-square w-[20%] rounded-full" style={{ background: c.band }} />
              </span>
              <small className="truncate">{p.name}</small>
            </button>
          );
        })}
      </div>
      {family.onMore && (
        <div>
          <button type="button" className={pillButton} onClick={family.onMore} disabled={disabled}>
            <Shuffle size={15} strokeWidth={1.8} aria-hidden />
            Four more
          </button>
        </div>
      )}
    </div>
  );
}

/* ---------- checks ---------- */

export type CheckStatus = "pass" | "warn" | "fail" | "info";
export interface StudioCheck {
  status: CheckStatus;
  title: string;
  detail: string;
  /** Select the part the check is about. */
  onShow?: (() => void) | undefined;
}

export const checkScore = (list: StudioCheck[]) => ({ ok: list.filter((c) => c.status === "pass" || c.status === "info").length, total: list.length });

function Ring({ value, label }: { value: number; label: string }) {
  const r = 26;
  const c = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 62 62" className="size-[62px] flex-none" role="img" aria-label={label}>
      <circle cx="31" cy="31" r={r} fill="none" strokeWidth="6" className="stroke-track" />
      <circle
        cx="31"
        cy="31"
        r={r}
        fill="none"
        strokeWidth="6"
        strokeLinecap="round"
        className="stroke-good"
        strokeDasharray={`${c * value} ${c}`}
        transform="rotate(-90 31 31)"
      />
    </svg>
  );
}

const CHECK_ICON: Record<CheckStatus, LucideIcon> = { pass: Check, info: Info, warn: TriangleAlert, fail: X };
const CHECK_TONE: Record<CheckStatus, string> = {
  pass: "bg-good-wash text-good",
  info: "bg-blue-wash text-blue",
  warn: "bg-amber-wash text-amber",
  fail: "bg-red-wash text-red",
};
const CHECK_WORD: Record<CheckStatus, string> = { pass: "Passes", info: "Note", warn: "Look at this", fail: "Fails" };
const ORDER: Record<CheckStatus, number> = { fail: 0, warn: 1, pass: 2, info: 3 };

export function ChecksPanel({ checks }: { checks: StudioCheck[] }) {
  const { ok, total } = checkScore(checks);
  const sorted = [...checks].sort((a, b) => ORDER[a.status] - ORDER[b.status]);
  return (
    <div className="grid gap-1 max-[1240px]:col-span-full">
      <div className="flex items-center gap-3 pb-3">
        <Ring value={total ? ok / total : 0} label={`${ok} of ${total} checks pass`} />
        <div>
          <p className="text-[15px] font-bold text-ink">Cover health</p>
          <p className="text-[12px] text-ink-2">Checked live against the print numbers. {total - ok ? `${total - ok} to look at.` : "Ready to build."}</p>
        </div>
      </div>
      <ul className="grid gap-0.5">
        {sorted.map((c) => {
          const Icon = CHECK_ICON[c.status];
          return (
            <li key={c.title} className="grid grid-cols-[22px_minmax(0,1fr)_auto] items-start gap-2.5 rounded-[11px] px-2 py-[9px] hover:bg-soft">
              <span className={cn("grid size-[22px] place-items-center rounded-full", CHECK_TONE[c.status])}>
                <Icon size={13} strokeWidth={2.4} aria-hidden />
                <span className="sr-only">{CHECK_WORD[c.status]}: </span>
              </span>
              <span className="min-w-0">
                <b className="block text-[13px] leading-[1.35] font-semibold text-ink">{c.title}</b>
                <small className="mt-px block text-[12px] leading-[1.45] text-ink-2">{c.detail}</small>
              </span>
              {c.onShow && c.status !== "pass" && (
                <button type="button" onClick={c.onShow} className="text-[12.5px] font-semibold text-select underline-offset-2 hover:underline">
                  Show
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/* ---------- thumbnails ---------- */

const THUMB_SIZES: [number, string][] = [
  [64, "Phone search list"],
  [110, "Search results"],
  [160, "Also bought row"],
  [240, "Product page"],
];

/** The cover at the sizes shoppers see it, on a light or dark page, in colour or grey, sharp or squinted. */
export function ThumbsView({ fx, draw }: { fx: ThumbFx; draw: (width: number) => ReactNode }) {
  const filter = [fx.grey ? "grayscale(1)" : "", fx.squint ? "blur(1.4px)" : ""].join(" ").trim() || "none";
  return (
    <div
      className={cn(
        "grid w-full gap-[26px] self-start rounded-2xl p-[26px] shadow-sheet max-[760px]:gap-[18px] max-[760px]:p-4",
        // The page a shopper sees, not app chrome: white or near black whatever the theme.
        fx.dark ? "bg-spine text-ink-on-spine" : "bg-raised text-ink",
      )}
    >
      <div className="flex flex-wrap items-end gap-[26px] max-[760px]:gap-3.5">
        {THUMB_SIZES.map(([w, label]) => (
          <figure key={w} className="m-0 grid justify-items-start gap-2">
            <div style={{ width: w, filter }}>{draw(w)}</div>
            <figcaption className="max-w-40 text-[12px] leading-[1.35] opacity-80">
              <b className="block opacity-100">{w} px</b>
              {label}
            </figcaption>
          </figure>
        ))}
      </div>
    </div>
  );
}

/* ---------- guides over the eBook cover ---------- */

/** Safe area and thirds over a front cover. `safePct` is the inset as a share of the cover width. */
export function FrontGuides({ safePct, guides, thirds, ratio }: { safePct: number; guides: boolean; thirds: boolean; ratio: number }) {
  if (!guides && !thirds) return null;
  const y = (pct: number) => `${pct * ratio}%`;
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 z-[5]">
      {guides && (
        <i
          className="absolute block border border-dashed border-select/70"
          style={{ left: `${safePct}%`, right: `${safePct}%`, top: y(safePct), bottom: y(safePct) }}
        />
      )}
      {thirds &&
        [1 / 3, 1 / 2, 2 / 3].map((f) => (
          <span key={f} className="contents">
            <i
              className={cn("absolute top-0 bottom-0 block w-0 border-l", f === 0.5 ? "border-dashed border-hot/65" : "border-hot/40")}
              style={{ left: `${f * 100}%` }}
            />
            <i
              className={cn("absolute right-0 left-0 block h-0 border-t", f === 0.5 ? "border-dashed border-hot/65" : "border-hot/40")}
              style={{ top: `${f * 100}%` }}
            />
          </span>
        ))}
    </div>
  );
}
