import { useMemo, useState } from "react";
import { Archive, Check, Copy, PenLine, RotateCcw, RotateCw, ShieldCheck, X } from "lucide-react";
import {
  Banner,
  Button,
  Card,
  EmptyState,
  Input,
  Inspector,
  InspectorSection,
  Loader,
  PageHeader,
  Skeleton,
  StatusChip,
  Tabs,
  tabPanelProps,
  Textarea,
} from "../../components/ui";
import type { Book } from "../../data";
import { useGenerateMarketing, useMarketing, useMarketingStatus, usePatchMarketing, useRememberJob } from "../../api/hooks";
import { productionApi } from "../../api/production";
import type { ApiMarketingItem, MarketingKind, MarketingPatch } from "../../api/types";
import { errorText, jobStatusText, useJobWatch } from "../../api/wire-c";
import { cn } from "../../lib/cn";
import { formatRelative } from "../../lib/format";
import { useToast } from "../../lib/toast";
import { useStepAction } from "../../lib/stepAction";
import { ErrorPanel, LoadingBlock } from "../writing/screenState";
import { EmailBody, headline, InstagramBody, meta, SelectedPanel, TikTokBody } from "./MarketingPage";
import { itemText, type ItemKind, type MarketingItem } from "./marketingExtras";

/* Marketing on the Volume server (API mode): Generate is a job (progress over SSE), items are listed
   from GET /marketing, edited with PATCH, marked used or draft, archived and restored. */

