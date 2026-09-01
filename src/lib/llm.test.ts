import { describe, it, expect, vi, afterEach } from "vitest";
import {
  parseGroundingSources,
  describeLlmFailure,
  describeEmptyLlmText,
  describeEmptyLlmImage,
  parseFinishReason,
  isGemini3Model,
  normalizeGenerationConfig,
  callLlm,
  generateGeminiImage,
  type LlmGenerationConfig,
  type LlmImageResult,
} from "./llm";

describe("parseGroundingSources", () => {
  it("parses sources from valid grounding metadata", () => {
    const data = {
      candidates: [
        {
          groundingMetadata: {
            groundingChunks: [
              {
                web: {
                  uri: "https://example.com/article1",
                  title: "Example Article 1",
                },
              },
              {
                web: {
                  uri: "https://example.com/article2",
                  title: "Example Article 2",
                },
              },
            ],
          },
        },
      ],
    };

    const result = parseGroundingSources(data);
    expect(result).toEqual([
      { uri: "https://example.com/article1", title: "Example Article 1" },
      { uri: "https://example.com/article2", title: "Example Article 2" },
    ]);
  });

  it("uses uri as title when title is missing", () => {
    const data = {
      candidates: [
        {
          groundingMetadata: {
            groundingChunks: [
              {
                web: {
                  uri: "https://example.com/article",
                },
              },
            ],
          },
        },
      ],
    };

    const result = parseGroundingSources(data);
    expect(result).toEqual([
      {
        uri: "https://example.com/article",
        title: "https://example.com/article",
      },
    ]);
  });

  it("skips chunks without a uri", () => {
    const data = {
      candidates: [
        {
          groundingMetadata: {
            groundingChunks: [
              {
                web: {
                  title: "Title without URI",
                },
              },
              {
                web: {
                  uri: "https://example.com/valid",
                  title: "Valid Source",
                },
              },
            ],
          },
        },
      ],
    };

    const result = parseGroundingSources(data);
    expect(result).toEqual([
      { uri: "https://example.com/valid", title: "Valid Source" },
    ]);
  });

  it("returns undefined when metadata is missing", () => {
    const data = {
      candidates: [
        {
          content: { parts: [{ text: "Some text" }] },
        },
      ],
    };

    const result = parseGroundingSources(data);
    expect(result).toBeUndefined();
  });

  it("returns undefined when candidates array is missing", () => {
    const data = {};

    const result = parseGroundingSources(data);
    expect(result).toBeUndefined();
  });

  it("returns undefined when groundingChunks is not an array", () => {
    const data = {
      candidates: [
        {
          groundingMetadata: {
            groundingChunks: "not an array",
          },
        },
      ],
    };

    const result = parseGroundingSources(data);
    expect(result).toBeUndefined();
  });

  it("returns undefined for non-object input", () => {
    expect(parseGroundingSources(null)).toBeUndefined();
    expect(parseGroundingSources(undefined)).toBeUndefined();
    expect(parseGroundingSources("string")).toBeUndefined();
    expect(parseGroundingSources(123)).toBeUndefined();
    expect(parseGroundingSources([])).toBeUndefined();
  });

  it("returns undefined when all chunks lack uris", () => {
    const data = {
      candidates: [
        {
          groundingMetadata: {
            groundingChunks: [
              { web: { title: "Title 1" } },
              { web: { title: "Title 2" } },
            ],
          },
        },
      ],
    };

    const result = parseGroundingSources(data);
    expect(result).toBeUndefined();
  });

  it("returns undefined when groundingChunks is an empty array", () => {
    const data = {
      candidates: [
        {
          groundingMetadata: {
            groundingChunks: [],
          },
        },
      ],
    };

    const result = parseGroundingSources(data);
    expect(result).toBeUndefined();
  });

  it("handles malformed chunk objects gracefully", () => {
    const data = {
      candidates: [
        {
          groundingMetadata: {
            groundingChunks: [
              { web: null },
              { web: { uri: "https://example.com/valid", title: "Valid" } },
              {},
            ],
          },
        },
      ],
    };

    const result = parseGroundingSources(data);
    expect(result).toEqual([
      { uri: "https://example.com/valid", title: "Valid" },
    ]);
  });
});

