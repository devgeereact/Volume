import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useCanWrite } from "../../lib/access";
import { useNavigate } from "react-router";
import { BookOpen, ListTree, RefreshCw, Sparkles } from "lucide-react";
import { Banner, Button, EmptyState, Input, KeyValueList, LiveDot, Modal, ModelName, PageHeader, ProgressBar, Switch, Textarea } from "../../components/ui";
import { calmWardBlueprint, getModel, getPenName, type Blueprint, type Book, type ClaimToVerify } from "../../demo";
import { DEMO_NOW } from "../../demo/books";
import { scrollBehavior } from "../../lib/motion";
import { formatDuration, formatNumber, formatRelative, formatUsd } from "../../lib/format";
import { useStepAction } from "../../lib/stepAction";
import { useBook } from "../../lib/useBook";
import { bookStepPath } from "../../screens";
import { NotFound } from "../../shell/NotFound";
import { DemoStates, useScreenState } from "../research/DemoStates";
import { RunModelModal } from "../research/RunModelModal";
import { about, estimateFor, useSimulatedRun } from "../research/sim";
import { BlueprintApi } from "./BlueprintApi";
import type { Totals } from "./BlueprintInspector";
import { buildOutline, groupLabels, insertedWords, regenAlternates, type OutlinePart } from "./blueprintExtras";
import { CheckList, OutlineCard, PlanCounts, SideLabel, VersionChip, VersionList } from "./ChapterPlan";
import { Galley, type Diff, type Note } from "./Galley";
import { CATEGORIES_COUNT, DESCRIPTION_MAX, KEYWORDS_MAX } from "./ListingEditors";
import { OutlineRail } from "./OutlineRail";
import { TypeBlueprint } from "./TypeBlueprint";

/* Blueprint screen (docs/03-design/UX-SPEC.md, M6; approved Volume Studio design, stBlueprint).
   Two columns: the Outline card (front matter, numbered chapters with editable titles and word-target
   bars, back matter) and the right card (the chosen part with its plan, word target, claims and
   Regenerate; the whole book with its checks; model and spend; tone; versions with Restore).
   Arrange sections (switch parts on or off, reorder) and the full plan with the listing editors open
   in dialogs. Approve blueprint is the step action: confirm what writing will cost and take, then Writing. */

const bp = calmWardBlueprint;
const RANGE = { min: 25000, max: 50000 };
const BUILD_COST = 0.11;

export default function BlueprintPage() {
  const { book, apiBook } = useBook();
  if (!book) return <NotFound what="book" />;
  if (apiBook) return <BlueprintApi key={book.id} book={book} apiBook={apiBook} />;
  if (book.id !== "the-calm-ward") return <OtherBook book={book} />;
  return <BlueprintScreen key={book.id} book={book} />;
}

function OtherBook({ book }: { book: Book }) {
  return <TypeBlueprint book={book} />;
}

function partLabel(p: OutlinePart | undefined, numbers: Record<string, number>): string {
  if (!p) return "Title, summary and audience";
  if (p.group === "chapters") return numbers[p.id] !== undefined ? `Chapter ${numbers[p.id]}` : p.title;
  return p.title;
}

function baseEstimate(p: OutlinePart | undefined): number {
  if (!p) return 0.05;
  if (p.group === "chapters") return 0.04;
  if (p.group === "publishing" || p.group === "marketing") return 0.03;
  return 0.02;
}

