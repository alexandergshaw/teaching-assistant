import {
  getGeminiInterRequestDelayMs,
  getGeminiMaxCharsPerSubmission,
  getGeminiMaxOutputTokens,
  getGeminiMaxSubmissions,
} from "../gemini";
import { callLlm, type LlmPart, type LlmProvider } from "../llm";
import { runSubmittedCode, type CodeRunResult } from "../code-runner";
import {
  RESUBMIT_NOTICE,
  GRADING_FAILURE_PREFIX,
  UNGRADED_NOT_ATTEMPTED_MESSAGES,
  composeOverallComment,
  type GradeResult,
  type GradedResult,
  type UngradedResult,
  type UngradedOutcome,
  type GradingRun,
  type StudentSubmissionEntry,
  type SubmittedFileInfo,
} from "./types";
import { GEMINI_IMAGE_MIME_TYPES } from "./constants";
import { truncateSubmission, sleep, buildCodeExecutionNote } from "./utils";
import { parseRubricResponse, pointsWereDeducted, deriveTotalScore, scaleResultToPoints, formatFeedback, normalizeGeminiError } from "./parsing";
import { buildSystemPrompt, extractRubricCriteria } from "./rubric";
import { buildSubmittedFileNamesBlock } from "./prompts";
// A39 wave 4b (docs/a39-waves.md 8.4.2): the canonical-column reconciliation
// that used to be inline here is now a PURE projection (reconcile.ts),
// called once after the loop closes - this is a call, not the logic itself.
import { reconcileRun } from "./reconcile";
// A39 wave 2 (docs/a39-architecture.md 5.2), tightened by RULING 57/58: the
// stamp itself (never a raw rubricFingerprint() call plus an inline literal)
// so every producer of a GradingRun - not only this file's three - stamps
// the pair the identical way. stampRubricProvenance imports rubricFingerprint
// from THIS leaf, never from ../research/rubric-bank, so stamping does not
// widen the engine's runtime import closure to include a database client
// (runtime-import-graph.test.ts is the instrument, W2-5).
import { stampRubricProvenance } from "./rubric-provenance-stamp";

