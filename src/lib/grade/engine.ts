import { MAX_STATIC_PROJECT_CONTENT_CHARS } from "@/lib/grade/static-project-limits";
import { reportsLengthCriterionDeduction, reportsLengthPenalty } from "./reported-length-penalty";
import { addLengthExemption, extractLengthOnlyExemption, withoutSupportedInstructionLength, withoutSupportedRubricLength } from "./length-only-exemption";
import { canvasOmissionIdentityRefusal, canvasVideoRefusal } from "../canvas/omitted-video";
import type { SubmissionFileInventory } from "./submission-file-inventory";
import { parseRepositoryProposalOutput } from "./repository-proposal-output";
import {
  getGeminiInterRequestDelayMs,
  getGeminiMaxCharsPerSubmission,
  getGeminiMaxOutputTokens,
  getGeminiMaxSubmissions,
} from "../gemini";
import { callLlm, LlmOutcomeUnknownError, type BoundedLlmCallOptions, type LlmExecutionPolicy, type LlmPart, type LlmProvider } from "../llm";
import { runSubmittedCode, type CodeRunResult } from "../code-runner";
import {
  RESUBMIT_NOTICE,
  GRADING_FAILURE_PREFIX,
  UNGRADED_NOT_ATTEMPTED_MESSAGES,
  composeOverallComment,
  type GradeHarshness,
  type GradeResult,
  type GradingSource,
  type GradedResult,
  type UngradedResult,
  type UngradedOutcome,
  type GradingRun,
  type RubricAreaResult,
  type RubricCriterion,
  type StudentSubmissionEntry,
  type SubmittedFileInfo,
} from "./types";
import { collectInlineVisualEvidence } from "./inline-visuals";
import { truncateSubmission, sleep, buildCodeExecutionNote } from "./utils";
import { parseRubricResponse, hasParseableRubricJson, extractStrengthsField, pointsWereDeducted, deriveTotalScore, scaleResultToPoints, formatFeedback, normalizeGeminiError } from "./parsing";
import { buildSystemPrompt, extractRubricCriteria, extractRubricCriteriaForEvidence } from "./rubric";
import { parseBrightspaceRubric, validateBrightspaceRatings } from "./brightspace-rubric";
import { buildSubmittedFileNamesBlock, composeReplyExclusionDisclosure, SUBMISSION_FRAMING_HEADER } from "./prompts";
// A39 wave 4b (docs/a39-waves.md 8.4.2): the canonical-column reconciliation
// that used to be inline here is now a PURE projection (reconcile.ts),
// called once after the loop closes - this is a call, not the logic itself.
import { reconcileRun } from "./reconcile";
import { buildVideoWindowNote, type RecordingWindow } from "./recording-split";
// A39 wave 2 (docs/a39-architecture.md 5.2), tightened by RULING 57/58: the
// stamp itself (never a raw rubricFingerprint() call plus an inline literal)
// so every producer of a GradingRun - not only this file's three - stamps
// the pair the identical way. stampRubricProvenance imports rubricFingerprint
// from THIS leaf, never from ../research/rubric-bank, so stamping does not
// widen the engine's runtime import closure to include a database client
// (runtime-import-graph.test.ts is the instrument, W2-5).
import { stampRubricProvenance } from "./rubric-provenance-stamp";
// Chat-grading diagnostics WA: the failure class is TYPED at the throw site
// (never recovered from message text). Both leaves are import-free.
import { GradeCallError, gradeFailureClassForFinishReason, gradeFailureClassForStatus } from "./grade-failure";
import type { GradeCallSink } from "./grade-item-diagnostic";

/**
 * One non-text part sent with a submission: inline bytes (image/PDF) or, for a
 * video (VIDEO-GRADING W3), a reference to a Files API upload (`fileUri`).
 */
export type GradeAttachment =
  | { name: string; base64: string; mimeType: string }
  | { name: string; fileUri: string; mimeType: string };

/**
 * A8 Wave B (docs/a8-scoring-architecture.md 3.1): what ONE scored axis yields
 * before any aggregate is finalised. An object literal type, deliberately NOT
 * a GradingRun / GradedResult, so it adds no producer to the
 * rubric-provenance-producers canary. `modelTotalScore` is the model's own
 * total for the pass; the single-axis finalise trusts it (today's behaviour),
 * the two-axis finalise ignores it.
 */
interface AxisScore {
  rubricAreas: RubricAreaResult[];
  strengths: string;
  improvements: string;
  modelTotalScore: string;
}

