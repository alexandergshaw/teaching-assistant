import { module14BuildOutput, module14ReviewRubricAreas } from "@/lib/grade/module14-optional-artifact";
import type { RepoGradeResultRecord, RepoGradeReviewDraft, RepoGradeUnexaminedArtifact } from "@/lib/supabase/types.repo-grades-dashboard";

function validModule14Omissions(items: RepoGradeUnexaminedArtifact[]): boolean {
  return items.length > 0 && items.length <= 40
    && items.every((item) => item && Object.keys(item).length === 2 && typeof item.path === "string"
      && item.path.length <= 4096 && !/[^a-zA-Z0-9_./]/.test(item.path)
      && module14BuildOutput(item.path) && item.reason === "optional-binary-unexamined")
    && new Set(items.map(({ path }) => path.toLowerCase())).size === items.length
    && Buffer.byteLength(JSON.stringify(items), "utf8") <= 16384;
}

/** Module 14 is eligible only when the runner has verified its source-only scope. */
export function buildUnverifiedExecutionDraft(result: RepoGradeResultRecord, module14Rubric?: string): RepoGradeReviewDraft | null {
  if (result.reviewReason !== "execution-unverified" || !Array.isArray(result.unexaminedArtifacts)) return null;
  const names = result.rubric.map((area) => area.area.trim()).sort();
  const module14 = module14Rubric !== undefined;
  const expected = [
    ["Function Implementation", "Test Coverage Quantity", "Test Case Quality", "Code Organization and Testing Practice"],
    ["Function Implementation", "Test Suite Completeness", "Test Coverage (Normal/Edge/Invalid)", "Code Structure and Style"],
  ];
  const matches = (areas: readonly string[]) => JSON.stringify([...areas].sort()) === JSON.stringify(names);
  let reviewAreas = result.rubric.map(({ area }) => area);
  if (module14) {
    const areas = module14ReviewRubricAreas(module14Rubric);
    if (!areas || !matches(areas) || !validModule14Omissions(result.unexaminedArtifacts)
      || result.module12Evidence || result.generalExecutionEvidence || result.executionReceipts || result.sourceExecutionSummary) return null;
    reviewAreas = [...areas];
  } else if (!expected.some(matches)) return null;
  const limitation = module14 ? "Code execution and equivalence to the submitted binaries were not verified." : "Test coverage was not verified.";
  return { ...result, score: null, reviewReason: "execution-unverified", unexaminedArtifacts: result.unexaminedArtifacts,
    feedback: `Review-only draft. ${limitation}${result.unexaminedArtifacts.length ? ` Unexamined binary files: ${result.unexaminedArtifacts.map((item) => item.path).join(", ")}.` : " No optional files were excluded."}`,
    sections: { strengths: "", improvements: "Instructor review is required; test execution was not verified.", resubmitNotice: "", rawScore: "Not calculated" },
    rubric: reviewAreas.map((area) => ({ area, score: "Unverified", comment: "Instructor review is required." })),
  };
}
