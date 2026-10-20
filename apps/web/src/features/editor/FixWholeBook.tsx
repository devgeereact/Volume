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
import { fixAllClaims, type FixReport } from "./fixAll";

/* The Claims page's "Fix the whole book": house style in every section (free, no AI), then every open claim,
   the cleanest way each allows (fixAll.ts). Every change is a new version, so it can be undone from Versions. */

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

  const open = claims.filter((c) => c.status === "open");
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
      : `House style fixed in ${r.sections} ${r.sections === 1 ? "section" : "sections"}: ${r.dashes} dashes and ${r.spellings} US spellings.`;
  }

  async function fixClaims(): Promise<FixReport | null> {
    let gone: ModelProblem | null = null;
    const report = await fixAllClaims(
      open,
      {
        soften: (id) => manuscriptApi.softenClaim(id, {}),
        remove: (id, note) => manuscriptApi.removeClaim(id, { note }),
        suggest: async (id) => {
          try {
            return await suggest(id);
          } catch (e) {
            if (e instanceof ModelGone) gone = e.problem;
            throw e;
          }
        },
        apply: (id, input) => manuscriptApi.applyClaim(bookId, id, input),
      },
      {
        cancelled: () => stop.current || gone !== null,
        onProgress: (done, total) => setRunning({ label: "Fixing claims", done, total }),
      },
    );
    if (gone) setModelFix(gone);
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
        One click fixes house style (em dashes, US spellings) in every section, then every open claim: softer wording where it is on file, otherwise the AI
        rewrites the sentence so it claims only what is safe, never adding a source you have not got. Each change is saved as a new version, so you can undo it
        in Versions.
      </p>
      {modelFix && <ModelFallbackBanner className="mt-3" problem={modelFix} onDismiss={() => setModelFix(null)} onRetry={() => void run("claims")} />}
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
              Only the {open.length} {open.length === 1 ? "claim" : "claims"}
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
