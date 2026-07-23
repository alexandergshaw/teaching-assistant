import {
  getGeminiInterRequestDelayMs,
  getGeminiMaxCharsPerSubmission,
  getGeminiMaxOutputTokens,
  getGeminiMaxSubmissions,
} from "../gemini";
import { callLlm, type LlmPart, type LlmProvider } from "../llm";
import { runSubmittedCode, type CodeRunResult } from "../code-runner";
import { RESUBMIT_NOTICE, type GradeResult, type GradingRun, type StudentSubmissionEntry, type RubricAreaResult } from "./types";
import { GEMINI_IMAGE_MIME_TYPES } from "./constants";
import { truncateSubmission, sleep, buildCodeExecutionNote } from "./utils";
import { parseRubricResponse, pointsWereDeducted, deriveTotalScore, scaleResultToPoints, formatFeedback, normalizeGeminiError } from "./parsing";
import { buildSystemPrompt, normalizeAreaName, extractRubricCriteria } from "./rubric";

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
  codeRun: CodeRunResult | null = null
): Promise<GradeResult> {
  const maxOutputTokens = getGeminiMaxOutputTokens();

  const imageNote =
    imageFiles.length > 0
      ? `\n\nThe student also submitted ${imageFiles.length} image file(s) (e.g. required screenshots), attached below: ${imageFiles
          .map((f) => f.name)
          .join(", ")}. Treat them as part of the submission and evaluate them against the rubric.`
      : "";

  const codeNote = codeRun && !codeRun.error ? buildCodeExecutionNote(codeRun) : "";

  const parts: LlmPart[] = [
    {
      text: `${systemPrompt}\n\nStudent: ${studentName}\n\nSubmission:\n${content}${imageNote}${codeNote}`,
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

  const overallComment = pointsWereDeducted(totalScore, rubricAreas)
    ? `${parsed.overallComment} ${RESUBMIT_NOTICE}`.trim()
    : parsed.overallComment;

  return {
    student: studentName,
    overallComment,
    rubricAreas,
    totalScore,
    mergedFileCount: 1,
    submittedFiles: [],
    feedback: formatFeedback(overallComment, rubricAreas, totalScore),
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
  pointsPossible: number | null = null
): Promise<GradingRun> {
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

  for (let i = 0; i < limitedEntries.length; i += 1) {
    const { student, content, mergedFileCount, submittedFiles, userId, codeRun: precomputedCodeRun } = limitedEntries[i];
    const truncated = truncateSubmission(content, maxCharsPerSubmission);

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
        truncated,
        provider,
        imageFiles,
        pointsPossible,
        codeRun
      );
      results.push({ ...result, mergedFileCount, submittedFiles, userId, codeExecution: codeRun ?? undefined });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "An unexpected grading error occurred.";
      const overallComment = `This submission could not be graded: ${message}`;
      const fallbackRubricAreas: RubricAreaResult[] = [
        {
          area: "Overall",
          score: "",
          comment: overallComment,
        },
      ];

      results.push({
        student,
        overallComment,
        rubricAreas: fallbackRubricAreas,
        totalScore: "",
        mergedFileCount,
        submittedFiles,
        feedback: formatFeedback(overallComment, fallbackRubricAreas, ""),
        userId,
        codeExecution: codeRun ?? undefined,
      });
    }

    if (interRequestDelayMs > 0 && i < limitedEntries.length - 1) {
      await sleep(interRequestDelayMs);
    }
  }

  // Pin every student to ONE shared set of criteria so the results table never
  // splits. Canonical = the rubric's parsed criteria; if the rubric had none to
  // parse, fall back to the student the model gave the most areas (so independent
  // per-student calls still line up on a common set).
  let canonical = criteria.map((c) => c.name);
  if (canonical.length === 0) {
    let richest: RubricAreaResult[] = [];
    for (const result of results) {
      const real = result.rubricAreas.filter((a) => a.area && a.area !== "Overall");
      if (real.length > richest.length) richest = real;
    }
    canonical = richest.map((a) => a.area);
  }

  if (canonical.length > 0) {
    // Force each student's areas onto the canonical columns: rename a normalized
    // match to the canonical name, fill a missing criterion blank, and fold any
    // unmatched area the model invented into the overall comment so the columns
    // stay aligned without dropping feedback.
    for (const result of results) {
      const byNorm = new Map<string, RubricAreaResult>();
      for (const area of result.rubricAreas) {
        const key = normalizeAreaName(area.area);
        if (key && !byNorm.has(key)) byNorm.set(key, area);
      }
      const reconciled: RubricAreaResult[] = [];
      for (const name of canonical) {
        const key = normalizeAreaName(name);
        const match = byNorm.get(key);
        if (match) {
          reconciled.push({ ...match, area: name });
          byNorm.delete(key);
        } else {
          reconciled.push({ area: name, score: "", comment: "" });
        }
      }
      const strays = [...byNorm.values()].filter((a) => a.comment.trim());
      if (strays.length > 0) {
        const extra = strays.map((a) => `${a.area}: ${a.comment.trim()}`).join(" ");
        result.overallComment = result.overallComment ? `${result.overallComment} ${extra}` : extra;
      }
      result.rubricAreas = reconciled;
    }
  }

  // Columns are the canonical set when we have one; otherwise the union of
  // whatever areas came back (last resort when nothing parsed and no results).
  let rubricAreaNames: string[];
  if (canonical.length > 0) {
    rubricAreaNames = canonical;
  } else {
    rubricAreaNames = [];
    const seenAreas = new Set<string>();
    for (const result of results) {
      for (const area of result.rubricAreas) {
        if (!seenAreas.has(area.area)) {
          seenAreas.add(area.area);
          rubricAreaNames.push(area.area);
        }
      }
    }
  }

  return {
    results,
    rubricAreaNames,
    fullCreditChecklist: [],
  };
}

/** Grade all submissions in the provided zip archive. */
export async function gradeSubmissions(
  zipBuffer: ArrayBuffer,
  assignmentInstructions: string,
  rubric: string,
  provider: LlmProvider = "gemini"
): Promise<GradingRun> {
  const { extractSubmissions } = await import("./extraction");
  const { inferFileNameConvention } = await import("./rubric");
  const { groupSubmissionsByStudent } = await import("./utils");

  const { submissions, rawData, attemptedSupportedFiles, failedSupportedFiles } =
    await extractSubmissions(zipBuffer);

  const rawFileNames = Object.keys(submissions);
  const inferredFileNameLookup = await inferFileNameConvention(rawFileNames, provider);
  const studentSubmissions = groupSubmissionsByStudent(
    submissions,
    inferredFileNameLookup,
    rawData
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
    };
  }

  return gradeStudentEntries(
    studentSubmissions,
    assignmentInstructions,
    rubric,
    provider
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
  pointsPossible: number | null = null
): Promise<GradingRun> {
  return gradeStudentEntries(entries, assignmentInstructions, rubric, provider, pointsPossible);
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
  provider: LlmProvider = "gemini"
): Promise<GradingRun> {
  const { fetchCanvasWork, fetchAssignmentPointsPossible } = await import("../canvas");
  const { canvasWorkToEntry } = await import("./extraction");

  const [{ students }, pointsPossible] = await Promise.all([
    fetchCanvasWork(url),
    fetchAssignmentPointsPossible(url),
  ]);

  if (students.length === 0) {
    return { results: [], rubricAreaNames: [], fullCreditChecklist: [] };
  }

  const entries: StudentSubmissionEntry[] = [];
  for (const work of students) {
    entries.push(await canvasWorkToEntry(work));
  }

  return gradeStudentEntries(entries, assignmentInstructions, rubric, provider, pointsPossible);
}
