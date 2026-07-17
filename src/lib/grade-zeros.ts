/**
 * Build a GradingRunEntry for students who did not submit an assignment
 * by its deadline. Pure function, testable without network calls.
 */

import type { GradingRunEntry } from "./grade";

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

export function buildZeroGradingEntry(input: BuildZeroGradingEntryInput): GradingRunEntry {
  const results = input.nonSubmitters.map((s) => ({
    student: s.name,
    overallComment: "",
    rubricAreas: [],
    totalScore: `0/${input.pointsPossible ?? 0}`,
    feedback: "",
    mergedFileCount: 0,
    submittedFiles: [],
    userId: s.userId,
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
