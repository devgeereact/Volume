import { TITLE_SUBTITLE_MAX, titleLength, type TitleCheck, type TitleOption } from "../../data";

/* Screen-local mock data and checks for Titles (The Calm Ward). The shared data has each direction's
   name and pitch; the cards here also need who it is for and why it works. The checks mirror the
   app's title check (config/kdp-rules listing.titleSubtitle.maxChars and config/house-style.json)
   with a short subset of the house-style lists, enough for the prototype. */

export const directionDetails: Record<string, { why: string; readers: string }> = {
  "dir-skill": {
    why: "Matches the research angle that calm is everyday craft, so the promise feels practical rather than heroic.",
    readers: "Ward nurses and students who want words to use on the next shift",
  },
  "dir-safety": {
    why: "Fills the gap the research found: staff wellbeing and patient dignity are rarely treated together.",
    readers: "Nurses and healthcare assistants who feel unsafe at work",
  },
  "dir-night": {
    why: "A strong scene to open with, and night staff are a large, under-served group of readers.",
    readers: "Night staff on adult wards and in the emergency department",
  },
  "dir-leader": {
    why: "Ward leaders buy books for their teams and run the teaching, so one sale can reach a ward.",
    readers: "Charge nurses, ward managers and practice educators",
  },
  "dir-compassion": {
    why: "Speaks to why most readers came into nursing, which suits Harni Muharami's warm voice.",
    readers: "Nurses early in their careers and those feeling worn down",
  },
};

const pass: TitleCheck[] = [
  { label: "Under 200 characters", passed: true },
  { label: "British spelling", passed: true },
  { label: "No banned phrases", passed: true },
];

/** New options the writer returns for "More like this" and "Regenerate all", two per direction. */
export const alternates: TitleOption[] = [
  {
    id: "a-1",
    directionId: "dir-skill",
    title: "Calm Is a Skill",
    subtitle: "Everyday De-escalation for Nurses and Their Teams",
    checks: pass,
    chosen: false,
    invalidReason: null,
  },
  {
    id: "a-2",
    directionId: "dir-skill",
    title: "The Quiet Word",
    subtitle: "Practical De-escalation for Busy NHS Wards",
    checks: pass,
    chosen: false,
    invalidReason: null,
  },
  {
    id: "a-3",
    directionId: "dir-safety",
    title: "Safe Hands, Safe Hearts",
    subtitle: "Protecting Staff and Patients When Tension Rises",
    checks: pass,
    chosen: false,
    invalidReason: null,
  },
  {
    id: "a-4",
    directionId: "dir-safety",
    title: "No One Gets Hurt",
    subtitle: "A Nurse's Guide to Safer, Calmer Wards",
    checks: pass,
    chosen: false,
    invalidReason: null,
  },
  {
    id: "a-5",
    directionId: "dir-night",
    title: "After Midnight on the Ward",
    subtitle: "Calm Words for the Hardest Hours of the Shift",
    checks: pass,
    chosen: false,
    invalidReason: null,
  },
  {
    id: "a-6",
    directionId: "dir-night",
    title: "The Long Night",
    subtitle: "De-escalation and Care Between Midnight and Eight",
    checks: pass,
    chosen: false,
    invalidReason: null,
  },
  {
    id: "a-7",
    directionId: "dir-leader",
    title: "Setting the Tone",
    subtitle: "How Ward Leaders Build Calm Into Every Shift",
    checks: pass,
    chosen: false,
    invalidReason: null,
  },
  {
    id: "a-8",
    directionId: "dir-leader",
    title: "The Steady Ward",
    subtitle: "Leadership for Calmer Teams in NHS Nursing",
    checks: pass,
    chosen: false,
    invalidReason: null,
  },
  {
    id: "a-9",
    directionId: "dir-compassion",
    title: "Kind and Firm",
    subtitle: "Compassionate Boundaries for Nurses Under Pressure",
    checks: pass,
    chosen: false,
    invalidReason: null,
  },
  {
    id: "a-10",
    directionId: "dir-compassion",
    title: "Why We Stay Kind",
    subtitle: "Compassion and Calm in Everyday Ward Nursing",
    checks: pass,
    chosen: false,
    invalidReason: null,
  },
];

/* A subset of config/house-style.json for the prototype. The app checks the whole list. */
const banned = [
  "navigate",
  "journey",
  "unlock",
  "ultimate",
  "secrets",
  "tapestry",
  "delve",
  "transformative",
  "embark",
  "game changer",
  "realm",
  "unleash",
  "elevate",
  "empower",
];
const usSpellings: Record<string, string> = {
  behavior: "behaviour",
  color: "colour",
  favorite: "favourite",
  honor: "honour",
  center: "centre",
  organize: "organise",
  program: "programme",
  practicing: "practising",
};

/** Run the title check on a title and subtitle: length, British spelling and banned phrases. */
export function checkTitle(title: string, subtitle: string): { checks: TitleCheck[]; invalidReason: string | null } {
  const text = `${title} ${subtitle}`.toLowerCase();
  const length = titleLength(title.trim(), subtitle.trim());
  const ban = banned.find((b) => new RegExp(`\\b${b}`, "i").test(text));
  const us = Object.keys(usSpellings).find((w) => new RegExp(`\\b${w}`, "i").test(text));
  const checks: TitleCheck[] = [
    { label: "Under 200 characters", passed: length <= TITLE_SUBTITLE_MAX },
    { label: "British spelling", passed: !us },
    { label: "No banned phrases", passed: !ban },
  ];
  let invalidReason: string | null = null;
  if (!title.trim()) invalidReason = "The main title is empty. Add a title.";
  else if (length > TITLE_SUBTITLE_MAX) invalidReason = `Title and subtitle are ${length} characters. Keep them under 200.`;
  else if (ban) invalidReason = `Uses a banned phrase: ${ban}. Edit the title or pick another.`;
  else if (us && usSpellings[us]) invalidReason = `Uses US spelling: ${us}. Use ${usSpellings[us]}.`;
  return { checks, invalidReason };
}
