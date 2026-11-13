import { expect, it } from "vitest";
import { buildUnverifiedExecutionDraft } from "./review-draft";
it("withholds the total, execution criterion and all model claims while preserving source-only rubric levels", () => {
  const rubric = ["Function Implementation", "Test Coverage Quantity", "Test Case Quality", "Code Organization and Testing Practice"]
    .map((area) => ({ area, score: "25/25", comment: "The tests passed when executed." }));
  const input = { score: 100, feedback: "All tests passed.", sections: { strengths: "Execution passed", improvements: "", resubmitNotice: "", rawScore: "100/100" }, rubric,
    reviewReason: "execution-unverified" as const, unexaminedArtifacts: [{ path: "lab/test_utils", reason: "optional-binary-unexamined" as const }] };
  const draft = buildUnverifiedExecutionDraft(input)!;
  expect(draft.score).toBeNull();
  expect(draft.sections.rawScore).toBe("Not calculated");
  expect(draft.rubric[3].score).toBe("Unverified");
  expect(draft.rubric[0].score).toBe("25/25");
  expect(JSON.stringify(draft)).not.toMatch(/All tests passed|Execution passed|tests passed when executed/i);
  expect(buildUnverifiedExecutionDraft({ ...input, rubric: [...rubric, { area: "Binary check", score: "1", comment: "" }] })).toBeNull();
});
