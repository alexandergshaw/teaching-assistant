import {
  getGeminiApiKey,
  getGeminiModel,
  getGeminiImageModel,
  getGeminiAllowLowTemperature,
  getGeminiThinkingLevel,
  getGeminiMinOutputTokens,
} from "./gemini";

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

/**
 * True for Gemini 3.x model names (gemini-3, gemini-3-flash,
 * gemini-3.1-flash-lite, gemini-3.1-pro-preview, ...), false for gemini-2.5.x,
 * a stray "gemini-30-something", or an unset model string. The generation
 * tuning below only applies to this family.
 */
export function isGemini3Model(model: string): boolean {
  return /^gemini-3(?:[.-]|$)/i.test(model);
}

/** Tuning knobs for normalizeGenerationConfig, read from gemini.ts getters. */
export interface GeminiTuning {
  allowLowTemperature: boolean;
  thinkingLevel?: string;
  minOutputTokens: number;
}

/**
 * Adjust a caller's generationConfig for Gemini 3.x quirks without touching
 * the ~78 call sites that set it. See the comment above the call site in
 * callGemini for the two vendor facts this exists to work around. Returns a
 * new object (or undefined) — the caller's config is never mutated, since
 * some call sites pass shared constants.
 */
export function normalizeGenerationConfig(
  config: LlmGenerationConfig | undefined,
  model: string,
  tuning: GeminiTuning
): Record<string, unknown> | undefined {
  if (!isGemini3Model(model)) {
    return config as Record<string, unknown> | undefined;
  }

  const normalized: Record<string, unknown> = { ...config };

  if (
    typeof normalized.temperature === "number" &&
    normalized.temperature < 1 &&
    !tuning.allowLowTemperature
  ) {
    delete normalized.temperature;
  }

  if (
    typeof normalized.maxOutputTokens === "number" &&
    normalized.maxOutputTokens < tuning.minOutputTokens
  ) {
    normalized.maxOutputTokens = tuning.minOutputTokens;
  }

  if (tuning.thinkingLevel) {
    normalized.thinkingConfig = { thinkingLevel: tuning.thinkingLevel };
  }

  return Object.keys(normalized).length > 0 ? normalized : undefined;
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
  | { ok: true; text: string; sources?: Source[]; finishReason?: string }
  | { ok: false; status: number; body: string };

/**
 * Result of an image-generation call (generateGeminiImage). Three shapes,
 * matching LlmResult's own discipline of never throwing to the caller:
 *  - a real image (`base64` + `mimeType`);
 *  - a transport/HTTP failure (`ok: false` - same {status, body} shape as
 *    LlmResult's failure branch, so describeLlmFailure works on both without
 *    a second formatter);
 *  - a 200 response that contains no image part at all (`ok: true` with
 *    `base64: null`) - an image model can refuse a request (safety, a prompt
 *    it will not illustrate), return text explaining why instead of a
 *    picture, or simply omit the image part on a MAX_TOKENS/SAFETY
 *    finishReason. This is not a transport failure (the HTTP call itself
 *    succeeded), so it is kept out of the `ok: false` branch, mirroring why
 *    callGemini's own "empty text" case stays inside `ok: true` above -
 *    see describeEmptyLlmImage for turning it into a caller-facing message
 *    that surfaces the model's own refusal text when it gave one.
 */
export type LlmImageResult =
  | { ok: true; base64: string; mimeType: string }
  | { ok: true; base64: null; text: string; finishReason?: string }
  | { ok: false; status: number; body: string };

/**
 * Format a failed LlmResult into a single user-facing error string, matching
 * the `Xxx failed: HTTP <status> — <body>` convention already used throughout
 * the codebase. status === 0 means a network/transport error (see the catch
 * block in callGemini), where "HTTP 0" would read as nonsense, so that case
 * gets its own wording. An empty/whitespace body omits the trailing dash
 * segment rather than emitting a dangling " — ".
 */
export function describeLlmFailure(
  result: Extract<LlmResult, { ok: false }>,
  label: string
): string {
  const body = result.body.slice(0, 200).trim();
  const prefix = result.status > 0 ? `${label}: HTTP ${result.status}` : `${label}: network error`;
  return body ? `${prefix} — ${body}` : prefix;
}

/**
 * Format a successful-but-empty LlmResult into a single user-facing error
 * string. callGemini returns { ok: true, text: "" } when Gemini responds 200
 * with no text parts (e.g. finishReason MAX_TOKENS or a safety block), which
 * otherwise reads as a dead end downstream.
 */
export function describeEmptyLlmText(
  result: Extract<LlmResult, { ok: true }>,
  label: string
): string {
  const reasonSuffix = result.finishReason ? ` (finishReason: ${result.finishReason})` : "";
  return `${label}: the model returned an empty response${reasonSuffix}.`;
}

/**
 * Format a "the model responded but returned no image" LlmImageResult into a
 * single user-facing error string, mirroring describeEmptyLlmText above. When
 * the model returned text instead of an image (the common refusal shape - it
 * explains in prose why it will not illustrate the prompt), that text IS the
 * most specific, real explanation available and is surfaced verbatim
 * (truncated to the same 200-character budget describeLlmFailure uses,
 * rather than inventing a fresh limit). Only when the model returned neither
 * an image nor any text does this fall back to finishReason, or to a bare
 * "no image" statement when even that is absent.
 */
export function describeEmptyLlmImage(
  result: Extract<LlmImageResult, { ok: true; base64: null }>,
  label: string
): string {
  const text = result.text.slice(0, 200).trim();
  if (text) {
    return `${label}: the model did not return an image - it said: "${text}"`;
  }
  const reasonSuffix = result.finishReason ? ` (finishReason: ${result.finishReason})` : "";
  return `${label}: the model did not return an image${reasonSuffix}.`;
}

/**
 * Parse the reason a Gemini response contains no usable text: the candidate's
 * own finishReason takes precedence (e.g. MAX_TOKENS, SAFETY), falling back to
 * a prompt-level block reason (e.g. BLOCKED_SAFETY) when no candidate reason
 * is present. Returns undefined when neither is available. Defensive against
 * malformed input, mirroring parseGroundingSources.
 */
export function parseFinishReason(data: unknown): string | undefined {
  try {
    if (!data || typeof data !== "object") {
      return undefined;
    }

    const obj = data as {
      candidates?: Array<{ finishReason?: string }>;
      promptFeedback?: { blockReason?: string };
    };

    const candidateReason = obj.candidates?.[0]?.finishReason;
    if (typeof candidateReason === "string" && candidateReason) {
      return candidateReason;
    }

    const blockReason = obj.promptFeedback?.blockReason;
    if (typeof blockReason === "string" && blockReason) {
      return `BLOCKED_${blockReason}`;
    }

    return undefined;
  } catch {
    return undefined;
  }
}

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
// Worst case (no Retry-After header) backs off ~0.6 + 1.2 + 2.4 + 4.8 ≈ 9s
// across the 4 retries, still far under the 60s Vercel function cap.
const RETRYABLE_STATUS = new Set([408, 429, 500, 502, 503, 504]);
const MAX_ATTEMPTS = 5;
const BASE_DELAY_MS = 600;
const MAX_DELAY_MS = 10000;

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

/**
 * Shared low-level transport for a Gemini `:generateContent` call: builds the
 * URL, retries rate-limit/5xx/network failures with backoff (see the block
 * comment above), and returns either the parsed JSON body or a
 * {status, body} failure. callGemini (text) and generateGeminiImage
 * (image-out) both build their own request body and parse their own
 * response shape out of `data` — this function knows nothing about text vs.
 * image, only about getting a request to Gemini and back reliably. Splitting
 * it out (rather than duplicating the retry loop in generateGeminiImage) is
 * what keeps the image path's auth, retry/backoff, and error shape identical
 * to the text path's, per this feature's own requirement.
 */
async function postGenerateContent(
  model: string,
  body: string
): Promise<{ ok: true; data: unknown } | { ok: false; status: number; body: string }> {
  const apiKey = getGeminiApiKey();
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;

  let lastResult: { ok: false; status: number; body: string } = {
    ok: false,
    status: 0,
    body: "Request was never attempted.",
  };

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

    const data: unknown = await response.json();
    return { ok: true, data };
  }

  return lastResult;
}

