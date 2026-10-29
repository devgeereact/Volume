import { useMemo, useState } from "react";
import { useCanWrite } from "../../lib/access";
import { Archive, Check, PenLine, RotateCcw, RotateCw, X } from "lucide-react";
import { Banner, Button, EmptyState, Input, Loader, PageHeader, tabPanelProps, Textarea } from "../../components/ui";
import type { Book } from "../../demo";
import { useGenerateMarketing, useMarketing, useMarketingStatus, usePatchMarketing, useRememberJob } from "../../api/hooks";
import { productionApi } from "../../api/production";
import { isApiError } from "../../api/client";
import type { ApiMarketingItem, MarketingKind, MarketingPatch } from "../../api/types";
import { errorText, jobStatusText, useJobWatch } from "../../api/wire-c";
import { cn } from "../../lib/cn";
import { formatRelative } from "../../lib/format";
import { useToast } from "../../lib/toast";
import { useStepAction } from "../../lib/stepAction";
import { ErrorPanel, LoadingBlock } from "../writing/screenState";
import { headline, LockedNotice, MARKETING_LOCKED, SelectedPanel } from "./MarketingPage";
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
import { useBook } from "../../lib/useBook";
import { cardTitle } from "../writing/studio";
import { itemText, type ItemKind, type MarketingItem } from "./marketingExtras";

/* Marketing on the Volume server (API mode): Generate is a job (progress over SSE), items are listed
   from GET /marketing, edited with PATCH, marked used or draft, archived and restored. */

type Tab = Channel;
const KIND: Record<ItemKind, MarketingKind> = { tiktok: "tiktok_script", instagram: "instagram_caption", email: "launch_email" };
const kindLabel: Record<ItemKind, string> = { tiktok: "TikTok script", instagram: "Instagram caption", email: "Launch email" };
const generateLabel: Record<ItemKind, { label: string; cost: string }> = {
  tiktok: { label: "Generate scripts", cost: "about $0.02" },
  instagram: { label: "Generate captions", cost: "about $0.01" },
  email: { label: "Generate an email", cost: "about $0.01" },
};
const emptyCopy: Record<ItemKind, string> = {
  tiktok: "No scripts yet for this book.",
  instagram: "No captions yet for this book.",
  email: "No launch email yet for this book.",
};

/** The server's 409 `writing_incomplete` in the screen's words; anything else as the server put it. */
function marketingError(e: unknown): string {
  if (isApiError(e) && e.code === "writing_incomplete") return MARKETING_LOCKED;
  return errorText(e);
}

function kindOf(k: string): ItemKind | null {
  return k === "tiktok_script" ? "tiktok" : k === "instagram_caption" ? "instagram" : k === "launch_email" ? "email" : null;
}

const lines = (t: string) =>
  t
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean);

/** A server item as the screen's item. Fields the server does not keep stay empty. */
function toItem(i: ApiMarketingItem): MarketingItem | null {
  const kind = kindOf(i.kind);
  const status = i.status === "used" ? "used" : "draft";
  if (kind === "tiktok") {
    const all = lines(i.body);
    return {
      kind,
      status,
      data: {
        id: i.id,
        hook: i.hook ?? "",
        beats: all.filter((l) => !l.startsWith("On screen:")),
        onScreenText: all.filter((l) => l.startsWith("On screen:")).map((l) => l.replace(/^On screen:\s*/, "")),
        caption: i.cta ?? "",
        hashtags: i.hashtags,
        lengthSeconds: i.durationS ?? 0,
      },
    };
  }
  if (kind === "instagram")
    return { kind, status, data: { id: i.id, caption: i.body, hashtags: i.hashtags, imageIdea: i.imageIdea?.trim() ? i.imageIdea : "" } };
  if (kind === "email") {
    const subject = i.title ?? "";
    const offered = (i.subjectLines ?? []).filter((l) => l.trim().length > 0);
    const subjects = offered.length > 0 ? offered : subject ? [subject] : [];
    // The chosen line is the item's title; keep it in the list even after an edit.
    const all = subject && !subjects.includes(subject) ? [subject, ...subjects] : subjects;
    return { kind, status, data: { id: i.id, subject, subjects: all, preview: i.hook ?? "", body: lines(i.body) } };
  }
  return null;
}

