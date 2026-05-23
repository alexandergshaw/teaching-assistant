import JSZip from "jszip";
import {
  getGeminiApiKey,
  getGeminiInterRequestDelayMs,
  getGeminiMaxCharsPerSubmission,
  getGeminiMaxOutputTokens,
  getGeminiMaxSubmissions,
  getGeminiModel,
} from "./gemini";

export interface GradeResult {
  student: string;
  feedback: string;
}

export interface GradingRun {
  results: GradeResult[];
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

      // Only attempt to read text-like files
      const lower = name.toLowerCase();
      const isText =
        lower.endsWith(".txt") ||
        lower.endsWith(".md") ||
        lower.endsWith(".py") ||
        lower.endsWith(".js") ||
        lower.endsWith(".ts") ||
        lower.endsWith(".java") ||
        lower.endsWith(".c") ||
        lower.endsWith(".cpp") ||
        lower.endsWith(".cs") ||
        lower.endsWith(".html") ||
        lower.endsWith(".css") ||
        lower.endsWith(".json") ||
        lower.endsWith(".xml") ||
        lower.endsWith(".rb") ||
        lower.endsWith(".go") ||
        lower.endsWith(".rs");

      if (isText) {
        submissions[name] = await file.async("string");
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

Grade each student submission against the rubric. Be constructive and specific. 
Return your feedback as plain text.`;
}

function normalizeGeminiError(status: number, errorBody: string): string {
  if (status === 429) {
    return "Gemini quota exceeded for this project. Reduce run size, wait for quota reset, enable billing, or switch providers (for example Groq).";
  }

  if (status === 404 && errorBody.includes("no longer available")) {
    return "The configured Gemini model is not available for this account. Set GEMINI_MODEL to a current model such as gemini-2.5-flash and try again.";
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

  return { student: studentName, feedback };
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
    return { results: [] };
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

  return { results };
}
