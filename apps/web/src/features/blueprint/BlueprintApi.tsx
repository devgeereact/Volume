import { useCallback, useMemo, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "react-router";
import { Check, Lock, Pencil, RefreshCw, RotateCcw } from "lucide-react";
import {
  Banner,
  Button,
  EmptyState,
  GalleySheet,
  IconButton,
  Input,
  Inspector,
  InspectorSection,
  KeyValueList,
  LiveDot,
  Modal,
  ModelName,
  PageHeader,
  ProgressBar,
  Select,
  Skeleton,
  Textarea,
} from "../../components/ui";
import { blueprintData } from "../../api/adapters";
import { planningApi } from "../../api/planning";
import { scrollBehavior } from "../../lib/motion";
import { isApiError } from "../../api/client";
import {
  useApproveBlueprint,
  useBlueprint,
  useBlueprintVersions,
  useCreateBlueprint,
  useEstimate,
  usePatchBlueprint,
  useRegenerateBlueprintPart,
  useSectionTree,
  useStoryLedger,
  useUpdateBook,
} from "../../api/hooks";
import type { ApiBookDetail, ApiBlueprintVersion, BlueprintChapterData, BlueprintData, BlueprintPartKey } from "../../api/types";
import { estimateWords, guardrailsOf, plainError, runMeta, useBookJobsLive, usePromptRunFor, useStageJob, whenMs } from "../../api/wire-b";
import { GuardrailNote } from "../research/GuardrailNote";
import { RebuildBook } from "../rebuild/RebuildBook";
import type { Book } from "../../demo";
import { cn } from "../../lib/cn";
import { formatNumber } from "../../lib/format";
import { useStepAction } from "../../lib/stepAction";
import { bookStepPath } from "../../screens";
import { useCanWrite } from "../../lib/access";
import { blueprintCreateInput } from "./blueprintRequest";
import { NarrationEditor, StoryBibleEditor, StoryBibleView, StoryLedgerPanel, emptyBible, storyBibleOf, type Tense } from "./StoryBible";

/* Blueprint for a book on the server (API mode). Build it, read the latest version, edit a part
   (saved as a new version against the version you opened, so a stale edit is caught), regenerate a
   part, then approve it, which creates the sections and opens Writing. */

type Part = { key: BlueprintPartKey; label: string; anchor: string };

function rec(v: unknown): Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

function matterRows(m: Record<string, unknown>): { key: string; label: string; text: string; words: number | null }[] {
  return Object.entries(m).map(([key, value]) => {
    const o = rec(value);
    const label = key.replace(/[_-]/g, " ").replace(/^\w/, (c) => c.toUpperCase());
    const text = typeof value === "string" ? value : typeof o["summary"] === "string" ? o["summary"] : typeof o["note"] === "string" ? o["note"] : "";
    return { key, label, text, words: typeof o["word_target"] === "number" ? o["word_target"] : null };
  });
}

function lines(v: string): string[] {
  return v
    .split("\n")
    .map((x) => x.trim())
    .filter(Boolean);
}

type Field = { name: string; label: string; kind: "input" | "textarea" | "lines" | "number"; value: string; hint?: string };
type EditTarget = { part: Part; fields: Field[]; build: (values: Record<string, string>, d: BlueprintData) => Partial<BlueprintData> };

export function BlueprintApi({ book, apiBook }: { book: Book; apiBook: ApiBookDetail }) {
  const bookId = apiBook.id;
  const navigate = useNavigate();
  const bp = useBlueprint(bookId);
  const versions = useBlueprintVersions(bookId);
  const { job, active } = useStageJob(bookId, ["blueprint", "blueprint_part"]);
  const { jobs } = useBookJobsLive(bookId);
  const create = useCreateBlueprint();
  const patch = usePatchBlueprint();
  const regen = useRegenerateBlueprintPart();
  const approve = useApproveBlueprint();
  const updateBook = useUpdateBook();
  const canWrite = useCanWrite();
  const fiction = apiBook.template === "fiction";
  const workbook = apiBook.template === "workbook";
  const ledger = useStoryLedger(fiction ? bookId : undefined);
  const tree = useSectionTree(fiction ? bookId : undefined);
  const [bibleOpen, setBibleOpen] = useState(false);
  const [narrationOpen, setNarrationOpen] = useState(false);

  const [history, setHistory] = useState<ApiBlueprintVersion | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [selected, setSelected] = useState<BlueprintPartKey>("summary");
  const [edit, setEdit] = useState<EditTarget | null>(null);
  const [editValues, setEditValues] = useState<Record<string, string>>({});
  const [editBase, setEditBase] = useState<number | null>(null);
  const [regenOpen, setRegenOpen] = useState(false);
  const [instruction, setInstruction] = useState("");
  const [approveOpen, setApproveOpen] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const approveCancelRef = useRef<HTMLButtonElement>(null);

  const version = bp.data?.blueprint ?? null;
  const d = useMemo(() => (version ? blueprintData(version) : null), [version]);
  const bible = useMemo(() => (d ? storyBibleOf(d["storyBible"]) : null), [d]);
  const pov = typeof apiBook.settings["pov"] === "string" ? apiBook.settings["pov"] : null;
  const tense: Tense | null = apiBook.settings["tense"] === "present" ? "present" : apiBook.settings["tense"] === "past" ? "past" : null;
  const sectionNames = useMemo(() => {
    const m = new Map<string, string>();
    const t = tree.data;
    if (t)
      for (const sec of [...t.front, ...t.body.flatMap((n) => [n, ...n.children]), ...t.back])
        m.set(sec.id, sec.kind === "chapter" && sec.number !== null ? `Chapter ${sec.number}` : (sec.title ?? sec.kind));
    return m;
  }, [tree.data]);
  const sectionName = useCallback((id: string) => sectionNames.get(id) ?? null, [sectionNames]);
  const validation = bp.data?.validation ?? null;
  const approved = version?.status === "approved";
  const failed = job && !active && (job.status === "failed" || job.status === "needs_attention") ? job : null;
  const buildJob = jobs.find((j) => j.kind === "blueprint") ?? null;
  const prompt = usePromptRunFor(bookId, "blueprint", buildJob);
  const meta = runMeta(version);
  const guard = guardrailsOf(version);
  const versionModel = version?.source === "human" ? null : (meta.model ?? prompt.model);

  const parts: Part[] = useMemo(() => {
    if (!d) return [];
    return [
      { key: "summary", label: "Title, summary and audience", anchor: "bp-summary" },
      { key: "front", label: "Front matter", anchor: "bp-front" },
      ...d.chapters.map<Part>((c) => ({ key: `chapter:${c.number}`, label: `Chapter ${c.number}`, anchor: `bp-chapter-${c.number}` })),
      { key: "back", label: "Back matter", anchor: "bp-back" },
      { key: "listing", label: "Listing", anchor: "bp-listing" },
    ];
  }, [d]);
  const selectedPart = parts.find((p) => p.key === selected) ?? parts[0];
  const buildEstimate = useEstimate(bookId, "blueprint", { enabled: bp.isSuccess && !bp.data?.blueprint });
  const regenEstimate = useEstimate(bookId, "blueprint_part", { partTarget: selectedPart?.key ?? "summary", enabled: regenOpen && !!selectedPart });
  const regenerating = active && job?.kind === "blueprint_part" && typeof job.payload["part"] === "string" ? job.payload["part"] : null;
  const busyFor = (key: string) => regenerating === key || (regenerating === "chapters" && key.startsWith("chapter:"));

  const totals = useMemo(() => {
    if (!d) return { chapters: 0, chapterWords: 0, front: 0, back: 0 };
    const sum = (m: Record<string, unknown>) => matterRows(m).reduce((n, r) => n + (r.words ?? 0), 0);
    return { chapters: d.chapters.length, chapterWords: d.chapters.reduce((n, c) => n + c.word_target, 0), front: sum(d.front), back: sum(d.back) };
  }, [d]);

  function select(p: Part) {
    setSelected(p.key);
    requestAnimationFrame(() => document.getElementById(p.anchor)?.scrollIntoView({ block: "start", behavior: scrollBehavior() }));
  }

  function openEdit(target: EditTarget) {
    if (!version) return;
    setSelected(target.part.key);
    setEditBase(version.version);
    setEditValues(Object.fromEntries(target.fields.map((f) => [f.name, f.value])));
    patch.reset();
    setEdit(target);
  }

  function saveEdit() {
    if (!edit || !d || editBase === null) return;
    patch.mutate(
      { bookId, input: { parts: edit.build(editValues, d), baseVersion: editBase, note: `${edit.part.label} edited by the owner` } },
      {
        onSuccess: (v) => {
          setSaved(`Version ${v.version} saved. ${edit.part.label} changed.`);
          setEdit(null);
        },
      },
    );
  }

  function saveBible(next: ReturnType<typeof emptyBible>) {
    if (!version) return;
    patch.mutate(
      { bookId, input: { parts: { storyBible: next }, baseVersion: version.version, note: "Story bible edited by the owner" } },
      {
        onSuccess: (v) => {
          setSaved(`Version ${v.version} saved. Story bible changed.`);
          setBibleOpen(false);
        },
      },
    );
  }

  function saveNarration(v: { pov: string; tense: Tense }) {
    updateBook.mutate(
      { bookId, patch: { settings: { ...apiBook.settings, pov: v.pov || null, tense: v.tense } } },
      {
        onSuccess: () => {
          setSaved("Point of view saved. Chapters written from now on use it.");
          setNarrationOpen(false);
        },
      },
    );
  }

  async function compareVersion(number: number) {
    setHistoryLoading(true);
    setHistoryError(null);
    try {
      setHistory(await planningApi.blueprintVersion(bookId, number));
    } catch (error) {
      setHistoryError(plainError(error));
    } finally {
      setHistoryLoading(false);
    }
  }

  function restoreHistory() {
    if (!history || !version) return;
    patch.mutate(
      { bookId, input: { parts: blueprintData(history), baseVersion: version.version, note: `Restored version ${history.version}` } },
      {
        onSuccess: (restored) => {
          setSaved(`Version ${history.version} restored as draft version ${restored.version}.`);
          setHistory(null);
        },
      },
    );
  }

  function reloadAfterConflict() {
    void bp.refetch();
    void versions.refetch();
    patch.reset();
    setEdit(null);
  }

  function editSummary(): EditTarget | null {
    if (!d) return null;
    return {
      part: parts[0] as Part,
      fields: [
        { name: "title", label: "Title", kind: "input", value: d.title },
        { name: "subtitle", label: "Subtitle", kind: "input", value: d.subtitle },
        { name: "summary", label: "Summary", kind: "textarea", value: d.summary },
        { name: "audience", label: "Audience", kind: "textarea", value: d.audience },
        { name: "usps", label: "What makes it different", kind: "lines", value: d.usps.join("\n"), hint: "One point per line." },
        { name: "tone_notes", label: "Tone", kind: "textarea", value: d.tone_notes },
      ],
      build: (v) => ({
        title: v["title"] ?? "",
        subtitle: v["subtitle"] ?? "",
        summary: v["summary"] ?? "",
        audience: v["audience"] ?? "",
        usps: lines(v["usps"] ?? ""),
        tone_notes: v["tone_notes"] ?? "",
      }),
    };
  }

  function editChapter(c: BlueprintChapterData): EditTarget {
    const part = parts.find((p) => p.key === `chapter:${c.number}`) ?? {
      key: `chapter:${c.number}` as BlueprintPartKey,
      label: `Chapter ${c.number}`,
      anchor: "",
    };
    return {
      part,
      fields: [
        { name: "title", label: "Chapter title", kind: "input", value: c.title },
        { name: "summary", label: "Summary", kind: "textarea", value: c.summary },
        { name: "subheadings", label: "Subheadings", kind: "lines", value: c.subheadings.join("\n"), hint: "One subheading per line, in order." },
        { name: "word_target", label: "Word target", kind: "number", value: String(c.word_target) },
      ],
      build: (v, data) => ({
        chapters: data.chapters.map((x) =>
          x.number === c.number
            ? {
                ...x,
                title: v["title"] ?? x.title,
                summary: v["summary"] ?? x.summary,
                subheadings: lines(v["subheadings"] ?? ""),
                word_target: Number(v["word_target"]) || x.word_target,
              }
            : x,
        ),
      }),
    };
  }

  function editListing(): EditTarget | null {
    if (!d) return null;
    return {
      part: parts.find((p) => p.key === "listing") as Part,
      fields: [
        { name: "description_draft", label: "Amazon description", kind: "textarea", value: d.description_draft },
        { name: "back_blurb", label: "Back cover blurb", kind: "textarea", value: d.back_blurb },
        { name: "categories", label: "Categories", kind: "lines", value: d.categories.join("\n"), hint: "One per line." },
        { name: "keywords", label: "Keywords", kind: "lines", value: d.keywords.join("\n"), hint: "One per line, up to 7." },
      ],
      build: (v) => ({
        description_draft: v["description_draft"] ?? "",
        back_blurb: v["back_blurb"] ?? "",
        categories: lines(v["categories"] ?? ""),
        keywords: lines(v["keywords"] ?? ""),
      }),
    };
  }

  const writingPath = bookStepPath(book.id, "writing");
  const missing = validation && !validation.ok ? validation.issues.map((i) => `${i.path || "blueprint"}: ${i.message}`) : [];
  useStepAction(
    bp.isPending || bp.isError
      ? { label: "Approve blueprint", disabledReason: bp.isPending ? "Loading the blueprint." : "The blueprint could not be loaded." }
      : !version
        ? {
            label: create.isPending ? "Starting" : "Build the blueprint",
            estimate: estimateWords(buildEstimate.data),
            onClick: () => create.mutate({ bookId, input: blueprintCreateInput(apiBook.settings) }),
            disabledReason: active
              ? "The blueprint is being built."
              : !apiBook.title
                ? "Choose a title first."
                : create.isPending
                  ? "Starting the build."
                  : undefined,
          }
        : approved && apiBook.approvedBlueprintId === version.id
          ? { label: "Continue to writing", to: writingPath }
          : {
              label: "Approve blueprint",
              onClick: () => {
                approve.reset();
                setApproveOpen(true);
              },
              disabledReason: active ? "Wait for the current run to finish." : missing.length > 0 ? `Before you approve: ${missing.join(" ")}` : undefined,
            },
  );

  const conflict = patch.error && isApiError(patch.error) && patch.error.isConflict;

  return (
    <div className="grid grid-cols-1 lg:h-screen-fill lg:grid-cols-[minmax(0,1fr)_auto] lg:grid-rows-[minmax(0,1fr)] xl:grid-cols-[240px_minmax(0,1fr)_auto]">
      <nav aria-label="Blueprint outline" className="hidden min-h-0 overflow-y-auto border-r border-border px-3 py-5 xl:block">
        <p className="px-2 pb-2 text-[13px] font-semibold text-ink-secondary">Outline</p>
        {parts.length === 0 ? (
          <p className="px-2 text-small text-ink-tertiary">Parts appear once the blueprint is built.</p>
        ) : (
          <ol className="grid gap-0.5">
            {parts.map((p) => (
              <li key={p.key}>
                <button
                  type="button"
                  aria-current={selected === p.key ? "true" : undefined}
                  onClick={() => select(p)}
                  className={cn(
                    "flex min-h-9 w-full items-center rounded-sm px-2 text-left text-label",
                    selected === p.key ? "bg-select-wash font-semibold text-select" : "text-ink-secondary hover:bg-sunken hover:text-ink",
                  )}
                >
                  {p.key.startsWith("chapter:") && d ? `${p.label}: ${d.chapters.find((c) => `chapter:${c.number}` === p.key)?.title ?? ""}` : p.label}
                </button>
              </li>
            ))}
          </ol>
        )}
      </nav>

      <div className="min-h-0 min-w-0 lg:overflow-y-auto">
        <div className="grid gap-4 px-3 pt-5 pb-8 sm:px-6">
          <PageHeader title="Blueprint" summary="The whole plan for the book, part by part. Edit or regenerate any part, then approve it to start writing." />

          {saved && (
            <Banner
              tone="success"
              title={saved}
              action={
                <Button size="sm" variant="ghost" onClick={() => setSaved(null)}>
                  Dismiss
                </Button>
              }
            />
          )}
          {create.isError && (
            <Banner tone="error" title="The blueprint build did not start">
              {plainError(create.error)}
            </Banner>
          )}
          {regen.isError && (
            <Banner tone="error" title="The part was not regenerated">
              {plainError(regen.error)}
            </Banner>
          )}

          {bp.isPending && (
            <div role="status" aria-label="Loading the blueprint" className="grid gap-3 rounded-md border border-border bg-sheet p-6">
              <Skeleton className="h-8 w-2/5" />
              <Skeleton className="w-full" />
              <Skeleton className="w-4/5" />
            </div>
          )}
          {bp.isError && (
            <Banner
              tone="error"
              title="The blueprint could not be loaded"
              action={
                <Button size="sm" icon={RotateCcw} onClick={() => void bp.refetch()}>
                  Retry
                </Button>
              }
            >
              {plainError(bp.error)}
            </Banner>
          )}

          {active && job && (
            <section aria-label="Blueprint run" className="relative overflow-hidden rounded-lg border border-border bg-sheet px-5 py-4 shadow-sheet">
              <span aria-hidden className="absolute inset-y-0 left-0 w-[3px] bg-accent" />
              <p className="flex items-center gap-2 text-label font-semibold text-ink">
                <LiveDot />
                {job.kind === "blueprint_part"
                  ? `Regenerating ${partName(job.payload["part"], parts)}`
                  : job.status === "queued"
                    ? "Waiting to start"
                    : (job.message ?? "Building the blueprint")}
              </p>
              <ProgressBar
                className="mt-3"
                value={Math.round(job.progress * 100)}
                max={100}
                live
                label="Blueprint progress"
                valueText={`${Math.round(job.progress * 100)} per cent`}
              />
              <p className="mt-2 text-small text-ink-secondary">A new version appears here when the run finishes. Every earlier version is kept.</p>
            </section>
          )}

          {failed && (
            <Banner
              tone="error"
              title={failed.kind === "blueprint_part" ? "Regenerating the part stopped" : "The blueprint build stopped"}
              action={
                failed.kind === "blueprint" && canWrite ? (
                  <Button
                    size="sm"
                    icon={RefreshCw}
                    onClick={() => create.mutate({ bookId, input: blueprintCreateInput(apiBook.settings) })}
                    loading={create.isPending}
                    loadingLabel="Starting"
                  >
                    Try again
                  </Button>
                ) : undefined
              }
            >
              {failed.error ?? "It did not finish."} {version ? `Version ${version.version} is still the current plan.` : "Nothing was saved."}
            </Banner>
          )}

          {bp.isSuccess && !version && !active && (
            <EmptyState
              drawing="page"
              title="Build the blueprint"
              body={
                apiBook.title
                  ? "The planner writes the summary, audience, every chapter with its subheadings, the front and back matter and the listing, using the research and the chosen title. Start it with Build the blueprint below."
                  : "Choose a title on the Titles step first. The planner builds the whole plan from the research and the chosen title."
              }
            />
          )}

          {approved && version && (
            <Banner tone="info" title={`Version ${version.version} is approved`}>
              Writing follows this plan. An edit or a regenerated part makes a new draft version to approve; chapters already written are flagged, not
              rewritten.
            </Banner>
          )}

          {version && guard && guard.needsAttention.length > 0 && <GuardrailNote items={guard.needsAttention} />}

          {d && version && (
            <GalleySheet
              className="sm:px-8! sm:py-8! lg:px-10!"
              label={`Blueprint version ${version.version}`}
              metaLeft={
                <span className="inline-flex items-center gap-1.5">
                  {approved && <Lock size={12} strokeWidth={2} aria-hidden />}
                  Blueprint, version {version.version}
                  {approved ? ", approved" : ", draft"}
                </span>
              }
              metaRight={`${d.chapters.length} chapters, ${formatNumber(totals.chapterWords + totals.front + totals.back)} words`}
            >
              <div className="mt-6 grid gap-9 @container">
                <PartBlock
                  id="bp-summary"
                  busy={busyFor("summary")}
                  selected={selected === "summary"}
                  title="Title, summary and audience"
                  onEdit={
                    canWrite
                      ? () => {
                          const t = editSummary();
                          if (t) openEdit(t);
                        }
                      : undefined
                  }
                  onSelect={() => setSelected("summary")}
                >
                  <p className="opsz-display font-book text-[30px] leading-[36px] font-medium tracking-[-0.02em] text-ink">
                    {d.title || <Empty>No title in the plan</Empty>}
                  </p>
                  {d.subtitle && <p className="font-book text-[19px] leading-7 text-ink-secondary italic">{d.subtitle}</p>}
                  <Rows
                    items={[
                      { label: "Summary", value: d.summary },
                      { label: "Audience", value: d.audience },
                      { label: "Tone", value: d.tone_notes },
                      { label: "Hook style", value: d.hook_style },
                    ]}
                  />
                  {d.usps.length > 0 && <List title="What makes it different" items={d.usps} />}
                </PartBlock>

                {fiction && (
                  <PartBlock
                    id="bp-story"
                    selected={false}
                    title="Story bible"
                    onSelect={() => undefined}
                    onEdit={canWrite && bible ? () => setBibleOpen(true) : undefined}
                  >
                    {bible ? (
                      <StoryBibleView bible={bible} pov={pov} tense={tense} />
                    ) : (
                      <p className="text-small text-ink-secondary">
                        This version has no story bible. The planner writes one with the blueprint
                        {canWrite ? ", or add your own now." : "."}
                      </p>
                    )}
                    {canWrite && (
                      <div className="flex flex-wrap gap-2">
                        {!bible && (
                          <Button size="sm" icon={Pencil} onClick={() => setBibleOpen(true)}>
                            Add a story bible
                          </Button>
                        )}
                        <Button size="sm" variant="ghost" onClick={() => setNarrationOpen(true)}>
                          Change point of view
                        </Button>
                      </div>
                    )}
                  </PartBlock>
                )}

                <PartBlock id="bp-front" busy={busyFor("front")} selected={selected === "front"} title="Front matter" onSelect={() => setSelected("front")}>
                  <MatterList m={d.front} />
                </PartBlock>

                <section className="grid gap-5">
                  <h2 className="border-b border-border pb-2 text-[13px] font-semibold text-ink-secondary">Chapters</h2>
                  {d.chapters.length === 0 && <Empty>No chapters in this version.</Empty>}
                  {d.chapters.map((c) => (
                    <PartBlock
                      key={c.number}
                      id={`bp-chapter-${c.number}`}
                      busy={busyFor(`chapter:${c.number}`)}
                      selected={selected === `chapter:${c.number}`}
                      title={`Chapter ${c.number}`}
                      onSelect={() => setSelected(`chapter:${c.number}`)}
                      onEdit={canWrite ? () => openEdit(editChapter(c)) : undefined}
                      sub
                    >
                      <p className="font-book text-[21px] leading-7 font-medium text-ink">{c.title || <Empty>Untitled</Empty>}</p>
                      {c.summary && <p className="max-w-[68ch] font-book text-[15.5px] leading-[23px] text-ink">{c.summary}</p>}
                      {c.subheadings.length > 0 && <List title="Subheadings" items={c.subheadings} />}
                      {c.key_points.length > 0 && <List title="Key points" items={c.key_points} />}
                      {fiction && <FictionPlan chapter={c} />}
                      {workbook && <ExercisePlanList chapter={c} />}
                      <p className="num text-small text-ink-secondary">
                        {formatNumber(c.word_target)} words{c.takeaways ? ", ends with takeaways" : ""}
                        {c.bridge_note ? `. Bridge: ${c.bridge_note}` : ""}
                      </p>
                    </PartBlock>
                  ))}
                </section>

                <PartBlock id="bp-back" busy={busyFor("back")} selected={selected === "back"} title="Back matter" onSelect={() => setSelected("back")}>
                  <MatterList m={d.back} />
                </PartBlock>

                <PartBlock
                  id="bp-listing"
                  busy={busyFor("listing")}
                  selected={selected === "listing"}
                  title="Listing"
                  onSelect={() => setSelected("listing")}
                  onEdit={
                    canWrite
                      ? () => {
                          const t = editListing();
                          if (t) openEdit(t);
                        }
                      : undefined
                  }
                >
                  <Rows
                    items={[
                      { label: "Amazon description", value: d.description_draft },
                      { label: "Back cover blurb", value: d.back_blurb },
                      { label: "Categories", value: d.categories.join("; ") },
                      { label: "Keywords", value: d.keywords.join(", ") },
                    ]}
                  />
                </PartBlock>
              </div>
            </GalleySheet>
          )}

          {fiction && version && (
            <StoryLedgerPanel
              state={ledger.isPending ? "loading" : ledger.isError ? "error" : "ready"}
              items={ledger.data ?? []}
              bible={bible}
              sectionName={sectionName}
              onRetry={() => void ledger.refetch()}
            />
          )}
        </div>
      </div>

      <Inspector label="Blueprint details" className="lg:h-full lg:overflow-y-auto">
        <InspectorSection title="Version">
          {version ? (
            <KeyValueList
              items={[
                { label: "Version", value: `${version.version}, ${approved ? "approved" : version.status === "draft" ? "draft" : version.status}` },
                { label: "Saved", value: whenMs(version.createdAt) },
                { label: "Made by", value: version.source === "human" ? "You" : version.source.startsWith("ai") ? "The planner" : version.source },
                {
                  label: "Model",
                  value: version.source === "human" ? "None, edited by you" : versionModel ? <ModelName slug={versionModel} /> : "Not recorded",
                },
                { label: "Cost", value: meta.costUsd === null ? "Not recorded" : `$${meta.costUsd.toFixed(2)}` },
              ]}
            />
          ) : (
            <p className="text-small text-ink-secondary">Not built yet.</p>
          )}
        </InspectorSection>

        {d && (
          <InspectorSection title="Word targets">
            <KeyValueList
              items={[
                { label: "Chapters", value: `${totals.chapters}, ${formatNumber(totals.chapterWords)} words` },
                { label: "Front matter", value: `${formatNumber(totals.front)} words` },
                { label: "Back matter", value: `${formatNumber(totals.back)} words` },
                { label: "Book target", value: apiBook.wordTarget ? `${formatNumber(apiBook.wordTarget)} words` : "Not set yet" },
              ]}
            />
          </InspectorSection>
        )}

        {version && selectedPart && canWrite && (
          <InspectorSection title="Selected part">
            <Select
              label="Part"
              value={selectedPart.key}
              onChange={(k) => {
                const p = parts.find((x) => x.key === k);
                if (p) select(p);
              }}
              options={parts.map((p) => ({ value: p.key, label: p.label }))}
            />
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                size="sm"
                icon={RefreshCw}
                disabledReason={active ? "Wait for the current run to finish." : undefined}
                onClick={() => {
                  setInstruction("");
                  regen.reset();
                  setRegenOpen(true);
                }}
              >
                Regenerate {selectedPart.key.startsWith("chapter:") ? "chapter" : "part"}
              </Button>
            </div>
          </InspectorSection>
        )}

        {missing.length > 0 && (
          <InspectorSection title="Before you approve" tone="attention">
            <ul className="grid gap-1.5">
              {missing.map((m) => (
                <li key={m} className="text-small text-ink">
                  {m}
                </li>
              ))}
            </ul>
          </InspectorSection>
        )}

        <InspectorSection title="Versions" aside={versions.data ? <span className="num text-small text-ink-tertiary">{versions.data.length}</span> : undefined}>
          {versions.isPending ? (
            <Skeleton className="w-full" />
          ) : !versions.data || versions.data.length === 0 ? (
            <p className="text-small text-ink-secondary">No versions yet.</p>
          ) : (
            <ol className="grid gap-2">
              {[...versions.data]
                .sort((a, b) => b.version - a.version)
                .map((v) => (
                  <li key={v.id} className="grid gap-0.5 text-small">
                    <span className="flex items-center gap-1.5 font-semibold text-ink">
                      Version {v.version}
                      {v.status === "approved" && <Check size={13} strokeWidth={2.25} aria-label="approved" className="text-success" />}
                    </span>
                    <span className="text-ink-secondary">
                      {v.note ?? (v.source === "human" ? "Edited by you" : "From the planner")}, {whenMs(v.createdAt)}
                    </span>
                    <Button size="sm" variant="ghost" disabled={historyLoading || active} onClick={() => void compareVersion(v.version)}>
                      {canWrite ? "Compare and restore" : "Compare"}
                    </Button>
                  </li>
                ))}
            </ol>
          )}
        </InspectorSection>
        {apiBook.approvedBlueprintId && apiBook.title && <RebuildBook bookId={bookId} title={apiBook.title} className="mt-5" />}
      </Inspector>

      {historyError && (
        <Banner tone="error" title="Version could not be opened">
          {historyError}
        </Banner>
      )}
      <Modal
        open={history !== null}
        onClose={() => setHistory(null)}
        size="lg"
        title={`Compare version ${history?.version ?? ""}`}
        description="Compare with the latest blueprint. Restoring creates a new draft and keeps every earlier version."
        footer={
          <>
            <Button variant="ghost" onClick={() => setHistory(null)}>
              Close
            </Button>
            {canWrite && (
              <Button icon={RotateCcw} loading={patch.isPending} disabled={active || history?.version === version?.version} onClick={restoreHistory}>
                Restore as a new draft
              </Button>
            )}
          </>
        }
      >
        {history && version && (
          <div className="grid gap-6 md:grid-cols-2">
            {[history, version].map((item, index) => (
              <div key={index} className="min-w-0">
                <h3 className="mb-3 font-semibold">
                  {index === 0 ? "Selected" : "Latest"}: version {item.version}
                </h3>
                <pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap break-words font-ui text-small">{blueprintHistoryText(blueprintData(item))}</pre>
              </div>
            ))}
          </div>
        )}
        {patch.isError && (
          <Banner tone="error" title="Version was not restored">
            {plainError(patch.error)}
            {isApiError(patch.error) && patch.error.status === 409 && (
              <Button variant="ghost" onClick={reloadAfterConflict}>
                Reload the latest blueprint
              </Button>
            )}
          </Banner>
        )}
      </Modal>
      {fiction && (
        <>
          <StoryBibleEditor
            open={bibleOpen}
            initial={bible ?? emptyBible()}
            description={version ? `Saved as a new version on top of version ${version.version}. Version ${version.version} stays in Versions.` : undefined}
            saving={patch.isPending}
            error={
              patch.isError && bibleOpen ? (
                <Banner
                  tone={conflict ? "attention" : "error"}
                  title={conflict ? "The blueprint changed while you were editing" : "The story bible was not saved"}
                  action={
                    conflict ? (
                      <Button size="sm" icon={RotateCcw} onClick={reloadAfterConflict}>
                        Reload
                      </Button>
                    ) : undefined
                  }
                >
                  {plainError(patch.error)}
                </Banner>
              ) : null
            }
            onClose={() => {
              setBibleOpen(false);
              patch.reset();
            }}
            onSave={saveBible}
          />
          <NarrationEditor
            open={narrationOpen}
            pov={pov ?? ""}
            tense={tense ?? "past"}
            saving={updateBook.isPending}
            error={
              updateBook.isError ? (
                <Banner tone="error" title="The point of view was not saved">
                  {plainError(updateBook.error)}
                </Banner>
              ) : null
            }
            onClose={() => {
              setNarrationOpen(false);
              updateBook.reset();
            }}
            onSave={saveNarration}
          />
        </>
      )}
      {/* Edit a part */}
      <Modal
        open={edit !== null}
        onClose={() => setEdit(null)}
        size="lg"
        title={edit ? `Edit ${edit.part.label.toLowerCase()}` : "Edit"}
        description={editBase !== null ? `Saved as a new version on top of version ${editBase}. Version ${editBase} stays in Versions.` : undefined}
        footer={
          <>
            <Button variant="ghost" onClick={() => setEdit(null)}>
              Cancel
            </Button>
            <Button icon={Pencil} loading={patch.isPending} loadingLabel="Saving" disabledReason={conflict ? "Reload first." : undefined} onClick={saveEdit}>
              Save as a new version
            </Button>
          </>
        }
      >
        <div className="grid gap-4">
          {conflict ? (
            <Banner
              tone="attention"
              title="The blueprint changed while you were editing"
              action={
                <Button size="sm" icon={RotateCcw} onClick={reloadAfterConflict}>
                  Reload
                </Button>
              }
            >
              A newer version was saved since you opened this part, so your edit was not saved. Reload to see the latest version, then make your change again.
            </Banner>
          ) : (
            patch.isError && (
              <Banner tone="error" title="The edit was not saved">
                {plainError(patch.error)}
              </Banner>
            )
          )}
          {edit?.fields.map((f) =>
            f.kind === "input" || f.kind === "number" ? (
              <Input
                key={f.name}
                label={f.label}
                type={f.kind === "number" ? "number" : "text"}
                inputMode={f.kind === "number" ? "numeric" : undefined}
                value={editValues[f.name] ?? ""}
                onChange={(e) => setEditValues((v) => ({ ...v, [f.name]: e.target.value }))}
                hint={f.hint}
              />
            ) : (
              <Textarea
                key={f.name}
                label={f.label}
                rows={f.kind === "lines" ? 4 : 3}
                value={editValues[f.name] ?? ""}
                onChange={(e) => setEditValues((v) => ({ ...v, [f.name]: e.target.value }))}
                hint={f.hint}
              />
            ),
          )}
        </div>
      </Modal>

      {/* Regenerate a part */}
      <Modal
        open={regenOpen}
        onClose={() => setRegenOpen(false)}
        title={`Regenerate ${(selectedPart?.label ?? "part").toLowerCase()}`}
        description="The planner rewrites this part only. The rest of the blueprint goes in as fixed context, and the current version is kept."
        footer={
          <>
            <Button variant="ghost" onClick={() => setRegenOpen(false)}>
              Cancel
            </Button>
            <Button
              icon={RefreshCw}
              loading={regen.isPending}
              loadingLabel="Starting"
              estimate={estimateWords(regenEstimate.data)}
              onClick={() => {
                if (!selectedPart) return;
                const text = instruction.trim();
                regen.mutate(text ? { bookId, part: selectedPart.key, instruction: text } : { bookId, part: selectedPart.key }, {
                  onSuccess: () => setRegenOpen(false),
                });
              }}
            >
              Regenerate {selectedPart?.key.startsWith("chapter:") ? "chapter" : "part"}
            </Button>
          </>
        }
      >
        <div className="grid gap-4">
          {regen.isError && (
            <Banner tone="error" title="Did not start">
              {plainError(regen.error)}
            </Banner>
          )}
          <Textarea
            label="Instruction (optional)"
            rows={3}
            value={instruction}
            maxLength={4000}
            onChange={(e) => setInstruction(e.target.value)}
            hint="For example: a stronger opening scene, or less about policy."
          />
          {version && (
            <KeyValueList
              items={[
                {
                  label: "Model",
                  value: regenEstimate.data?.model ? <ModelName slug={regenEstimate.data.model} /> : regenEstimate.isPending ? "Working it out" : "Not known",
                },
                { label: "Estimate", value: estimateWords(regenEstimate.data) ?? (regenEstimate.isPending ? "Working it out" : "Not available") },
                { label: "New version", value: `Version ${version.version + 1}` },
              ]}
            />
          )}
        </div>
      </Modal>

      {/* Approve */}
      <Modal
        open={approveOpen}
        onClose={() => setApproveOpen(false)}
        initialFocus={approveCancelRef}
        title={`Approve blueprint version ${version?.version ?? ""}?`}
        description="Approving locks this version, creates the book's sections and opens Writing. Later edits make a new draft version; chapters already written are not rewritten."
        footer={
          <>
            <Button ref={approveCancelRef} variant="ghost" onClick={() => setApproveOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              loading={approve.isPending}
              loadingLabel="Approving"
              onClick={() =>
                version &&
                approve.mutate(
                  { bookId, version: version.version },
                  {
                    onSuccess: () => {
                      setApproveOpen(false);
                      void navigate(writingPath);
                    },
                  },
                )
              }
            >
              Approve blueprint
            </Button>
          </>
        }
      >
        <div className="grid gap-4">
          {approve.isError && (
            <Banner tone="error" title="The blueprint was not approved">
              {plainError(approve.error)}
            </Banner>
          )}
          <KeyValueList
            items={[
              { label: "Chapters", value: String(totals.chapters) },
              { label: "Words planned", value: formatNumber(totals.chapterWords + totals.front + totals.back) },
              { label: "Budget", value: `$${apiBook.budgetUsd.toFixed(2)}, $${apiBook.costToDateUsd.toFixed(2)} spent` },
            ]}
          />
          <p className="text-small text-ink-tertiary">
            Writing starts from the Writing step. Checks run after every section, and the job pauses only if the AI provider runs out of credits.
          </p>
        </div>
      </Modal>
    </div>
  );
}

const strs = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim().length > 0) : []);

