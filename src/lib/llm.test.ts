import { describe, it, expect } from "vitest";
import { parseGroundingSources } from "./llm";

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
