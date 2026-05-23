import JSZip from "jszip";
import { OfficeParser, type SupportedFileType } from "officeparser";
import {
  getGeminiApiKey,
  getGeminiInterRequestDelayMs,
  getGeminiMaxCharsPerSubmission,
  getGeminiMaxOutputTokens,
  getGeminiMaxSubmissions,
  getGeminiModel,
} from "./gemini";

const TEXT_EXTENSIONS = new Set([
  "txt",
  "md",
  "markdown",
  "py",
  "js",
  "ts",
  "tsx",
  "jsx",
  "java",
  "c",
  "cpp",
  "cs",
  "html",
  "htm",
  "css",
  "json",
  "xml",
  "rb",
  "go",
  "rs",
  "csv",
  "ipynb",
  "yml",
  "yaml",
  "sql",
  "sh",
  "bash",
  "zsh",
  "php",
  "swift",
  "kt",
  "kts",
  "scala",
  "r",
  "m",
  "tex",
]);

const DOCUMENT_EXTENSIONS = new Set([
  "docx",
  "doc",
  "pptx",
  "ppt",
  "xlsx",
  "xls",
  "odt",
  "odp",
  "ods",
  "pdf",
  "rtf",
]);

const OFFICE_FILE_TYPE_HINTS: Record<string, SupportedFileType> = {
  docx: "docx",
  pptx: "pptx",
  xlsx: "xlsx",
  odt: "odt",
  odp: "odp",
  ods: "ods",
  pdf: "pdf",
  rtf: "rtf",
};

const MAX_NESTED_ZIP_DEPTH = 3;

function getFileExtension(name: string): string {
  const lastDot = name.lastIndexOf(".");
  if (lastDot === -1 || lastDot === name.length - 1) {
    return "";
  }

  return name.slice(lastDot + 1).toLowerCase();
}

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function normalizeWhitespace(value: string): string {
  return value
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function extractDocxText(buffer: Buffer): Promise<string | null> {
  const zip = await JSZip.loadAsync(buffer);
  const documentXml = zip.file("word/document.xml");

  if (!documentXml) {
    return null;
  }

  let xml = await documentXml.async("string");
  xml = xml
    .replace(/<w:tab\s*\/?>/g, "\t")
    .replace(/<w:br\s*\/?>/g, "\n")
    .replace(/<w:p[^>]*>/g, "\n")
    .replace(/<[^>]+>/g, "");

  return normalizeWhitespace(decodeXmlEntities(xml));
}

async function extractPptxText(buffer: Buffer): Promise<string | null> {
  const zip = await JSZip.loadAsync(buffer);
  const slideFiles = Object.values(zip.files)
    .filter((entry) => /^ppt\/slides\/slide\d+\.xml$/i.test(entry.name))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));

  if (slideFiles.length === 0) {
    return null;
  }

  const slides: string[] = [];

  for (const slide of slideFiles) {
    const xml = await slide.async("string");
    const textMatches = Array.from(xml.matchAll(/<a:t[^>]*>([\s\S]*?)<\/a:t>/g));
    const text = textMatches
      .map((match) => decodeXmlEntities(match[1] ?? "").trim())
      .filter(Boolean)
      .join("\n");

    if (text) {
      slides.push(text);
    }
  }

  return normalizeWhitespace(slides.join("\n\n"));
}

async function extractXlsxText(buffer: Buffer): Promise<string | null> {
  const zip = await JSZip.loadAsync(buffer);
  const sharedStringsFile = zip.file("xl/sharedStrings.xml");

  if (!sharedStringsFile) {
    return null;
  }

  const xml = await sharedStringsFile.async("string");
  const matches = Array.from(xml.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g));
  const values = matches
    .map((match) => decodeXmlEntities(match[1] ?? "").trim())
    .filter(Boolean);

  if (values.length === 0) {
    return null;
  }

  return normalizeWhitespace(values.join("\n"));
}

