import { describe, it, expect } from "vitest";
import {
  parseGroundingSources,
  describeLlmFailure,
  describeEmptyLlmText,
  parseFinishReason,
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
