/**
 * Build a GradingRunEntry for students who did not submit an assignment
 * by its deadline. Pure function, testable without network calls.
 */

import {
  composeOverallComment,
  formatFeedback,
  RESUBMIT_NOTICE,
  type GradedResult,
  type GradeDetermination,
  type GradeResult,
  type GradingRun,
  type GradingRunEntry,
} from "./grade";

// Canvas submission_types that record an online submission state we can trust to
// mean "turned in". on_paper / none / external_tool are NOT here: for those the
// whole class shows "unsubmitted", so a missing-submission zero is meaningless.
const ONLINE_SUBMISSION_TYPES = new Set([
  "online_text_entry",
  "online_url",
  "online_upload",
  "online_quiz",
  "discussion_topic",
  "media_recording",
  "student_annotation",
]);

export function isZeroableAssignment(a: {
  submissionTypes?: string[] | null;
  gradingType?: string | null;
  published?: boolean | null;
  omitFromFinalGrade?: boolean | null;
}): boolean {
  if (a.published === false) return false;
  if (a.gradingType === "not_graded") return false;
  if (a.omitFromFinalGrade === true) return false;
  const types = Array.isArray(a.submissionTypes) ? a.submissionTypes : [];
  return types.some((t) => ONLINE_SUBMISSION_TYPES.has(t));
}

export interface BuildZeroGradingEntryInput {
  courseName: string;
  assignmentName: string;
  canvasUrl: string;
  institution?: string;
  assignmentId?: string;
  pointsPossible: number | null;
  nonSubmitters: Array<{ userId: number; name: string }>;
}

// docs/no-submission-and-requirement-checking-acceptance-criteria.md G2: the
// comment states plainly that no submission was found, what was looked for,
// and where - written for the student, in the instructor's voice, and must
// not imply wrongdoing (a missing submission has innocent causes). Split
// across the strengths/improvements boxes (rather than one long
// overallComment) per G2a - composeOverallComment below is what recombines
// them, so the three parts can never drift out of sync with the composed
// text a student actually reads.
//
// Deliberately generic about the cause: this producer covers every online
// submission type (text entry, URL, upload, quiz, discussion, media
// recording, annotation), not just GitHub-repo assignments, so it does not
// name a specific innocent cause (e.g. an unmerged branch) that may not
// apply to this submission type.
const NO_SUBMISSION_STRENGTHS =
  "No submission was found for this assignment as of the due date, so there is nothing yet to grade - this is not a judgment on your work, only a record of what Canvas shows for your submission to this assignment.";
const NO_SUBMISSION_IMPROVEMENTS =
  "If you completed the work but it did not make it in (a failed upload, a wrong link, or a similar issue), please let me know and I will take a look.";

export function buildZeroGradingEntry(input: BuildZeroGradingEntryInput): GradingRunEntry {
  // G1a: the no-submission fact is its own field (determination below),
  // never encoded into totalScore - six sites in this repo take the first
  // number found anywhere in a score string, so text like "No submission -
  // checked 3 branches" would post as 3.
  //
  // G1b: pointsPossible ?? 0 used to produce "0/0" whenever a Canvas
  // assignment's points were unknown, and every fraction parser in this repo
  // (parseEarnedPossibleScore requires possible > 0) rejects that string. A
  // bare "0" - still a valid score to post, still picked up by every
  // first-number extraction site - is used instead whenever pointsPossible
  // is not a positive number.
  const totalScore =
    input.pointsPossible != null && input.pointsPossible > 0 ? `0/${input.pointsPossible}` : "0";

  // G2a: composeOverallComment (not a hand-authored string) so overallComment
  // can never drift from the three boxes it is built from.
  //
  // G1d: resubmitNotice is set directly here, not derived from
  // pointsWereDeducted(totalScore, ...) - that helper cannot parse a bare
  // "0" (no "/"), and this producer must reach the resubmit notice
  // deliberately rather than by accident of parsing. A 0 for a missing
  // submission has, by construction, room to improve on resubmission.
  const overallComment = composeOverallComment(
    NO_SUBMISSION_STRENGTHS,
    NO_SUBMISSION_IMPROVEMENTS,
    RESUBMIT_NOTICE
  );

  const results = input.nonSubmitters.map((s) => ({
    student: s.name,
    overallComment,
    strengths: NO_SUBMISSION_STRENGTHS,
    improvements: NO_SUBMISSION_IMPROVEMENTS,
    resubmitNotice: RESUBMIT_NOTICE,
    rubricAreas: [],
    totalScore,
    // Reuses the same composition every LLM-backed producer uses
    // (grade/engine.ts) rather than authoring a parallel "feedback" string.
    feedback: formatFeedback(overallComment, [], totalScore),
    mergedFileCount: 0,
    submittedFiles: [],
    userId: s.userId,
    // G2b: no LLM call is made here (this whole function is pure, sync, and
    // network-free) - there is nothing to grade, and the text above is fully
    // deterministic.
    determination: "no-submission" as const,
  }));

  return {
    courseName: input.courseName,
    assignmentName: input.assignmentName,
    canvasUrl: input.canvasUrl,
    run: { results, rubricAreaNames: [], fullCreditChecklist: [], speedGraderUrl: null },
    institution: input.institution,
    assignmentId: input.assignmentId,
    pointsPossible: input.pointsPossible,
  };
}

