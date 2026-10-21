import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Sparkles, Wand2 } from "lucide-react";
import { Button, Loader, ProgressBar } from "../../components/ui";
import { jobsApi } from "../../api/jobs";
import { manuscriptApi } from "../../api/manuscript";
import { queryKeys } from "../../api/hooks";
import { isTerminalJob, type ClaimOverviewItem } from "../../api/types";
import { errorText } from "../../api/wire-c";
import { useToast } from "../../lib/toast";
import { ModelFallbackBanner, modelProblemOf, type ModelProblem } from "../settings/ModelFallback";
import { estimateLabel } from "./claimOptions";
import { claimsToCheck } from "./claimTier";
import { fixAllClaims, type FixReport } from "./fixAll";

/* The Claims page's "Fix the whole book": house style in every section (free, no AI), then every open claim
   that needs the owner's check, the cleanest way each allows (fixAll.ts). Claims listed for the record are left as
   written, so the author's prose is not rewritten for low-risk statements. Every change is a new version, so it can be undone from Versions. */

class BudgetStop extends Error {}

class ModelGone extends Error {
  constructor(readonly problem: ModelProblem) {
    super("The claim-fix model is not available.");
  }
}

export function FixWholeBook({
  bookId,
  claims,
  estimate,
  onDone,
}: {
  bookId: string;
  /** The open claims, as the overview lists them. */
  claims: ClaimOverviewItem[];
  /** What one AI suggestion costs (null while unknown). */
  estimate: { lowUsd: number; highUsd: number } | null;
  onDone: () => void;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const [running, setRunning] = useState<null | { label: string; done: number; total: number }>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [modelFix, setModelFix] = useState<ModelProblem | null>(null);
  const stop = useRef(false);

  const open = claimsToCheck(claims);
  const forRecord = claims.filter((c) => c.status === "open").length - open.length;
  const needAi = open.filter((c) => c.inCurrentText && !c.suggestedSoftening).length;
  const cost = needAi > 0 && estimate ? estimateLabel({ lowUsd: estimate.lowUsd * needAi, highUsd: estimate.highUsd * needAi }) : undefined;

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: queryKeys.book.claimsAll(bookId) });
    void qc.invalidateQueries({ queryKey: ["section"] });
    void qc.invalidateQueries({ queryKey: queryKeys.book.preflight(bookId) });
    onDone();
  };

  async function suggest(claimId: string): Promise<{ jobId: string; result: unknown }> {
    const r = await manuscriptApi.suggestClaim(bookId, claimId, {});
    for (let i = 0; i < 360; i++) {
      const j = await jobsApi.get(r.jobId);
      if (j.status === "paused_budget") {
        // Cancel it (nothing was charged for it) and stop: the budget is the owner's call.
        await jobsApi.cancel(r.jobId).catch(() => undefined);
        throw new BudgetStop(j.error ?? "This book has reached its budget.");
      }
      if (isTerminalJob(j.status)) {
        if (j.status === "succeeded") return { jobId: r.jobId, result: j.result };
        const mp = modelProblemOf({ errorCode: j.errorCode, result: j.result });
        if (mp) throw new ModelGone(mp);
        throw new Error(j.error ?? "The fix was not made.");
      }
      await new Promise((res) => window.setTimeout(res, 1000));
    }
    throw new Error("The fix took too long.");
  }

  async function fixStyle(): Promise<string> {
    const r = await manuscriptApi.fixHouseStyle(bookId);
    return r.sections === 0
      ? "House style was already clean."
      : `House style fixed in ${r.sections} ${r.sections === 1 ? "section" : "sections"}: ${r.dashes} dashes, ${r.spellings} US spellings` +
          (r.emptyItems ? ` and ${r.emptyItems} empty list ${r.emptyItems === 1 ? "item" : "items"} removed.` : ".");
  }

  /** Sections with text but no summary or no checks (the pack blocks on them): queue the missing steps, in the background. */
  async function rerunMissing(): Promise<string> {
    const tree = await manuscriptApi.tree(bookId);
    const sections = [...tree.front, ...tree.body.flatMap((n) => [n, ...n.children]), ...tree.back].filter((x) => x.enabled);
    let queued = 0;
    for (const [i, sec] of sections.entries()) {
      setRunning({ label: "Looking for missing summaries and checks", done: i, total: sections.length });
      const plan = await manuscriptApi.recheckPreview(sec.id);
      if (!plan.hasText || plan.steps.length === 0 || plan.runningJobId) continue;
      await manuscriptApi.rerunChecks(sec.id);
      queued++;
    }
    return queued === 0
      ? "Every section has its summary and checks."
      : `Missing summaries and checks queued for ${queued} ${queued === 1 ? "section" : "sections"}; they run in the background (see the job bar).`;
  }

  async function fixClaims(): Promise<FixReport | null> {
    // Set from inside the callbacks, so an object (a plain let would be narrowed to null).
    const halt: { gone: ModelProblem | null; budget: string | null } = { gone: null, budget: null };
    const report = await fixAllClaims(
      open,
      {
        soften: (id) => manuscriptApi.softenClaim(id, {}),
        remove: (id, note) => manuscriptApi.removeClaim(id, { note }),
        suggest: async (id) => {
          try {
            return await suggest(id);
          } catch (e) {
            if (e instanceof ModelGone) halt.gone = e.problem;
            if (e instanceof BudgetStop) halt.budget = e.message;
            throw e;
          }
        },
        apply: (id, input) => manuscriptApi.applyClaim(bookId, id, input),
      },
      {
        cancelled: () => stop.current || halt.gone !== null || halt.budget !== null,
        onProgress: (done, total) => setRunning({ label: "Fixing claims", done, total }),
      },
    );
    if (halt.gone) setModelFix(halt.gone);
    if (halt.budget) throw new Error(`${halt.budget} Raise this book's budget, then press Fix again.`);
    return report;
  }

  async function run(what: "all" | "style" | "claims") {
    stop.current = false;
    setSummary(null);
    setModelFix(null);
    const lines: string[] = [];
    try {
      if (what !== "claims") {
        setRunning({ label: "Fixing house style", done: 0, total: 1 });
        lines.push(await fixStyle());
      }
      // Summaries and checks use the AI, so only "Fix everything" runs them; "Only house style" stays free.
      if (what === "all") lines.push(await rerunMissing());
      if (what !== "style" && open.length > 0) {
        toast.show({ tone: "working", title: "Fixing every claim", body: "One at a time. You can stop at any point; what is done stays done." });
        const r = await fixClaims();
        if (r) {
          const o = r.outcomes;
          lines.push(
            `Claims: ${o.softened + o.fixed} rewritten more carefully, ${o.gone} closed because the sentence was gone` +
              (o.skipped ? `, ${o.skipped} left for you (no safe wording without a new source)` : "") +
              (o.failed ? `, ${o.failed} not fixed (${r.errors.join("; ")})` : "") +
              ".",
          );
        }
      }
      setSummary(lines.join(" "));
      toast.show({ tone: "success", title: "Book fixed", body: lines.join(" ") });
    } catch (e) {
      setSummary(`${lines.join(" ")} Stopped: ${errorText(e)}`.trim());
      toast.show({ tone: "error", title: "The fix stopped", body: errorText(e) });
    } finally {
      setRunning(null);
      refresh();
    }
  }

  return (
    <section aria-labelledby="fix-book-title" className="mt-5 max-w-[860px] rounded-md border border-border bg-sheet p-4 sm:p-5">
      <h2 id="fix-book-title" className="font-book text-heading text-ink">
        Fix the whole book
      </h2>
      <p className="mt-1 text-small text-ink-secondary">
        One click tidies the whole book. It fixes dashes, US spellings and empty list items, fills in any missing summaries and checks, then rewrites each claim
        that needs your check so it says only what is safe. It never adds a source you do not have. Every change is a new version, so you can undo it in
        Versions.
        {forRecord > 0 &&
          ` The ${forRecord} ${forRecord === 1 ? "claim" : "claims"} listed for the record ${forRecord === 1 ? "stays" : "stay"} as written; ${forRecord === 1 ? "it is" : "they are"} still in the claims report.`}
      </p>
      {modelFix && (
        <ModelFallbackBanner bookId={bookId} className="mt-3" problem={modelFix} onDismiss={() => setModelFix(null)} onRetry={() => void run("claims")} />
      )}
      {running ? (
        <div role="status" className="mt-4 grid gap-2">
          <ProgressBar value={running.done} max={Math.max(1, running.total)} live label={running.label} valueText={`${running.done} of ${running.total}`} />
          <p className="flex flex-wrap items-center gap-2 text-small text-ink-secondary">
            <Loader />
            {running.label}, {running.done} of {running.total}.
            <Button size="sm" variant="ghost" onClick={() => (stop.current = true)}>
              Stop
            </Button>
          </p>
        </div>
      ) : (
        <div className="mt-4 flex flex-wrap gap-2">
          <Button icon={Wand2} estimate={cost} onClick={() => void run("all")}>
            Fix everything
          </Button>
          <Button variant="ghost" onClick={() => void run("style")}>
            Only house style (free)
          </Button>
          {open.length > 0 && (
            <Button variant="ghost" icon={Sparkles} estimate={cost} onClick={() => void run("claims")}>
              Only the {open.length} {open.length === 1 ? "claim" : "claims"} to check
            </Button>
          )}
        </div>
      )}
      {summary && (
        <p role="status" className="mt-3 text-small text-ink">
          {summary}
        </p>
      )}
    </section>
  );
}
