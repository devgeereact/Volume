import { useState } from "react";
import { Button, ModelName, modelPrice } from "../../components/ui";
import { examplePricesNote, getModel, stageDefaults } from "../../data/models";
import { cn } from "../../lib/cn";
import { ModelStageDialog } from "../settings/ModelStageDialog";
import { useWorkspaceModels } from "../settings/modelDefaults";
import { SectionTitle, type TabProps } from "./IdentityTab";

/**
 * Models for this profile: one row per stage, with the profile's note on why. Each stage uses the
 * workspace default unless the profile overrides it here (a book can override again). Change opens the model picker with example prices.
 */
export function ModelsTab({ draft, update }: TabProps) {
  const workspaceModels = useWorkspaceModels();
  const [editing, setEditing] = useState<string | null>(null);
  const editingStage = stageDefaults.find((s) => s.stage === editing);
  const name = draft.name.trim() || "this profile";

  return (
    <div className="grid gap-5">
      <SectionTitle
        id="m-title"
        title="Models for this profile"
        body="Each stage uses the workspace default from Settings unless you choose another model here. A book can still choose its own."
      />
      {draft.modelNotes && (
        <p className="max-w-[66ch] rounded-md border border-border bg-sheet px-4 py-3 text-small text-ink-secondary">
          <b className="font-semibold text-ink">Why these models. </b>
          {draft.modelNotes.replace(/config\/models\.defaults\.json/g, "the workspace defaults")}
        </p>
      )}
      <div className="overflow-hidden rounded-md border border-border bg-sheet">
        <div
          aria-hidden
          className="hidden grid-cols-[150px_minmax(0,1fr)_180px_200px] gap-4 bg-canvas px-4 py-3 text-[12.5px] leading-none font-semibold text-ink-secondary md:grid"
        >
          <span>Stage</span>
          <span>Model</span>
          <span className="text-right">Example price</span>
          <span />
        </div>
        <ul aria-labelledby="m-title">
          {stageDefaults.map((s) => {
            const override = draft.models[s.stage];
            const slug = override ?? workspaceModels[s.stage]?.model ?? s.defaultModel;
            const model = getModel(slug);
            return (
              <li
                key={s.stage}
                className={cn(
                  "grid gap-x-4 gap-y-1.5 border-t border-border px-4 py-3 first:border-t-0 md:grid-cols-[150px_minmax(0,1fr)_180px_200px] md:items-center md:first:border-t",
                )}
              >
                <span className="text-label text-ink">{s.label}</span>
                <span className="min-w-0">
                  <ModelName slug={slug} className="text-[14px] leading-[19px] font-semibold text-ink" />
                  <span className={cn("block text-[12.5px]", override ? "font-semibold text-ink" : "text-ink-secondary")}>
                    {override ? `Chosen for ${name}` : "Workspace default"}
                  </span>
                </span>
                <span className="num text-[13px] text-ink-secondary md:text-right md:text-ink">{model ? modelPrice(model) : "No price"}</span>
                <span className="flex flex-wrap gap-1 md:justify-end">
                  <Button size="sm" onClick={() => setEditing(s.stage)}>
                    Change<span className="sr-only"> {s.label.toLowerCase()} model</span>
                  </Button>
                  {override && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        update((d) => {
                          const next = { ...d.models };
                          delete next[s.stage];
                          return { ...d, models: next };
                        })
                      }
                    >
                      Use default
                    </Button>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
      <p className="text-small text-ink-tertiary">{examplePricesNote} Prices are per million tokens, in and out.</p>
      {editingStage && (
        <ModelStageDialog
          open={Boolean(editing)}
          onClose={() => setEditing(null)}
          stage={editingStage.stage}
          stageLabel={editingStage.label}
          scope={name}
          value={draft.models[editingStage.stage] ?? workspaceModels[editingStage.stage]?.model ?? editingStage.defaultModel}
          onSave={(model) =>
            update((d) => {
              const ws = workspaceModels[editingStage.stage]?.model ?? editingStage.defaultModel;
              const next = { ...d.models };
              if (model === ws) delete next[editingStage.stage];
              else next[editingStage.stage] = model;
              return { ...d, models: next };
            })
          }
        />
      )}
    </div>
  );
}
