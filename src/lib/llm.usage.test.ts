import { describe, it, expect, vi, afterEach } from "vitest";
import { callLlm, parseUsageMetadata } from "./llm";

// DE6 (docs/module-walkthrough-deck-acceptance-criteria.md section 7): AC5
// needs real per-call cost shown BEFORE a run, which requires reading
// Gemini's usageMetadata and timing the call - neither existed before this
// change. New test file (not appended to llm.test.ts) so this specific,
// narrowly-scoped addition stays easy to find and to sabotage-check on its
// own, per this task's file lane.

describe("parseUsageMetadata", () => {
  it("parses a full usageMetadata block", () => {
    const data = {
      usageMetadata: { promptTokenCount: 1225, candidatesTokenCount: 340, totalTokenCount: 1565 },
    };
    expect(parseUsageMetadata(data)).toEqual({
      promptTokenCount: 1225,
      candidatesTokenCount: 340,
      totalTokenCount: 1565,
    });
  });

  it("returns undefined when usageMetadata is absent", () => {
    expect(parseUsageMetadata({ candidates: [] })).toBeUndefined();
  });

  it("returns undefined for malformed or non-object input", () => {
    expect(parseUsageMetadata(null)).toBeUndefined();
    expect(parseUsageMetadata(undefined)).toBeUndefined();
    expect(parseUsageMetadata("string")).toBeUndefined();
    expect(parseUsageMetadata(123)).toBeUndefined();
    expect(parseUsageMetadata([])).toBeUndefined();
  });

  it("drops non-numeric fields rather than passing them through", () => {
    const data = {
      usageMetadata: { promptTokenCount: "not a number", candidatesTokenCount: 50 },
    };
    expect(parseUsageMetadata(data)).toEqual({ candidatesTokenCount: 50 });
  });

  it("returns undefined when usageMetadata is present but has no usable numeric field", () => {
    const data = { usageMetadata: { promptTokenCount: "nope" } };
    expect(parseUsageMetadata(data)).toBeUndefined();
  });
});

describe("callLlm surfaces usage and elapsedMs from the real Gemini transport", () => {
  const savedApiKey = process.env.GEMINI_API_KEY;
  const savedModel = process.env.GEMINI_MODEL;

  const restoreEnv = (key: string, value: string | undefined) => {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  };

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
    restoreEnv("GEMINI_API_KEY", savedApiKey);
    restoreEnv("GEMINI_MODEL", savedModel);
  });

  it("surfaces usageMetadata as `usage` on a successful response", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            candidates: [{ content: { parts: [{ text: "ok" }] } }],
            usageMetadata: { promptTokenCount: 1225, candidatesTokenCount: 340, totalTokenCount: 1565 },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      )
    );

    const result = await callLlm({ contents: [{ role: "user", parts: [{ text: "hi" }] }] });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.usage).toEqual({ promptTokenCount: 1225, candidatesTokenCount: 340, totalTokenCount: 1565 });
    }
  });

  it("omits `usage` entirely when the response carries no usageMetadata", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "ok" }] } }] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      )
    );

    const result = await callLlm({ contents: [{ role: "user", parts: [{ text: "hi" }] }] });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.usage).toBeUndefined();
    }
  });

  it("measures elapsedMs around the fetch call, not just returning 0/undefined", async () => {
    vi.useFakeTimers();
    process.env.GEMINI_API_KEY = "test-key";
    // A deliberately slow fetch so a real timer wrap is distinguishable from
    // a stub that always reports 0 - the exact sabotage this test exists to
    // catch (see this task's report for the sabotage-check log).
    const fetchMock = vi.fn().mockImplementation(
      () =>
        new Promise((resolve) => {
          setTimeout(() => {
            resolve(
              new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "ok" }] } }] }), {
                status: 200,
                headers: { "Content-Type": "application/json" },
              })
            );
          }, 5000);
        })
    );
    vi.stubGlobal("fetch", fetchMock);

    const pending = callLlm({ contents: [{ role: "user", parts: [{ text: "hi" }] }] });
    await vi.advanceTimersByTimeAsync(5000);
    const result = await pending;

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(typeof result.elapsedMs).toBe("number");
      expect(result.elapsedMs).toBeGreaterThanOrEqual(5000);
    }
  });

  it("does not surface usage or elapsedMs on a failed (ok:false) response", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("blocked", { status: 403 })));

    const result = await callLlm({ contents: [{ role: "user", parts: [{ text: "hi" }] }] });
    expect(result.ok).toBe(false);
    expect((result as { usage?: unknown }).usage).toBeUndefined();
    expect((result as { elapsedMs?: unknown }).elapsedMs).toBeUndefined();
  });
});
