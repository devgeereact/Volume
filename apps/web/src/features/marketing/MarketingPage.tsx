import { useEffect, useRef, useState } from "react";
import { useCanWrite } from "../../lib/access";
import { Archive, Check, Copy, RotateCcw, RotateCw, Sparkles } from "lucide-react";
import { Button, EmptyState, InspectorSection, PageHeader, Skeleton, tabPanelProps } from "../../components/ui";
import { buttonClasses } from "../../components/ui/Button";
import { cardTitle, stepBody } from "../writing/studio";
import {
  BusyPreview,
  ChannelTabs,
  channelLabel,
  GalleryItem,
  galleryGrid,
  Guardrails,
  kitCard,
  kitColours,
  KitEmpty,
  LaunchHero,
  PostPreview,
  type Channel,
} from "./LaunchKit";
import { PostDetail } from "./PostDetail";
import { Link } from "react-router";
import type { Book } from "../../demo";
import { cn } from "../../lib/cn";
import { formatRelative } from "../../lib/format";
import { useToast } from "../../lib/toast";
import { useBook } from "../../lib/useBook";
import { useStepAction } from "../../lib/stepAction";
import { NotFound } from "../../shell/NotFound";
import { ErrorPanel, LoadingBlock, useScreenState } from "../writing/screenState";
import { ApiMarketing } from "./ApiMarketing";
import { initialArchive, initialItems, itemText, nextItem, spokenSeconds, type ArchivedItem, type ItemKind, type MarketingItem } from "./marketingExtras";

/* Marketing (docs/03-design/UX-SPEC.md, M12): TikTok scripts, Instagram captions and a launch email per book.
   Regenerate and Generate are mock jobs with timers; copy uses the clipboard and confirms with a toast. */

type Tab = Channel;
const GEN_MS = 1200;
const DEMO_NOW = "2026-10-04T14:40:00+01:00";
const kindLabel: Record<ItemKind, string> = { tiktok: "TikTok script", instagram: "Instagram caption", email: "Launch email" };
const generateLabel: Record<ItemKind, { label: string; cost: string }> = {
  tiktok: { label: "Generate 2 scripts", cost: "about $0.02" },
  instagram: { label: "Generate 2 captions", cost: "about $0.01" },
  email: { label: "Generate an email", cost: "about $0.01" },
};
const emptyCopy: Record<ItemKind, string> = {
  tiktok: "No scripts yet for this book.",
  instagram: "No captions yet for this book.",
  email: "No launch email yet for this book.",
};