async function extractTextFromFile(
  name: string,
  file: JSZip.JSZipObject
): Promise<string | null> {
  const extension = getFileExtension(name);

  if (TEXT_EXTENSIONS.has(extension)) {
    return file.async("string");
  }

  if (DOCUMENT_EXTENSIONS.has(extension)) {
    const buffer = await file.async("nodebuffer");

    // OOXML fallbacks are resilient for common LMS submissions.
    if (extension === "docx") {
      const docxText = await extractDocxText(buffer);
      if (docxText) {
        return docxText;
      }
    }

    if (extension === "pptx") {
      const pptxText = await extractPptxText(buffer);
      if (pptxText) {
        return pptxText;
      }
    }

    if (extension === "xlsx") {
      const xlsxText = await extractXlsxText(buffer);
      if (xlsxText) {
        return xlsxText;
      }
    }

    const fileType = OFFICE_FILE_TYPE_HINTS[extension];
    const ast = fileType
      ? await OfficeParser.parseOffice(buffer, { fileType })
      : await OfficeParser.parseOffice(buffer);

    const conversion = await ast.to("text");
    return typeof conversion.value === "string"
      ? normalizeWhitespace(conversion.value)
      : null;
  }

  return null;
}

export interface RubricAreaResult {
  area: string;
  score: string;
  comment: string;
}

export interface SubmittedFileInfo {
  name: string;
  extension: string;
}

export interface GradeResult {
  student: string;
  overallComment: string;
  rubricAreas: RubricAreaResult[];
  totalScore: string;
  feedback: string;
  mergedFileCount: number;
  submittedFiles: SubmittedFileInfo[];
}

export interface GradingRun {
  results: GradeResult[];
  rubricAreaNames: string[];
}

/** Extract text-based files from a zip archive. */
async function extractSubmissions(
  zipBuffer: ArrayBuffer
): Promise<{
  submissions: Record<string, string>;
  attemptedSupportedFiles: number;
  failedSupportedFiles: string[];
}> {
  const submissions: Record<string, string> = {};
  let attemptedSupportedFiles = 0;
  const failedSupportedFiles: string[] = [];

  async function collectFromZip(
    zip: JSZip,
    depth: number,
    parentPath: string
  ): Promise<void> {
    await Promise.all(
      Object.entries(zip.files).map(async ([name, file]) => {
        if (file.dir) return;

        const fullName = parentPath ? `${parentPath}/${name}` : name;
        const extension = getFileExtension(name);
        const isSupportedFile =
          TEXT_EXTENSIONS.has(extension) || DOCUMENT_EXTENSIONS.has(extension);

        if (extension === "zip" && depth < MAX_NESTED_ZIP_DEPTH) {
          try {
            const nestedBuffer = await file.async("arraybuffer");
            const nestedZip = await JSZip.loadAsync(nestedBuffer);
            await collectFromZip(nestedZip, depth + 1, fullName);
          } catch {
            // Continue when a nested archive cannot be opened.
          }
          return;
        }

        if (!isSupportedFile) {
          return;
        }

        attemptedSupportedFiles += 1;

        try {
          const extractedText = await extractTextFromFile(name, file);
          if (extractedText && extractedText.trim()) {
            submissions[fullName] = extractedText;
          } else {
            failedSupportedFiles.push(fullName);
          }
        } catch {
          failedSupportedFiles.push(fullName);
        }
      })
    );
  }

  const zip = await JSZip.loadAsync(zipBuffer);
  await collectFromZip(zip, 0, "");

  return {
    submissions,
    attemptedSupportedFiles,
    failedSupportedFiles,
  };
}