describe("describeLlmFailure", () => {
  it("formats an HTTP failure with status and body", () => {
    const result = describeLlmFailure({ ok: false, status: 429, body: "Quota exceeded" }, "Schedule generation failed");
    expect(result).toBe("Schedule generation failed: HTTP 429 — Quota exceeded");
  });

  it("truncates the body to 200 characters", () => {
    const longBody = "x".repeat(300);
    const result = describeLlmFailure({ ok: false, status: 500, body: longBody }, "Schedule generation failed");
    expect(result).toBe(`Schedule generation failed: HTTP 500 — ${"x".repeat(200)}`);
  });

  it("uses network error wording when status is 0", () => {
    const result = describeLlmFailure({ ok: false, status: 0, body: "fetch failed" }, "Schedule generation failed");
    expect(result).toBe("Schedule generation failed: network error — fetch failed");
  });

  it("omits the trailing dash segment when the body is empty", () => {
    const result = describeLlmFailure({ ok: false, status: 503, body: "" }, "Schedule generation failed");
    expect(result).toBe("Schedule generation failed: HTTP 503");
  });

  it("omits the trailing dash segment when the body is whitespace only", () => {
    const result = describeLlmFailure({ ok: false, status: 400, body: "   \n  " }, "Schedule generation failed");
    expect(result).toBe("Schedule generation failed: HTTP 400");
  });

  it("omits the trailing dash segment for a network error with an empty body", () => {
    const result = describeLlmFailure({ ok: false, status: 0, body: "" }, "Schedule generation failed");
    expect(result).toBe("Schedule generation failed: network error");
  });
});

describe("describeEmptyLlmText", () => {
  it("includes the finishReason when present", () => {
    const result = describeEmptyLlmText({ ok: true, text: "", finishReason: "MAX_TOKENS" }, "Schedule generation failed");
    expect(result).toBe("Schedule generation failed: the model returned an empty response (finishReason: MAX_TOKENS).");
  });

  it("omits the finishReason segment when absent", () => {
    const result = describeEmptyLlmText({ ok: true, text: "" }, "Schedule generation failed");
    expect(result).toBe("Schedule generation failed: the model returned an empty response.");
  });
});

describe("parseFinishReason", () => {
  it("returns the candidate finishReason when present", () => {
    const data = { candidates: [{ finishReason: "MAX_TOKENS" }] };
    expect(parseFinishReason(data)).toBe("MAX_TOKENS");
  });

  it("prefers the candidate finishReason over a prompt-level blockReason", () => {
    const data = {
      candidates: [{ finishReason: "STOP" }],
      promptFeedback: { blockReason: "SAFETY" },
    };
    expect(parseFinishReason(data)).toBe("STOP");
  });

  it("falls back to a BLOCKED_ prefixed promptFeedback.blockReason when no candidate reason exists", () => {
    const data = { promptFeedback: { blockReason: "SAFETY" } };
    expect(parseFinishReason(data)).toBe("BLOCKED_SAFETY");
  });

  it("falls back to blockReason when the candidate has no finishReason", () => {
    const data = {
      candidates: [{}],
      promptFeedback: { blockReason: "OTHER" },
    };
    expect(parseFinishReason(data)).toBe("BLOCKED_OTHER");
  });

  it("returns undefined when neither finishReason nor blockReason is present", () => {
    const data = { candidates: [{}] };
    expect(parseFinishReason(data)).toBeUndefined();
  });

  it("returns undefined when candidates is missing entirely", () => {
    expect(parseFinishReason({})).toBeUndefined();
  });

  it("returns undefined for malformed or non-object input", () => {
    expect(parseFinishReason(null)).toBeUndefined();
    expect(parseFinishReason(undefined)).toBeUndefined();
    expect(parseFinishReason("string")).toBeUndefined();
    expect(parseFinishReason(123)).toBeUndefined();
    expect(parseFinishReason([])).toBeUndefined();
  });
});

describe("isGemini3Model", () => {
  it("matches gemini-3 family model names, case-insensitively", () => {
    expect(isGemini3Model("gemini-3")).toBe(true);
    expect(isGemini3Model("gemini-3-flash")).toBe(true);
    expect(isGemini3Model("gemini-3.1-flash-lite")).toBe(true);
    expect(isGemini3Model("gemini-3.1-pro-preview")).toBe(true);
    expect(isGemini3Model("GEMINI-3.1-FLASH-LITE")).toBe(true);
  });

  it("does not match gemini-2.5, gemini-30-something, or an empty string", () => {
    expect(isGemini3Model("gemini-2.5-flash")).toBe(false);
    expect(isGemini3Model("gemini-30-something")).toBe(false);
    expect(isGemini3Model("")).toBe(false);
  });
});

