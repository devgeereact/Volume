import { Check, Flag, History, RefreshCw, Sparkles } from "lucide-react";
import { Button, Figure, Input, Inspector, InspectorSection, KeyValueList, ModelName, ProgressBar } from "../../components/ui";
import { getModel, type Blueprint, type ClaimToVerify } from "../../demo";
import { cn } from "../../lib/cn";
import { formatNumber, formatPerMillion, formatRelative, formatUsd } from "../../lib/format";
import type { OutlinePart } from "./blueprintExtras";

const claimLabels: Record<string, string> = {
  "claim-1": "Chapter 4: incidents and unmet needs",
  "claim-2": "Chapter 8: the Mental Capacity Act and restraint",
  "claim-3": "Chapter 8: rapid tranquilisation and monitoring",
};

export interface Totals {
  total: number;
  chapters: number;
  chapterMin: number;
  chapterMax: number;
  front: number;
  back: number;
}

interface BlueprintInspectorProps {
  version: number;
  versions: Blueprint["versions"];
  totals: Totals;
  range: { min: number; max: number };
  toneNotes: string[];
  modelSlug: string;
  onChangeModel: () => void;
  costRows: { label: string; usd: number }[];
  spent: number;
  budget: number;
  regenerating: { label: string; cost: number } | null;
  claims: ClaimToVerify[];
  onClaim: (claim: ClaimToVerify) => void;
  selected: { id: string; label: string; part: OutlinePart | null };
  onWordTarget: (id: string, value: number) => void;
  missing: { text: string; partId: string | null }[];
  onFix: (partId: string) => void;
  onRestore: (version: number) => void;
  regenerateEstimate: string;
  onRegenerate: () => void;
  busy: boolean;
}

/** Blueprint inspector: version, word targets, the selected part, tone, model, cost, claims, versions, checks.
    Approve blueprint is the step footer's button (D-016); the inspector footer keeps Regenerate part. */
