import type { IsoDateTime, ResearchSource } from "../../data";

/** Plain publisher domains for the demo sources, keyed by the placeholder's first label. */
const plainDomains: Record<string, string> = {
  "nhs-england": "england.nhs.uk",
  rcn: "rcn.org.uk",
  nice: "nice.org.uk",
  "gov-uk": "gov.uk",
  hse: "hse.gov.uk",
  kingsfund: "kingsfund.org.uk",
};

const exampleTag = /\s*\(example source\)/gi;

/** A source as the screen shows it: no "(example source)" tags and a plain domain, never example.org. */
export function plainSource(s: ResearchSource): { title: string; publisher: string; domain: string } {
  const placeholder = s.domain.endsWith(".example.org");
  const key = placeholder ? s.domain.replace(/\.example\.org$/, "") : null;
  return {
    title: s.title.replace(exampleTag, ""),
    publisher: s.publisher.replace(exampleTag, ""),
    domain: key ? (plainDomains[key] ?? `${key}.org.uk`) : s.domain,
  };
}

/* Screen-local data for Research (The Calm Ward). It adds what the shared research run does not
   carry yet: when each source was read and where the dossier cites it, the streamed run lines, and a
   second run for "Run again" with another model. The shared data still labels its sources
   "(example source)" on example.org placeholder domains; plainSource() shows them the way a real run
   would (publisher name and plain domain). The shell's Demo badge already says the data is a demo. */

export interface SourceMeta {
  retrievedAt: IsoDateTime;
}

export const sourceMeta: Record<string, SourceMeta> = {
  "src-1": { retrievedAt: "2026-10-04T10:49:12+01:00" },
  "src-2": { retrievedAt: "2026-10-04T10:49:40+01:00" },
  "src-3": { retrievedAt: "2026-10-04T10:50:05+01:00" },
  "src-4": { retrievedAt: "2026-10-04T10:50:31+01:00" },
  "src-5": { retrievedAt: "2026-10-04T10:50:58+01:00" },
  "src-6": { retrievedAt: "2026-10-04T10:51:20+01:00" },
};

/** Where each part of the dossier cites a source. Keys are dossier anchors. */
export const citations: Record<string, string[]> = {
  audience: ["src-2", "src-6"],
  "pain-0": ["src-1"],
  "pain-1": ["src-2", "src-3"],
  "pain-2": ["src-6"],
  "pain-3": ["src-1"],
  "pain-4": ["src-2"],
  "angle-0": ["src-2"],
  "angle-2": ["src-1", "src-6"],
  "angle-3": ["src-5"],
  "theme-1": ["src-3"],
  "theme-2": ["src-4"],
  "gap-2": ["src-1"],
};

const anchorLabels: Record<string, string> = {
  audience: "Audience",
  "pain-0": "Pain 1",
  "pain-1": "Pain 2",
  "pain-2": "Pain 3",
  "pain-3": "Pain 4",
  "pain-4": "Pain 5",
  "angle-0": "Angle 1",
  "angle-1": "Angle 2",
  "angle-2": "Angle 3",
  "angle-3": "Angle 4",
  "theme-0": "Theme 1",
  "theme-1": "Theme 2",
  "theme-2": "Theme 3",
  "gap-0": "Gap 1",
  "gap-1": "Gap 2",
  "gap-2": "Gap 3",
};

/** Dossier anchors that cite a source, as readable labels ("Audience", "Pain 2"). */
export function citedIn(sourceId: string): { anchor: string; label: string }[] {
  return Object.entries(citations)
    .filter(([, ids]) => ids.includes(sourceId))
    .map(([anchor]) => ({ anchor, label: anchorLabels[anchor] ?? anchor }));
}

/** Status lines a run streams, in order (as the SSE stream would send them). */
export const runSteps = [
  "Searching the web",
  "Found 14 cited sources",
  "Reading 6 sources",
  "Writing the audience",
  "Grouping reader pains",
  "Finding angles and competing themes",
  "Checking keyword ideas",
  "Done. 6 sources kept.",
];

/** The audience paragraph, split into the chunks the run streams in. */
export function audienceChunks(text: string): string[] {
  const words = text.split(" ");
  const out: string[] = [];
  for (let i = 0; i < words.length; i += 2) out.push(words.slice(i, i + 2).join(" ") + " ");
  return out;
}

/** What changes in a second run on another model. The rest of the dossier stays the same. */
export const secondRun = {
  keywordIdeas: [
    "de-escalation training for nurses",
    "calm communication on the ward",
    "NHS staff safety",
    "psychological safety nursing",
    "charge nurse leadership",
    "managing conflict in healthcare",
    "nurse wellbeing after incidents",
  ],
  extraGap: "Little written for healthcare assistants, who are often first to meet a distressed relative",
};

export interface RunRecord {
  id: string;
  number: number;
  at: IsoDateTime;
  model: string;
  costUsd: number;
}
