import { beforeEach, expect, it, vi } from "vitest";
import { callLlm } from "./llm";
const fetcher = vi.fn();
const options = () => ({ deadlineMs: Date.now() + 5000, maxAttempts: 1 as const, responseByteLimit: 262_144, hardOutputTokenCap: 8192 });
const request = { contents: [{ role: "user" as const, parts: [{ text: "synthetic" }] }], generationConfig: { maxOutputTokens: 1000 } };
beforeEach(() => { vi.clearAllMocks(); vi.stubGlobal("fetch", fetcher); vi.stubEnv("GEMINI_API_KEY", "synthetic"); vi.stubEnv("GEMINI_MODEL", "gemini-3-fixture"); vi.stubEnv("GEMINI_MIN_OUTPUT_TOKENS", "16000"); });
it("enforces hard output ceiling after minimum-output normalization while leaving legacy normalization unchanged", async () => {
  fetcher.mockImplementation(async () => Response.json({ candidates: [{ content: { parts: [{ text: "ok" }] } }] }));
  await callLlm({ ...request, generationConfig: { maxOutputTokens: 20000 } }, "gemini", options()); expect(JSON.parse(fetcher.mock.calls[0][1].body).generationConfig.maxOutputTokens).toBe(8192);
  await callLlm(request, "gemini"); expect(JSON.parse(fetcher.mock.calls[1][1].body).generationConfig.maxOutputTokens).toBe(16000);
  await callLlm(request, "gemini", options()); expect(JSON.parse(fetcher.mock.calls[2][1].body).generationConfig.maxOutputTokens).toBe(1000);
});
it("performs one provider transport attempt on retryable HTTP errors", async () => {
  fetcher.mockResolvedValue(new Response("retry", { status: 429 }));
  expect((await callLlm(request, "gemini", options())).ok).toBe(false); expect(fetcher).toHaveBeenCalledOnce();
});
it("bounds error bodies without trusting Content-Length", async () => {
  let cancelled = false; fetcher.mockResolvedValue(new Response(new ReadableStream({ start(c) { c.enqueue(new Uint8Array(262_145)); }, cancel() { cancelled = true; } }), { status: 500 }));
  expect((await callLlm(request, "gemini", options())).ok).toBe(false); expect(cancelled).toBe(true); expect(fetcher).toHaveBeenCalledOnce();
});
it("cancels a stalled provider response body at the caller deadline", async () => {
  let cancelled = false; fetcher.mockResolvedValue(new Response(new ReadableStream({ cancel() { cancelled = true; } })));
  expect((await callLlm(request, "gemini", { ...options(), deadlineMs: Date.now() + 20 })).ok).toBe(false); expect(cancelled).toBe(true); expect(fetcher).toHaveBeenCalledOnce();
});
it("refuses unsupported provider selection and expired deadlines before fetch", async () => {
  expect((await callLlm(request, "other", options())).ok).toBe(false); expect((await callLlm(request, "gemini", { ...options(), deadlineMs: Date.now() - 1 })).ok).toBe(false); expect(fetcher).not.toHaveBeenCalled();
});