"use server";

import {
  gradeSubmissions,
  synthesizeFullCreditChecklist,
  type GradingRun,
} from "@/lib/grade";
import { getGeminiApiKey, getGeminiModel } from "@/lib/gemini";

export interface TestGeminiState {
  result: string | null;
  error: string | null;
}

export async function testGeminiAction(
  _prev: TestGeminiState
): Promise<TestGeminiState> {
  try {
    const apiKey = getGeminiApiKey();
    const model = getGeminiModel();

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: "Say hello." }] }],
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

    return { result: text, error: null };
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

  if (!rubric.trim()) {
    return { run: null, error: "Please provide a rubric." };
  }

  try {
    const zipBuffer = await file.arrayBuffer();
    const [run, fullCreditChecklist] = await Promise.all([
      gradeSubmissions(zipBuffer, assignmentInstructions, rubric),
      synthesizeFullCreditChecklist(assignmentInstructions, rubric),
    ]);

    return {
      run: {
        ...run,
        fullCreditChecklist,
      },
      error: null,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "An unexpected error occurred.";
    return { run: null, error: message };
  }
}
