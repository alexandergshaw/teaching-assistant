import { describe, it, expect } from "vitest";
import { buildSnapshotClassTrendsEntry, snapshotCohortSpread } from "./classTrendsSnapshotEntry";
import { hasTrendableResults } from "../grading-results/classTrendsEntry";
import type { SnapshotAssessmentRow } from "./snapshot-row";

function makeReadyRow(overrides: Partial<SnapshotAssessmentRow> = {}): SnapshotAssessmentRow {
  return {
    id: "snap-row-1",
    studentName: "Priya N.",
    state: "ready",
    error: "",
    userEdited: false,
    totalScore: "8/10",
    strengths: "Clear thesis.",
    improvements: "Cite the rubric line.",
    overallComment: "Solid work overall.",
    shotReports: [],
    rubricAreas: [
      {
        area: "Clarity",
        score: "4/5",
        quote: "As I see it, the thesis is stated plainly in paragraph one.",
        shotIndex: 1,
        source: "shot",
        verified: true,
        shotId: "shot-id-1",
      },
    ],
    missingRoles: [],
    instructionLikeContent: false,
    evidenceDropped: false,
    strengthsNotice: "",
    cohortKey: "abc123",
    ...overrides,
  };
}

const META = { courseName: "Intro Bio", assignmentName: "Lab 3", canvasUrl: "" };

describe("buildSnapshotClassTrendsEntry", () => {
  it("carries the caller's own meta by reference-equal fields, unchanged", () => {
    const entry = buildSnapshotClassTrendsEntry([makeReadyRow()], META);
    expect(entry.courseName).toBe("Intro Bio");
    expect(entry.assignmentName).toBe("Lab 3");
    expect(entry.canvasUrl).toBe("");
  });

  it("omits non-ready rows entirely, never emitting a fabricated GradedResult for them", () => {
    const rows = [
      makeReadyRow({ id: "a" }),
      makeReadyRow({ id: "b", state: "pending" }),
      makeReadyRow({ id: "c", state: "failed" }),
    ];
    const entry = buildSnapshotClassTrendsEntry(rows, META);
    expect(entry.run.results).toHaveLength(1);
  });

  it("R-A24-1: rubricAreas[].comment is filled from the evidence quote, never left as a silent ''", () => {
    const row = makeReadyRow({
      rubricAreas: [
        {
          area: "Evidence",
          score: "3/5",
          quote: "The second paragraph cites the source directly.",
          shotIndex: 2,
          source: "shot",
          verified: true,
          shotId: "shot-id-2",
        },
      ],
    });
    const entry = buildSnapshotClassTrendsEntry([row], META);
    const result = entry.run.results[0];
    expect(result.ungraded).toBeUndefined();
    if (!result.ungraded) {
      expect(result.rubricAreas).toEqual([
        { area: "Evidence", score: "3/5", comment: "The second paragraph cites the source directly." },
      ]);
    }
  });

  it("reuses hasTrendableResults directly - a graded row with a rubric area makes it true", () => {
    const entry = buildSnapshotClassTrendsEntry([makeReadyRow()], META);
    expect(hasTrendableResults(entry)).toBe(true);
  });

  it("hasTrendableResults is false when no row has a rubric area yet", () => {
    const entry = buildSnapshotClassTrendsEntry([makeReadyRow({ rubricAreas: [] })], META);
    expect(hasTrendableResults(entry)).toBe(false);
  });
});

describe("snapshotCohortSpread", () => {
  it("is false for a single ready row", () => {
    expect(snapshotCohortSpread([makeReadyRow()])).toBe(false);
  });

  it("is false when every ready row shares the same cohort key", () => {
    const rows = [makeReadyRow({ id: "a" }), makeReadyRow({ id: "b" })];
    expect(snapshotCohortSpread(rows)).toBe(false);
  });

  it("is true when ready rows carry two distinct cohort keys", () => {
    const rows = [makeReadyRow({ id: "a", cohortKey: "key-1" }), makeReadyRow({ id: "b", cohortKey: "key-2" })];
    expect(snapshotCohortSpread(rows)).toBe(true);
  });

  it("counts a missing cohortKey (undefined) as its own distinct value from a real key, matching cohortLabelSpread's undefined convention", () => {
    const rows = [
      makeReadyRow({ id: "a", cohortKey: undefined }),
      makeReadyRow({ id: "b", cohortKey: "key-1" }),
    ];
    expect(snapshotCohortSpread(rows)).toBe(true);
  });

  it("counts a missing cohortKey (undefined) as identical to an explicit '' - both normalize to the same bucket", () => {
    const rows = [makeReadyRow({ id: "a", cohortKey: undefined }), makeReadyRow({ id: "b", cohortKey: "" })];
    expect(snapshotCohortSpread(rows)).toBe(false);
  });

  it("ignores non-ready rows when computing spread", () => {
    const rows = [
      makeReadyRow({ id: "a", cohortKey: "key-1" }),
      makeReadyRow({ id: "b", cohortKey: "key-2", state: "pending" }),
    ];
    expect(snapshotCohortSpread(rows)).toBe(false);
  });
});
