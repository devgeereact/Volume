import type { ReactNode } from "react";
import { Link } from "react-router";
import { cn } from "../../lib/cn";
import { ClaimFlag } from "./ClaimFlag";

interface OutlineItemProps {
  number?: number | null | undefined;
  title: string;
  /** Current selection: select-wash, pencil text and the pencil stroke drawn down the edge. */
  current?: boolean | undefined;
  /** Open claims on this part (proof red flag). */
  claims?: number | undefined;
  /** Small text on the right, for example "4 parts" or "3,940". */
  meta?: ReactNode | undefined;
  /** Subheadings indented under a hairline (shown for the current item). */
  subheadings?: string[] | undefined;
  /** Router link target. Use onSelect for in-page selection instead. */
  to?: string | undefined;
  onSelect?: (() => void) | undefined;
  className?: string | undefined;
}

/** Outline row for the blueprint, editor and writing section lists. Each row is at least 44 px tall. */
export function OutlineItem({ number, title, current = false, claims = 0, meta, subheadings, to, onSelect, className }: OutlineItemProps) {
  const body = (
    <>
      <span className={cn("num w-[18px] shrink-0 text-right", current ? "text-select" : "text-ink-tertiary")}>{number ?? ""}</span>
      <span className="min-w-0 flex-1">{title}</span>
      {claims > 0 && <ClaimFlag count={claims} className="ml-auto self-center" />}
      {meta !== undefined && <span className="ml-auto shrink-0 text-caption font-normal text-ink-tertiary">{meta}</span>}
    </>
  );
  const classes = cn(
    "flex min-h-11 w-full items-center gap-2.5 rounded-sm px-2.5 py-1.5 text-left text-[13.5px] leading-[18px]",
    current ? "vol-pencil-edge bg-select-wash font-semibold text-select" : "text-ink hover:bg-sunken",
  );
  return (
    <div className={className}>
      {to ? (
        <Link to={to} aria-current={current ? "true" : undefined} className={classes}>
          {body}
        </Link>
      ) : (
        <button type="button" aria-current={current ? "true" : undefined} onClick={onSelect} className={classes}>
          {body}
        </button>
      )}
      {current && subheadings && subheadings.length > 0 && (
        <ul className="mt-0.5 mb-1.5 ml-[38px] grid gap-1 border-l border-border pl-2.5 text-[12.5px] leading-[17px] text-ink-secondary">
          {subheadings.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
