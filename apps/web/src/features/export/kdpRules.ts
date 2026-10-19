import rulesFile from "@config/kdp-rules/2026-10-06.json";

/* KDP numbers for the Cover studio and Export, read from config/kdp-rules/2026-10-06.json at build time
   (AGENTS.md rule 7: never from memory). Every figure the screens show carries its rule id. A missing or
   malformed rule throws, so a bad rules file fails loudly instead of printing a wrong number. */

interface RawRule {
  id: string;
  factId: string | null;
  status: string;
  verifiedOn: string | null;
  source: string;
  note?: string;
  value?: unknown;
  values?: unknown;
}

const rules = rulesFile.rules as unknown as RawRule[];
export const rulesVersion: string = rulesFile.version;
export const rulesVerifiedOn: string = rulesFile.verifiedOn;
export const rulesRecheckDue: string = rulesFile.recheckDue;

export function rule(id: string): RawRule {
  const r = rules.find((x) => x.id === id);
  if (!r) throw new Error(`KDP rule ${id} is missing from config/kdp-rules/${rulesVersion}.json`);
  return r;
}

function obj(v: unknown, where: string): Record<string, unknown> {
  if (typeof v !== "object" || v === null || Array.isArray(v)) throw new Error(`KDP rule ${where}: expected an object`);
  return v as Record<string, unknown>;
}
function arr(v: unknown, where: string): unknown[] {
  if (!Array.isArray(v)) throw new Error(`KDP rule ${where}: expected a list`);
  return v;
}
function n(v: unknown, where: string): number {
  if (typeof v !== "number") throw new Error(`KDP rule ${where}: expected a number`);
  return v;
}

/* ---------- Values ---------- */

const spineRule = obj(rule("paperback.spine.widthPerPage").values, "spine");
export const spinePerPage = { white: n(spineRule.white, "spine.white"), cream: n(spineRule.cream, "spine.cream") };
export const spineTextMinPages = n(rule("paperback.spine.textMinPages").value, "spine text");

const coverRule = obj(rule("paperback.cover").values, "paperback.cover");
export const coverBleedIn = n(coverRule.bleedIn, "bleed");
export const coverMinDpi = n(coverRule.minDpi, "dpi");

const barcodeRaw = rule("paperback.cover.barcodeArea");
const barcodeVals = obj(barcodeRaw.values, "barcode");
export const barcodeArea = { widthIn: n(barcodeVals.widthIn, "barcode.w"), heightIn: n(barcodeVals.heightIn, "barcode.h"), status: barcodeRaw.status };

const safeRaw = rule("paperback.cover.safeZone");
export const safeInsetIn = n(obj(safeRaw.values, "safe").textInsetFromTrimIn, "safe.inset");

const ebookCover = obj(rule("ebook.cover").values, "ebook.cover");
const ideal = obj(ebookCover.idealPx, "ebook.idealPx");
export const ebookCoverPx = { width: n(ideal.width, "ebook.w"), height: n(ideal.height, "ebook.h") };
export const ebookMinRatio = n(ebookCover.minHeightToWidthRatio, "ebook.ratio");
export const ebookCoverMaxMb = n(ebookCover.maxFileSizeMB, "ebook.maxMb");
export const ebookCoverTypes = arr(ebookCover.fileTypes, "ebook.fileTypes").map(String);

const trimPages = obj(rule("paperback.trimAndPages").values, "trimAndPages");
const sixByNine = obj(trimPages.sixByNineBlackWhite, "sixByNine");
export const pageLimits = { min: n(trimPages.minPagesAnyTrim, "min pages"), max6x9: n(sixByNine.maxPages, "max pages") };

