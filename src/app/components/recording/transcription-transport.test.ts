import { afterEach, describe, expect, it, vi } from "vitest";
import { transcribeRecordingAudio } from "./transcription-transport";

afterEach(() => vi.unstubAllGlobals());
describe("recording transcription transport", () => {
  it("sends the audio and provider as JSON and returns the transcript", async () => {
    const audio = "a".repeat(1_100_000);
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ text: "result" }), { status: 200 }));
    vi.stubGlobal("fetch", fetcher);
    expect(await transcribeRecordingAudio(audio, "gemini")).toEqual({ text: "result" });
    expect(fetcher).toHaveBeenCalledWith("/api/recording-transcription", expect.objectContaining({ method: "POST", body: JSON.stringify({ audio, provider: "gemini" }) }));
  });
  it("turns non-JSON server failures and malformed success into retryable errors", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(new Response("failure", { status: 504 })).mockResolvedValueOnce(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetcher);
    expect(await transcribeRecordingAudio("audio", "gemini")).toHaveProperty("error");
    expect(await transcribeRecordingAudio("audio", "gemini")).toHaveProperty("error");
  });
});
