// Re-export all public APIs from submodules
export { RESUBMIT_NOTICE, GRADING_FAILURE_PREFIX, MAX_NESTED_ZIP_DEPTH, composeOverallComment, GRADE_DETERMINATIONS, coerceGradeDetermination, coerceUngradedOutcome, isUngraded, gradedResults, ungradedResults, type RubricAreaResult, type SubmittedFileInfo, type GradeResult, type GradedResult, type UngradedResult, type UngradedOutcome, type NotAttemptedOutcome, type GradingFailedOutcome, type GradeDetermination, type GradingRun, type GradingRunEntry, type StudentSubmissionEntry, type StampedRubricText } from "./grade/types";

export { stampRubricProvenance, restoreStampedRubricText } from "./grade/rubric-provenance-stamp";

export { getMimeType, IMAGE_EXTENSIONS, GEMINI_IMAGE_MIME_TYPES } from "./grade/constants";

export { normalizeAreaName, buildSystemPrompt, extractRubricCriteria, generateRubric, synthesizeFullCreditChecklist, deriveFullCreditChecklist, generateSampleAnswer, buildSampleAnswerPrompt, inferFileNameConvention, type RubricCriterion } from "./grade/rubric";

export { parseRubricResponse, parseEarnedPossibleScore, pointsWereDeducted, deriveTotalScore, scaleResultToPoints, formatFeedback, normalizeGeminiError } from "./grade/parsing";

export { extractSubmissions, extractStudentEntries, extractCanvasEntries, canvasWorkToEntry, disambiguateCanvasEntries } from "./grade/extraction";

export { truncateSubmission, sleep, getBaseFileName, removeLastExtension, toPreviewContent, parseSubmissionFileName, getFileExtension, inferStudentPrefix, groupSubmissionsByStudent, assignUnclaimedLabel, buildCodeExecutionNote } from "./grade/utils";

export { gradeSubmissions, gradeEntries, gradeCanvasUrl, type GradingRunOptions } from "./grade/engine";

// A39 wave 4b: reconcileRun is a PURE leaf (imports only ./grade/types and
// ./grade/rubric), so re-exporting it here cannot widen this barrel's
// runtime reach into server-only code - see reconcile.ts's own header.
export { reconcileRun, type ReconcileRunResult } from "./grade/reconcile";

// The draft strip helpers (stripGradeResultForDraft / stripGradingRunForDraft /
// stripGradingRunEntriesForDraft) live in src/lib/workflows/grading-review-rows.ts
// - a client-safe module - because this file (grade.ts) transitively imports
// server-only code and must never be VALUE-imported by the client step registry.
