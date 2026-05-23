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

function getFileExtension(name: string): string {
  const lastDot = name.lastIndexOf(".");
  if (lastDot === -1 || lastDot === name.length - 1) {
    return "";
  }

  return name.slice(lastDot + 1).toLowerCase();
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
    const fileType = OFFICE_FILE_TYPE_HINTS[extension];
    const ast = fileType
      ? await OfficeParser.parseOffice(buffer, { fileType })
      : await OfficeParser.parseOffice(buffer);

    const conversion = await ast.to("text");
    return typeof conversion.value === "string" ? conversion.value : null;
  }

  return null;
}

export interface RubricAreaResult {
  area: string;
  score: string;
  comment: string;
}

export interface GradeResult {
  student: string;
  overallComment: string;
  rubricAreas: RubricAreaResult[];
  totalScore: string;
  feedback: string;
}

export interface GradingRun {
  results: GradeResult[];
  rubricAreaNames: string[];
}

/** Extract text-based files from a zip archive. */
async function extractSubmissions(
  zipBuffer: ArrayBuffer
): Promise<Record<string, string>> {
  const zip = await JSZip.loadAsync(zipBuffer);
  const submissions: Record<string, string> = {};

  await Promise.all(
    Object.entries(zip.files).map(async ([name, file]) => {
      if (file.dir) return;

      try {
        const extractedText = await extractTextFromFile(name, file);
        if (extractedText && extractedText.trim()) {
          submissions[name] = extractedText;
        }
      } catch {
        // Skip files that cannot be parsed; continue grading other submissions.
      }
    })
  );

  return submissions;
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

  return {
    student: studentName,
    overallComment: parsed.overallComment,
    rubricAreas: parsed.rubricAreas,
    totalScore: parsed.totalScore,
    feedback: formatFeedback(
      parsed.overallComment,
      parsed.rubricAreas,
      parsed.totalScore
    ),
  };
}

/** Grade all submissions in the provided zip archive. */
export async function gradeSubmissions(
  zipBuffer: ArrayBuffer,
  assignmentInstructions: string,
  rubric: string
): Promise<GradingRun> {
  const submissions = await extractSubmissions(zipBuffer);

  const submissionEntries = Object.entries(submissions);
  if (submissionEntries.length === 0) {
    return {
      results: [],
      rubricAreaNames: [],
    };
  }

  const maxSubmissions = getGeminiMaxSubmissions();
  const maxCharsPerSubmission = getGeminiMaxCharsPerSubmission();
  const interRequestDelayMs = getGeminiInterRequestDelayMs();

  const limitedEntries = submissionEntries.slice(0, maxSubmissions);
  const systemPrompt = buildSystemPrompt(assignmentInstructions, rubric);
  const results: GradeResult[] = [];

  for (let i = 0; i < limitedEntries.length; i += 1) {
    const [name, content] = limitedEntries[i];
    const truncated = truncateSubmission(content, maxCharsPerSubmission);

    const result = await gradeSubmission(systemPrompt, name, truncated);
    results.push(result);

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
