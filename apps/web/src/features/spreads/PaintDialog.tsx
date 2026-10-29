import { useState } from "react";
import type { SpreadView } from "../../api/picture";
import { Banner, Button, KeyValueList, Modal } from "../../components/ui";
import { formatUsd } from "../../lib/format";
import { pictureEstimate } from "./model";

interface PaintDialogProps {
  spread: SpreadView | null;
  onClose: () => void;
  /** Starts the new picture. Rejects with the server's error. */
  onPaint: (spread: SpreadView) => Promise<void>;
  spentUsd: number | null;
  /** One picture's cost in words from the server's estimate; the demo figure when left out. */
  pictureCost?: string | undefined;
}

/**
 * Confirms one new picture before it is made, with its cost. There is no spending cap (D-057): a picture job that
 * meets an AI provider out of credit pauses with the top-up notice instead.
 */
export function PaintDialog({ spread, onClose, onPaint, spentUsd, pictureCost = pictureEstimate }: PaintDialogProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function close() {
    if (busy) return;
    setError(null);
    onClose();
  }

  function paint() {
    if (!spread) return;
    setBusy(true);
    setError(null);
    onPaint(spread).then(
      () => {
        setBusy(false);
        onClose();
      },
      (e: unknown) => {
        setBusy(false);
        setError(e instanceof Error ? e.message : "The picture was not started. Try again.");
      },
    );
  }

  const n = spread?.n ?? 0;
  const items = [{ label: "This picture", value: pictureCost }, ...(spentUsd !== null ? [{ label: "Spent on this book", value: formatUsd(spentUsd) }] : [])];

  return (
    <Modal
      open={spread !== null}
      onClose={close}
      title={`Paint spread ${n} again`}
      description="The new picture replaces this one. It uses the same scene, the character references and the book's art style, so the characters stay the same."
      footer={
        <>
          <Button variant="ghost" onClick={close} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" onClick={paint} loading={busy} loadingLabel="Starting" estimate={pictureCost}>
            Paint spread {n}
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        <KeyValueList items={items} />
        <p className="text-small text-ink-secondary">The text and layout do not change.</p>
        {error && (
          <Banner tone="error" title="The picture was not started">
            {error}
          </Banner>
        )}
      </div>
    </Modal>
  );
}
