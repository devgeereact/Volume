// KDP maths. Every number comes from the kdp-rules config object (config/kdp-rules/<date>.json),
// passed in by the caller. Nothing here is typed in from memory.

import { z } from 'zod';

export const kdpRuleSchema = z
  .object({
    id: z.string(),
    value: z.unknown().optional(),
    values: z.unknown().optional(),
    formula: z.string().optional(),
    unit: z.string().optional(),
    factId: z.string().nullable().optional(),
    source: z.string().optional(),
    verifiedOn: z.string().nullable().optional(),
    status: z.enum(['confirmed', 'partial', 'unverified']),
    note: z.string().optional(),
  })
  .passthrough();

export const kdpRulesSchema = z
  .object({
    version: z.string(),
    verifiedOn: z.string(),
    recheckAfterDays: z.number(),
    recheckDue: z.string().optional(),
    primaryMarketplace: z.string().optional(),
    currency: z.string().optional(),
    rules: z.array(kdpRuleSchema),
  })
  .passthrough();

export type KdpRule = z.infer<typeof kdpRuleSchema>;
export type KdpRules = z.infer<typeof kdpRulesSchema>;

export class KdpRuleError extends Error {
  readonly ruleId: string;

  constructor(message: string, ruleId: string) {
    super(message);
    this.name = 'KdpRuleError';
    this.ruleId = ruleId;
  }
}

export function parseKdpRules(raw: unknown): KdpRules {
  return kdpRulesSchema.parse(raw);
}

