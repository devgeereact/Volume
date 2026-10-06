import { Banner } from "../../components/ui";
import type { GuardrailItem } from "../../api/wire-b";

/** What the house-style guardrails flagged in an AI run, from the server's report. Shown only when something needs a look. */
export function GuardrailNote({ items }: { items: GuardrailItem[] }) {
  const shown = items.slice(0, 5);
  return (
    <Banner tone="attention" title={`${items.length} ${items.length === 1 ? "thing needs" : "things need"} a look`}>
      <ul className="mt-1 grid gap-1">
        {shown.map((i, n) => (
          <li key={`${n}-${i.rule}`}>
            {i.message}
            {i.match ? `: "${i.match}"` : ""}
          </li>
        ))}
      </ul>
      {items.length > shown.length && <p className="mt-1">And {items.length - shown.length} more.</p>}
    </Banner>
  );
}
