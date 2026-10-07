import type { ResearchRun } from "./types";

/* Research run for The Calm Ward. The six sources are mock: organisation names are plausible
   examples, labelled "example source", and every link points at example.org. In phase 2 sources
   arrive only from OpenRouter url_citation annotations (config/models.defaults.json, webSearch.rule). */

export const calmWardResearch: ResearchRun = {
  id: "research-calm-ward-1",
  bookId: "the-calm-ward",
  at: "2026-10-04T10:52:00+01:00",
  model: "~google/gemini-pro-latest",
  costUsd: 0.31,
  status: "done",
  liveStatus: ["Searching the web", "Reading 6 sources", "Grouping problems and angles", "Checking keyword ideas", "Done. 6 sources kept."],
  audience:
    "Nurses, nursing associates and healthcare assistants on adult wards and in emergency departments, plus the ward managers and educators who teach them. Most read on breaks or at home after a shift, so chapters need to be short to pick up and easy to act on.",
  problems: [
    "Tension builds with relatives who have waited a long time for news",
    "Staff feel they were never taught what to say in the first minute",
    "Incivility between colleagues is rarely named until it is serious",
    "After an incident, support for staff is patchy and often late",
    "Training feels distant from what a real night shift is like",
  ],
  angles: [
    { title: "Calm is a skill a team can practise", detail: "Frame de-escalation as everyday craft, like handover or a drug round, not a special event." },
    { title: "The nurse's view from the station", detail: "Open each chapter with a scene a ward nurse will recognise, then slow it down." },
    { title: "Safety for staff and patients together", detail: "Treat staff wellbeing and patient dignity as one goal rather than a trade-off." },
    { title: "Small changes, no budget", detail: "Lead with changes a team can make this week without asking for money." },
  ],
  competingThemes: [
    "Conflict resolution handbooks written for general workplaces",
    "Mandatory training manuals focused on policy and forms",
    "Mental health nursing texts that assume a specialist setting",
  ],
  gaps: [
    "Few books written in a ward nurse's own voice",
    "Little on incivility between colleagues alongside patient aggression",
    "Post-incident support is usually a short appendix, not a chapter",
  ],
  keywordIdeas: [
    "de-escalation for nurses",
    "aggression on hospital wards",
    "NHS communication skills",
    "psychological safety nursing",
    "ward leadership",
    "conflict in healthcare teams",
    "nurse wellbeing",
  ],
  sources: [
    {
      id: "src-1",
      title: "Violence prevention and reduction standard (example source)",
      publisher: "NHS England (example source)",
      domain: "nhs-england.example.org",
      url: "https://nhs-england.example.org/mock/violence-prevention-standard",
      mock: true,
      summary: "Organisation-wide expectations for preventing and reducing violence against staff.",
      useInBook: true,
    },
    {
      id: "src-2",
      title: "Managing violence and aggression in health settings (example source)",
      publisher: "Royal College of Nursing (example source)",
      domain: "rcn.example.org",
      url: "https://rcn.example.org/mock/violence-and-aggression",
      mock: true,
      summary: "Practical guidance for nursing staff on prevention, response and reporting.",
      useInBook: true,
    },
    {
      id: "src-3",
      title: "Violence and aggression: short-term management (example source)",
      publisher: "NICE (example source)",
      domain: "nice.example.org",
      url: "https://nice.example.org/mock/short-term-management",
      mock: true,
      summary: "Clinical guideline covering de-escalation, restrictive interventions and rapid tranquilisation.",
      useInBook: true,
    },
    {
      id: "src-4",
      title: "Mental Capacity Act code of practice (example source)",
      publisher: "UK Government (example source)",
      domain: "gov-uk.example.org",
      url: "https://gov-uk.example.org/mock/mental-capacity-act-code",
      mock: true,
      summary: "How the Act applies to decisions made for people who lack capacity, including restraint.",
      useInBook: true,
    },
    {
      id: "src-5",
      title: "Work-related violence (example source)",
      publisher: "Health and Safety Executive (example source)",
      domain: "hse.example.org",
      url: "https://hse.example.org/mock/work-related-violence",
      mock: true,
      summary: "Employer duties and risk assessment for violence at work.",
      useInBook: false,
    },
    {
      id: "src-6",
      title: "Psychological safety in healthcare teams (example source)",
      publisher: "The King's Fund (example source)",
      domain: "kingsfund.example.org",
      url: "https://kingsfund.example.org/mock/psychological-safety",
      mock: true,
      summary: "How team culture affects speaking up, learning and staff wellbeing.",
      useInBook: true,
    },
  ],
};

/** Live status lines for a run in progress (Night Shift Survival), as the SSE stream would send them. */
export const nightShiftResearchStatus: string[] = ["Searching the web", "Found 18 cited sources", "Reading 6 of 18 sources"];