/** Score ONE axis: the model call, the guards and the parse. No aggregate. */
async function scoreAxis(
  systemPrompt: string,
  studentName: string,
  content: string,
  provider: LlmProvider,
  inlineFiles: GradeAttachment[] = [],
  codeRun: CodeRunResult | null = null,
  // The real submitted file names, given to the model as an explicit list
  // (see buildSubmittedFileNamesBlock) so it can check a stated filename
  // requirement by comparing two lists instead of noticing names buried in
  // the "--- FILE: path ---" headers inside `content`.
  submittedFiles: SubmittedFileInfo[] = [],
  // G8/F1=B: when true the prompt ran in "separate-strengths" mode, so the
  // model's praise is in parsed.strengths and its deductions are in
  // overallComment (see the routing below).
  commentSplit = false,
  // RECORDING ONE-VS-MANY W3: when set, this call grades ONE segment of a
  // multi-submission recording; a fixed-wording note confines the model to it.
  videoGradeWindowSec?: RecordingWindow,
  callSink?: GradeCallSink,
  executionOptions?: GradingRunOptions,
  repositoryInventories?: SubmissionFileInventory[]
): Promise<AxisScore> {
  const maxOutputTokens = getGeminiMaxOutputTokens();

  const imageNote =
    inlineFiles.length > 0
      ? `\n\nThe student also submitted ${inlineFiles.length} file(s) (e.g. required screenshots or documents), attached below: ${inlineFiles
          .map((f) => f.name)
          .join(", ")}. Treat them as part of the submission and evaluate them against the rubric.`
      : "";

  // codeRun.neededStdin (code-runner.ts) means the run failed ONLY because
  // this sandbox's hardcoded empty stdin starved a required input read - not
  // evidence about the student's code, exactly like codeRun.error, so it is
  // withheld from the prompt the same way: telling the model "ran without
  // errors: no" here would let its own holistic judgment penalize the
  // student for a platform limitation, the same mistake gradeEntriesEmbedded
  // (embedded-grader/index.ts) avoids for its own deterministic criterion.
  const codeNote = codeRun && !codeRun.error && !codeRun.neededStdin ? buildCodeExecutionNote(codeRun) : "";
  const fileListBlock = buildSubmittedFileNamesBlock(submittedFiles, repositoryInventories);
  if (repositoryInventories?.length && fileListBlock.length > getGeminiMaxCharsPerSubmission()) throw new GradeCallError("Repository file inventory exceeds the grading input budget.", "model unparseable");

  const parts: LlmPart[] = [
    {
      text: `${systemPrompt}\n\nStudent: ${studentName}${fileListBlock}\n\nSubmission:\n${SUBMISSION_FRAMING_HEADER}\n\n${content}${imageNote}${codeNote}${videoGradeWindowSec ? buildVideoWindowNote(videoGradeWindowSec) : ""}`,
    },
    ...inlineFiles.map((f): LlmPart =>
      "fileUri" in f
        ? { fileData: { fileUri: f.fileUri, mimeType: f.mimeType } }
        : { inlineData: { mimeType: f.mimeType, data: f.base64 } }
    ),
  ];

  if (executionOptions?.evidenceContext && (parts.reduce((sum, part) => sum + ("text" in part ? part.text.length : 0), 0) > getGeminiMaxCharsPerSubmission() || new TextEncoder().encode(JSON.stringify(parts)).byteLength > 3.5 * 1024 * 1024)) throw new GradeCallError("Combined evidence prompt exceeds its budget.", "model unparseable");

  const result = await callLlm(
    {
      contents: [{ role: "user", parts }],
      generationConfig: { temperature: 0.2, maxOutputTokens },
    },
    provider,
    executionOptions?.modelCallOptions ?? executionOptions?.modelExecution
  );

  if (!result.ok) {
    callSink?.recordCall({ status: result.status });
    if (result.outcome === "unknown") throw new LlmOutcomeUnknownError();
    console.error(`[LLM gradeSubmission] HTTP ${result.status}:`, result.body);
    throw new GradeCallError(normalizeGeminiError(result.status, result.body), gradeFailureClassForStatus(result.status));
  }
  callSink?.recordCall({
    finishReason: result.finishReason,
    promptTokens: result.usage?.promptTokenCount,
    outputTokens: result.usage?.candidatesTokenCount,
    elapsedMs: result.elapsedMs,
  });

  // G5 bad-output guard. ALLOWLIST of complete reasons (absent or "STOP"):
  // an unbounded set of cap/blocked reasons must never become a graded row.
  // Throws into gradeStudentEntries's catch, which builds the grading-failed
  // row. The parser itself is shared with the recording path and stays as is.
  if (result.finishReason !== undefined && result.finishReason !== "STOP") {
    throw new GradeCallError(
      `The model's response was cut off or blocked before it finished (${result.finishReason}), so it was not graded.`,
      gradeFailureClassForFinishReason(result.finishReason),
      result.finishReason
    );
  }
  if (executionOptions?.evidenceContext) {
    const strict = parseRepositoryProposalOutput(result.text, executionOptions.evidenceContext.criteria, executionOptions.evidenceContext.allowedEvidenceIds);
    if (!strict.ok || (commentSplit && !strict.value.separateStrengths)) throw new GradeCallError("Repository proposal output was incomplete.", "model unparseable");
    if (executionOptions?.suppressLengthDeduction && ([strict.value.overallComment, strict.value.improvements, strict.value.separateStrengths ?? "", ...strict.value.rubricAreas.map((area) => area.comment)].some(reportsLengthPenalty) || strict.value.rubricAreas.some((area) => reportsLengthCriterionDeduction(area.area, area.score)))) throw new GradeCallError("The model reported a length penalty even though length deductions are disabled. Review or retry this submission; no grade was produced.", "model unparseable");
    return { ...strict.value, strengths: commentSplit ? strict.value.separateStrengths! : strict.value.overallComment, improvements: commentSplit ? [strict.value.overallComment, strict.value.improvements].filter(Boolean).join("\n\n") : strict.value.improvements };
  }
  if (!hasParseableRubricJson(result.text)) {
    throw new GradeCallError("The model's response was not valid grading JSON, so it was not graded.", "model unparseable");
  }

  const feedback = result.text.trim() || "No feedback generated.";
  const parsed = parseRubricResponse(feedback);
  if (executionOptions?.suppressLengthDeduction && ([parsed.overallComment, parsed.improvements, extractStrengthsField(feedback), ...parsed.rubricAreas.map((area) => area.comment)].some(reportsLengthPenalty) || parsed.rubricAreas.some((area) => reportsLengthCriterionDeduction(area.area, area.score)))) throw new GradeCallError("The model reported a length penalty even though length deductions are disabled. Review or retry this submission; no grade was produced.", "model unparseable");

  // docs/grading-results-feedback-boxes-acceptance-criteria.md, A1: the model
  // supplies strengths (still called overallComment in its JSON response -
  // what it did well plus the specific reason for each deduction) and
  // improvements (prompts.ts's new field) as two independent boxes;
  // resubmitNotice is NEVER model-generated, only this fixed-wording,
  // fixed-condition append. overallComment is the composition of all three,
  // never authored on its own.
  // G8/F1=B (reading R1): under commentSplit, praise -> strengths and
  // deductions + advice -> improvements. Unset: today's mapping, unchanged.
  const strengths = commentSplit ? extractStrengthsField(feedback) : parsed.overallComment;
  const improvements = commentSplit
    ? [parsed.overallComment, parsed.improvements].filter((t) => t.trim()).join("\n\n")
    : parsed.improvements;

  return {
    rubricAreas: parsed.rubricAreas,
    strengths,
    improvements,
    modelTotalScore: parsed.totalScore,
  };
}

