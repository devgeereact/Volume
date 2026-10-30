import { describe, expect, it } from "vitest";
import { TRIMS } from "../api/types";
import { toServerTrim } from "../api/wire-a";
import { trimSizes } from "../features/new-book/wizardData";
import { TRIM_OPTIONS } from "../features/profiles/PublishingTab";
import { kdpRulesFile } from "./kdpRulesFile";
import { kdpTrims } from "./kdpTrims";

const listRule = kdpRulesFile.rules.find((r) => r.id === "paperback.trimSizes.list");
const fromRules = ((listRule?.values ?? []) as { widthIn: number; heightIn: number }[]).map((t) => `${t.widthIn} x ${t.heightIn} in`);

describe("trim sizes from the newest KDP rules file", () => {
  it("loads the newest dated file in config/kdp-rules/", () => {
    // Test only: list the files on disk (the app imports just one, so the bundle stays small).
    const names = Object.keys(import.meta.glob("@config/kdp-rules/*.json"))
      .map((p) => /(\d{4}-\d{2}-\d{2})\.json$/.exec(p)?.[1])
      .filter((v): v is string => Boolean(v))
      .sort();
    expect(names.length).toBeGreaterThan(0);
    expect(kdpRulesFile.version).toBe(names[names.length - 1]);
  });

  it("offers every rules trim, in order, in the wizard and the profile defaults", () => {
    expect(fromRules.length).toBeGreaterThan(7);
    expect(kdpTrims.map((t) => t.value)).toEqual(fromRules);
    expect(trimSizes.map((t) => t.value)).toEqual(fromRules);
    expect(TRIM_OPTIONS.map((t) => t.value)).toEqual(fromRules);
    for (const t of trimSizes) expect(t.hint.length).toBeGreaterThan(0);
  });

  it("sends every offered trim to the server as a size it accepts", () => {
    for (const label of fromRules) expect(TRIMS).toContain(toServerTrim(label));
  });
});
