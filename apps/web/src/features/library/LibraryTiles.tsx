import type { ReactNode } from "react";
import { Package, Star, Wallet, Zap, type LucideIcon } from "lucide-react";
import { Skeleton, Tile } from "../../components/ui";
import type { Book } from "../../demo/types";
import { cn } from "../../lib/cn";
import { formatUsd } from "../../lib/format";
import { bookGroups, groupOf, type BookGroup } from "./bookStatus";

const icons: Record<BookGroup, LucideIcon> = { progress: Zap, ready: Package, published: Star };

/** The tile's label, icon, figure and line, the same as the shared Tile but in a toggle button (.card.tile with aria-pressed). */
function StageTile({ group, count, foot, on, onPress }: { group: BookGroup; count: number; foot: ReactNode; on: boolean; onPress: () => void }) {
  const Icon = icons[group];
  const title = bookGroups.find((g) => g.id === group)?.title ?? "";
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onPress}
      className={cn(
        "vol-glass flex min-w-0 flex-col gap-2.5 rounded-card p-[18px] text-left transition-[transform,border-color] duration-(--vol-dur-fast) hover:-translate-y-px motion-reduce:hover:translate-y-0 max-[560px]:p-[15px]",
        on && "border-mint shadow-[0_0_0_3px_var(--vol-mint-wash)]",
      )}
    >
      <span className="flex w-full items-center justify-between gap-2 text-[13px] font-medium text-ink-2">
        <span className="min-w-0">{title}</span>
        <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-md bg-panel-2 text-ink-2 shadow-control">
          <Icon size={18} strokeWidth={1.8} />
        </span>
      </span>
      <span className="text-[26px] leading-none font-bold tracking-[-0.02em] text-ink max-[560px]:text-[22px]">
        {count}
        <small className="ml-1 text-[13px] font-medium tracking-normal text-ink-3">{count === 1 ? "book" : "books"}</small>
      </span>
      <span className="text-caption text-ink-3">{foot}</span>
    </button>
  );
}

export interface SpendFigures {
  /** "October". */
  month: string;
  spentUsd: number;
  /** OpenRouter credit left, or null when the key has no limit or the server did not say. */
  creditUsd: number | null;
}

interface LibraryTilesProps {
  books: readonly Book[];
  group: BookGroup | null;
  onGroup: (g: BookGroup | null) => void;
  /** The In progress line: "6 need you, 1 writing now". Built by the page from what it knows. */
  progressFoot: string;
  /** The Published line: "7 formats on amazon.co.uk". */
  publishedFoot: string;
  /** This month's AI spend; null while it loads, "none" when it cannot be read. */
  spend: SpendFigures | null | "none";
}

/**
 * The four stat tiles from the approved design: In progress, Ready to publish and Published (each a toggle that
 * narrows the books below to that stage) and this month's AI spend with the OpenRouter credit left. There is no
 * monthly cap (D-057), so the spend tile never shows "of $N". Every figure comes from the books on show or the server.
 */
export function LibraryTiles({ books, group, onGroup, progressFoot, publishedFoot, spend }: LibraryTilesProps) {
  const counts: Record<BookGroup, number> = { progress: 0, ready: 0, published: 0 };
  for (const b of books) counts[groupOf(b)] += 1;
  const foot: Record<BookGroup, string> = { progress: progressFoot, ready: "Build the pack, then publish", published: publishedFoot };
  return (
    <div role="group" aria-label="Books by stage and this month's spend" className="grid grid-cols-2 gap-4 max-[560px]:gap-2.5 min-[1201px]:grid-cols-4">
      {bookGroups.map((g) => (
        <StageTile key={g.id} group={g.id} count={counts[g.id]} foot={foot[g.id]} on={group === g.id} onPress={() => onGroup(group === g.id ? null : g.id)} />
      ))}
      {spend === null ? (
        <div className="vol-glass grid gap-2.5 rounded-card p-[18px]" role="status" aria-label="Loading this month's spend">
          <Skeleton className="w-2/3" />
          <Skeleton className="h-6 w-1/2" />
          <Skeleton className="w-3/4" />
        </div>
      ) : spend === "none" ? (
        <Tile label="AI spend" icon={Wallet} value="Not known" foot="The server did not send this month's spend." />
      ) : (
        <Tile
          label={`${spend.month} AI spend`}
          icon={Wallet}
          value={<span className="num">{formatUsd(spend.spentUsd)}</span>}
          foot={spend.creditUsd !== null ? `${formatUsd(spend.creditUsd)} OpenRouter credit left` : "Spent on AI so far this month"}
        />
      )}
    </div>
  );
}