/**
 * Finalise a graded result from already-scored areas: scale onto the real
 * points, derive the resubmit notice, compose the comment and the feedback.
 * `derivedTotal` is the caller's aggregate (the single-axis path derives it
 * from the model total, the two-axis path from the code sum).
 */
function finalizeGrade(
  studentName: string,
  areas: RubricAreaResult[],
  derivedTotal: string,
  strengths: string,
  improvements: string,
  pointsPossible: number | null
): GradedResult {
  const { rubricAreas, totalScore } = scaleResultToPoints(areas, derivedTotal, pointsPossible);
  const resubmitNotice = pointsWereDeducted(totalScore, rubricAreas) ? RESUBMIT_NOTICE : "";
  const overallComment = composeOverallComment(strengths, improvements, resubmitNotice);

  return {
    student: studentName,
    overallComment,
    strengths,
    improvements,
    resubmitNotice,
    rubricAreas,
    totalScore,
    mergedFileCount: 1,
    submittedFiles: [],
    feedback: formatFeedback(overallComment, rubricAreas, totalScore),
  };
}

/** Grade a single student submission (the single-axis path, unchanged). */
async function gradeSubmission(
  systemPrompt: string,
  studentName: string,
  content: string,
  provider: LlmProvider,
  inlineFiles: GradeAttachment[] = [],
  // When set (the Canvas path), re-base the total onto the assignment's real
  // points so the tool grades out of the same total Canvas shows.
  pointsPossible: number | null = null,
  codeRun: CodeRunResult | null = null,
  submittedFiles: SubmittedFileInfo[] = [],
  commentSplit = false,
  videoGradeWindowSec?: RecordingWindow,
  callSink?: GradeCallSink,
  executionOptions?: GradingRunOptions,
  repositoryInventories?: SubmissionFileInventory[],
  lengthExemption?: { criteria: RubricCriterion[]; exempt: RubricCriterion } | null,
  brightspaceCriteria?: RubricCriterion[]
): Promise<GradedResult> {
  const axis = await scoreAxis(systemPrompt, studentName, content, provider, inlineFiles, codeRun, submittedFiles, commentSplit, videoGradeWindowSec, callSink, executionOptions, repositoryInventories);
  const areas = lengthExemption ? addLengthExemption(axis.rubricAreas, lengthExemption.criteria, lengthExemption.exempt) : axis.rubricAreas;
  if (!areas) throw new GradeCallError("The model did not return all substantive rubric scores on their stated scales. Review or retry; no grade was produced.", "model unparseable");
  if (brightspaceCriteria && !validateBrightspaceRatings(areas, brightspaceCriteria)) throw new GradeCallError("The model returned a score outside the rubric's allowed ratings or an incomplete criterion. Review or retry; no grade was produced.", "model unparseable");
  const derivedTotal = deriveTotalScore(lengthExemption || brightspaceCriteria ? "" : axis.modelTotalScore, areas);
  return finalizeGrade(studentName, areas, derivedTotal, axis.strengths, axis.improvements, pointsPossible);
}

/**
 * RS-1 (docs/a8-scoring-architecture.md 3.4): a reply section exists but the
 * student made no replies. No model call on empty content; each reply
 * criterion is a code-composed zero so "no replies" reads differently from
 * "no initial post" and the area still posts.
 */
function absentReplyAreas(replyCriteria: RubricCriterion[]): RubricAreaResult[] {
  return replyCriteria.map((c) => ({
    area: c.name,
    score: c.points != null ? `0/${c.points}` : "0",
    comment: "No replies were submitted.",
  }));
}

/**
 * A8 Wave B (docs/a8-scoring-architecture.md 3.3/3.4/7): grade a discussion
 * entry that carries structured axes. The initial-post axis is ALWAYS scored
 * against initialText (built from discussionAxes.initialPostContent, which
 * contains no reply prose), so a reply can never be scored on that axis. With
 * a reply section the replies are scored as a second pass and the aggregate is
 * the CODE sum over the merged areas; without one the replies are excluded and
 * the fixed disclosure is appended. A throw in either pass fails the whole
 * student (RS-2: the caller's catch builds the grading-failed row).
 */
