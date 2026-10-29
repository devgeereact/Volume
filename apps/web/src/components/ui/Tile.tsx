import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "../../lib/cn";

interface TileProps {
  /** The tile's label, for example "In progress". */
  label: ReactNode;
  icon?: LucideIcon | undefined;
  /** The big figure, for example 9 or "$4.82". */
  value: ReactNode;
  /** Beside the figure, for example "books". */
  unit?: ReactNode | undefined;
  /** The line under the figure. */
  foot?: ReactNode | undefined;
  className?: string | undefined;
}

/**
 * Stat tile from the approved design (.card.tile): the label with an icon tile on the right, a 26 px
 * figure with its unit, and a short line under it. A glass card; put tiles in a grid of four.
 */
export function Tile({ label, icon: Icon, value, unit, foot, className }: TileProps) {
  return (
    <div className={cn("vol-glass flex min-w-0 flex-col gap-2.5 rounded-card p-[18px] text-left max-[560px]:p-[15px]", className)}>
      <div className="flex items-center justify-between gap-2 text-[13px] font-medium text-ink-2">
        <span className="min-w-0">{label}</span>
        {Icon && (
          <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-md bg-panel-2 text-ink-2 shadow-control">
            <Icon size={18} strokeWidth={1.8} />
          </span>
        )}
      </div>
      <p className="text-[26px] leading-none font-bold tracking-[-0.02em] text-ink max-[560px]:text-[22px]">
        {value}
        {unit && <small className="ml-1 text-[13px] font-medium tracking-normal text-ink-3">{unit}</small>}
      </p>
      {foot && <p className="flex flex-wrap items-center gap-2 text-caption font-normal text-ink-3">{foot}</p>}
    </div>
  );
}