export default function MarketingPage() {
  const { book, from } = useBook();
  const { state, retry } = useScreenState();
  if (!book) return <NotFound what="book" />;
  if (from === "api")
    return (
      <div className={cn(stepBody, "grid gap-4")}>
        <ApiMarketing key={book.id} book={book} />
      </div>
    );
  return (
    <div className={cn(stepBody, "grid gap-4")}>
      {state === "loading" && <LoadingBlock label="Loading marketing" rows={6} className="vol-glass rounded-card p-6" />}
      {state === "error" && (
        <>
          <PageHeader title="Marketing" />
          <ErrorPanel
            className="max-w-[720px]"
            title="Could not load the launch content"
            body="The server did not answer. Nothing was lost. Retry to load the scripts again."
            onRetry={retry}
          />
        </>
      )}
      {(state === "ready" || state === "empty") && <MarketingBody key={book.id + state} book={book} empty={state === "empty" || !book.writingComplete} />}
    </div>
  );
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** The one line shown beside Generate and Regenerate while writing is not complete (D-049). */
export const MARKETING_LOCKED = "Finish writing every chapter to open marketing.";

/**
 * Marketing opens once writing is complete (D-049): the scripts quote the finished chapters. Until then the
 * screen still lists any items; only Generate and Regenerate wait, and this notice says why.
 */
export function LockedNotice({ book }: { book: Book }) {
  const writing = book.stage === "writing";
  const { tiktok, instagram } = book.marketingCounts;
  return (
    <section aria-labelledby="not-yet" className="vol-glass grid gap-5 rounded-card p-[18px] sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] sm:gap-8 sm:p-[22px]">
      <div>
        <h2 id="not-yet" className="text-[15px] leading-5 font-semibold text-ink">
          Opens when writing is finished
        </h2>
        <p className="mt-1.5 text-[14px] leading-[1.5] text-ink-2">
          {MARKETING_LOCKED} Volume then drafts the launch content from the finished text, so every line can point to a real chapter.
        </p>
        <Link to={`/books/${book.id}/writing`} className={cn(buttonClasses("secondary", "md"), "mt-4")}>
          {writing ? "Watch the writer" : "Open Writing"}
        </Link>
      </div>
      <div>
        <h3 className="text-label font-semibold text-ink">What you will get</h3>
        <ul className="mt-2 grid gap-2 text-[14px] leading-5 text-ink">
          <li className="flex gap-2">
            <Sparkles size={16} aria-hidden className="mt-0.5 shrink-0 text-ink-secondary" />
            {plural(tiktok, "TikTok script", "TikTok scripts")}, each with a hook under 3 seconds, beats and on-screen text
          </li>
          <li className="flex gap-2">
            <Sparkles size={16} aria-hidden className="mt-0.5 shrink-0 text-ink-secondary" />
            {plural(instagram, "Instagram caption", "Instagram captions")} with hashtags and an image idea
          </li>
          <li className="flex gap-2">
            <Sparkles size={16} aria-hidden className="mt-0.5 shrink-0 text-ink-secondary" />1 launch email with three subject lines to pick from
          </li>
        </ul>
        <p className="mt-3 text-small text-ink-secondary">No invented reviews, rankings or numbers. About $0.04 for the set.</p>
      </div>
    </section>
  );
}

function MarketingBody({ book, empty }: { book: Book; empty: boolean }) {
  const canWrite = useCanWrite();
  const author = useBook().penName?.name ?? "";
  const locked = book.writingComplete ? undefined : MARKETING_LOCKED;
  const toast = useToast();
  const [items, setItems] = useState<MarketingItem[]>(() => (empty ? [] : initialItems(book)));
  const [archive, setArchive] = useState<ArchivedItem[]>(() => (empty ? [] : initialArchive(book)));
  const [tab, setTab] = useState<Tab>("tiktok");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [generating, setGenerating] = useState<ItemKind | null>(null);
  const [subjectIdx, setSubjectIdx] = useState<Record<string, number>>({});
  const [announce, setAnnounce] = useState("");
  const counter = useRef(0);
  const timers = useRef<number[]>([]);
  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);

  const byKind = (k: ItemKind) => items.filter((i) => i.kind === k);
  const list = tab === "archive" ? [] : byKind(tab);
  const selected = items.find((i) => i.data.id === selectedId) ?? list[0] ?? null;

  async function copy(text: string, what: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.show({ tone: "success", title: `${what} copied`, body: `${text.length} characters on the clipboard.` });
    } catch {
      toast.show({ tone: "error", title: "Could not copy", body: "The browser blocked the clipboard. Select the text and copy it by hand." });
    }
  }

  function regenerate(item: MarketingItem) {
    const id = item.data.id;
    setBusy((b) => ({ ...b, [id]: true }));
    setAnnounce(`Regenerating the ${kindLabel[item.kind].toLowerCase()}.`);
    timers.current.push(
      window.setTimeout(() => {
        const next = nextItem(book, item.kind, counter.current++);
        setItems((list) => list.map((i) => (i.data.id === id ? next : i)));
        setArchive((a) => [{ item, archivedAt: DEMO_NOW, reason: "Replaced by a newer version" }, ...a]);
        setBusy((b) => ({ ...b, [id]: false }));
        if (selectedId === id) setSelectedId(next.data.id);
        setAnnounce("New version ready. The old one is in the archive.");
      }, GEN_MS),
    );
  }

  function generate(kind: ItemKind) {
    setGenerating(kind);
    setAnnounce("Generating.");
    timers.current.push(
      window.setTimeout(() => {
        const n = kind === "email" ? 1 : 2;
        const fresh = Array.from({ length: n }, () => nextItem(book, kind, counter.current++));
        setItems((list) => [...fresh, ...list]);
        setGenerating(null);
        setSelectedId(fresh[0]?.data.id ?? null);
        setAnnounce(`${n} new ${n === 1 ? "item" : "items"} ready.`);
      }, GEN_MS),
    );
  }

  function archiveItem(item: MarketingItem) {
    setItems((list) => list.filter((i) => i.data.id !== item.data.id));
    setArchive((a) => [{ item, archivedAt: DEMO_NOW, reason: "Archived by you" }, ...a]);
    toast.show({ tone: "success", title: `${kindLabel[item.kind]} archived`, action: { label: "Undo", onClick: () => restore(item.data.id) } });
  }

  function restore(id: string) {
    setArchive((a) => {
      const found = a.find((x) => x.item.data.id === id);
      if (found) setItems((list) => (list.some((i) => i.data.id === id) ? list : [found.item, ...list]));
      return a.filter((x) => x.item.data.id !== id);
    });
    setAnnounce("Restored.");
  }

  function toggleUsed(item: MarketingItem) {
    setItems((list) => list.map((i) => (i.data.id === item.data.id ? { ...i, status: i.status === "used" ? "draft" : "used" } : i)));
  }

  useStepAction(
    tab === "archive"
      ? null
      : {
          label: generating === tab ? "Generating" : generateLabel[tab].label,
          estimate: generateLabel[tab].cost,
          onClick: () => generate(tab),
          disabledReason: locked ?? (generating ? "Already generating." : undefined),
        },
  );

  const counts: Record<Channel, number> = {
    tiktok: byKind("tiktok").length,
    instagram: byKind("instagram").length,
    email: byKind("email").length,
    archive: archive.length,
  };
  const hashtags = new Set(items.flatMap((i) => (i.kind === "email" ? [] : i.data.hashtags))).size;
  const nothingYet = items.length === 0 && archive.length === 0 && generating === null;
  const selectedIndex = selected ? list.findIndex((i) => i.data.id === selected.data.id) : -1;

  return (
    <>
      <PageHeader title="Marketing" summary="Launch scripts and posts written from the book. Change them before you post." />
      <LaunchHero
        book={book}
        author={author}
        live={items.length > 0}
        counts={{
          tiktok: items.length > 0 ? counts.tiktok : book.marketingCounts.tiktok,
          instagram: items.length > 0 ? counts.instagram : book.marketingCounts.instagram,
          email: items.length > 0 ? counts.email : 1,
          hashtags,
        }}
      />
      {locked && <LockedNotice book={book} />}
      {nothingYet ? (
        locked ? null : (
          <KitEmpty book={book} label={generateLabel.tiktok.label} />
        )
      ) : (
        <>
          <ChannelTabs value={tab} onChange={setTab} counts={counts} />
          <div className="grid grid-cols-1 items-start gap-4 min-[1025px]:grid-cols-[minmax(0,1fr)_320px]">
            <section
              {...tabPanelProps("mk", tab)}
              aria-label={tab === "archive" ? "Archive" : `${channelLabel[tab]} previews`}
              className={cn(kitCard, "min-w-0 focus-visible:outline-offset-4")}
              style={kitColours(book)}
            >
              <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
                <h2 className={cardTitle}>{tab === "archive" ? "Archive" : `${channelLabel[tab]} previews`}</h2>
                <small className="text-[12px] text-ink-3">
                  {tab === "archive" ? "Replaced and archived items. Restore any of them." : "Pick one to read it in full"}
                </small>
              </div>
              {tab === "archive" ? (
                archive.length === 0 ? (
                  <EmptyState
                    drawing="archive"
                    title="Nothing archived"
                    body="Archived and replaced items land here, so nothing is lost."
                    className="shadow-none"
                  />
                ) : (
                  <ul className="grid gap-2.5">
                    {archive.map((a) => (
                      <li key={a.item.data.id} className="flex flex-wrap items-start gap-3 rounded-[14px] border border-line bg-panel-2 p-3.5">
                        <div className="min-w-0 flex-1">
                          <p className="text-[12px] text-ink-3">
                            {kindLabel[a.item.kind]}, {a.reason.toLowerCase()}, {formatRelative(a.archivedAt)}
                          </p>
                          <p className="mt-1 font-book text-prose-sm text-ink">{headline(a.item)}</p>
                        </div>
                        {canWrite && (
                          <Button size="sm" icon={RotateCcw} onClick={() => restore(a.item.data.id)}>
                            Restore
                          </Button>
                        )}
                      </li>
                    ))}
                  </ul>
                )
              ) : (
                <>
                  {generating === tab && (
                    <div role="status" aria-label="Generating" className="mb-4 grid gap-3 rounded-[14px] border border-line bg-panel-2 p-4">
                      <Skeleton className="h-6 w-3/5" />
                      <Skeleton className="h-4 w-full" />
                    </div>
                  )}
                  {list.length === 0 && generating !== tab ? (
                    <EmptyState
                      drawing="pen"
                      title={emptyCopy[tab]}
                      className="shadow-none"
                      body={
                        locked ??
                        `The writer drafts these from the finished chapters in the profile's voice. No reviews, rankings or numbers are invented. ${generateLabel[tab].label} makes the first ones.`
                      }
                    />
                  ) : (
                    <ul className={galleryGrid(tab)}>
                      {list.map((item, i) => (
                        <li key={item.data.id} className="min-w-0">
                          <GalleryItem
                            label={`${kindLabel[item.kind]}: ${headline(item)}`}
                            n={i + 1}
                            selected={selected?.data.id === item.data.id}
                            busy={Boolean(busy[item.data.id])}
                            onSelect={() => setSelectedId(item.data.id)}
                          >
                            {busy[item.data.id] ? <BusyPreview /> : <PostPreview book={book} author={author} item={item} />}
                          </GalleryItem>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}
            </section>

            <aside aria-label="Selected item" className={cn(kitCard, "min-[1025px]:sticky min-[1025px]:top-[calc(var(--shell-sticky-top)+16px)]")}>
              {selected && tab !== "archive" ? (
                <PostDetail
                  item={selected}
                  index={Math.max(0, selectedIndex)}
                  subjectIndex={subjectIdx[selected.data.id] ?? 0}
                  onSubject={(i) => setSubjectIdx((m) => ({ ...m, [selected.data.id]: i }))}
                  onCopy={() => void copy(itemText(selected, subjectIdx[selected.data.id] ?? 0), kindLabel[selected.kind])}
                  busy={busy[selected.data.id] ? <BusyPreview /> : undefined}
                  actions={
                    canWrite ? (
                      <>
                        <Button
                          size="sm"
                          icon={RotateCw}
                          estimate="about $0.01"
                          loading={Boolean(busy[selected.data.id])}
                          loadingLabel="Regenerating"
                          disabledReason={locked}
                          onClick={() => regenerate(selected)}
                        >
                          Regenerate
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          icon={Check}
                          onClick={() => toggleUsed(selected)}
                          disabled={Boolean(busy[selected.data.id])}
                          aria-pressed={selected.status === "used"}
                        >
                          {selected.status === "used" ? "Mark as draft" : "Mark as used"}
                        </Button>
                        <Button size="sm" variant="ghost" icon={Archive} onClick={() => archiveItem(selected)} disabled={Boolean(busy[selected.data.id])}>
                          Archive
                        </Button>
                      </>
                    ) : undefined
                  }
                  parts={<SelectedPanel item={selected} subjectIndex={subjectIdx[selected.data.id] ?? 0} onCopy={(text, what) => void copy(text, what)} />}
                />
              ) : (
                <p className="text-[13px] text-ink-2">{tab === "archive" ? "Restore an item to edit or copy it." : "Pick an item to read and copy it."}</p>
              )}
              <Guardrails />
            </aside>
          </div>
        </>
      )}
      <span className="sr-only" role="status" aria-live="polite">
        {announce}
      </span>
    </>
  );
}

export function headline(item: MarketingItem): string {
  if (item.kind === "tiktok") return item.data.hook;
  if (item.kind === "instagram") return item.data.caption;
  return item.data.subject;
}

export function meta(item: MarketingItem): string {
  if (item.kind === "tiktok") {
    const s = spokenSeconds(item.data.hook);
    return `About ${item.data.lengthSeconds} s, ${item.data.beats.length} beats, hook about ${s} s spoken`;
  }
  if (item.kind === "instagram") return `${item.data.caption.length} characters, ${item.data.hashtags.length} of 10 hashtags`;
  return `${item.data.subjects.length} subject ${item.data.subjects.length === 1 ? "line" : "lines"}, ${item.data.body.length} ${item.data.body.length === 1 ? "paragraph" : "paragraphs"}`;
}

export function TikTokBody({ item }: { item: Extract<MarketingItem, { kind: "tiktok" }> }) {
  const d = item.data;
  const spoken = spokenSeconds(d.hook);
  return (
    <>
      <p className="mt-3 text-small text-ink-secondary">Hook</p>
      <h2 className="font-book text-heading text-ink">{d.hook}</h2>
      {spoken > 3 && <p className="mt-1 text-small text-accent-text">The hook runs over 3 seconds spoken. Shorten it or regenerate.</p>}
      <p className="mt-4 text-small text-ink-secondary">Beats</p>
      <ol className="mt-1 grid list-decimal gap-1 pl-5 text-body text-ink marker:text-ink-tertiary">
        {d.beats.map((b) => (
          <li key={b}>{b}</li>
        ))}
      </ol>
      {d.onScreenText.length > 0 && (
        <>
          <p className="mt-4 text-small text-ink-secondary">On-screen text</p>
          <ul className="mt-1 flex flex-wrap gap-1.5">
            {d.onScreenText.map((t) => (
              <li key={t} className="rounded-xs bg-sunken px-2 py-1 text-small text-ink">
                {t}
              </li>
            ))}
          </ul>
        </>
      )}
      <p className="mt-4 text-small text-ink-secondary">
        Caption and call to action <span className="num">({d.caption.length} characters)</span>
      </p>
      <p className="text-body text-ink">{d.caption}</p>
      <p className="mt-1 text-small text-ink-secondary">{d.hashtags.join(" ")}</p>
    </>
  );
}

export function InstagramBody({ item }: { item: Extract<MarketingItem, { kind: "instagram" }> }) {
  const d = item.data;
  return (
    <>
      <p className="mt-3 font-book text-prose-sm text-ink">{d.caption}</p>
      <p className="mt-2 text-small text-ink-secondary">{d.hashtags.join(" ")}</p>
      {d.imageIdea && (
        <>
          <p className="mt-3 text-small text-ink-secondary">Image idea</p>
          <p className="text-body text-ink">{d.imageIdea}</p>
        </>
      )}
    </>
  );
}

export function EmailBody({
  item,
  subjectIndex,
  onSubject,
}: {
  item: Extract<MarketingItem, { kind: "email" }>;
  subjectIndex: number;
  onSubject: (i: number) => void;
}) {
  const d = item.data;
  return (
    <>
      <fieldset className="mt-3">
        <legend className="text-small text-ink-secondary">Subject line, pick one</legend>
        <div className="mt-1 grid gap-1">
          {d.subjects.map((s, i) => (
            <label key={s} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-sm px-2 hover:bg-sunken has-checked:bg-select-wash">
              <input
                type="radio"
                name={`subject-${d.id}`}
                checked={subjectIndex === i}
                onChange={() => onSubject(i)}
                className="size-4 accent-(--vol-select)"
              />
              <span className="min-w-0 flex-1 text-body text-ink">{s}</span>
              <span className="num text-caption text-ink-tertiary">{s.length}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <p className="mt-3 text-small text-ink-secondary">
        Preview text <span className="num">({d.preview.length} characters)</span>
      </p>
      <p className="text-body text-ink">{d.preview}</p>
      <div className="mt-4 grid max-w-[68ch] gap-3 rounded-md bg-canvas p-4 font-book text-prose-sm text-ink">
        {d.body.map((p, i) => (
          <p key={i}>{p}</p>
        ))}
      </div>
    </>
  );
}

export function SelectedPanel({ item, subjectIndex, onCopy }: { item: MarketingItem; subjectIndex: number; onCopy: (text: string, what: string) => void }) {
  const parts: [string, string][] =
    item.kind === "tiktok"
      ? [
          ["Hook", item.data.hook],
          ["Beats", item.data.beats.map((b, i) => `${i + 1}. ${b}`).join("\n")],
          ["Caption", `${item.data.caption}\n${item.data.hashtags.join(" ")}`],
        ]
      : item.kind === "instagram"
        ? [
            ["Caption", item.data.caption],
            ["Hashtags", item.data.hashtags.join(" ")],
          ]
        : [
            ["Subject", item.data.subjects[subjectIndex] ?? item.data.subject],
            ["Preview text", item.data.preview],
            ["Body", item.data.body.join("\n\n")],
          ];
  return (
    <InspectorSection title="Copy one part">
      <ul className="grid gap-1">
        {parts.map(([label, text]) => (
          <li key={label} className="flex items-center justify-between gap-2">
            <Button size="sm" variant="ghost" icon={Copy} className="-ml-2" onClick={() => onCopy(text, label)}>
              Copy {label.toLowerCase()}
            </Button>
            <span className="num text-caption text-ink-tertiary">{text.length} characters</span>
          </li>
        ))}
      </ul>
    </InspectorSection>
  );
}
