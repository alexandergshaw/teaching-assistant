import { getGeminiApiKey, getGeminiModel } from "./gemini";

/**
 * Provider dispatch for all LLM calls.
 *
 * Every place in the codebase that talks to a language model routes through
 * callLlm() so the active provider can be switched in one place. The provider
 * is selected by the caller (the UI exposes a toggle and threads the choice
 * through as an argument). "gemini" is the current implementation; "other" is
 * a placeholder for the API we will wire in shortly.
 */

export type LlmProvider = "gemini" | "other";

export const DEFAULT_PROVIDER: LlmProvider = "gemini";

/** Coerce an arbitrary value (e.g. from the client/localStorage) to a provider. */
export function normalizeProvider(value: string | undefined | null): LlmProvider {
  return value === "other" ? "other" : "gemini";
}

export type LlmPart =
  | { text: string }
  | { inlineData: { mimeType: string; data: string } };

export interface LlmContent {
  role: "user" | "model";
  parts: LlmPart[];
}

export interface LlmGenerationConfig {
  temperature?: number;
  maxOutputTokens?: number;
  responseMimeType?: string;
}

export interface LlmRequest {
  contents: LlmContent[];
  generationConfig?: LlmGenerationConfig;
}

/**
 * Result of an LLM call. On a transport/HTTP failure, `ok` is false and the
 * caller can build its own error message from `status` and `body` (call sites
 * have differing, user-facing error copy, so we surface the raw details rather
 * than formatting here).
 */
export type LlmResult =
  | { ok: true; text: string }
  | { ok: false; status: number; body: string };

export async function callLlm(
  req: LlmRequest,
  provider: LlmProvider = DEFAULT_PROVIDER
): Promise<LlmResult> {
  // Generic text generation always uses Gemini. The Course Engine ("other")
  // provider does not implement this generic interface — it is wired per-feature
  // at the action level (schedule / lecture / materials). Any call that reaches
  // here with "other" is an unmatched feature, which transparently falls back to
  // Gemini rather than failing.
  void provider;
  return callGemini(req);
}

async function callGemini(req: LlmRequest): Promise<LlmResult> {
  const apiKey = getGeminiApiKey();
  const model = getGeminiModel();

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: req.contents,
        ...(req.generationConfig ? { generationConfig: req.generationConfig } : {}),
      }),
    }
  );

  if (!response.ok) {
    const body = await response.text();
    return { ok: false, status: response.status, body };
  }

  const data = (await response.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };

  const text =
    data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";

  return { ok: true, text };
}
