import { useState } from "react";
import { RotateCcw, Save } from "lucide-react";
import { Banner, Button, ModelName, modelPrice, Skeleton } from "../../components/ui";
import { usePutModelSettings } from "../../api/hooks";
import type { ModelSettingsResponse } from "../../api/types";
import { apiErrorText, useApiModelSettings } from "../../api/wire-a";
import { examplePricesNote, getModel, stageDefaults } from "../../data/models";
import { formatDate, formatTime } from "../../lib/format";
import { DEMO_NOW } from "../../data/books";
import { formatModel } from "../../lib/format";
import type { DemoState } from "../library/demoState";
import { ModelStageDialog } from "./ModelStageDialog";
import { configDefaults, modelLabel, saveWorkspaceModels, useSyncWorkspaceModels, useWorkspaceModels, type StageChoice } from "./modelDefaults";
import { InlineStatus, PanelHeader, SaveAction } from "./PanelHeader";

/**
 * Settings, Models: the workspace model per stage (from config/models.defaults.json), its fallbacks in
 * order and example prices per million tokens. Change opens the picker; Reset to defaults puts back the
 * config file's choices. Save applies to the next job of each stage. With the server running the choices
 * come from GET /settings/models and Save sends PUT /settings/models (a stage back on its default is
 * sent as null, so the server drops the override).
 */
export function ModelsPanel({ state, api = false }: { state: DemoState; api?: boolean }) {
  const saved = useWorkspaceModels();
  if (api) return <ApiModelsPanel />;
  return (
    <ModelsEditor
      saved={saved}
      state={state}
      onSave={(draft, done) => {
        saveWorkspaceModels(draft);
        done(`Saved at ${formatTime(DEMO_NOW)}. The next job of each stage uses these models.`);
      }}
    />
  );
}

/** Server stages as the panel's choices. */
export function choicesFromServer(r: ModelSettingsResponse): Record<string, StageChoice> {
  return Object.fromEntries(r.stages.map((s) => [s.stage, { model: s.effectiveModel, fallbacks: [...s.fallbacks] }]));
}

function ApiModelsPanel() {
  const q = useApiModelSettings(true);
  const put = usePutModelSettings();
  // Keep the workspace defaults that the profile editor shows in step with the server.
  useSyncWorkspaceModels(true);
  if (q.isPending)
    return (
      <div role="status" aria-label="Loading models" className="grid gap-3 rounded-md border border-border bg-sheet p-5">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-3 w-4/5" />
        <Skeleton className="h-3 w-3/5" />
      </div>
    );
  if (q.isError)
    return (
      <Banner
        tone="error"
        title="Could not load the models"
        action={
          <Button size="sm" onClick={() => void q.refetch()}>
            Retry
          </Button>
        }
      >
        {apiErrorText(q.error)}
      </Banner>
    );
  return (
    <ModelsEditor
      saved={{ ...configDefaults(), ...choicesFromServer(q.data) }}
      state="ready"
      saving={put.isPending}
      saveError={put.isError ? apiErrorText(put.error) : null}
      onSave={(draft, done) => {
        const stages: Record<string, { model: string; fallbacks: string[] } | null> = {};
        for (const s of q.data.stages) {
          const c = draft[s.stage];
          if (!c) continue;
          const def = stageDefaults.find((d) => d.stage === s.stage);
          const isDefault = def && c.model === def.defaultModel && JSON.stringify(c.fallbacks) === JSON.stringify(def.fallbacks);
          stages[s.stage] = isDefault ? null : { model: c.model, fallbacks: c.fallbacks };
        }
        put.mutate({ stages }, { onSuccess: () => done(`Saved at ${formatTime(new Date().toISOString())}. The next job of each stage uses these models.`) });
      }}
    />
  );
}

interface ModelsEditorProps {
  saved: Record<string, StageChoice>;
  state: DemoState;
  onSave: (draft: Record<string, StageChoice>, done: (status: string) => void) => void;
  saving?: boolean;
  saveError?: string | null;
}