async function gradeDiscussionAxes(a: {
  student: string;
  initialPrompt: string;
  initialCriteria: RubricCriterion[];
  initialPostAbsentConfirmed: boolean;
  replyPrompt: string | null;
  replyCriteria: RubricCriterion[];
  initialText: string;
  replyText: string | null;
  replyCount: number;
  provider: LlmProvider;
  inlineFiles: GradeAttachment[];
  codeRun: CodeRunResult | null;
  submittedFiles: SubmittedFileInfo[];
  commentSplit: boolean;
  videoGradeWindowSec?: RecordingWindow;
  pointsPossible: number | null;
  callSink?: GradeCallSink;
  modelExecution?: LlmExecutionPolicy;
  suppressLengthDeduction?: boolean;
  lengthExemption?: { criteria: RubricCriterion[]; exempt: RubricCriterion } | null;
}): Promise<GradedResult> {
  if (a.initialPostAbsentConfirmed && a.replyPrompt === null) throw new Error("Cannot grade replies separately without reply rubric criteria.");
  if (a.initialPostAbsentConfirmed && (!a.initialCriteria.length || a.initialCriteria.some((criterion) => criterion.points == null || !Number.isFinite(criterion.points) || criterion.points <= 0))) throw new Error("Cannot score an absent initial post without explicit positive point values for its rubric criteria.");
  const initial = a.initialPostAbsentConfirmed
    ? { rubricAreas: a.initialCriteria.map((criterion) => ({ area: criterion.name, score: `0/${criterion.points}`, comment: "No initial post was submitted." })), modelTotalScore: "", strengths: "", improvements: "No initial post was submitted." }
    : await scoreAxis(a.initialPrompt, a.student, a.initialText, a.provider, a.inlineFiles, a.codeRun, a.submittedFiles, a.commentSplit, a.videoGradeWindowSec, a.callSink, { modelExecution: a.modelExecution, suppressLengthDeduction: a.suppressLengthDeduction });
  if (a.lengthExemption && a.lengthExemption.exempt.axis !== "reply") {
    const areas = addLengthExemption(initial.rubricAreas, a.initialCriteria, a.lengthExemption.exempt);
    if (!areas) throw new GradeCallError("The model did not return all substantive initial-post scores on their stated scales. Review or retry; no grade was produced.", "model unparseable");
    initial.rubricAreas = areas; initial.modelTotalScore = "";
  }

  if (a.replyPrompt === null) {
    const total = deriveTotalScore(initial.modelTotalScore, initial.rubricAreas);
    const improvements =
      a.replyCount > 0
        ? [initial.improvements, composeReplyExclusionDisclosure(a.replyCount)].filter((t) => t.trim()).join("\n\n")
        : initial.improvements;
    return finalizeGrade(a.student, initial.rubricAreas, total, initial.strengths, improvements, a.pointsPossible);
  }

  let replyAreas: RubricAreaResult[];
  let replyStrengths = "";
  let replyImprovements = "";
  if (a.replyCount > 0 && a.replyText !== null) {
    const reply = await scoreAxis(a.replyPrompt, a.student, a.replyText, a.provider, [], null, a.submittedFiles, a.commentSplit, undefined, a.callSink, { modelExecution: a.modelExecution, suppressLengthDeduction: a.suppressLengthDeduction });
    replyAreas = reply.rubricAreas;
    replyStrengths = reply.strengths;
    replyImprovements = reply.improvements;
  } else {
    replyAreas = absentReplyAreas(a.replyCriteria);
  }
  if (a.lengthExemption?.exempt.axis === "reply") {
    const areas = addLengthExemption(replyAreas, a.replyCriteria, a.lengthExemption.exempt);
    if (!areas) throw new GradeCallError("The model did not return all substantive reply scores on their stated scales. Review or retry; no grade was produced.", "model unparseable");
    replyAreas = areas;
  }
  const areas = [...initial.rubricAreas, ...replyAreas];
  // The code sum, never a model total: each pass saw only one axis.
  const total = deriveTotalScore("", areas);
  const join = (x: string, y: string): string => [x, y].filter((t) => t.trim()).join("\n\n");
  return finalizeGrade(a.student, areas, total, join(initial.strengths, replyStrengths), join(initial.improvements, replyImprovements), a.pointsPossible);
}

/**
 * N13a: options threaded through the whole gradeStudentEntries/gradeEntries/
 * gradeSubmissions/gradeCanvasUrl call chain. Optional and trailing so every
 * existing call site compiles unchanged.
 */
export interface GradingRunOptions {
  readonly executionPolicy?: "evidence-only";
  readonly evidenceContext?: { criteria: readonly RubricCriterion[]; allowedEvidenceIds: readonly string[]; provenance: string };
  readonly modelCallOptions?: BoundedLlmCallOptions;
  /** Opt-in server budget for grading model requests with ambiguous outcomes. */
  readonly modelExecution?: LlmExecutionPolicy;
  /** Absolute epoch-ms. The loop refuses to START a student at or past this.
   *  Undefined on the attended browser path, which keeps today's behaviour.
   *  A forged/too-generous value can only make the run do LESS work, so
   *  there is no authorization consequence to threading it through
   *  unauthenticated-looking layers like FormData. */
  readonly deadlineMs?: number;
  /** G8/F1=B: separate praise (What Went Well) from deductions + advice
   *  (What Could Be Better). Unset/false keeps today's byte-identical mapping. */
  readonly commentSplit?: boolean;
  /** RECORDING ONE-VS-MANY W3: confine this grade to one segment of a
   *  multi-submission video (a prompt note, not a wire field). Unset = today. */
  readonly videoGradeWindowSec?: RecordingWindow;
  /** Grading-chat harshness. Unset/"balanced" appends no directive, keeping
   *  today's prompt byte-identical. */
  readonly harshness?: GradeHarshness;
  /** Grading-chat feedback word-count target. Unset (or out of range) appends
   *  no directive, keeping today's prompt byte-identical. */
  readonly feedbackWordTarget?: number;
  /** Repo-page naming-deduction toggle. Unset means true (the rule is
   *  emitted), keeping every other caller byte-identical. */
  readonly applyNamingDeduction?: boolean;
  /** Grading-chat length deduction. Unset means false (no directive), keeping
   *  every other caller byte-identical. */
  readonly applyLengthDeduction?: boolean;
  readonly suppressLengthDeduction?: boolean;
  /** Minimum word shortfall that permits a length deduction; absent keeps legacy policy. */
  readonly lengthDeductionThresholdWords?: number;
  /** Opt out of automatic compiler/interpreter execution for submitted code.
   * Unset preserves the established behavior. */
  readonly autoRunCode?: boolean;
  /** A37: the grading surface, stamped onto each not-attempted row so the
   *  review table can name a surface-specific action. Display-copy only. */
  readonly source?: GradingSource;
  /** A45: course roster names for the zip collision corroboration; unset keeps
   *  A44's path-only decision. Read only by gradeSubmissions. */
  readonly knownStudents?: readonly string[];
  /** VIDEO-GRADING W3: Files API attachments (videos) sent with EVERY entry
   *  graded in this call. Only the single-entry grade-run-item route sets it;
   *  unset keeps every other caller byte-identical. */
  readonly extraAttachments?: readonly GradeAttachment[];
  /** Chat-grading diagnostics WA: receives one record per model call and the
   *  typed failure class of a failed entry. Total (never throws), additive;
   *  unset keeps every other caller byte-identical. */
  readonly callSink?: GradeCallSink;
}

