"use server";

import { requireUser } from "@/lib/supabase/auth";
import { callLlm, type LlmProvider } from "@/lib/llm";

/** Generates one generic template; roster names and student posts are never requested. */
export async function generateDiscussionTemplateAction(prompt: string, provider: LlmProvider = "gemini"): Promise<{ template: string } | { error: string }> {
  try {
    await requireUser();
    if (typeof prompt !== "string" || !prompt.trim() || prompt.length > 32000) return { error: "Enter a prompt of at most 32,000 characters." };
    if (provider !== "gemini") return { error: "This tool supports the Gemini provider only." };
    const result = await callLlm(
      { contents: [{ role: "user", parts: [{ text: prompt }] }], generationConfig: { temperature: 0.5, maxOutputTokens: 2048 } },
      provider,
      { deadlineMs: Date.now() + 45_000, maxAttempts: 1, responseByteLimit: 262_144, hardOutputTokenCap: 2048 },
    );
    if (!result.ok) return { error: "Could not generate a template. Try again." };
    const template = result.text.trim();
    return template ? { template } : { error: "The model returned an empty template. Try again." };
  } catch {
    return { error: "Could not generate a template. Try again." };
  }
}
