import rulesFile from "@config/kdp-rules/2026-10-29.json";

/* The newest dated KDP rules file in config/kdp-rules/, the one the server's loadKdpRules picks (AGENTS.md rule 7).
   It is the only place in the web app that names a rules date: the cover studio, the New book wizard, the profile
   trim defaults, spreads and Export all read the rules from here. One static import keeps the older files out of
   the bundle; kdpTrims.test.ts fails when a newer file exists in config/kdp-rules/ and this import is not moved. */

export interface KdpRulesFile {
  version: string;
  verifiedOn: string;
  recheckDue: string;
  rules: { id: string; [key: string]: unknown }[];
  [key: string]: unknown;
}

export const kdpRulesFile: KdpRulesFile = rulesFile;
