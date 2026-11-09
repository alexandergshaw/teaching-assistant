import { readActionRouteResponse } from "@/lib/action-route-response";
import type { LlmProvider } from "@/lib/llm";

/** Send audio as JSON rather than a React Server Function argument array. */
export async function transcribeRecordingAudio(audio: string, provider: LlmProvider): Promise<{ text: string } | { error: string }> {
  const response = await fetch("/api/recording-transcription", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ audio, provider }),
  });
  const result = await readActionRouteResponse<{ text?: unknown; error?: unknown }>(response);
  if ("error" in result && typeof result.error === "string") return { error: result.error };
  if ("text" in result && typeof result.text === "string") return { text: result.text };
  return { error: "The transcription response could not be read. Retry this chunk." };
}
