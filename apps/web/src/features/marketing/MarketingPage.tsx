import { useEffect, useMemo, useRef, useState } from "react";
import { Archive, Check, Copy, RotateCcw, RotateCw, ShieldCheck, Sparkles } from "lucide-react";
import { Button, Card, EmptyState, Inspector, InspectorSection, PageHeader, Skeleton, StatusChip, Tabs, tabPanelProps } from "../../components/ui";
import { Link } from "react-router";
import { stageOrder, type Book } from "../../demo";
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

type Tab = ItemKind | "archive";
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
  const { book, from, apiBook } = useBook();
  const { state, retry } = useScreenState();
  if (!book) return <NotFound what="book" />;
  if (from === "api")
    return (
      <div className="px-4 py-6 sm:px-8 lg:px-10 lg:py-7">
        {apiBook && apiBook.totals.words === 0 ? <NotYet book={book} /> : <ApiMarketing key={book.id} book={book} />}
      </div>
    );
  return (
    <div className="px-4 py-6 sm:px-8 lg:px-10 lg:py-7">
      {state === "loading" && <LoadingBlock label="Loading marketing" rows={6} />}
      {state === "error" && (
        <>
          <h1 className="font-book text-title text-ink">Marketing</h1>
          <ErrorPanel
            className="mt-5 max-w-[720px]"
            title="Could not load the launch content"
            body="The server did not answer. Nothing was lost. Retry to load the scripts again."
            onRetry={retry}
          />
        </>
      )}
      {(state === "ready" || state === "empty") &&
        (stageOrder.indexOf(book.stage) <= stageOrder.indexOf("writing") ? (
          <NotYet book={book} />
        ) : (
          <MarketingBody key={book.id + state} book={book} empty={state === "empty"} />
        ))}
    </div>
  );
}

/** Marketing opens once the book is written: the scripts quote the finished chapters. */
function NotYet({ book }: { book: Book }) {
  const writing = book.stage === "writing";
  return (
    <>
      <PageHeader title="Marketing" summary="Launch content for this book, drafted from the finished text in the profile's voice." />
      <section
        aria-labelledby="not-yet"
        className="mt-6 grid max-w-[760px] gap-5 rounded-md border border-border bg-sheet p-6 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] sm:gap-8"
      >
        <div>
          <h2 id="not-yet" className="font-book text-heading text-ink">
            Available after the book is written
          </h2>
          <p className="mt-2 text-body text-ink-secondary">
            {writing
              ? `The writer is still on ${book.title}. Once every section is written, Volume drafts the launch content from the finished chapters.`
              : `Volume drafts the launch content once ${book.title} is written, so every line can point to a real chapter.`}
          </p>
          <Link
            to={`/books/${book.id}/writing`}
            className="mt-4 inline-flex h-10 items-center rounded-sm border border-border-strong bg-sheet px-4 text-label font-semibold text-ink hover:bg-sunken"
          >
            {writing ? "Watch the writer" : "Open Writing"}
          </Link>
        </div>
        <div>
          <h3 className="text-label font-semibold text-ink">What you will get</h3>
          <ul className="mt-2 grid gap-2 text-[14px] leading-5 text-ink">
            <li className="flex gap-2">
              <Sparkles size={16} aria-hidden className="mt-0.5 shrink-0 text-ink-secondary" />3 TikTok scripts, each with a hook under 3 seconds, beats and
              on-screen text
            </li>
            <li className="flex gap-2">
              <Sparkles size={16} aria-hidden className="mt-0.5 shrink-0 text-ink-secondary" />2 Instagram captions with hashtags and an image idea
            </li>
            <li className="flex gap-2">
              <Sparkles size={16} aria-hidden className="mt-0.5 shrink-0 text-ink-secondary" />1 launch email with three subject lines to pick from
            </li>
          </ul>
          <p className="mt-3 text-small text-ink-secondary">No invented reviews, rankings or numbers. About $0.04 for the set.</p>
        </div>
      </section>
    </>
  );
}

