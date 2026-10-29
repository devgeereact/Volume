import { Link, useNavigate } from "react-router";
import { ReadOnlyBanner, useCanWrite } from "../../lib/access";
import { ArrowUpRight, Plus, UserRound } from "lucide-react";
import { Banner, Button, chipClasses, Cover, EmptyState, PageHeader, Skeleton, StatusChip } from "../../components/ui";
import { useMemo } from "react";
import { toPrototypeBook } from "../../api/adapters";
import { profileBookCount, useApiBooks, usePenNames, useWireMode } from "../../api/wire-a";
import { books } from "../../demo/books";
import { penNames } from "../../demo/penNames";
import type { Book } from "../../demo/types";
import { ProfileAvatar } from "./ProfileAvatar";
import { useDemoState } from "../library/demoState";
import { libraryCover } from "../library/draftCover";
import { draftFromApi } from "./profileApi";
import { bookCount, useProfiles, type ProfileDraft } from "./profileStore";

/** Pill that marks a profile as a real person (icon plus words, never colour alone). */
export function RealPersonBadge() {
  return (
    <span className={chipClasses("info")}>
      <UserRound size={14} strokeWidth={2} aria-hidden />
      Real person
    </span>
  );
}

/** Up to six of the profile's book covers in a row (approved design, .pen-covers). */
function CoverRow({ list: all }: { list: Book[] }) {
  const list = all.slice(0, 6);
  if (list.length === 0) return null;
  return (
    <span aria-hidden className="flex min-h-[54px] gap-1.5 overflow-hidden">
      {list.map((b) => (
        <span key={b.id} className="block w-[34px] shrink-0">
          <Cover title={b.title} author="" design={libraryCover(b).design} image={libraryCover(b).image} width={34} hideSubtitle decorative />
        </span>
      ))}
    </span>
  );
}

/** 115500 as "115.5K", 640 as "640". */
function compact(n: number): string {
  if (n < 1000) return String(n);
  const k = Math.round(n / 100) / 10;
  return `${k.toLocaleString("en-GB", { maximumFractionDigits: 1 })}K`;
}

interface CardStats {
  books: number;
  /** Words written across the profile's books, or null when the list does not carry word counts (API mode). */
  words: number | null;
  /** Books live on Amazon, or null while the book list is still loading. */
  live: number | null;
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <span className="grid text-center text-[11px] leading-4 text-ink-3">
      <b className="num text-[16px] leading-6 font-bold text-ink">{value}</b>
      {label}
    </span>
  );
}

function ProfileCard({ p, stats, covers }: { p: ProfileDraft; stats: CardStats; covers: Book[] }) {
  const kind = p.realPerson ? ["Real person", p.location].filter(Boolean).join(", ") : ["Pen name", p.publishing.imprint].filter(Boolean).join(", ");
  const cells: { value: string; label: string }[] = [{ value: String(stats.books), label: stats.books === 1 ? "Book" : "Books" }];
  if (stats.words !== null) cells.push({ value: compact(stats.words), label: "Words" });
  if (stats.live !== null) cells.push({ value: String(stats.live), label: "Live" });
  return (
    <li className="min-w-0">
      <Link
        to={`/profiles/${p.id}`}
        className="vol-glass group flex h-full flex-col gap-3 rounded-card p-[18px] text-left transition-[border-color] duration-(--vol-dur-fast) hover:border-mint-2"
      >
        <span className="flex items-center gap-3">
          <ProfileAvatar initials={p.initials || "?"} id={p.id} size="xl" />
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] leading-6 font-bold text-ink">{p.name}</span>
            <span className="block text-[12.5px] leading-[1.6] text-ink-3">{kind}</span>
          </span>
        </span>
        {p.bioStatus === "owner-to-confirm" && (
          <span>
            <StatusChip status="attention">Bio to confirm</StatusChip>
          </span>
        )}
        <span className="line-clamp-3 text-[13.5px] leading-[1.45] text-ink-2">{p.shortBio || "No short bio yet."}</span>
        <CoverRow list={covers} />
        <span aria-hidden className="block flex-1" />
        <span className="grid gap-2 rounded-lg bg-soft p-2.5" style={{ gridTemplateColumns: `repeat(${cells.length}, minmax(0, 1fr))` }}>
          {cells.map((c) => (
            <Stat key={c.label} value={c.value} label={c.label} />
          ))}
        </span>
        <span className="flex items-center justify-between gap-2 text-[12px] text-ink-3">
          <span className="min-w-0">{p.genres.slice(0, 2).join(", ")}</span>
          <span aria-hidden className="inline-flex shrink-0 items-center gap-1 text-[13px] font-bold text-ink group-hover:text-blue">
            Edit
            <ArrowUpRight size={14} strokeWidth={2} />
          </span>
        </span>
        <span className="sr-only">. Edit profile</span>
      </Link>
    </li>
  );
}