describe("normalizeGenerationConfig", () => {
  const tuning = { allowLowTemperature: false, thinkingLevel: undefined, minOutputTokens: 512 };
  const otherModel = "gemini-2.5-flash";
  const gemini3Model = "gemini-3.1-flash-lite";

  it("passes non-Gemini-3 configs through unchanged, including undefined", () => {
    const config: LlmGenerationConfig = { temperature: 0.2, maxOutputTokens: 50 };
    expect(normalizeGenerationConfig(config, otherModel, tuning)).toBe(config);
    expect(normalizeGenerationConfig(undefined, otherModel, tuning)).toBeUndefined();
  });

  it.each([0, 0.2, 0.6])("drops a low temperature of %s for a Gemini 3 model", (temperature) => {
    const result = normalizeGenerationConfig(
      { temperature, responseMimeType: "text/plain" },
      gemini3Model,
      tuning
    );
    expect(result).not.toHaveProperty("temperature");
  });

  it("keeps temperature 1", () => {
    const result = normalizeGenerationConfig({ temperature: 1 }, gemini3Model, tuning);
    expect(result).toEqual({ temperature: 1 });
  });

  it("keeps a low temperature when allowLowTemperature is true", () => {
    const result = normalizeGenerationConfig(
      { temperature: 0.2 },
      gemini3Model,
      { ...tuning, allowLowTemperature: true }
    );
    expect(result).toEqual({ temperature: 0.2 });
  });

  it("raises maxOutputTokens below the floor", () => {
    const result = normalizeGenerationConfig({ maxOutputTokens: 50 }, gemini3Model, tuning);
    expect(result).toEqual({ maxOutputTokens: 512 });
  });

  it("leaves maxOutputTokens already above the floor alone", () => {
    const result = normalizeGenerationConfig({ maxOutputTokens: 8192 }, gemini3Model, tuning);
    expect(result).toEqual({ maxOutputTokens: 8192 });
  });

  it("leaves an absent maxOutputTokens absent", () => {
    const result = normalizeGenerationConfig({ temperature: 1 }, gemini3Model, tuning);
    expect(result).not.toHaveProperty("maxOutputTokens");
  });

  it("adds thinkingConfig only when thinkingLevel is set", () => {
    const withoutLevel = normalizeGenerationConfig({ temperature: 1 }, gemini3Model, tuning);
    expect(withoutLevel).not.toHaveProperty("thinkingConfig");

    const withLevel = normalizeGenerationConfig(
      { temperature: 1 },
      gemini3Model,
      { ...tuning, thinkingLevel: "low" }
    );
    expect(withLevel).toEqual({ temperature: 1, thinkingConfig: { thinkingLevel: "low" } });
  });

  it("passes responseMimeType through untouched", () => {
    const result = normalizeGenerationConfig(
      { temperature: 1, responseMimeType: "application/json" },
      gemini3Model,
      tuning
    );
    expect(result).toEqual({ temperature: 1, responseMimeType: "application/json" });
  });

  it("does not mutate the caller's config object", () => {
    const config: LlmGenerationConfig = { temperature: 0.2 };
    normalizeGenerationConfig(config, gemini3Model, tuning);
    expect(config.temperature).toBe(0.2);
  });

  it("returns undefined instead of an empty object", () => {
    const result = normalizeGenerationConfig({ temperature: 0.5 }, gemini3Model, tuning);
    expect(result).toBeUndefined();
  });
});

