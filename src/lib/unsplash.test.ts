import { describe, it, expect } from "vitest";
import {
  deriveDeliverableImageQuery,
  mapUnsplashSearchResponse,
  buildUnsplashAttribution,
  classifyUnsplashHttpError,
  type UnsplashPhotoRecord,
} from "./unsplash";

function validSearchJson(overrides: Record<string, unknown> = {}) {
  return {
    results: [
      {
        id: "photo-1",
        description: "A stack of books",
        alt_description: "books on a shelf",
        urls: {
          regular: "https://images.unsplash.com/photo-1?w=1080",
          full: "https://images.unsplash.com/photo-1?full",
        },
        user: {
          name: "Jane Doe",
          links: { html: "https://unsplash.com/@janedoe" },
        },
        links: {
          html: "https://unsplash.com/photos/photo-1",
          download_location: "https://api.unsplash.com/photos/photo-1/download",
        },
        ...overrides,
      },
    ],
  };
}

describe("deriveDeliverableImageQuery", () => {
  // Tier 2 (topic) - exercised with primaryText left undefined, matching a
  // deliverable that carried no pageText and whose derived file-name title
  // (the caller's job to supply, not this pure function's) was itself empty.
  it("uses the schedule topic when the deliverable has no primary text, trimmed", () => {
    expect(deriveDeliverableImageQuery(undefined, "  Recursion and stack frames  ", [])).toBe(
      "Recursion and stack frames"
    );
  });

  it("strips markdown, code fences, and URLs from the topic before using it as a query", () => {
    const topic = "**Recursion** - see `foo()` and https://example.com/docs for more";
    const query = deriveDeliverableImageQuery(undefined, topic, []);
    expect(query).not.toContain("`");
    expect(query).not.toContain("*");
    expect(query).not.toContain("https://");
    expect(query).toContain("Recursion");
  });

  // Tier 1 (primaryText) - AC1: the deliverable's own content wins over the
  // week's topic whenever it has any, which is what lets two deliverables in
  // the SAME week (sharing the same topic) resolve to different queries.
  it("prefers the deliverable's own primary text over the week's topic when both are present", () => {
    const query = deriveDeliverableImageQuery(
      "This assignment covers binary search trees and rebalancing.",
      "Recursion",
      []
    );
    expect(query).toBe("This assignment covers binary search trees and rebalancing.");
  });

  it("reduces primary text to its first sentence, same as a fallback text", () => {
    const query = deriveDeliverableImageQuery(
      "This week covers binary search trees. It also covers balancing.",
      "Recursion",
      []
    );
    expect(query).toBe("This week covers binary search trees.");
  });

  // AC1: a deliverable with no pageText (a slides deck, an assignment
  // handout) still gets its OWN query from a title-only primaryText (no
  // sentence-ending punctuation to split on) - used whole, not truncated to
  // a fragment - rather than falling through to the shared week topic.
  it("uses a title-only primary text (no sentence punctuation) whole, not truncated to a fragment", () => {
    const query = deriveDeliverableImageQuery(
      "CS101 - Assignment - Recursive Backtracking Practice",
      "Recursion",
      []
    );
    expect(query).toBe("CS101 - Assignment - Recursive Backtracking Practice");
  });

  it("falls back to the topic when the primary text is blank", () => {
    expect(deriveDeliverableImageQuery("   ", "Recursion", [])).toBe("Recursion");
  });

  it("falls back to the first sentence of the first non-empty fallback text when neither primary text nor topic has content", () => {
    const query = deriveDeliverableImageQuery(undefined, undefined, [
      "",
      "This week covers binary search trees. It also covers balancing.",
    ]);
    expect(query).toBe("This week covers binary search trees.");
  });

  it("falls back to the first fallback text when both primary text and topic are blank", () => {
    expect(deriveDeliverableImageQuery("  ", "   ", ["Introduction to APIs and REST design."])).toBe(
      "Introduction to APIs and REST design."
    );
  });

  it("returns an empty string (never a generic query) when none of primary text, topic, or any fallback text has real content", () => {
    expect(deriveDeliverableImageQuery(undefined, undefined, [])).toBe("");
    expect(deriveDeliverableImageQuery("", "", ["", "   "])).toBe("");
  });

  it("caps an overly long query at 100 characters", () => {
    const longTopic = "a".repeat(300);
    expect(deriveDeliverableImageQuery(undefined, longTopic, []).length).toBe(100);
    expect(deriveDeliverableImageQuery(longTopic, undefined, []).length).toBe(100);
  });
});

