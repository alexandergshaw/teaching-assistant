const DEFAULT_GEMINI_MODEL = "gemini-2.0-flash";

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