async function callGemini(req: LlmRequest): Promise<LlmResult> {
  const model = getGeminiModel();

  // Gemini 3 generation config normalization. Two vendor facts drive this:
  // (1) Google's Gemini 3 guide recommends leaving temperature at its 1.0
  // default, warning that lower values "may lead to unexpected behavior,
  // such as looping or degraded performance" — a looping model exhausts its
  // output budget and returns an empty response with finishReason
  // MAX_TOKENS. (2) On Gemini 3.x, thinking tokens are drawn from the same
  // budget as maxOutputTokens, so a cap sized for a non-thinking model (some
  // call sites cap as low as 50-120 tokens) can be entirely consumed by
  // thinking before any answer text is produced. Both are worked around here,
  // once, rather than at each of the ~78 call sites that set generationConfig
  // — see normalizeGenerationConfig in this file and the getGemini* tuning
  // getters in gemini.ts. Non-Gemini-3 models pass through unchanged.
  const generationConfig = normalizeGenerationConfig(req.generationConfig, model, {
    allowLowTemperature: getGeminiAllowLowTemperature(),
    thinkingLevel: getGeminiThinkingLevel(),
    minOutputTokens: getGeminiMinOutputTokens(),
  });

  const body = JSON.stringify({
    contents: req.contents,
    ...(generationConfig ? { generationConfig } : {}),
    ...(req.systemInstruction
      ? { system_instruction: { parts: [{ text: req.systemInstruction }] } }
      : {}),
    ...(req.webSearch
      ? { tools: [{ google_search: {} }] }
      : {}),
  });

  const result = await postGenerateContent(model, body);
  if (!result.ok) {
    return result;
  }

  const data = result.data as {
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string }> };
      groundingMetadata?: {
        groundingChunks?: Array<{ web?: { uri?: string; title?: string } }>;
      };
      finishReason?: string;
    }>;
    promptFeedback?: { blockReason?: string };
  };

  const text =
    data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";

  const sources = parseGroundingSources(data);
  const finishReason = parseFinishReason(data);

  return {
    ok: true,
    text,
    ...(sources ? { sources } : {}),
    ...(finishReason ? { finishReason } : {}),
  };
}

