import { describe, expect, it } from "vitest";
import type { GradeResult } from "@/lib/grade/types";
import { applyRepositoryProposalFields, repositoryEditSignature } from "./repositoryProposalEdits";
import type { RowEdit } from "./gradingResultsHelpers";
const prior: GradeResult = { student: "Sam", totalScore: "6/10", strengths: "machine strength", improvements: "machine improvement", resubmitNotice: "", overallComment: "machine strength machine improvement", feedback: "old feedback", rubricAreas: [{ area: "Correctness", score: "4/6", comment: "original correctness" }, { area: "Style", score: "2/4", comment: "original style" }], mergedFileCount: 1, submittedFiles: [] };
const proposed: GradeResult = { ...prior, totalScore: "9/10", strengths: "new strength", improvements: "new improvement", rubricAreas: [{ area: "Correctness", score: "6/6", comment: "Credit [evidence:repo-main]" }, { area: "Style", score: "3/4", comment: "Style [evidence:repo-main]" }] };
const edit: RowEdit = { total: "7/10", overall: "manual strength manual improvement", strengths: "manual strength", improvements: "manual improvement", resubmitNotice: "", areas: { Correctness: { score: "5/6" }, Style: { score: "2/4" } } };
describe("repository field adoption", () => {
  it("defaults unspecified values to current edits and changes only explicitly selected score/rationale/feedback", () => {
    const original = structuredClone(edit);
    const result = applyRepositoryProposalFields(edit, prior, proposed, { criteria: ["Correctness"], feedback: ["strengths"] });
    expect(edit).toEqual(original);
    expect(result.edit).toEqual({ total: "7/10", strengths: "new strength", improvements: "manual improvement", resubmitNotice: "", overall: "new strength manual improvement", areas: { Correctness: { score: "6/6" }, Style: { score: "2/4" } } });
    expect(result.result.rubricAreas).toEqual([{ area: "Correctness", score: "6/6", comment: "Credit [evidence:repo-main]" }, { area: "Style", score: "2/4", comment: "original style" }]);
    expect(result.result.totalScore).toBe("7/10"); expect(result.result.feedback).toContain("new strength manual improvement"); expect(result.scoreChanged).toBe(true);
  });
  it("keeps scores/post status eligible for preservation for feedback-only selection", () => {
    expect(applyRepositoryProposalFields(edit, prior, proposed, { feedback: ["improvements"] }).scoreChanged).toBe(false);
    expect(applyRepositoryProposalFields(edit, prior, proposed, {}).edit).toEqual(edit);
    expect(repositoryEditSignature(edit)).not.toBe(repositoryEditSignature({ ...edit, improvements: "changed while pending" }));
    expect(repositoryEditSignature(edit)).toBe(repositoryEditSignature({ ...edit, areas: { Style: { score: "2/4" }, Correctness: { score: "5/6" } } }));
  });
});
