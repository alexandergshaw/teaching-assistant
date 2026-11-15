import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("@/lib/supabase/auth", () => ({ requireUser: vi.fn() }));
vi.mock("@/app/actions/live-class", () => ({ transcribeLiveAudioAction: vi.fn() }));
import { requireUser } from "@/lib/supabase/auth";
import { transcribeLiveAudioAction } from "@/app/actions/live-class";
import { POST } from "@/app/api/recording-transcription/route";
import { transcribeWalkthroughChunk } from "./walkthrough-transcription-transport";

beforeEach(() => { vi.resetAllMocks(); vi.mocked(requireUser).mockResolvedValue({ id: "instructor" } as never); });
afterEach(() => vi.unstubAllGlobals());

it("passes a bounded narration chunk through the authenticated JSON route", async () => {
  const audio = "a".repeat(426728);
  vi.mocked(transcribeLiveAudioAction).mockResolvedValue({ text: "spoken words" });
  const fetcher = vi.fn(async (_url: string, init: RequestInit) => POST(new Request("http://localhost/api/recording-transcription", init)));
  vi.stubGlobal("fetch", fetcher);
  const controller = new AbortController();
  expect(await transcribeWalkthroughChunk(audio, { provider: "gemini" }, controller.signal)).toEqual({ text: "spoken words" });
  expect(fetcher).toHaveBeenCalledOnce();
  expect(vi.mocked(requireUser)).toHaveBeenCalledOnce();
  expect(vi.mocked(transcribeLiveAudioAction)).toHaveBeenCalledWith(audio, { provider: "gemini" });
  expect(fetcher.mock.calls[0][1].signal).toBe(controller.signal);
});

it("does not expose route response bodies on HTTP failure or malformed JSON", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response("PRIVATE_ERROR", { status: 502 })));
  expect(await transcribeWalkthroughChunk("audio", { provider: "gemini" })).toEqual({ error: "Transcription failed: HTTP 0" });
  vi.stubGlobal("fetch", vi.fn(async () => new Response("PRIVATE_ERROR", { status: 200 })));
  expect(await transcribeWalkthroughChunk("audio", { provider: "gemini" })).toEqual({ error: "Transcription response was invalid." });
});

it("passes cancellation to fetch and never retries a rejected request", async () => {
  const fetcher = vi.fn((_url: string, init: RequestInit) => new Promise<Response>((_resolve, reject) => {
    init.signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
  }));
  vi.stubGlobal("fetch", fetcher);
  const controller = new AbortController();
  const pending = transcribeWalkthroughChunk("audio", { provider: "gemini" }, controller.signal);
  controller.abort();
  await expect(pending).rejects.toThrow("aborted");
  expect(fetcher).toHaveBeenCalledOnce();
});