/**
 * Builds a row that carries NO grade, for one of the two reasons in
 * UngradedOutcome. N13a section 2/5: the display fields are DERIVED from
 * `outcome.message`, never independently authored or blanked, so the reason
 * a submission has no grade is never silently lost from the cell an
 * instructor is looking at. Ruling 5: codeExecution/gradedRepo/gradedRef are
 * carried UNCHANGED from whatever the caller already has for this entry
 * (both may be unset - e.g. a not-attempted entry never ran any code) so a
 * failed or skipped repo grade never loses the evidence (which repo, which
 * commit, which sandbox run) that exists to defend a grade to a student.
 */
function buildUngradedRow(
  entry: Pick<StudentSubmissionEntry, "student" | "mergedFileCount" | "submittedFiles" | "gradedRepo" | "gradedRef" | "linkFetch">,
  outcome: UngradedOutcome,
  codeRun: CodeRunResult | null = null,
  submissionTruncated: boolean | undefined = undefined
): UngradedResult {
  const strengths = outcome.message;
  const overallComment = composeOverallComment(strengths, "", "");
  return {
    student: entry.student,
    overallComment,
    strengths,
    improvements: "",
    resubmitNotice: "",
    rubricAreas: [],
    totalScore: "",
    feedback: formatFeedback(overallComment, [], ""),
    mergedFileCount: entry.mergedFileCount,
    submittedFiles: entry.submittedFiles,
    codeExecution: codeRun ?? undefined,
    gradedRepo: entry.gradedRepo,
    gradedRef: entry.gradedRef,
    linkFetch: entry.linkFetch,
    submissionTruncated,
    ungraded: outcome,
  };
}

/**
 * Grade a list of per-student submissions against the rubric. Shared by the zip
 * upload path and the Canvas discussion path so both produce identical runs.
 */
