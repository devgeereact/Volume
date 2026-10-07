import type { ModelInfo, StageModelDefault } from "./types";

/* Models from config/models.defaults.json (checked 4 October 2026). Prices are EXAMPLE PRICES for
   the prototype only: the app reads live prices from OpenRouter and shows the date it read them.
   Slugs starting with "~" are OpenRouter aliases for the provider's latest model. */

export const examplePricesNote = "Example prices. The app reads live prices from OpenRouter with the date.";

export const models: ModelInfo[] = [
  {
    slug: "~anthropic/claude-opus-latest",
    provider: "Anthropic",
    mark: "A",
    label: "Top tier, blueprint",
    contextTokens: 200000,
    examplePrice: { inputPerMillion: 15, outputPerMillion: 75 },
    capabilities: ["Long text", "Tools", "Structured output"],
    exampleBookCostUsd: 9.8,
  },
  {
    slug: "~anthropic/claude-sonnet-latest",
    provider: "Anthropic",
    mark: "A",
    label: "Current writer",
    contextTokens: 200000,
    examplePrice: { inputPerMillion: 3, outputPerMillion: 15 },
    capabilities: ["Long text", "Tools", "Structured output"],
    exampleBookCostUsd: 2.8,
  },
  {
    slug: "~anthropic/claude-haiku-latest",
    provider: "Anthropic",
    mark: "A",
    label: "Checks and summaries",
    contextTokens: 200000,
    examplePrice: { inputPerMillion: 1, outputPerMillion: 5 },
    capabilities: ["Tools", "Structured output"],
    exampleBookCostUsd: 0.9,
  },
  {
    slug: "~google/gemini-pro-latest",
    provider: "Google",
    mark: "G",
    label: "Research with web search",
    contextTokens: 1000000,
    examplePrice: { inputPerMillion: 1.25, outputPerMillion: 10 },
    capabilities: ["Long text", "Web search", "Structured output"],
    exampleBookCostUsd: 1.7,
  },
  {
    slug: "~google/gemini-flash-latest",
    provider: "Google",
    mark: "G",
    label: "Fast fallback",
    contextTokens: 1000000,
    examplePrice: { inputPerMillion: 0.3, outputPerMillion: 2.5 },
    capabilities: ["Long text", "Web search", "Structured output"],
    exampleBookCostUsd: 0.45,
  },
  {
    slug: "~openai/gpt-mini-latest",
    provider: "OpenAI",
    mark: "O",
    label: "Budget option",
    contextTokens: 400000,
    examplePrice: { inputPerMillion: 0.4, outputPerMillion: 1.6 },
    capabilities: ["Tools", "Structured output"],
    exampleBookCostUsd: 0.35,
  },
  {
    slug: "google/gemini-2.5-flash-image",
    provider: "Google",
    mark: "G",
    label: "Cover images",
    contextTokens: null,
    examplePrice: { perImage: 0.04 },
    capabilities: ["Images"],
    exampleBookCostUsd: 0.16,
  },
  {
    slug: "google/gemini-3.1-flash-image",
    provider: "Google",
    mark: "G",
    label: "Cover images, fallback",
    contextTokens: null,
    examplePrice: { perImage: 0.05 },
    capabilities: ["Images"],
    exampleBookCostUsd: 0.2,
  },
  {
    slug: "google/gemini-3-pro-image",
    provider: "Google",
    mark: "G",
    label: "Cover images, high detail",
    contextTokens: null,
    examplePrice: { perImage: 0.12 },
    capabilities: ["Images"],
    exampleBookCostUsd: 0.48,
  },
];

export function getModel(slug: string): ModelInfo | undefined {
  return models.find((m) => m.slug === slug);
}

/** Default model per stage, mirrored from config/models.defaults.json "stages". */
export const stageDefaults: StageModelDefault[] = [
  {
    stage: "research",
    label: "Research",
    tier: "search",
    defaultModel: "~google/gemini-pro-latest",
    fallbacks: ["~google/gemini-flash-latest", "~anthropic/claude-sonnet-latest"],
  },
  {
    stage: "titles",
    label: "Titles",
    tier: "mid",
    defaultModel: "~anthropic/claude-sonnet-latest",
    fallbacks: ["~google/gemini-pro-latest", "~openai/gpt-mini-latest"],
  },
  {
    stage: "blueprint",
    label: "Blueprint",
    tier: "top",
    defaultModel: "~anthropic/claude-opus-latest",
    fallbacks: ["~anthropic/claude-sonnet-latest", "~google/gemini-pro-latest"],
  },
  {
    stage: "writing",
    label: "Writing",
    tier: "mid",
    defaultModel: "~anthropic/claude-sonnet-latest",
    fallbacks: ["~anthropic/claude-opus-latest", "~google/gemini-pro-latest"],
  },
  {
    stage: "summarise",
    label: "Summaries",
    tier: "small",
    defaultModel: "~anthropic/claude-haiku-latest",
    fallbacks: ["~google/gemini-flash-latest", "~openai/gpt-mini-latest"],
  },
  {
    stage: "checks",
    label: "Checks",
    tier: "small",
    defaultModel: "~anthropic/claude-haiku-latest",
    fallbacks: ["~google/gemini-flash-latest", "~openai/gpt-mini-latest"],
  },
  {
    stage: "editing",
    label: "Editing",
    tier: "mid",
    defaultModel: "~anthropic/claude-sonnet-latest",
    fallbacks: ["~anthropic/claude-opus-latest", "~google/gemini-pro-latest"],
  },
  {
    stage: "matter_metadata",
    label: "Matter and listing",
    tier: "mid",
    defaultModel: "~anthropic/claude-sonnet-latest",
    fallbacks: ["~google/gemini-pro-latest", "~anthropic/claude-haiku-latest"],
  },
  { stage: "cover_brief", label: "Cover brief", tier: "mid", defaultModel: "~anthropic/claude-sonnet-latest", fallbacks: ["~google/gemini-pro-latest"] },
  {
    stage: "cover_image",
    label: "Cover images",
    tier: "image",
    defaultModel: "google/gemini-2.5-flash-image",
    fallbacks: ["google/gemini-3.1-flash-image", "google/gemini-3-pro-image"],
  },
  {
    stage: "marketing",
    label: "Marketing",
    tier: "mid",
    defaultModel: "~anthropic/claude-sonnet-latest",
    fallbacks: ["~google/gemini-pro-latest", "~anthropic/claude-haiku-latest"],
  },
];
