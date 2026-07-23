import type { CodeRunResult } from "../code-runner";

export const MAX_NESTED_ZIP_DEPTH = 3;

// Appended to overall feedback whenever a student lost points, so every graded
// student is offered a penalty-free resubmission in identical wording.
export const RESUBMIT_NOTICE =
  "You are welcome to resubmit this assignment, and I will regrade it with no late penalty.";

export interface RubricAreaResult {
  area: string;
  score: string;
  comment: string;
}

export interface SubmittedFileInfo {
  name: string;
  extension: string;
  previewContent: string;
  previewTruncated: boolean;
  rawBase64?: string;
  mimeType?: string;
}

export interface GradeResult {
  student: string;
  overallComment: string;
  rubricAreas: RubricAreaResult[];
  totalScore: string;
  feedback: string;
  mergedFileCount: number;
  submittedFiles: SubmittedFileInfo[];
  // Canvas user id, present when graded from a Canvas URL; enables write-back.
  userId?: number;
  // Result of running the submission's code in the sandbox, when it had runnable
  // code. Display-only on the Gemini path; the embedded engine also scores it.
  codeExecution?: CodeRunResult;
}

export interface GradingRun {
  results: GradeResult[];
  rubricAreaNames: string[];
  fullCreditChecklist: string[];
  // SpeedGrader base URL for the graded Canvas assignment (no student id), when
  // graded from a Canvas source. Per-row links append `&student_id=<userId>`.
  speedGraderUrl?: string | null;
  // A full-credit model answer generated on the LLM grading path, shown to the
  // instructor as a per-assignment reference. Never posted to Canvas.
  sampleAnswer?: string;
}

/**
 * One assignment's grading run in workflow context: the GradingRun plus the
 * course/assignment/institution/canvasUrl metadata needed to link back to
 * SpeedGrader and post results to Canvas. Produced by the grade-submissions
 * and grade-to-draft steps (src/lib/workflows/registry.ts) and consumed by
 * post-grades - shared here so every producer/consumer agrees on the shape
 * a `runs` array element carries, and on runIndex/resultIndex numbering
 * (see buildGradingReviewRows in src/lib/workflows/grading-review-rows.ts).
 */
export interface GradingRunEntry {
  courseName: string;
  assignmentName: string;
  canvasUrl: string;
  run: GradingRun;
  institution?: string;
  assignmentId?: string;
  pointsPossible?: number | null;
  offline?: boolean;
}

/**
 * One student's submission ready to grade (text + any attached files).
 */
export interface StudentSubmissionEntry {
  student: string;
  content: string;
  mergedFileCount: number;
  submittedFiles: SubmittedFileInfo[];
  // Canvas user id, set on the Canvas path so grades can be posted back.
  userId?: number;
  // Precomputed sandbox run of this entry's code (populated by the action before
  // the deterministic engine grades, so the engine itself stays network-free).
  codeRun?: CodeRunResult | null;
}

// Internal interfaces used by parsing/rubric modules
export interface InferredFileNameParts {
  studentDisplay: string;
  citationFileName: string;
}

export interface InferredFileNameLookup {
  byRaw: Map<string, InferredFileNameParts>;
  byBase: Map<string, InferredFileNameParts>;
}

export interface RubricCriterion {
  name: string;
  /** Points the criterion is scored out of, when the rubric states them. */
  points: number | null;
}
