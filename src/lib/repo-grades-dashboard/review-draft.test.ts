import { afterEach, expect, it, vi } from "vitest";
import * as module14Policy from "@/lib/grade/module14-optional-artifact";
import { buildUnverifiedExecutionDraft } from "./review-draft";

afterEach(() => vi.restoreAllMocks());

it("withholds the total and unverified criterion scores while retaining draft provenance", () => {
  const rubric = ["Function Implementation", "Test Coverage Quantity", "Test Case Quality", "Code Organization and Testing Practice"]
    .map((area) => ({ area, score: "25/25", comment: "The tests passed when executed." }));
  const input = { score: 100, feedback: "All tests passed.", sections: { strengths: "Execution passed", improvements: "", resubmitNotice: "", rawScore: "100/100" }, rubric,
    reviewReason: "execution-unverified" as const, unexaminedArtifacts: [{ path: "lab/test_utils", reason: "optional-binary-unexamined" as const }] };
  const draft = buildUnverifiedExecutionDraft(input)!;
  expect(draft.score).toBeNull();
  expect(draft.sections.rawScore).toBe("Not calculated");
  expect(draft.rubric[3].score).toBe("Unverified");
  expect(draft.rubric.every((area) => area.score === "Unverified")).toBe(true);
  expect(buildUnverifiedExecutionDraft({ ...input, unexaminedArtifacts: [] })?.feedback).toContain("No optional files were excluded");
  expect(JSON.stringify(draft)).not.toMatch(/All tests passed|Execution passed|tests passed when executed/i);
  expect(buildUnverifiedExecutionDraft({ ...input, rubric: [...rubric, { area: "Binary check", score: "1", comment: "" }] })).toBeNull();
});

it("requires the same frozen rubric's exact criteria and unique in-folder Module 14 omissions", () => {
  const rubricText = "synthetic Module 14 rubric";
  const names = ["Singleton Implementation", "Observer Pattern Logic", "Strategy Pattern Design", "Multi-language Implementation"];
  const declaredPath = { path: "assignments/module_14/Patterns.class", reason: "optional-binary-unexamined" as const };
  const input = { score: 80, feedback: "Synthetic model comment.", sections: { strengths: "", improvements: "", resubmitNotice: "", rawScore: "80/100" },
    rubric: names.map((area) => ({ area, score: "20/25", comment: "Unverified source-model note." })),
    reviewReason: "execution-unverified" as const, unexaminedArtifacts: [declaredPath] };
  expect(buildUnverifiedExecutionDraft(input, rubricText)).toBeNull(); // Unrecognized rubric SHA.
  vi.spyOn(module14Policy, "module14ReviewRubricAreas").mockImplementation((candidate) => candidate === rubricText ? names : undefined);
  expect(buildUnverifiedExecutionDraft(input)).toBeNull(); // No scoped Module 14 eligibility.
  const reordered = { ...input, rubric: input.rubric.toReversed().map((area) => ({ ...area, area: ` ${area.area} ` })) };
  expect(buildUnverifiedExecutionDraft(reordered, rubricText)).toMatchObject({
    score: null, rubric: names.map((area) => ({ area, score: "Unverified" })),
  });
  expect(buildUnverifiedExecutionDraft({ ...input, rubric: input.rubric.map((area, i) => i === 0 ? { ...area, area: names[1] } : area) }, rubricText)).toBeNull();
  for (const unexaminedArtifacts of [
    [], [declaredPath, declaredPath], [{ ...declaredPath, path: "assignments/module_12/Patterns.class" }],
    [{ ...declaredPath, path: "assignments/module_14/nested/patterns.exe" }],
    [{ ...declaredPath, path: "assignments/module_14/Patterns.class\n" }],
    [{ ...declaredPath, path: "assignments/module_14/other.exe" }],
  ]) expect(buildUnverifiedExecutionDraft({ ...input, unexaminedArtifacts }, rubricText)).toBeNull();
  expect(buildUnverifiedExecutionDraft({ ...input, sourceExecutionSummary: "Unexpected execution evidence." }, rubricText)).toBeNull();
});
