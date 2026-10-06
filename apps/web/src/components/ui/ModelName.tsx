import { describeModel } from "../../lib/format";
import { cn } from "../../lib/cn";
import { Tooltip } from "./Tooltip";

interface ModelNameProps {
  /** OpenRouter slug, for example "~anthropic/claude-sonnet-latest". */
  slug: string;
  /** Show "Anthropic, " before the name. */
  withProvider?: boolean | undefined;
  className?: string | undefined;
}

/**
 * A model's friendly name ("Claude Sonnet (latest)") with the exact OpenRouter slug in a tooltip on
 * hover and keyboard focus. Use it wherever a model is named; never print raw slugs or the "~" prefix.
 */
export function ModelName({ slug, withProvider, className }: ModelNameProps) {
  const m = describeModel(slug);
  const tip = (
    <span className="grid gap-0.5">
      <span>OpenRouter model</span>
      <span className="font-mono text-[12px] break-all">{m.slug}</span>
      {m.latestAlias && <span>Always the provider's newest version.</span>}
    </span>
  );
  return (
    <Tooltip content={tip}>
      <span tabIndex={0} className={cn("rounded-xs underline decoration-border-strong decoration-dotted underline-offset-4", className)}>
        {withProvider && m.provider ? `${m.provider}, ` : ""}
        {m.name}
      </span>
    </Tooltip>
  );
}
