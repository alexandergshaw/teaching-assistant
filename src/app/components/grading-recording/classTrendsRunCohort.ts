// A16-3 (docs/a16-plan.md sections 5.5/9.3, rulings 14/19/20): the run
// cohort GradingRecordingPanel.tsx's handleGradeAll captures on every Grade
// submissions click, and the PURE LEAF that builds it. Ruling 19's own
// words are why this is a leaf rather than inline handler code: nothing in
// this repo's vitest suite ever executes handleGradeAll (nothing renders -
// see AGENTS.md), so a merge written inline in the handler would be
// unenforceable by anything but a source-text guess. Moving the merge here
// means THIS FILE'S OWN TEST exercises the real merge, and a sabotage that
// feeds it the wrong argument is caught by a source-text pin on the call
// site instead (GradingRecordingPanel.wiring.test.ts).
//
// THE ROW SOURCE (ruling 14): a captured row is THIS RUN'S CLASSIFIED
// RESULT merged onto its own identity - never the pre-grade row array
// (gradingRows.rawRows/rows). That array is a memo over React state whose
// rubricAreas field is empty until a grade lands (grading-row.ts's own
// rubricAreas doc comment) and never persisted, so capturing it directly
// would make hasTrendableResults false on every first run and ship this
// feature dead, green.
//
// THE IDENTITY PROJECTION (ruling 20): the handler may read the row array
// exactly once, solely to project id/studentName/assessment for the rows in
// THIS run - never assessmentId/assessmentLabel, which is the single
// in-scope value and would make every row carry the same label, silently
// killing the disclosure line below.
//
// Imports the two GradingRun types through the narrow type surface,
// "@/lib/grade/types", never the "@/lib/grade" barrel - see
// classTrendsEntry.ts's own header comment for the client-bundle hazard a
// value import of that barrel creates.
import type { GradeResult, GradingRun, GradingRunEntry } from "@/lib/grade/types";
import { toClassTrendsEntry, type ClassTrendsEntryMeta } from "../grading-results/classTrendsEntry";
import { classifyGradingResult, type GradingRecordingResult } from "./grading-rows";

// NO second TRENDABLE predicate, no second meta type, and no re-export of
// either (rulings 10, 18, 23): `hasTrendableResults` is not imported here at
// all - the panel imports it directly from grading-results/classTrendsEntry
// - and `ClassTrendsEntryMeta` above is a bare type-only import used only to
// type this file's own `runCohortMeta` return below, never re-exported.

/** The one read this feature adds, folded into a plain object per row - the
 *  argument shape `handleGradeAll`'s identity projection produces. */
export interface RunCohortIdentity {
  id: string;
  studentName: string;
  assessment: string | undefined;
}

/** The two fields captured at the moment of the click - see
 *  GradingRecordingPanel.tsx's own hinge comment at the call site for why
 *  neither is re-read later. `canvasUrl` is not part of this argument: this
 *  surface has no Canvas assignment to link to, so it is fixed at `""` by
 *  runCohortMeta below, never threaded through as an argument nobody can
 *  ever supply a real value for. */
export interface RunCohortMetaInput {
  courseName: string;
  assignmentName: string;
}

/** One captured row: the merged grade result, plus the per-row assessment
 *  label this run's identity projection carried for it (ruling 20) - kept
 *  alongside the result, never folded into it, because no field on
 *  GradeResult exists to hold it and cohortLabelSpread below is the only
 *  thing that ever reads it. */
export interface RunCohortRow {
  result: GradeResult;
  assessment: string | undefined;
}

/** The captured run - `lastRunCohort`'s own state type. Rows plus the two
 *  meta fields captured at the same moment, on the same object, per 5.5's
 *  "no second rule left to disagree with the first". */
export interface RunCohort {
  rows: RunCohortRow[];
  courseName: string;
  assignmentName: string;
}

