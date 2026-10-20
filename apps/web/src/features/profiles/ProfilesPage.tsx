import { Link, useNavigate } from "react-router";
import { ReadOnlyBanner, useCanWrite } from "../../lib/access";
import { ChevronRight, Plus, UserRound } from "lucide-react";
import { Banner, Button, Cover, EmptyState, PageHeader, Skeleton, StatusChip } from "../../components/ui";
import { useMemo } from "react";
import { toPrototypeBook } from "../../api/adapters";
import { profileBookCount, useApiBooks, usePenNames, useWireMode } from "../../api/wire-a";
import { books } from "../../demo/books";
import { penNames } from "../../demo/penNames";
import type { Book } from "../../demo/types";
import { cn } from "../../lib/cn";
import { useDemoState } from "../library/demoState";
import { libraryCover } from "../library/draftCover";
import { draftFromApi } from "./profileApi";
import { bookCount, useProfiles, type ProfileDraft } from "./profileStore";

/** Gilt initials circle for a profile (44 px), the larger sibling of the spine's avatar. */
export function ProfileAvatar({ initials }: { initials: string }) {
  return (
    <span aria-hidden className="grid size-11 shrink-0 place-items-center rounded-full bg-accent text-[14px] leading-none font-bold text-on-accent">
      {initials}
    </span>
  );
}

/** Pill that marks a profile as a real person (icon plus words, never colour alone). */
export function RealPersonBadge() {
  return (
    <span className="inline-flex h-6 items-center gap-1.5 rounded-pill bg-sunken px-2.5 text-[12.5px] leading-none font-semibold whitespace-nowrap text-ink-secondary">
      <UserRound size={14} strokeWidth={2} aria-hidden />
      Real person
    </span>
  );
}

/** Up to four of the profile's book covers, overlapping like books laid on a desk. */
function CoverStack({ list: all }: { list: Book[] }) {
  const list = all.slice(0, 4);
  if (list.length === 0) return null;
  return (
    <span aria-hidden className="flex">
      {list.map((b, i) => (
        <span key={b.id} className={cn("block w-[30px] shrink-0", i > 0 && "-ml-2.5")}>
          <Cover title={b.title} author="" design={libraryCover(b).design} image={libraryCover(b).image} width={30} hideSubtitle decorative />
        </span>
      ))}
    </span>
  );
}

function ProfileCard({ p, count, covers }: { p: ProfileDraft; count: number; covers: Book[] }) {
  const kind = p.realPerson
    ? ["Real person", p.location.split(",")[0]].filter(Boolean).join(", ")
    : ["Pen name", p.publishing.imprint].filter(Boolean).join(", ");
  return (
    <li className="min-w-0">
      <Link
        to={`/profiles/${p.id}`}
        className="group flex h-full flex-col rounded-md border border-border bg-sheet p-5 -outline-offset-2 hover:border-border-strong"
      >
        <span className="flex items-start gap-3.5">
          <ProfileAvatar initials={p.initials || "?"} />
          <span className="min-w-0 flex-1">
            <span className="block font-book text-heading text-ink group-hover:text-select">{p.name}</span>
            <span className="mt-0.5 flex items-center gap-1.5 text-small text-ink-secondary">
              {p.realPerson && <UserRound size={14} strokeWidth={2} aria-hidden />}
              {kind}
            </span>
          </span>
          <ChevronRight size={18} aria-hidden className="mt-1.5 shrink-0 text-ink-tertiary group-hover:text-select" />
        </span>
        {p.bioStatus === "owner-to-confirm" && (
          <span className="mt-3">
            <StatusChip status="attention">Bio to confirm</StatusChip>
          </span>
        )}
        <span className="mt-3.5 line-clamp-3 font-book text-[14.5px] leading-[23px] text-ink">{p.shortBio || "No short bio yet."}</span>
        <span aria-hidden className="block min-h-4 flex-1" />
        <span className="flex items-center gap-3 border-t border-border pt-3.5 text-small text-ink-secondary">
          <CoverStack list={covers} />
          <span className="num">{count === 0 ? "No books yet" : `${count} ${count === 1 ? "book" : "books"}`}</span>
        </span>
        <span className="sr-only">. Edit profile</span>
      </Link>
    </li>
  );
}

function ProfilesSkeleton() {
  return (
    <ul role="status" aria-label="Loading profiles" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 4 }, (_, i) => (
        <li key={i} className="grid gap-3 rounded-md border border-border bg-sheet p-5">
          <span className="flex items-center gap-3.5">
            <span aria-hidden className="vol-breathe block size-11 rounded-full bg-sunken" />
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
  const realCount = list.filter((p) => p.realPerson).length;
  const penCount = list.length - realCount;

  const add = canWrite ? (
    <Button variant="primary" icon={Plus} onClick={() => void navigate("/profiles/new")}>
      Add profile
    </Button>
  ) : undefined;

  const ready = state === "ready" && list.length > 0;

  return (
    <div className="grid content-start gap-7 px-4 py-6 sm:px-8 lg:px-10 lg:py-7">
      <PageHeader
        title="Profiles"
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
        <ul aria-label="Profiles" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {list.map((p) => (
            <ProfileCard key={p.id} p={p} count={countFor(p.id)} covers={coversFor(p.id)} />
          ))}
        </ul>
      )}
    </div>
  );
}