/**
 * Endpoint + header for Gemini's current image-generation schema. This is
 * NOT the `:generateContent` endpoint postGenerateContent/callGemini use for
 * text — that shape's image-out variant (an inline image part requested via
 * generationConfig.responseModalities) was Google's LEGACY image-generation
 * schema and was removed 2026-06-08. Verified against Google's live
 * documentation, image generation now goes through a dedicated `interactions`
 * endpoint that requires an explicit `Api-Revision` header; without it the
 * legacy schema handling is gone entirely, so this header is a single point
 * of failure worth keeping visible as a named constant rather than an inline
 * string.
 */
const GEMINI_INTERACTIONS_URL = "https://generativelanguage.googleapis.com/v1beta/interactions";
const GEMINI_API_REVISION = "2026-05-20";

/**
 * Transport for a Gemini `interactions` call (image generation). Deliberately
 * NOT shared with postGenerateContent above — that function is the text
 * path's transport (`:generateContent`, `?key=` query auth, no Api-Revision
 * header) and must stay untouched; this is a separate endpoint with its own
 * auth style (`x-goog-api-key` header, not a query param) and its own
 * required header. The retry/backoff policy (RETRYABLE_STATUS, MAX_ATTEMPTS,
 * backoffDelay, sleep) is still shared, so both transports retry rate-limit/
 * 5xx/network failures identically.
 */
async function postInteraction(
  apiKey: string,
  body: string
): Promise<{ ok: true; data: unknown } | { ok: false; status: number; body: string }> {
  let lastResult: { ok: false; status: number; body: string } = {
    ok: false,
    status: 0,
    body: "Request was never attempted.",
  };

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const isLastAttempt = attempt === MAX_ATTEMPTS - 1;

    let response: Response;
    try {
      response = await fetch(GEMINI_INTERACTIONS_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
          "Api-Revision": GEMINI_API_REVISION,
        },
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

    const data: unknown = await response.json();
    return { ok: true, data };
  }

  return lastResult;
}

/** One content block inside an `interactions` response step. */
interface InteractionsContentBlock {
  type?: string;
  data?: string;
  mime_type?: string;
  text?: string;
}

/** One step inside an `interactions` response's `steps` array. */
interface InteractionsStep {
  type?: string;
  content?: InteractionsContentBlock[];
  stop_reason?: string;
  finish_reason?: string;
}

/** Shape of a Gemini `interactions` response body (image generation). */
interface InteractionsResponseBody {
  steps?: InteractionsStep[];
  output_image?: { data?: string; mime_type?: string };
  stop_reason?: string;
  finish_reason?: string;
}

/**
 * Find the generated image in an `interactions` response: the `output_image`
 * convenience property first (documented as the fast path), falling back to
 * scanning every step's `content` array for the first `type: "image"` block —
 * matching the response shape's own two-places-the-same-data documentation.
 */
