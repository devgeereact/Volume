import { Link } from "react-router";
import { Check, FileText, Flag, RotateCw, Wrench } from "lucide-react";
import { Button, ModelName } from "../../components/ui";
import { buttonClasses } from "../../components/ui/Button";
import type { WritingJob } from "../../demo";
import { cn } from "../../lib/cn";
import { formatUsd } from "../../lib/format";
import type { ChapterCheck } from "./writingData";
import { cardTitle } from "./studio";

interface WritingInspectorProps {
  job: WritingJob;
  wordsWritten: number;
  costSpent: number;
  lastChecks: { title: string; items: ChapterCheck[] } | null;
  attention: { sectionId: string; title: string; text: string }[];
  onRetry: (sectionId: string) => void;
  className?: string | undefined;
}

/** The side card (.insp): checks on the last chapter, the model, and what needs attention. Words, time and spend are in the tiles above. */
export function WritingInspector({ job, wordsWritten, costSpent, lastChecks, attention, onRetry, className }: WritingInspectorProps) {
  const remainingWords = Math.max(0, job.words.target - wordsWritten);
  const perWord = costSpent / Math.max(1, wordsWritten);
  const low = remainingWords * perWord * 0.9;
  const high = remainingWords * perWord * 1.2;

  return (
    <aside aria-label="Writing details" className={cn("vol-glass grid content-start gap-4 rounded-card p-[18px] max-[560px]:p-[15px]", className)}>
      {lastChecks && (
        <section aria-labelledby="writing-checks">
          <h3 id="writing-checks" className={cardTitle}>
            Checks on {lastChecks.title}
          </h3>
          <ul className="mt-3 grid gap-2">
            {lastChecks.items.map((c) => (
              <li key={c.id} className="flex items-start gap-2 text-[13px] leading-[18px] text-ink">
                <CheckIcon result={c.result} />
                <span>
                  {c.label}
                  {c.result === "fixed" && <span className="block text-[12px] text-ink-3">{c.detail}</span>}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="writing-model">
        <h3 id="writing-model" className={cardTitle}>
          Model
        </h3>
        <dl className="mt-2.5 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3.5 gap-y-2 text-[13px] leading-[18px]">
          <dt className="text-ink-3">Writer</dt>
          <dd className="text-right font-medium text-ink">
            <ModelName slug={job.model} />
          </dd>
          <dt className="text-ink-3">Fallback</dt>
          <dd className="text-right font-medium text-ink">
            <ModelName slug={job.fallback} />
          </dd>
        </dl>
        <p className="mt-2.5 text-[12px] leading-4 text-ink-3">
          Running jobs finish on this model. Change it in Settings for the next job. About {formatUsd(low)} to {formatUsd(high)} more to finish.
        </p>
      </section>

      {attention.length > 0 ? (
        <section aria-labelledby="needs-attention" className="rounded-lg bg-amber-wash px-3.5 py-3">
          <h3 id="needs-attention" className="flex items-center gap-1.5 text-[13px] leading-5 font-semibold text-amber">
            <Flag size={14} strokeWidth={2} aria-hidden />
            Needs attention, {attention.length}
          </h3>
          <ul className="mt-1.5 grid gap-3">
            {attention.map((a) => (
              <li key={a.sectionId} className="text-[13px] leading-[18px] text-ink-2">
                <p>{a.text}</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <Link to={`/books/${job.bookId}/editor/${a.sectionId}`} className={buttonClasses("secondary", "sm")}>
                    <FileText size={14} aria-hidden />
                    Open in editor
                  </Link>
                  <Button size="sm" icon={RotateCw} onClick={() => onRetry(a.sectionId)}>
                    Retry {a.title.toLowerCase()}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <p className="flex items-center gap-1.5 text-[13px] text-good">
          <Check size={14} strokeWidth={2} aria-hidden />
          Nothing needs your attention.
        </p>
      )}
    </aside>
  );
}

export function CheckIcon({ result }: { result: ChapterCheck["result"] }) {
  if (result === "attention")
    return (
      <span className="mt-px text-amber">
        <Flag size={14} strokeWidth={2} aria-hidden />
        <span className="sr-only">Needs attention:</span>
      </span>
    );
  if (result === "fixed")
    return (
      <span className="mt-px text-mint-ink">
        <Wrench size={14} strokeWidth={2} aria-hidden />
        <span className="sr-only">Fixed automatically:</span>
      </span>
    );
  return (
    <span className="mt-px text-mint-ink">
      <Check size={14} strokeWidth={2} aria-hidden />
      <span className="sr-only">Passed:</span>
    </span>
  );
}
