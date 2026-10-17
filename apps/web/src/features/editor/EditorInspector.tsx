import { useState, type ReactNode } from "react";
import { Link } from "react-router";
import { Check, Flag, MessageSquarePlus, Sparkles, Undo2, X } from "lucide-react";
import {
  Button,
  Checkbox,
  Figure,
  Input,
  Inspector,
  InspectorSection,
  Loader,
  modKey,
  SegmentedControl,
  Skeleton,
  Tabs,
  tabPanelProps,
  Textarea,
} from "../../components/ui";
import { cn } from "../../lib/cn";
import { formatNumber } from "../../lib/format";
import type { ClaimStatus, MsClaim, MsNote, MsSection, MsSuggestion, NoteStatus, SuggestionPass } from "./manuscript";
import type { SuggestionState } from "./useManuscript";
import { DiffText } from "./DiffText";
import type { Issue } from "./textTools";

export type InspectorTab = "checks" | "claims" | "suggestions" | "notes";

const passLabels: Record<SuggestionPass, string> = { structure: "Structure", line: "Line edit (UK)", voice: "Voice" };
const passCosts: Record<SuggestionPass, string> = { structure: "about $0.05", line: "about $0.03", voice: "about $0.03" };

interface EditorInspectorProps {
  bookId: string;
  tab: InspectorTab;
  onTab: (t: InspectorTab) => void;
  section: MsSection;
  sectionLabel: (sectionId: string) => string;
  words: number;
  issues: Issue[];
  onFixIssue: (issue: Issue) => void;
  claims: MsClaim[];
  onClaim: (claim: MsClaim, action: "verify" | "soften" | "remove" | "undo", note?: string) => void;
  pass: SuggestionPass;
  onPass: (p: SuggestionPass) => void;
  passRun: boolean;
  passRunning: boolean;
  onRunPass: () => void;
  suggestions: MsSuggestion[];
  suggestionState: Record<string, SuggestionState>;
  onSuggestion: (s: MsSuggestion, action: "accept" | "reject" | "undo") => void;
  onAllSuggestions: (action: "accept" | "reject") => void;
  notes: MsNote[];
  onShowNote: (id: string) => void;
  onAddNote: () => void;
  canAddNote: boolean;
  /** API mode: "Remember for this profile" when accepting a suggestion. */
  remember?: { checked: boolean; onChange: (on: boolean) => void } | undefined;
  /** False when decisions cannot be undone here (API mode: the server keeps each one as a version). */
  canUndo?: boolean | undefined;
  /** API mode: the soften box is always editable, prefilled with the suggested wording when there is one. */
  softenEditable?: boolean | undefined;
  /** A line under the tabs, for example an error from the server. */
  notice?: ReactNode;
  /** API mode: what the writer's guardrails flagged in this section's latest AI run (null when none ran). */
  guardrails?: { passed: boolean; items: { message: string; severity: string; match: string | null }[] } | null | undefined;
  /** A viewer's role: everything reads, no fix, decision or note buttons. */
  readOnly?: boolean | undefined;
}

/** Inspector tabs for the Editor: Checks, Claims, Suggestions and Versions. */
export function EditorInspector(props: EditorInspectorProps) {
  const { tab, onTab, claims, suggestions, suggestionState } = props;
  const openClaims = claims.filter((c) => c.status === "open").length;
  const pending = suggestions.filter((s) => (suggestionState[s.id] ?? "pending") === "pending").length;
  const openNotes = props.notes.filter((n) => n.status === "draft" || n.status === "working" || n.status === "ready").length;
  return (
    <Inspector label="Editor inspector" width="100%" className="xl:h-full">
      <Tabs
        idBase="ed-insp"
        label="Inspector"
        className="-mx-6 -mt-5 mb-4 px-1"
        value={tab}
        onChange={(t) => onTab(t as InspectorTab)}
        items={[
          { id: "checks", label: "Checks" },
          { id: "claims", label: "Claims", count: openClaims || undefined, countTone: "claim" },
          { id: "suggestions", label: "Edits", count: pending || undefined },
          { id: "notes", label: "Notes", count: openNotes || undefined },
        ]}
      />
      {props.notice}
      <div {...tabPanelProps("ed-insp", tab)} className="relative focus-visible:outline-offset-4">
        {tab === "checks" && <ChecksPanel {...props} />}
        {tab === "claims" && <ClaimsPanel {...props} />}
        {tab === "suggestions" && <SuggestionsPanel {...props} />}
        {tab === "notes" && <NotesPanel {...props} />}
      </div>
    </Inspector>
  );
}

