import { useId, type ReactNode, type Ref, type TextareaHTMLAttributes } from "react";
import { cn } from "../../lib/cn";
import { FieldShell, describedBy, fieldBoxClasses } from "./FieldShell";

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: ReactNode;
  hint?: ReactNode | undefined;
  error?: ReactNode | undefined;
  disabledReason?: ReactNode | undefined;
  /** Shows a word count beside the label. */
  showWordCount?: boolean | undefined;
  /** Use the book serif for prose fields (bios, samples, instructions about the text). */
  prose?: boolean | undefined;
  ref?: Ref<HTMLTextAreaElement> | undefined;
}

function words(s: string): number {
  return s.trim() ? s.trim().split(/\s+/).length : 0;
}

/** Multi-line field with a label above. Resizes vertically. */
export function Textarea({
  label,
  hint,
  error,
  disabledReason,
  showWordCount,
  prose,
  id: idProp,
  disabled,
  className,
  value,
  rows = 4,
  ref,
  ...rest
}: TextareaProps) {
  const autoId = useId();
  const id = idProp ?? autoId;
  return (
    <FieldShell
      id={id}
      label={label}
      hint={hint}
      error={error}
      disabled={disabled}
      disabledReason={disabledReason}
      className={className}
      aside={showWordCount && typeof value === "string" ? <span className="num text-caption text-ink-tertiary">{words(value)} words</span> : undefined}
    >
      <textarea
        ref={ref}
        id={id}
        rows={rows}
        value={value}
        disabled={disabled}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, Boolean(error), Boolean(hint || (disabled && disabledReason)))}
        className={cn(fieldBoxClasses({ error: Boolean(error), disabled: Boolean(disabled) }), "min-h-24 resize-y py-2.5", prose && "font-book text-prose-sm")}
        {...rest}
      />
    </FieldShell>
  );
}