async function gradeStudentEntries(
  studentSubmissions: StudentSubmissionEntry[],
  assignmentInstructions: string,
  rubric: string,
  provider: LlmProvider,
  // Canvas points_possible, when grading from a Canvas URL — anchors each
  // student's total to the assignment's real scale. Null for zip uploads.
  pointsPossible: number | null = null,
  options: GradingRunOptions = {}
): Promise<GradingRun> {
  const { deadlineMs, commentSplit, harshness, feedbackWordTarget, source, videoGradeWindowSec, callSink, modelExecution } = options;
  const namingDeduction = options.applyNamingDeduction ?? true;
  const lengthDeduction = options.applyLengthDeduction ?? false;
  const maxSubmissions = getGeminiMaxSubmissions();
  const maxCharsPerSubmission = getGeminiMaxCharsPerSubmission();
  const interRequestDelayMs = getGeminiInterRequestDelayMs();

  const limitedEntries = studentSubmissions.slice(0, maxSubmissions);
  // Pin the rubric's criteria so every student is graded on the same areas with
  // the same names (otherwise the per-student LLM calls drift, and the results
  // table shows mismatched, half-filled columns).
  const evidenceOnly = options.executionPolicy === "evidence-only";
  const audit = evidenceOnly ? extractRubricCriteriaForEvidence(rubric) : null;
  if (evidenceOnly && (!audit?.ok || !options.evidenceContext || provider !== "gemini" || studentSubmissions.some((entry) => entry.discussionAxes || entry.content.length > maxCharsPerSubmission || entry.submittedFiles.some((file) => file.videoRef)))) throw new Error("Unsupported or incomplete evidence grading input.");
  const criteria = audit?.ok ? audit.criteria : extractRubricCriteria(rubric);
  const brightspace = parseBrightspaceRubric(rubric);
  const scoringInstructions = options.suppressLengthDeduction ? withoutSupportedInstructionLength(assignmentInstructions) : assignmentInstructions;
  const lengthExemption = options.suppressLengthDeduction && !evidenceOnly && studentSubmissions.every((entry) => !entry.discussionAxes?.initialPostAbsentConfirmed) ? extractLengthOnlyExemption(rubric, criteria) : null;
  const scoringRubric = lengthExemption?.rubric ?? (options.suppressLengthDeduction ? withoutSupportedRubricLength(rubric) : rubric);
  const scoringCriteria = lengthExemption?.criteria ?? criteria;
  // A8 Wave B (docs/a8-scoring-architecture.md 3.2): THREE prompts, built
  // once; WHICH one an entry uses is chosen PER ENTRY (3.3/3.6). singleAxisPrompt
  // is today's call, byte for byte (ALL criteria, axisScope "all").
  const singleAxisPrompt = commentSplit
    ? buildSystemPrompt(scoringInstructions ?? "", scoringRubric ?? "", scoringCriteria, "some", "separate-strengths", "all", harshness, feedbackWordTarget, namingDeduction, lengthDeduction, undefined, options.lengthDeductionThresholdWords, options.suppressLengthDeduction)
    : buildSystemPrompt(scoringInstructions ?? "", scoringRubric ?? "", scoringCriteria, "some", "in-overall-comment", "all", harshness, feedbackWordTarget, namingDeduction, lengthDeduction, undefined, options.lengthDeductionThresholdWords, options.suppressLengthDeduction);
  const [axisMode, axisRouting] = commentSplit
    ? (["some", "separate-strengths"] as const)
    : (["some", "in-overall-comment"] as const);
  const initialCriteria = scoringCriteria.filter((c) => c.axis !== "reply");
  const replyCriteria = scoringCriteria.filter((c) => c.axis === "reply");
  const hasReplySection = replyCriteria.length > 0;
  const initialAxisPrompt = buildSystemPrompt(scoringInstructions ?? "", scoringRubric ?? "", initialCriteria, axisMode, axisRouting, "initial-post-only", harshness, feedbackWordTarget, namingDeduction, lengthDeduction, undefined, options.lengthDeductionThresholdWords, options.suppressLengthDeduction);
  const replyAxisPrompt = hasReplySection
    ? buildSystemPrompt(scoringInstructions ?? "", scoringRubric ?? "", replyCriteria, axisMode, axisRouting, "reply-only", harshness, feedbackWordTarget, namingDeduction, lengthDeduction, undefined, options.lengthDeductionThresholdWords, options.suppressLengthDeduction)
    : null;
  const evidencePrompt = evidenceOnly ? buildSystemPrompt(scoringInstructions ?? "", scoringRubric ?? "", criteria, "some", axisRouting, "all", harshness, feedbackWordTarget, namingDeduction, lengthDeduction, options.evidenceContext?.provenance, options.lengthDeductionThresholdWords, options.suppressLengthDeduction) : singleAxisPrompt;
  const results: GradeResult[] = [];

  // N13a: entry 0 always STARTS (it does not follow that results[0] is a
  // GRADED row - a started entry can throw, and then results[0] is
  // kind: "grading-failed"). The i > 0 guard is load-bearing: without it, a
  // deadline already past at loop start would grade nobody at all, which
  // every .run.results[0] consumer in this repo is not written to expect.
  let deadlineStoppedAt: number | undefined;
  for (let i = 0; i < limitedEntries.length; i += 1) {
    if (i > 0 && deadlineMs !== undefined && Date.now() >= deadlineMs) {
      deadlineStoppedAt = i;
      break;
    }
    const { student, content, mergedFileCount, submittedFiles, userId, codeRun: precomputedCodeRun, gradedRepo, gradedRef, repositoryInventories } = limitedEntries[i];
    const axes = limitedEntries[i].discussionAxes;
    if (options.suppressLengthDeduction && (scoringInstructions === null || scoringRubric === null || (axes && axes.replyCount === 0 && lengthExemption?.exempt.axis === "reply"))) {
      results.push(buildUngradedRow(limitedEntries[i], { kind: "grading-failed", sourceIndex: i, student, canvasUserId: userId, message: `${GRADING_FAILURE_PREFIX}This rubric contains a length rule that cannot be separated safely. Revise the rubric or review grading manually; no grade was produced.` }));
      continue;
    }
    if (limitedEntries[i].staticOnly === true && (content.length > MAX_STATIC_PROJECT_CONTENT_CHARS || content.length > maxCharsPerSubmission)) {
      results.push(buildUngradedRow(limitedEntries[i], { kind: "grading-failed", sourceIndex: i, student, canvasUserId: userId, message: `${GRADING_FAILURE_PREFIX}This static project exceeds the current single-pass grading input budget. No grade was produced. Multi-part project grading is not yet available; review it manually.` }));
      continue;
    }
    const { text: truncatedContent, truncated: contentTruncated } = truncateSubmission(
      content,
      limitedEntries[i].staticOnly === true && !axes && content.length <= MAX_STATIC_PROJECT_CONTENT_CHARS ? content.length : Math.max(0, maxCharsPerSubmission - (repositoryInventories?.length ? buildSubmittedFileNamesBlock(submittedFiles, repositoryInventories).length : 0))
    );
    // Each axis slice is truncated independently (3.3); the single-axis path
    // truncates `content` exactly as before.
    const initialTrunc = axes ? truncateSubmission(axes.initialPostContent, maxCharsPerSubmission) : null;
    const replyTrunc =
      axes && hasReplySection && axes.replyCount > 0
        ? truncateSubmission(axes.replyContent, maxCharsPerSubmission)
        : null;
    const submissionTruncated = initialTrunc
      ? initialTrunc.truncated || (replyTrunc?.truncated ?? false)
      : contentTruncated;

    const canvasVideo = options.source === "canvas" ? canvasVideoRefusal([{ student, files: submittedFiles.map((file) => ({ name: file.name, mimeType: file.mimeType ?? "" })) }]) : null;
    if (canvasVideo) {
      results.push(buildUngradedRow(limitedEntries[i], { kind: "grading-failed", sourceIndex: i, student, canvasUserId: userId, message: canvasVideo }));
      continue;
    }
    const visuals = await collectInlineVisualEvidence(submittedFiles);
    const affected = visuals.documents.filter(d => (d.file.extension === "docx" || d.file.extension === "pptx") && (d.coverage.status === "incomplete" || d.coverage.status === "failed"));
    if (visuals.documents.length) callSink?.recordVisuals?.({
      picturesPrepared: visuals.documents.reduce((n, d) => n + d.coverage.parts.length, 0),
      picturesSent: affected.length ? 0 : visuals.documents.reduce((n, d) => n + d.coverage.parts.length, 0),
      picturesOmitted: visuals.documents.reduce((n, d) => n + d.coverage.omitted, 0),
      visualCoverage: affected.some(d => d.coverage.status === "failed") ? "failed" : affected.length ? "incomplete" : visuals.documents.some(d => d.coverage.status === "unavailable") ? "unavailable" : "complete",
    });
    if (affected.length) {
      const unsupportedShapes = affected.some((item) => item.coverage.reason === "unsupported-shape");
      results.push(buildUngradedRow(limitedEntries[i], {
        kind: "grading-failed", sourceIndex: i, student, canvasUserId: userId,
        message: unsupportedShapes
          ? `${GRADING_FAILURE_PREFIX}Embedded Word vector shapes could not be fully inspected in ${affected.map(d => d.file.name).join(", ")}. Export the document to PDF and try again.`
          : `${GRADING_FAILURE_PREFIX}Embedded picture evidence could not be fully inspected in ${affected.map(d => d.file.name).join(", ")}. Supply a supported PDF or export the pictures, then try again.`,
      }));
      continue;
    }
    const inlineFiles: GradeAttachment[] = [
      ...visuals.parts,
      ...(options.extraAttachments ?? []),
    ];

    // Run any code the student submitted (returns null with no network when there
    // is nothing runnable). A coordinated dispatch propagates an uncertain
    // sandbox outcome so the reservation stays fenced.
    const codeRun = evidenceOnly ? null : precomputedCodeRun ?? (options.autoRunCode === false ? null
      : modelExecution?.beforeDispatch
        ? await runSubmittedCode(submittedFiles, undefined, modelExecution.beforeDispatch)
        : await runSubmittedCode(submittedFiles));

    try {
      if (initialTrunc && brightspace.kind === "parsed") throw new GradeCallError("This rubric cannot be safely scored as separate discussion axes. Review manually; no grade was produced.", "model unparseable");
      const result = initialTrunc
        ? await gradeDiscussionAxes({
            student,
            initialPrompt: initialAxisPrompt,
            initialCriteria,
            initialPostAbsentConfirmed: axes?.initialPostAbsentConfirmed === true,
            replyPrompt: replyAxisPrompt,
            replyCriteria,
            initialText: initialTrunc.text,
            replyText: replyTrunc?.text ?? null,
            replyCount: axes?.replyCount ?? 0,
            provider,
            inlineFiles,
            codeRun,
            submittedFiles,
            commentSplit: commentSplit === true,
            videoGradeWindowSec,
            pointsPossible,
            callSink,
            modelExecution,
            suppressLengthDeduction: options.suppressLengthDeduction,
            lengthExemption,
          })
        : await gradeSubmission(
            evidencePrompt,
            student,
            truncatedContent + (visuals.documents.some(d => d.coverage.status === "unavailable") ? "\n[Document visual inspection unavailable for this format. Only extracted text was available; this does not establish that pictures are absent.]" : ""),
            provider,
            inlineFiles,
            pointsPossible,
            codeRun,
            submittedFiles,
            commentSplit === true,
            videoGradeWindowSec,
            callSink,
            options,
            repositoryInventories,
            lengthExemption,
            brightspace.kind === "parsed" ? brightspace.criteria : undefined
          );
      const disclosedStrengths = scoringInstructions !== assignmentInstructions || scoringRubric !== rubric ? [result.strengths, "Length requirements were not used for scoring."].filter(Boolean).join("\n\n") : result.strengths;
      const disclosedComment = composeOverallComment(disclosedStrengths, result.improvements, result.resubmitNotice);
      results.push({
        ...result,
        strengths: disclosedStrengths,
        overallComment: disclosedComment,
        feedback: formatFeedback(disclosedComment, result.rubricAreas, result.totalScore),
        mergedFileCount,
        submittedFiles,
        userId,
        codeExecution: codeRun ?? undefined,
        gradedRepo,
        gradedRef,
        linkFetch: limitedEntries[i].linkFetch,
        submissionTruncated,
      });
    } catch (error) {
      if (modelExecution && error instanceof LlmOutcomeUnknownError) throw error;
      const message =
        error instanceof Error ? error.message : "An unexpected grading error occurred.";
      callSink?.recordFailure(error instanceof GradeCallError ? error.failureClass : "unclassified");
      // A grading failure has no improvement guidance or resubmit policy to
      // offer - the whole message lives in strengths, and overallComment is
      // still composed (not authored directly) so it can never drift from it.
      // N13a Ruling 1: the message CARRIES GRADING_FAILURE_PREFIX (this is
      // byte-identical to the pre-union failure row's strengths text).
      results.push(
        buildUngradedRow(
          limitedEntries[i],
          {
            kind: "grading-failed",
            sourceIndex: i,
            student,
            canvasUserId: userId,
            message: `${GRADING_FAILURE_PREFIX}${message}`,
          },
          codeRun,
          submissionTruncated
        )
      );
    }

    // Skip the inter-request sleep when the next iteration would be refused
    // by the deadline anyway - that would spend exactly the budget the
    // deadline exists to protect.
    const nextRefused = deadlineMs !== undefined && Date.now() >= deadlineMs;
    if (interRequestDelayMs > 0 && i < limitedEntries.length - 1 && !nextRefused) {
      await sleep(interRequestDelayMs);
    }
  }

  // N13a section 3: not-attempted rows are appended here - after the loop
  // closes, in ascending sourceIndex order - and MUST land before canonical-
  // column reconciliation below, never after it. Appended after, an empty-
  // canonical run (see class-trends.ts's exclusion) raises totalResults
  // without raising any area's resultsWithArea and silently switches every
  // counted class-trends clause off. Because the loop only ever attempts a
  // PREFIX of studentSubmissions and everything from the stop point onward
  // is not-attempted, results[i] corresponds to studentSubmissions[i] for
  // every i, and results.length === studentSubmissions.length - strictly
  // stronger than the pre-N13a contract, where results was truncated at
  // maxSubmissions.
  //
  // Two tails, both ascending, so the combined order stays ascending: the
  // run-deadline tail (indices the loop refused to start once the deadline
  // passed) always precedes the submission-count-bound tail (indices sliced
  // off before the loop ever began).
  const deadlineTailStart = deadlineStoppedAt ?? limitedEntries.length;
  for (let i = deadlineTailStart; i < limitedEntries.length; i += 1) {
    const entry = limitedEntries[i];
    results.push(
      buildUngradedRow(entry, {
        kind: "not-attempted",
        stoppedBy: "run-deadline",
        source,
        sourceIndex: i,
        student: entry.student,
        canvasUserId: entry.userId,
        message: UNGRADED_NOT_ATTEMPTED_MESSAGES["run-deadline"],
      })
    );
  }
  for (let i = limitedEntries.length; i < studentSubmissions.length; i += 1) {
    const entry = studentSubmissions[i];
    results.push(
      buildUngradedRow(entry, {
        kind: "not-attempted",
        stoppedBy: "submission-count-bound",
        source,
        sourceIndex: i,
        student: entry.student,
        canvasUserId: entry.userId,
        // A31-R2: the engine, and only the engine, appends this sentence,
        // because it is the only layer that holds the number (docs/a31-
        // scope.md 5.2) - a past-tense statement about the run that
        // happened, reading the same value the run used, appended rather
        // than interpolated so the shared sentence stays a literal a human
        // reviews once.
        message: `${UNGRADED_NOT_ATTEMPTED_MESSAGES["submission-count-bound"]} This run's limit was ${maxSubmissions} submissions.`,
      })
    );
  }

  // Pin every student to ONE shared set of criteria so the results table never
  // splits. Canonical = the rubric's parsed criteria; if the rubric had none to
  // parse, reconcileRun falls back to the student the model gave the most
  // areas (so independent per-student calls still line up on a common set).
  // A39 wave 4b: this used to be ~60 lines of inline mutation here; it is now
  // a call into the pure projection reconcile.ts holds, so the incremental
  // seam (wave 4c) can reconcile the same way one item at a time.
  const reconciled = evidenceOnly ? { results, rubricAreaNames: criteria.map((c) => c.name) } : reconcileRun(results, criteria.map((c) => c.name));

  return {
    results: reconciled.results,
    rubricAreaNames: reconciled.rubricAreaNames,
    fullCreditChecklist: [],
    // A39 wave 2: every run stamps the rubric it actually graded against and
    // that rubric's content fingerprint, read from THIS call's own `rubric`
    // parameter - never from whatever a caller may have separately
    // persisted (docs/a39-architecture.md 6.4, W2-3's removal test).
    ...stampRubricProvenance(rubric),
  };
}