function ChecksPanel({ section, words, issues, onFixIssue, claims, guardrails, readOnly }: EditorInspectorProps) {
  const target = section.wordTarget;
  const over = target !== null ? words - target : 0;
  const inRange = target === null || Math.abs(over) <= target * 0.15;
  const emDashes = issues.filter((i) => i.kind === "em-dash");
  const spellings = issues.filter((i) => i.kind === "spelling");
  const banned = issues.filter((i) => i.kind === "banned");
  const open = claims.filter((c) => c.status === "open" && c.sectionId === section.id).length;
  return (
    <>
      <InspectorSection title="Words in this section">
        <Figure value={formatNumber(words)} unit={target ? `of ${formatNumber(target)}` : "words"} />
        {target !== null && over > 0 && (
          <div
            role="status"
            className={cn("mt-2 flex items-start gap-2 rounded-sm px-3 py-2 text-small", inRange ? "bg-accent-wash text-ink" : "bg-claim-wash text-ink")}
          >
            <Flag size={14} strokeWidth={2} aria-hidden className={cn("mt-0.5 shrink-0", inRange ? "text-accent-text" : "text-claim")} />
            <span>
              <b className="font-semibold">{formatNumber(over)} words over the target.</b>{" "}
              {inRange
                ? "Still inside the 15% allowance, so export will not warn."
                : "Past the 15% allowance. Trim this section or raise its target in the blueprint before export."}
            </span>
          </div>
        )}
        {target !== null && over <= 0 && (
          <p className={cn("mt-1 flex items-center gap-1.5 text-small", inRange ? "text-success" : "text-accent-text")}>
            {inRange ? <Check size={14} strokeWidth={2} aria-hidden /> : <Flag size={14} strokeWidth={2} aria-hidden />}
            {inRange ? "On target" : `${formatNumber(-over)} words under the target`}
          </p>
        )}
      </InspectorSection>
      <InspectorSection title="House style, checked as you type">
        <ul className="grid gap-2.5 text-[14px] leading-5">
          <CheckRow
            ok={emDashes.length === 0}
            label={emDashes.length === 0 ? "No em dashes" : `${emDashes.length} em ${emDashes.length === 1 ? "dash" : "dashes"}`}
          >
            {emDashes.length > 0 && !readOnly && (
              <Button size="sm" variant="ghost" className="-ml-2" onClick={() => emDashes.forEach(onFixIssue)}>
                Replace with commas
              </Button>
            )}
          </CheckRow>
          <CheckRow
            ok={spellings.length === 0}
            label={spellings.length === 0 ? "British spelling" : `${spellings.length} US ${spellings.length === 1 ? "spelling" : "spellings"}`}
          >
            {spellings.map((s, i) => (
              <span key={i} className="flex flex-wrap items-center gap-x-2 text-small text-ink-secondary">
                &ldquo;{s.found}&rdquo; to &ldquo;{s.fix}&rdquo;
                {!readOnly && (
                  <Button size="sm" variant="ghost" onClick={() => onFixIssue(s)}>
                    Fix
                  </Button>
                )}
              </span>
            ))}
          </CheckRow>
          <CheckRow
            ok={banned.length === 0}
            label={banned.length === 0 ? "No banned phrases" : `${banned.length} banned ${banned.length === 1 ? "phrase" : "phrases"}`}
          >
            {banned.map((b, i) => (
              <span key={i} className="block text-small text-ink-secondary">
                &ldquo;{b.found}&rdquo;: rewrite this line in your own words.
              </span>
            ))}
          </CheckRow>
          <CheckRow ok={open === 0} claim label={open === 0 ? "No open claims here" : `${open} ${open === 1 ? "claim" : "claims"} to verify`} />
        </ul>
      </InspectorSection>
      {guardrails !== undefined && (
        <InspectorSection title="Writer's guardrails, last AI run">
          {guardrails === null ? (
            <p className="text-small text-ink-secondary">No AI run on this section yet, so nothing to report.</p>
          ) : guardrails.items.length === 0 ? (
            <p className="flex items-center gap-1.5 text-small text-success">
              <Check size={14} strokeWidth={2} aria-hidden />
              Nothing needs your attention.
            </p>
          ) : (
            <ul className="grid gap-2.5 text-[14px] leading-5">
              {guardrails.items.map((g, i) => (
                <CheckRow key={i} ok={false} claim={g.severity === "error" || g.severity === "block"} label={g.message}>
                  {g.match && <span className="text-small text-ink-secondary">Found: &ldquo;{g.match}&rdquo;</span>}
                </CheckRow>
              ))}
            </ul>
          )}
        </InspectorSection>
      )}
    </>
  );
}

