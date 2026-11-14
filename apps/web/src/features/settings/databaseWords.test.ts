import { describe, expect, it } from "vitest";
import { databaseWords } from "./databaseWords";

describe("databaseWords", () => {
  it("names the cPanel database for MySQL and never says this Mac", () => {
    const words = databaseWords("mysql");
    expect(words.label).toBe("MySQL on cPanel");
    expect(words.intro).toContain("cPanel");
    expect(words.intro + words.label).not.toMatch(/this mac/i);
  });

  it("names this computer for SQLite, not a Mac in particular", () => {
    const words = databaseWords("sqlite");
    expect(words.label).toBe("SQLite on this computer");
    expect(words.intro).toContain("this computer");
    expect(words.intro + words.label).not.toMatch(/this mac/i);
  });

  it("says nothing specific while the settings are loading", () => {
    expect(databaseWords(undefined).label).toBe("Loading");
  });
});
