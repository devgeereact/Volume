/* Adapters from server shapes (api/types.ts) to the shapes the prototype screens use today
   (data/types.ts), so a screen can switch from mock data to the API with a small edit:

     const { data } = useBook(bookId);
     const book = data ? toPrototypeBook(data) : mockBook;

   Where the server has no value for a prototype field, the adapter fills a neutral value (empty
   list, null, 0) and never invents content. Those fields are listed in api/README.md under
   "Gaps". Times arrive as epoch milliseconds and leave as ISO strings. */

import { getProfile, STAGE_IDS, type AuthorProfile, type ModelStageId, type ProfileBioStatus, type ProfilePublishing, type ProfileVoice } from "../demo/config";
import type { Book, PenName, PreflightItem, PublishedInfo, StageId, TemplateId, TitleOption } from "../demo/types";
import type {
  ApiBlueprintVersion,
  ApiBook,
  ApiBookDetail,
  ApiPreflightItem,
  ApiProfile,
  ApiSection,
  ApiTitleDirection,
  ApiTitleOption,
  ApiTitleSet,
  BlueprintChapterData,
  BlueprintData,
  EpochMs,
  SectionTree,
} from "./types";

/* ---------- Small readers for untyped JSON columns ---------- */

type Obj = Record<string, unknown>;