describe("callLlm request shape", () => {
  const savedApiKey = process.env.GEMINI_API_KEY;
  const savedModel = process.env.GEMINI_MODEL;

  // Assigning undefined to process.env stores the STRING "undefined", which
  // would leak a bogus model name into anything that runs after this file.
  const restoreEnv = (key: string, value: string | undefined) => {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  };

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    restoreEnv("GEMINI_API_KEY", savedApiKey);
    restoreEnv("GEMINI_MODEL", savedModel);
  });

  it("drops a low temperature and raises maxOutputTokens to the floor for the default Gemini 3 model", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    delete process.env.GEMINI_MODEL;

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "ok" }] } }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    await callLlm({
      contents: [{ role: "user", parts: [{ text: "hi" }] }],
      generationConfig: { temperature: 0.2, maxOutputTokens: 50 },
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const requestInit = fetchMock.mock.calls[0][1] as RequestInit;
    const sentBody = JSON.parse(requestInit.body as string);
    expect(sentBody.generationConfig).not.toHaveProperty("temperature");
    expect(sentBody.generationConfig.maxOutputTokens).toBe(512);
  });
});

describe("describeEmptyLlmImage", () => {
  it("surfaces the model's own refusal text when present", () => {
    const result = describeEmptyLlmImage(
      { ok: true, base64: null, text: "I can't create images of real people." },
      "Image generation failed"
    );
    expect(result).toBe(
      'Image generation failed: the model did not return an image - it said: "I can\'t create images of real people."'
    );
  });

  it("truncates a long refusal text to 200 characters, matching describeLlmFailure's own budget", () => {
    const longText = "x".repeat(300);
    const result = describeEmptyLlmImage({ ok: true, base64: null, text: longText }, "Image generation failed");
    expect(result).toBe(
      `Image generation failed: the model did not return an image - it said: "${"x".repeat(200)}"`
    );
  });

  it("trims whitespace-only text down to nothing and falls back to the bare statement", () => {
    const result = describeEmptyLlmImage({ ok: true, base64: null, text: "   \n  " }, "Image generation failed");
    expect(result).toBe("Image generation failed: the model did not return an image.");
  });

  it("falls back to finishReason when there is no usable text", () => {
    const result = describeEmptyLlmImage(
      { ok: true, base64: null, text: "", finishReason: "SAFETY" },
      "Image generation failed"
    );
    expect(result).toBe("Image generation failed: the model did not return an image (finishReason: SAFETY).");
  });

  it("falls back to a bare statement when there is neither text nor finishReason", () => {
    const result = describeEmptyLlmImage({ ok: true, base64: null, text: "" }, "Image generation failed");
    expect(result).toBe("Image generation failed: the model did not return an image.");
  });

  it("prefers the model's text over finishReason when both are present", () => {
    const result = describeEmptyLlmImage(
      { ok: true, base64: null, text: "blocked by safety settings", finishReason: "SAFETY" },
      "Image generation failed"
    );
    expect(result).toBe(
      'Image generation failed: the model did not return an image - it said: "blocked by safety settings"'
    );
  });
});

