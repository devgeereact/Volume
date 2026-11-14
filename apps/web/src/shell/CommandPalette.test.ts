import { describe, expect, it, vi } from "vitest";
import { writingJobCommand } from "./CommandPalette";

const demoJob = { running: true, paused: false, job: { label: "Writing Handover" }, pause: vi.fn(), resume: vi.fn() };

describe("writingJobCommand", () => {
  it("offers nothing in live mode, where the only writing job is the sample one", () => {
    expect(writingJobCommand(demoJob, true)).toBeNull();
  });

  it("offers Pause writing for the sample job in demo mode", () => {
    const command = writingJobCommand(demoJob, false);
    expect(command?.label).toBe("Pause writing");
    expect(command?.hint).toBe("Handover");
  });

  it("offers Resume writing when the sample job is paused", () => {
    expect(writingJobCommand({ ...demoJob, paused: true }, false)?.label).toBe("Resume writing");
  });

  it("offers nothing when no sample job is running", () => {
    expect(writingJobCommand({ ...demoJob, running: false }, false)).toBeNull();
  });
});