/** Grade all submissions in the provided zip archive. */
export async function gradeSubmissions(
  zipBuffer: ArrayBuffer,
  assignmentInstructions: string,
  rubric: string,
  provider: LlmProvider = "gemini",
  options: GradingRunOptions = {}
): Promise<GradingRun> {
  const { ingestZipEntries } = await import("./extraction");

  // Extract -> refuse -> infer -> group is the shared chain in ingestZipEntries
  // (extraction.ts); the engine always infers (D1), so it always passes its
  // provider. The zero-entry policy below stays the engine's own.
  const {
    entries: studentSubmissions,
    attemptedSupportedFiles,
    failedSupportedFiles,
  } = await ingestZipEntries(zipBuffer, { inferFileNamesWith: provider, knownStudents: options.knownStudents, requireSupportedFiles: true });
  if (studentSubmissions.length === 0) {
    if (attemptedSupportedFiles > 0) {
      const failedPreview = failedSupportedFiles.slice(0, 3).join(", ");
      const failedSuffix = failedPreview ? ` Example files: ${failedPreview}.` : "";

      throw new Error(
        `Found supported files, but could not extract text from them.${failedSuffix} If possible, use .docx/.pptx/.xlsx files with selectable text (not scanned images).`
      );
    }

    return {
      results: [],
      rubricAreaNames: [],
      fullCreditChecklist: [],
      ...stampRubricProvenance(rubric),
    };
  }

  return gradeStudentEntries(
    studentSubmissions,
    assignmentInstructions,
    rubric,
    provider,
    null,
    options
  );
}