function ModelsEditor({ saved, state, onSave, saving = false, saveError = null }: ModelsEditorProps) {
  const [draft, setDraft] = useState<Record<string, StageChoice>>(saved);
  const [editing, setEditing] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  const isDefault = JSON.stringify(draft) === JSON.stringify(configDefaults());
  const editingStage = stageDefaults.find((s) => s.stage === editing);

  return (
    <div className="grid gap-6">
      <PanelHeader
        title="Models"
        body="The model each stage uses for every book, unless a profile or a book chooses another. Fallbacks run in order when a model is busy or missing."
        actions={
          <>
            {!isDefault && (
              <Button
                variant="ghost"
                icon={RotateCcw}
                onClick={() => {
                  setDraft(configDefaults());
                  setStatus("Defaults put back. Save to keep them.");
                }}
              >
                Reset to defaults
              </Button>
            )}
            {saving ? (
              <Button variant="primary" icon={Save} loading loadingLabel="Saving">
                Save models
              </Button>
            ) : (
              <SaveAction dirty={dirty} icon={Save} onSave={() => onSave(draft, setStatus)}>
                Save models
              </SaveAction>
            )}
          </>
        }
      />
      {state === "error" && (
        <Banner tone="attention" title="Could not load the latest model list">
          OpenRouter did not answer. This is the list saved on {formatDate("2026-10-03T09:00:00+01:00")}. Prices may have changed since.
        </Banner>
      )}
      {status && <InlineStatus tone={dirty ? "neutral" : "success"}>{status}</InlineStatus>}
      {saveError && (
        <Banner tone="error" title="Models not saved">
          {saveError} Your choices are still on this page.
        </Banner>
      )}

      <div className="overflow-hidden rounded-md border border-border bg-sheet">
        <div
          aria-hidden
          className="hidden grid-cols-[112px_minmax(0,1.2fr)_140px_minmax(0,1fr)_80px] gap-4 bg-canvas px-4 py-3 text-[12.5px] leading-none font-semibold text-ink-secondary lg:grid"
        >
          <span>Stage</span>
          <span>Model</span>
          <span className="text-right">Example price</span>
          <span>Fallbacks, in order</span>
          <span />
        </div>
        <ul aria-label="Model for each stage">
          {stageDefaults.map((s) => {
            const choice = draft[s.stage] ?? { model: s.defaultModel, fallbacks: s.fallbacks };
            const model = getModel(choice.model);
            const changed = choice.model !== s.defaultModel || JSON.stringify(choice.fallbacks) !== JSON.stringify(s.fallbacks);
            return (
              <li
                key={s.stage}
                className="grid gap-x-4 gap-y-1.5 border-t border-border px-4 py-3 first:border-t-0 lg:grid-cols-[112px_minmax(0,1.2fr)_140px_minmax(0,1fr)_80px] lg:items-center lg:first:border-t"
              >
                <span className="grid">
                  <span className="text-label text-ink">{s.label}</span>
                  {changed && <span className="text-[12.5px] text-ink-tertiary">Changed from default</span>}
                </span>
                <span className="min-w-0">
                  <ModelName slug={choice.model} className="text-[14px] leading-[19px] font-semibold text-ink" />
                  <span className="block text-[12.5px] text-ink-secondary">{modelLabel(choice.model)}</span>
                </span>
                <span className="num text-[13px] text-ink-secondary lg:text-right lg:text-ink">{model ? modelPrice(model) : "No price"}</span>
                <span className="min-w-0">
                  {choice.fallbacks.length === 0 ? (
                    <span className="text-[12.5px] text-ink-tertiary">None</span>
                  ) : (
                    <ol className="grid">
                      {choice.fallbacks.map((f, i) => (
                        <li key={f} title={`OpenRouter model: ${f}`} className="text-[13px] leading-[19px] text-ink-secondary">
                          <span className="num text-ink-tertiary">{i + 1}. </span>
                          {formatModel(f)}
                        </li>
                      ))}
                    </ol>
                  )}
                </span>
                <span className="lg:text-right">
                  <Button size="sm" onClick={() => setEditing(s.stage)}>
                    Change<span className="sr-only"> {s.label.toLowerCase()} model</span>
                  </Button>
                </span>
              </li>
            );
          })}
        </ul>
      </div>
      <p className="text-small text-ink-tertiary">{examplePricesNote} Image models show a price per image. Profiles and books can override any stage.</p>

      {editingStage && (
        <ModelStageDialog
          open={Boolean(editing)}
          onClose={() => setEditing(null)}
          stage={editingStage.stage}
          stageLabel={editingStage.label}
          scope="the workspace"
          value={draft[editingStage.stage]?.model ?? editingStage.defaultModel}
          fallbacks={draft[editingStage.stage]?.fallbacks ?? editingStage.fallbacks}
          onSave={(model, fallbacks) => {
            setDraft((d) => ({ ...d, [editingStage.stage]: { model, fallbacks } }));
            setStatus(null);
          }}
        />
      )}
    </div>
  );
}
