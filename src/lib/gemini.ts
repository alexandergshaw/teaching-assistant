const DEFAULT_GEMINI_MODEL = "gemini-3.1-flash-lite";

/**
 * Default model for image generation (text-in, image-out) calls, kept
 * separate from DEFAULT_GEMINI_MODEL because the text-drafting default above
 * is not an image-capable model.
 *
 * Image generation does NOT use the `:generateContent` endpoint that
 * getGeminiModel()'s callers use - that shape (an image part returned inline
 * via generationConfig.responseModalities: ["TEXT","IMAGE"]) is Google's
 * LEGACY image-generation schema and was removed 2026-06-08. Verified
 * against Google's live documentation, the current schema is a dedicated
 * `POST /v1beta/interactions` endpoint (model id in the request body, an
 * `Api-Revision: 2026-05-20` header required) - see generateGeminiImage in
 * llm.ts for the full request/response shape.
 *
 * "gemini-3.1-flash-image" (Nano Banana 2) is the current default. Other
 * supported ids as of this check: "gemini-3-pro-image" (Nano Banana Pro) and
 * "gemini-2.5-flash-image" (Nano Banana, the previous default here).
 * GEMINI_IMAGE_MODEL overrides it, mirroring GEMINI_MODEL's own override
 * knob below, so a future model-id change is a config change, not a deploy.
 */
const DEFAULT_GEMINI_IMAGE_MODEL = "gemini-3.1-flash-image";
const DEFAULT_MAX_OUTPUT_TOKENS = 700;
const DEFAULT_MAX_SUBMISSIONS = 5;

/**
 * gemini-3.1-flash-lite (the default model above) has a 1,048,576-token input
 * context window and prices input at roughly $0.125-$0.25 per million tokens
 * (Google AI Studio / OpenRouter, 2026). The previous default here, 12,000
 * characters (~3,000 tokens), was sized as if the model's window were tiny -
 * it silently discarded up to ~95% of a folder-scoped repo digest before the
 * model ever saw it (see docs/folder-scoped-grading-completeness-acceptance-
 * criteria.md, C1.2), with the only trace being a sentence buried in the
 * prompt text.
 *
 * 400,000 characters (~100,000 tokens at ~4 chars/token) is chosen instead:
 *   - It is under 10% of the real 1,048,576-token window, leaving generous
 *     headroom for the system prompt, rubric criteria, image parts, and the
 *     model's own completion budget (up to 65,536 output tokens) without
 *     risking a request that exceeds the context window outright (a run that
 *     dies from an oversized request grades nothing - C1.3).
 *   - It comfortably fits a normal assignment folder: even the raised,
 *     folder-scoped ingest budget in github.digest.ts (raised for C1.1, but
 *     nowhere near 400,000 characters for a single assignment folder) will
 *     rarely be truncated further here - this cap exists as a backstop, not
 *     the primary limiter.
 *   - Cost stays trivial: ~100,000 input tokens per submission at ~$0.25/M
 *     tokens is about $0.025 in the worst case (a submission that fills the
 *     entire cap); at the default cap of 5 submissions per run
 *     (DEFAULT_MAX_SUBMISSIONS) that is at most roughly $0.125 for a whole
 *     grading run, and typical submissions are far smaller than the cap, so
 *     real-world cost is usually a small fraction of that.
 *
 * GRADE_MAX_CHARS_PER_SUBMISSION still overrides this for anyone who needs a
 * different value, and parsePositiveInt still enforces a minimum of 1 - a cap
 * always exists, it is just no longer the dominant bottleneck.
 */
const DEFAULT_MAX_CHARS_PER_SUBMISSION = 400000;
const DEFAULT_INTER_REQUEST_DELAY_MS = 1200;
const DEFAULT_MIN_OUTPUT_TOKENS = 512;
const VALID_THINKING_LEVELS = new Set(["minimal", "low", "medium", "high"]);