const cardGrid = "grid grid-cols-[repeat(auto-fill,minmax(250px,1fr))] gap-4";

function ProfilesSkeleton() {
  return (
    <ul role="status" aria-label="Loading profiles" className={cardGrid}>
      {Array.from({ length: 4 }, (_, i) => (
        <li key={i} className="vol-glass grid gap-3 rounded-card p-[18px]">
          <span className="flex items-center gap-3">
            <span aria-hidden className="vol-breathe block size-14 rounded-full bg-soft" />
            <span className="grid flex-1 gap-2">
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-3 w-1/3" />
            </span>
          </span>
          <Skeleton className="mt-2 h-3 w-4/5" />
          <Skeleton className="h-3 w-3/5" />
          <Skeleton className="h-3 w-2/3" />
        </li>
      ))}
    </ul>
  );
}

/**
 * Profiles (09-UX-FLOWS, M1): one card per profile with initials, real person or pen name, the short
 * bio, a stack of its book covers and the book count. A card opens the profile editor, where the full
 * bio, voice and defaults live, so the bio and the Edit action each appear once. Demo states:
 * ?state=loading, error or empty. With the server running the cards are the server's active profiles.
 */
export default function ProfilesPage() {
  const navigate = useNavigate();
  const canWrite = useCanWrite();
  const demo = useDemoState();
  const mode = useWireMode();
  const api = mode === "api";
  const pens = usePenNames(mode, penNames);
  const apiBooks = useApiBooks(api);
  const demoAll = useProfiles();
  const apiDrafts = useMemo(() => pens.raw.filter((p) => p.status !== "archived").map((p) => draftFromApi(p)), [pens.raw]);
  const counts = useMemo(() => new Map(pens.raw.map((p) => [p.id, profileBookCount(p)])), [pens.raw]);
  const state = mode === "mock" ? demo.state : pens.state;
  const retry = mode === "mock" ? demo.retry : pens.retry;
  const all = api ? apiDrafts : demoAll;
  const list = state === "empty" ? [] : all.filter((p) => !p.archived);
  const coversFor = (id: string): Book[] =>
    api ? (apiBooks.data ?? []).filter((b) => b.profileId === id).map((b) => toPrototypeBook(b)) : books.filter((b) => b.penNameId === id && !b.archived);
  const countFor = (id: string): number => (api ? (counts.get(id) ?? coversFor(id).length) : bookCount(id));
  // Words and Live come from the books themselves. The server's book list carries no word totals, so Words shows
  // in demo mode only; Live waits for the book list rather than guessing.
  const statsFor = (id: string): CardStats => {
    const mine = coversFor(id);
    const booksKnown = !api || apiBooks.data !== undefined;
    return {
      books: countFor(id),
      words: api ? null : mine.reduce((sum, b) => sum + b.words.written, 0),
      live: booksKnown ? mine.filter((b) => b.published !== null).length : null,
    };
  };
  const realCount = list.filter((p) => p.realPerson).length;
  const penCount = list.length - realCount;

  const add = canWrite ? (
    <Button variant="primary" icon={Plus} onClick={() => void navigate("/profiles/new")}>
      Add profile
    </Button>
  ) : undefined;

  const ready = state === "ready" && list.length > 0;

  return (
    <div className="grid min-w-0 content-start gap-7.5 px-4 pt-1.5 pb-8 min-[861px]:px-6">
      <PageHeader
        title="Profiles"
        titleHidden
        summary={
          ready
            ? `${realCount === 1 ? "1 real person" : `${realCount} real people`} and ${penCount === 1 ? "1 pen name" : `${penCount} pen names`}. Each keeps its own bio, voice and defaults.`
            : undefined
        }
        actions={add}
      />
      <ReadOnlyBanner />
      {state === "loading" && <ProfilesSkeleton />}
      {state === "error" && (
        <Banner
          tone="error"
          title="Could not load your profiles"
          action={
            <Button size="sm" onClick={retry}>
              Retry
            </Button>
          }
        >
          {api ? pens.error : "The local server did not answer. Nothing has been lost. Try again in a moment."}
        </Banner>
      )}
      {state !== "loading" && state !== "error" && list.length === 0 && (
        <EmptyState drawing="pen" title="No profiles yet" body="Add your first one. Each profile keeps its own bio, voice and defaults." action={add} />
      )}
      {ready && (
        <ul aria-label="Profiles" className={cardGrid}>
          {list.map((p) => (
            <ProfileCard key={p.id} p={p} stats={statsFor(p.id)} covers={coversFor(p.id)} />
          ))}
        </ul>
      )}
    </div>
  );
}