function findInteractionsImage(
  data: InteractionsResponseBody
): { data: string; mimeType: string } | undefined {
  if (typeof data.output_image?.data === "string" && data.output_image.data) {
    return { data: data.output_image.data, mimeType: data.output_image.mime_type || "image/png" };
  }

  for (const step of data.steps ?? []) {
    for (const block of step.content ?? []) {
      if (block.type === "image" && typeof block.data === "string" && block.data) {
        return { data: block.data, mimeType: block.mime_type || "image/png" };
      }
    }
  }

  return undefined;
}

/**
 * Collect every non-image content block's text across all steps. When the
 * model refuses or safety-blocks a prompt instead of returning an image, the
 * `interactions` schema's documented example only shows the success shape
 * (an image block) — there is no documented dedicated "refusal" field. The
 * defensible reading, matching how the legacy `:generateContent` shape put a
 * refusal's explanation in a text part alongside/instead of the image part,
 * is that a refusing `model_output` step's `content` array carries a `text`
 * block explaining why instead of an `image` block. This is what
 * describeEmptyLlmImage surfaces to the instructor as the real refusal
 * reason, so it is preferred over a generic message whenever present.
 */
function collectInteractionsText(data: InteractionsResponseBody): string {
  const texts: string[] = [];
  for (const step of data.steps ?? []) {
    for (const block of step.content ?? []) {
      if (block.type !== "image" && typeof block.text === "string" && block.text) {
        texts.push(block.text);
      }
    }
  }
  return texts.join("");
}

/**
 * Best-effort finish/stop reason from an `interactions` response, checked at
 * both the top level and per-step since the documented example does not show
 * where (or whether) this schema surfaces one — unlike collectInteractionsText
 * above, whose text (when present) is the primary, always-real signal
 * describeEmptyLlmImage surfaces, this is only the fallback used when no text
 * is present at all, so an absent value here still degrades to the existing
 * bare "did not return an image" message rather than a wrong one.
 */
function findInteractionsFinishReason(data: InteractionsResponseBody): string | undefined {
  if (typeof data.stop_reason === "string" && data.stop_reason) return data.stop_reason;
  if (typeof data.finish_reason === "string" && data.finish_reason) return data.finish_reason;

  for (const step of data.steps ?? []) {
    if (typeof step.stop_reason === "string" && step.stop_reason) return step.stop_reason;
    if (typeof step.finish_reason === "string" && step.finish_reason) return step.finish_reason;
  }

  return undefined;
}

/**
 * Generate an image from a text prompt via Gemini's current image-generation
 * schema (`POST /v1beta/interactions`, verified against Google's live
 * documentation — see GEMINI_INTERACTIONS_URL's comment above for why this
 * is NOT the `:generateContent` shape callGemini uses for text). Same
 * never-throw discipline as callGemini: a bad/missing API key surfaces as a
 * rejected promise exactly like callGemini's does today (callers already
 * wrap this in try/catch, matching existing precedent), everything else
 * resolves to an LlmImageResult the caller inspects, never a thrown error
 * from a bad response.
 *
 * Request body: `{ model, input: [{ type: "text", text: prompt }],
 * response_format: { type: "image", mime_type: "image/png" } }`.
 * `response_format` is optional per the docs; `type: "image"` is what makes
 * this an image-generation call rather than a text one.
 *
 * Response shape: read `output_image` first (the documented convenience
 * property), falling back to scanning `steps[].content[]` for the first
 * `type: "image"` block — see findInteractionsImage. Field names in this
 * schema are snake_case (`mime_type`), not the `:generateContent` shape's
 * camelCase.
 */
export async function generateGeminiImage(prompt: string): Promise<LlmImageResult> {
  const model = getGeminiImageModel();
  const apiKey = getGeminiApiKey();

  const body = JSON.stringify({
    model,
    input: [{ type: "text", text: prompt }],
    response_format: { type: "image", mime_type: "image/png" },
  });

  const result = await postInteraction(apiKey, body);
  if (!result.ok) {
    return result;
  }

  const data = result.data as InteractionsResponseBody;
  const image = findInteractionsImage(data);

  if (image) {
    return { ok: true, base64: image.data, mimeType: image.mimeType };
  }

  const text = collectInteractionsText(data);
  const finishReason = findInteractionsFinishReason(data);

  return {
    ok: true,
    base64: null,
    text,
    ...(finishReason ? { finishReason } : {}),
  };
}
