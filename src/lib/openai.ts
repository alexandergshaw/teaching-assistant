import OpenAI from "openai";

let openaiClient: OpenAI | null = null;

export function getOpenAIClient() {
  if (openaiClient) {
    return openaiClient;
  }

  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error("Missing environment variable: OPENAI_API_KEY");
  }

  openaiClient = new OpenAI({
    apiKey,
  });

  return openaiClient;
}
