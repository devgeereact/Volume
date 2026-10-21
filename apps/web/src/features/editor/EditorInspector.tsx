import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router";
import { ArrowRight, Check, Flag, MessageSquarePlus, Sparkles, Undo2, X } from "lucide-react";
import { Button, Checkbox, Figure, Input, Inspector, InspectorSection, Loader, modKey, Skeleton, Tabs, tabPanelProps, Textarea } from "../../components/ui";
import { cn } from "../../lib/cn";
import { formatNumber } from "../../lib/format";
import type { ClaimStatus, MsClaim, MsNote, MsSection, MsSuggestion, NoteStatus, SuggestionPass } from "./manuscript";
import type { SuggestionState } from "./useManuscript";
import { DiffText } from "./DiffText";
import type { Issue } from "./textTools";

export type InspectorTab = "fix" | "suggestions" | "notes";

const passLabels: Record<SuggestionPass, string> = { structure: "Structure", line: "Line edit (UK)", voice: "Voice" };
/** Short name of an AI edit pass, for buttons and messages. */
export function passName(p: SuggestionPass): string {
  return p === "line" ? "Line edit" : passLabels[p];
}
const passHelp: Record<SuggestionPass, string> = {
  structure: "Looks at the order of the section, the links between parts and the takeaways.",
  line: "Polishes sentence by sentence, in British English.",
  voice: "Makes the text sound like the pen name.",
};
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
  /** API mode: more ways to fix an open claim in this section (suggested replacements, own wording). */
  renderClaimTools?: ((claim: MsClaim) => ReactNode) | undefined;
  /** A line under the tabs, for example an error from the server. */
  notice?: ReactNode;
  /** API mode: what the writer's guardrails flagged in this section's latest AI run (null when none ran). */
  guardrails?: { passed: boolean; items: { message: string; severity: string; match: string | null }[] } | null | undefined;
  /** A viewer's role: everything reads, no fix, decision or note buttons. */
  readOnly?: boolean | undefined;
  /** A claim picked from the text: its card is shown and highlighted on the To fix tab. */
  focusClaimId?: string | null | undefined;
  /** What the AI is doing for this book right now, shown above everything else (null: nothing). */
  aiBusy?: string | null | undefined;
}

/** Inspector for the Editor: what to do next, then three tabs (To fix, AI edits, Notes). */
export function EditorInspector(props: EditorInspectorProps) {
  const { tab, onTab, claims, suggestions, suggestionState, section, issues } = props;
  // Claim tiers: claims listed for the record keep their underline but do not ask for a check.
  const sectionClaims = claims.filter((c) => c.status === "open" && c.sectionId === section.id && c.needsCheck !== false).length;
  const pending = suggestions.filter((s) => (suggestionState[s.id] ?? "pending") === "pending").length;
  const openNotes = props.notes.filter((n) => n.status === "draft" || n.status === "working" || n.status === "ready").length;
  const toFix = sectionClaims + issues.length;
  return (
    <Inspector label="Editor inspector" width="100%" className="xl:h-full">
      <Tabs
        idBase="ed-insp"
        label="Inspector"
        className="-mx-6 -mt-5 mb-4 px-1"
        value={tab}
        onChange={(t) => onTab(t as InspectorTab)}
        items={[
          { id: "fix", label: "To fix", count: toFix || undefined, countTone: sectionClaims > 0 ? "claim" : undefined },
          { id: "suggestions", label: "AI edits", count: pending || undefined },
          { id: "notes", label: "Notes", count: openNotes || undefined },
        ]}
      />
      {props.aiBusy && (
        <p role="status" className="mb-3 flex items-start gap-2 rounded-md bg-select-wash px-3 py-2.5 text-small text-ink">
          <Loader />
          <span>
            <b className="font-semibold">AI working: </b>
            {props.aiBusy}
          </span>
        </p>
      )}
      {!props.readOnly && <NextStep {...props} sectionClaims={sectionClaims} pending={pending} />}
      {props.notice}
      <div {...tabPanelProps("ed-insp", tab)} className="relative focus-visible:outline-offset-4">
        {tab === "fix" && (
          <>
            <ClaimsPanel {...props} />
            <ChecksPanel {...props} />
          </>
        )}
        {tab === "suggestions" && <SuggestionsPanel {...props} />}
        {tab === "notes" && <NotesPanel {...props} />}
      </div>
    </Inspector>
  );
}

