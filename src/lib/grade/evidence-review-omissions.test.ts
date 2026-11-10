import { expect, it } from "vitest";
import { incompleteEvidenceReason, evidencePostRefusal } from "./evidence-review";
import type { GradeResult } from "./types";
it("requires a fresh evidence review for a result with excluded files", () => {
  const row = { student: "Synthetic", totalScore: "1/1", strengths: "", improvements: "", resubmitNotice: "", overallComment: "", feedback: "", rubricAreas: [], mergedFileCount: 1, submittedFiles: [], evidenceOmissions: ["project/Debug/generated.obj"] } satisfies GradeResult;
  expect(incompleteEvidenceReason(row)).toMatch(/files were excluded/i);
  expect(evidencePostRefusal(row, new Set())).toMatch(/review before posting/i);
  expect(evidencePostRefusal(row, new Set([row]))).toBeNull();
  expect(evidencePostRefusal({ ...row }, new Set([row]))).toMatch(/review before posting/i);
});

it("holds a static-only result for a fresh review even without excluded files", () => {
  const row = { student: "Synthetic", totalScore: "1/1", strengths: "", improvements: "", resubmitNotice: "", overallComment: "", feedback: "", rubricAreas: [], mergedFileCount: 1, submittedFiles: [], staticOnly: true } satisfies GradeResult;
  expect(incompleteEvidenceReason(row)).toMatch(/runtime behavior is unverified/i); expect(evidencePostRefusal(row, new Set())).toMatch(/review before posting/i); expect(evidencePostRefusal(row, new Set([row]))).toBeNull();
});
