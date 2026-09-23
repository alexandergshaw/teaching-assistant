// A24 (docs/a24-scope.md sections 3/5): converts the session's persisted
// SnapshotAssessmentRow[] into the GradingRunEntry ClassTrendsPanel expects,
// and exposes the cohort-spread predicate that gates the disclosure line.
// REUSES classTrendsEntry.ts's own toClassTrendsEntry/hasTrendableResults
// (grading-results/classTrendsEntry.ts) rather than a second copy - the same
// rule classTrendsRunCohort.ts states for its own surface.
//
// Imports the two GradingRun types through the narrow type surface,
// "@/lib/grade/types", never the "@/lib/grade" barrel - see
// classTrendsRunCohort.ts's own header comment for the client-bundle hazard a
// value import of that barrel creates.
//
// R-A24-1 (docs/a24-scope.md section 8): SnapshotRubricAreaEvidence carries
// `quote`, not `comment` - RubricAreaResult.comment is filled from `quote`
// (the actual cited evidence text), never left as a silent "". An empty
// comment on every area would render every snapshot-graded trend with no
// supporting text at all, on the one surface whose scoring is grounded in
// transcript citations.
import type { GradeResult, GradingRun, GradingRunEntry, RubricAreaResult } from "@/lib/grade/types";
import { toClassTrendsEntry, type ClassTrendsEntryMeta } from "../grading-results/classTrendsEntry";
import type { SnapshotAssessmentRow, SnapshotRubricAreaEvidence } from "./snapshot-row";

function toRubricAreaResult(area: SnapshotRubricAreaEvidence): RubricAreaResult {
  return { area: area.area, score: area.score, comment: area.quote };
}

/** Only "ready" rows carry a real grade - "pending"/"grading"/"failed" rows
 *  are OMITTED from the cohort entirely, never emitted as a fabricated
 *  GradedResult with empty/zeroed fields (which would render as a real, if
 *  hollow, entry in the trends). */
function toGradeResult(row: SnapshotAssessmentRow): GradeResult {
  return {
    student: row.studentName,
    overallComment: row.overallComment,
    strengths: row.strengths,
    improvements: row.improvements,
    resubmitNotice: "",
    rubricAreas: row.rubricAreas.map(toRubricAreaResult),
    totalScore: row.totalScore,
    feedback: row.overallComment,
    mergedFileCount: 0,
    submittedFiles: [],
  };
}

/** Builds the GradingRunEntry ClassTrendsPanel expects from the session's
 *  own persisted rows. `meta` is the caller's own course/assignment/canvasUrl
 *  triple - this leaf reads no row field to build it (mirrors
 *  classTrendsRunCohort.ts's runCohortMeta: a heading built from row data
 *  would carry whichever row happened to be captured last). */
export function buildSnapshotClassTrendsEntry(
  rows: readonly SnapshotAssessmentRow[],
  meta: ClassTrendsEntryMeta
): GradingRunEntry {
  const run: GradingRun = {
    results: rows.filter((r) => r.state === "ready").map(toGradeResult),
    rubricAreaNames: [],
    fullCreditChecklist: [],
  };
  return toClassTrendsEntry(run, meta);
}

/** The disclosure predicate (this surface's equivalent of
 *  classTrendsRunCohort.ts's cohortLabelSpread): true when the "ready" rows
 *  carry more than one distinct cohort digest. A row with no digest at all
 *  (persisted before this field existed, or never graded against assignment
 *  text) is normalized to "" and counted as its own distinct value, the same
 *  `Set`-distinctness convention cohortLabelSpread already established for
 *  `undefined` assessment labels. */
export function snapshotCohortSpread(rows: readonly SnapshotAssessmentRow[]): boolean {
  const keys = new Set(rows.filter((r) => r.state === "ready").map((r) => r.cohortKey ?? ""));
  return keys.size > 1;
}