/**
 * Merges `results` (this run's raw per-submission results, `result.results`
 * from gradeCapturedSubmissionsAction - never a pre-grade row array) onto
 * `identity` (this run's id/studentName/assessment projection) BY id, never
 * positionally - two arrays in different orders must still attribute each
 * result to its own student, and an id present in `results` but missing
 * from `identity` is OMITTED from the cohort rather than emitted with a
 * fabricated student.
 *
 * THE ROW-STATE MAPPING (re-derived against classifyGradingResult's actual
 * two-member return, never the four-member AssessmentRowState): a "ready"
 * classification becomes a GradedResult; a "failed" one becomes an
 * UngradedResult with `ungraded.kind: "grading-failed"` and `message` taken
 * from the CLASSIFIER's own stripped `error` field, never from a `row.error`
 * this function is never given. No input ever produces a "not-attempted"
 * row - classifyGradingResult cannot return anything a "not-attempted"
 * outcome would honestly describe (NotAttemptedOutcome.stoppedBy's two
 * members are both false of a recording row), so fabricating one here would
 * be inventing a stopping reason nobody observed.
 */
export function buildRunCohort(
  results: ReadonlyArray<{ id: string } & GradingRecordingResult>,
  identity: ReadonlyArray<RunCohortIdentity>,
  meta: RunCohortMetaInput
): RunCohort {
  const byId = new Map(identity.map((entry) => [entry.id, entry] as const));
  const rows: RunCohortRow[] = [];

  results.forEach((result, sourceIndex) => {
    const match = byId.get(result.id);
    // Length mismatch: this result has no identity row in THIS run's
    // projection. Omitted, never emitted with an invented student.
    if (!match) return;

    const classified = classifyGradingResult(result);
    const student = match.studentName;

    const gradeResult: GradeResult =
      classified.state === "ready"
        ? {
            student,
            overallComment: classified.overallComment,
            strengths: classified.strengths,
            improvements: classified.improvements,
            resubmitNotice: "",
            rubricAreas: classified.rubricAreas,
            totalScore: classified.totalScore,
            feedback: classified.overallComment,
            mergedFileCount: 0,
            submittedFiles: [],
          }
        : {
            student,
            overallComment: "",
            strengths: "",
            improvements: "",
            resubmitNotice: "",
            rubricAreas: [],
            totalScore: "",
            feedback: "",
            mergedFileCount: 0,
            submittedFiles: [],
            ungraded: {
              kind: "grading-failed",
              sourceIndex,
              student,
              message: classified.error ?? "",
            },
          };

    rows.push({ result: gradeResult, assessment: match.assessment });
  });

  return { rows, courseName: meta.courseName, assignmentName: meta.assignmentName };
}

/** Builds the GradingRunEntry ClassTrendsPanel expects out of a captured
 *  cohort - reuses classTrendsEntry.ts's own toClassTrendsEntry (ruling 10),
 *  never a second copy of it. */
export function toRunCohortEntry(cohort: RunCohort): GradingRunEntry {
  const run: GradingRun = {
    results: cohort.rows.map((r) => r.result),
    rubricAreaNames: [],
    fullCreditChecklist: [],
  };
  return toClassTrendsEntry(run, runCohortMeta(cohort));
}

/** A pure projection of the two fields captured at the click - reads NO row
 *  field, so a legacy or empty capture can never leak a stray row value into
 *  the heading. `canvasUrl` is always `""` (this surface has none). */
export function runCohortMeta(cohort: RunCohort): ClassTrendsEntryMeta {
  return { courseName: cohort.courseName, assignmentName: cohort.assignmentName, canvasUrl: "" };
}

/** The disclosure predicate (ruling 20): true when the captured rows carry
 *  more than one distinct `assessment` value, COUNTING `undefined` AS ONE
 *  DISTINCT VALUE - a `Set` naturally does this (its equality never merges
 *  `undefined` with a string), so a table holding one labelled and one
 *  unlabelled row still discloses the spread. */
export function cohortLabelSpread(cohort: RunCohort): boolean {
  const labels = new Set<string | undefined>(cohort.rows.map((r) => r.assessment));
  return labels.size > 1;
}
