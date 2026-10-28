import { describe, expect, it } from "vitest";
import { supersededFailureIds } from "./failureNotices";
import type { ApiActivityItem } from "./types";

function item(over: Partial<ApiActivityItem>): ApiActivityItem {
  return { id: "a", kind: "job_failed", at: 100, projectId: "b1", jobId: "j1", title: "Book", detail: "Research failed: no credit", live: false, ...over };
}

describe("supersededFailureIds", () => {
  it("clears a failure when a later job of the same book and stage finished", () => {
    const ids = supersededFailureIds([item({}), item({ id: "b", kind: "job_finished", at: 200, jobId: "j2", detail: "Research finished" })]);
    expect([...ids]).toEqual(["j1"]);
  });
  it("keeps a failure when the success is older", () => {
    expect(supersededFailureIds([item({ at: 300 }), item({ id: "b", kind: "job_finished", at: 200, jobId: "j2", detail: "Research finished" })]).size).toBe(0);
  });
  it("keeps a failure for a different stage or a different book", () => {
    const other = supersededFailureIds([item({}), item({ id: "b", kind: "job_finished", at: 200, jobId: "j2", detail: "Blueprint finished" })]);
    const book = supersededFailureIds([item({}), item({ id: "c", kind: "job_finished", at: 200, projectId: "b2", jobId: "j3", detail: "Research finished" })]);
    expect(other.size + book.size).toBe(0);
  });
  it("does not count 'needs attention' as success", () => {
    expect(
      supersededFailureIds([item({}), item({ id: "b", kind: "job_finished", at: 200, jobId: "j2", detail: "Research finished, needs attention" })]).size,
    ).toBe(0);
  });
});
