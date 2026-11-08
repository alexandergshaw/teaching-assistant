import { describe, expect, it } from "vitest";
import type { GradeResult } from "@/lib/grade/types";
import { projectVersionedResults } from "./versionedResultProjection";

function grade(student: string, score: string): GradeResult {
  return { student, totalScore: score, strengths: "", improvements: "", resubmitNotice: "", overallComment: "", feedback: "", rubricAreas: [{ area: "Correctness", score, comment: `Feedback ${score}` }], mergedFileCount: 0, submittedFiles: [] };
}

describe("version-aware raw result projection", () => {
  it("keeps same-named criteria and their scores with the version that produced each row", () => {
    const old = grade("Ada", "4/5"), newer = grade("Bea", "8/10");
    const rows = projectVersionedResults([{ sourceIndex: 1, resultRevision: 1, setupVersion: 2, result: newer }, { sourceIndex: 0, resultRevision: 1, setupVersion: 1, result: old }], new Set([1, 2]));
    expect(rows.map((row) => [row.sourceIndex, row.setupVersion, row.areas[0].score, row.areas[0].comment])).toEqual([[0, 1, "4/5", "Feedback 4/5"], [1, 2, "8/10", "Feedback 8/10"]]);
    expect(rows[0].areas[0]).not.toBe(old.rubricAreas[0]);
  });
  it("keeps repeated areas, labels missing or invalid provenance unknown, and uses the latest arrival", () => {
    const first = grade("Ada", "1/5"), next = grade("Ada", "2/5");
    next.rubricAreas.push({ area: "Correctness", score: "1/1", comment: "Second occurrence" });
    const [row] = projectVersionedResults([{ sourceIndex: 0, resultRevision: 2, setupVersion: 3, result: next }, { sourceIndex: 0, resultRevision: 1, setupVersion: 1, result: first }], new Set([1, 2]));
    expect(row.setupVersion).toBeNull();
    expect(row.areas.map((area) => area.score)).toEqual(["2/5", "1/1"]);
    expect(() => projectVersionedResults([{ sourceIndex: -1, resultRevision: 1, setupVersion: 1, result: next }], new Set())).toThrow("Invalid result identity.");
    expect(() => projectVersionedResults([{ sourceIndex: 0, resultRevision: 1, setupVersion: 1, result: first }, { sourceIndex: 0, resultRevision: 1, setupVersion: 2, result: next }], new Set([1, 2]))).toThrow("Duplicate result revision.");
  });
});