/** One line that says what to do next in this section, with a button that goes there. */
function NextStep({ bookId, issues, onTab, tab, sectionClaims, pending }: EditorInspectorProps & { sectionClaims: number; pending: number }) {
  const fixable = issues.filter((i) => i.fix !== null).length;
  const rewrite = issues.length - fixable;
  let text: string;
  let go: { tab: InspectorTab; label: string } | null = null;
  if (sectionClaims > 0) {
    text = `Check ${sectionClaims} ${sectionClaims === 1 ? "claim" : "claims"} underlined in red. Mark each one checked, soften it or remove it.`;
    go = { tab: "fix", label: "Show claims" };
  } else if (fixable > 0) {
    text = `Fix ${fixable} house style ${fixable === 1 ? "problem" : "problems"} (em dashes or US spelling). One click each.`;
    go = { tab: "fix", label: "Show fixes" };
  } else if (rewrite > 0) {
    text = `Rewrite ${rewrite} banned ${rewrite === 1 ? "phrase" : "phrases"} in your own words.`;
    go = { tab: "fix", label: "Show phrases" };
  } else if (pending > 0) {
    text = `${pending} AI ${pending === 1 ? "edit is" : "edits are"} waiting. Accept or reject each one.`;
    go = { tab: "suggestions", label: "Show AI edits" };
  } else {
    text = "This section is clear. Go to the next section, or ask the AI for edits first if you want them.";
  }
  const done = go === null;
  return (
    <div
      role="status"
      className={cn("mb-4 flex flex-wrap items-start gap-2 rounded-md px-3 py-2.5 text-small", done ? "bg-success-wash text-ink" : "bg-accent-wash text-ink")}
    >
      {done ? (
        <Check size={14} strokeWidth={2} aria-hidden className="mt-0.5 shrink-0 text-success" />
      ) : (
        <ArrowRight size={14} strokeWidth={2} aria-hidden className="mt-0.5 shrink-0 text-accent-text" />
      )}
      <span className="min-w-0 flex-1">
        <b className="font-semibold">{done ? "Done here. " : "Next: "}</b>
        {text}
      </span>
      {go && go.tab !== tab && (
        <Button size="sm" variant="ghost" className="-my-1" onClick={() => onTab(go.tab)}>
          {go.label}
        </Button>
      )}
      {!done && (
        <Link to={`/books/${bookId}/claims`} className="basis-full text-small font-semibold text-select underline-offset-2 hover:underline">
          Fix the whole book in one go
        </Link>
      )}
    </div>
  );
}