function obj(v: unknown): Obj {
  return typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Obj) : {};
}
function str(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}
function strOrNull(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}
function num(v: unknown, fallback = 0): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}
function bool(v: unknown, fallback = false): boolean {
  return typeof v === "boolean" ? v : fallback;
}
function strings(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

export function isoFromMs(ms: EpochMs | null | undefined): string {
  return new Date(typeof ms === "number" ? ms : 0).toISOString();
}

/* ---------- Profiles to PenName ---------- */

export function initialsOf(name: string): string {
  const parts = name
    .replace(/[^\p{L}\s.'-]/gu, " ")
    .split(/[\s.]+/)
    .filter(Boolean);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return (first + last).toUpperCase() || "?";
}

const BIO_STATUSES: readonly ProfileBioStatus[] = ["owner-to-confirm", "confirmed", "pen-name"];

function toVoice(v: Obj): ProfileVoice {
  const voice: ProfileVoice = {
    tone: strings(v["tone"]),
    pov: str(v["pov"]),
    rhythm: str(v["rhythm"]),
    vocabulary: str(v["vocabulary"]),
    readingLevel: str(v["readingLevel"]),
    dialogueStyle: str(v["dialogueStyle"]),
    locale: str(v["locale"], "en-GB"),
    bannedPhrases: strings(v["bannedPhrases"]),
    sampleParagraph: str(v["sampleParagraph"]),
  };
  if (typeof v["heatLevel"] === "string") voice.heatLevel = v["heatLevel"];
  return voice;
}

function toPublishing(p: Obj, fallback: ProfilePublishing | undefined): ProfilePublishing {
  return {
    copyrightTemplate: str(p["copyrightTemplate"], fallback?.copyrightTemplate ?? ""),
    copyrightName: str(p["copyrightName"], fallback?.copyrightName ?? ""),
    disclaimer: str(p["disclaimer"], fallback?.disclaimer ?? ""),
    illustrativeLine: typeof p["illustrativeLine"] === "string" ? p["illustrativeLine"] : (fallback?.illustrativeLine ?? null),
    defaultBookType: str(p["defaultBookType"], fallback?.defaultBookType ?? ""),
    defaultWordTarget: num(p["defaultWordTarget"], fallback?.defaultWordTarget ?? 0),
    defaultTrim: str(p["defaultTrim"], fallback?.defaultTrim ?? "6x9"),
    defaultInteriorTheme: str(p["defaultInteriorTheme"], fallback?.defaultInteriorTheme ?? ""),
    defaultCoverStyle: str(p["defaultCoverStyle"], fallback?.defaultCoverStyle ?? ""),
  };
}

/**
 * Server profile to the config-shaped AuthorProfile. Seeded profiles carry initials, genres and
 * bookTypes in `brand`, and the bio status and model notes in `publishing` (apps/server/src/seed).
 * Fields the server does not hold come from the matching config/profiles file when there is one.
 */
export function toAuthorProfile(p: ApiProfile): AuthorProfile {
  const local = p.sourceKey ? getProfile(p.sourceKey) : undefined;
  const brand = obj(p.brand);
  const publishing = obj(p.publishing);
  const sourceStatus = obj(publishing["sourceStatus"]);
  const bioRaw = str(sourceStatus["bio"]);
  const bio = BIO_STATUSES.find((s) => s === bioRaw) ?? local?.status.bio ?? (p.isRealPerson ? "owner-to-confirm" : "pen-name");
  const models = {} as Record<ModelStageId, string | null>;
  for (const s of STAGE_IDS) models[s] = strOrNull(obj(p.models)[s]);
  return {
    id: p.id,
    name: p.penName,
    initials: str(brand["initials"]) || initialsOf(p.penName),
    realPerson: p.isRealPerson,
    legalName: p.legalName,
    location: p.location,
    imprint: p.imprintName,
    bio: p.bioThirdPerson,
    shortBio: p.shortBio ?? "",
    credentials: p.credentials,
    links: p.links.map((l) => ({ label: l.label, value: l.value ?? l.url ?? "" })),
    genres: strings(brand["genres"]),
    bookTypes: strings(brand["bookTypes"]),
    voice: toVoice(obj(p.voice)),
    publishing: toPublishing(publishing, local?.publishing),
    models,
    modelNotes: str(publishing["modelNotes"], local?.modelNotes ?? ""),
    status: { bio, note: str(sourceStatus["note"], local?.status.note ?? "") },
    createdAt: isoFromMs(p.createdAt),
  };
}

function sentence(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Server profile to the PenName the profile and library screens use. */
export function toPenName(p: ApiProfile, defaultWriterModel = ""): PenName {
  const profile = toAuthorProfile(p);
  const tone = profile.voice.tone;
  const toneLine = tone.length <= 1 ? sentence(tone[0] ?? "") : sentence(`${tone.slice(0, -1).join(", ")} and ${tone[tone.length - 1] ?? ""}`);
  return {
    id: p.id,
    name: profile.name,
    initials: profile.initials,
    imprint: profile.imprint,
    realPerson: profile.realPerson,
    bio: profile.bio,
    shortBio: profile.shortBio,
    bioStatus: profile.status.bio === "owner-to-confirm" ? "sample-owner-to-confirm" : profile.status.bio,
    bioNote: profile.status.note,
    credentials: profile.credentials,
    links: profile.links,
    voice: [toneLine, profile.voice.pov, profile.voice.rhythm, profile.voice.vocabulary].filter((l) => l.length > 0),
    defaultWriterModel: profile.models.writing ?? defaultWriterModel,
    genres: profile.genres,
    isDemo: false,
    createdAt: profile.createdAt,
    profile,
  };
}

/* ---------- Books ---------- */

/**
 * Server stage (stepper step) to the prototype's pipeline stage. The server's names differ for three steps:
 * `titles` is `title`, `editor` is `editing` and `marketing` sits under `export`. Since D-048 the server
 * reaches `blueprint` on title choice and `editor` once writing is complete.
 */
export function toStageId(book: Pick<ApiBook, "stage" | "status">): StageId {
  if (book.status === "published") return "published";
  switch (book.stage) {
    case "titles":
      return "title";
    case "editor":
      return "editing";
    case "marketing":
      return "export";
    case "idea":
      return "idea";
    case "research":
      return "research";
    case "blueprint":
      return "blueprint";
    case "writing":
      return "writing";
    case "cover":
      return "cover";
    case "export":
      return "export";
    default:
      return "idea";
  }
}

const TEMPLATE_IDS: readonly TemplateId[] = ["nonfiction", "fiction", "workbook", "picture-book", "cookbook", "journal", "poetry"];

function toTemplateId(t: string): TemplateId {
  return TEMPLATE_IDS.find((x) => x === t) ?? "nonfiction";
}

const STAGE_LINES: Record<StageId, string> = {
  idea: "Idea saved",
  research: "Research ready",
  title: "Choosing a title",
  blueprint: "Blueprint in progress",
  writing: "Writing",
  editing: "Editing",
  cover: "Cover in progress",
  export: "Export pack",
  published: "Published",
};

function disclosureLabel(b: ApiBook): PublishedInfo["aiDisclosure"] {
  const text = b.aiDisclosure.text;
  if (text === "ai_generated" && b.aiDisclosure.images === "ai_generated") return "AI-generated text and images";
  if (text === "ai_generated") return "AI-generated text";
  return "AI-assisted";
}

/** A template count from the server, or the D-049 default when it is missing. */
function countOr(n: number | undefined, fallback: number): number {
  return typeof n === "number" && Number.isInteger(n) && n >= 0 ? n : fallback;
}

function seriesOf(settings: Obj): Book["series"] {
  const s = obj(settings["series"]);
  const name = str(s["name"]);
  return name ? { name, number: num(s["number"], 1) } : null;
}

/**
 * Server book to the prototype Book. Pass the detail response (GET /books/:id) to get word counts;
 * list rows have no totals, so `words.written` is 0 for them.
 */
export function toPrototypeBook(b: ApiBook | ApiBookDetail): Book {
  const stage = toStageId(b);
  // The web pipeline has no Marketing column: a book on the server's marketing step sits under Export with its own line.
  const line = stage === "export" && b.stage === "marketing" ? "Marketing" : STAGE_LINES[stage];
  const written = "totals" in b ? b.totals.words : 0;
  const running = "recentJobs" in b ? b.recentJobs.some((j) => j.status === "running" || j.status === "queued") : false;
  return {
    id: b.id,
    title: b.title ?? "Untitled book",
    subtitle: b.subtitle ?? "",
    penNameId: b.profileId,
    template: toTemplateId(b.template),
    stage,
    statusLine: running ? `${line}, job running` : line,
    words: { written, target: b.wordTarget ?? 0 },
    cost: { spent: b.costToDateUsd, budget: b.budgetUsd },
    trim: b.trim,
    createdAt: isoFromMs(b.createdAt),
    updatedAt: isoFromMs(b.updatedAt),
    // The server stores cover images, not the typographic CoverDesign; the screen keeps its draft cover.
    cover: null,
    attentionSteps: [],
    isDemo: false,
    archived: b.status === "archived",
    bookTypeId: b.bookTypeId ?? "",
    interiorThemeId: b.interiorThemeId ?? "",
    coverStyleId: b.coverStyleId ?? "",
    series: seriesOf(b.settings),
    published:
      b.status === "published"
        ? { publishedOn: isoFromMs(b.publishedAt), marketplace: "", formats: [], aiDisclosure: disclosureLabel(b), packVersion: 0 }
        : null,
    writingComplete: b.writingComplete === true,
    marketingCounts: { tiktok: countOr(b.marketingCounts?.tiktok, 5), instagram: countOr(b.marketingCounts?.instagram, 5) },
  };
}

/* ---------- Research ---------- */

/* ---------- Titles ---------- */

export function titleDirections(set: ApiTitleSet): ApiTitleDirection[] {
  return set.directions.map((d) => {
    const o = obj(d);
    return { key: str(o["key"]), label: str(o["label"]), angle: str(o["angle"]), audience: str(o["audience"]), promise: str(o["promise"]) };
  });
}

export function titleOptions(set: ApiTitleSet): ApiTitleOption[] {
  return set.options.map((d) => {
    const o = obj(d);
    return {
      title: str(o["title"]),
      subtitle: str(o["subtitle"]),
      direction_key: str(o["direction_key"]),
      chars: num(o["chars"]),
      valid: bool(o["valid"], true),
      issues: strings(o["issues"]),
      favourite: bool(o["favourite"], false),
    };
  });
}

/** Option ids are "<titleSetId>:<index>"; pass the index to POST /title-sets/:id/choose. */
export function toTitleOptions(set: ApiTitleSet): TitleOption[] {
  return titleOptions(set).map((o, i) => ({
    id: `${set.id}:${i}`,
    directionId: o.direction_key,
    title: o.title,
    subtitle: o.subtitle,
    checks: [
      { label: "Title and subtitle under 200 characters", passed: o.chars < 200 },
      { label: "No em dash", passed: !o.issues.some((x) => /em dash/i.test(x)) },
    ],
    chosen: set.chosenIndex === i,
    invalidReason: o.valid ? null : o.issues.join(" ") || "Breaks a title rule.",
  }));
}

/* ---------- Blueprint ---------- */

function chapterData(c: unknown): BlueprintChapterData {
  const o = obj(c);
  // Keep the planner's other keys (promise, opening_hook, story_ideas, source_ids): edits and Restore send them back.
  return {
    ...o,
    number: num(o["number"]),
    title: str(o["title"]),
    part: typeof o["part"] === "number" ? o["part"] : null,
    subheadings: strings(o["subheadings"]),
    summary: str(o["summary"]),
    word_target: num(o["word_target"], 3000),
    key_points: strings(o["key_points"]),
    takeaways: bool(o["takeaways"]),
    bridge_note: str(o["bridge_note"]),
  };
}

/** Reads a blueprint version's data with defaults, as the server's BlueprintSchema does. */
export function blueprintData(v: ApiBlueprintVersion): BlueprintData {
  const d = v.data;
  return {
    ...d,
    title: str(d["title"]),
    subtitle: str(d["subtitle"]),
    summary: str(d["summary"]),
    audience: str(d["audience"]),
    usps: strings(d["usps"]),
    tone_notes: str(d["tone_notes"]),
    hook_style: str(d["hook_style"], "question"),
    parts: Array.isArray(d["parts"]) ? d["parts"].map((p) => ({ number: num(obj(p)["number"]), title: str(obj(p)["title"]) })) : [],
    chapters: Array.isArray(d["chapters"]) ? d["chapters"].map(chapterData) : [],
    front: obj(d["front"]),
    back: obj(d["back"]),
    back_blurb: str(d["back_blurb"]),
    description_draft: str(d["description_draft"]),
    categories: strings(d["categories"]),
    keywords: strings(d["keywords"]),
  };
}

/* ---------- Writing ---------- */

/** Flattens the section tree in reading order (front, body with part children, back). */
export function flattenSections(tree: SectionTree): ApiSection[] {
  const out: ApiSection[] = [...tree.front];
  for (const node of tree.body) {
    const { children, ...section } = node;
    out.push(section, ...children);
  }
  out.push(...tree.back);
  return out;
}

/* ---------- Export ---------- */

const PREFLIGHT_AREAS: Record<string, PreflightItem["area"]> = {
  manuscript: "Manuscript",
  // Section checks on the body text, for example a chapter whose summary failed (body.summary-missing.<sectionId>).
  body: "Manuscript",
  claims: "Manuscript",
  listing: "Listing",
  metadata: "Listing",
  interior: "Interior",
  cover: "Cover",
  ebook: "eBook",
  epub: "eBook",
};

export function toPreflightItem(i: ApiPreflightItem): PreflightItem {
  return {
    id: i.id,
    area: PREFLIGHT_AREAS[i.area.toLowerCase()] ?? "Manuscript",
    label: i.message,
    result: i.severity,
    detail: i.message,
    fixLabel: i.fix?.label ?? null,
    fixRoute: i.fix?.route ?? null,
    ruleId: i.id,
  };
}

export function sizeLabel(bytes: number | null): string | null {
  if (bytes === null) return null;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/* ---------- Marketing ---------- */

/* ---------- Settings ---------- */
