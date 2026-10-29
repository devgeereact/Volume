import { useMemo, useRef, useState, type KeyboardEvent } from "react";
import { ReadOnlyBanner, useCanWrite } from "../../lib/access";
import { BookOpen, FileArchive, Info, Megaphone, RotateCcw, Trash2, UserRound } from "lucide-react";
import {
  Banner,
  Button,
  Card,
  EmptyState,
  FilterField,
  IconButton,
  Input,
  Modal,
  PageHeader,
  Skeleton,
  tabId,
  tabPanelId,
  tabPanelProps,
} from "../../components/ui";
import { cn } from "../../lib/cn";
import { useArchive, useDeleteArchived, useRestoreArchived } from "../../api/hooks";
import type { ApiArchiveItem } from "../../api/types";
import { apiErrorText, canDeleteArchived, downloadProjectFile, isoFromMs, useWireMode } from "../../api/wire-a";
import { archivedItems } from "../../demo/workspace";
import type { ArchivedItem } from "../../demo/types";
import { formatDate } from "../../lib/format";
import { useDemoState } from "../library/demoState";
import { InlineStatus } from "../settings/PanelHeader";

type Kind = ArchivedItem["kind"];
const ID_BASE = "archive";

const kinds: { id: Kind; label: string; noun: string; icon: typeof BookOpen; restoredTo: string }[] = [
  { id: "book", label: "Books", noun: "book", icon: BookOpen, restoredTo: "It is back in the Library at the stage where it stopped." },
  { id: "pen-name", label: "Profiles", noun: "profile", icon: UserRound, restoredTo: "It is back in Profiles and in the new book wizard." },
  { id: "marketing", label: "Marketing", noun: "marketing item", icon: Megaphone, restoredTo: "It is back on the book’s Marketing screen as a draft." },
];

function deleteWarning(item: ArchivedItem): string {
  if (item.kind === "book") return "This removes the book, every version, its covers and its exports from this computer. It cannot be undone.";
  if (item.kind === "pen-name") return "This removes the profile, its bio, voice and defaults. It cannot be undone. Profiles with books can only be archived.";
  return "This removes the item and its versions. It cannot be undone.";
}

function ArchiveSkeleton() {
  return (
    <Card padding="none" className="p-2">
      <ul role="status" aria-label="Loading archive" className="grid gap-1.5">
        {Array.from({ length: 3 }, (_, i) => (
          <li key={i} className="grid gap-2 rounded-lg border border-edge bg-soft p-3.5">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-3 w-1/2" />
          </li>
        ))}
      </ul>
    </Card>
  );
}

/**
 * The archive's sections as the approved design's segmented tabs (.seg.tgl with role="tablist"): label and count,
 * the chosen one raised. Arrow keys, Home and End move and select (roving tabindex), as the shared Tabs do.
 */
function SectionTabs({ items, value, onChange }: { items: { id: Kind; label: string; count: number }[]; value: Kind; onChange: (k: Kind) => void }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  function onKey(e: KeyboardEvent<HTMLDivElement>) {
    const idx = items.findIndex((t) => t.id === value);
    let next = -1;
    if (e.key === "ArrowRight") next = (idx + 1) % items.length;
    else if (e.key === "ArrowLeft") next = (idx - 1 + items.length) % items.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = items.length - 1;
    const target = items[next];
    if (!target) return;
    e.preventDefault();
    onChange(target.id);
    refs.current[next]?.focus();
  }
  return (
    <div
      role="tablist"
      aria-label="Archived items"
      onKeyDown={onKey}
      className="inline-flex max-w-full gap-0.5 overflow-x-auto rounded-md border border-edge bg-soft p-[3px]"
    >
      {items.map((t, i) => {
        const selected = t.id === value;
        return (
          <button
            key={t.id}
            ref={(el) => {
              refs.current[i] = el;
            }}
            id={tabId(ID_BASE, t.id)}
            role="tab"
            type="button"
            aria-selected={selected}
            aria-controls={tabPanelId(ID_BASE, t.id)}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(t.id)}
            className={cn(
              "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-sm px-3 text-[13px] font-medium whitespace-nowrap focus-visible:outline-offset-1",
              selected ? "bg-panel-2 text-ink shadow-segment" : "text-ink-2 hover:text-ink",
            )}
          >
            {t.label}
            <small className="num text-[11px] text-ink-3">{t.count}</small>
          </button>
        );
      })}
    </div>
  );
}

/**
 * Archive (09-UX-FLOWS, M2): archived books, profiles and marketing items in tabs, with a filter,
 * archived date, Restore and Delete (Delete confirms first). Demo states: ?state=loading, error or empty.
 * With the server running, the list is GET /archive (books, profiles and marketing items) and Restore
 * posts to each item's restorePath. Delete removes an archived book or profile for good once the owner
 * types its exact title; the server checks it again. Marketing items can only be restored.
 */
