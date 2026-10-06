import { DEMO_NOW } from "../../data/books";
import type { ProfileDraft } from "./profileStore";

/* Validation and template rendering for the Profile editor (docs/01-PRD.md M1). */

export type EditorTab = "identity" | "voice" | "publishing" | "models" | "memory";

export interface FieldError {
  field: string;
  tab: EditorTab;
  label: string;
  message: string;
}

export const SAMPLE_MAX_WORDS = 1500;
export const SAMPLE_MAX_COUNT = 10;
export const SHORT_BIO_MAX_WORDS = 60;

/** The demo's publication year: books published now print 2026. */
export const PREVIEW_YEAR = new Date(DEMO_NOW).getFullYear();

export function wordCount(s: string): number {
  return s.trim() ? s.trim().split(/\s+/).length : 0;
}

const FIXED_YEAR = /\b(19|20)\d{2}\b/;
const FIRST_PERSON = /\b(I|I'm|I’m|I've|I’ve|me|my|myself)\b/;

export function validateProfile(p: ProfileDraft, otherNames: string[]): FieldError[] {
  const errors: FieldError[] = [];
  const name = p.name.trim();
  if (!name) errors.push({ field: "name", tab: "identity", label: "Name on the book", message: "Add the name. It prints on the cover and title page." });
  else if (otherNames.some((n) => n.toLowerCase() === name.toLowerCase()))
    errors.push({ field: "name", tab: "identity", label: "Name on the book", message: "Another profile already uses this name." });
  if (FIRST_PERSON.test(p.bio))
    errors.push({
      field: "bio",
      tab: "identity",
      label: "Bio",
      message: `Write the bio in the third person, for example “${name.split(" ")[0] || "Harni"} writes…”. About the Author prints it word for word.`,
    });
  if (wordCount(p.shortBio) > SHORT_BIO_MAX_WORDS)
    errors.push({ field: "shortBio", tab: "identity", label: "Short bio", message: `Keep the short bio to ${SHORT_BIO_MAX_WORDS} words or fewer.` });
  p.links.forEach((l, i) => {
    if (!l.label.trim() || !l.value.trim())
      errors.push({ field: `link-${i}`, tab: "identity", label: `Link ${i + 1}`, message: "Add both a label and a link, or remove the row." });
  });
  p.voice.samples.forEach((s, i) => {
    if (wordCount(s.text) > SAMPLE_MAX_WORDS)
      errors.push({
        field: `sample-${s.id}`,
        tab: "voice",
        label: `Sample ${i + 1}`,
        message: `Samples can be up to ${SAMPLE_MAX_WORDS.toLocaleString("en-GB")} words. Split this one in two.`,
      });
  });
  const templates: [string, string, string][] = [
    ["copyright", "Copyright page", p.publishing.copyright],
    ["disclaimer", "Disclaimer", p.publishing.disclaimer],
    ["illustrativeLine", "Illustrative line", p.publishing.illustrativeLine],
  ];
  for (const [field, label, text] of templates) {
    if (FIXED_YEAR.test(text)) errors.push({ field, tab: "publishing", label, message: "Use {year} instead of a fixed year." });
  }
  return errors;
}

export function errorFor(errors: FieldError[], field: string): string | undefined {
  return errors.find((e) => e.field === field)?.message;
}

/** The name the copyright line prints: the copyright name, or the pen name when that is empty. */
export function copyrightHolder(p: ProfileDraft): string {
  return p.publishing.copyrightName.trim() || p.name.trim() || "Your pen name";
}

/** Renders a template as it will print for a sample book. {isbn_line} is removed when there is no ISBN. */
export function renderTemplate(template: string, p: ProfileDraft, title: string): string[] {
  const text = template
    .replaceAll("{year}", String(PREVIEW_YEAR))
    .replaceAll("{name}", copyrightHolder(p))
    .replaceAll("{pen_name}", p.name.trim() || "Your pen name")
    .replaceAll("{title}", title)
    .replaceAll("{edition}", "First edition")
    .replaceAll("{isbn_line}", "");
  return text
    .split(/\n\s*\n/)
    .map((para) =>
      para
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean)
        .join("\n"),
    )
    .filter(Boolean);
}

/** Placeholders the copyright template takes (config/profiles/README.md: {year} and {name}). */
export const PLACEHOLDERS = ["{year}", "{name}", "{title}"] as const;
