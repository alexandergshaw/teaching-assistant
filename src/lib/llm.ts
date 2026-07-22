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

export type LlmProvider = "gemini" | "other" | "embedded";

export const DEFAULT_PROVIDER: LlmProvider = "gemini";

/** Coerce an arbitrary value (e.g. from the client/localStorage) to a provider. */
export function normalizeProvider(value: string | undefined | null): LlmProvider {
  if (value === "other") return "other";
  if (value === "embedded") return "embedded";
  return "gemini";
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
  /** Optional system instruction prepended to steer the model (e.g. tone, format). */
  systemInstruction?: string;
  /** Enable web search tool for the model (Gemini only). */
  webSearch?: boolean;
}

export interface Source {
  title: string;
  uri: string;
}

/**
 * Parse grounding metadata from an LLM response into an array of sources.
 * Extracts web.uri and web.title from groundingChunks, skipping chunks without
 * a uri. Returns undefined if metadata is missing or malformed.
 */
export function parseGroundingSources(
  data: unknown
): Array<{ title: string; uri: string }> | undefined {
  try {
    if (!data || typeof data !== "object") {
      return undefined;
    }

    const obj = data as {
      candidates?: Array<{
        groundingMetadata?: {
          groundingChunks?: Array<{ web?: { uri?: string; title?: string } }>;
        };
      }>;
    };

    const chunks = obj.candidates?.[0]?.groundingMetadata?.groundingChunks;
    if (!Array.isArray(chunks)) {
      return undefined;
    }

    const sources: Source[] = [];
    for (const chunk of chunks) {
      const uri = chunk.web?.uri;
      if (uri) {
        const title = chunk.web?.title || uri;
        sources.push({ uri, title });
      }
    }

    return sources.length > 0 ? sources : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Result of an LLM call. On a transport/HTTP failure, `ok` is false and the
 * caller can build its own error message from `status` and `body` (call sites
 * have differing, user-facing error copy, so we surface the raw details rather
 * than formatting here).
 */
export type LlmResult =
  | { ok: true; text: string; sources?: Source[] }
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

// Transport hardening. Features such as lecture-plan generation fan out many
// calls at once, so a single transient failure (a rate-limit or a brief server
// blip) must not be fatal — without retries one failed call silently drops a
// whole assignment from the output. We retry rate-limit/5xx responses and
// network errors with exponential backoff + jitter, honoring Retry-After.
const RETRYABLE_STATUS = new Set([408, 429, 500, 502, 503, 504]);
const MAX_ATTEMPTS = 4;
const BASE_DELAY_MS = 600;
const MAX_DELAY_MS = 8000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Parse a Retry-After header (delta-seconds or HTTP date) into milliseconds. */
function parseRetryAfter(value: string | null): number | null {
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const when = Date.parse(value);
  if (!Number.isNaN(when)) return Math.max(0, when - Date.now());
  return null;
}

/** Backoff before retry `attempt` (0-based): honor Retry-After, else exp + jitter. */
function backoffDelay(attempt: number, retryAfter: string | null): number {
  const headerMs = parseRetryAfter(retryAfter);
  if (headerMs !== null) return Math.min(headerMs, 20_000);
  const exp = Math.min(BASE_DELAY_MS * 2 ** attempt, MAX_DELAY_MS);
  return exp + Math.floor(Math.random() * 400);
}

async function callGemini(req: LlmRequest): Promise<LlmResult> {
  const apiKey = getGeminiApiKey();
  const model = getGeminiModel();
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const body = JSON.stringify({
    contents: req.contents,
    ...(req.generationConfig ? { generationConfig: req.generationConfig } : {}),
    ...(req.systemInstruction
      ? { system_instruction: { parts: [{ text: req.systemInstruction }] } }
      : {}),
    ...(req.webSearch
      ? { tools: [{ google_search: {} }] }
      : {}),
  });

  let lastResult: LlmResult = { ok: false, status: 0, body: "Request was never attempted." };

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const isLastAttempt = attempt === MAX_ATTEMPTS - 1;

    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      });
    } catch (err) {
      // Network/transport error — always transient, retry with backoff.
      lastResult = { ok: false, status: 0, body: err instanceof Error ? err.message : "Network error" };
      if (isLastAttempt) return lastResult;
      await sleep(backoffDelay(attempt, null));
      continue;
    }

    if (!response.ok) {
      const errBody = await response.text();
      lastResult = { ok: false, status: response.status, body: errBody };
      if (!isLastAttempt && RETRYABLE_STATUS.has(response.status)) {
        await sleep(backoffDelay(attempt, response.headers.get("retry-after")));
        continue;
      }
      return lastResult;
    }

    const data = (await response.json()) as {
      candidates?: Array<{
        content?: { parts?: Array<{ text?: string }> };
        groundingMetadata?: {
          groundingChunks?: Array<{ web?: { uri?: string; title?: string } }>;
        };
      }>;
    };

    const text =
      data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";

    const sources = parseGroundingSources(data);

    return {
      ok: true,
      text,
      ...(sources ? { sources } : {}),
    };
  }

  return lastResult;
}
