"use server";

import {
  gradeSubmissions,
  synthesizeFullCreditChecklist,
  extractSubmissions,
  generateRubric,
  type GradingRun,
} from "@/lib/grade";
import { getGeminiApiKey, getGeminiModel } from "@/lib/gemini";

export interface SlideData {
  title: string;
  bullets: string[];
}

export interface GenerateLessonPlanResult {
  presentationTitle: string;
  slides: SlideData[];
}

export async function generateLessonPlanAction(
  moduleObjectives: string,
  contextText: string,
  files: Array<{ name: string; base64: string; mimeType: string }>,
  revisionPrompt?: string,
  currentSlides?: SlideData[]
): Promise<GenerateLessonPlanResult | { error: string }> {
  try {
    const apiKey = getGeminiApiKey();
    const model = getGeminiModel();

    const filesSummary =
      files.length > 0
        ? `\n\nATTACHED FILES (${files.length}):\n${files.map((f) => `- ${f.name}`).join("\n")}`
        : "";

    const revisionSection =
      revisionPrompt && currentSlides
        ? `\n\nCURRENT SLIDE DECK (JSON):\n${JSON.stringify(currentSlides, null, 2)}\n\nREVISION INSTRUCTIONS:\n${revisionPrompt}\n\nUpdate the slide deck based on the revision instructions. Preserve slides that don't need to change; modify, add, or remove slides as needed.`
        : "";

    const prompt = `You are an expert educator creating a lecture slide deck.

MODULE OBJECTIVES:
${moduleObjectives}

CONTEXT:
${contextText || "(none provided)"}${filesSummary}${revisionSection}

Create a complete set of lecture slides that fully address the module objectives. Return ONLY valid JSON:
{
  "presentationTitle": "...",
  "slides": [
    { "title": "...", "bullets": ["...", "...", "..."] }
  ]
}

Requirements:
- Each slide must have a "title" and a "bullets" array.
- Maximum 3 bullets per slide.
- Each bullet must be a single, concise idea — no sub-points.
- Use plenty of real-world analogies and concrete examples that students will immediately recognise (everyday technology, social media, sports, food, pop culture, etc.).
- The first slide should be a title/overview slide listing the key topics.
- Include enough slides to thoroughly cover every objective.
- Do not include any text outside the JSON object.`;

    const parts: Array<
      { text: string } | { inlineData: { mimeType: string; data: string } }
    > = [
      { text: prompt },
      ...files.map((f) => ({ inlineData: { mimeType: f.mimeType, data: f.base64 } })),
    ];

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts }],
          generationConfig: { temperature: 0.6, maxOutputTokens: 4096 },
        }),
      }
    );

    if (!response.ok) {
      const body = await response.text();
      return { error: `Gemini API error: HTTP ${response.status} — ${body.slice(0, 200)}` };
    }

    const data = (await response.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };

    const raw =
      data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";

    const trimmed = raw.trim();
    const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const candidate = fencedMatch?.[1]?.trim() ?? trimmed;
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start === -1 || end === -1 || end <= start) {
      return { error: "Could not parse slide data from the model response." };
    }

    const parsed = JSON.parse(candidate.slice(start, end + 1)) as {
      presentationTitle?: string;
      slides?: Array<{ title?: string; bullets?: string[] }>;
    };

    if (!parsed.slides || !Array.isArray(parsed.slides)) {
      return { error: "Model did not return a valid slides array." };
    }

    const slides: SlideData[] = parsed.slides
      .filter((s) => typeof s.title === "string" && Array.isArray(s.bullets))
      .map((s) => ({ title: s.title!, bullets: (s.bullets ?? []).slice(0, 3) }));

    return {
      presentationTitle: parsed.presentationTitle ?? "Lesson Plan",
      slides,
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "An unexpected error occurred." };
  }
}

export interface TestGeminiState {
  result: string | null;
  error: string | null;
}

export async function testGeminiAction(
  _prev: TestGeminiState,
  formData: FormData
): Promise<TestGeminiState> {
  try {
    const apiKey = getGeminiApiKey();
    const model = getGeminiModel();

    const file = formData.get("studentSubmissions") as File | null;
    if (!file || file.size === 0) {
      return { result: null, error: "Please select a zip file to test with." };
    }

    const zipBuffer = await file.arrayBuffer();
    const { submissions } = await extractSubmissions(zipBuffer);

    const entries = Object.entries(submissions);
    if (entries.length === 0) {
      return { result: null, error: "No readable text files found in the zip." };
    }

    // Take the first submission, truncated to 2000 chars to keep the request small
    const [fileName, content] = entries[0];
    const truncated = content.length > 2000 ? content.slice(0, 2000) + "\n\n[truncated]" : content;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [{ text: `Summarize this student file in one sentence.\n\nFile: ${fileName}\n\n${truncated}` }],
            },
          ],
        }),
      }
    );

    const body = await response.text();

    if (!response.ok) {
      return { result: null, error: `HTTP ${response.status}: ${body}` };
    }

    const data = JSON.parse(body) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const text =
      data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ??
      "(no response text)";

    return { result: `[${fileName}] ${text}`, error: null };
  } catch (err) {
    return {
      result: null,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

export interface GradeActionState {
  run: GradingRun | null;
  error: string | null;
  generatedRubric?: string;
}

export async function gradeAction(
  _prev: GradeActionState,
  formData: FormData
): Promise<GradeActionState> {
  const file = formData.get("studentSubmissions") as File | null;
  const assignmentInstructions =
    (formData.get("assignmentInstructions") as string | null) ?? "";
  const rubric = (formData.get("rubric") as string | null) ?? "";

  if (!file || file.size === 0) {
    return { run: null, error: "Please upload a student submissions zip file." };
  }

  if (!assignmentInstructions.trim()) {
    return { run: null, error: "Please provide assignment instructions." };
  }

  try {
    const effectiveRubric = rubric.trim()
      ? rubric
      : await generateRubric(assignmentInstructions);
    const generatedRubric = rubric.trim() ? undefined : effectiveRubric;

    const zipBuffer = await file.arrayBuffer();
    const [run, fullCreditChecklist] = await Promise.all([
      gradeSubmissions(zipBuffer, assignmentInstructions, effectiveRubric),
      synthesizeFullCreditChecklist(assignmentInstructions, effectiveRubric),
    ]);

    return {
      run: {
        ...run,
        fullCreditChecklist,
      },
      error: null,
      generatedRubric,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "An unexpected error occurred.";
    return { run: null, error: message };
  }
}