/** Grade a single student submission. */
async function gradeSubmission(
  systemPrompt: string,
  studentName: string,
  content: string,
  provider: LlmProvider,
  imageFiles: Array<{ name: string; base64: string; mimeType: string }> = [],
  // When set (the Canvas path), re-base the total onto the assignment's real
  // points so the tool grades out of the same total Canvas shows.
  pointsPossible: number | null = null,
  codeRun: CodeRunResult | null = null,
  // The real submitted file names, given to the model as an explicit list
  // (see buildSubmittedFileNamesBlock) so it can check a stated filename
  // requirement by comparing two lists instead of noticing names buried in
  // the "--- FILE: path ---" headers inside `content`.
  submittedFiles: SubmittedFileInfo[] = []
): Promise<GradedResult> {
  const maxOutputTokens = getGeminiMaxOutputTokens();

  const imageNote =
    imageFiles.length > 0
      ? `\n\nThe student also submitted ${imageFiles.length} image file(s) (e.g. required screenshots), attached below: ${imageFiles
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
  const fileListBlock = buildSubmittedFileNamesBlock(submittedFiles);

  const parts: LlmPart[] = [
    {
      text: `${systemPrompt}\n\nStudent: ${studentName}${fileListBlock}\n\nSubmission:\n${content}${imageNote}${codeNote}`,
    },
    ...imageFiles.map((f) => ({
      inlineData: { mimeType: f.mimeType, data: f.base64 },
    })),
  ];

  const result = await callLlm(
    {
      contents: [{ role: "user", parts }],
      generationConfig: { temperature: 0.2, maxOutputTokens },
    },
    provider
  );

  if (!result.ok) {
    console.error(`[LLM gradeSubmission] HTTP ${result.status}:`, result.body);
    throw new Error(normalizeGeminiError(result.status, result.body));
  }

  const feedback = result.text.trim() || "No feedback generated.";
  const parsed = parseRubricResponse(feedback);
  const derivedTotal = deriveTotalScore(parsed.totalScore, parsed.rubricAreas);
  const { rubricAreas, totalScore } = scaleResultToPoints(
    parsed.rubricAreas,
    derivedTotal,
    pointsPossible
  );

  // docs/grading-results-feedback-boxes-acceptance-criteria.md, A1: the model
  // supplies strengths (still called overallComment in its JSON response -
  // what it did well plus the specific reason for each deduction) and
  // improvements (prompts.ts's new field) as two independent boxes;
  // resubmitNotice is NEVER model-generated, only this fixed-wording,
  // fixed-condition append. overallComment is the composition of all three,
  // never authored on its own.
  const strengths = parsed.overallComment;
  const improvements = parsed.improvements;
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

/**
 * N13a: options threaded through the whole gradeStudentEntries/gradeEntries/
 * gradeSubmissions/gradeCanvasUrl call chain. Optional and trailing so every
 * existing call site compiles unchanged.
 */
export interface GradingRunOptions {
  /** Absolute epoch-ms. The loop refuses to START a student at or past this.
   *  Undefined on the attended browser path, which keeps today's behaviour.
   *  A forged/too-generous value can only make the run do LESS work, so
   *  there is no authorization consequence to threading it through
   *  unauthenticated-looking layers like FormData. */
  readonly deadlineMs?: number;
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
  entry: Pick<StudentSubmissionEntry, "student" | "mergedFileCount" | "submittedFiles" | "gradedRepo" | "gradedRef">,
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
  const { deadlineMs } = options;
  const maxSubmissions = getGeminiMaxSubmissions();
  const maxCharsPerSubmission = getGeminiMaxCharsPerSubmission();
  const interRequestDelayMs = getGeminiInterRequestDelayMs();

  const limitedEntries = studentSubmissions.slice(0, maxSubmissions);
  // Pin the rubric's criteria so every student is graded on the same areas with
  // the same names (otherwise the per-student LLM calls drift, and the results
  // table shows mismatched, half-filled columns).
  const criteria = extractRubricCriteria(rubric);
  const systemPrompt = buildSystemPrompt(assignmentInstructions, rubric, criteria);
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
    const { student, content, mergedFileCount, submittedFiles, userId, codeRun: precomputedCodeRun, gradedRepo, gradedRef } = limitedEntries[i];
    const { text: truncatedContent, truncated: submissionTruncated } = truncateSubmission(
      content,
      maxCharsPerSubmission
    );

    const imageFiles = submittedFiles
      .filter(
        (f) => f.rawBase64 && f.mimeType && GEMINI_IMAGE_MIME_TYPES.has(f.mimeType)
      )
      .map((f) => ({ name: f.name, base64: f.rawBase64!, mimeType: f.mimeType! }));

    // Run any code the student submitted (returns null with no network when there
    // is nothing runnable). Never throws.
    const codeRun = precomputedCodeRun ?? (await runSubmittedCode(submittedFiles));

    try {
      const result = await gradeSubmission(
        systemPrompt,
        student,
        truncatedContent,
        provider,
        imageFiles,
        pointsPossible,
        codeRun,
        submittedFiles
      );
      results.push({
        ...result,
        mergedFileCount,
        submittedFiles,
        userId,
        codeExecution: codeRun ?? undefined,
        gradedRepo,
        gradedRef,
        submissionTruncated,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "An unexpected grading error occurred.";
      // A grading failure has no improvement guidance or resubmit policy to
      // offer - the whole message lives in strengths, and overallComment is
      // still composed (not authored directly) so it can never drift from it.
      // N13a Ruling 1: the message CARRIES GRADING_FAILURE_PREFIX (this is
      // byte-identical to the pre-union failure row's strengths text).
      results.push(
        buildUngradedRow(
          { student, mergedFileCount, submittedFiles, gradedRepo, gradedRef },
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
  const reconciled = reconcileRun(results, criteria.map((c) => c.name));

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
  const { extractSubmissions } = await import("./extraction");
  const { inferFileNameConvention } = await import("./rubric");
  const { groupSubmissionsByStudent } = await import("./utils");
  const { decideCollisionRefusal, describeCollisionRefusal } = await import("./collisionRefusal");

  const { submissions, rawData, attemptedSupportedFiles, failedSupportedFiles, zipParents } =
    await extractSubmissions(zipBuffer);

  // A44 wave 2: refuse before the model call rather than after (no zero-spend
  // guarantee is claimed either way - inferFileNameConvention below is a
  // separate ground-truth-only concern - but there is no reason to spend one
  // when the parse itself already cannot distinguish the students).
  const collisionMessage = describeCollisionRefusal(decideCollisionRefusal(submissions, zipParents), zipParents);
  if (collisionMessage) {
    throw new Error(collisionMessage);
  }

  const rawFileNames = Object.keys(submissions);
  const inferredFileNameLookup = await inferFileNameConvention(rawFileNames, provider);
  const studentSubmissions = groupSubmissionsByStudent(
    submissions,
    inferredFileNameLookup,
    rawData,
    zipParents
  );
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
  options: GradingRunOptions = {}
): Promise<GradingRun> {
  const { fetchCanvasWork, fetchAssignmentPointsPossible } = await import("../canvas");
  const { canvasWorkToEntry } = await import("./extraction");

  const [{ students }, pointsPossible] = await Promise.all([
    fetchCanvasWork(url),
    fetchAssignmentPointsPossible(url),
  ]);

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

  return gradeStudentEntries(entries, assignmentInstructions, rubric, provider, pointsPossible, options);
}