export function BlueprintInspector(props: BlueprintInspectorProps) {
  const {
    version,
    versions,
    totals,
    range,
    toneNotes,
    modelSlug,
    onChangeModel,
    costRows,
    spent,
    budget,
    regenerating,
    claims,
    onClaim,
    selected,
    onWordTarget,
    missing,
    onFix,
    onRestore,
    regenerateEstimate,
    onRegenerate,
    busy,
  } = props;
  const model = getModel(modelSlug);
  const price =
    model && "inputPerMillion" in model.examplePrice ? formatPerMillion(model.examplePrice.inputPerMillion, model.examplePrice.outputPerMillion) : null;
  const inRange = totals.total >= range.min && totals.total <= range.max;
  const current = versions.find((v) => v.version === version);
  const openClaims = claims.filter((c) => c.status === "open");

  return (
    <Inspector
      label="Blueprint details"
      className="lg:h-screen-fill"
      footer={
        <>
          <p className="text-small text-ink-secondary">
            Selected part: <b className="font-semibold text-select">{selected.label}</b>
          </p>
          <Button
            icon={RefreshCw}
            fullWidth
            estimate={regenerateEstimate}
            loading={regenerating !== null}
            loadingLabel="Rewriting"
            disabledReason={busy && regenerating === null ? "Wait for the blueprint to finish." : undefined}
            onClick={onRegenerate}
          >
            Regenerate part
          </Button>
        </>
      }
    >
      <div className="mb-4 flex items-baseline justify-between gap-3 border-b border-border pb-4">
        <h2 className="font-book text-[20px] leading-[26px] font-medium whitespace-nowrap text-ink">Blueprint version {version}</h2>
        {current && <span className="num text-small whitespace-nowrap text-ink-secondary">{formatRelative(current.at)}</span>}
      </div>

      <InspectorSection title="Word targets">
        <Figure value={formatNumber(totals.total)} unit="words" />
        <KeyValueList
          className="mt-2"
          items={[
            { label: `${totals.chapters} chapters`, value: `${formatNumber(totals.chapterMin)} to ${formatNumber(totals.chapterMax)} each` },
            { label: "Front matter", value: formatNumber(totals.front) },
            { label: "Back matter", value: formatNumber(totals.back) },
          ]}
        />
        <p className={cn("mt-2 flex items-center gap-1.5 text-small", inRange ? "text-success" : "text-claim")}>
          {inRange ? <Check size={14} strokeWidth={2} aria-hidden /> : <Flag size={14} strokeWidth={2} aria-hidden />}
          Template range {formatNumber(range.min)} to {formatNumber(range.max)}
        </p>
      </InspectorSection>

      <InspectorSection
        title="Model"
        aside={
          <Button size="sm" variant="ghost" onClick={onChangeModel}>
            Change
          </Button>
        }
      >
        <div className="grid gap-1 rounded-md border border-border bg-canvas p-3">
          <p className="flex items-center gap-2 text-small text-ink-secondary">
            <span aria-hidden className="grid size-6 shrink-0 place-items-center rounded-xs bg-spine text-caption font-semibold text-ink-on-spine">
              {model?.mark ?? "?"}
            </span>
            {model?.provider ?? "Model"}, this book, via OpenRouter
          </p>
          <div className="min-w-0">
            <p className="text-label text-ink">
              <ModelName slug={modelSlug} />
            </p>
            {price && <p className="text-small text-ink-secondary">{price} per million tokens (example)</p>}
          </div>
        </div>
      </InspectorSection>

      <InspectorSection title="Cost so far">
        <Figure value={formatUsd(spent)} unit={`of ${formatUsd(budget)} budget`} />
        <ProgressBar
          className="mt-2"
          size="thin"
          value={spent}
          max={budget}
          label="Book budget used"
          valueText={`${Math.round((spent / budget) * 100)}% of the budget`}
        />
        <KeyValueList
          className="mt-3"
          items={[
            ...costRows.map((r) => ({ label: r.label, value: formatUsd(r.usd) })),
            ...(regenerating
              ? [{ label: `Rewriting ${regenerating.label.toLowerCase()}`, value: <span className="text-accent-text">{formatUsd(regenerating.cost)}</span> }]
              : []),
          ]}
        />
      </InspectorSection>

      <InspectorSection title={`Claims to verify, ${openClaims.length}`} icon={Flag} tone="claim">
        {openClaims.length === 0 ? (
          <p className="text-small text-ink-secondary">No open claims in the plan.</p>
        ) : (
          <ul className="grid gap-1">
            {openClaims.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => onClaim(c)}
                  className="w-full rounded-sm py-1 text-left text-[13.5px] leading-[18px] text-ink hover:text-select"
                >
                  {claimLabels[c.id] ?? c.location}
                  <span className="block text-small text-ink-secondary">{c.reason}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-small text-ink-tertiary">Claims stay open into writing. You resolve them in the Editor.</p>
      </InspectorSection>

      {selected.part && selected.part.wordTarget !== null && (
        <InspectorSection title={`${selected.label} target`}>
          <Input
            key={selected.id}
            label="Words"
            inputMode="numeric"
            defaultValue={String(selected.part.wordTarget)}
            onBlur={(e) => {
              const n = Number(e.target.value.replace(/[^\d]/g, ""));
              if (n > 0) onWordTarget(selected.id, n);
            }}
            hint={selected.part.group === "chapters" ? "Chapters run 2,000 to 4,000 words. Each is written within 15% of its target." : undefined}
          />
        </InspectorSection>
      )}

      <InspectorSection title="Tone notes">
        <ul className="grid gap-1.5">
          {toneNotes.map((t) => (
            <li key={t} className="font-book text-[14px] leading-5 text-ink italic">
              {t}
            </li>
          ))}
        </ul>
      </InspectorSection>

      <InspectorSection title="Versions" icon={History}>
        <ol className="grid gap-2">
          {[...versions].reverse().map((v) => (
            <li key={v.version} className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[13.5px] leading-[18px] text-ink">
                  <span className="num font-semibold">Version {v.version}</span>
                  {v.version === version && <span className="ml-1.5 text-small text-select">current</span>}
                </p>
                <p className="text-small text-ink-secondary">
                  {formatRelative(v.at)}, {formatUsd(v.cost)}. {v.note}
                </p>
              </div>
              {v.version !== version && (
                <Button size="sm" variant="ghost" onClick={() => onRestore(v.version)}>
                  Restore
                </Button>
              )}
            </li>
          ))}
        </ol>
      </InspectorSection>

      <InspectorSection
        title={missing.length === 0 ? "Ready to approve" : "Before you approve"}
        icon={missing.length === 0 ? Sparkles : Flag}
        tone={missing.length === 0 ? "default" : "attention"}
      >
        {missing.length === 0 ? (
          <p className="text-small text-ink-secondary">
            Every required section is on, the word total is in range, and the listing has 3 categories and 7 keywords.
          </p>
        ) : (
          <ul className="grid gap-1.5">
            {missing.map((m) => (
              <li key={m.text} className="text-small text-accent-text">
                {m.partId ? (
                  <button type="button" onClick={() => onFix(m.partId as string)} className="text-left underline underline-offset-2">
                    {m.text}
                  </button>
                ) : (
                  m.text
                )}
              </li>
            ))}
          </ul>
        )}
      </InspectorSection>
    </Inspector>
  );
}
