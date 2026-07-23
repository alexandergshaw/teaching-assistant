// Re-export all public APIs from submodules
export { RESUBMIT_NOTICE, MAX_NESTED_ZIP_DEPTH, type RubricAreaResult, type SubmittedFileInfo, type GradeResult, type GradingRun, type GradingRunEntry, type StudentSubmissionEntry } from "./grade/types";

export { getMimeType, IMAGE_EXTENSIONS, GEMINI_IMAGE_MIME_TYPES } from "./grade/constants";

export { normalizeAreaName, buildSystemPrompt, extractRubricCriteria, generateRubric, synthesizeFullCreditChecklist, generateSampleAnswer, buildSampleAnswerPrompt, inferFileNameConvention, type RubricCriterion } from "./grade/rubric";

export { parseRubricResponse, parseEarnedPossibleScore, pointsWereDeducted, deriveTotalScore, scaleResultToPoints, formatFeedback, normalizeGeminiError } from "./grade/parsing";

export { extractSubmissions, extractStudentEntries, extractCanvasEntries, canvasWorkToEntry } from "./grade/extraction";

export { truncateSubmission, sleep, getBaseFileName, removeLastExtension, toPreviewContent, parseSubmissionFileName, getFileExtension, inferStudentPrefix, groupSubmissionsByStudent, buildCodeExecutionNote } from "./grade/utils";

export { gradeSubmissions, gradeEntries, gradeCanvasUrl } from "./grade/engine";

// The draft strip helpers (stripGradeResultForDraft / stripGradingRunForDraft /
// stripGradingRunEntriesForDraft) live in src/lib/workflows/grading-review-rows.ts
// - a client-safe module - because this file (grade.ts) transitively imports
// server-only code and must never be VALUE-imported by the client step registry.
