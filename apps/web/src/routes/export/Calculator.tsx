import { useId, useState, type ReactNode } from "react";
import { Flag } from "lucide-react";
import { Switch } from "../../components/ui";
import { cn } from "../../lib/cn";
import { formatDate } from "../../lib/format";
import {
  ebookBand70,
  ebookDeliveryPerMb,
  ebookRoyalty,
  expandedRate,
  formatGbp,
  minimumListPrice,
  pageLimits,
  paperbackRate,
  paperbackTiers,
  printingCost,
  rateDecimal,
  rulesVerifiedOn,
  toPence,
  ruleLabel,
} from "./kdpRules";

interface CalculatorProps {
  defaultPages: number;
  defaultPrice: number;
  defaultEbookPrice: number;
  defaultSizeMb: number;
}

/** Printing cost, minimum list price and royalties per format from config/kdp-rules, with the maths shown. */
export function Calculator({ defaultPages, defaultPrice, defaultEbookPrice, defaultSizeMb }: CalculatorProps) {
  const [pagesText, setPagesText] = useState(String(defaultPages));
  const [priceText, setPriceText] = useState(defaultPrice.toFixed(2));
  const [ebookText, setEbookText] = useState(defaultEbookPrice.toFixed(2));
  const [sizeText, setSizeText] = useState(String(defaultSizeMb));
  const [expanded, setExpanded] = useState(false);

  const pages = Number.parseInt(pagesText, 10);
  const price = Number.parseFloat(priceText);
  const ebook = Number.parseFloat(ebookText);
  const size = Number.parseFloat(sizeText);
  const pagesOk = Number.isFinite(pages) && pages >= pageLimits.min && pages <= pageLimits.max6x9;
  const priceOk = Number.isFinite(price) && price > 0;
  const ebookOk = Number.isFinite(ebook) && ebook > 0;
  const sizeOk = Number.isFinite(size) && size > 0;

  const print = pagesOk ? printingCost(pages) : null;
  const rate = priceOk ? paperbackRate(price) : paperbackTiers.high.rate;
  const royalty = print && priceOk ? toPence(rate * price - print.cost) : null;
  const min = print ? minimumListPrice(print.cost) : null;
  const expandedRoyalty = print && priceOk ? toPence(expandedRate * price - print.cost) : null;
  const eb = ebookOk && sizeOk ? ebookRoyalty(ebook, size) : null;

  return (
    <section aria-labelledby="calc-title" className="rounded-md border border-border bg-sheet p-5 sm:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="calc-title" className="font-book text-heading text-ink">
          Royalties and printing cost
        </h2>
        <p className="text-small text-ink-secondary">amazon.co.uk, KDP rules checked {formatDate(rulesVerifiedOn)}</p>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="grid content-start gap-3">
          <h3 className="text-subhead text-ink">Paperback, black ink</h3>
          <div className="grid grid-cols-2 gap-3">
            <NumberField
              label="Pages"
              value={pagesText}
              onChange={setPagesText}
              error={pagesOk ? null : `Use ${pageLimits.min} to ${pageLimits.max6x9} pages.`}
            />
            <NumberField label="List price" prefix="£" value={priceText} onChange={setPriceText} decimal error={priceOk ? null : "Enter a price in pounds."} />
          </div>
          {print && (
            <Maths
              rows={[
                ["Printing cost", print.working, formatGbp(print.cost)],
                [
                  "Royalty tier",
                  priceOk
                    ? price <= paperbackTiers.low.upTo
                      ? `${formatGbp(price)} is ${formatGbp(paperbackTiers.low.upTo)} or less`
                      : `${formatGbp(price)} is ${formatGbp(paperbackTiers.high.from)} or more`
                    : "",
                  `${Math.round(rate * 100)}%`,
                ],
                [
                  "Royalty per sale",
                  priceOk ? `${rateDecimal(rate)} x ${formatGbp(price)} - ${formatGbp(print.cost)}` : "",
                  royalty !== null ? formatGbp(royalty) : "",
                  true,
                ],
                [
                  "Minimum list price",
                  min
                    ? min.rate === paperbackTiers.high.rate
                      ? `${formatGbp(print.cost)} / ${rateDecimal(min.rate)}`
                      : `${formatGbp(print.cost)} / ${rateDecimal(paperbackTiers.high.rate)} falls in the ${Math.round(paperbackTiers.low.rate * 100)}% tier, so ${formatGbp(print.cost)} / ${rateDecimal(min.rate)}`
                    : "",
                  min ? formatGbp(min.price) : "",
                ],
              ]}
              rules="paperback.printingCost.uk.blackInk, paperback.royalty.tiers.uk, paperback.minimumListPrice"
            />
          )}
          {print?.caution && <Note>{print.caution}</Note>}
          {min && priceOk && price < min.price && (
            <Note tone="claim">{`${formatGbp(price)} is under the minimum list price of ${formatGbp(min.price)}. KDP will not accept it.`}</Note>
          )}
          {royalty !== null && royalty < 0 && <Note tone="claim">This price earns nothing after printing. Raise it.</Note>}
          <Switch
            label="Expanded Distribution"
            description={`${Math.round(expandedRate * 100)}% of list price, minus printing`}
            checked={expanded}
            onChange={setExpanded}
          />
          {expanded && print && priceOk && expandedRoyalty !== null && (
            <Maths
              rows={[["Expanded royalty", `${rateDecimal(expandedRate)} x ${formatGbp(price)} - ${formatGbp(print.cost)}`, formatGbp(expandedRoyalty), true]]}
              rules="paperback.royalty.expandedDistribution"
            />
          )}
        </div>

        <div className="grid content-start gap-3">
          <h3 className="text-subhead text-ink">Kindle eBook</h3>
          <div className="grid grid-cols-2 gap-3">
            <NumberField label="List price" prefix="£" value={ebookText} onChange={setEbookText} decimal error={ebookOk ? null : "Enter a price in pounds."} />
            <NumberField label="File size" suffix="MB" value={sizeText} onChange={setSizeText} decimal error={sizeOk ? null : "Enter the EPUB size."} />
          </div>
          {eb && (
            <Maths
              rows={[
                [
                  "Royalty option",
                  eb.in70
                    ? `${formatGbp(ebook)} is inside ${formatGbp(ebookBand70.min)} to ${formatGbp(ebookBand70.max)}`
                    : `Outside ${formatGbp(ebookBand70.min)} to ${formatGbp(ebookBand70.max)}`,
                  `${Math.round(eb.rate * 100)}%`,
                ],
                ["Delivery cost", eb.in70 ? `${size} MB x ${formatGbp(ebookDeliveryPerMb)}` : "Not charged at 35%", formatGbp(eb.delivery)],
                [
                  "Royalty per sale",
                  eb.in70
                    ? `${rateDecimal(eb.rate)} x (${formatGbp(ebook)} - £0.00 VAT - ${formatGbp(eb.delivery)})`
                    : `${rateDecimal(eb.rate)} x ${formatGbp(ebook)}`,
                  formatGbp(eb.royalty),
                  true,
                ],
              ]}
              rules="ebook.royalty.formula, ebook.royalty70.priceBand.uk, ebook.deliveryCost.uk, ebook.vat.uk"
            />
          )}
          {eb && !eb.in70 && (
            <Note>{`The 70% option needs a price from ${formatGbp(ebookBand70.min)} to ${formatGbp(ebookBand70.max)}. At this price the book earns 35%.`}</Note>
          )}
          <p className="text-small text-ink-secondary">UK eBook VAT is 0%, so the list price and the price after VAT are the same.</p>
        </div>
      </div>
    </section>
  );
}