function CheckRow({ ok, label, claim, children }: { ok: boolean; label: string; claim?: boolean; children?: ReactNode }) {
  return (
    <li className="grid grid-cols-[18px_minmax(0,1fr)] gap-x-2">
      <span className={cn("mt-0.5", ok ? "text-success" : claim ? "text-claim" : "text-accent-text")}>
        {ok ? <Check size={14} strokeWidth={2} aria-hidden /> : <Flag size={14} strokeWidth={2} aria-hidden />}
        <span className="sr-only">{ok ? "Passed:" : "Needs attention:"}</span>
      </span>
      <span className="grid gap-1">
        <span className="text-ink">{label}</span>
        {children}
      </span>
    </li>
  );
}

const statusText: Record<ClaimStatus, string> = { open: "Open", verified: "Verified", softened: "Softened", removed: "Removed" };

function ClaimsPanel({ bookId, section, claims, onClaim, sectionLabel, canUndo = true, softenEditable = false, readOnly }: EditorInspectorProps) {
  const sorted = [...claims].sort((a, b) => Number(b.sectionId === section.id) - Number(a.sectionId === section.id));
  if (claims.length === 0)
    return <p className="text-body text-ink-secondary">No claims in this book. The checker found nothing medical, legal or statistical to verify.</p>;
  return (
    <>
      <p className="mb-3 text-small text-ink-secondary">
        Medical, legal and statistical statements go here until you check them. Preflight warns while any stay open.
      </p>
      <ul className="grid gap-3">
        {sorted.map((c) => (
          <ClaimCard
            key={c.id}
            claim={c}
            here={c.sectionId === section.id}
            where={sectionLabel(c.sectionId)}
            bookId={bookId}
            onClaim={onClaim}
            canUndo={canUndo}
            softenEditable={softenEditable}
            readOnly={readOnly === true}
          />
        ))}
      </ul>
    </>
  );
}

function ClaimCard({
  claim,
  here,
  where,
  bookId,
  onClaim,
  canUndo,
  softenEditable,
  readOnly,
}: {
  readOnly: boolean;
  claim: MsClaim;
  here: boolean;
  where: string;
  bookId: string;
  onClaim: EditorInspectorProps["onClaim"];
  canUndo: boolean;
  softenEditable: boolean;
}) {
  const [mode, setMode] = useState<"idle" | "verify" | "soften">("idle");
  const [note, setNote] = useState("");
  // No softer wording on file (API mode): the owner writes it, starting from the sentence.
  const ownWording = softenEditable || claim.softened === "";
  const [softer, setSofter] = useState(claim.softened || claim.sentence);
  const open = claim.status === "open";
  return (
    <li className={cn("rounded-md border p-3", open ? "border-transparent bg-claim-wash" : "border-border bg-canvas")}>
      <p className="flex flex-wrap items-center justify-between gap-2 text-caption">
        <span className={cn("inline-flex items-center gap-1 font-semibold", open ? "text-claim" : "text-ink-secondary")}>
          <Flag size={12} strokeWidth={2} aria-hidden />
          {claim.category}, {where}
        </span>
        <span className={cn("font-semibold", open ? "text-claim" : claim.status === "removed" ? "text-ink-secondary" : "text-success")}>
          {statusText[claim.status]}
        </span>
      </p>
      <p className={cn("mt-2 font-book text-[15px] leading-[23px] text-ink", claim.status === "removed" && "line-through decoration-ink-tertiary")}>
        {claim.status === "softened" ? claim.softened || claim.sentence : claim.sentence}
      </p>
      {open && <p className="mt-1.5 text-small text-ink-secondary">{claim.check}</p>}
      {claim.note && <p className="mt-1.5 text-small text-ink-secondary">Checked: {claim.note}</p>}

      {open && mode === "idle" && (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {here && readOnly ? null : here ? (
            <>
              <Button size="sm" onClick={() => setMode("verify")}>
                Verify
              </Button>
              <Button size="sm" onClick={() => setMode("soften")}>
                Soften
              </Button>
              <Button size="sm" variant="ghost" onClick={() => onClaim(claim, "remove")}>
                Remove
              </Button>
            </>
          ) : (
            <Link
              to={`/books/${bookId}/editor/${claim.sectionId}`}
              className="inline-flex h-8 items-center rounded-sm border border-border-strong bg-sheet px-3 text-small font-semibold text-ink hover:bg-sunken hit-44"
            >
              Go to {where.toLowerCase()}
            </Link>
          )}
        </div>
      )}
      {open && mode === "verify" && (
        <div className="mt-2.5 grid gap-2">
          <Input
            label="Where you checked it"
            hint="For example the trust policy page or a source title."
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <div className="flex gap-1.5">
            <Button size="sm" icon={Check} onClick={() => onClaim(claim, "verify", note.trim() || "marked as checked by you")}>
              Mark verified
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setMode("idle")}>
              Cancel
            </Button>
          </div>
        </div>
      )}
      {open && mode === "soften" && (
        <div className="mt-2.5 grid gap-2">
          {softenEditable && claim.softened && (
            <>
              <p className="text-small text-ink-secondary">Suggested softer wording:</p>
              <p className="rounded-sm bg-sheet px-2.5 py-2 font-book text-[15px] leading-[23px] text-ink">
                <DiffText before={claim.sentence} after={claim.softened} show="after" />
              </p>
            </>
          )}
          {ownWording ? (
            <Textarea
              label="Softer wording"
              hint="Change the sentence so it claims only what you can stand behind."
              rows={3}
              value={softer}
              onChange={(e) => setSofter(e.target.value)}
            />
          ) : (
            <>
              <p className="text-small text-ink-secondary">Softer wording:</p>
              <p className="rounded-sm bg-sheet px-2.5 py-2 font-book text-[15px] leading-[23px] text-ink">
                <DiffText before={claim.sentence} after={claim.softened} show="after" />
              </p>
            </>
          )}
          <div className="flex gap-1.5">
            <Button
              size="sm"
              icon={Check}
              disabledReason={ownWording && (softer.trim() === "" || softer.trim() === claim.sentence.trim()) ? "Change the wording first." : undefined}
              onClick={() => (ownWording ? onClaim(claim, "soften", softer.trim()) : onClaim(claim, "soften"))}
            >
              Use softer wording
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setMode("idle")}>
              Cancel
            </Button>
          </div>
        </div>
      )}
      {!open && here && canUndo && !readOnly && (
        <Button size="sm" variant="ghost" icon={Undo2} className="mt-1.5 -ml-2" onClick={() => onClaim(claim, "undo")}>
          Undo
        </Button>
      )}
    </li>
  );
}

