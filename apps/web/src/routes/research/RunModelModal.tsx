import { useState } from "react";
import { Banner, Button, Modal, ModelPicker, Textarea } from "../../components/ui";
import { getModel, models } from "../../data";
import { about, estimateFor } from "./sim";
import { useKeyChanged } from "../../lib/useKeyChanged";

/* "Run again with another model" dialog, shared by Research, Titles and Blueprint. Price before the
   click: the confirm button carries the estimate for the chosen model. */

export const textModels = models.filter((m) => !m.capabilities.includes("Images"));

interface RunModelModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description: string;
  /** Verb on the confirm button, for example "Run research". */
  confirmLabel: string;
  /** Cost of the last run on baseSlug, used to estimate other models. */
  baseUsd: number;
  baseSlug: string;
  /** Model selected when the dialog opens. */
  initialSlug: string;
  /** Research needs web search; models without it cannot be chosen. */
  requireWebSearch?: boolean | undefined;
  /** Show the optional instruction field. */
  withInstruction?: boolean | undefined;
  instructionHint?: string | undefined;
  onConfirm: (slug: string, instruction: string, estimateUsd: number) => void;
}

export function RunModelModal({
  open,
  onClose,
  title,
  description,
  confirmLabel,
  baseUsd,
  baseSlug,
  initialSlug,
  requireWebSearch = false,
  withInstruction = true,
  instructionHint,
  onConfirm,
}: RunModelModalProps) {
  const [slug, setSlug] = useState(initialSlug);
  const [instruction, setInstruction] = useState("");

  // Start from the given model with an empty instruction each time the modal opens.
  if (useKeyChanged(open ? initialSlug : null) && open) {
    setSlug(initialSlug);
    setInstruction("");
  }

  const model = getModel(slug);
  const noSearch = requireWebSearch && model !== undefined && !model.capabilities.includes("Web search");
  const estimate = estimateFor(baseUsd, baseSlug, slug);
  const notes: Record<string, string> = {};
  for (const m of textModels) {
    notes[m.slug] =
      requireWebSearch && !m.capabilities.includes("Web search")
        ? `${m.provider}, no web search`
        : `${m.provider}, ${about(estimateFor(baseUsd, baseSlug, m.slug))} here`;
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            estimate={about(estimate)}
            disabledReason={noSearch ? "This model cannot search the web. Pick one marked Web search." : undefined}
            onClick={() => onConfirm(slug, instruction.trim(), estimate)}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="grid max-h-[52vh] gap-4 overflow-y-auto pr-1">
        <ModelPicker label="Model for this run" models={textModels} value={slug} onChange={setSlug} notes={notes} />
        {noSearch && (
          <Banner tone="attention" title="This model cannot search the web">
            Research only keeps sources the model cites from a live search. Pick a model marked Web search.
          </Banner>
        )}
        {withInstruction && (
          <Textarea
            label="Instruction (optional)"
            hint={instructionHint ?? "One or two sentences. The rest of the book stays as fixed context."}
            rows={2}
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
          />
        )}
      </div>
    </Modal>
  );
}