/** Royalty tiers for paperbacks on amazon.co.uk (fact 3.1). */
const tiers = arr(rule("paperback.royalty.tiers.uk").values, "tiers").map((t, i) => {
  const o = obj(t, `tier ${i}`);
  const lp = obj(o.listPrice, `tier ${i} price`);
  return { rate: n(o.rate, `tier ${i} rate`), lte: typeof lp.lte === "number" ? lp.lte : null, gte: typeof lp.gte === "number" ? lp.gte : null };
});
const lowTier = tiers.find((t) => t.lte !== null);
const highTier = tiers.find((t) => t.gte !== null);
if (!lowTier || !highTier) throw new Error("KDP rule paperback.royalty.tiers.uk: expected two tiers");
export const paperbackTiers = { low: { rate: lowTier.rate, upTo: lowTier.lte ?? 0 }, high: { rate: highTier.rate, from: highTier.gte ?? 0 } };
export const expandedRate = n(rule("paperback.royalty.expandedDistribution").value, "expanded");

const printing = obj(rule("paperback.printingCost.uk.blackInk").values, "printing");
const regular = arr(printing.regularTrim, "printing.regular").map((b, i) => obj(b, `printing band ${i}`));
const flatBand = regular.find((b) => typeof b.flat === "number");
const pageBand = regular.find((b) => typeof b.perPage === "number");
if (!flatBand || !pageBand) throw new Error("KDP rule paperback.printingCost.uk.blackInk: expected flat and per-page bands");
const flatPages = obj(flatBand.pages, "flat pages");
export const printingBands = {
  flat: { cost: n(flatBand.flat, "flat"), minPages: n(flatPages.min, "flat min"), maxPages: n(flatPages.max, "flat max") },
  perPage: { fixed: n(pageBand.fixed, "fixed"), perPage: n(pageBand.perPage, "perPage"), maxPages: n(obj(pageBand.pages, "page band").max, "page max") },
};

const band70 = obj(rule("ebook.royalty70.priceBand.uk").values, "70 band");
export const ebookBand70 = { min: n(band70.min, "70 min"), max: n(band70.max, "70 max") };
const ebookOptions = arr(rule("ebook.royalty.options").values, "ebook options").map((v, i) => n(v, `ebook option ${i}`));
export const ebookRates = { low: Math.min(...ebookOptions), high: Math.max(...ebookOptions) };
export const ebookDeliveryPerMb = n(rule("ebook.deliveryCost.uk").value, "delivery");
export const ebookVat = n(rule("ebook.vat.uk").value, "vat");

export const listing = {
  titleMax: n(obj(rule("listing.titleSubtitle.maxChars").values, "title").maxAllowed, "title max"),
  descriptionMax: n(rule("listing.description.maxChars").value, "description"),
  keywords: n(obj(rule("listing.keywords").values, "keywords").max, "keywords"),
  categories: n(rule("listing.categories").value, "categories"),
};

/* ---------- Maths ---------- */

/** Round half up to pence, safe against float noise (0.7 x 3.75 is 2.6249999...). */
export function toPence(x: number): number {
  return Math.round(x * 100 + 1e-7) / 100;
}

const gbp = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", minimumFractionDigits: 2 });
export function formatGbp(x: number): string {
  return gbp.format(toPence(x));
}

export function inches(x: number, dp = 4): string {
  return `${Number(x.toFixed(dp))} in`;
}

export function parseTrim(trim: string): { w: number; h: number } {
  const m = trim.match(/([\d.]+)\s*x\s*([\d.]+)/);
  return m ? { w: Number(m[1]), h: Number(m[2]) } : { w: 6, h: 9 };
}

export type Paper = "white" | "cream";

export function spineWidthIn(pages: number, paper: Paper): number {
  return pages * spinePerPage[paper];
}

export function wrapSize(trim: { w: number; h: number }, pages: number, paper: Paper) {
  const spine = spineWidthIn(pages, paper);
  return {
    spine,
    width: coverBleedIn + trim.w + spine + trim.w + coverBleedIn,
    height: coverBleedIn + trim.h + coverBleedIn,
  };
}