/**
 * Grade a list of pre-built submission entries (e.g. one per GitHub repo) against a rubric.
 * A thin public wrapper over the shared grading path so non-Canvas, non-zip
 * sources can produce identical runs.
 */
export async function gradeEntries(
  entries: StudentSubmissionEntry[],
  assignmentInstructions: string,
  rubric: string,
  provider: LlmProvider = "gemini",
  pointsPossible: number | null = null,
  options: GradingRunOptions = {}
): Promise<GradingRun> {
  return gradeStudentEntries(entries, assignmentInstructions, rubric, provider, pointsPossible, options);
}

/**
 * Grade a Canvas discussion or assignment from its URL (auto-detected), one
 * student per participant/submission, reusing the same grading core as the zip
 * path. Canvas gives exact student names, so no filename inference is needed.
 */
export async function gradeCanvasUrl(
  url: string,
  assignmentInstructions: string,
  rubric: string,
  provider: LlmProvider = "gemini",
  options: GradingRunOptions = {},
  prefetchedStudents?: import("../canvas").CanvasStudentWork[]
): Promise<GradingRun> {
  const { fetchCanvasWork, fetchAssignmentPointsPossible } = await import("../canvas");
  const { canvasWorkToEntry, disambiguateCanvasEntries } = await import("./extraction");

  const [{ students }, pointsPossible] = await Promise.all([
    prefetchedStudents ? Promise.resolve({ students: prefetchedStudents }) : fetchCanvasWork(url),
    fetchAssignmentPointsPossible(url),
  ]);

  const identityRefusal = canvasOmissionIdentityRefusal(students);
  if (identityRefusal) throw new Error(identityRefusal);
  if (students.length === 0) {
    return {
      results: [],
      rubricAreaNames: [],
      fullCreditChecklist: [],
      ...stampRubricProvenance(rubric),
    };
  }

  const entries: StudentSubmissionEntry[] = [];
  for (const work of students) {
    entries.push(await canvasWorkToEntry(work));
  }

  // RULING 129: this whole-run Canvas path is not behind
  // INCREMENTAL_ROUTE_ENABLED - it is live today - so it needs the same
  // display disambiguation extractCanvasEntries gets. See
  // extraction.ts's disambiguateCanvasEntries for the full rationale.
  return gradeStudentEntries(
    disambiguateCanvasEntries(entries),
    assignmentInstructions,
    rubric,
    provider,
    pointsPossible,
    { ...options, source: "canvas" }
  );
}