export default function ArchivePage() {
  const canWrite = useCanWrite();
  const demo = useDemoState();
  const mode = useWireMode();
  const api = mode === "api";
  const archiveQ = useArchive({ enabled: api });
  const restoreArchived = useRestoreArchived();
  const deleteArchived = useDeleteArchived();
  const [confirmText, setConfirmText] = useState("");
  const [exporting, setExporting] = useState<string | null>(null);
  function exportProject(item: ArchivedItem) {
    setExporting(item.id);
    setRestoreError(null);
    downloadProjectFile(item.id, item.title).then(
      (name) => {
        setExporting(null);
        setStatus(`${name} is in your downloads.`);
      },
      (e: unknown) => {
        setExporting(null);
        setRestoreError(`Could not export ${item.title}. ${apiErrorText(e)}`);
      },
    );
  }
  const serverItems = useMemo(() => new Map((archiveQ.data ?? []).map((i) => [`${i.kind}:${i.id}`, i])), [archiveQ.data]);
  const serverItemFor = (item: ArchivedItem): ApiArchiveItem | undefined => serverItems.get(`${item.kind === "pen-name" ? "profile" : item.kind}:${item.id}`);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const apiItems = useMemo<ArchivedItem[]>(
    () =>
      (archiveQ.data ?? []).map((i) => ({
        id: i.id,
        kind: i.kind === "profile" ? "pen-name" : i.kind,
        title: i.title,
        detail: i.detail,
        archivedAt: isoFromMs(i.archivedAt),
      })),
    [archiveQ.data],
  );
  const state = mode === "mock" ? demo.state : mode === "checking" || archiveQ.isPending ? "loading" : archiveQ.error ? "error" : "ready";
  const retry =
    mode === "mock"
      ? demo.retry
      : () => {
          void archiveQ.refetch();
        };
  const [demoItems, setItems] = useState<ArchivedItem[]>(archivedItems);
  const items = api ? apiItems : demoItems;
  const [tab, setTab] = useState<Kind>("book");
  const [query, setQuery] = useState("");
  const [toDelete, setToDelete] = useState<ArchivedItem | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const all = state === "empty" ? [] : items;
  const kind = kinds.find((k) => k.id === tab) ?? kinds[0];
  const inTab = all.filter((i) => i.kind === tab);
  const q = query.trim().toLowerCase();
  const shown = useMemo(() => inTab.filter((i) => !q || `${i.title} ${i.detail}`.toLowerCase().includes(q)), [inTab, q]);

  function restore(item: ArchivedItem) {
    const k = kinds.find((x) => x.id === item.kind);
    const done = () => setStatus(`Restored ${item.title}. ${k?.restoredTo ?? ""}`);
    setRestoreError(null);
    if (!api) {
      setItems((list) => list.filter((i) => i.id !== item.id));
      done();
      return;
    }
    const fail = (e: unknown) => setRestoreError(`Could not restore ${item.title}. ${apiErrorText(e)}`);
    const fromServer = serverItemFor(item);
    if (fromServer) restoreArchived.mutate(fromServer, { onSuccess: done, onError: fail });
  }
  const restoring = (id: string) => restoreArchived.isPending && restoreArchived.variables?.id === id;
  const deletable = (item: ArchivedItem): boolean => {
    if (!api) return true;
    const fromServer = serverItemFor(item);
    return Boolean(fromServer && canDeleteArchived(fromServer));
  };
  function openDelete(item: ArchivedItem) {
    deleteArchived.reset();
    setConfirmText("");
    setToDelete(item);
  }
  function confirmDelete() {
    if (!toDelete) return;
    const item = toDelete;
    if (!api) {
      setItems((list) => list.filter((i) => i.id !== item.id));
      setStatus(`Deleted ${item.title}.`);
      setToDelete(null);
      return;
    }
    const fromServer = serverItemFor(item);
    if (!fromServer) return;
    deleteArchived.mutate(
      { item: fromServer, confirm: confirmText },
      {
        onSuccess: () => {
          setStatus(`Deleted ${item.title} for good.`);
          setToDelete(null);
        },
      },
    );
  }
  const confirmMatches = toDelete !== null && confirmText === toDelete.title;

  return (
    <div className="grid grid-cols-1 content-start gap-4 px-4 pt-1 pb-6 min-[861px]:px-6">
      <PageHeader title="Archive" titleHidden />
      <ReadOnlyBanner />

      {state === "loading" && <ArchiveSkeleton />}
      {state === "error" && (
        <Banner
          tone="error"
          title="Could not load the archive"
          action={
            <Button size="sm" onClick={retry}>
              Retry
            </Button>
          }
        >
          {api && archiveQ.error ? apiErrorText(archiveQ.error) : "The local server did not answer. Nothing has been lost. Try again in a moment."}
        </Banner>
      )}

      {(state === "ready" || state === "empty") && (
        <>
          <Card as="section" aria-label="Archive sections" className="flex flex-wrap items-center justify-between gap-3 px-4.5 py-4">
            <SectionTabs
              value={tab}
              onChange={setTab}
              items={kinds.map((k) => ({ id: k.id, label: k.label, count: all.filter((i) => i.kind === k.id).length }))}
            />
            {all.length > 0 && (
              <FilterField
                label="Filter the archive"
                placeholder="Filter the archive"
                value={query}
                onChange={setQuery}
                count={shown.length}
                className="w-full min-[561px]:w-60"
              />
            )}
          </Card>
          {status && <InlineStatus>{status}</InlineStatus>}
          {restoreError && (
            <Banner tone="error" title="That did not finish">
              {restoreError}
            </Banner>
          )}
          <Card padding="none" {...tabPanelProps(ID_BASE, tab)} className="p-2 focus-visible:outline-offset-4">
            {inTab.length === 0 ? (
              <EmptyState
                headingLevel={2}
                drawing="archive"
                title="Nothing archived"
                body={`Archived ${kind?.label.toLowerCase() ?? "items"} appear here, ready to restore.`}
              />
            ) : shown.length === 0 ? (
              <EmptyState
                headingLevel={2}
                drawing="search"
                title={`Nothing matches “${query.trim()}”`}
                body={`The filter looks at the titles and notes of archived ${kind?.label.toLowerCase() ?? "items"}.`}
                action={<Button onClick={() => setQuery("")}>Clear filter</Button>}
              />
            ) : (
              <ul aria-label={`Archived ${kind?.label.toLowerCase() ?? "items"}`} className="grid gap-1.5">
                {shown.map((item) => {
                  const Icon = kind?.icon ?? BookOpen;
                  return (
                    <li
                      key={item.id}
                      className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3.5 rounded-lg border border-edge bg-soft p-3.5 min-[861px]:grid-cols-[auto_minmax(0,1fr)_auto_auto]"
                    >
                      <span aria-hidden className="grid size-10.5 shrink-0 place-items-center rounded-[13px] bg-panel-2 text-ink-2">
                        <Icon size={18} strokeWidth={1.8} />
                      </span>
                      <span className="grid min-w-0 gap-0.5">
                        <b className="text-[14px] font-semibold text-ink">{item.title}</b>
                        <small className="text-caption text-ink-3">{item.detail}</small>
                      </span>
                      <span className="num text-caption whitespace-nowrap text-ink-3 max-[860px]:sr-only">
                        Archived <time dateTime={item.archivedAt}>{formatDate(item.archivedAt)}</time>
                      </span>
                      <span className="flex shrink-0 items-center gap-1">
                        {canWrite && (
                          <Button size="sm" icon={RotateCcw} loading={restoring(item.id)} loadingLabel="Restoring" onClick={() => restore(item)}>
                            Restore<span className="sr-only"> {item.title}</span>
                          </Button>
                        )}
                        {api && item.kind === "book" && (
                          <IconButton
                            icon={FileArchive}
                            size="sm"
                            label={exporting === item.id ? `Exporting ${item.title}` : `Export project file for ${item.title}`}
                            disabledReason={exporting === item.id ? "Exporting now." : undefined}
                            onClick={() => exportProject(item)}
                          />
                        )}
                        {deletable(item) && canWrite && <IconButton icon={Trash2} size="sm" label={`Delete ${item.title}`} onClick={() => openDelete(item)} />}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
          <p className="vol-glass flex items-center gap-2.5 rounded-lg px-4 py-3 text-caption text-ink-2">
            <Info size={16} strokeWidth={1.8} aria-hidden className="shrink-0 text-mint-ink" />
            Restoring puts an item back where it was. {all.length} {all.length === 1 ? "item" : "items"} in the archive.
          </p>
        </>
      )}

      <Modal
        open={toDelete !== null}
        onClose={() => setToDelete(null)}
        size="sm"
        closeOnScrim={false}
        title={toDelete ? `Delete ${toDelete.title}?` : "Delete"}
        description={toDelete ? deleteWarning(toDelete) : undefined}
        footer={
          <>
            <Button variant="ghost" onClick={() => setToDelete(null)}>
              Keep it
            </Button>
            <Button
              variant="danger"
              icon={Trash2}
              loading={deleteArchived.isPending}
              loadingLabel="Deleting"
              disabledReason={api && !confirmMatches ? "Type the exact title first." : undefined}
              onClick={confirmDelete}
            >
              Delete {toDelete ? (kinds.find((x) => x.id === toDelete.kind)?.noun ?? "item") : "item"}
            </Button>
          </>
        }
      >
        {api && toDelete && (
          <div className="grid gap-3">
            <Input
              label={`Type “${toDelete.title}” to confirm`}
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              autoComplete="off"
              spellCheck={false}
            />
            {deleteArchived.isError && (
              <Banner tone="error" title="Not deleted">
                {apiErrorText(deleteArchived.error)}
              </Banner>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