/** Fiction chapter plan: viewpoint character, setting and scene beats (blueprint.blueprint-fiction). */
function FictionPlan({ chapter }: { chapter: BlueprintChapterData }) {
  const pov = typeof chapter["povCharacter"] === "string" ? chapter["povCharacter"] : "";
  const setting = typeof chapter["setting"] === "string" ? chapter["setting"] : "";
  const scenes = strs(chapter["scenes"]);
  if (!pov && !setting && scenes.length === 0) return null;
  return (
    <>
      {(pov || setting) && (
        <Rows
          items={[
            { label: "Viewpoint", value: pov },
            { label: "Setting", value: setting },
          ]}
        />
      )}
      {scenes.length > 0 && <List title="Scenes" items={scenes} />}
    </>
  );
}

const exerciseKinds: Record<string, string> = {
  reflection: "Reflection",
  checklist: "Checklist",
  "fill-in": "Fill-in",
  tracker: "Tracker",
  scenario: "Scenario",
};

/** Workbook chapter plan: the 2 to 4 exercises the writer must include (blueprint.blueprint-workbook). */
function ExercisePlanList({ chapter }: { chapter: BlueprintChapterData }) {
  const raw = Array.isArray(chapter["exercises"]) ? chapter["exercises"] : [];
  const items = raw.flatMap((e) => {
    if (typeof e !== "object" || e === null) return [];
    const r = e as Record<string, unknown>;
    const kind = typeof r["kind"] === "string" ? r["kind"] : "";
    const title = typeof r["title"] === "string" ? r["title"] : "";
    const purpose = typeof r["purpose"] === "string" ? r["purpose"] : "";
    const lines = typeof r["lines"] === "number" ? r["lines"] : null;
    return [`${exerciseKinds[kind] ?? "Exercise"}: ${title || "untitled"}${purpose ? `. ${purpose}` : ""}${lines ? ` (${lines} lines to write on)` : ""}`];
  });
  if (items.length === 0) return <p className="text-small text-accent-text">No exercises planned. Workbook chapters need 2 to 4.</p>;
  return <List title={`Exercises (${items.length})`} items={items} />;
}

