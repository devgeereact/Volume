import { useState } from "react";
import { ArrowDown, ArrowUp, X } from "lucide-react";
import { Button, IconButton, Modal, ModelPicker, Select } from "../../components/ui";
import { formatModel } from "../../lib/format";
import { modelsForStage } from "./modelDefaults";
import { useKeyChanged } from "../../lib/useKeyChanged";

interface ModelStageDialogProps {
  open: boolean;
  onClose: () => void;
  /** Stage key from config/models.defaults.json, for example "writing". */
  stage: string;
  stageLabel: string;
  /** Who the choice is for, for example "the workspace" or "Harni Muharami". */
  scope: string;
  value: string;
  /** Pass fallbacks to edit them too (workspace level). Leave out for a single choice. */
  fallbacks?: string[] | undefined;
  onSave: (model: string, fallbacks: string[]) => void;
}

/**
 * Choose the model for one stage: the model picker table with example prices, and optionally an
 * ordered fallback list (move up, move down, remove, add). Used by Settings, Models and Profile, Models.
 */
export function ModelStageDialog({ open, onClose, stage, stageLabel, scope, value, fallbacks, onSave }: ModelStageDialogProps) {
  const options = modelsForStage(stage);
  const [model, setModel] = useState(value);
  const [fb, setFb] = useState<string[]>(fallbacks ?? []);

  // Start from the saved choice each time the dialog opens (or the saved choice changes while open).
  if (useKeyChanged(open ? JSON.stringify([value, fallbacks ?? []]) : null) && open) {
    setModel(value);
    setFb(fallbacks ?? []);
  }

  const usedFallbacks = fb.filter((f) => f !== model);
  const addable = options.filter((m) => m.slug !== model && !usedFallbacks.includes(m.slug));

  function move(i: number, dir: -1 | 1) {
    const next = [...usedFallbacks];
    const j = i + dir;
    const a = next[i];
    const b = next[j];
    if (a === undefined || b === undefined) return;
    next[i] = b;
    next[j] = a;
    setFb(next);
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={`${stageLabel} model`}
      description={`For ${scope}. The next ${stageLabel.toLowerCase()} job uses it; a job that is running finishes on its current model.`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={() => {
              onSave(model, usedFallbacks);
              onClose();
            }}
          >
            Use this model
          </Button>
        </>
      }
    >
      <div className="grid max-h-[60dvh] gap-5 overflow-y-auto pr-1">
        <ModelPicker label={`${stageLabel} model`} models={options} value={model} onChange={setModel} />
        {fallbacks !== undefined && (
          <section aria-labelledby={`fb-${stage}`} className="grid gap-2.5">
            <div>
              <h3 id={`fb-${stage}`} className="text-[15px] leading-6 font-bold text-ink">
                Fallbacks, in order
              </h3>
              <p className="text-small text-ink-2">If the model is busy or missing, Volume tries these next and records which one answered.</p>
            </div>
            {usedFallbacks.length === 0 ? (
              <p className="text-small text-ink-3">No fallbacks. A failed call stops the job and says why.</p>
            ) : (
              <ol className="grid vol-glass overflow-hidden rounded-card">
                {usedFallbacks.map((slug, i) => (
                  <li key={slug} className="flex items-center gap-2 border-t border-line px-3 py-1.5 first:border-t-0">
                    <span className="num w-5 text-small text-ink-3">{i + 1}</span>
                    <span title={`OpenRouter model: ${slug}`} className="min-w-0 flex-1 text-[14px] text-ink">
                      {formatModel(slug)}
                    </span>
                    <IconButton icon={ArrowUp} size="sm" label={`Move ${formatModel(slug)} up`} disabled={i === 0} onClick={() => move(i, -1)} />
                    <IconButton
                      icon={ArrowDown}
                      size="sm"
                      label={`Move ${formatModel(slug)} down`}
                      disabled={i === usedFallbacks.length - 1}
                      onClick={() => move(i, 1)}
                    />
                    <IconButton icon={X} size="sm" label={`Remove ${formatModel(slug)}`} onClick={() => setFb(usedFallbacks.filter((f) => f !== slug))} />
                  </li>
                ))}
              </ol>
            )}
            {addable.length > 0 && (
              <Select
                label="Add a fallback"
                placeholder="Choose a model"
                value={null}
                options={addable.map((m) => ({ value: m.slug, label: formatModel(m.slug), hint: m.provider }))}
                onChange={(slug) => setFb([...usedFallbacks, slug])}
              />
            )}
          </section>
        )}
      </div>
    </Modal>
  );
}