function SuggestionsPanel({
  pass,
  onPass,
  passRun,
  passRunning,
  onRunPass,
  suggestions,
  suggestionState,
  onSuggestion,
  onAllSuggestions,
  remember,
  canUndo = true,
  readOnly,
}: EditorInspectorProps) {
  const list = suggestions.filter((s) => s.pass === pass);
  const pending = list.filter((s) => (suggestionState[s.id] ?? "pending") === "pending");
  return (
    <>
      <SegmentedControl
        size="sm"
        className="w-full"
        label="Editor pass"
        value={pass}
        onChange={onPass}
        options={(["structure", "line", "voice"] as SuggestionPass[]).map((p) => ({ value: p, label: p === "line" ? "Line edit" : passLabels[p] }))}
      />
      <p className="mt-2 text-small text-ink-secondary">
        {pass === "structure" && "Order, bridges and takeaways for this section."}
        {pass === "line" && "Sentence by sentence, in British English."}
        {pass === "voice" && "Checks the text sounds like the pen name's voice."}
      </p>

      {passRunning ? (
        <div role="status" aria-label={`Running ${passLabels[pass]}`} className="mt-4 grid gap-2">
          <p className="flex items-center gap-2 text-small text-ink-secondary">
            <Loader />
            The editor is reading this section
          </p>
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : !passRun ? (
        <div className="mt-4 rounded-md border border-dashed border-border-strong p-4">
          <p className="text-label text-ink">{passLabels[pass]} has not run on this section.</p>
          {!readOnly && (
            <Button className="mt-3" icon={Sparkles} estimate={passCosts[pass]} onClick={onRunPass}>
              Run {pass === "line" ? "line edit" : passLabels[pass].toLowerCase()}
            </Button>
          )}
        </div>
      ) : list.length === 0 ? (
        <p className="mt-4 flex items-center gap-1.5 text-small text-success">
          <Check size={14} strokeWidth={2} aria-hidden />
          No suggestions. This section reads well for this pass.
        </p>
      ) : (
        <>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <p className="num mr-auto text-small text-ink-secondary">
              {pending.length} of {list.length} waiting
            </p>
            {!readOnly && (
              <>
                <Button
                  size="sm"
                  variant="ghost"
                  disabledReason={pending.length === 0 ? "Nothing waiting." : undefined}
                  onClick={() => onAllSuggestions("reject")}
                >
                  Reject all
                </Button>
                <Button size="sm" disabledReason={pending.length === 0 ? "Nothing waiting." : undefined} onClick={() => onAllSuggestions("accept")}>
                  Accept all
                </Button>
              </>
            )}
          </div>
          {remember && !readOnly && (
            <Checkbox
              className="mt-1"
              label="Remember for this profile"
              description="Accepted changes are saved to the pen name's memory, so the writer follows them next time."
              checked={remember.checked}
              onChange={remember.onChange}
            />
          )}
          <ul className="mt-3 grid gap-3">
            {list.map((s) => {
              const st = suggestionState[s.id] ?? "pending";
              return (
                <li key={s.id} className={cn("rounded-md border border-border p-3", st === "pending" ? "bg-sheet" : "bg-canvas")}>
                  <p className="font-book text-[15px] leading-[23px] text-ink">
                    <DiffText before={s.original} after={s.proposed} />
                  </p>
                  <p className="mt-1.5 text-small text-ink-secondary">{s.reason}</p>
                  {st === "pending" && readOnly ? null : st === "pending" ? (
                    <div className="mt-2 flex gap-1.5">
                      <Button size="sm" icon={Check} onClick={() => onSuggestion(s, "accept")}>
                        Accept
                      </Button>
                      <Button size="sm" variant="ghost" icon={X} onClick={() => onSuggestion(s, "reject")}>
                        Reject
                      </Button>
                    </div>
                  ) : (
                    <p className="mt-2 flex min-h-8 items-center gap-2 text-small">
                      <span className={st === "accepted" ? "text-success" : st === "stale" ? "text-accent-text" : "text-ink-secondary"}>
                        {st === "accepted" ? "Accepted" : st === "stale" ? "Out of date: the text changed after this was suggested" : "Rejected"}
                      </span>
                      {canUndo && st !== "stale" && !readOnly && (
                        <Button size="sm" variant="ghost" icon={Undo2} onClick={() => onSuggestion(s, "undo")}>
                          Undo
                        </Button>
                      )}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </>
  );
}

const noteStatusText: Record<NoteStatus, string> = {
  draft: "Waiting",
  working: "Writing",
  ready: "Ready to review",
  woven: "Woven in",
  expanded: "Made a section",
};

function NotesPanel({ notes, section, sectionLabel, onShowNote, onAddNote, canAddNote, readOnly }: EditorInspectorProps) {
  const isOpen = (n: MsNote) => n.status === "draft" || n.status === "working" || n.status === "ready";
  const sorted = [...notes].sort((a, b) => Number(isOpen(b)) - Number(isOpen(a)) || Number(b.sectionId === section.id) - Number(a.sectionId === section.id));
  return (
    <>
      <p className="text-small text-ink-secondary">
        Type anywhere in the page, or leave a note: a few rough words where something belongs. Weave in turns it into finished text in your voice; Expand into a
        section writes a new subsection. Nothing changes until you accept.
      </p>
      {!readOnly && (
        <Button
          className="mt-3"
          icon={MessageSquarePlus}
          fullWidth
          onClick={onAddNote}
          disabledReason={canAddNote ? undefined : "Write or paste some text first."}
        >
          Add a note
        </Button>
      )}
      {sorted.length === 0 ? (
        <p className="mt-4 text-small text-ink-secondary">No notes yet. Click in a paragraph and press {modKey()} Enter to add one after it.</p>
      ) : (
        <ul className="mt-4 grid gap-2">
          {sorted.map((n) => {
            const open = n.status === "draft" || n.status === "working" || n.status === "ready";
            return (
              <li key={n.id}>
                <button
                  type="button"
                  onClick={() => onShowNote(n.id)}
                  disabled={!open}
                  className={cn(
                    "grid w-full gap-1 rounded-md border px-3 py-2.5 text-left",
                    open ? "border-border bg-sheet hover:bg-sunken" : "border-transparent bg-canvas",
                  )}
                >
                  <span className="flex items-center justify-between gap-2 text-caption">
                    <span className="font-semibold text-ink-secondary">{sectionLabel(n.sectionId)}</span>
                    <span className={cn("font-semibold", n.status === "ready" ? "text-select" : open ? "text-accent-text" : "text-success")}>
                      {noteStatusText[n.status]}
                    </span>
                  </span>
                  <span className="line-clamp-2 font-book text-[15px] leading-[22px] text-ink italic">{n.text.trim() || "Empty note"}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
