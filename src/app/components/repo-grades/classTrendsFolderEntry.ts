// A16 wave 3 (docs/a16-wave3-scope.md revision 1, section 7): the folder-entry
// adapter that lets Repo Grades mount ClassTrendsPanel above its grid, the
// same way grading-results/classTrendsEntry.ts does for the four LMS Grading
// surfaces and grading-recording/classTrendsRunCohort.ts does for the
// recording table.
//
// This file OWNS every DECISION wave 3's trends surface needs: what the run's
// cohort holds (buildRepoRunCohort), when trends show at all
// (repoRunTrendsEntry), and what they are labelled (repoRunTrendsLabel). The
// caller (useRepoGradesGradingActions.ts) holds no condition over any of
// these outputs - see that file's own header comment and
// repoGradesClassTrends.wiring.test.ts's A-3/A-6 control-path rules for why
// that placement is load-bearing, not a style choice (ruling W3-1).
//
// This is a canary-3 root in classTrendsDraft.not-postable.test.ts and makes
// no network, storage or React call: it is a pure leaf, unit-tested BY VALUE
// in classTrendsFolderEntry.test.ts.
//
// Import constraints (section 7.1, load-bearing): value-import specifiers are
// exactly "@/lib/grade/types" and "../grading-results/classTrendsEntry" -
// nothing else. In particular, this file never reaches, type or value, the
// sibling modules named repoGradesBulkGrade, repoGradesPosting or
// repoGradesCellEdits (each spelled here without a leading "./" so this
// sentence cannot itself be mistaken for the import it forbids):
// repoGradesBulkGrade.ts value-imports repoGradesPosting.ts, which
// value-imports @/lib/canvas-url - a capability this leaf's own canary-3 root
// bans by prefix (classTrendsDraft.not-postable.test.ts). That is why this
// leaf's signature takes `folder: string` rather than a `BulkGradePlan`.
import { gradedResults, type GradeResult, type GradingRun, type GradingRunEntry } from "@/lib/grade/types";
import { hasTrendableResults, toClassTrendsEntry } from "../grading-results/classTrendsEntry";

/** One "Grade all" run's own cohort - the run's results, by reference, plus
 * the metadata a caller already has at click time. Never a live-render
 * projection of `cellEdits` (see this feature's build-packet header comment
 * on the wave-2 trap this shape avoids: cells hold decomposed fields, not a
 * GradeResult, so re-assembling one from cell state would be a mapping - the
 * exact home of wave 2's transposition survivors). */
export interface RepoRunCohort {
  /** This run's results, elements BY REFERENCE - never rebuilt, reordered or
   * filtered here. */
  readonly results: readonly GradeResult[];
  /** The clicked column's folder - the handler's own argument, not a live
   * control. */
  readonly folder: string;
  /** The hook's courseId at click - used only as a validity check against the
   * LIVE courseId in repoRunTrendsEntry below, never rendered itself. */
  readonly courseId: string;
  /** course?.name at click, "" when null. */
  readonly courseName: string;
}

/** Owns the null decision (ruling W3-1(a)). Returns null when `results` is
 * null - runBulkGrade refused to start a second concurrent run, so no run
 * happened.
 *
 * CORRECTED (docs/a26-a27-scope.md, residual RR-3): this does not mean the
 * previous run's cohort is left untouched. The caller
 * (useRepoGradesGradingActions.ts's handleGradeColumn) already calls
 * `setLastRunCohort(null)` before `runBulkGrade` is ever invoked, so by the
 * time this function can return null for a refusal, the previous cohort has
 * already been cleared. Returning null here simply keeps it at null - it
 * does not preserve or restore anything from before the click.
 * Otherwise returns a cohort, INCLUDING for an empty array: a run that graded
 * nothing (RULE 1c skipped every target, or every target failed) genuinely
 * replaces the previous run's trends, and repoRunTrendsEntry below then shows
 * none for it. The caller (handleGradeColumn) calls this UNCONDITIONALLY, so
 * the caller holds no condition over the cohort that a mutation could invert
 * - see repoGradesClassTrends.wiring.test.ts's A-3 for the control-path rule
 * this depends on. */
export function buildRepoRunCohort(input: {
  results: readonly GradeResult[] | null;
  folder: string;
  courseId: string;
  course: { name: string } | null;
}): RepoRunCohort | null {
  if (input.results === null) return null;
  return {
    results: input.results,
    folder: input.folder,
    courseId: input.courseId,
    courseName: input.course?.name ?? "",
  };
}

/** The one gate for this surface. Null unless: `cohort` is non-null AND
 * `cohort.courseId === liveCourseId` (branch 8 in the build packet: a course
 * switch mid-run must hide the finishing run's stale-course cohort) AND
 * `hasTrendableResults(entry)` - the same predicate every other trends mount
 * in this repo uses, reused rather than re-derived (section 6). */
export function repoRunTrendsEntry(cohort: RepoRunCohort | null, liveCourseId: string): GradingRunEntry | null {
  if (cohort === null) return null;
  if (cohort.courseId !== liveCourseId) return null;
  const run: GradingRun = { results: [...cohort.results], rubricAreaNames: [], fullCreditChecklist: [] };
  const entry = toClassTrendsEntry(run, { courseName: cohort.courseName, assignmentName: cohort.folder, canvasUrl: "" });
  return hasTrendableResults(entry) ? entry : null;
}

/** The visible line above the panel (section 7.3.1, the UX pass):
 *
 *   Trends for "<folder>" from the last Grade all run, covering the <n> repos it graded.
 *   Trends for "<folder>" from the last Grade all run, covering the 1 repo it graded.
 *
 * `<folder>` is `entry.assignmentName` and `<n>` is
 * `gradedResults(entry.run.results).length` - the same count
 * computeClassTrends uses for `totalResults`, so the label and the panel
 * agree by construction. There is no zero form: the gate above guarantees at
 * least one graded result carrying rubric areas before this is ever called.
 * Rendered as a plain <p>, no role and no aria-live (index.tsx). */
export function repoRunTrendsLabel(entry: GradingRunEntry): string {
  const count = gradedResults(entry.run.results).length;
  const noun = count === 1 ? "repo" : "repos";
  return `Trends for "${entry.assignmentName}" from the last Grade all run, covering the ${count} ${noun} it graded.`;
}
