// N15a Wave 1 (docs/n15-one-upload-per-student-scope.md section 4): the
// ATTRIBUTION removal test and the pacing function. Pure - no render, no clock.
import { describe, expect, it } from "vitest";
import {
  EMPTY_IDENTITY_STATE,
  assignNextUploadIdentity,
  assignUploadIdentities,
  describeOneUploadStatus,
  nextDispatchWaitMs,
  projectRun,
} from "./oneUploadQueue";
import type { GradeResult } from "@/lib/grade/types";

function row(student: string): GradeResult {
  return {
    student,
    overallComment: "",
    strengths: "",
    improvements: "",
    resubmitNotice: "",
    rubricAreas: [],
    totalScore: "",
    feedback: "",
    mergedFileCount: 1,
    submittedFiles: [],
  };
}

describe("assignUploadIdentities - ATTRIBUTION", () => {
  it("two identical bases get distinct displays AND distinct ordinals", () => {
    const ids = assignUploadIdentities(["scan", "scan"]);
    expect(ids.map((i) => i.display)).toEqual(["scan", "scan (2)"]);
    expect(ids.map((i) => i.ordinal)).toEqual([1, 2]);
    expect(new Set(ids.map((i) => i.display)).size).toBe(2);
    expect(new Set(ids.map((i) => i.ordinal)).size).toBe(2);
  });

  it("stays pairwise distinct over many identical bases", () => {
    const ids = assignUploadIdentities(Array.from({ length: 12 }, () => "photo"));
    expect(new Set(ids.map((i) => i.display)).size).toBe(12);
    expect(new Set(ids.map((i) => i.ordinal)).size).toBe(12);
  });

  it("does not collide when a later base already looks like a counted suffix", () => {
    const ids = assignUploadIdentities(["scan", "scan (2)", "scan"]);
    expect(new Set(ids.map((i) => i.display)).size).toBe(3);
    expect(ids[2].display).toBe("scan (3)");
  });

  it("leaves distinct bases untouched", () => {
    expect(assignUploadIdentities(["Ada", "Grace"]).map((i) => i.display)).toEqual(["Ada", "Grace"]);
  });

  it("the batch form equals a manual left fold of the single step", () => {
    let state = EMPTY_IDENTITY_STATE;
    const folded = ["a", "a", "b", "a"].map((base) => {
      const step = assignNextUploadIdentity(state, base);
      state = step.next;
      return step.identity;
    });
    expect(folded).toEqual(assignUploadIdentities(["a", "a", "b", "a"]));
  });

  it("is immutable: a step never mutates the state it was given", () => {
    const first = assignNextUploadIdentity(EMPTY_IDENTITY_STATE, "x");
    expect(EMPTY_IDENTITY_STATE.taken.size).toBe(0);
    expect(EMPTY_IDENTITY_STATE.ordinal).toBe(0);
    assignNextUploadIdentity(first.next, "x");
    expect(first.next.taken.size).toBe(1);
    expect(first.next.ordinal).toBe(1);
  });
});

describe("nextDispatchWaitMs - PACING", () => {
  it("never waits before the first dispatch", () => {
    expect(nextDispatchWaitMs(1000, null, 4000)).toBe(0);
  });

  it("waits out the remainder of the delay", () => {
    expect(nextDispatchWaitMs(1500, 1000, 4000)).toBe(3500);
  });

  it("does not wait once the delay has elapsed", () => {
    expect(nextDispatchWaitMs(9000, 1000, 4000)).toBe(0);
  });

  it("collapses to zero when the delay is zero", () => {
    expect(nextDispatchWaitMs(1001, 1000, 0)).toBe(0);
  });

  it("every consecutive gap in a fake-clock session is at least the delay", () => {
    const delay = 4000;
    let clock = 0;
    let last: number | null = null;
    const dispatchedAt: number[] = [];
    for (let i = 0; i < 5; i += 1) {
      clock += nextDispatchWaitMs(clock, last, delay);
      dispatchedAt.push(clock);
      last = clock;
    }
    for (let i = 1; i < dispatchedAt.length; i += 1) {
      expect(dispatchedAt[i] - dispatchedAt[i - 1]).toBeGreaterThanOrEqual(delay);
    }
  });
});

describe("describeOneUploadStatus", () => {
  it("counts the uploads still grading, singular and plural", () => {
    expect(describeOneUploadStatus(1)).toContain("1 upload still grading");
    expect(describeOneUploadStatus(3)).toContain("3 uploads still grading");
  });

  it("explains the mode, including the blank-rubric asymmetry, when idle", () => {
    expect(describeOneUploadStatus(0)).toContain("A blank rubric grades against the instructions only");
  });
});

describe("projectRun", () => {
  it("projects arrived rows in sourceIndex order through the shared merge", () => {
    const run = projectRun({
      rubric: "1. Correctness",
      arrived: [
        { sourceIndex: 1, result: row("scan (2)") },
        { sourceIndex: 0, result: row("scan") },
      ],
      inFlight: false,
    });
    expect(run.results.map((r) => r.student)).toEqual(["scan", "scan (2)"]);
    expect(run.speedGraderUrl).toBeNull();
  });
});
