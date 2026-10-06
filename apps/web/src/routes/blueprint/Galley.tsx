import { Fragment, type ReactNode } from "react";
import { Check, Lock } from "lucide-react";
import { ClaimMark, GalleySheet, Loader, MarginNote, Skeleton } from "../../components/ui";
import { calmWardBlueprint, TITLE_SUBTITLE_MAX, titleLength, type ClaimToVerify } from "../../data";
import { cn } from "../../lib/cn";
import { formatNumber, formatUsd } from "../../lib/format";
import { backCoverBlurb, bookSummary, groupLabels, insertedWords, partPlans, sourceLabels, wordCount, type GroupId, type OutlinePart } from "./blueprintExtras";
import { CategoriesEditor, DescriptionEditor, KeywordsEditor } from "./ListingEditors";

/* The galley sheet: the whole plan as one printed page, the selected part in blue pencil. The sheet
   grows with the canvas; text keeps a readable measure (72ch) and each margin note sits beside the
   part it describes when there is room, or just under it when the canvas is narrow. There is no
   standing note column, so no empty space is held for notes that do not exist. */

const bp = calmWardBlueprint;

export interface Note {
  id: string;
  anchor: string;
  kind: "profile" | "selection" | "claim";
  label: string;
  text: string;
}

export interface Diff {
  partId: string;
  prev: string;
  version: number;
}

interface GalleyProps {
  parts: OutlinePart[];
  numbers: Record<string, number>;
  selectedId: string;
  onSelect: (id: string) => void;
  penName: string;
  shortBio: string;
  claims: ClaimToVerify[];
  version: number;
  versionCount: number;
  notes: Note[];
  diff: Diff | null;
  regenerating: { partId: string; cost: number } | null;
  /** Building the blueprint: 0 to 1, parts fill in as they arrive. Null when not building. */
  building: number | null;
  locked: boolean;
  listing: { description: string; categories: string[]; keywords: string[] };
  onListing: (l: { description: string; categories: string[]; keywords: string[] }) => void;
  header?: ReactNode | undefined;
}

/** Text with claim sentences marked in proof red and, after a regeneration, new words in blue pencil. */
function MarkedText({ text, claims, diffPrev }: { text: string; claims: ClaimToVerify[]; diffPrev: string | null }) {
  if (diffPrev !== null) {
    const words = insertedWords(diffPrev, text);
    return (
      <>
        {words.map((w, i) => (
          <Fragment key={i}>
            {w.added ? <ins className="rounded-xs bg-select-wash text-ink underline decoration-select decoration-2 underline-offset-4">{w.word}</ins> : w.word}
            {i < words.length - 1 ? " " : ""}
          </Fragment>
        ))}
      </>
    );
  }
  const claim = claims.find((c) => text.includes(c.text));
  if (!claim) return <>{text}</>;
  const [before, after] = text.split(claim.text);
  return (
    <>
      {before}
      <span id={`claim-anchor-${claim.id}`}>
        <ClaimMark noteId={`note-${claim.id}`}>{claim.text}</ClaimMark>
      </span>
      {after}
    </>
  );
}

function SourceTag({ source }: { source: OutlinePart["source"] }) {
  return <span className="text-small text-ink-tertiary">{sourceLabels[source]}</span>;
}