export function getRule(rules: KdpRules, id: string): KdpRule {
  const r = rules.rules.find((x) => x.id === id);
  if (!r) throw new KdpRuleError(`KDP rule "${id}" is missing from rules file ${rules.version}.`, id);
  return r;
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
/** A text value from a rule, or '' when the field is missing or not text. */
function text(v: unknown): string {
  return typeof v === 'string' ? v : '';
}
function num(v: unknown, ruleId: string, path: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new KdpRuleError(`KDP rule "${ruleId}" has no number at ${path}.`, ruleId);
  return v;
}
function field(obj: unknown, key: string, ruleId: string): unknown {
  if (!isObj(obj)) throw new KdpRuleError(`KDP rule "${ruleId}" values are not an object.`, ruleId);
  return obj[key];
}

/** A result with the rule ids used and any check-before-use warnings (partial or unverified rules). */
export interface KdpResult<T> {
  value: T;
  ruleIds: string[];
  warnings: string[];
}

function statusWarnings(rules: KdpRules, ids: string[]): string[] {
  const out: string[] = [];
  for (const id of ids) {
    const r = getRule(rules, id);
    if (r.status === 'unverified') out.push(`Rule ${id} is unverified: check the official page before relying on it.`);
    else if (r.status === 'partial') out.push(`Rule ${id} is partial: check before you rely on it.`);
  }
  return out;
}

const round = (v: number, dp: number) => Math.round(v * 10 ** dp + Number.EPSILON) / 10 ** dp;

export type Paper = 'white' | 'cream';
export interface TrimSize {
  widthIn: number;
  heightIn: number;
}

// ---------- spine, wrap, bleed ----------

/** Spine width in inches: pages x per-page thickness for the paper (FACTS 3.9). */
export function spineWidthIn(rules: KdpRules, pages: number, paper: Paper): number {
  const r = getRule(rules, 'paperback.spine.widthPerPage');
  return pages * num(field(r.values, paper, r.id), r.id, `values.${paper}`);
}

/** Spine width in inches for a colour interior: pages x per-page thickness for the ink (rule paperback.spine.widthPerPage.colour). */
export function colourSpineWidthIn(rules: KdpRules, pages: number, ink: ColourInk): number {
  const r = getRule(rules, 'paperback.spine.widthPerPage.colour');
  const key = ink === 'premium' ? 'premiumColour' : 'standardColour';
  return pages * num(field(r.values, key, r.id), r.id, `values.${key}`);
}

export interface WrapSize {
  widthIn: number;
  heightIn: number;
  spineIn: number;
  bleedIn: number;
  trim: TrimSize;
  pages: number;
  paper: Paper;
  /** Colour ink when the interior is colour (the spine then uses the colour rule). */
  ink?: ColourInk;
}

/**
 * Full paperback wrap: bleed + back + spine + front + bleed, by bleed + height + bleed (FACTS 3.8, 3.9). With `ink`
 * the spine uses the colour per-page thickness (rule paperback.spine.widthPerPage.colour) instead of the paper's.
 */
export function wrapSizeIn(rules: KdpRules, args: { trim: TrimSize; pages: number; paper: Paper; ink?: ColourInk }): WrapSize {
  const cover = getRule(rules, 'paperback.cover');
  const bleed = num(field(cover.values, 'bleedIn', cover.id), cover.id, 'values.bleedIn');
  const spine = args.ink ? colourSpineWidthIn(rules, args.pages, args.ink) : spineWidthIn(rules, args.pages, args.paper);
  return {
    ...(args.ink ? { ink: args.ink } : {}),
    widthIn: bleed + args.trim.widthIn + spine + args.trim.widthIn + bleed,
    heightIn: bleed + args.trim.heightIn + bleed,
    spineIn: spine,
    bleedIn: bleed,
    trim: args.trim,
    pages: args.pages,
    paper: args.paper,
  };
}

/** Spine text only at the minimum page count or more (FACTS 3.10, Volume uses 80). */
export function spineTextAllowed(rules: KdpRules, pages: number): boolean {
  const r = getRule(rules, 'paperback.spine.textMinPages');
  return pages >= num(r.value, r.id, 'value');
}

export function spineTextMinPages(rules: KdpRules): number {
  const r = getRule(rules, 'paperback.spine.textMinPages');
  return num(r.value, r.id, 'value');
}

/** Interior page size with bleed (picture books): width + addWidth, height + addHeight (FACTS 3.7). */
export function interiorBleedSizeIn(rules: KdpRules, trim: TrimSize): TrimSize {
  const r = getRule(rules, 'print.bleed');
  return {
    widthIn: trim.widthIn + num(field(r.values, 'addWidthIn', r.id), r.id, 'values.addWidthIn'),
    heightIn: trim.heightIn + num(field(r.values, 'addHeightIn', r.id), r.id, 'values.addHeightIn'),
  };
}

export function coverMinDpi(rules: KdpRules): number {
  const r = getRule(rules, 'paperback.cover');
  return num(field(r.values, 'minDpi', r.id), r.id, 'values.minDpi');
}

/** Barcode keep-out box (unverified rule: callers must show the warning). */
export function barcodeArea(rules: KdpRules): KdpResult<{ widthIn: number; heightIn: number; position: string; insetFromTrimIn: number }> {
  const r = getRule(rules, 'paperback.cover.barcodeArea');
  return {
    value: {
      widthIn: num(field(r.values, 'widthIn', r.id), r.id, 'values.widthIn'),
      heightIn: num(field(r.values, 'heightIn', r.id), r.id, 'values.heightIn'),
      position: text(field(r.values, 'position', r.id)),
      insetFromTrimIn: isObj(r.values) && typeof r.values.insetFromTrimIn === 'number' ? r.values.insetFromTrimIn : 0,
    },
    ruleIds: [r.id],
    warnings: statusWarnings(rules, [r.id]),
  };
}

/** Cover safe zone (unverified rule). */
export function coverSafeZone(rules: KdpRules): KdpResult<{ textInsetFromTrimIn: number; spineTextClearanceIn: number }> {
  const r = getRule(rules, 'paperback.cover.safeZone');
  return {
    value: {
      textInsetFromTrimIn: num(field(r.values, 'textInsetFromTrimIn', r.id), r.id, 'values.textInsetFromTrimIn'),
      spineTextClearanceIn: num(field(r.values, 'spineTextClearanceIn', r.id), r.id, 'values.spineTextClearanceIn'),
    },
    ruleIds: [r.id],
    warnings: statusWarnings(rules, [r.id]),
  };
}

// ---------- trims and page ranges ----------

export function trimSizes(rules: KdpRules): KdpResult<TrimSize[]> {
  const r = getRule(rules, 'paperback.trimSizes.list');
  const list = Array.isArray(r.values) ? r.values : [];
  return {
    value: list
      .filter(isObj)
      .map((t, k) => ({ widthIn: num(t.widthIn, r.id, `values[${k}].widthIn`), heightIn: num(t.heightIn, r.id, `values[${k}].heightIn`) })),
    ruleIds: [r.id],
    warnings: statusWarnings(rules, [r.id]),
  };
}

/**
 * Page range for a trim (FACTS 3.6). 6 x 9 in black on white has its own range; other trims use the minimum for any
 * trim and the lowest maximum across options (a safe bound) with a check-before-use warning.
 */
export function trimPageRange(rules: KdpRules, trim: TrimSize, paper: Paper = 'white'): KdpResult<{ min: number; max: number }> {
  const r = getRule(rules, 'paperback.trimAndPages');
  const v = r.values;
  const table = isObj(v) && Array.isArray(v.blackInkByTrim) ? v.blackInkByTrim : [];
  const row = table.find((entry): entry is Record<string, unknown> => isObj(entry) && entry.widthIn === trim.widthIn && entry.heightIn === trim.heightIn);
  if (row)
    return {
      value: { min: num(row.minPages, r.id, 'minPages'), max: num(row[paper === 'cream' ? 'creamMaxPages' : 'whiteMaxPages'], r.id, 'maxPages') },
      ruleIds: [r.id],
      warnings: statusWarnings(rules, [r.id]),
    };
  const common = field(v, 'mostCommonTrimUS', r.id);
  const six = field(v, 'sixByNineBlackWhite', r.id);
  const minAny = num(field(v, 'minPagesAnyTrim', r.id), r.id, 'values.minPagesAnyTrim');
  if (isObj(common) && common.widthIn === trim.widthIn && common.heightIn === trim.heightIn && isObj(six)) {
    return { value: { min: num(six.minPages, r.id, 'minPages'), max: num(six.maxPages, r.id, 'maxPages') }, ruleIds: [r.id], warnings: [] };
  }
  const range = field(v, 'maxPagesRangeAcrossOptions', r.id);
  const lowestMax = isObj(range) ? num(range.min, r.id, 'maxPagesRangeAcrossOptions.min') : 0;
  return {
    value: { min: minAny, max: lowestMax },
    ruleIds: [r.id],
    warnings: [
      `The maximum page count for ${trim.widthIn} x ${trim.heightIn} in is not in the rules file; using the lowest maximum across options (${lowestMax}). Check KDP's trim table.`,
    ],
  };
}

/** Minimum inside margin for a page count (unverified rule: show the warning). */
export function insideMarginMinIn(rules: KdpRules, pages: number): KdpResult<number | null> {
  const r = getRule(rules, 'paperback.interiorMargins');
  const bands = field(r.values, 'insideByPageCount', r.id);
  let value: number | null = null;
  if (Array.isArray(bands)) {
    for (const b of bands) {
      if (!isObj(b) || !isObj(b.pages)) continue;
      if (pages >= num(b.pages.min, r.id, 'pages.min') && pages <= num(b.pages.max, r.id, 'pages.max')) value = num(b.insideIn, r.id, 'insideIn');
    }
  }
  return { value, ruleIds: [r.id], warnings: statusWarnings(rules, [r.id]) };
}

export function outsideMarginMinIn(rules: KdpRules, bleed: boolean): KdpResult<number> {
  const r = getRule(rules, 'paperback.interiorMargins');
  const key = bleed ? 'outsideMinWithBleedIn' : 'outsideMinNoBleedIn';
  return { value: num(field(r.values, key, r.id), r.id, key), ruleIds: [r.id], warnings: statusWarnings(rules, [r.id]) };
}

// ---------- paperback money (amazon.co.uk) ----------

export type TrimClass = 'regular' | 'large';
export function trimClassFor(rules: KdpRules, trim: TrimSize): TrimClass {
  const r = getRule(rules, 'paperback.trimAndPages');
  const threshold = field(r.values, 'largeTrimThreshold', r.id);
  return trim.widthIn > num(field(threshold, 'widthGreaterThanIn', r.id), r.id, 'widthGreaterThanIn') ||
    trim.heightIn > num(field(threshold, 'heightGreaterThanIn', r.id), r.id, 'heightGreaterThanIn')
    ? 'large'
    : 'regular';
}

/**
 * Printing cost, black ink, amazon.co.uk (FACTS 3.3). Bands are taken in file order; the first band whose
 * page range contains the count wins (the file's bands overlap at 110 pages, which gives the flat price).
 * Large-trim page bands are not in the rules file: the regular-trim band boundaries are used with a warning.
 */
export function printingCostGBP(rules: KdpRules, args: { pages: number; trimClass?: TrimClass }): KdpResult<number> {
  const r = getRule(rules, 'paperback.printingCost.uk.blackInk');
  const trimClass = args.trimClass ?? 'regular';
  const regular = field(r.values, 'regularTrim', r.id);
  if (!Array.isArray(regular)) throw new KdpRuleError('regularTrim bands missing', r.id);
  const warnings: string[] = [];
  let bandIndex = -1;
  regular.forEach((b, k) => {
    if (bandIndex >= 0 || !isObj(b) || !isObj(b.pages)) return;
    if (args.pages >= num(b.pages.min, r.id, 'pages.min') && args.pages <= num(b.pages.max, r.id, 'pages.max')) bandIndex = k;
  });
  if (bandIndex < 0) throw new KdpRuleError(`No printing cost band for ${args.pages} pages.`, r.id);
  if (args.pages === 110) warnings.push('The printing cost bands overlap at 110 pages; check the live KDP table.');
  let band: unknown = regular[bandIndex];
  if (trimClass === 'large') {
    const large = field(r.values, 'largeTrim', r.id);
    if (!Array.isArray(large)) throw new KdpRuleError('largeTrim bands missing', r.id);
    band = large[bandIndex];
    warnings.push('Large-trim page bands are not in the rules file; the regular-trim band boundaries were used. Check the live KDP table.');
  }
  if (!isObj(band)) throw new KdpRuleError('printing cost band missing', r.id);
  const value = typeof band.flat === 'number' ? band.flat : num(band.fixed, r.id, 'fixed') + args.pages * num(band.perPage, r.id, 'perPage');
  return { value: round(value, 4), ruleIds: [r.id], warnings };
}

/** Royalty rate for a paperback list price on amazon.co.uk (FACTS 3.1): 50% up to 7.98, 60% from 7.99. */
export function paperbackRoyaltyRate(rules: KdpRules, listPrice: number): number {
  const r = getRule(rules, 'paperback.royalty.tiers.uk');
  if (!Array.isArray(r.values)) throw new KdpRuleError('tiers missing', r.id);
  for (const t of r.values) {
    if (!isObj(t) || !isObj(t.listPrice)) continue;
    const lp = t.listPrice;
    const okLow = typeof lp.gte !== 'number' || listPrice >= lp.gte;
    const okHigh = typeof lp.lte !== 'number' || listPrice <= lp.lte;
    if (okLow && okHigh) return num(t.rate, r.id, 'rate');
  }
  throw new KdpRuleError(`No paperback royalty tier for list price ${listPrice}.`, r.id);
}

/** Paperback royalty: rate x list price - printing cost (FACTS 3.1); Expanded Distribution uses 40% (FACTS 3.2). */
export function paperbackRoyaltyGBP(rules: KdpRules, args: { listPrice: number; printingCost: number; expandedDistribution?: boolean }): KdpResult<number> {
  let rate: number;
  const ids = ['paperback.royalty.tiers.uk'];
  if (args.expandedDistribution) {
    const r = getRule(rules, 'paperback.royalty.expandedDistribution');
    rate = num(r.value, r.id, 'value');
    ids.push(r.id);
  } else {
    rate = paperbackRoyaltyRate(rules, args.listPrice);
  }
  return { value: round(rate * args.listPrice - args.printingCost, 4), ruleIds: ids, warnings: [] };
}

/**
 * Minimum list price = printing cost / rate (FACTS 3.4): computed with the higher tier first, and if the result falls
 * in the lower tier it is recomputed with the lower tier's rate. Rounded up to the next penny.
 */
export function minimumListPriceGBP(rules: KdpRules, printingCost: number): KdpResult<number> {
  const r = getRule(rules, 'paperback.royalty.tiers.uk');
  const tiers = (Array.isArray(r.values) ? r.values : []).filter(isObj);
  const ceilPenny = (v: number) => Math.ceil(v * 100 - 1e-9) / 100;
  let best = Number.POSITIVE_INFINITY;
  // For each tier: the price that covers printing at that tier's rate, raised to the tier's lower bound if needed.
  for (const t of tiers) {
    const rate = num(t.rate, r.id, 'rate');
    const lp = isObj(t.listPrice) ? t.listPrice : {};
    let price = ceilPenny(printingCost / rate);
    if (typeof lp.gte === 'number' && price < lp.gte) price = lp.gte;
    if (typeof lp.lte === 'number' && price > lp.lte) continue;
    if (paperbackRoyaltyRate(rules, price) === rate && rate * price >= printingCost - 1e-9) best = Math.min(best, price);
  }
  if (!Number.isFinite(best)) throw new KdpRuleError(`No list price covers a printing cost of ${printingCost}.`, r.id);
  return { value: best, ruleIds: [r.id, 'paperback.minimumListPrice'], warnings: [] };
}

// ---------- eBook money (amazon.co.uk) ----------

export type EbookRate = 0.35 | 0.7;

export interface EbookRoyalty {
  royalty: number;
  /** Rounded to the penny for display. */
  royaltyRounded: number;
  vat: number;
  deliveryCost: number;
  priceInBand: boolean;
}

/**
 * eBook royalty = rate x (list price - VAT - delivery cost) (FACTS 10.1). Delivery (per MB, FACTS 2.4) applies on 70%
 * only. VAT is the UK eBook rate (FACTS 2.5) taken out of the VAT-inclusive list price. Price bands: 70% (FACTS 2.2),
 * 35% by file size (FACTS 2.3).
 */
export function ebookRoyaltyGBP(rules: KdpRules, args: { listPrice: number; fileSizeMB: number; rate: EbookRate }): KdpResult<EbookRoyalty> {
  const opts = getRule(rules, 'ebook.royalty.options');
  const allowed = Array.isArray(opts.values) ? opts.values : [];
  if (!allowed.includes(args.rate)) throw new KdpRuleError(`Royalty rate ${args.rate} is not one of ${allowed.join(', ')}.`, opts.id);
  const vatRule = getRule(rules, 'ebook.vat.uk');
  const vatRate = num(vatRule.value, vatRule.id, 'value');
  const vat = args.listPrice - args.listPrice / (1 + vatRate);
  const ids = ['ebook.royalty.options', 'ebook.royalty.formula', 'ebook.vat.uk'];
  let delivery = 0;
  let inBand: boolean;
  const warnings: string[] = [];
  if (args.rate === 0.7) {
    const d = getRule(rules, 'ebook.deliveryCost.uk');
    delivery = args.fileSizeMB * num(d.value, d.id, 'value');
    const band = getRule(rules, 'ebook.royalty70.priceBand.uk');
    inBand =
      args.listPrice >= num(field(band.values, 'min', band.id), band.id, 'min') && args.listPrice <= num(field(band.values, 'max', band.id), band.id, 'max');
    ids.push(d.id, band.id);
  } else {
    const bands = getRule(rules, 'ebook.royalty35.priceBands.uk');
    const list = Array.isArray(bands.values) ? bands.values.filter(isObj) : [];
    const b = list.find((x) => {
      const fs = isObj(x.fileSizeMB) ? x.fileSizeMB : {};
      return (typeof fs.gte !== 'number' || args.fileSizeMB >= fs.gte) && (typeof fs.lt !== 'number' || args.fileSizeMB < fs.lt);
    });
    inBand = b ? args.listPrice >= num(b.min, bands.id, 'min') && args.listPrice <= num(b.max, bands.id, 'max') : false;
    ids.push(bands.id);
  }
  if (!inBand) warnings.push(`List price ${args.listPrice.toFixed(2)} is outside the amazon.co.uk band for the ${Math.round(args.rate * 100)}% option.`);
  const royalty = args.rate * (args.listPrice - vat - delivery);
  return {
    value: { royalty: round(royalty, 6), royaltyRounded: round(royalty, 2), vat: round(vat, 6), deliveryCost: round(delivery, 6), priceInBand: inBand },
    ruleIds: ids,
    warnings,
  };
}

// ---------- listing limits and covers ----------

export interface ListingLimits {
  maxKeywords: number;
  categories: number;
  descriptionMaxChars: number;
  descriptionAllowedTags: string[];
  titleSubtitleMaxChars: number;
}

export function listingLimits(rules: KdpRules): ListingLimits {
  const kw = getRule(rules, 'listing.keywords');
  const cat = getRule(rules, 'listing.categories');
  const desc = getRule(rules, 'listing.description.maxChars');
  const tags = getRule(rules, 'listing.description.allowedFormatting');
  const title = getRule(rules, 'listing.titleSubtitle.maxChars');
  const assumed = field(tags.values, 'assumedTags', tags.id);
  return {
    maxKeywords: num(field(kw.values, 'max', kw.id), kw.id, 'max'),
    categories: num(cat.value, cat.id, 'value'),
    descriptionMaxChars: num(desc.value, desc.id, 'value'),
    descriptionAllowedTags: Array.isArray(assumed) ? assumed.map(String) : [],
    titleSubtitleMaxChars: num(field(title.values, 'maxAllowed', title.id), title.id, 'maxAllowed'),
  };
}

export interface EbookCoverSpec {
  widthPx: number;
  heightPx: number;
  minRatio: number;
  minWidthPx: number;
  minHeightPx: number;
  maxPxEachSide: number;
  fileTypes: string[];
  maxFileSizeMB: number;
  colourMode: string;
}

export function ebookCoverSpec(rules: KdpRules): EbookCoverSpec {
  const r = getRule(rules, 'ebook.cover');
  const v = r.values;
  const ideal = field(v, 'idealPx', r.id);
  const min = field(v, 'minPx', r.id);
  const types = field(v, 'fileTypes', r.id);
  return {
    widthPx: num(field(ideal, 'width', r.id), r.id, 'idealPx.width'),
    heightPx: num(field(ideal, 'height', r.id), r.id, 'idealPx.height'),
    minRatio: num(field(v, 'minHeightToWidthRatio', r.id), r.id, 'minHeightToWidthRatio'),
    minWidthPx: num(field(min, 'width', r.id), r.id, 'minPx.width'),
    minHeightPx: num(field(min, 'height', r.id), r.id, 'minPx.height'),
    maxPxEachSide: num(field(v, 'maxPxEachSide', r.id), r.id, 'maxPxEachSide'),
    fileTypes: Array.isArray(types) ? types.map(String) : [],
    maxFileSizeMB: num(field(v, 'maxFileSizeMB', r.id), r.id, 'maxFileSizeMB'),
    colourMode: text(field(v, 'colourMode', r.id)),
  };
}

// ---------- colour paperbacks and interior bleed (phase 7, P7-2) ----------

/** Colour ink options for a paperback interior (rules paperback.trimAndPages.colour, paperback.printingCost.uk.*Colour). */
export type ColourInk = 'standard' | 'premium';
const INK_KEY: Readonly<Record<ColourInk, { trims: string; cost: string }>> = {
  standard: { trims: 'standardColourByTrim', cost: 'paperback.printingCost.uk.standardColour' },
  premium: { trims: 'premiumColourByTrim', cost: 'paperback.printingCost.uk.premiumColour' },
};

/** Interior page size with bleed (rule print.bleed), with the rule id and any status warning. */
export function bleedPageSizeIn(rules: KdpRules, trim: TrimSize): KdpResult<TrimSize> {
  return { value: interiorBleedSizeIn(rules, trim), ruleIds: ['print.bleed'], warnings: statusWarnings(rules, ['print.bleed']) };
}

/**
 * Where the bleed sits on an interior page (rule print.bleed): the added width is on the outside edge only, the added
 * height is split equally between top and bottom.
 */
export function bleedEdgesIn(rules: KdpRules): { outsideIn: number; topIn: number; bottomIn: number } {
  const r = getRule(rules, 'print.bleed');
  const w = num(field(r.values, 'addWidthIn', r.id), r.id, 'values.addWidthIn');
  const h = num(field(r.values, 'addHeightIn', r.id), r.id, 'values.addHeightIn');
  return { outsideIn: w, topIn: h / 2, bottomIn: h / 2 };
}

export interface SafeAreaIn {
  topIn: number;
  bottomIn: number;
  insideIn: number;
  outsideIn: number;
}

/**
 * Minimum distance of text from the trim edges on a bleed interior (rule paperback.interiorMargins): inside from the
 * page-count band; top, bottom and outside from the with-bleed outside minimum. Measured from the trim edge, which is
 * at least as safe whether KDP measures from the trim or the bleed edge. A draft whose page count is outside every
 * inside band (too short to print) uses the nearest band, with a warning, so it can still be laid out and checked.
 */
export function safeAreaIn(rules: KdpRules, trim: TrimSize, pageCount: number): KdpResult<SafeAreaIn> {
  void trim; // The rule has no trim-specific values today; kept so callers do not change when it does.
  let inside = insideMarginMinIn(rules, pageCount);
  const warnings = [...inside.warnings];
  if (inside.value === null) {
    const r = getRule(rules, 'paperback.interiorMargins');
    const bands = field(r.values, 'insideByPageCount', r.id);
    const limits = (Array.isArray(bands) ? bands : [])
      .filter((b): b is Record<string, unknown> => isObj(b) && isObj(b.pages))
      .flatMap((b) => (isObj(b.pages) ? [num(b.pages.min, r.id, 'pages.min'), num(b.pages.max, r.id, 'pages.max')] : []));
    if (!limits.length) throw new KdpRuleError(`No inside margin band for ${pageCount} pages.`, r.id);
    const nearest = pageCount < Math.min(...limits) ? Math.min(...limits) : Math.max(...limits);
    inside = insideMarginMinIn(rules, nearest);
    if (inside.value === null) throw new KdpRuleError(`No inside margin band for ${pageCount} pages.`, r.id);
    warnings.push(`${pageCount} pages is outside the inside-margin bands; the band for ${nearest} pages was used.`);
  }
  const outside = outsideMarginMinIn(rules, true);
  return {
    value: { topIn: outside.value, bottomIn: outside.value, insideIn: inside.value, outsideIn: outside.value },
    ruleIds: ['paperback.interiorMargins'],
    warnings,
  };
}

/** Page range for a colour interior on a trim (rule paperback.trimAndPages.colour, white paper only). */
export function colourPageRange(rules: KdpRules, trim: TrimSize, ink: ColourInk): KdpResult<{ min: number; max: number }> {
  const r = getRule(rules, 'paperback.trimAndPages.colour');
  const key = INK_KEY[ink].trims;
  const table = field(r.values, key, r.id);
  const row = (Array.isArray(table) ? table : []).find(
    (e): e is Record<string, unknown> => isObj(e) && e.widthIn === trim.widthIn && e.heightIn === trim.heightIn,
  );
  if (!row) throw new KdpRuleError(`No ${ink} colour page range for ${trim.widthIn} x ${trim.heightIn} in.`, r.id);
  const ids = [r.id, 'paperback.colour.paper'];
  return {
    value: { min: num(row.minPages, r.id, `${key}.minPages`), max: num(row.maxPages, r.id, `${key}.maxPages`) },
    ruleIds: ids,
    warnings: statusWarnings(rules, ids),
  };
}

/**
 * Colour printing cost on amazon.co.uk (rules paperback.printingCost.uk.standardColour and premiumColour): the first
 * band whose page range holds the count, flat or fixed + pages x perPage; large trims use the large-trim bands.
 */
export function colourPrintingCost(rules: KdpRules, args: { ink: ColourInk; trim: TrimSize; pages: number }): KdpResult<number> {
  const r = getRule(rules, INK_KEY[args.ink].cost);
  const cls = trimClassFor(rules, args.trim);
  const bands = field(r.values, cls === 'large' ? 'largeTrim' : 'regularTrim', r.id);
  const band = (Array.isArray(bands) ? bands : []).find(
    (b): b is Record<string, unknown> =>
      isObj(b) && isObj(b.pages) && args.pages >= num(b.pages.min, r.id, 'pages.min') && args.pages <= num(b.pages.max, r.id, 'pages.max'),
  );
  if (!band) throw new KdpRuleError(`No ${args.ink} colour printing cost band for ${args.pages} pages.`, r.id);
  const value = typeof band.flat === 'number' ? band.flat : num(band.fixed, r.id, 'fixed') + args.pages * num(band.perPage, r.id, 'perPage');
  const ids = [r.id, 'paperback.trimAndPages'];
  return { value: round(value, 4), ruleIds: ids, warnings: statusWarnings(rules, ids) };
}

// ---------- title creation limit (FACTS 5.7, D-046) ----------

export interface TitleCreationLimit {
  maxNewTitlesPerFormat: number;
  periodDays: number;
}

/** Calendar words a rule may use for its period. These are units, not KDP numbers. */
const PERIOD_DAYS: Readonly<Record<string, number>> = { day: 1, week: 7 };

/** New titles allowed per book format per period, from rule titles.creationLimit. */
export function titleCreationLimit(rules: KdpRules): TitleCreationLimit {
  const r = getRule(rules, 'titles.creationLimit');
  const max = num(field(r.values, 'maxNewTitlesPerFormat', r.id), r.id, 'maxNewTitlesPerFormat');
  if (!Number.isInteger(max) || max < 1) throw new KdpRuleError(`KDP rule "${r.id}" maxNewTitlesPerFormat must be a whole number of 1 or more.`, r.id);
  const period = field(r.values, 'period', r.id);
  const periodDays = typeof period === 'string' && Object.hasOwn(PERIOD_DAYS, period) ? PERIOD_DAYS[period] : undefined;
  if (periodDays === undefined) throw new KdpRuleError(`KDP rule "${r.id}" has an unknown period "${String(period)}".`, r.id);
  return { maxNewTitlesPerFormat: max, periodDays };
}

/** Days since the rules were verified, and whether the re-check is due (recheckAfterDays). */
export function rulesAge(rules: KdpRules, now: Date): { days: number; stale: boolean } {
  const verified = Date.parse(`${rules.verifiedOn}T00:00:00Z`);
  const days = Math.floor((now.getTime() - verified) / 86_400_000);
  return { days, stale: days > rules.recheckAfterDays };
}

/** "rule id (fact x.y, status, verified date)" lines for the pack's kdp-rules-used.txt. */
export function describeRules(rules: KdpRules, ids: readonly string[]): string[] {
  return [...new Set(ids)].map((id) => {
    const r = getRule(rules, id);
    return `${id}: fact ${r.factId ?? 'none'}, ${r.status}, verified ${r.verifiedOn ?? 'never'}, ${r.source ?? ''}`;
  });
}