function partName(part: unknown, parts: Part[]): string {
  const p = parts.find((x) => x.key === part);
  return p ? p.label.toLowerCase() : "a part";
}

function PartBlock({
  id,
  title,
  selected,
  onSelect,
  onEdit,
  sub,
  busy,
  children,
}: {
  id: string;
  title: string;
  selected: boolean;
  onSelect: () => void;
  onEdit?: (() => void) | undefined;
  sub?: boolean;
  busy?: boolean;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      className={cn("grid scroll-mt-4 content-start gap-3 border-l-2 pl-4", sub ? "border-border" : "border-transparent", selected && "vol-pencil-edge")}
    >
      <div className={cn("flex items-center justify-between gap-3", !sub && "border-b border-border pb-2")}>
        <h2 className="text-[13px] font-semibold text-ink-secondary">{title}</h2>
        {onEdit && (
          <IconButton
            icon={Pencil}
            size="sm"
            label={`Edit ${title.toLowerCase()}`}
            onClick={() => {
              onSelect();
              onEdit();
            }}
          />
        )}
      </div>
      {busy && (
        <p role="status" className="flex items-center gap-2 text-small font-semibold text-accent-text">
          <LiveDot /> Regenerating this part. The new version appears when it is done.
        </p>
      )}
      {children}
    </section>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <span className="text-small text-ink-tertiary">{children}</span>;
}

function Rows({ items }: { items: { label: string; value: string }[] }) {
  return (
    <dl className="grid gap-2.5">
      {items.map((i) => (
        <div key={i.label} className="grid gap-0.5 sm:grid-cols-[150px_minmax(0,1fr)] sm:gap-4">
          <dt className="text-small text-ink-secondary">{i.label}</dt>
          <dd className={cn("font-book text-[15.5px] leading-[23px] [overflow-wrap:anywhere]", i.value ? "text-ink" : "text-ink-tertiary")}>
            {i.value || "Not set yet"}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function List({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="grid gap-1.5">
      <p className="text-small text-ink-secondary">{title}</p>
      <ul className="grid gap-1.5">
        {items.map((t, i) => (
          <li key={`${i}-${t}`} className="border-l-2 border-border-strong pl-3 font-book text-[15.5px] leading-[23px] text-ink">
            {t}
          </li>
        ))}
      </ul>
    </div>
  );
}

function MatterList({ m }: { m: Record<string, unknown> }) {
  const rows = matterRows(m);
  if (rows.length === 0) return <Empty>None in this version.</Empty>;
  return (
    <dl className="grid gap-2.5">
      {rows.map((r) => (
        <div key={r.key} className="grid gap-0.5 sm:grid-cols-[150px_minmax(0,1fr)] sm:gap-4">
          <dt className="text-small text-ink-secondary">{r.label}</dt>
          <dd className="font-book text-[15.5px] leading-[23px] text-ink">
            {r.text || <span className="text-ink-tertiary">No notes in the plan</span>}
            {r.words !== null && <span className="num ml-2 font-ui text-small text-ink-tertiary">{formatNumber(r.words)} words</span>}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function blueprintHistoryText(data: BlueprintData): string {
  return [
    data.title,
    data.subtitle,
    data.summary,
    `Audience: ${data.audience}`,
    `Tone: ${data.tone_notes}`,
    ...data.usps,
    ...matterRows(data.front).map((row) => `${row.label}: ${row.text}`),
    ...data.chapters.map((chapter) =>
      [
        `Chapter ${chapter.number}: ${chapter.title}`,
        chapter.summary,
        ...chapter.subheadings.map((heading) => (typeof heading === "string" ? heading : String(heading))),
      ].join("\n"),
    ),
    ...matterRows(data.back).map((row) => `${row.label}: ${row.text}`),
    data.back_blurb,
    data.description_draft,
    ...data.categories,
    ...data.keywords,
  ]
    .filter(Boolean)
    .join("\n\n");
}