/** Build a system prompt for the grader. */
function buildSystemPrompt(
  assignmentInstructions: string,
  rubric: string
): string {
  return `You are a teaching assistant helping to grade student submissions.

ASSIGNMENT INSTRUCTIONS:
${assignmentInstructions}

RUBRIC:
${rubric}

Grade each student submission against the rubric and respond ONLY in JSON using this shape:
{
  "overallComment": "short overall feedback",
  "rubricResults": [
    {
      "area": "criterion name",
      "score": "numeric or text score",
      "comment": "criterion-specific comment"
    }
  ]
}

Rules:
- Include one rubricResults item for each rubric area.
- Keep comments concise and actionable.
- For every deduction, explicitly cite the affected rubric area and the exact reason from the submission.
- In overallComment, reference rubric areas by name when summarizing strengths and weaknesses.
- Every score must include what it is out of, in the format earned/possible (for example 7/10).
- Every comment must cite specific evidence with exact file names from the submission.
- Do not prefix citations with "Evidence:".
- Cite only the assignment filename portion (from format studentname_date_time_filename), excluding studentname/date/time prefix.
- Cite file-specific evidence for both positive and negative feedback.
- Maintain at least a 2:1 positive-to-negative ratio: for every negative feedback point, include at least two distinct positive feedback points.
- Write each rubricResults comment in a professional, warm, and slightly casual tone.
- Write overallComment in a professional, warm, and slightly casual tone.
- Do not address the student directly; never use the student's name or second-person words like "you" or "your".
- Do not include markdown fences or any text outside the JSON object.`;
}

function extractJsonObject(raw: string): string | null {
  const trimmed = raw.trim();
  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fencedMatch?.[1]?.trim() ?? trimmed;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");

  if (start === -1 || end === -1 || end <= start) {
    return null;
  }

  return candidate.slice(start, end + 1);
}

function normalizeText(value: unknown): string {
  if (typeof value !== "string") {
    if (typeof value === "number") {
      return String(value);
    }

    return "";
  }

  return value.trim();
}

function toRubricAreaResult(value: unknown): RubricAreaResult | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const item = value as { area?: unknown; score?: unknown; comment?: unknown };
  const area = normalizeText(item.area);

  if (!area) {
    return null;
  }

  return {
    area,
    score: normalizeText(item.score),
    comment: normalizeText(item.comment),
  };
}

function parseRubricResponse(raw: string): {
  overallComment: string;
  rubricAreas: RubricAreaResult[];
  totalScore: string;
} {
  const jsonText = extractJsonObject(raw);

  if (!jsonText) {
    return {
      overallComment: raw.trim() || "No feedback generated.",
      rubricAreas: [
        {
          area: "Overall",
          score: "",
          comment: raw.trim() || "No feedback generated.",
        },
      ],
      totalScore: "",
    };
  }

  try {
    const parsed = JSON.parse(jsonText) as {
      overallComment?: unknown;
      rubricResults?: unknown;
      totalScore?: unknown;
    };

    const rubricAreas = Array.isArray(parsed.rubricResults)
      ? parsed.rubricResults
          .map((item) => toRubricAreaResult(item))
          .filter((item): item is RubricAreaResult => item !== null)
      : [];

    const overallComment =
      normalizeText(parsed.overallComment) || "No overall comment provided.";

    if (rubricAreas.length === 0) {
      return {
        overallComment,
        rubricAreas: [
          {
            area: "Overall",
            score: "",
            comment: overallComment,
          },
        ],
        totalScore: normalizeText(parsed.totalScore),
      };
    }

    return {
      overallComment,
      rubricAreas,
      totalScore: normalizeText(parsed.totalScore),
    };
  } catch {
    return {
      overallComment: raw.trim() || "No feedback generated.",
      rubricAreas: [
        {
          area: "Overall",
          score: "",
          comment: raw.trim() || "No feedback generated.",
        },
      ],
      totalScore: "",
    };
  }
}

function parseEarnedPossibleScore(
  score: string
): { earned: number; possible: number } | null {
  const match = score.match(/(-?\d+(?:\.\d+)?)\s*\/\s*(-?\d+(?:\.\d+)?)/);
  if (!match) {
    return null;
  }

  const earned = Number.parseFloat(match[1]);
  const possible = Number.parseFloat(match[2]);

  if (!Number.isFinite(earned) || !Number.isFinite(possible) || possible <= 0) {
    return null;
  }

  return { earned, possible };
}

function formatScoreNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function deriveTotalScore(
  explicitTotalScore: string,
  rubricAreas: RubricAreaResult[]
): string {
  if (explicitTotalScore.trim()) {
    return explicitTotalScore;
  }

  let earnedTotal = 0;
  let possibleTotal = 0;
  let parsedCount = 0;

  for (const area of rubricAreas) {
    const parsed = parseEarnedPossibleScore(area.score);
    if (!parsed) {
      continue;
    }

    earnedTotal += parsed.earned;
    possibleTotal += parsed.possible;
    parsedCount += 1;
  }

  if (parsedCount === 0 || possibleTotal <= 0) {
    return "";
  }

  return `${formatScoreNumber(earnedTotal)}/${formatScoreNumber(possibleTotal)}`;
}

function formatFeedback(
  overallComment: string,
  rubricAreas: RubricAreaResult[],
  totalScore: string
): string {
  const lines: string[] = [];

  if (totalScore) {
    lines.push(`Total Score: ${totalScore}`);
  }

  for (const area of rubricAreas) {
    const label = area.score
      ? `${area.area} (Score: ${area.score})`
      : area.area;
    lines.push(`${label}: ${area.comment || "No comment provided."}`);
  }

  lines.push(`Overall: ${overallComment}`);
  return lines.join("\n");
}

function normalizeGeminiError(status: number, errorBody: string): string {
  if (status === 429) {
    return "Gemini quota exceeded for this project. Reduce run size, wait for quota reset, enable billing, or switch providers (for example Groq).";
  }

  if (status === 404 && errorBody.includes("no longer available")) {
    return "The configured Gemini model is not available for this account. Set GEMINI_MODEL to a current model such as gemini-3.1-flash-lite and try again.";
  }

  try {
    const parsed = JSON.parse(errorBody) as {
      error?: {
        message?: string;
      };
    };

    const message = parsed.error?.message?.trim();
    if (message) {
      return `Gemini request failed (${status}): ${message}`;
    }
  } catch {
    // Keep the fallback below when the provider response is not valid JSON.
  }

  return `Gemini request failed (${status}): ${errorBody}`;
}

