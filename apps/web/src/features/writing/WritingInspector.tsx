import { Link } from "react-router";
import { Check, Flag, RotateCw, Wrench } from "lucide-react";
import { Button, Figure, Inspector, InspectorSection, KeyValueList, ModelName } from "../../components/ui";
import type { WritingJob } from "../../demo";
import { formatDuration, formatNumber, formatUsd } from "../../lib/format";
import type { ChapterCheck } from "./writingData";

interface WritingInspectorProps {
  job: WritingJob;
  wordsWritten: number;
  costSpent: number;
  runningMinutes: number;
  minutesLeft: number | null;
  stateWord: "running" | "paused" | "stopped";
  lastChecks: { title: string; items: ChapterCheck[] } | null;
  attention: { sectionId: string; title: string; text: string }[];
  onRetry: (sectionId: string) => void;
}

/** Writing inspector: words, time, checks on the last chapter, cost so far, model, needs attention. */
export function WritingInspector({
  job,
  wordsWritten,
  costSpent,
  runningMinutes,
  minutesLeft,
  stateWord,
  lastChecks,
  attention,
  onRetry,
}: WritingInspectorProps) {
  const remainingWords = Math.max(0, job.words.target - wordsWritten);
  const perWord = costSpent / Math.max(1, wordsWritten);
  const low = remainingWords * perWord * 0.9;
  const high = remainingWords * perWord * 1.2;

  return (
    <Inspector label="Writing details" className="xl:h-full">
      <div className="relative">
        <InspectorSection title="Words so far">
          <Figure value={formatNumber(wordsWritten)} unit={`of ${formatNumber(job.words.target)}`} />
          <KeyValueList
            className="mt-2"
            items={[
              { label: "Time running", value: formatDuration(runningMinutes) },
              {
                label: "Time left",
                value: stateWord === "running" && minutesLeft !== null ? `About ${formatDuration(minutesLeft)}` : stateWord === "paused" ? "Paused" : "Stopped",
              },
            ]}
          />
        </InspectorSection>

        {lastChecks && (
          <InspectorSection title={`Checks on ${lastChecks.title}`}>
            <ul className="grid gap-2">
              {lastChecks.items.map((c) => (
                <li key={c.id} className="flex items-start gap-2 text-[14px] leading-5 text-ink">
                  <CheckIcon result={c.result} />
                  <span>
                    {c.label}
                    {c.result === "fixed" && <span className="block text-small text-ink-secondary">{c.detail}</span>}
                  </span>
                </li>
              ))}
            </ul>
          </InspectorSection>
        )}

        <InspectorSection title="Cost so far">
          <Figure value={formatUsd(costSpent)} unit="so far" />
          <p className="mt-2 text-small text-ink-secondary">{`About ${formatUsd(low)} to ${formatUsd(high)} more to finish.`}</p>
        </InspectorSection>

        <InspectorSection title="Model">
          <KeyValueList
            items={[
              { label: "Writer", value: <ModelName slug={job.model} /> },
              { label: "Fallback", value: <ModelName slug={job.fallback} /> },
            ]}
          />
          <p className="mt-2 text-small text-ink-secondary">Running jobs finish on this model. Change it in Settings for the next job.</p>
        </InspectorSection>

        {attention.length > 0 ? (
          <section aria-labelledby="needs-attention" className="mt-1 rounded-md bg-accent-wash px-3.5 py-3">
            <h3 id="needs-attention" className="flex items-center gap-1.5 text-label font-semibold text-accent-text">
              <Flag size={14} strokeWidth={2} aria-hidden />
              Needs attention, {attention.length}
            </h3>
            <ul className="mt-1.5 grid gap-3">
              {attention.map((a) => (
                <li key={a.sectionId} className="text-[14px] leading-5 text-ink">
                  {a.text}{" "}
                  <Link to={`/books/${job.bookId}/editor/${a.sectionId}`} className="font-medium text-select underline underline-offset-2">
                    Open in editor
                  </Link>
                  <Button size="sm" variant="ghost" icon={RotateCw} className="mt-1.5 -ml-2 flex" onClick={() => onRetry(a.sectionId)}>
                    Retry {a.title.toLowerCase()}
                  </Button>
                </li>
              ))}
            </ul>
          </section>
        ) : (
          <p className="mt-1 flex items-center gap-1.5 text-small text-success">
            <Check size={14} strokeWidth={2} aria-hidden />
            Nothing needs your attention.
          </p>
        )}
      </div>
    </Inspector>
  );
}

export function CheckIcon({ result }: { result: ChapterCheck["result"] }) {
  if (result === "attention")
    return (
      <span className="mt-0.5 text-accent-text">
        <Flag size={14} strokeWidth={2} aria-hidden />
        <span className="sr-only">Needs attention:</span>
      </span>
    );
  if (result === "fixed")
    return (
      <span className="mt-0.5 text-success">
        <Wrench size={14} strokeWidth={2} aria-hidden />
        <span className="sr-only">Fixed automatically:</span>
      </span>
    );
  return (
    <span className="mt-0.5 text-success">
      <Check size={14} strokeWidth={2} aria-hidden />
      <span className="sr-only">Passed:</span>
    </span>
  );
}
