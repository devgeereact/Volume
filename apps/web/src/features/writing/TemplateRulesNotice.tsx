import { Banner } from "../../components/ui";
import type { ApiCheckResult } from "../../api/types";

/* Template rule findings on a section's current text (P6-4 checker `template_rules`): a fiction chapter with
   subheadings or takeaways, a workbook chapter without 2 to 4 exercises, ruled lines outside 1 to 30. A
   block finding leaves the section needing attention and blocks the pack (preflight structure.template-rules)
   until the text is fixed and saved, when the checks run again. Shown on Writing and in the Editor, like the
   summary flag. */

export const TEMPLATE_RULES_CHECKER = "template_rules";

/** Open template rule findings, blocks first. */
export function openTemplateFindings(checks: readonly ApiCheckResult[] | undefined): ApiCheckResult[] {
  return (checks ?? [])
    .filter((c) => c.checker === TEMPLATE_RULES_CHECKER && c.status === "open")
    .sort((a, b) => (a.severity === "block" ? 0 : 1) - (b.severity === "block" ? 0 : 1));
}

function fixHint(template: string | undefined): string {
  if (template === "fiction")
    return "Fiction chapters have no subheadings and no Key Takeaways. Remove them in the Editor and the checks run again when it saves.";
  if (template === "workbook") return "Workbook chapters need 2 to 4 exercises. Use Insert in the Editor to add one; the checks run again when it saves.";
  return "Fix it in the Editor; the checks run again when it saves.";
}

export function TemplateRulesNotice({
  checks,
  template,
  className,
}: {
  checks: readonly ApiCheckResult[] | undefined;
  template?: string | undefined;
  className?: string;
}) {
  const findings = openTemplateFindings(checks);
  if (findings.length === 0) return null;
  const blocks = findings.some((f) => f.severity === "block");
  return (
    <Banner tone="attention" className={className} title={blocks ? "Book template rules: fix before export" : "Book template rules: worth a look"}>
      <ul className="mt-1 grid gap-0.5">
        {findings.map((f) => (
          <li key={f.id}>{f.message}</li>
        ))}
      </ul>
      <p className="mt-1 text-ink-secondary">{fixHint(template)}</p>
    </Banner>
  );
}
