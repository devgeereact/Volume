import { useState } from "react";
import { Check, Trash2, X } from "lucide-react";
import { Button, EmptyState, IconButton, Modal, Switch } from "../../components/ui";
import { cn } from "../../lib/cn";
import { SectionTitle, type TabProps } from "./IdentityTab";

/**
 * Memory: what the writer has learned from accepted and rejected edits. Each item can be switched off or
 * removed; Clear memory removes them all after a confirmation. Changes apply when the profile is saved.
 */
export function MemoryTab({ draft, update }: TabProps) {
  const [confirm, setConfirm] = useState(false);
  const items = draft.memory;
  const name = draft.name.trim() || "this profile";
  const onCount = items.filter((m) => m.on).length;

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <SectionTitle
          id="mem-title"
          title="Memory"
          body="Learned from edits you accepted or rejected in the editor. The writer reads the items that are on. Volume never adds an item without your choice."
        />
        {items.length > 0 && (
          <Button variant="ghost" icon={Trash2} onClick={() => setConfirm(true)}>
            Clear memory
          </Button>
        )}
      </div>

      {items.length === 0 ? (
        <EmptyState
          headingLevel={3}
          drawing="page"
          title="No memory yet"
          body="When you accept or reject a suggestion in the editor, Volume offers to remember it here for this profile."
        />
      ) : (
        <>
          <p className="text-small text-ink-secondary">
            {onCount} of {items.length} in use
          </p>
          <ul aria-labelledby="mem-title" className="grid gap-3">
            {items.map((m) => (
              <li key={m.id} className={cn("grid gap-3 rounded-md border border-border bg-sheet p-4", !m.on && "bg-canvas")}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span
                    className={cn(
                      "inline-flex h-6 items-center gap-1.5 rounded-pill px-2.5 text-[12.5px] leading-none font-semibold",
                      m.verdict === "accepted" ? "bg-success-wash text-success" : "bg-sunken text-ink-secondary",
                    )}
                  >
                    {m.verdict === "accepted" ? <Check size={14} strokeWidth={2} aria-hidden /> : <X size={14} strokeWidth={2} aria-hidden />}
                    {m.verdict === "accepted" ? "Accepted edit" : "Rejected edit"}
                  </span>
                  <span className="text-small text-ink-tertiary">{m.source}</span>
                </div>
                {m.before ? (
                  <dl className="grid gap-2 sm:grid-cols-2 sm:gap-4">
                    <div className="grid content-start gap-1">
                      <dt className="text-[12.5px] font-semibold text-ink-secondary">Before</dt>
                      <dd className="font-book text-prose-sm text-ink">{m.before}</dd>
                    </div>
                    <div className="grid content-start gap-1">
                      <dt className="text-[12.5px] font-semibold text-ink-secondary">{m.verdict === "accepted" ? "After, accepted" : "Suggested, rejected"}</dt>
                      <dd className={cn("font-book text-prose-sm", m.verdict === "accepted" ? "text-ink" : "text-ink-secondary line-through decoration-1")}>
                        {m.after}
                      </dd>
                    </div>
                  </dl>
                ) : (
                  // Server memory holds one line per item (a rule or a phrase), with no before and after.
                  <p className="font-book text-prose-sm text-ink">{m.after}</p>
                )}
                <p className="text-small text-ink-secondary">{m.reason}</p>
                <div className="flex items-center justify-between gap-3 border-t border-border pt-2">
                  <Switch
                    label={m.on ? "In use" : "Switched off"}
                    checked={m.on}
                    onChange={(on) => update((d) => ({ ...d, memory: d.memory.map((x) => (x.id === m.id ? { ...x, on } : x)) }))}
                  />
                  <IconButton
                    icon={Trash2}
                    label="Remove this memory"
                    onClick={() => update((d) => ({ ...d, memory: d.memory.filter((x) => x.id !== m.id) }))}
                  />
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      <Modal
        open={confirm}
        onClose={() => setConfirm(false)}
        size="sm"
        closeOnScrim={false}
        title={`Clear ${items.length} memory ${items.length === 1 ? "item" : "items"}?`}
        description={`The writer stops using what it learned for ${name} once you save the profile. Books already written stay as they are.`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirm(false)}>
              Keep memory
            </Button>
            <Button
              variant="danger"
              icon={Trash2}
              onClick={() => {
                update((d) => ({ ...d, memory: [] }));
                setConfirm(false);
              }}
            >
              Clear memory
            </Button>
          </>
        }
      />
    </div>
  );
}