type Tab = ItemKind | "archive";
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
  const bookId = book.id;
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
      setProblem(errorText(e));
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
      setProblem(errorText(e));
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

  const tabItems = [
    { id: "tiktok", label: "TikTok", count: byKind("tiktok").length },
    { id: "instagram", label: "Instagram", count: byKind("instagram").length },
    { id: "email", label: "Email", count: byKind("email").length },
    { id: "archive", label: "Archive", count: archived.length },
  ];

  useStepAction(
    tab === "archive"
      ? null
      : {
          label: generating && job?.kind === tab ? "Generating" : generateLabel[tab].label,
          estimate: generateLabel[tab].cost,
          onClick: () => void run(tab),
          disabledReason: generating ? "Already generating." : undefined,
        },
  );

  if (listQ.isPending) return <LoadingBlock label="Loading marketing" rows={6} />;
  if (listQ.isError)
    return (
      <>
        <h1 className="font-book text-title text-ink">Marketing</h1>
        <ErrorPanel
          className="mt-5 max-w-[720px]"
          title="Could not load the launch content"
          body={errorText(listQ.error)}
          onRetry={() => void listQ.refetch()}
        />
      </>
    );

  return (
    <>
      <PageHeader title="Marketing" summary="Launch content for this book. Edit it, copy what you need, archive what you do not." />
      {problem && (
        <Banner
          tone="error"
          title="That did not work"
          className="mt-4 max-w-[860px]"
          action={
            <Button size="sm" variant="ghost" onClick={() => setProblem(null)}>
              Dismiss
            </Button>
          }
        >
          {problem}
        </Banner>
      )}
      <Tabs idBase="mk" label="Content type" className="mt-5" value={tab} onChange={(t) => setTab(t as Tab)} items={tabItems} />

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_var(--vol-inspector)]">
        <div {...tabPanelProps("mk", tab)} className="grid min-w-0 content-start gap-4 focus-visible:outline-offset-4">
          {tab === "archive" ? (
            archived.length === 0 ? (
              <EmptyState drawing="archive" title="Nothing archived" body="Archived items land here, so nothing is lost." />
            ) : (
              <ul className="grid gap-3">
                {archived.map((a) => {
                  const item = toItem(a);
                  return (
                    <li key={a.id}>
                      <Card padding="md" className="flex flex-wrap items-start gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="text-small text-ink-secondary">
                            {item ? kindLabel[item.kind] : a.kind}, archived {a.archivedAt ? formatRelative(new Date(a.archivedAt).toISOString(), now) : ""}
                          </p>
                          <p className="mt-1 font-book text-prose-sm text-ink">{item ? headline(item) : a.body}</p>
                        </div>
                        <Button size="sm" icon={RotateCcw} onClick={() => void restore(a.id)}>
                          Restore
                        </Button>
                      </Card>
                    </li>
                  );
                })}
              </ul>
            )
          ) : (
            <>
              {generating && job?.kind === tab && (
                <div role="status" aria-label="Generating" className="grid gap-2 rounded-md border border-border bg-sheet p-5">
                  <p className="flex items-center gap-2 text-small text-ink-secondary">
                    <Loader />
                    {watch.message ?? jobStatusText(watch.status)}
                  </p>
                </div>
              )}
              {list.length === 0 && !(generating && job?.kind === tab) ? (
                <EmptyState
                  drawing="pen"
                  title={emptyCopy[tab]}
                  body={`The writer drafts these from the book in the profile's voice. No reviews, rankings or numbers are invented. ${generateLabel[tab].label}, at the foot of the page, makes the first ones.`}
                />
              ) : (
                <ul className="grid gap-4">
                  {list.map((item) => {
                    const r = rawById.get(item.data.id);
                    return (
                      <li key={item.data.id}>
                        {editing === item.data.id && r ? (
                          <EditCard item={item} raw={r} saving={patch.isPending} onCancel={() => setEditing(null)} onSave={(p) => void save(item.data.id, p)} />
                        ) : (
                          <article
                            aria-label={`${kindLabel[item.kind]}: ${headline(item)}`}
                            onFocusCapture={() => setSelectedId(item.data.id)}
                            onClick={() => setSelectedId(item.data.id)}
                            aria-busy={regen?.itemId === item.data.id || undefined}
                            className={cn(
                              "rounded-md border bg-sheet p-5",
                              selected?.data.id === item.data.id ? "vol-pencil-edge border-select" : "border-border",
                            )}
                          >
                            {regen?.itemId === item.data.id ? (
                              <div role="status" aria-label="Writing it again" className="grid gap-3">
                                <p className="flex items-center gap-2 text-small text-ink-secondary">
                                  <Loader />
                                  {regenWatch.message ?? jobStatusText(regenWatch.status)}
                                </p>
                                <Skeleton className="h-6 w-3/5" />
                                <Skeleton className="h-4 w-full" />
                              </div>
                            ) : (
                              <>
                                <div className="flex flex-wrap items-center gap-2">
                                  {item.status === "used" ? <StatusChip status="passed">Used</StatusChip> : <StatusChip status="queued">Draft</StatusChip>}
                                  <span className="num text-small text-ink-secondary">{meta(item)}</span>
                                </div>
                                {item.kind === "tiktok" && <TikTokBody item={item} />}
                                {item.kind === "instagram" && <InstagramBody item={item} />}
                                {item.kind === "email" && (
                                  <EmailBody
                                    item={item}
                                    subjectIndex={subjectIndex(item)}
                                    onSubject={(i) => {
                                      const line = item.data.subjects[i];
                                      if (line && line !== item.data.subject) void save(item.data.id, { title: line });
                                    }}
                                  />
                                )}
                              </>
                            )}
                            <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-3">
                              <Button size="sm" icon={Copy} onClick={() => void copy(itemText(item, subjectIndex(item)), kindLabel[item.kind])}>
                                Copy
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                icon={RotateCw}
                                estimate="about $0.01"
                                loading={regen?.itemId === item.data.id}
                                loadingLabel="Regenerating"
                                disabledReason={regen && regen.itemId !== item.data.id ? "Another item is being written again." : undefined}
                                onClick={() => void regenerate(item.data.id)}
                              >
                                Regenerate
                              </Button>
                              <Button size="sm" variant="ghost" icon={PenLine} onClick={() => setEditing(item.data.id)}>
                                Edit
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                icon={Check}
                                aria-pressed={item.status === "used"}
                                onClick={() => void save(item.data.id, { status: item.status === "used" ? "draft" : "used" })}
                              >
                                {item.status === "used" ? "Mark as draft" : "Mark as used"}
                              </Button>
                              <Button size="sm" variant="ghost" icon={Archive} className="sm:ml-auto" onClick={() => void archive(item)}>
                                Archive
                              </Button>
                            </div>
                          </article>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </>
          )}
        </div>

        <Inspector label="Selected item" width="100%" className="self-start rounded-md border xl:sticky xl:top-[calc(var(--shell-topbar)+16px)]">
          {selected && tab !== "archive" ? (
            <SelectedPanel item={selected} subjectIndex={subjectIndex(selected)} onCopy={(t, w) => void copy(t, w)} />
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
      className="grid gap-3 rounded-md border border-select bg-sheet p-5"
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
