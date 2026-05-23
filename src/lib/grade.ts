import JSZip from "jszip";
import openai from "./openai";

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

/** Grade a single student submission. */
async function gradeSubmission(
  systemPrompt: string,
  studentName: string,
  content: string
): Promise<GradeResult> {
  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: `Student: ${studentName}\n\nSubmission:\n${content}`,
      },
    ],
  });

  const feedback = response.choices[0]?.message?.content ?? "No feedback generated.";
  return { student: studentName, feedback };
}

/** Grade all submissions in the provided zip archive. */
export async function gradeSubmissions(
  zipBuffer: ArrayBuffer,
  assignmentInstructions: string,
  rubric: string
): Promise<GradingRun> {
  const submissions = await extractSubmissions(zipBuffer);

  if (Object.keys(submissions).length === 0) {
    return { results: [] };
  }

  const systemPrompt = buildSystemPrompt(assignmentInstructions, rubric);

  const results = await Promise.all(
    Object.entries(submissions).map(([name, content]) =>
      gradeSubmission(systemPrompt, name, content)
    )
  );

  return { results };
}