export interface BuildRepoNoSubmissionResultInput {
  /** The row label the grader would have used (the repo's full name). */
  student: string;
  /** The graded folder, when the grade was scoped to one; omitted for the whole repo. */
  folder?: string;
  /** describeBranchMergeNote's sentence for this outcome: names the branch the
   * work sits on (never merged) or states nothing exists on any branch. */
  note: string;
  /** "no-submission-unmerged-branch" when the work exists on an unmerged
   * branch; plain "no-submission" when it is absent everywhere. */
  determination: GradeDetermination;
}

const REPO_NO_SUBMISSION_IMPROVEMENTS =
  "If you completed the work but it did not make it into the graded branch (for example it was never merged), please let me know and I will take a look.";

/**
 * One GradeResult for a repository row with nothing student-authored on the
 * graded ref: a bare "0" with the branch-aware note in its comment. No model
 * call is made (deterministic). Not a Canvas-shaped entry - gradeRepoAction
 * wraps it in a GradingRun like its other branches. The no-submission fact is
 * the `determination` field, never encoded in the score (G1a).
 */
export function buildRepoNoSubmissionResult(input: BuildRepoNoSubmissionResultInput): GradedResult {
  const folderLabel = input.folder ? `"${input.folder}"` : "the repository";
  const strengths = `Nothing was submitted in ${folderLabel} - no student-authored files were found there, so there is nothing yet to grade. This is not a judgment on your work, only a record of what the graded branch contains.`;
  const improvements = `${input.note} ${REPO_NO_SUBMISSION_IMPROVEMENTS}`;
  const overallComment = composeOverallComment(strengths, improvements, RESUBMIT_NOTICE);
  const totalScore = "0";
  return {
    student: input.student,
    overallComment,
    strengths,
    improvements,
    resubmitNotice: RESUBMIT_NOTICE,
    rubricAreas: [],
    totalScore,
    feedback: formatFeedback(overallComment, [], totalScore),
    mergedFileCount: 0,
    submittedFiles: [],
    determination: input.determination,
  };
}

/**
 * A real grade plus a branch note: appends `note` to `improvements` and
 * recomposes `overallComment` through composeOverallComment (never
 * hand-concatenated). Pure; never mutates; leaves score and strengths alone.
 * `feedback` is recomposed only when the producer had set one.
 */
export function appendBranchNoteToResult(result: GradeResult, note: string): GradeResult {
  const improvements = result.improvements.trim() ? `${result.improvements} ${note}` : note;
  const overallComment = composeOverallComment(result.strengths, improvements, result.resubmitNotice);
  const feedback = result.feedback ? formatFeedback(overallComment, result.rubricAreas, result.totalScore) : result.feedback;
  return { ...result, improvements, overallComment, feedback };
}

/**
 * Folds `note` into the first result of a REAL grade (the grade is kept, never
 * zeroed). A null note, an empty run or an ungraded first row returns the run
 * unchanged. Spreads the run, so the top-level rubricUsed/rubricFingerprint
 * pair survives (RULING 57: a transform, not a producer).
 */
export function withBranchNote(run: GradingRun, note: string | null): GradingRun {
  const first = run.results[0];
  if (!note || !first || first.ungraded) return run;
  return { ...run, results: [appendBranchNoteToResult(first, note), ...run.results.slice(1)] };
}