describe("mapUnsplashSearchResponse", () => {
  it("maps a well-formed response to a photo record with UTM-tagged links", () => {
    const result = mapUnsplashSearchResponse(validSearchJson());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.photo.id).toBe("photo-1");
    expect(result.photo.photographerName).toBe("Jane Doe");
    expect(result.photo.imageUrl).toBe("https://images.unsplash.com/photo-1?w=1080");
    expect(result.photo.downloadLocation).toBe("https://api.unsplash.com/photos/photo-1/download");
    // AC2 (attribution): both links carry UTM parameters, the download
    // trigger endpoint does not (it is an API call, not a clicked link).
    expect(result.photo.photographerProfileUrl).toContain("utm_source=teaching_assistant");
    expect(result.photo.photographerProfileUrl).toContain("utm_medium=referral");
    expect(result.photo.photoPageUrl).toContain("utm_source=teaching_assistant");
    expect(result.photo.downloadLocation).not.toContain("utm_source");
  });

  it("falls back to full-size url when 'regular' is missing", () => {
    const json = validSearchJson({ urls: { full: "https://images.unsplash.com/photo-1?full" } });
    const result = mapUnsplashSearchResponse(json);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.photo.imageUrl).toBe("https://images.unsplash.com/photo-1?full");
  });

  it("reports 'no_results' for a well-formed but empty results array", () => {
    const result = mapUnsplashSearchResponse({ results: [] });
    expect(result).toEqual({ ok: false, reason: "no_results" });
  });

  it("reports 'malformed_response' for null/non-object JSON", () => {
    expect(mapUnsplashSearchResponse(null)).toEqual({ ok: false, reason: "malformed_response" });
    expect(mapUnsplashSearchResponse("a string")).toEqual({ ok: false, reason: "malformed_response" });
    expect(mapUnsplashSearchResponse(42)).toEqual({ ok: false, reason: "malformed_response" });
  });

  it("reports 'malformed_response' when 'results' is not an array", () => {
    expect(mapUnsplashSearchResponse({ results: "oops" })).toEqual({ ok: false, reason: "malformed_response" });
    expect(mapUnsplashSearchResponse({ errors: ["Rate Limit Exceeded"] })).toEqual({
      ok: false,
      reason: "malformed_response",
    });
  });

  it("reports 'malformed_response' when a required field (download_location) is missing", () => {
    const json = validSearchJson({ links: { html: "https://unsplash.com/photos/photo-1" } });
    expect(mapUnsplashSearchResponse(json)).toEqual({ ok: false, reason: "malformed_response" });
  });

  it("reports 'malformed_response' when the photographer name is missing", () => {
    const json = validSearchJson({ user: { links: { html: "https://unsplash.com/@janedoe" } } });
    expect(mapUnsplashSearchResponse(json)).toEqual({ ok: false, reason: "malformed_response" });
  });
});

describe("buildUnsplashAttribution", () => {
  const photo: UnsplashPhotoRecord = {
    id: "photo-1",
    description: "",
    imageUrl: "https://images.unsplash.com/photo-1",
    photographerName: "Jane Doe",
    photographerProfileUrl: "https://unsplash.com/@janedoe?utm_source=teaching_assistant&utm_medium=referral",
    photoPageUrl: "https://unsplash.com/photos/photo-1?utm_source=teaching_assistant&utm_medium=referral",
    downloadLocation: "https://api.unsplash.com/photos/photo-1/download",
  };

  it("builds a human-readable credit line naming the photographer and carrying both UTM-tagged links", () => {
    const attribution = buildUnsplashAttribution(photo);
    expect(attribution.creditLine).toContain("Jane Doe");
    expect(attribution.creditLine).toContain("on Unsplash");
    expect(attribution.creditLine).toContain(photo.photographerProfileUrl);
    expect(attribution.creditLine).toContain(photo.photoPageUrl);
  });
});

describe("classifyUnsplashHttpError", () => {
  it("classifies 403 as rate_limited (Unsplash's documented Demo-tier quota response)", () => {
    expect(classifyUnsplashHttpError(403)).toBe("rate_limited");
  });

  it("classifies 429 as rate_limited (standard too-many-requests)", () => {
    expect(classifyUnsplashHttpError(429)).toBe("rate_limited");
  });

  it("classifies other error statuses as server_error", () => {
    expect(classifyUnsplashHttpError(500)).toBe("server_error");
    expect(classifyUnsplashHttpError(404)).toBe("server_error");
    expect(classifyUnsplashHttpError(401)).toBe("server_error");
  });
});