export function Galley({
  parts,
  numbers,
  selectedId,
  onSelect,
  penName,
  shortBio,
  claims,
  version,
  versionCount,
  notes,
  diff,
  regenerating,
  building,
  locked,
  listing,
  onListing,
  header,
}: GalleyProps) {
  const onChapters = parts.filter((p) => p.group === "chapters" && p.on).length;
  const partsOn = parts.some((p) => p.group === "parts" && p.on);

  // Order of blocks on the page: overview, then each group in book order.
  const order: (GroupId | "overview")[] = ["overview", "front", "chapters", "back", "publishing", "marketing"];
  const blocks: { id: string; group: GroupId | "overview"; part: OutlinePart | null }[] = [];
  for (const g of order) {
    if (g === "overview") blocks.push({ id: "overview", group: g, part: null });
    else for (const p of parts.filter((x) => x.group === g)) blocks.push({ id: p.id, group: g, part: p });
  }
  const shownCount = building === null ? blocks.length : Math.floor(building * blocks.length);

  function notesFor(anchorIds: string[]) {
    return notes.filter((n) => anchorIds.includes(n.anchor));
  }

  function block(id: string, part: OutlinePart | null, children: ReactNode, anchors: string[] = []) {
    const selected = id === selectedId;
    const busy = regenerating?.partId === id;
    const off = part !== null && !part.on;
    const blockNotes = notesFor([`bp-${id}`, ...anchors]);
    return (
      <section
        key={id}
        id={`bp-${id}`}
        aria-current={selected ? "true" : undefined}
        aria-busy={busy || undefined}
        className={cn(
          "relative -mx-3 scroll-mt-24 rounded-sm px-3 py-3 transition-colors duration-(--vol-dur-fast) sm:-mx-4 sm:px-4",
          blockNotes.length > 0 && "@min-[1020px]:grid @min-[1020px]:grid-cols-[minmax(0,72ch)_minmax(200px,280px)] @min-[1020px]:gap-x-10",
          selected ? "vol-pencil-edge bg-select-wash" : "hover:bg-sunken/60",
          off && "opacity-70",
        )}
        onClick={(e) => {
          if ((e.target as HTMLElement).closest("button, a, input, textarea, [role=switch], label")) return;
          onSelect(id);
        }}
      >
        <div className="max-w-[72ch] min-w-0">
          <div className={cn(busy && "opacity-60")}>{children}</div>
          {busy && (
            <p className="mt-2 flex items-center gap-2 text-small font-semibold text-accent-text" role="status">
              <Loader /> Rewriting this part, {formatUsd(regenerating.cost)} so far. The current version stays until the new one is saved.
            </p>
          )}
        </div>
        {blockNotes.length > 0 && (
          <div className="mt-4 grid max-w-[72ch] content-start gap-3 @min-[1020px]:mt-1">
            {blockNotes.map((n) => (
              <MarginNote key={n.id} kind={n.kind} label={n.label} id={`note-${n.id}`}>
                {n.text}
              </MarginNote>
            ))}
          </div>
        )}
      </section>
    );
  }

  function heading(id: string, title: ReactNode, part: OutlinePart | null, number?: number) {
    const selected = id === selectedId;
    return (
      <h3 className="flex items-baseline gap-3 font-book text-[20px] leading-[26px] font-medium">
        {number !== undefined && <span className={cn("num", selected ? "text-select" : "text-ink-tertiary")}>{number}</span>}
        <button
          type="button"
          onClick={() => onSelect(id)}
          className={cn("text-left", selected ? "text-select" : "text-ink", part && !part.on && "line-through decoration-1")}
        >
          {title}
        </button>
        {part && !part.on && <span className="font-ui text-small font-normal text-ink-tertiary no-underline">Off, not in this book</span>}
      </h3>
    );
  }

  function matterBody(p: OutlinePart) {
    const prev = diff?.partId === p.id ? diff.prev : null;
    if (p.id === "summary") {
      const words = wordCount(bookSummary);
      return (
        <div className="mt-2 grid gap-2">
          <div className="grid gap-3 font-book text-prose-sm text-ink print-indent">
            {bookSummary.split("\n\n").map((para) => (
              <p key={para.slice(0, 20)}>{para}</p>
            ))}
          </div>
          <p className={cn("num flex items-center gap-1.5 text-small", words >= 200 && words <= 500 ? "text-success" : "text-claim")}>
            <Check size={14} strokeWidth={2} aria-hidden /> {words} words, 200 to 500 needed
          </p>
        </div>
      );
    }
    if (p.id === "back-cover-blurb") {
      const words = wordCount(backCoverBlurb);
      return (
        <div className="mt-2 grid gap-2">
          <p className="font-book text-prose-sm text-ink">{backCoverBlurb}</p>
          <p className="num flex items-center gap-1.5 text-small text-success">
            <Check size={14} strokeWidth={2} aria-hidden /> {words} words, 120 to 200 needed
          </p>
          <p className="text-small text-ink-secondary">
            Plan: <MarkedText text={p.note} claims={[]} diffPrev={prev} />
          </p>
        </div>
      );
    }
    if (p.id === "short-bio") return <p className="mt-2 font-book text-prose-sm text-ink">{shortBio}</p>;
    if (p.id === "amazon-description")
      return (
        <div className="mt-3">
          <DescriptionEditor value={listing.description} disabled={locked || !p.on} onChange={(description) => onListing({ ...listing, description })} />
        </div>
      );
    if (p.id === "categories")
      return (
        <div className="mt-3">
          <CategoriesEditor value={listing.categories} disabled={locked || !p.on} onChange={(categories) => onListing({ ...listing, categories })} />
        </div>
      );
    if (p.id === "keywords")
      return (
        <div className="mt-3">
          <KeywordsEditor value={listing.keywords} disabled={locked || !p.on} onChange={(keywords) => onListing({ ...listing, keywords })} />
        </div>
      );
    if (p.id === "title-check") {
      const len = titleLength(bp.title, bp.subtitle);
      return (
        <ul className="mt-2 grid gap-1.5 text-body">
          <li className="flex items-center gap-2 text-ink">
            <Check size={16} strokeWidth={2} aria-hidden className="text-success" />
            <span className="num">
              {len} of {TITLE_SUBTITLE_MAX} characters
            </span>
          </li>
          <li className="flex items-center gap-2 text-ink">
            <Check size={16} strokeWidth={2} aria-hidden className="text-success" /> British spelling
          </li>
          <li className="flex items-center gap-2 text-ink">
            <Check size={16} strokeWidth={2} aria-hidden className="text-success" /> No banned phrases
          </li>
        </ul>
      );
    }
    if (p.id === "claims-report")
      return (
        <ul className="mt-2 grid gap-2">
          {claims.map((c) => (
            <li key={c.id} className="border-l-2 border-claim pl-3 text-body text-ink">
              {c.text} <span className="text-small text-ink-secondary">({c.location})</span>
            </li>
          ))}
        </ul>
      );
    return (
      <p className="mt-1.5 font-book text-prose-sm text-ink">
        <MarkedText text={p.note} claims={[]} diffPrev={prev} />
      </p>
    );
  }

  const rendered: ReactNode[] = [];
  let lastGroup: string | null = null;
  blocks.forEach((b, index) => {
    if (index >= shownCount) return;
    if (b.group !== lastGroup && b.group !== "overview") {
      rendered.push(
        <h2 key={`g-${b.group}`} className="mt-8 mb-1 text-[13px] font-semibold text-ink-secondary">
          {b.group === "chapters" ? "Chapter summaries" : groupLabels[b.group]}
        </h2>,
      );
    }
    lastGroup = b.group;
    if (b.group === "overview") {
      rendered.push(
        block(
          "overview",
          null,
          <>
            <p className="opsz-display mt-2 font-book text-[36px] leading-[42px] font-medium tracking-[-0.02em] text-ink sm:text-display">{bp.title}</p>
            <p className="mt-2 font-book text-[20px] leading-7 text-ink-secondary italic">{bp.subtitle}</p>
            <p className="mt-4 font-book text-[17px] text-ink-secondary">{penName}</p>
            <hr className="my-6 w-12 border-t border-ink" />
            <h3 className="text-[13px] font-semibold text-ink-secondary">Summary</h3>
            <p id="anchor-summary" className="mt-2 font-book text-prose text-ink">
              {bp.summary}
            </p>
            <h3 className="mt-6 text-[13px] font-semibold text-ink-secondary">Audience</h3>
            <ul className="mt-2 grid gap-1.5">
              {bp.audience.map((a) => (
                <li key={a} className="font-book text-prose-sm text-ink">
                  {a}
                </li>
              ))}
            </ul>
            <h3 className="mt-6 text-[13px] font-semibold text-ink-secondary">What sets it apart</h3>
            <ul className="mt-2 grid gap-1.5">
              {bp.usps.map((u) => (
                <li key={u} className="font-book text-prose-sm text-ink">
                  {u}
                </li>
              ))}
            </ul>
          </>,
          ["anchor-summary"],
        ),
      );
      return;
    }
    const p = b.part as OutlinePart;
    if (p.group === "chapters" && p.chapter) {
      const n = numbers[p.id];
      // Optional parts head the chapter where their range starts.
      if (partsOn && n !== undefined) {
        for (const plan of partPlans) {
          const partRow = parts.find((x) => x.id === plan.id);
          if (partRow?.on && plan.chapters[0] === n) {
            rendered.push(
              block(
                partRow.id,
                partRow,
                <>
                  {heading(partRow.id, partRow.title, partRow)}
                  <p className="mt-1 font-book text-prose-sm text-ink-secondary italic">{partRow.note}</p>
                </>,
              ),
            );
          }
        }
      }
      const prev = diff?.partId === p.id ? diff.prev : null;
      const claimAnchors = claims.filter((c) => p.chapter?.claimIds.includes(c.id)).map((c) => `claim-anchor-${c.id}`);
      rendered.push(
        block(
          p.id,
          p,
          <>
            {heading(p.id, p.title, p, n)}
            <p className="mt-1.5 font-book text-prose text-ink">
              <MarkedText text={p.note} claims={claims} diffPrev={prev} />
            </p>
            <ul className="mt-3 grid gap-1 border-l border-border pl-3" aria-label="Subheadings">
              {p.chapter.subheadings.map((s) => (
                <li key={s} className="font-book text-[15px] leading-[22px] text-ink-secondary">
                  {s}
                </li>
              ))}
            </ul>
            <p className="num mt-3 text-small text-ink-tertiary">
              {formatNumber(p.wordTarget ?? 0)} words. Opens with a scene. Key Takeaways on.{" "}
              {n !== undefined && n < onChapters ? `Bridges to chapter ${n + 1}.` : "Bridges to the conclusion."}
            </p>
          </>,
          claimAnchors,
        ),
      );
      return;
    }
    if (p.group === "parts") return; // drawn above their chapters
    rendered.push(
      block(
        p.id,
        p,
        <>
          <div className="flex flex-wrap items-baseline justify-between gap-x-3">
            {heading(p.id, p.title, p)}
            <span className="flex items-baseline gap-3">
              {p.wordTarget !== null && <span className="num text-small text-ink-tertiary">{formatNumber(p.wordTarget)} words</span>}
              <SourceTag source={p.source} />
            </span>
          </div>
          {p.on ? matterBody(p) : <p className="mt-1 text-small text-ink-tertiary">{p.note}</p>}
        </>,
      ),
    );
  });

  if (building !== null) {
    rendered.push(
      <div key="building" role="status" aria-label="Parts still arriving" className="mt-6 grid gap-2.5">
        <Skeleton className="w-1/3" />
        <Skeleton className="w-full" />
        <Skeleton className="w-11/12" />
        <Skeleton className="w-4/5" />
      </div>,
    );
  }

  return (
    <div className="@container">
      {header}
      <GalleySheet
        className="sm:px-8! sm:py-8! lg:px-10!"
        label={`Blueprint, version ${version}`}
        metaLeft={
          <span className="inline-flex items-center gap-1.5">
            {locked && <Lock size={12} strokeWidth={2} aria-hidden />}
            Blueprint, version {version} of {versionCount}
          </span>
        }
        metaRight={`Non-fiction, ${onChapters} chapters`}
      >
        <div className="mt-5">{rendered}</div>
      </GalleySheet>
    </div>
  );
}
