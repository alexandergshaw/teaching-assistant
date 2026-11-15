import type { LlmProvider } from "@/lib/llm";

/** Use the authenticated JSON route rather than the React Server Action parser. */
export async function transcribeWalkthroughChunk(audio: string, options: { provider: LlmProvider }, signal?: AbortSignal): Promise<{ text: string } | { error: string }> {
  const response = await fetch("/api/recording-transcription", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ audio, provider: options.provider }), signal,
  });
  if (!response.ok) {
    if (response.status === 401) return { error: "Not authorized. Sign in with an approved account." };
    if (response.status === 400 || response.status === 403 || response.status === 404 || response.status === 413 || response.status === 429) return { error: `Transcription failed: HTTP ${response.status}` };
    return { error: "Transcription failed: HTTP 0" };
  }
  let payload: unknown;
  try { payload = await response.json(); } catch { return { error: "Transcription response was invalid." }; }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return { error: "Transcription response was invalid." };
  if ("text" in payload && typeof payload.text === "string") return { text: payload.text };
  if ("error" in payload && typeof payload.error === "string") return { error: payload.error };
  return { error: "Transcription response was invalid." };
}
