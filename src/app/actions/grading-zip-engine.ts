import type { GradeActionState } from "../actions-types";
import { gradeViaGradingEngine, detectRubricSource } from "@/lib/grading-engine";
import { gradingApiToRun } from "./grading-run-mapping";

// Grade a submissions zip with the deterministic ("Other") grading service.
// Shared by the uploaded-zip path and the Canvas path (which synthesizes a zip).
export async function gradeZipViaEngine(
  zipBase64: string,
  rubric: string,
  rubricFile: File | null,
  institutionCode?: string,
  // Canvas points_possible when grading from a Canvas URL; null for zip uploads.
  pointsPossible: number | null = null
): Promise<GradeActionState> {
  let rubricText = "";
  let rubricName: string | undefined;
  if (rubricFile && rubricFile.size > 0) {
    rubricText = await rubricFile.text();
    rubricName = rubricFile.name;
  } else if (rubric.trim()) {
    rubricText = rubric;
  }
  if (!rubricText.trim()) {
    return {
      run: null,
      error:
        "Provide a rubric (upload a CSV/JSON file or paste one) to grade with the deterministic grader.",
    };
  }
  const resp = await gradeViaGradingEngine(
    zipBase64,
    detectRubricSource(rubricText, rubricName),
    institutionCode
  );
  const warnings = [
    ...resp.warnings,
    ...(resp.unmapped_criteria?.length
      ? [`Excluded (unmapped): ${resp.unmapped_criteria.join(", ")}`]
      : []),
  ];
  return { run: gradingApiToRun(resp, pointsPossible, rubricText), error: null, warnings };
}
