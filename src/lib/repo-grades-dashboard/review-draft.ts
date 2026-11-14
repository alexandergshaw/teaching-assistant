import type { RepoGradeResultRecord, RepoGradeReviewDraft } from "@/lib/supabase/types.repo-grades-dashboard";

/** Only the two reviewed rubric shapes can produce an unscored draft. */
export function buildUnverifiedExecutionDraft(result: RepoGradeResultRecord): RepoGradeReviewDraft | null {
  if (result.reviewReason !== "execution-unverified" || !Array.isArray(result.unexaminedArtifacts)) return null;
  const names = result.rubric.map((area) => area.area.trim()).sort();
  const expected = [
    ["Function Implementation", "Test Coverage Quantity", "Test Case Quality", "Code Organization and Testing Practice"],
    ["Function Implementation", "Test Suite Completeness", "Test Coverage (Normal/Edge/Invalid)", "Code Structure and Style"],
  ];
  if (!expected.some((areas) => JSON.stringify([...areas].sort()) === JSON.stringify(names))) return null;
  return { ...result, score: null, reviewReason: "execution-unverified", unexaminedArtifacts: result.unexaminedArtifacts,
    feedback: `Review-only draft. Test coverage was not verified.${result.unexaminedArtifacts.length ? ` Unexamined binary files: ${result.unexaminedArtifacts.map((item) => item.path).join(", ")}.` : " No optional files were excluded."}`,
    sections: { strengths: "", improvements: "Instructor review is required; test execution was not verified.", resubmitNotice: "", rawScore: "Not calculated" },
    rubric: result.rubric.map((area) => ({ ...area, score: "Unverified", comment: "Instructor review is required." })),
  };
}
