import { kdpRulesFile as rulesFile } from "../../lib/kdpRulesFile";
import {
  ebookRoyaltyGBP,
  KdpRuleError,
  minimumListPriceGBP,
  paperbackRoyaltyGBP,
  paperbackRoyaltyRate,
  parseKdpRules,
  printingCostGBP,
  parseTrimKey,
  trimClassFor,
  type TrimKey,
  type EbookRate,
} from "@volume/core";
import { KeyValueList } from "../../components/ui";
import type { ApiExportRecord, ApiListPrices } from "../../api/types";
import { formatGbp, percent } from "./kdpRules";

/* Royalties on the Volume server (API mode): the book's list prices (pounds, entered on the Published
   shelf) and the page count of the latest print PDF, through the KDP maths in @volume/core with the
   numbers from config/kdp-rules (AGENTS.md rule 7). Nothing here is typed in from memory; a missing or
   malformed rule shows as a plain message instead of a number. */

const rules = parseKdpRules(rulesFile);
const BYTES_PER_MB = 1024 * 1024;

interface Line {
  label: string;
  value: string;
}

interface Part {
  lines: Line[];
  notes: string[];
}

function ruleProblem(e: unknown): string {
  return e instanceof KdpRuleError ? e.message : "The KDP rules file could not answer this.";
}

function paperback(pages: number | null, price: number | null, trim: TrimKey): Part {
  if (!pages) return { lines: [], notes: ["Build the pack to get the page count from the print PDF."] };
  try {
    const print = printingCostGBP(rules, { pages, trimClass: trimClassFor(rules, parseTrimKey(trim)) });
    const min = minimumListPriceGBP(rules, print.value);
    const lines: Line[] = [
      { label: "Pages (print PDF)", value: String(pages) },
      { label: "Printing cost, black ink", value: formatGbp(print.value) },
      { label: "Minimum list price", value: formatGbp(min.value) },
      { label: "List price", value: price === null ? "Not set" : formatGbp(price) },
    ];
    const notes = [...print.warnings];
    if (price !== null) {
      const royalty = paperbackRoyaltyGBP(rules, { listPrice: price, printingCost: print.value });
      const expanded = paperbackRoyaltyGBP(rules, { listPrice: price, printingCost: print.value, expandedDistribution: true });
      lines.push(
        { label: `Royalty per sale (${percent(paperbackRoyaltyRate(rules, price))})`, value: formatGbp(royalty.value) },
        { label: "With Expanded Distribution", value: formatGbp(expanded.value) },
      );
      if (royalty.value < 0) notes.push("This price earns nothing after printing. Raise it.");
      else if (price < min.value) notes.push(`KDP will not accept a list price under ${formatGbp(min.value)} for this page count.`);
    }
    return { lines, notes };
  } catch (e) {
    return { lines: [], notes: [ruleProblem(e)] };
  }
}

function ebook(epub: ApiExportRecord | undefined, price: number | null): Part {
  const sizeMb = epub?.bytes ? epub.bytes / BYTES_PER_MB : null;
  const lines: Line[] = [
    { label: "File size (EPUB)", value: sizeMb === null ? "Not built yet" : `${sizeMb.toFixed(2)} MB` },
    { label: "List price", value: price === null ? "Not set" : formatGbp(price) },
  ];
  if (price === null || sizeMb === null) return { lines, notes: sizeMb === null ? ["Build the pack to get the EPUB file size."] : [] };
  try {
    // The 70% option when the price is in its band, otherwise 35%.
    const at70 = ebookRoyaltyGBP(rules, { listPrice: price, fileSizeMB: sizeMb, rate: 0.7 });
    const rate: EbookRate = at70.value.priceInBand ? 0.7 : 0.35;
    const r = rate === 0.7 ? at70 : ebookRoyaltyGBP(rules, { listPrice: price, fileSizeMB: sizeMb, rate });
    if (rate === 0.7) lines.push({ label: "Delivery cost", value: formatGbp(r.value.deliveryCost) });
    lines.push({ label: `Royalty per sale (${percent(rate)})`, value: formatGbp(r.value.royaltyRounded) });
    return { lines, notes: rate === 0.35 ? ["The price is outside the 70% band, so the 35% option applies.", ...r.warnings] : r.warnings };
  } catch (e) {
    return { lines, notes: [ruleProblem(e)] };
  }
}

function Block({ title, part }: { title: string; part: Part }) {
  return (
    <div className="grid content-start gap-2">
      <h3 className="text-[13.5px] leading-5 font-semibold text-ink">{title}</h3>
      {part.lines.length > 0 && <KeyValueList items={part.lines} />}
      {part.notes.map((n) => (
        <p key={n} className="text-[12.5px] text-ink-3">
          {n}
        </p>
      ))}
    </div>
  );
}

export function ApiRoyalties({
  listPrices,
  pdf,
  epub,
  trim = "6x9",
}: {
  trim?: TrimKey | undefined;
  listPrices: ApiListPrices | undefined;
  pdf: ApiExportRecord | undefined;
  epub: ApiExportRecord | undefined;
}) {
  const pages = pdf && pdf.status === "done" ? pdf.pageCount : null;
  const noPrices = !listPrices || (listPrices.paperback === null && listPrices.ebook === null);
  return (
    <section aria-labelledby="royalties-title" className="vol-glass min-w-0 rounded-card p-[18px] max-[560px]:p-[15px]">
      <div className="grid gap-0.5">
        <h2 id="royalties-title" className="text-[15px] leading-5 font-semibold text-ink">
          Royalty calculator
        </h2>
        <p className="text-[12.5px] text-ink-3">Royalties and printing cost on amazon.co.uk, KDP rules {rules.version}.</p>
      </div>
      <div className="mt-4 grid gap-5">
        <Block title="Paperback" part={paperback(pages, listPrices?.paperback ?? null, trim)} />
        <Block title="Kindle eBook" part={ebook(epub && epub.status === "done" ? epub : undefined, listPrices?.ebook ?? null)} />
      </div>
      {noPrices && (
        <p className="mt-4 text-[12.5px] text-ink-3">Royalties need a list price. Add the prices on the Published shelf once the book is published.</p>
      )}
    </section>
  );
}
