import { describe, expect, it } from "vitest";
import { getSchema } from "@tiptap/core";
import { Node as PMNode } from "@tiptap/pm/model";
import StarterKit from "@tiptap/starter-kit";
import { blocksFromMarkdown, markdownFromBlocks } from "../api/wire-c";
import { docFromWorkbook, workbookFromDoc, workbookNodes } from "../features/editor/workbookNodes";
import { isSceneBreak, newBlockMarkdown, parseWorkbookMarkdown, serialiseWorkbook, workbookPlainText } from "./workbookMarkdown";

/* Markdown in, Markdown out unchanged (P6-5): the Editor's scene breaks and workbook blocks keep the exact
   text the writer saved, and the TipTap nodes accept every block the dialect can hold. Samples follow
   packages/export/test/fixtures/workbook-mini.md and fiction-mini.md. */

const reflection = [
  "::: exercise reflection Your Busiest Day",
  "Which day of the week feels most crowded at home, and why?",
  "",
  "::: lines 6",
  ":::",
  ":::",
].join("\n");
const checklist = [
  "::: exercise checklist Before You Start",
  "- [ ] Choose one corner to reset first",
  "- [ ] Set a ten-minute timer on your phone",
  "- [ ] Put a bag for things to give away by the door",
  ":::",
].join("\n");
const fillIn = [
  "::: exercise fill-in Your Reset Plan",
  "Fill in each line before your first reset.",
  "",
  "::: fill-in",
  "My reset day and time:",
  "The corner I will start with:",
  ":::",
  ":::",
].join("\n");
const tracker = [
  "::: exercise tracker Four-Week Reset Log",
  "Tick each week you finish a reset and note how long it took.",
  "",
  "| Week | Done | Minutes |",
  "|---|---|---|",
  "| Week 1 |  |  |",
  ":::",
].join("\n");
const scenario = [
  "::: exercise scenario A Busy Saturday",
  "Sam planned a reset for Saturday morning, but friends arrived early.",
  "",
  "- What could Sam do instead of skipping the week?",
  "- What would you do in the same place?",
  "",
  "::: lines 4",
  ":::",
  ":::",
].join("\n");
const fillPage = ["::: fill-in page", "My goal for the next four weeks:", "The first corner I will reset:", ":::"].join("\n");
const unclosedLines = "::: lines 8";
const topChecklist = "- [ ] Eat before the shift\n- [ ] Pack a snack";

const samples = { reflection, checklist, fillIn, tracker, scenario, fillPage, unclosedLines, topChecklist };

const schema = getSchema([
  StarterKit.configure({
    heading: false,
    bulletList: false,
    orderedList: false,
    listItem: false,
    listKeymap: false,
    blockquote: false,
    codeBlock: false,
    horizontalRule: false,
    hardBreak: false,
  }),
  ...workbookNodes,
]);

describe("workbook blocks round trip", () => {
  for (const [name, md] of Object.entries(samples)) {
    it(`${name}: Markdown, nodes, Markdown is unchanged`, () => {
      expect(serialiseWorkbook(parseWorkbookMarkdown(md))).toBe(md);
    });
    it(`${name}: TipTap JSON is valid for the schema and round trips`, () => {
      const json = docFromWorkbook(parseWorkbookMarkdown(md));
      const node = PMNode.fromJSON(schema, json);
      expect(() => node.check()).not.toThrow();
      expect(serialiseWorkbook(workbookFromDoc(node.toJSON() as Parameters<typeof workbookFromDoc>[0]))).toBe(md);
    });
  }

  it("every block the Insert menu adds parses and validates", () => {
    for (const md of [
      newBlockMarkdown("exercise", "reflection"),
      newBlockMarkdown("exercise", "checklist"),
      newBlockMarkdown("exercise", "fill-in"),
      newBlockMarkdown("exercise", "tracker"),
      newBlockMarkdown("exercise", "scenario"),
      newBlockMarkdown("lines"),
      newBlockMarkdown("fill-in"),
      newBlockMarkdown("checklist"),
    ]) {
      const nodes = parseWorkbookMarkdown(md);
      expect(serialiseWorkbook(nodes)).toBe(md);
      expect(() => PMNode.fromJSON(schema, docFromWorkbook(nodes)).check()).not.toThrow();
    }
  });

  it("an exercise's details change only its opening line", () => {
    const nodes = parseWorkbookMarkdown(reflection);
    const ex = nodes[0];
    if (ex?.type !== "exercise") throw new Error("expected an exercise");
    const next = serialiseWorkbook([
      { ...ex, kind: "scenario", title: "A Hard Night", children: ex.children.map((c) => (c.type === "lines" ? { ...c, count: 10 } : c)) },
    ]);
    expect(next).toBe(reflection.replace("reflection Your Busiest Day", "scenario A Hard Night").replace("lines 6", "lines 10"));
  });

  it("plain text leaves out fences and tick boxes", () => {
    expect(workbookPlainText(checklist)).toBe(
      ["Before You Start", "Choose one corner to reset first", "Set a ten-minute timer on your phone", "Put a bag for things to give away by the door"].join(
        "\n",
      ),
    );
  });
});

describe("section text in the Editor", () => {
  const body = [
    "Before you change anything, look at what you already do.",
    "## Notice Your Week",
    "Most homes have one day that goes wrong.",
    reflection,
    checklist,
    "::: takeaways\n- Look at your week before you change it.\n:::",
    fillPage,
  ].join("\n\n");

  it("keeps a workbook chapter byte for byte", () => {
    const blocks = blocksFromMarkdown(body, "t");
    expect(blocks.map((b) => b.kind)).toEqual(["p", "h", "p", "workbook", "workbook", "p", "workbook"]);
    expect(markdownFromBlocks(blocks)).toBe(body);
  });

  it("reads both scene break spellings and keeps each as written", () => {
    const fiction = "Mara counted the clicks.\n\n* * *\n\nInside, the vault was empty.\n\n***\n\nShe looked at Okafor.";
    const blocks = blocksFromMarkdown(fiction, "f");
    expect(blocks.map((b) => b.kind)).toEqual(["p", "scene", "p", "scene", "p"]);
    expect(markdownFromBlocks(blocks)).toBe(fiction);
    expect(isSceneBreak("*  *  *")).toBe(true);
    expect(isSceneBreak("**")).toBe(false);
  });

  it("an exercise with blank lines inside stays one block", () => {
    const blocks = blocksFromMarkdown(scenario, "s");
    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.text).toBe(scenario);
  });
});