function MarketingBody({ book, empty }: { book: Book; empty: boolean }) {
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

  const tabItems = useMemo(() => {
    const count = (k: MarketingItem["kind"]) => items.filter((i) => i.kind === k).length;
    return [
      { id: "tiktok", label: "TikTok", count: count("tiktok") },
      { id: "instagram", label: "Instagram", count: count("instagram") },
      { id: "email", label: "Email", count: count("email") },
      { id: "archive", label: "Archive", count: archive.length },
    ];
  }, [items, archive]);

  useStepAction(
    tab === "archive"
      ? null
      : {
          label: generating === tab ? "Generating" : generateLabel[tab].label,
          estimate: generateLabel[tab].cost,
          onClick: () => generate(tab),
          disabledReason: generating ? "Already generating." : undefined,
        },
  );

  return (
    <>
      <PageHeader title="Marketing" summary="Launch content for this book. Copy what you need, regenerate what you do not." />
      <Tabs idBase="mk" label="Content type" className="mt-5" value={tab} onChange={(t) => setTab(t as Tab)} items={tabItems} />

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_var(--vol-inspector)]">
        <div {...tabPanelProps("mk", tab)} className="grid min-w-0 content-start gap-4 focus-visible:outline-offset-4">
          {tab === "archive" ? (
            archive.length === 0 ? (
              <EmptyState drawing="archive" title="Nothing archived" body="Archived and replaced items land here, so nothing is lost." />
            ) : (
              <ul className="grid gap-3">
                {archive.map((a) => (
                  <li key={a.item.data.id}>
                    <Card padding="md" className="flex flex-wrap items-start gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-small text-ink-secondary">
                          {kindLabel[a.item.kind]}, {a.reason.toLowerCase()}, {formatRelative(a.archivedAt)}
                        </p>
                        <p className="mt-1 font-book text-prose-sm text-ink">{headline(a.item)}</p>
                      </div>
                      <Button size="sm" icon={RotateCcw} onClick={() => restore(a.item.data.id)}>
                        Restore
                      </Button>
                    </Card>
                  </li>
                ))}
              </ul>
            )
          ) : (
            <>
              {generating === tab && (
                <div role="status" aria-label="Generating" className="grid gap-3 rounded-md border border-border bg-sheet p-5">
                  <Skeleton className="h-6 w-3/5" />
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-4/5" />
                </div>
              )}
              {list.length === 0 && generating !== tab ? (
                <EmptyState
                  drawing="pen"
                  title={emptyCopy[tab]}
                  body={`The writer drafts these from the finished chapters in the profile's voice. No reviews, rankings or numbers are invented. ${generateLabel[tab].label}, at the foot of the page, makes the first ones.`}
                />
              ) : (
                <ul className="grid gap-4">
                  {list.map((item) => (
                    <li key={item.data.id}>
                      <ItemCard
                        item={item}
                        selected={selected?.data.id === item.data.id}
                        busy={Boolean(busy[item.data.id])}
                        subjectIndex={subjectIdx[item.data.id] ?? 0}
                        onSubject={(i) => setSubjectIdx((m) => ({ ...m, [item.data.id]: i }))}
                        onSelect={() => setSelectedId(item.data.id)}
                        onCopy={() => void copy(itemText(item, subjectIdx[item.data.id] ?? 0), kindLabel[item.kind])}
                        onRegenerate={() => regenerate(item)}
                        onArchive={() => archiveItem(item)}
                        onToggleUsed={() => toggleUsed(item)}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>

        <Inspector label="Selected item" width="100%" className="self-start rounded-md border xl:sticky xl:top-[calc(var(--shell-topbar)+16px)]">
          {selected && tab !== "archive" ? (
            <SelectedPanel item={selected} subjectIndex={subjectIdx[selected.data.id] ?? 0} onCopy={(text, what) => void copy(text, what)} />
          ) : (
            <InspectorSection title="Selected item">
              <p className="text-small text-ink-secondary">{tab === "archive" ? "Restore an item to edit or copy it." : "Pick an item to copy its parts."}</p>
            </InspectorSection>
          )}
          <InspectorSection title="Guardrails" icon={ShieldCheck}>
            <p className="text-small text-ink-secondary">
              No invented reviews, testimonials, rankings or awards. Review requests ask for an honest review and offer nothing in return (KDP rules 10.6 and
              10.7).
            </p>
          </InspectorSection>
        </Inspector>
      </div>
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

interface ItemCardProps {
  item: MarketingItem;
  selected: boolean;
  busy: boolean;
  subjectIndex: number;
  onSubject: (i: number) => void;
  onSelect: () => void;
  onCopy: () => void;
  onRegenerate: () => void;
  onArchive: () => void;
  onToggleUsed: () => void;
}

function ItemCard({ item, selected, busy, subjectIndex, onSubject, onSelect, onCopy, onRegenerate, onArchive, onToggleUsed }: ItemCardProps) {
  return (
    <article
      aria-label={`${kindLabel[item.kind]}: ${headline(item)}`}
      aria-busy={busy || undefined}
      onFocusCapture={onSelect}
      onClick={onSelect}
      className={cn("rounded-md border bg-sheet p-5", selected ? "vol-pencil-edge border-select" : "border-border")}
    >
      {busy ? (
        <div role="status" aria-label="Regenerating" className="grid gap-3">
          <Skeleton className="h-6 w-3/5" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-4/5" />
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            {item.status === "used" ? <StatusChip status="passed">Used</StatusChip> : <StatusChip status="queued">Draft</StatusChip>}
            <span className="num text-small text-ink-secondary">{meta(item)}</span>
          </div>
          {item.kind === "tiktok" && <TikTokBody item={item} />}
          {item.kind === "instagram" && <InstagramBody item={item} />}
          {item.kind === "email" && <EmailBody item={item} subjectIndex={subjectIndex} onSubject={onSubject} />}
        </>
      )}
      <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-3">
        <Button size="sm" icon={Copy} onClick={onCopy} disabled={busy}>
          Copy
        </Button>
        <Button size="sm" variant="ghost" icon={RotateCw} estimate="about $0.01" loading={busy} loadingLabel="Regenerating" onClick={onRegenerate}>
          Regenerate
        </Button>
        <Button size="sm" variant="ghost" icon={Check} onClick={onToggleUsed} disabled={busy} aria-pressed={item.status === "used"}>
          {item.status === "used" ? "Mark as draft" : "Mark as used"}
        </Button>
        <Button size="sm" variant="ghost" icon={Archive} onClick={onArchive} disabled={busy} className="sm:ml-auto">
          Archive
        </Button>
      </div>
    </article>
  );
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