describe("generateGeminiImage", () => {
  const savedApiKey = process.env.GEMINI_API_KEY;
  const savedImageModel = process.env.GEMINI_IMAGE_MODEL;

  const restoreEnv = (key: string, value: string | undefined) => {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  };

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
    restoreEnv("GEMINI_API_KEY", savedApiKey);
    restoreEnv("GEMINI_IMAGE_MODEL", savedImageModel);
  });

  function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  }

  it("posts to /v1beta/interactions (not :generateContent) with the model in the body, an x-goog-api-key header, and the required Api-Revision header", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    process.env.GEMINI_IMAGE_MODEL = "gemini-image-test-model";
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ output_image: { data: "AAAA", mime_type: "image/png" } })
    );
    vi.stubGlobal("fetch", fetchMock);

    await generateGeminiImage("a simple illustration of a library");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, requestInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://generativelanguage.googleapis.com/v1beta/interactions");

    const headers = requestInit.headers as Record<string, string>;
    expect(headers).toEqual({
      "Content-Type": "application/json",
      "x-goog-api-key": "test-key",
      "Api-Revision": "2026-05-20",
    });

    const sentBody = JSON.parse(requestInit.body as string);
    expect(sentBody).toEqual({
      model: "gemini-image-test-model",
      input: [{ type: "text", text: "a simple illustration of a library" }],
      response_format: { type: "image", mime_type: "image/png" },
    });
  });

  it("returns the image data and mimeType from output_image on success", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          steps: [
            {
              type: "model_output",
              content: [{ type: "image", data: "ZmFrZS1pbWFnZS1ieXRlcw==", mime_type: "image/jpeg" }],
            },
          ],
          output_image: { data: "ZmFrZS1pbWFnZS1ieXRlcw==", mime_type: "image/jpeg" },
        })
      )
    );

    const result = await generateGeminiImage("a simple illustration");
    expect(result).toEqual({ ok: true, base64: "ZmFrZS1pbWFnZS1ieXRlcw==", mimeType: "image/jpeg" });
  });

  it("defaults mimeType to image/png when output_image omits it", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ output_image: { data: "AAAA" } }))
    );

    const result = await generateGeminiImage("a simple illustration");
    expect(result).toEqual({ ok: true, base64: "AAAA", mimeType: "image/png" });
  });

  it("falls back to scanning steps[].content[] for an image block when output_image is absent", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          steps: [
            {
              type: "model_output",
              content: [
                { type: "text", text: "Here is an illustration:" },
                { type: "image", data: "BBBB", mime_type: "image/png" },
              ],
            },
          ],
        })
      )
    );

    const result = await generateGeminiImage("a simple illustration");
    expect(result).toEqual({ ok: true, base64: "BBBB", mimeType: "image/png" });
  });

  it("resolves ok:true with base64:null and the model's text when the response has no image block (refusal)", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          steps: [
            {
              type: "model_output",
              content: [{ type: "text", text: "I can't generate an image of a real person." }],
              stop_reason: "STOP",
            },
          ],
        })
      )
    );

    const result = await generateGeminiImage("a photo of my professor");
    expect(result).toEqual({
      ok: true,
      base64: null,
      text: "I can't generate an image of a real person.",
      finishReason: "STOP",
    });
  });

  it("resolves ok:true with base64:null and empty text when the response has neither an image nor text block", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({ steps: [{ type: "model_output", content: [], stop_reason: "MAX_TOKENS" }] })
      )
    );

    const result = await generateGeminiImage("a simple illustration");
    expect(result).toEqual({ ok: true, base64: null, text: "", finishReason: "MAX_TOKENS" });
  });

  it("does not retry a non-retryable HTTP error (e.g. 403) and returns it as ok:false", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    const fetchMock = vi.fn().mockResolvedValue(new Response("blocked: safety policy", { status: 403 }));
    vi.stubGlobal("fetch", fetchMock);

    const result: LlmImageResult = await generateGeminiImage("a simple illustration");
    expect(result).toEqual({ ok: false, status: 403, body: "blocked: safety policy" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries a 429 (quota) response and eventually returns the final failure after MAX_ATTEMPTS", async () => {
    vi.useFakeTimers();
    process.env.GEMINI_API_KEY = "test-key";
    // A fresh Response per call, not mockResolvedValue's single shared
    // instance - a Response body can only be read (.text()) once, and
    // postInteraction calls .text() on every non-ok attempt, so reusing
    // one instance across 5 retried attempts would throw "Body is unusable"
    // on the second attempt - a test-harness bug, not a real fetch behavior
    // (a real network call returns a fresh Response object every time).
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(new Response("quota exceeded", { status: 429 })));
    vi.stubGlobal("fetch", fetchMock);

    const pending = generateGeminiImage("a simple illustration");
    await vi.advanceTimersByTimeAsync(30_000);
    const result = await pending;

    expect(fetchMock).toHaveBeenCalledTimes(5);
    expect(result).toEqual({ ok: false, status: 429, body: "quota exceeded" });
  });

  it("retries a network error and returns it as status 0 after MAX_ATTEMPTS", async () => {
    vi.useFakeTimers();
    process.env.GEMINI_API_KEY = "test-key";
    const fetchMock = vi.fn().mockRejectedValue(new Error("fetch failed"));
    vi.stubGlobal("fetch", fetchMock);

    const pending = generateGeminiImage("a simple illustration");
    await vi.advanceTimersByTimeAsync(30_000);
    const result = await pending;

    expect(fetchMock).toHaveBeenCalledTimes(5);
    expect(result).toEqual({ ok: false, status: 0, body: "fetch failed" });
  });

  it("rejects (never resolves to an error value) when GEMINI_API_KEY is missing - matching callGemini's own precedent", async () => {
    delete process.env.GEMINI_API_KEY;
    vi.stubGlobal("fetch", vi.fn());

    await expect(generateGeminiImage("a simple illustration")).rejects.toThrow(
      "Missing environment variable: GEMINI_API_KEY"
    );
  });
});
