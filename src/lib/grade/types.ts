import type { CodeRunResult } from "../code-runner";

export const MAX_NESTED_ZIP_DEPTH = 3;

// Appended to overall feedback whenever a student lost points, so every graded
// student is offered a penalty-free resubmission in identical wording.
export const RESUBMIT_NOTICE =
  "You are welcome to resubmit this assignment, and I will regrade it with no late penalty.";

// docs/grading-results-feedback-boxes-acceptance-criteria.md, A1 item 2:
// overallComment is retained (roughly 32 downstream files read it) but is now
// DERIVED from the three independently-copyable boxes rather than
// independently authored. Every producer of a GradeResult must build
// overallComment through this function, in this exact order (strengths, then
// improvements, then resubmitNotice), so a reader of overallComment always
// sees the same composition regardless of which grader produced it. Empty
// parts are dropped rather than leaving stray whitespace, so a producer that
// has nothing for one box (e.g. an embedded grader with no improvement text)
// does not leave a double space or a trailing separator in the composed text.
export function composeOverallComment(
  strengths: string,
  improvements: string,
  resubmitNotice: string
): string {
  return [strengths, improvements, resubmitNotice]
    .filter((part) => part.trim().length > 0)
    .join(" ")
    .trim();
}

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
  // overallComment is the COMPOSITION of strengths + improvements +
  // resubmitNotice (see composeOverallComment above), never authored on its
  // own - kept because ~32 downstream files (Canvas posting, CSV export,
  // drafts, sorting) read it and expect the full feedback text.
  overallComment: string;
  // What the student did well. Required (not optional) so a producer that
  // forgets to populate it fails at compile time (tsc) rather than silently
  // dropping a third of the feedback at runtime. May be "" when a producer
  // genuinely has nothing to say (e.g. a zero for a non-submission).
  strengths: string;
  // What the student could do better - guidance the LLM prompt used to
  // forbid (prompts.ts) until the instructor asked for it explicitly. "" when
  // a producer cannot honestly produce improvement text (an embedded grader
  // that met every check, or an external engine with no coaching signal) -
  // never filler invented to fill the box.
  improvements: string;
  // RESUBMIT_NOTICE verbatim when points were deducted, "" at full credit -
  // the exact wording and condition every producer used before this feature.
  // Never model-generated or reworded: it is a promise about instructor
  // policy, and every producer must say it identically or not at all.
  resubmitNotice: string;
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
  // When the submission was a GitHub repo URL that was successfully fetched
  // and graded, the exact "owner/repo" and resolved ref (commit sha, or a
  // branch/tag name when the commit lookup failed) - set by canvasWorkToEntry
  // via fetchGradableRepoContent (src/lib/grade/repo-content.ts) so a grade
  // can be defended to a student (which code, at which commit, was read).
  gradedRepo?: string | null;
  gradedRef?: string | null;
  // True when this submission's merged content exceeded the per-submission
  // character cap (GRADE_MAX_CHARS_PER_SUBMISSION / getGeminiMaxCharsPerSubmission
  // in ../gemini) and was cut down before being sent to the model - see
  // truncateSubmission in ./utils. Previously this fact only existed as a
  // sentence inside the prompt text that no instructor ever saw; this field
  // lets a UI say "this submission was truncated" instead.
  submissionTruncated?: boolean;
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
  // The submitted URL, when the Canvas submission was a link (e.g. a GitHub
  // repo) rather than text/files. Set by canvasWorkToEntry.
  submissionUrl?: string | null;
  // When submissionUrl is a GitHub repository link, canvasWorkToEntry fetches
  // it and folds its source into `content` (gradedRepo/gradedRef record what
  // was read - see the matching fields on GradeResult). A URL that is not a
  // GitHub repo, or that could not be read (private/404/API failure), leaves
  // these unset and repoReadNote explains why; grading still proceeds on
  // whatever text the submission had (the link note in `content`).
  gradedRepo?: string | null;
  gradedRef?: string | null;
  repoReadNote?: string | null;
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
