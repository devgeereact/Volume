import { describe, expect, it } from "vitest";
import { mergeRunChildren, nextRunPeak, runLineFromChildren, runProgressFromChildren, runSteps, type RunChild, type RunPeak } from "./model";

const story = (status: string, progress = 0, message?: string): RunChild => ({ id: "s", kind: "picture_story", status, progress, message });

describe("picture-book run progress", () => {
  it("never goes down across a whole mock run, even when steps are added", () => {
    const snapshots: RunChild[][] = [
      [],
      [story("running", 0.5, "Writing the scene prompts")],
      [story("succeeded", 1), { id: "c", kind: "picture_characters", status: "running", progress: 0.1 }],
      [
        story("succeeded", 1),
        { id: "c", kind: "picture_characters", status: "succeeded", progress: 1 },
        { id: "p1", kind: "spread_image", status: "queued", progress: 0 },
      ],
      [
        story("succeeded", 1),
        { id: "c", kind: "picture_characters", status: "succeeded", progress: 1 },
        { id: "p1", kind: "spread_image", status: "succeeded", progress: 1 },
        { id: "p2", kind: "spread_image", status: "running", progress: 0.2 },
      ],
    ];
    let peak: RunPeak = { runId: null, value: 0 };
    const shown: number[] = [];
    for (const children of snapshots) {
      peak = nextRunPeak(peak, "run-1", runProgressFromChildren(children));
      shown.push(peak.value);
    }
    for (let i = 1; i < shown.length; i++) expect(shown[i]).toBeGreaterThanOrEqual(shown[i - 1] ?? 0);
    expect(shown.at(-1)).toBeCloseTo(0.8);
  });

  it("holds the peak when a raw value drops, and starts again for a new run", () => {
    const p1 = nextRunPeak({ runId: null, value: 0 }, "a", 0.5);
    expect(nextRunPeak(p1, "a", 0.17)).toBe(p1);
    expect(nextRunPeak(p1, "b", 0.1)).toEqual({ runId: "b", value: 0.1 });
  });

  it("moves the steps and the line from live events before the record lists the children", () => {
    const merged = mergeRunChildren([], [story("running", 0.1, "Writing the story")]);
    expect(runSteps(merged).map((s) => s.state)).toEqual(["running", "queued", "queued"]);
    expect(runLineFromChildren(merged)).toBe("Writing the story");
  });

  it("keeps an ended status from the record and the higher progress", () => {
    const merged = mergeRunChildren([story("succeeded", 1)], [story("running", 0.6)]);
    expect(merged[0]?.status).toBe("succeeded");
    expect(merged[0]?.progress).toBe(1);
    const newer = mergeRunChildren([story("queued", 0)], [story("running", 0.3)]);
    expect(newer[0]?.status).toBe("running");
  });

  it("names the running step when it has no message", () => {
    expect(runLineFromChildren([{ id: "c", kind: "picture_characters", status: "running", progress: 0 }])).toBe("Character references");
    expect(runLineFromChildren([])).toBeNull();
  });
});