export function printingCost(pages: number): { cost: number; working: string; caution: string | null } {
  const { flat, perPage } = printingBands;
  if (pages <= flat.maxPages) {
    return {
      cost: flat.cost,
      working: `${flat.minPages} to ${flat.maxPages} pages: flat ${formatGbp(flat.cost)}`,
      caution: pages === flat.maxPages ? `KDP lists ${flat.maxPages} pages in both bands. Check the live table at this boundary.` : null,
    };
  }
  const cost = perPage.fixed + pages * perPage.perPage;
  return { cost, working: `${formatGbp(perPage.fixed)} + ${pages} x ${formatGbp(perPage.perPage)} = ${formatGbp(cost)}`, caution: null };
}

export function paperbackRate(price: number): number {
  return price <= paperbackTiers.low.upTo ? paperbackTiers.low.rate : paperbackTiers.high.rate;
}

/** Fact 3.4: compute with the high rate, and if the result is in the low tier, recompute with the low rate. */
export function minimumListPrice(cost: number): { price: number; rate: number } {
  const high = cost / paperbackTiers.high.rate;
  if (high > paperbackTiers.low.upTo) return { price: Math.ceil(high * 100 - 1e-7) / 100, rate: paperbackTiers.high.rate };
  const low = cost / paperbackTiers.low.rate;
  return { price: Math.ceil(low * 100 - 1e-7) / 100, rate: paperbackTiers.low.rate };
}

export function ebookRoyalty(price: number, sizeMb: number) {
  const in70 = price >= ebookBand70.min && price <= ebookBand70.max;
  const delivery = in70 ? toPence(sizeMb * ebookDeliveryPerMb) : 0;
  const rate = in70 ? ebookRates.high : ebookRates.low;
  // Whole-percent maths so 70% of 3.75 is exactly 2.625 before rounding.
  const pct = Math.round(rate * 100);
  const royalty = (pct * Math.round((price - ebookVat * price - delivery) * 100)) / 10000;
  return { in70, rate, delivery, royalty };
}

export function percent(rate: number): string {
  return `${Math.round(rate * 100)}%`;
}

export function rateDecimal(rate: number): string {
  return rate.toFixed(2);
}

/* ---------- Plain names for the rules the screens cite ---------- */

const ruleNames: Record<string, string> = {
  "ebook.royalty.options": "eBook royalty options",
  "ebook.royalty.formula": "eBook royalty sum",
  "ebook.royalty70.priceBand.uk": "70% royalty price range (UK)",
  "ebook.royalty35.priceBands.uk": "35% royalty price range (UK)",
  "ebook.deliveryCost.uk": "eBook delivery cost (UK)",
  "ebook.vat.uk": "eBook VAT (UK)",
  "paperback.royalty.tiers.uk": "Paperback royalty rates (UK)",
  "paperback.royalty.expandedDistribution": "Expanded Distribution royalty",
  "paperback.printingCost.uk.blackInk": "Printing cost, black ink (UK)",
  "paperback.minimumListPrice": "Minimum list price",
  "paperback.trimAndPages": "Trim sizes and page counts",
  "print.bleed": "Bleed",
  "paperback.cover": "Paperback cover files",
  "paperback.spine.widthPerPage": "Spine width per page",
  "paperback.spine.textMinPages": "Spine text minimum pages",
  "paperback.interiorMargins": "Interior margins",
  "paperback.cover.barcodeArea": "Barcode area",
  "paperback.cover.safeZone": "Cover safe area",
  "ebook.cover": "eBook cover size",
  "manuscript.formats": "Manuscript files and fonts",
  "listing.keywords": "Keywords",
  "listing.categories": "Categories",
  "listing.description.maxChars": "Description length",
  "listing.titleSubtitle.maxChars": "Title and subtitle length",
  "ai.disclosure": "AI disclosure",
};

/** "Title and subtitle length, KDP fact 5.4" for a rule id; unknown ids fall back to the id. */
export function ruleLabel(id: string): string {
  const name = ruleNames[id] ?? id;
  const fact = rules.find((r) => r.id === id)?.factId;
  return fact ? `${name}, KDP fact ${fact}` : `${name}, unverified`;
}
