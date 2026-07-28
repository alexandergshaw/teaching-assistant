const DEFAULT_GEMINI_MODEL = "gemini-3.1-flash-lite";
const DEFAULT_MAX_OUTPUT_TOKENS = 700;
const DEFAULT_MAX_SUBMISSIONS = 5;
const DEFAULT_MAX_CHARS_PER_SUBMISSION = 12000;
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