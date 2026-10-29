import { useEffect, useMemo, useRef, useState } from "react";
import { useCanWrite } from "../../lib/access";
import { useNavigate } from "react-router";
import { ChevronDown, ListTree, RefreshCw, Sparkles } from "lucide-react";
import { Banner, Button, EmptyState, KeyValueList, Modal, PageHeader, ProgressBar, Switch, Textarea } from "../../components/ui";
import { calmWardBlueprint, getModel, getPenName, type Blueprint, type Book, type ClaimToVerify } from "../../demo";
import { DEMO_NOW } from "../../demo/books";
import { cn } from "../../lib/cn";
import { scrollBehavior } from "../../lib/motion";
import { formatDuration, formatNumber, formatUsd } from "../../lib/format";
import { useStepAction } from "../../lib/stepAction";
import { useBook } from "../../lib/useBook";
import { bookStepPath } from "../../screens";
import { NotFound } from "../../shell/NotFound";
import { DemoStates, useScreenState } from "../research/DemoStates";
import { RunModelModal } from "../research/RunModelModal";
import { about, estimateFor, useSimulatedRun } from "../research/sim";
import { BlueprintApi } from "./BlueprintApi";
import { BlueprintInspector, type Totals } from "./BlueprintInspector";
import { buildOutline, groupLabels, regenAlternates, type OutlinePart } from "./blueprintExtras";
import { Galley, type Diff, type Note } from "./Galley";
import { CATEGORIES_COUNT, DESCRIPTION_MAX, KEYWORDS_MAX } from "./ListingEditors";
import { OutlineRail } from "./OutlineRail";
import { TypeBlueprint } from "./TypeBlueprint";

/* Blueprint screen (docs/03-design/UX-SPEC.md, M6; board: Blueprint frame). Owner: screen agent B.
   Outline rail with every section of the book (switch on or off, reorder by drag or arrows), the
   galley sheet with margin notes, and the inspector with targets, model, cost, claims, versions and
   the two actions: Regenerate part (estimate, confirm, new version, blue pencil diff) and Approve
   blueprint (confirm what writing will cost and take, then Writing). */

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
  const canvasRef = useRef<HTMLDivElement>(null);
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

  function select(id: string) {
    setSelectedId(id);
    requestAnimationFrame(() => document.getElementById(`bp-${id}`)?.scrollIntoView({ block: "start", behavior: scrollBehavior() }));
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

  return (
    <div className="grid grid-cols-1 lg:h-screen-fill lg:grid-cols-[minmax(0,1fr)_auto] lg:grid-rows-[minmax(0,1fr)] xl:grid-cols-[272px_minmax(0,1fr)_auto]">
      <div className="hidden min-h-0 overflow-y-auto border-r border-border xl:block">
        <OutlineRail
          parts={parts}
          selectedId={selectedId}
          onSelect={select}
          onToggle={toggle}
          onMove={move}
          onDrop={dropBefore}
          claimCounts={claimCounts}
          numbers={numbers}
          locked={false}
        />
      </div>

      <div ref={canvasRef} className="min-h-0 min-w-0 lg:overflow-y-auto">
        <PageHeader title="Blueprint" titleHidden />
        <div className="px-4 pt-4 sm:px-6 xl:hidden">
          <button
            type="button"
            aria-expanded={outlineOpen}
            onClick={() => setOutlineOpen((o) => !o)}
            className="flex h-11 w-full items-center gap-2 rounded-md border border-border bg-sheet px-4 text-label text-ink hover:bg-sunken"
          >
            <ListTree size={16} aria-hidden />
            Outline
            <span className="text-small text-ink-tertiary">
              {parts.filter((p) => p.on).length + 1} sections on. Selected: {selectedLabel}
            </span>
            <ChevronDown size={16} aria-hidden className={cn("ml-auto transition-transform duration-(--vol-dur-fast)", outlineOpen && "rotate-180")} />
          </button>
          {outlineOpen && (
            <div className="mt-2 rounded-md border border-border bg-canvas">
              <OutlineRail
                parts={parts}
                selectedId={selectedId}
                onSelect={select}
                onToggle={toggle}
                onMove={move}
                onDrop={dropBefore}
                claimCounts={claimCounts}
                numbers={numbers}
                locked={false}
              />
            </div>
          )}
        </div>

        <div className="grid gap-4 px-3 pt-4 pb-8 sm:px-6 xl:pt-5">
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
            <section aria-label="Building the blueprint" className="relative overflow-hidden rounded-lg border border-border bg-sheet px-5 py-4 shadow-sheet">
              <span aria-hidden className="absolute inset-y-0 left-0 w-[3px] bg-accent" />
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
            <Galley
              parts={parts}
              numbers={numbers}
              selectedId={selectedId}
              onSelect={select}
              penName={pen?.name ?? ""}
              shortBio={pen?.shortBio ?? ""}
              claims={openClaims}
              version={version}
              versionCount={versions.length}
              notes={notes}
              diff={diff}
              regenerating={regen.status === "running" && regenTarget ? { partId: regenTarget.id, cost: regen.cost } : null}
              building={building ? build.progress : null}
              locked={false}
              listing={listing}
              onListing={setListing}
            />
          )}

          <DemoStates
            value={screen}
            onChange={(s) => {
              build.reset();
              setScreen(s);
              if (s === "loading") build.start({ durationMs: 5200, costUsd: BUILD_COST, steps: ["Planning"] });
            }}
          />
        </div>
      </div>

      <BlueprintInspector
        version={version}
        versions={versions}
        totals={totals}
        range={RANGE}
        toneNotes={bp.toneNotes}
        modelSlug={modelSlug}
        onChangeModel={() => setModelOpen(true)}
        costRows={costRows}
        spent={spent}
        regenerating={regen.status === "running" && regenTarget ? { label: regenTarget.label, cost: regen.cost } : null}
        claims={openClaims}
        onClaim={(c) => select(`chapter-${c.chapter}`)}
        selected={{ id: selectedId, label: selectedLabel, part: selectedPart ?? null }}
        onWordTarget={(id, n) => setParts((ps) => ps.map((p) => (p.id === id ? { ...p, wordTarget: n } : p)))}
        missing={missing}
        onFix={select}
        onRestore={restore}
        regenerateEstimate={regenEstimate}
        onRegenerate={openRegen}
        busy={busy || screen === "empty"}
      />

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