function Maths({ rows, rules }: { rows: [string, string, string, boolean?][]; rules: string }) {
  return (
    <div className="rounded-md bg-canvas px-4 py-3">
      <dl className="grid gap-2">
        {rows.map(([label, working, result, strong]) => (
          <div key={label} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3">
            <dt className="text-small text-ink-secondary">{label}</dt>
            <dd className={cn("num row-span-2 self-center text-right", strong ? "font-book text-[22px] leading-7 text-ink" : "text-[14px] text-ink")}>
              {result}
            </dd>
            <dd className="num text-[13px] leading-[18px] text-ink">{working}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-2 text-caption text-ink-tertiary" title={`Rule ids ${rules}`}>
        Rules: {rules.split(", ").map(ruleLabel).join("; ")}
      </p>
    </div>
  );
}

function Note({ children, tone = "attention" }: { children: ReactNode; tone?: "attention" | "claim" }) {
  return (
    <p
      role={tone === "claim" ? "alert" : undefined}
      className={cn(
        "flex items-start gap-1.5 rounded-sm px-3 py-2 text-small",
        tone === "claim" ? "bg-claim-wash text-claim" : "bg-accent-wash text-accent-text",
      )}
    >
      <Flag size={14} strokeWidth={2} className="mt-0.5 shrink-0" aria-hidden />
      {children}
    </p>
  );
}

function NumberField({
  label,
  value,
  onChange,
  prefix,
  suffix,
  decimal,
  error,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  prefix?: string;
  suffix?: string;
  decimal?: boolean;
  error: string | null;
}) {
  const id = useId();
  return (
    <div className="grid min-w-0 content-start gap-1.5">
      <label htmlFor={id} className="text-label text-ink">
        {label}
      </label>
      <div
        className={cn(
          "flex h-11 items-center rounded-sm border bg-sheet px-3 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-select",
          error ? "border-claim" : "border-border-strong",
        )}
      >
        {prefix && <span className="mr-1 text-body text-ink-secondary">{prefix}</span>}
        <input
          id={id}
          inputMode={decimal ? "decimal" : "numeric"}
          value={value}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${id}-err` : undefined}
          onChange={(e) => onChange(e.target.value.replace(decimal ? /[^\d.]/g : /[^\d]/g, ""))}
          className="num h-full w-0 min-w-0 flex-1 bg-transparent text-body text-ink focus:outline-none"
        />
        {suffix && <span className="ml-1 text-small text-ink-secondary">{suffix}</span>}
      </div>
      {error && (
        <p id={`${id}-err`} className="text-small text-claim">
          {error}
        </p>
      )}
    </div>
  );
}