function truncateSubmission(content: string, maxChars: number): string {
  if (content.length <= maxChars) {
    return content;
  }

  const omitted = content.length - maxChars;
  return `${content.slice(0, maxChars)}\n\n[Truncated ${omitted} characters to stay within configured grading limits.]`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getBaseFileName(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  const segments = normalized.split("/");
  return segments[segments.length - 1] ?? path;
}

function removeLastExtension(fileName: string): string {
  const lastDot = fileName.lastIndexOf(".");
  if (lastDot <= 0) {
    return fileName;
  }

  return fileName.slice(0, lastDot);
}

function parseSubmissionFileName(filePath: string): {
  studentKey: string;
  studentDisplay: string;
  citationFileName: string;
  extension: string;
} {
  const baseName = getBaseFileName(filePath);
  const parts = baseName.split("_");

  // Expected format: studentname_date_time_filename
  if (parts.length >= 4) {
    const studentPart = parts[0].trim();
    const filePart = parts.slice(3).join("_").trim();

    if (studentPart && filePart) {
      return {
        studentKey: studentPart.toLowerCase(),
        studentDisplay: studentPart,
        citationFileName: filePart,
        extension: getFileExtension(filePart) || "(none)",
      };
    }
  }

  const stem = removeLastExtension(baseName);
  const match = stem.match(/^([A-Za-z0-9]+)/);
  const fallbackStudent = (match?.[1] ?? stem).trim() || "unknown";

  return {
    studentKey: fallbackStudent.toLowerCase(),
    studentDisplay: fallbackStudent,
    citationFileName: baseName,
    extension: getFileExtension(baseName) || "(none)",
  };
}

function inferStudentPrefix(filePath: string): { key: string; display: string } {
  const parsed = parseSubmissionFileName(filePath);
  return {
    key: parsed.studentKey,
    display: parsed.studentDisplay,
  };
}

function groupSubmissionsByStudent(
  submissions: Record<string, string>
): Array<{
  student: string;
  content: string;
  mergedFileCount: number;
  submittedFiles: SubmittedFileInfo[];
}> {
  const grouped = new Map<string, { student: string; files: Array<[string, string]> }>();

  for (const [filePath, content] of Object.entries(submissions)) {
    const inferred = inferStudentPrefix(filePath);
    const existing = grouped.get(inferred.key);

    if (!existing) {
      grouped.set(inferred.key, {
        student: inferred.display,
        files: [[filePath, content]],
      });
      continue;
    }

    existing.files.push([filePath, content]);
  }

  const entries = Array.from(grouped.values());
  entries.sort((a, b) => a.student.localeCompare(b.student));

  return entries.map((entry) => {
    const mergedContent = entry.files
      .map(([filePath, content]) => {
        const parsed = parseSubmissionFileName(filePath);
        return `File: ${parsed.citationFileName}\n\n${content}`;
      })
      .join("\n\n---\n\n");

    const submittedFiles = entry.files.map(([filePath]) => {
      const parsed = parseSubmissionFileName(filePath);

      return {
        name: parsed.citationFileName,
        extension: parsed.extension,
      };
    });

    return {
      student: entry.student,
      content: mergedContent,
      mergedFileCount: entry.files.length,
      submittedFiles,
    };
  });
}

/** Grade a single student submission. */
async function gradeSubmission(
  systemPrompt: string,
  studentName: string,
  content: string
): Promise<GradeResult> {
  const apiKey = getGeminiApiKey();
  const model = getGeminiModel();
  const maxOutputTokens = getGeminiMaxOutputTokens();

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: systemPrompt }],
        },
        contents: [
          {
            role: "user",
            parts: [
              {
                text: `Student: ${studentName}\n\nSubmission:\n${content}`,
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens,
        },
      }),
    }
  );

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(normalizeGeminiError(response.status, errorBody));
  }

  const data = (await response.json()) as {
    candidates?: Array<{
      content?: {
        parts?: Array<{
          text?: string;
        }>;
      };
    }>;
  };

  const feedback =
    data.candidates?.[0]?.content?.parts
      ?.map((part) => part.text ?? "")
      .join("")
      .trim() || "No feedback generated.";
  const parsed = parseRubricResponse(feedback);
  const totalScore = deriveTotalScore(parsed.totalScore, parsed.rubricAreas);

  return {
    student: studentName,
    overallComment: parsed.overallComment,
    rubricAreas: parsed.rubricAreas,
    totalScore,
    mergedFileCount: 1,
    submittedFiles: [],
    feedback: formatFeedback(
      parsed.overallComment,
      parsed.rubricAreas,
      totalScore
    ),
  };
}

/** Grade all submissions in the provided zip archive. */
export async function gradeSubmissions(
  zipBuffer: ArrayBuffer,
  assignmentInstructions: string,
  rubric: string
): Promise<GradingRun> {
  const { submissions, attemptedSupportedFiles, failedSupportedFiles } =
    await extractSubmissions(zipBuffer);

  const studentSubmissions = groupSubmissionsByStudent(submissions);
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
    };
  }

  const maxSubmissions = getGeminiMaxSubmissions();
  const maxCharsPerSubmission = getGeminiMaxCharsPerSubmission();
  const interRequestDelayMs = getGeminiInterRequestDelayMs();

  const limitedEntries = studentSubmissions.slice(0, maxSubmissions);
  const systemPrompt = buildSystemPrompt(assignmentInstructions, rubric);
  const results: GradeResult[] = [];

  for (let i = 0; i < limitedEntries.length; i += 1) {
    const { student, content, mergedFileCount, submittedFiles } = limitedEntries[i];
    const truncated = truncateSubmission(content, maxCharsPerSubmission);

    const result = await gradeSubmission(systemPrompt, student, truncated);
    results.push({ ...result, mergedFileCount, submittedFiles });

    if (interRequestDelayMs > 0 && i < limitedEntries.length - 1) {
      await sleep(interRequestDelayMs);
    }
  }

  const rubricAreaNames: string[] = [];
  const seenAreas = new Set<string>();

  for (const result of results) {
    for (const area of result.rubricAreas) {
      if (!seenAreas.has(area.area)) {
        seenAreas.add(area.area);
        rubricAreaNames.push(area.area);
      }
    }
  }

  return {
    results,
    rubricAreaNames,
  };
}