function ChecksPanel({ section, words, issues, onFixIssue, guardrails, readOnly }: EditorInspectorProps) {
  const target = section.wordTarget;
  const over = target !== null ? words - target : 0;
  const inRange = target === null || Math.abs(over) <= target * 0.15;
  const emDashes = issues.filter((i) => i.kind === "em-dash");
  const spellings = issues.filter((i) => i.kind === "spelling");
  const banned = issues.filter((i) => i.kind === "banned");
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

function ClaimsPanel({
  bookId,
  section,
  claims,
  onClaim,
  sectionLabel,
  canUndo = true,
  softenEditable = false,
  readOnly,
  renderClaimTools,
  focusClaimId,
}: EditorInspectorProps) {
  // Open claims in this section first, then the rest of this section, then other sections.
  const rank = (c: MsClaim) => (c.sectionId === section.id ? 0 : 2) + (c.status === "open" ? 0 : 1);
  const sorted = [...claims].sort((a, b) => rank(a) - rank(b));
  if (claims.length === 0)
    return (
      <InspectorSection title="Claims to check">
        <p className="flex items-center gap-1.5 text-small text-success">
          <Check size={14} strokeWidth={2} aria-hidden />
          Nothing to check. No medical, legal or statistical claims found.
        </p>
      </InspectorSection>
    );
  return (
    <InspectorSection title="Claims to check">
      <p className="mb-3 text-small text-ink-secondary">
        Sentences underlined in red make a medical, legal or statistical claim. Click one in the text, or use the cards below: mark it checked if it is right,
        soften it, or remove it. The underline then goes away.
      </p>
      {softenEditable && (
        <Link to={`/books/${bookId}/claims`} className="mb-3 inline-flex text-small font-semibold text-select underline-offset-2 hover:underline">
          See every claim in this book
        </Link>
      )}
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
            tools={renderClaimTools}
            focused={focusClaimId === c.id}
          />
        ))}
      </ul>
    </InspectorSection>
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
  tools,
  focused,
}: {
  focused: boolean;
  readOnly: boolean;
  tools: EditorInspectorProps["renderClaimTools"];
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
  const ref = useRef<HTMLLIElement>(null);
  useEffect(() => {
    if (focused) ref.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [focused]);
  return (
    <li
      ref={ref}
      className={cn(
        "scroll-mt-4 rounded-md border p-3",
        open ? "border-transparent bg-claim-wash" : "border-border bg-canvas",
        focused && "outline-2 outline-offset-2 outline-claim",
      )}
    >
      <p className="flex flex-wrap items-center justify-between gap-2 text-caption">
        <span className={cn("inline-flex items-center gap-1 font-semibold", open ? "text-claim" : "text-ink-secondary")}>
          <Flag size={12} strokeWidth={2} aria-hidden />
          {claim.category}, {where}
          {claim.needsCheck === false && <span className="ml-1 font-normal text-ink-secondary">For the record</span>}
        </span>
        <span className={cn("font-semibold", open ? "text-claim" : claim.status === "removed" ? "text-ink-secondary" : "text-success")}>
          {statusText[claim.status]}
        </span>
      </p>
      <p className={cn("mt-2 font-book text-[15px] leading-5.75 text-ink", claim.status === "removed" && "line-through decoration-ink-tertiary")}>
        {claim.status === "softened" ? claim.softened || claim.sentence : claim.sentence}
      </p>
      {open && <p className="mt-1.5 text-small text-ink-secondary">{claim.check}</p>}
      {claim.note && <p className="mt-1.5 text-small text-ink-secondary">Checked: {claim.note}</p>}

      {open && mode === "idle" && (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {here && readOnly ? null : here ? (
            <>
              <Button size="sm" icon={Check} onClick={() => onClaim(claim, "verify", "marked as checked by you")}>
                It is right, mark checked
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setMode("verify")}>
                Add a source
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setMode("soften")}>
                Soften
              </Button>
              <Button size="sm" variant="ghost" onClick={() => onClaim(claim, "remove")}>
                Remove sentence
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
              <p className="rounded-sm bg-sheet px-2.5 py-2 font-book text-[15px] leading-5.75 text-ink">
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
              <p className="rounded-sm bg-sheet px-2.5 py-2 font-book text-[15px] leading-5.75 text-ink">
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
      {here && !readOnly && mode === "idle" && tools?.(claim)}
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
  const waiting = (p: SuggestionPass) => suggestions.filter((s) => s.pass === p && (suggestionState[s.id] ?? "pending") === "pending").length;
  return (
    <>
      <p className="mb-3 text-small text-ink-secondary">
        Optional. The AI reads this section and suggests changes. Nothing changes until you accept. Pick the kind of edit:
      </p>
      <div role="radiogroup" aria-label="Kind of AI edit" className="grid gap-1.5">
        {(["line", "structure", "voice"] as SuggestionPass[]).map((p) => {
          const n = waiting(p);
          return (
            <button
              key={p}
              type="button"
              role="radio"
              aria-checked={pass === p}
              onClick={() => onPass(p)}
              className={cn(
                "grid gap-0.5 rounded-md border px-3 py-2 text-left",
                pass === p ? "border-select bg-select-wash" : "border-border bg-sheet hover:bg-sunken",
              )}
            >
              <span className="flex items-center justify-between gap-2 text-label text-ink">
                {p === "line" ? "Line edit" : passLabels[p]}
                {n > 0 && <span className="num text-caption font-semibold text-select">{n} waiting</span>}
              </span>
              <span className="text-small text-ink-secondary">{passHelp[p]}</span>
            </button>
          );
        })}
      </div>

      {passRunning ? (
        <div role="status" aria-label={`Running ${passLabels[pass]}`} className="mt-4 grid gap-2">
          <p className="flex items-center gap-2 text-small text-ink-secondary">
            <Loader />
            The AI is reading this section. This takes about a minute. You can keep working; a message shows when it is done.
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
                  <p className="font-book text-[15px] leading-5.75 text-ink">
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
                  <span className="line-clamp-2 font-book text-[15px] leading-5.5 text-ink italic">{n.text.trim() || "Empty note"}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
