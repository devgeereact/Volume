import { DEMO_NOW } from "../data/books";

/* Formatting in British English: numbers in figures, money with the currency sign,
   dates as "4 October 2026" (08-DESIGN-GUIDE, Writing tone). */

const numberFmt = new Intl.NumberFormat("en-GB");
const usdFmt = new Intl.NumberFormat("en-GB", { style: "currency", currency: "USD", minimumFractionDigits: 2 });
const dayMonthFmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", timeZone: "Europe/London" });
const fullDateFmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/London" });
const timeFmt = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Europe/London" });
const dayKeyFmt = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: "Europe/London" });

/** 21340 becomes "21,340". */
export function formatNumber(n: number): string {
  return numberFmt.format(n);
}

/** 1.92 becomes "$1.92". AI costs are in US dollars, as OpenRouter bills. */
export function formatUsd(n: number): string {
  return usdFmt.format(n).replace("US$", "$");
}

/** Pounds for KDP prices: "£8.99". */
export function formatGbp(n: number): string {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(n);
}

/** Month and year for shelf headings: "September 2026". */
export function formatMonthYear(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "Europe/London" }).format(new Date(iso));
}

/** "4 October 2026". */
export function formatDate(iso: string): string {
  return fullDateFmt.format(new Date(iso));
}

/** "2 October". */
export function formatDayMonth(iso: string): string {
  return dayMonthFmt.format(new Date(iso));
}

/** "14:31". */
export function formatTime(iso: string): string {
  return timeFmt.format(new Date(iso));
}

/** "Today, 14:12", "Yesterday" or "1 October", relative to the demo's today (4 October 2026). */
export function formatRelative(iso: string, now: string = DEMO_NOW): string {
  const day = dayKeyFmt.format(new Date(iso));
  const today = dayKeyFmt.format(new Date(now));
  const yesterday = dayKeyFmt.format(new Date(new Date(now).getTime() - 86_400_000));
  if (day === today) return `Today, ${formatTime(iso)}`;
  if (day === yesterday) return "Yesterday";
  return formatDayMonth(iso);
}

/** 72 becomes "1 h 12 min". */
export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

/** Per million token price line: "$3.00 in, $15.00 out". */
export function formatPerMillion(input: number, output: number): string {
  return `${formatUsd(input)} in, ${formatUsd(output)} out`;
}

/** 200000 becomes "200k", 1000000 becomes "1M". */
export function formatContext(tokens: number | null): string {
  if (tokens === null) return "None";
  if (tokens >= 1_000_000) return `${tokens / 1_000_000}M`;
  return `${Math.round(tokens / 1000)}k`;
}

/* ---------- Model names ---------- */

const modelWords: Record<string, string> = {
  claude: "Claude",
  gpt: "GPT",
  gemini: "Gemini",
  opus: "Opus",
  sonnet: "Sonnet",
  haiku: "Haiku",
  pro: "Pro",
  flash: "Flash",
  mini: "mini",
  image: "Image",
  llama: "Llama",
  mistral: "Mistral",
};

const providerNames: Record<string, string> = {
  anthropic: "Anthropic",
  google: "Google",
  openai: "OpenAI",
  "meta-llama": "Meta",
  mistralai: "Mistral",
};

export interface ModelDisplay {
  /** Friendly name, for example "Claude Sonnet (latest)". */
  name: string;
  /** Provider, for example "Anthropic". */
  provider: string;
  /** The exact OpenRouter slug, for a tooltip or title attribute. */
  slug: string;
  /** True for OpenRouter "~" aliases that always point at the provider's newest model. */
  latestAlias: boolean;
}

/**
 * Turns an OpenRouter slug into a friendly name. "~anthropic/claude-sonnet-latest" becomes
 * "Claude Sonnet (latest)" and "google/gemini-2.5-flash-image" becomes "Gemini 2.5 Flash Image".
 * Never show the raw "~" prefix in the interface: show `name`, and put `slug` in a tooltip.
 */
export function describeModel(slug: string): ModelDisplay {
  const latestAlias = slug.startsWith("~");
  const bare = latestAlias ? slug.slice(1) : slug;
  const [providerId = "", model = bare] = bare.includes("/") ? bare.split("/", 2) : ["", bare];
  const tokens = model.split(/[-_:]/).filter(Boolean);
  const latest = latestAlias || tokens[tokens.length - 1] === "latest";
  const words = tokens.filter((t) => t !== "latest").map((t) => modelWords[t] ?? (/^\d/.test(t) ? t : t.charAt(0).toUpperCase() + t.slice(1)));
  const name = `${words.join(" ")}${latest ? " (latest)" : ""}`;
  return { name, provider: providerNames[providerId] ?? providerId, slug, latestAlias };
}

/** Friendly model name only. See describeModel for the provider and slug. */
export function formatModel(slug: string): string {
  return describeModel(slug).name;
}
