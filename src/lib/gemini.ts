const DEFAULT_GEMINI_MODEL = "gemini-3.1-flash-lite";
const DEFAULT_MAX_OUTPUT_TOKENS = 700;
const DEFAULT_MAX_SUBMISSIONS = 5;
const DEFAULT_MAX_CHARS_PER_SUBMISSION = 12000;
const DEFAULT_INTER_REQUEST_DELAY_MS = 1200;

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