function BlueprintScreen({ book }: { book: Book }) {
  const canWrite = useCanWrite();
  const navigate = useNavigate();
  const pen = getPenName(book.penNameId);
  const [screen, setScreen] = useScreenState("ready");
  const [parts, setParts] = useState<OutlinePart[]>(buildOutline);
  const [selectedId, setSelectedId] = useState("chapter-4");
  const [planOpen, setPlanOpen] = useState(false);
  const [version, setVersion] = useState(bp.version);
  const [versions, setVersions] = useState<Blueprint["versions"]>(bp.versions);
  const [blueprintCost, setBlueprintCost] = useState(0.11);
  const [claims, setClaims] = useState<ClaimToVerify[]>(bp.claims);
  const [diff, setDiff] = useState<Diff | null>(null);
  const [result, setResult] = useState<{ text: string; undo: { partId: string; prev: string } | null } | null>(null);
  const [listing, setListing] = useState({ description: bp.listing.amazonDescription, categories: bp.listing.categories, keywords: bp.listing.keywords });
  const [modelSlug, setModelSlug] = useState(bp.model);
  const [outlineOpen, setOutlineOpen] = useState(false);
  const [regenOpen, setRegenOpen] = useState(false);
  const [instruction, setInstruction] = useState("");
  const [keepSubheadings, setKeepSubheadings] = useState(true);
  const [approveOpen, setApproveOpen] = useState(false);
  const [approving, setApproving] = useState(false);
  const [modelOpen, setModelOpen] = useState(false);
  const [regenTarget, setRegenTarget] = useState<{ id: string; label: string; est: number } | null>(null);
  const regenCancelRef = useRef<HTMLButtonElement>(null);
  const approveCancelRef = useRef<HTMLButtonElement>(null);

  // Chapter numbers follow the order of the switched-on chapters.
  const numbers = useMemo(() => {
    const out: Record<string, number> = {};
    parts.filter((p) => p.group === "chapters" && p.on).forEach((p, i) => (out[p.id] = i + 1));
    return out;
  }, [parts]);
  const selectedPart = parts.find((p) => p.id === selectedId);
  const selectedLabel = partLabel(selectedPart, numbers);

  const totals: Totals = useMemo(() => {
    const on = parts.filter((p) => p.on);
    const ch = on.filter((p) => p.group === "chapters").map((p) => p.wordTarget ?? 0);
    const sum = (g: OutlinePart["group"]) => on.filter((p) => p.group === g).reduce((s, p) => s + (p.wordTarget ?? 0), 0);
    const chapters = ch.reduce((s, n) => s + n, 0);
    return {
      total: chapters + sum("front") + sum("back"),
      chapters: ch.length,
      chapterMin: ch.length ? Math.min(...ch) : 0,
      chapterMax: ch.length ? Math.max(...ch) : 0,
      front: sum("front"),
      back: sum("back"),
    };
  }, [parts]);

  const planChapters: { key: string; number: number; title: string; wordTarget: number }[] = useMemo(
    () =>
      parts
        .filter((p) => p.group === "chapters" && p.on)
        .map((p) => ({
          key: p.id,
          number: numbers[p.id] ?? 0,
          title: p.title,
          wordTarget: p.wordTarget ?? 0,
        })),
    [parts, numbers],
  );
  const frontBackParts = parts.filter((p) => p.on && (p.group === "front" || p.group === "back")).length;

  const openClaims = claims.filter((c) => c.status === "open" && parts.find((p) => p.id === `chapter-${c.chapter}`)?.on);
  const claimCounts = useMemo(() => {
    const out: Record<string, number> = {};
    for (const c of claims) if (c.status === "open" && c.chapter !== null) out[`chapter-${c.chapter}`] = (out[`chapter-${c.chapter}`] ?? 0) + 1;
    return out;
  }, [claims]);

  const missing = useMemo(() => {
    const out: { text: string; partId: string | null }[] = [];
    for (const p of parts) if (p.required && !p.on) out.push({ text: `${p.title} is off. Every book needs it.`, partId: p.id });
    if (totals.chapters < 6) out.push({ text: "Switch on at least 6 chapters.", partId: null });
    if (totals.total < RANGE.min || totals.total > RANGE.max)
      out.push({ text: `The word total is ${formatNumber(totals.total)}. Keep it from 25,000 to 50,000.`, partId: null });
    if (!listing.description.trim() || listing.description.length > DESCRIPTION_MAX)
      out.push({ text: "The Amazon description must be 1 to 4,000 characters.", partId: "amazon-description" });
    if (listing.categories.filter((c) => c.trim()).length !== CATEGORIES_COUNT) out.push({ text: "Add all 3 categories.", partId: "categories" });
    if (listing.keywords.length !== KEYWORDS_MAX) out.push({ text: `Keywords: ${listing.keywords.length} of 7.`, partId: "keywords" });
    return out;
  }, [parts, totals, listing]);

  /* ---------- runs ---------- */

  const build = useSimulatedRun(() => setScreen("ready"));
  const regen = useSimulatedRun(() => {
    if (!regenTarget) return;
    const part = parts.find((p) => p.id === regenTarget.id);
    const prev = part ? part.note : "";
    const next = regenAlternates[regenTarget.id];
    const changed = part !== undefined && next !== undefined && next !== prev;
    const v = version + 1;
    if (changed) {
      setParts((ps) => ps.map((p) => (p.id === regenTarget.id ? { ...p, note: next } : p)));
      setDiff({ partId: regenTarget.id, prev, version: v });
      // A claim sentence the writer softened is no longer open.
      setClaims((cs) => cs.map((c) => (prev.includes(c.text) && !next.includes(c.text) ? { ...c, status: "softened" } : c)));
    }
    setVersion(v);
    setVersions((vs) => [
      ...vs,
      {
        version: v,
        at: DEMO_NOW,
        note: changed ? `${regenTarget.label} regenerated${instruction ? `: ${instruction}` : "."}` : `${regenTarget.label} kept as it was.`,
        cost: regenTarget.est,
      },
    ]);
    setBlueprintCost((c) => Math.round((c + regenTarget.est) * 100) / 100);
    setResult({
      text: changed
        ? `Version ${v} saved. ${regenTarget.label} was rewritten; blue pencil marks the new words.`
        : `Version ${v} saved. The writer kept ${regenTarget.label.toLowerCase()} as it was.`,
      undo: changed ? { partId: regenTarget.id, prev } : null,
    });
    setRegenTarget(null);
  });

  useEffect(() => {
    if (screen === "loading" && build.status === "idle") build.start({ durationMs: 5200, costUsd: BUILD_COST, steps: ["Planning"] });
    // Start the build preview once when the screen opens in its loading state.
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const building = build.status === "running";
  const failed = build.status === "failed" || (screen === "error" && build.status !== "running");
  const busy = building || regen.status === "running";

  /** Opens the full plan, at a part when one is given. */
  function showInPlan(id: string | null) {
    if (id) setSelectedId(id);
    setPlanOpen(true);
    if (id) {
      // Twice: the dialog draws first, then the part can be found and scrolled to.
      requestAnimationFrame(() =>
        requestAnimationFrame(() => document.getElementById(`bp-${id}`)?.scrollIntoView({ block: "start", behavior: scrollBehavior() })),
      );
    }
  }

  function toggle(id: string) {
    setParts((ps) => ps.map((p) => (p.id === id ? { ...p, on: !p.on } : p)));
  }

  function move(id: string, delta: number) {
    setParts((ps) => {
      const p = ps.find((x) => x.id === id);
      if (!p) return ps;
      const siblings = ps.filter((x) => x.group === p.group);
      const i = siblings.indexOf(p);
      const j = i + delta;
      if (j < 0 || j >= siblings.length) return ps;
      const reordered = [...siblings];
      reordered[i] = siblings[j] as OutlinePart;
      reordered[j] = p;
      return replaceGroup(ps, p.group, reordered);
    });
  }

  function dropBefore(id: string, beforeId: string | null) {
    setParts((ps) => {
      const p = ps.find((x) => x.id === id);
      if (!p) return ps;
      const siblings = ps.filter((x) => x.group === p.group && x.id !== id);
      const at = beforeId ? siblings.findIndex((x) => x.id === beforeId) : siblings.length;
      siblings.splice(at < 0 ? siblings.length : at, 0, p);
      return replaceGroup(ps, p.group, siblings);
    });
  }

  function openRegen() {
    setInstruction("");
    setKeepSubheadings(true);
    setRegenOpen(true);
  }

  function confirmRegen() {
    const est = estimateFor(baseEstimate(selectedPart), "~anthropic/claude-opus-latest", modelSlug);
    setRegenTarget({ id: selectedId, label: selectedLabel, est });
    setRegenOpen(false);
    setResult(null);
    regen.start({ durationMs: 2600, costUsd: est, steps: ["Rewriting"] });
  }

  function undo() {
    if (!result?.undo) return;
    const { partId, prev } = result.undo;
    const v = version + 1;
    setParts((ps) => ps.map((p) => (p.id === partId ? { ...p, note: prev } : p)));
    setClaims(bp.claims);
    setDiff(null);
    setVersion(v);
    setVersions((vs) => [...vs, { version: v, at: DEMO_NOW, note: `Undo: back to the version ${v - 2} text.`, cost: 0 }]);
    setResult({ text: `Version ${v} saved with the earlier text. Nothing is lost; every version stays in Versions.`, undo: null });
  }

  function restore(n: number) {
    const v = version + 1;
    if (diff && n < diff.version) {
      const prev = diff.prev;
      setParts((ps) => ps.map((p) => (p.id === diff.partId ? { ...p, note: prev } : p)));
      setClaims(bp.claims);
      setDiff(null);
    }
    setVersion(v);
    setVersions((vs) => [...vs, { version: v, at: DEMO_NOW, note: `Restored version ${n}.`, cost: 0 }]);
    setResult({ text: `Version ${v} saved as a copy of version ${n}.`, undo: null });
  }

  /* ---------- notes ---------- */

  const notes: Note[] = useMemo(() => {
    const list: Note[] = [];
    if (!building) {
      const profile = bp.marginNotes.find((n) => n.kind === "profile");
      if (profile) list.push({ id: profile.id, anchor: "anchor-summary", kind: "profile", label: profile.label, text: profile.text });
    }
    if (diff) {
      list.push({
        id: "note-diff",
        anchor: `bp-${diff.partId}`,
        kind: "selection",
        label: `Changed in version ${diff.version}`,
        text: `Blue pencil marks the new words. Version ${diff.version - 1} is kept in Versions.`,
      });
    }
    // Only say something about the selection when it matters: a part that is switched off.
    if (selectedPart && !selectedPart.on && (!diff || diff.partId !== selectedId)) {
      list.push({
        id: "note-selection",
        anchor: `bp-${selectedId}`,
        kind: "selection",
        label: `${selectedLabel} is off`,
        text: "Switch it on in Arrange sections to include it in the book.",
      });
    }
    for (const c of openClaims) {
      const part = parts.find((p) => p.id === `chapter-${c.chapter}`);
      const inText = part?.note.includes(c.text);
      const fromBoard = bp.marginNotes.find((n) => n.anchor === c.id);
      list.push({
        id: c.id,
        anchor: inText ? `claim-anchor-${c.id}` : `bp-chapter-${c.chapter}`,
        kind: "claim",
        label: "Claim to verify",
        text: fromBoard?.text ?? `${c.text} ${c.reason}`,
      });
    }
    return list;
  }, [building, diff, selectedId, selectedPart, selectedLabel, openClaims, parts]);

  /* ---------- approve ---------- */

  const writer = pen?.defaultWriterModel ?? "~anthropic/claude-sonnet-latest";
  const perBook = getModel(writer)?.exampleBookCostUsd ?? 2.8;
  const writeBase = perBook * (totals.total / 40000);
  const writeLow = Math.round(writeBase * 0.85 * 100) / 100;
  const writeHigh = Math.round(writeBase * 1.3 * 100) / 100;
  const writerSections = parts.filter((p) => p.on && p.source === "writer" && (p.group === "chapters" || p.group === "front" || p.group === "back")).length;
  const spent = Math.round((0.31 + 0.04 + blueprintCost) * 100) / 100;
  const costRows = [
    { label: "Research", usd: 0.31 },
    { label: "Titles", usd: 0.04 },
    { label: `Blueprint, ${versions.length} versions`, usd: blueprintCost },
  ];

  function approve() {
    setApproving(true);
    window.setTimeout(() => navigate(bookStepPath(book.id, "writing")), 700);
  }

  const regenEstimate = about(estimateFor(baseEstimate(selectedPart), "~anthropic/claude-opus-latest", modelSlug));
  const approveReason =
    busy || screen === "empty"
      ? "Wait for the current run to finish."
      : missing.length > 0
        ? `Before you approve: ${missing.map((m) => m.text).join(" ")}`
        : undefined;

  // The one gilt button lives in the step footer (D-016); it opens the confirm dialog.
  useStepAction({ label: "Approve blueprint", onClick: () => setApproveOpen(true), disabledReason: approveReason });

  const outlineFront = parts.filter((p) => p.group === "front" && p.on).map((p) => ({ key: p.id, label: p.title }));
  const outlineBack = parts.filter((p) => p.group === "back" && p.on).map((p) => ({ key: p.id, label: p.title }));
  const outlineChapters = planChapters.map((c) => ({ key: c.key, number: c.number, title: c.title, wordTarget: c.wordTarget, claims: claimCounts[c.key] }));
  const selectedClaims = openClaims.filter((c) => `chapter-${c.chapter}` === selectedId);
  const inRange = totals.total >= RANGE.min && totals.total <= RANGE.max;
  const model = getModel(modelSlug);

  return (
    <div className="grid gap-4 px-4 min-[861px]:px-6">
      <PageHeader
        title="Blueprint"
        summary="The plan for every section. You approve it before any writing starts."
        actions={
          screen === "empty" ? undefined : (
            <VersionChip
              version={version}
              total={versions.length}
              approved={false}
              items={versions.map((v) => ({ version: v.version, when: formatRelative(v.at), note: v.note, detail: formatUsd(v.cost) }))}
              actionLabel="Restore"
              onAction={restore}
              actionDisabledReason={busy ? "Wait for the current run to finish." : undefined}
            />
          )
        }
      />

      {result && (
        <Banner
          tone="success"
          title={result.text}
          action={
            <div className="flex gap-2">
              {result.undo && (
                <Button size="sm" onClick={undo}>
                  Undo
                </Button>
              )}
              <Button size="sm" variant="ghost" onClick={() => setResult(null)}>
                Dismiss
              </Button>
            </div>
          }
        />
      )}

      {failed && !building && screen !== "empty" && (
        <Banner
          tone="error"
          title="The plan came back incomplete"
          action={
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                icon={RefreshCw}
                onClick={() => {
                  setScreen("loading");
                  build.start({ durationMs: 5200, costUsd: BUILD_COST, steps: ["Planning"] });
                }}
              >
                Try again
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setModelOpen(true)}>
                Pick another model
              </Button>
            </div>
          }
        >
          Chapters 6 to 10 were missing, so nothing was saved and nothing was charged. Version {version} is still the current plan.
        </Banner>
      )}

      {building && (
        <section aria-label="Building the blueprint" className="vol-glass rounded-card px-[18px] py-4">
          <p className="text-label font-semibold text-ink">Building the blueprint. Parts fill in as they arrive.</p>
          <ProgressBar
            className="mt-3"
            value={Math.round(build.progress * 100)}
            max={100}
            live
            label="Blueprint progress"
            valueText={`${formatUsd(build.cost)} so far, ${about(BUILD_COST)} in all`}
          />
        </section>
      )}

      {screen === "empty" && !building ? (
        <EmptyState
          drawing="page"
          title="Build the blueprint"
          body="The planner writes the summary, audience, every chapter with its subheadings, the front and back matter and the listing, using the research and the chosen title."
          action={
            !canWrite ? undefined : (
              <Button
                icon={Sparkles}
                estimate={about(BUILD_COST)}
                onClick={() => {
                  setScreen("loading");
                  build.start({ durationMs: 5200, costUsd: BUILD_COST, steps: ["Planning"] });
                }}
              >
                Build the blueprint
              </Button>
            )
          }
        />
      ) : (
        !building && (
          <>
            <PlanCounts
              items={[
                { label: "Chapters", value: totals.chapters },
                { label: "Words planned", value: totals.total },
                { label: "Front and back parts", value: frontBackParts },
                { label: "Listing keywords", value: listing.keywords.length },
              ]}
            />
            <div className="grid items-start gap-4 min-[1180px]:grid-cols-[minmax(0,1fr)_320px]">
              <OutlineCard
                front={outlineFront}
                chapters={outlineChapters}
                back={outlineBack}
                selectedKey={selectedId}
                onSelect={setSelectedId}
                onTitle={canWrite && !busy ? (id, title) => setParts((ps) => ps.map((p) => (p.id === id ? { ...p, title } : p))) : undefined}
                tools={
                  <>
                    {canWrite && (
                      <Button size="sm" variant="ghost" icon={ListTree} onClick={() => setOutlineOpen(true)}>
                        Arrange sections
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" icon={BookOpen} onClick={() => showInPlan(null)}>
                      Read the full plan
                    </Button>
                  </>
                }
              />

              <aside
                aria-label="Blueprint details"
                className="vol-glass grid min-w-0 content-start rounded-card p-[18px] min-[1180px]:sticky min-[1180px]:top-(--shell-sticky-top)"
              >
                <div aria-live="polite">
                  <SideLabel>{selectedPart?.group === "chapters" ? selectedLabel : selectedPart ? groupLabels[selectedPart.group] : "The book"}</SideLabel>
                  <h3 className="mt-0.5 mb-1.5 font-book text-[17px] leading-[1.3] font-semibold text-ink [overflow-wrap:anywhere]">
                    {selectedPart?.title ?? bp.title}
                  </h3>
                  {regen.status === "running" && regenTarget?.id === selectedId && (
                    <p role="status" className="mb-1.5 flex items-center gap-2 text-small font-semibold text-mint-ink">
                      <LiveDot /> Rewriting, {formatUsd(regen.cost)} so far.
                    </p>
                  )}
                  <p className="text-[13.5px] leading-[1.55] text-ink-2">
                    {selectedPart ? <PlanText text={selectedPart.note} prev={diff?.partId === selectedId ? diff.prev : null} /> : bp.summary}
                  </p>
                  {selectedPart?.chapter && selectedPart.chapter.subheadings.length > 0 && (
                    <>
                      <SideLabel>Subheadings</SideLabel>
                      <ol className="grid list-decimal gap-1.5 pl-[18px] text-[13px] text-ink-2 marker:text-ink-3">
                        {selectedPart.chapter.subheadings.map((s) => (
                          <li key={s}>{s}</li>
                        ))}
                      </ol>
                    </>
                  )}
                  {selectedPart && !selectedPart.on && <p className="mt-2 text-small text-amber">This part is off. Switch it on in Arrange sections.</p>}
                  {selectedPart && selectedPart.wordTarget !== null && (
                    <div className="mt-3">
                      {canWrite ? (
                        <Input
                          key={`${selectedId}-${selectedPart.wordTarget}`}
                          label="Word target"
                          inputMode="numeric"
                          defaultValue={String(selectedPart.wordTarget)}
                          onBlur={(e) => {
                            const n = Number(e.target.value.replace(/[^\d]/g, ""));
                            if (n > 0) setParts((ps) => ps.map((p) => (p.id === selectedId ? { ...p, wordTarget: n } : p)));
                          }}
                          hint={selectedPart.group === "chapters" ? "Chapters run 2,000 to 4,000 words. Each is written within 15% of its target." : undefined}
                        />
                      ) : (
                        <p className="flex justify-between text-[13px]">
                          <span className="text-ink-3">Word target</span>
                          <span className="num font-medium text-ink">{formatNumber(selectedPart.wordTarget)}</span>
                        </p>
                      )}
                    </div>
                  )}
                  {selectedClaims.length > 0 && (
                    <ul className="mt-3 grid gap-1.5">
                      {selectedClaims.map((c) => (
                        <li key={c.id} className="rounded-control bg-claim-wash px-2.5 py-2 text-small text-ink">
                          <b className="block font-semibold">Claim to verify</b>
                          {c.text} <span className="text-ink-2">{c.reason}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  <div className="mt-3 flex flex-wrap gap-2">
                    {canWrite && (
                      <Button
                        size="sm"
                        icon={RefreshCw}
                        estimate={regenEstimate}
                        loading={regen.status === "running"}
                        loadingLabel="Rewriting"
                        disabledReason={busy && regen.status !== "running" ? "Wait for the blueprint to finish." : undefined}
                        onClick={openRegen}
                      >
                        Regenerate {selectedPart?.group === "chapters" ? "chapter" : "part"}
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => showInPlan(selectedId)}>
                      Show in the full plan
                    </Button>
                  </div>
                </div>

                <hr className="mt-4 border-line" />
                <SideLabel>The whole book</SideLabel>
                <p className="text-[13.5px] leading-[1.55] text-ink-2">{bp.summary}</p>
                <CheckList
                  items={[
                    { key: "chapters", ok: totals.chapters >= 6, label: `${totals.chapters} chapters with summaries` },
                    { key: "matter", ok: !parts.some((p) => p.required && !p.on), label: "Front and back matter set" },
                    { key: "listing", ok: listing.keywords.length === KEYWORDS_MAX, label: `Listing drafted, ${listing.keywords.length} keywords` },
                    {
                      key: "range",
                      ok: inRange,
                      label: `${formatNumber(totals.total)} words, template range ${formatNumber(RANGE.min)} to ${formatNumber(RANGE.max)}`,
                    },
                  ]}
                />
                {missing.length > 0 && (
                  <div className="rounded-control bg-amber-wash px-3 py-2.5">
                    <p className="text-small font-semibold text-ink">Before you approve</p>
                    <ul className="mt-1 grid gap-1">
                      {missing.map((m) => (
                        <li key={m.text} className="text-small text-ink">
                          {m.partId ? (
                            <button type="button" onClick={() => showInPlan(m.partId)} className="text-left underline underline-offset-2">
                              {m.text}
                            </button>
                          ) : (
                            m.text
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {openClaims.length > 0 && (
                  <>
                    <SideLabel>Claims to verify, {openClaims.length}</SideLabel>
                    <ul className="grid gap-1">
                      {openClaims.map((c) => (
                        <li key={c.id}>
                          <button
                            type="button"
                            onClick={() => setSelectedId(`chapter-${c.chapter}`)}
                            className="w-full rounded-sm py-1 text-left text-[13px] text-ink hover:text-mint-ink"
                          >
                            {c.location}
                            <span className="block text-small text-ink-2">{c.reason}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                    <p className="mt-1.5 text-small text-ink-3">Claims stay open into writing. You resolve them in the Editor.</p>
                  </>
                )}

                <SideLabel>Model and spend</SideLabel>
                <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3.5 gap-y-2 text-[13px]">
                  <dt className="text-ink-3">Model</dt>
                  <dd className="text-right font-medium text-ink">
                    <ModelName slug={modelSlug} />
                    {model ? `, ${model.provider}` : ""}
                  </dd>
                  {costRows.map((r) => (
                    <Fragment key={r.label}>
                      <dt className="text-ink-3">{r.label}</dt>
                      <dd className="num text-right font-medium text-ink">{formatUsd(r.usd)}</dd>
                    </Fragment>
                  ))}
                  <dt className="font-semibold text-ink">Spent so far</dt>
                  <dd className="num text-right font-semibold text-ink">{formatUsd(spent)}</dd>
                </dl>
                {canWrite && (
                  <Button size="sm" variant="ghost" className="mt-2 justify-self-start" onClick={() => setModelOpen(true)}>
                    Change model
                  </Button>
                )}

                <SideLabel>Tone</SideLabel>
                <ul className="grid gap-1">
                  {bp.toneNotes.map((t) => (
                    <li key={t} className="font-book text-[13.5px] text-ink-2 italic">
                      {t}
                    </li>
                  ))}
                </ul>

                <SideLabel>Versions</SideLabel>
                <VersionList
                  items={versions.map((v) => ({ version: v.version, note: v.note, detail: formatUsd(v.cost) }))}
                  current={version}
                  actionLabel="Restore"
                  onAction={restore}
                  disabledReason={busy ? "Wait for the current run to finish." : undefined}
                />
              </aside>
            </div>
          </>
        )
      )}

      <DemoStates
        value={screen}
        onChange={(s) => {
          build.reset();
          setScreen(s);
          if (s === "loading") build.start({ durationMs: 5200, costUsd: BUILD_COST, steps: ["Planning"] });
        }}
      />

      <Modal
        open={outlineOpen}
        onClose={() => setOutlineOpen(false)}
        title="Arrange sections"
        description="Switch parts on or off and change their order. Required parts stay on."
        footer={
          <Button variant="ghost" onClick={() => setOutlineOpen(false)}>
            Done
          </Button>
        }
      >
        <OutlineRail
          parts={parts}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onToggle={toggle}
          onMove={move}
          onDrop={dropBefore}
          claimCounts={claimCounts}
          numbers={numbers}
          locked={false}
        />
      </Modal>

      <Modal
        open={planOpen}
        onClose={() => setPlanOpen(false)}
        size="lg"
        title={`Full plan, version ${version}`}
        description="Every part of the blueprint as the writer will read it, with the listing you can edit."
        footer={
          <Button variant="ghost" onClick={() => setPlanOpen(false)}>
            Close
          </Button>
        }
      >
        <Galley
          parts={parts}
          numbers={numbers}
          selectedId={selectedId}
          onSelect={setSelectedId}
          penName={pen?.name ?? ""}
          shortBio={pen?.shortBio ?? ""}
          claims={openClaims}
          version={version}
          versionCount={versions.length}
          notes={notes}
          diff={diff}
          regenerating={regen.status === "running" && regenTarget ? { partId: regenTarget.id, cost: regen.cost } : null}
          building={null}
          locked={!canWrite}
          listing={listing}
          onListing={setListing}
        />
      </Modal>
      <Modal
        open={regenOpen}
        onClose={() => setRegenOpen(false)}
        initialFocus={regenCancelRef}
        title={`Regenerate ${selectedLabel.toLowerCase()}`}
        description="The writer rewrites this part only. The rest of the blueprint goes in as fixed context, and the current version is kept."
        footer={
          <>
            <Button ref={regenCancelRef} variant="ghost" onClick={() => setRegenOpen(false)}>
              Cancel
            </Button>
            <Button icon={RefreshCw} estimate={regenEstimate} onClick={confirmRegen}>
              Regenerate {selectedPart?.group === "chapters" ? "chapter" : "part"}
            </Button>
          </>
        }
      >
        <div className="grid gap-4">
          <Textarea
            label="Instruction (optional)"
            rows={3}
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            hint="For example: a stronger opening scene, or less about policy."
          />
          {selectedPart?.group === "chapters" && (
            <Switch label="Keep the subheadings" description="Only the summary and plan change." checked={keepSubheadings} onChange={setKeepSubheadings} />
          )}
          <KeyValueList
            items={[
              { label: "Model", value: modelSlug, mono: true },
              { label: "Estimate", value: regenEstimate },
              { label: "New version", value: `Version ${version + 1}` },
            ]}
          />
        </div>
      </Modal>

      <Modal
        open={approveOpen}
        onClose={() => setApproveOpen(false)}
        initialFocus={approveCancelRef}
        title={`Approve blueprint version ${version}?`}
        description="Approving locks this version and opens Writing. Later edits make a new draft version; chapters already written are not rewritten."
        footer={
          <>
            <Button ref={approveCancelRef} variant="ghost" onClick={() => setApproveOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" loading={approving} loadingLabel="Locking version" onClick={approve}>
              Approve blueprint
            </Button>
          </>
        }
      >
        <div className="grid gap-4">
          <div className="grid grid-cols-2 gap-4 rounded-md border border-border bg-sheet p-4">
            <div>
              <p className="text-small text-ink-secondary">Writing will cost</p>
              <p className="num font-book text-[24px] leading-8 text-ink">
                {formatUsd(writeLow)} to {formatUsd(writeHigh)}
              </p>
            </div>
            <div>
              <p className="text-small text-ink-secondary">And take about</p>
              <p className="num font-book text-[24px] leading-8 text-ink">{formatDuration(Math.round(totals.total / 300))}</p>
            </div>
          </div>
          <KeyValueList
            items={[
              { label: "Sections to write", value: `${writerSections}, including ${totals.chapters} chapters` },
              { label: "Words", value: formatNumber(totals.total) },
              { label: "Writer", value: writer, mono: true },
              { label: "Spent so far", value: formatUsd(spent) },
              { label: "Claims still open", value: String(openClaims.length) },
            ]}
          />
          <p className="text-small text-ink-tertiary">
            Example prices. Checks run after every chapter, and the job pauses only if the AI provider runs out of credits. {groupLabels.publishing} and{" "}
            {groupLabels.marketing.toLowerCase()} are written at the end.
          </p>
        </div>
      </Modal>

      <RunModelModal
        open={modelOpen}
        onClose={() => setModelOpen(false)}
        title="Model for this blueprint"
        description="Used when you regenerate a part or rebuild the plan. The estimate is for one chapter."
        confirmLabel="Use this model"
        baseUsd={0.04}
        baseSlug="~anthropic/claude-opus-latest"
        initialSlug={modelSlug}
        withInstruction={false}
        onConfirm={(slug) => {
          setModelSlug(slug);
          setModelOpen(false);
        }}
      />
    </div>
  );
}

function replaceGroup(all: OutlinePart[], group: OutlinePart["group"], ordered: OutlinePart[]): OutlinePart[] {
  let k = 0;
  return all.map((p) => (p.group === group ? (ordered[k++] as OutlinePart) : p));
}

/** A part's plan text; after a regeneration the new words are marked in blue pencil. */
function PlanText({ text, prev }: { text: string; prev: string | null }) {
  if (prev === null) return <>{text}</>;
  return (
    <>
      {insertedWords(prev, text).map((w, i) =>
        w.added ? (
          <Fragment key={i}>
            {i > 0 && " "}
            <mark className="rounded-xs bg-select-wash text-select">{w.word}</mark>
          </Fragment>
        ) : (
          <Fragment key={i}>
            {i > 0 && " "}
            {w.word}
          </Fragment>
        ),
      )}
    </>
  );
}