export function ApiMarketing({ book }: { book: Book }) {
  const canWrite = useCanWrite();
  const author = useBook().penName?.name ?? "";
  const bookId = book.id;
  const locked = book.writingComplete ? undefined : MARKETING_LOCKED;
  const toast = useToast();
  const listQ = useMarketing(bookId, { includeArchived: true });
  const generate = useGenerateMarketing();
  const patch = usePatchMarketing();
  const setStatus = useMarketingStatus();
  const [tab, setTab] = useState<Tab>("tiktok");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [job, setJob] = useState<{ id: string; kind: ItemKind } | null>(null);
  const [regen, setRegen] = useState<{ id: string; itemId: string } | null>(null);
  const rememberJobC = useRememberJob();
  const [problem, setProblem] = useState<string | null>(null);
  const [announce, setAnnounce] = useState("");

  const watch = useJobWatch(bookId, job?.id, (w) => {
    void listQ.refetch();
    setJob(null);
    if (w.ok) setAnnounce("New items ready.");
    else setProblem(`Nothing was generated. ${w.error ?? "Try again."}`);
  });
  const generating = generate.isPending || watch.running;
  const regenWatch = useJobWatch(bookId, regen?.id, (w) => {
    void listQ.refetch();
    setRegen(null);
    if (w.ok) setAnnounce("New version ready.");
    else setProblem(`The item was not written again. ${w.error ?? "Nothing changed. Try again."}`);
  });

  async function regenerate(itemId: string) {
    try {
      const r = await productionApi.regenerateMarketing(itemId);
      rememberJobC(r);
      setRegen({ id: r.jobId, itemId });
      setProblem(null);
      setAnnounce("Writing it again.");
    } catch (e) {
      setProblem(marketingError(e));
    }
  }

  const subjectIndex = (item: MarketingItem) => (item.kind === "email" ? Math.max(0, item.data.subjects.indexOf(item.data.subject)) : 0);

  const raw = useMemo(() => listQ.data ?? [], [listQ.data]);
  const live = useMemo(() => raw.filter((i) => i.status !== "archived"), [raw]);
  const archived = useMemo(() => raw.filter((i) => i.status === "archived"), [raw]);
  const items = useMemo(() => live.map(toItem).filter((x): x is MarketingItem => x !== null), [live]);
  const byKind = (k: ItemKind) => items.filter((i) => i.kind === k);
  const list = tab === "archive" ? [] : byKind(tab);
  const selected = items.find((i) => i.data.id === selectedId) ?? list[0] ?? null;
  const rawById = useMemo(() => new Map(raw.map((r) => [r.id, r])), [raw]);
  const now = new Date().toISOString();

  async function copy(text: string, what: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.show({ tone: "success", title: `${what} copied`, body: `${text.length} characters on the clipboard.` });
    } catch {
      toast.show({ tone: "error", title: "Could not copy", body: "The browser blocked the clipboard. Select the text and copy it by hand." });
    }
  }

  async function run(kind: ItemKind) {
    try {
      const r = await generate.mutateAsync({ bookId, kinds: [KIND[kind]] });
      setJob({ id: r.jobId, kind });
      setProblem(null);
      setAnnounce("Generating.");
    } catch (e) {
      setProblem(marketingError(e));
    }
  }

  async function save(id: string, p: MarketingPatch) {
    try {
      await patch.mutateAsync({ bookId, itemId: id, patch: p });
      setEditing(null);
      setProblem(null);
      setAnnounce("Saved.");
    } catch (e) {
      setProblem(errorText(e));
    }
  }

  async function archive(item: MarketingItem) {
    try {
      await setStatus.mutateAsync({ bookId, itemId: item.data.id, action: "archive" });
      toast.show({ tone: "success", title: `${kindLabel[item.kind]} archived`, action: { label: "Undo", onClick: () => void restore(item.data.id) } });
    } catch (e) {
      setProblem(errorText(e));
    }
  }

  async function restore(id: string) {
    try {
      await setStatus.mutateAsync({ bookId, itemId: id, action: "restore" });
      setAnnounce("Restored.");
    } catch (e) {
      setProblem(errorText(e));
    }
  }

  const counts: Record<Channel, number> = {
    tiktok: byKind("tiktok").length,
    instagram: byKind("instagram").length,
    email: byKind("email").length,
    archive: archived.length,
  };
  const hashtags = new Set(items.flatMap((i) => (i.kind === "email" ? [] : i.data.hashtags))).size;
  const generatingHere = generating && job?.kind === tab;
  const nothingYet = items.length === 0 && archived.length === 0 && !generating;
  const selectedIndex = selected ? list.findIndex((i) => i.data.id === selected.data.id) : -1;
  const selectedRaw = selected ? rawById.get(selected.data.id) : undefined;
  const regenerating = (id: string) => regen?.itemId === id;
  const busyNote = <BusyPreview text={regenWatch.message ?? jobStatusText(regenWatch.status)} />;

  useStepAction(
    tab === "archive"
      ? null
      : {
          label: generating && job?.kind === tab ? "Generating" : generateLabel[tab].label,
          estimate: generateLabel[tab].cost,
          onClick: () => void run(tab),
          disabledReason: locked ?? (generating ? "Already generating." : undefined),
        },
  );

  if (listQ.isPending) return <LoadingBlock label="Loading marketing" rows={6} className="vol-glass rounded-card p-6" />;
  if (listQ.isError)
    return (
      <>
        <PageHeader title="Marketing" />
        <ErrorPanel
          className="max-w-[720px]"
          title="Could not load the launch content"
          body={marketingError(listQ.error)}
          onRetry={() => void listQ.refetch()}
        />
      </>
    );

  return (
    <>
      <PageHeader title="Marketing" summary="Launch scripts and posts written from the book. Edit them, copy what you need, archive what you do not." />
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
      {problem && (
        <Banner
          tone="error"
          title="That did not work"
          action={
            <Button size="sm" variant="ghost" onClick={() => setProblem(null)}>
              Dismiss
            </Button>
          }
        >
          {problem}
        </Banner>
      )}
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
                <small className="text-[12px] text-ink-3">{tab === "archive" ? "Archived items. Restore any of them." : "Pick one to read it in full"}</small>
              </div>
              {tab === "archive" ? (
                archived.length === 0 ? (
                  <EmptyState drawing="archive" title="Nothing archived" body="Archived items land here, so nothing is lost." className="shadow-none" />
                ) : (
                  <ul className="grid gap-2.5">
                    {archived.map((a) => {
                      const item = toItem(a);
                      return (
                        <li key={a.id} className="flex flex-wrap items-start gap-3 rounded-[14px] border border-line bg-panel-2 p-3.5">
                          <div className="min-w-0 flex-1">
                            <p className="text-[12px] text-ink-3">
                              {item ? kindLabel[item.kind] : a.kind}, archived {a.archivedAt ? formatRelative(new Date(a.archivedAt).toISOString(), now) : ""}
                            </p>
                            <p className="mt-1 font-book text-prose-sm text-ink">{item ? headline(item) : a.body}</p>
                          </div>
                          {canWrite && (
                            <Button size="sm" icon={RotateCcw} onClick={() => void restore(a.id)}>
                              Restore
                            </Button>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )
              ) : (
                <>
                  {generatingHere && (
                    <div role="status" aria-label="Generating" className="mb-4 grid gap-2 rounded-[14px] border border-line bg-panel-2 p-4">
                      <p className="flex items-center gap-2 text-[13px] text-ink-2">
                        <Loader />
                        {watch.message ?? jobStatusText(watch.status)}
                      </p>
                    </div>
                  )}
                  {list.length === 0 && !generatingHere ? (
                    <EmptyState
                      drawing="pen"
                      title={emptyCopy[tab]}
                      className="shadow-none"
                      body={
                        locked ??
                        `The writer drafts these from the book in the profile's voice. No reviews, rankings or numbers are invented. ${generateLabel[tab].label} makes the first ones.`
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
                            busy={regenerating(item.data.id)}
                            onSelect={() => setSelectedId(item.data.id)}
                          >
                            {regenerating(item.data.id) ? busyNote : <PostPreview book={book} author={author} item={item} />}
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
                editing === selected.data.id && selectedRaw ? (
                  <EditCard
                    item={selected}
                    raw={selectedRaw}
                    saving={patch.isPending}
                    onCancel={() => setEditing(null)}
                    onSave={(p) => void save(selected.data.id, p)}
                  />
                ) : (
                  <PostDetail
                    item={selected}
                    index={Math.max(0, selectedIndex)}
                    subjectIndex={subjectIndex(selected)}
                    onSubject={(i) => {
                      if (selected.kind !== "email") return;
                      const line = selected.data.subjects[i];
                      if (line && line !== selected.data.subject) void save(selected.data.id, { title: line });
                    }}
                    onCopy={() => void copy(itemText(selected, subjectIndex(selected)), kindLabel[selected.kind])}
                    busy={regenerating(selected.data.id) ? busyNote : undefined}
                    actions={
                      canWrite ? (
                        <>
                          <Button
                            size="sm"
                            icon={RotateCw}
                            estimate="about $0.01"
                            loading={regenerating(selected.data.id)}
                            loadingLabel="Regenerating"
                            disabledReason={locked ?? (regen && regen.itemId !== selected.data.id ? "Another item is being written again." : undefined)}
                            onClick={() => void regenerate(selected.data.id)}
                          >
                            Regenerate
                          </Button>
                          <Button size="sm" variant="ghost" icon={PenLine} onClick={() => setEditing(selected.data.id)}>
                            Edit
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            icon={Check}
                            aria-pressed={selected.status === "used"}
                            onClick={() => void save(selected.data.id, { status: selected.status === "used" ? "draft" : "used" })}
                          >
                            {selected.status === "used" ? "Mark as draft" : "Mark as used"}
                          </Button>
                          <Button size="sm" variant="ghost" icon={Archive} onClick={() => void archive(selected)}>
                            Archive
                          </Button>
                        </>
                      ) : undefined
                    }
                    parts={<SelectedPanel item={selected} subjectIndex={subjectIndex(selected)} onCopy={(t, w) => void copy(t, w)} />}
                  />
                )
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

function EditCard({
  item,
  raw,
  saving,
  onCancel,
  onSave,
}: {
  item: MarketingItem;
  raw: ApiMarketingItem;
  saving: boolean;
  onCancel: () => void;
  onSave: (p: MarketingPatch) => void;
}) {
  const [title, setTitle] = useState(raw.title ?? "");
  const [hook, setHook] = useState(raw.hook ?? "");
  const [body, setBody] = useState(raw.body);
  const [cta, setCta] = useState(raw.cta ?? "");
  const [tags, setTags] = useState(raw.hashtags.join(" "));
  const [secs, setSecs] = useState(raw.durationS === null ? "" : String(raw.durationS));
  const hashtags = tags
    .split(/[\s,]+/)
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t) => (t.startsWith("#") ? t : `#${t}`));
  const p: MarketingPatch =
    item.kind === "tiktok"
      ? { hook: hook.trim() || null, body, cta: cta.trim() || null, hashtags, durationS: secs ? Number(secs) : null }
      : item.kind === "instagram"
        ? { body, cta: cta.trim() || null, hashtags }
        : { title: title.trim() || null, hook: hook.trim() || null, body };
  return (
    <form
      aria-label={`Edit ${kindLabel[item.kind].toLowerCase()}`}
      className="grid gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        onSave(p);
      }}
    >
      {item.kind === "email" && <Input label="Subject line" value={title} onChange={(e) => setTitle(e.target.value)} />}
      {item.kind !== "instagram" && <Input label={item.kind === "email" ? "Preview text" : "Hook"} value={hook} onChange={(e) => setHook(e.target.value)} />}
      <Textarea
        label={item.kind === "tiktok" ? "Beats" : item.kind === "instagram" ? "Caption" : "Body"}
        hint={item.kind === "tiktok" ? 'One beat per line. Start a line with "On screen:" for on-screen text.' : undefined}
        rows={6}
        value={body}
        onChange={(e) => setBody(e.target.value)}
      />
      {item.kind !== "email" && <Input label="Call to action" value={cta} onChange={(e) => setCta(e.target.value)} />}
      {item.kind !== "email" && <Input label="Hashtags" hint="Separate with spaces. Up to 10." value={tags} onChange={(e) => setTags(e.target.value)} />}
      {item.kind === "tiktok" && (
        <Input label="Length in seconds" inputMode="numeric" value={secs} onChange={(e) => setSecs(e.target.value.replace(/[^\d]/g, ""))} />
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" icon={Check} loading={saving} loadingLabel="Saving" disabledReason={body.trim() === "" ? "Write some text first." : undefined}>
          Save
        </Button>
        <Button variant="ghost" icon={X} onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
