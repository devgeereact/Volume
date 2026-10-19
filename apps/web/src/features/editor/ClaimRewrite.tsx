import { useId, useState } from "react";
import { Check, PenLine, RotateCw, Sparkles } from "lucide-react";
import { Banner, Button, Loader, Textarea } from "../../components/ui";
import { isApiError } from "../../api/client";
import { useApplyClaim, useSuggestClaim } from "../../api/hooks";
import { runningJob } from "../../api/jobErrors";
import type { ClaimOption, CostRange } from "../../api/types";
import { errorText, jobStatusText, useJobWatch } from "../../api/wire-c";
import { cn } from "../../lib/cn";
import { DiffText } from "./DiffText";
import { applyInput, approachLabel, estimateLabel, inContext, readBaseVersion, readOptions, type ClaimChoice, type SuggestSource } from "./claimOptions";
import type { MsClaim } from "./manuscript";

/* API mode, one open claim in this section: ask the editor for three stronger replacements (each with
   its approach, why, and whether it still needs a source), use one, edit one first, or write your own.
   Applying saves a new version and resolves the claim on the server; the new text shows in its
   paragraph. A 409 means the sentence changed since the claim was found. */

type Step =
  | { at: "closed" }
  | { at: "ask" }
  | { at: "running"; jobId: string; estimate: CostRange | null }
  | { at: "options"; options: ClaimOption[]; from: SuggestSource }
  | { at: "edit"; option: ClaimOption; options: ClaimOption[]; from: SuggestSource }
  | { at: "own" }
  | { at: "applied"; before: string; after: string };

export interface ClaimRewriteProps {
  bookId: string;
  claim: MsClaim;
  /** What one suggestion costs, read before the owner asks (null while unknown). */
  estimate: CostRange | null;
  estimateLoading: boolean;
  /** Why the cost could not be worked out (null when it was). Asking stays off until a cost shows. */
  estimateError: string | null;
  onRetryEstimate: () => void;
  /** Saves any typing first, so the apply builds on the text the owner sees. False stops the apply. */
  beforeApply: () => Promise<boolean>;
  /** Reload the section and the claim list after a 409. */
  onReload: () => void;
  onAnnounce: (text: string) => void;
}

