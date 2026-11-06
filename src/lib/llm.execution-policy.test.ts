import { afterEach, describe, expect, it, vi } from "vitest";
import { callLlm } from "./llm";

describe("callLlm with an execution policy", () => {
  const request = { contents: [{ role: "user" as const, parts: [{ text: "hi" }] }] };

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("aborts a stalled response body at the deadline and returns unknown", async () => {
    vi.stubEnv("GEMINI_API_KEY", "test-key");
    const fetchMock = vi.fn((_url: string, init: RequestInit) => {
      const signal = init.signal!;
      const body = new ReadableStream({
        start(controller) {
          signal.addEventListener("abort", () => controller.error(signal.reason), { once: true });
        },
      });
      return Promise.resolve(new Response(body));
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await callLlm(request, "gemini", { deadlineMs: Date.now() + 100 });

    expect(result).toMatchObject({ ok: false, outcome: "unknown" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ redirect: "error" });
    expect(fetchMock.mock.calls[0][1].signal?.aborted).toBe(true);
  });

  it("honors external cancellation after dispatch without retrying", async () => {
    vi.stubEnv("GEMINI_API_KEY", "test-key");
    const controller = new AbortController();
    const fetchMock = vi.fn((_url: string, init: RequestInit) => new Promise<Response>((_, reject) => {
      init.signal!.addEventListener("abort", () => reject(init.signal!.reason), { once: true });
    }));
    vi.stubGlobal("fetch", fetchMock);

    const pending = callLlm(request, "gemini", { deadlineMs: Date.now() + 10_000, signal: controller.signal });
    controller.abort();

    await expect(pending).resolves.toMatchObject({ ok: false, outcome: "unknown" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not retry a lost response or expose its transport details", async () => {
    vi.stubEnv("GEMINI_API_KEY", "test-key");
    const fetchMock = vi.fn().mockRejectedValue(new Error("private transport details"));
    vi.stubGlobal("fetch", fetchMock);

    await expect(callLlm(request, "gemini", { deadlineMs: Date.now() + 10_000 })).resolves.toEqual({
      ok: false, status: 0, body: "Model outcome unknown.", outcome: "unknown",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["null", null],
    ["object-valued parts", { candidates: [{ content: { parts: {} } }] }],
  ])("marks a malformed success envelope with %s unknown", async (_name, envelope) => {
    vi.stubEnv("GEMINI_API_KEY", "test-key");
    const fetchMock = vi.fn().mockResolvedValue(Response.json(envelope));
    vi.stubGlobal("fetch", fetchMock);

    await expect(callLlm(request, "gemini", { deadlineMs: Date.now() + 10_000 })).resolves.toEqual({
      ok: false, status: 200, body: "Model outcome unknown.", outcome: "unknown",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["generated text", { candidates: [{ content: { parts: [{ text: "ok" }] } }] }, "ok"],
    ["blocked response", { promptFeedback: { blockReason: "SAFETY" } }, ""],
  ])("accepts a complete %s envelope", async (_name, envelope, expectedText) => {
    vi.stubEnv("GEMINI_API_KEY", "test-key");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(envelope)));

    await expect(callLlm(request, "gemini", { deadlineMs: Date.now() + 10_000 }))
      .resolves.toMatchObject({ ok: true, text: expectedText });
  });

  it.each([429, 504])("attempts HTTP %i once, distinguishing refusals from gateway timeouts", async (status) => {
    vi.stubEnv("GEMINI_API_KEY", "test-key");
    const fetchMock = vi.fn().mockResolvedValue(new Response("private provider details", { status }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await callLlm(request, "gemini", { deadlineMs: Date.now() + 10_000 });

    expect(result).toEqual(status === 429
      ? { ok: false, status, body: "Model request refused." }
      : { ok: false, status, body: "Model outcome unknown.", outcome: "unknown" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not dispatch when the deadline has already passed", async () => {
    vi.stubEnv("GEMINI_API_KEY", "test-key");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(callLlm(request, "gemini", { deadlineMs: Date.now() - 1 })).resolves.toEqual({
      ok: false, status: 0, body: "Model request stopped before dispatch.",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("awaits durable authorization and skips dispatch when that response is lost", async () => {
    vi.stubEnv("GEMINI_API_KEY", "test-key");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const authorization = Promise.withResolvers<void>();
    const pending = callLlm(request, "gemini", {
      deadlineMs: Date.now() + 10_000,
      beforeDispatch: () => authorization.promise,
    });
    expect(fetchMock).not.toHaveBeenCalled();
    authorization.reject(new Error("Lost authorization reply"));
    await expect(pending).rejects.toThrow("Lost authorization reply");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
