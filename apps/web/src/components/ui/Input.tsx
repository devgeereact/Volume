import { useId, type InputHTMLAttributes, type ReactNode, type Ref } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "../../lib/cn";
import { FieldShell, describedBy, fieldBoxClasses } from "./FieldShell";

interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "size"> {
  label: ReactNode;
  hint?: ReactNode | undefined;
  /** Error message in words. Sets aria-invalid and a proof red border. */
  error?: ReactNode | undefined;
  disabledReason?: ReactNode | undefined;
  icon?: LucideIcon | undefined;
  /** Shows "12 of 200" beside the label when a number is given. */
  maxCount?: number | undefined;
  fieldClassName?: string | undefined;
  ref?: Ref<HTMLInputElement> | undefined;
}

/** Text field, 44 px tall, label above. */
export function Input({
  label,
  hint,
  error,
  disabledReason,
  icon: Icon,
  maxCount,
  id: idProp,
  disabled,
  className,
  fieldClassName,
  value,
  ref,
  ...rest
}: InputProps) {
  const autoId = useId();
  const id = idProp ?? autoId;
  const length = typeof value === "string" ? value.length : 0;
  const over = maxCount !== undefined && length > maxCount;
  return (
    <FieldShell
      id={id}
      label={label}
      hint={hint}
      error={error}
      disabled={disabled}
      disabledReason={disabledReason}
      className={className}
      aside={
        maxCount !== undefined ? (
          <span className={cn("num text-caption", over ? "text-claim" : "text-ink-tertiary")}>
            {length} of {maxCount}
          </span>
        ) : undefined
      }
    >
      <span className="relative flex items-center">
        {Icon && <Icon size={16} className="pointer-events-none absolute left-3 text-ink-tertiary" aria-hidden />}
        <input
          ref={ref}
          id={id}
          value={value}
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(id, Boolean(error), Boolean(hint || (disabled && disabledReason)))}
          className={cn(fieldBoxClasses({ error: Boolean(error), disabled: Boolean(disabled) }), "h-10", Icon && "pl-9", fieldClassName)}
          {...rest}
        />
      </span>
    </FieldShell>
  );
}
