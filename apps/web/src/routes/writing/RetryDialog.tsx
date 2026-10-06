import { useRef, useState } from "react";
import { Button, ModelName, Modal, Switch, Textarea } from "../../components/ui";
import { formatUsd } from "../../lib/format";
import { useKeyChanged } from "../../lib/useKeyChanged";

interface RetryDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (instruction: string, keepSubheadings: boolean) => void;
  /** "chapter 3" or "the front matter". */
  what: string;
  model: string;
  estimateUsd: number;
  hint?: string | undefined;
}

/** Regenerate one section (09-UX-FLOWS, Regenerate a chapter): instruction, keep subheadings, model, estimate. */
export function RetryDialog({ open, onClose, onConfirm, what, model, estimateUsd, hint }: RetryDialogProps) {
  const [instruction, setInstruction] = useState("");
  const [keep, setKeep] = useState(true);
  const fieldRef = useRef<HTMLTextAreaElement>(null);

  // Start from the hint each time the dialog opens.
  if (useKeyChanged(open ? (hint ?? "") : null) && open) {
    setInstruction(hint ?? "");
    setKeep(true);
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Retry ${what}`}
      description="The current version stays until the new one passes its checks. The old one stays in Versions."
      initialFocus={fieldRef}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" estimate={`about ${formatUsd(estimateUsd)}`} onClick={() => onConfirm(instruction, keep)}>
            Retry {what}
          </Button>
        </>
      }
    >
      <Textarea
        ref={fieldRef}
        label="Instruction for the writer (optional)"
        hint="For example: keep the ward example, soften anything that sounds like a clinical fact."
        rows={3}
        value={instruction}
        onChange={(e) => setInstruction(e.target.value)}
      />
      <Switch label="Keep subheadings" description="The writer keeps the blueprint's subheadings in order." checked={keep} onChange={setKeep} />
      <p className="text-small text-ink-secondary">
        Written by <ModelName slug={model} className="text-ink" />
      </p>
    </Modal>
  );
}
