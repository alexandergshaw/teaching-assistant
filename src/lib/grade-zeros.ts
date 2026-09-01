/**
 * Build a GradingRunEntry for students who did not submit an assignment
 * by its deadline. Pure function, testable without network calls.
 */

import { composeOverallComment, formatFeedback, RESUBMIT_NOTICE, type GradingRunEntry } from "./grade";

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
