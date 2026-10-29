import { listing, rule } from "../features/export/kdpRules";
import type { TitleCheck, TitleOption, TopicDirection } from "./types";

/* Five topic directions and ten title options for The Calm Ward. The KDP limit for title and
   subtitle together is read from config/kdp-rules (listing.titleSubtitle.maxChars), never typed in. */

const titleRule = rule("listing.titleSubtitle.maxChars");
/** The most characters KDP allows for the title and subtitle together. */
export const TITLE_SUBTITLE_MAX = listing.titleMax;
/** The KDP facts file entry the limit comes from (for example "5.4"), or null. */
export const TITLE_SUBTITLE_FACT: string | null = titleRule.factId;

export const topicDirections: TopicDirection[] = [
  { id: "dir-skill", name: "Calm as a skill", pitch: "De-escalation as everyday craft a whole team can practise." },
  { id: "dir-safety", name: "Safety for everyone", pitch: "Staff wellbeing and patient dignity treated as one goal." },
  { id: "dir-night", name: "The night shift", pitch: "Told from the nurses' station between midnight and eight." },
  { id: "dir-leader", name: "The ward leader", pitch: "For charge nurses and managers shaping a calmer ward." },
  { id: "dir-compassion", name: "Compassion first", pitch: "Kindness as the most practical tool on a hard shift." },
];

const passing: TitleCheck[] = [
  { label: "Under 200 characters", passed: true },
  { label: "British spelling", passed: true },
  { label: "No banned phrases", passed: true },
];

/** Title and subtitle length as KDP counts it (joined with a colon and a space). */
export function titleLength(title: string, subtitle: string): number {
  return subtitle ? `${title}: ${subtitle}`.length : title.length;
}

export const titleOptions: TitleOption[] = [
  {
    id: "t-1",
    directionId: "dir-skill",
    title: "The Calm Ward",
    subtitle: "De-escalation and Compassion in NHS Practice",
    checks: passing,
    chosen: true,
    invalidReason: null,
  },
  {
    id: "t-2",
    directionId: "dir-skill",
    title: "Steady Hands, Steady Words",
    subtitle: "A Nurse's Guide to De-escalation on Busy Wards",
    checks: passing,
    chosen: false,
    invalidReason: null,
  },
  {
    id: "t-3",
    directionId: "dir-safety",
    title: "Safe on Shift",
    subtitle: "Preventing Aggression and Protecting Staff on NHS Wards",
    checks: passing,
    chosen: false,
    invalidReason: null,
  },
  {
    id: "t-4",
    directionId: "dir-safety",
    title: "Both Sides of the Bed",
    subtitle: "Calmer Care for Patients, Relatives and the Team",
    checks: passing,
    chosen: false,
    invalidReason: null,
  },
  {
    id: "t-5",
    directionId: "dir-night",
    title: "Three in the Morning",
    subtitle: "De-escalation Lessons from the Nurses' Station",
    checks: passing,
    chosen: false,
    invalidReason: null,
  },
  {
    id: "t-6",
    directionId: "dir-night",
    title: "Navigate the Night",
    subtitle: "Handling Conflict on Night Shifts",
    checks: [
      { label: "Under 200 characters", passed: true },
      { label: "British spelling", passed: true },
      { label: "No banned phrases", passed: false },
    ],
    chosen: false,
    invalidReason: "Uses a banned phrase: navigate. Edit the title or pick another.",
  },
  {
    id: "t-7",
    directionId: "dir-leader",
    title: "Leading the Calm Ward",
    subtitle: "How Charge Nurses Build Safer, Kinder Shifts",
    checks: passing,
    chosen: false,
    invalidReason: null,
  },
  {
    id: "t-8",
    directionId: "dir-leader",
    title: "The Charge Nurse's Calm",
    subtitle: "Practical Leadership for Tense Moments on the Ward",
    checks: passing,
    chosen: false,
    invalidReason: null,
  },
  {
    id: "t-9",
    directionId: "dir-compassion",
    title: "Kindness Under Pressure",
    subtitle: "Compassionate De-escalation for Nurses and Healthcare Assistants",
    checks: passing,
    chosen: false,
    invalidReason: null,
  },
  {
    id: "t-10",
    directionId: "dir-compassion",
    title: "Gentle Words, Safe Wards",
    subtitle: "Compassion as a Clinical Skill in Everyday NHS Nursing",
    checks: passing,
    chosen: false,
    invalidReason: null,
  },
];
