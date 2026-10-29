import { kdpRulesFile } from "./kdpRulesFile";

/* Paperback trim choices for the New book wizard and the profile and settings defaults, read from the newest
   config/kdp-rules file (rule paperback.trimSizes.list; large or regular from paperback.trimAndPages). No trim
   is typed in here. This reads the JSON directly so these screens do not load @volume/core. */

export interface TrimChoice {
  /** "6 x 9 in", the label the wizard and the server converter use. */
  value: string;
  widthIn: number;
  heightIn: number;
  /** KDP prices large trims differently: wider than or taller than the rule's threshold. */
  large: boolean;
}

function ruleValues(id: string): unknown {
  const r = kdpRulesFile.rules.find((x) => x.id === id);
  if (!r) throw new Error(`KDP rule ${id} is missing from config/kdp-rules/${kdpRulesFile.version}.json`);
  return r.values;
}

function num(v: unknown, where: string): number {
  if (typeof v !== "number") throw new Error(`KDP rule ${where}: expected a number`);
  return v;
}

function rec(v: unknown, where: string): Record<string, unknown> {
  if (typeof v !== "object" || v === null || Array.isArray(v)) throw new Error(`KDP rule ${where}: expected an object`);
  return v as Record<string, unknown>;
}

const list = ruleValues("paperback.trimSizes.list");
if (!Array.isArray(list)) throw new Error("KDP rule paperback.trimSizes.list: expected a list");
const threshold = rec(rec(ruleValues("paperback.trimAndPages"), "paperback.trimAndPages").largeTrimThreshold, "largeTrimThreshold");
const maxW = num(threshold.widthGreaterThanIn, "largeTrimThreshold.widthGreaterThanIn");
const maxH = num(threshold.heightGreaterThanIn, "largeTrimThreshold.heightGreaterThanIn");

/** Every paperback trim in the rules file, in its order. */
export const kdpTrims: readonly TrimChoice[] = list.map((t, i) => {
  const o = rec(t, `paperback.trimSizes.list[${i}]`);
  const widthIn = num(o.widthIn, `paperback.trimSizes.list[${i}].widthIn`);
  const heightIn = num(o.heightIn, `paperback.trimSizes.list[${i}].heightIn`);
  return { value: `${widthIn} x ${heightIn} in`, widthIn, heightIn, large: widthIn > maxW || heightIn > maxH };
});

export const kdpTrimsVersion: string = kdpRulesFile.version;