export function ClaimRewrite({
  bookId,
  claim,
  estimate,
  estimateLoading,
  estimateError,
  onRetryEstimate,
  beforeApply,
  onReload,
  onAnnounce,
}: ClaimRewriteProps) {
  const [step, setStep] = useState<Step>({ at: "closed" });
  const [instruction, setInstruction] = useState("");
  const [draft, setDraft] = useState("");
  const [problem, setProblem] = useState<{ text: string; conflict: boolean } | null>(null);
  const suggest = useSuggestClaim();
  const apply = useApplyClaim();
  const headingId = useId();
  const jobId = step.at === "running" ? step.jobId : null;
  const watch = useJobWatch(bookId, jobId, (w) => {
    const options = w.ok ? readOptions(w.result) : [];
    if (options.length > 0 && jobId) {
      setStep({ at: "options", options, from: { jobId, baseVersionId: readBaseVersion(w.result) } });
      onAnnounce(`${options.length} ${options.length === 1 ? "option" : "options"} ready.`);
    } else {
      setStep({ at: "ask" });
      setProblem({
        conflict: false,
        text: w.ok ? "The editor gave no usable options. Try again, or write your own." : `No options came back. ${w.error ?? "Try again."}`,
      });
    }
  });

  async function ask() {
    setProblem(null);
    try {
      const r = await suggest.mutateAsync({ bookId, claimId: claim.id, ...(instruction.trim() ? { instruction: instruction.trim() } : {}) });
      setStep({ at: "running", jobId: r.jobId, estimate: r.estimate ?? null });
    } catch (e) {
      // Options for this claim are still being made: follow that job instead of paying twice.
      const running = isApiError(e) && e.isConflict ? runningJob(e.details) : null;
      if (running) {
        setStep({ at: "running", jobId: running, estimate: null });
        onAnnounce("Options for this claim are already being made. Showing them when they are ready.");
      } else setProblem({ conflict: false, text: errorText(e) });
    }
  }

  async function choose(choice: ClaimChoice, from?: SuggestSource) {
    const built = applyInput(choice, claim.sentence, from);
    if ("error" in built) {
      setProblem({ conflict: false, text: built.error });
      return;
    }
    setProblem(null);
    if (!(await beforeApply())) return;
    try {
      const r = await apply.mutateAsync({ bookId, claimId: claim.id, input: built.input });
      const ctx = r.version ? inContext(r.version.bodyMd, claim.sentence, built.input.text) : null;
      setStep({ at: "applied", before: ctx?.before ?? claim.sentence, after: ctx?.after ?? built.input.text });
      onAnnounce(built.input.text ? "Replacement saved as a new version." : "Sentence removed and saved as a new version.");
    } catch (e) {
      const conflict = isApiError(e) && e.isConflict;
      setProblem({
        conflict,
        text: conflict
          ? "The section changed since these options were made, so nothing was saved. Reload to see the latest text, then ask again."
          : `Not saved. ${errorText(e)}`,
      });
    }
  }

  const applying = apply.isPending;
  const cost = estimate ? estimateLabel(estimate) : null;

  if (step.at === "closed" && claim.status !== "open") return null;
  if (step.at === "closed")
    return (
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        <Button size="sm" icon={Sparkles} onClick={() => setStep({ at: "ask" })}>
          Suggest a stronger replacement
        </Button>
        <Button
          size="sm"
          variant="ghost"
          icon={PenLine}
          onClick={() => {
            setDraft("");
            setStep({ at: "own" });
          }}
        >
          Rewrite it myself
        </Button>
      </div>
    );

  return (
    <section aria-labelledby={headingId} className="mt-2.5 grid gap-2 rounded-sm border border-border bg-sheet p-2.5">
      <h4 id={headingId} className="text-small font-semibold text-ink">
        {step.at === "own" ? "Your own sentence" : step.at === "applied" ? "Saved in the text" : "Stronger replacement"}
      </h4>

      {problem && (
        <Banner
          tone={problem.conflict ? "attention" : "error"}
          title={problem.conflict ? "The text changed" : "That did not work"}
          action={
            problem.conflict ? (
              <Button size="sm" icon={RotateCw} onClick={onReload}>
                Reload
              </Button>
            ) : undefined
          }
        >
          {problem.text}
        </Banner>
      )}

      {step.at === "ask" && (
        <>
          {estimateError && !estimateLoading ? (
            <Banner
              tone="error"
              title="Could not work out the cost"
              action={
                <Button size="sm" icon={RotateCw} onClick={onRetryEstimate}>
                  Try again
                </Button>
              }
            >
              {`${estimateError} Nothing is spent until the cost shows.`}
            </Banner>
          ) : (
            <p className="text-small text-ink-secondary" role="status">
              {estimateLoading || !cost ? "Working out the cost" : `Three options, ${cost}.`}
            </p>
          )}
          <Textarea
            label="What to aim for (optional)"
            hint="For example: keep it personal, or name the kind of source."
            rows={2}
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
          />
          <div className="flex flex-wrap gap-1.5">
            <Button
              size="sm"
              variant="primary"
              icon={Sparkles}
              loading={suggest.isPending}
              loadingLabel="Asking"
              disabledReason={cost ? undefined : "The cost shows first."}
              onClick={() => void ask()}
            >
              {cost ? `Suggest options (${cost})` : "Suggest options"}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setStep({ at: "closed" })}>
              Cancel
            </Button>
          </div>
        </>
      )}

      {step.at === "running" && (
        <p className="flex items-center gap-2 text-small text-ink-secondary" role="status">
          <Loader />
          {watch.message ?? jobStatusText(watch.status)}
          {step.estimate ? `, ${estimateLabel(step.estimate)}` : ""}
        </p>
      )}

      {(step.at === "options" || step.at === "edit") && (
        <ul className="grid gap-2" aria-label="Replacement options">
          {step.options.map((o, i) => {
            const editing = step.at === "edit" && step.option === o;
            return (
              <li key={i} className={cn("rounded-sm border p-2.5", editing ? "border-select" : "border-border")}>
                <p className="flex flex-wrap items-center gap-1.5 text-caption">
                  <span className="font-semibold text-ink">{approachLabel(o.approach)}</span>
                  {o.needsSource && <span className="rounded-pill bg-claim-wash px-2 py-0.5 font-semibold text-claim">Needs a source</span>}
                </p>
                <p className="mt-1.5 font-book text-[15px] leading-[23px] text-ink">
                  {o.approach === "remove" ? (
                    <del className="text-ink-secondary decoration-select decoration-2">
                      <span className="sr-only">removed: </span>
                      {claim.sentence}
                    </del>
                  ) : (
                    <DiffText before={claim.sentence} after={o.text} />
                  )}
                </p>
                {o.rationale && <p className="mt-1 text-small text-ink-secondary">{o.rationale}</p>}
                {editing ? (
                  <div className="mt-2 grid gap-2">
                    <Textarea label="Edit before applying" rows={3} value={draft} onChange={(e) => setDraft(e.target.value)} />
                    <div className="flex flex-wrap gap-1.5">
                      <Button
                        size="sm"
                        icon={Check}
                        loading={applying}
                        loadingLabel="Saving"
                        onClick={() => void choose({ kind: "edited", option: o, text: draft }, step.from)}
                      >
                        Apply my edit
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setStep({ at: "options", options: step.options, from: step.from })}>
                        Back to the options
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <Button
                      size="sm"
                      icon={Check}
                      loading={applying}
                      loadingLabel="Saving"
                      onClick={() => void choose({ kind: "option", option: o }, step.from)}
                    >
                      Use this option
                    </Button>
                    {o.approach !== "remove" && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setDraft(o.text);
                          setStep({ at: "edit", option: o, options: step.options, from: step.from });
                        }}
                      >
                        Edit before applying
                      </Button>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {step.at === "options" && (
        <Button size="sm" variant="ghost" className="justify-self-start" onClick={() => setStep({ at: "closed" })}>
          Close
        </Button>
      )}

      {step.at === "own" && (
        <>
          <p className="text-small text-ink-secondary">Now: {claim.sentence}</p>
          <Textarea label="New sentence" hint="Claim only what you can stand behind." rows={3} value={draft} onChange={(e) => setDraft(e.target.value)} />
          <div className="flex flex-wrap gap-1.5">
            <Button size="sm" icon={Check} loading={applying} loadingLabel="Saving" onClick={() => void choose({ kind: "own", text: draft })}>
              Apply my sentence
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setStep({ at: "closed" })}>
              Cancel
            </Button>
          </div>
        </>
      )}

      {step.at === "applied" && (
        <p className="font-book text-[15px] leading-[23px] text-ink">
          <DiffText before={step.before} after={step.after} />
        </p>
      )}
    </section>
  );
}