function parsePositiveInt(
  value: string | undefined,
  fallback: number,
  min = 1
): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed < min) {
    return fallback;
  }

  return parsed;
}

export function getGeminiApiKey() {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error("Missing environment variable: GEMINI_API_KEY");
  }

  return apiKey;
}

export function getGeminiModel() {
  return process.env.GEMINI_MODEL ?? DEFAULT_GEMINI_MODEL;
}

/**
 * Model override for web-search-grounded calls only (Y6,
 * docs/reply-resource-search-yield-acceptance-criteria.md). GEMINI_MODEL's
 * default, gemini-3.1-flash-lite, is the most tool-shy tier for deciding
 * whether to actually run Google Search - see current-events.ts and
 * learning-resource-links.ts's own module comments on that failure mode.
 * Falls back to getGeminiModel() when unset, so a request that never sets
 * webSearch is byte-identical to before this existed, and a caller that DOES
 * set webSearch but leaves this unset also sees no change.
 */
export function getGeminiSearchModel() {
  return process.env.GEMINI_SEARCH_MODEL ?? getGeminiModel();
}

/** Model used for image-generation calls. See DEFAULT_GEMINI_IMAGE_MODEL's
 * own comment above for why this is a separate knob from getGeminiModel(). */
export function getGeminiImageModel() {
  return process.env.GEMINI_IMAGE_MODEL ?? DEFAULT_GEMINI_IMAGE_MODEL;
}

export function getGeminiMaxOutputTokens() {
  return parsePositiveInt(
    process.env.GEMINI_MAX_OUTPUT_TOKENS,
    DEFAULT_MAX_OUTPUT_TOKENS
  );
}

export function getGeminiMaxSubmissions() {
  return parsePositiveInt(
    process.env.GRADE_MAX_SUBMISSIONS,
    DEFAULT_MAX_SUBMISSIONS
  );
}

export function getGeminiMaxCharsPerSubmission() {
  return parsePositiveInt(
    process.env.GRADE_MAX_CHARS_PER_SUBMISSION,
    DEFAULT_MAX_CHARS_PER_SUBMISSION
  );
}

export function getGeminiInterRequestDelayMs() {
  return parsePositiveInt(
    process.env.GRADE_INTER_REQUEST_DELAY_MS,
    DEFAULT_INTER_REQUEST_DELAY_MS,
    0
  );
}

/**
 * Google's Gemini 3 guide warns that temperatures below the model default of
 * 1.0 "may lead to unexpected behavior, such as looping or degraded
 * performance" — a looping model exhausts its output budget and returns an
 * empty response. callGemini drops low per-call temperatures for Gemini 3.x
 * models unless this is set, restoring the previous behaviour.
 */
export function getGeminiAllowLowTemperature(): boolean {
  const value = process.env.GEMINI_ALLOW_LOW_TEMPERATURE?.trim().toLowerCase();
  return value === "1" || value === "true";
}

/**
 * Explicit thinkingConfig.thinkingLevel override for Gemini 3.x models.
 * Undefined by default so today's request shape stays byte-identical for
 * gemini-3.1-flash-lite, whose "minimal" default already suits us — the
 * opt-in exists so a future GEMINI_MODEL switch to a high-thinking Gemini 3
 * model can be pinned down without a deploy.
 */
export function getGeminiThinkingLevel(): string | undefined {
  const value = process.env.GEMINI_THINKING_LEVEL?.toLowerCase().trim();
  return value && VALID_THINKING_LEVELS.has(value) ? value : undefined;
}

/**
 * On Gemini 3.x, thinking tokens are drawn from the same budget as
 * maxOutputTokens, so a call site that caps output at a small number (tuned
 * for a non-thinking model) can have its entire budget consumed by thinking,
 * leaving no room for an answer. callGemini raises any cap below this floor.
 */
export function getGeminiMinOutputTokens(): number {
  return parsePositiveInt(
    process.env.GEMINI_MIN_OUTPUT_TOKENS,
    DEFAULT_MIN_OUTPUT_TOKENS
  );
}