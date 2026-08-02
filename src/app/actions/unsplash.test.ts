import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { unsplashConfiguredAction, fetchUnsplashImageAction } from "./unsplash";

global.fetch = vi.fn();
const mockFetch = fetch as ReturnType<typeof vi.fn>;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function validSearchJson() {
  return {
    results: [
      {
        id: "photo-1",
        description: "A stack of books",
        urls: { regular: "https://images.unsplash.com/photo-1?w=1080" },
        user: { name: "Jane Doe", links: { html: "https://unsplash.com/@janedoe" } },
        links: {
          html: "https://unsplash.com/photos/photo-1",
          download_location: "https://api.unsplash.com/photos/photo-1/download",
        },
      },
    ],
  };
}

beforeEach(() => {
  mockFetch.mockClear();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("unsplashConfiguredAction", () => {
  it("reports configured when UNSPLASH_ACCESS_KEY is set", async () => {
    vi.stubEnv("UNSPLASH_ACCESS_KEY", "test-key");
    expect(await unsplashConfiguredAction()).toEqual({ configured: true });
  });

  it("reports not configured when UNSPLASH_ACCESS_KEY is unset (AC0 - the missing-key path)", async () => {
    vi.stubEnv("UNSPLASH_ACCESS_KEY", "");
    expect(await unsplashConfiguredAction()).toEqual({ configured: false });
  });

  it("treats a whitespace-only key as not configured", async () => {
    vi.stubEnv("UNSPLASH_ACCESS_KEY", "   ");
    expect(await unsplashConfiguredAction()).toEqual({ configured: false });
  });
});

describe("fetchUnsplashImageAction", () => {
  it("skips with 'not_configured' and never calls fetch when the key is unset (AC0)", async () => {
    vi.stubEnv("UNSPLASH_ACCESS_KEY", "");
    const result = await fetchUnsplashImageAction("recursion");
    expect(result).toEqual({ skipped: true, reason: "not_configured" });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("skips with 'no_query' and never calls fetch for a blank query", async () => {
    vi.stubEnv("UNSPLASH_ACCESS_KEY", "test-key");
    const result = await fetchUnsplashImageAction("   ");
    expect(result).toEqual({ skipped: true, reason: "no_query" });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("on success: searches, fires the download trigger, and returns the downloaded bytes as base64", async () => {
    vi.stubEnv("UNSPLASH_ACCESS_KEY", "test-key");
    mockFetch
      .mockResolvedValueOnce(jsonResponse(validSearchJson())) // search
      .mockResolvedValueOnce(new Response(null, { status: 200 })) // download trigger
      .mockResolvedValueOnce(
        new Response(new Uint8Array([1, 2, 3]).buffer, {
          status: 200,
          headers: { "content-type": "image/jpeg" },
        })
      ); // byte download

    const result = await fetchUnsplashImageAction("recursion and stack frames");

    expect(mockFetch).toHaveBeenCalledTimes(3);
    // Call 1: search, with the Client-ID auth header.
    const searchCall = mockFetch.mock.calls[0];
    expect(String(searchCall[0])).toContain("/search/photos");
    expect(String(searchCall[0])).toContain(encodeURIComponent("recursion and stack frames"));
    expect((searchCall[1] as RequestInit).headers).toMatchObject({ Authorization: "Client-ID test-key" });
    // Call 2: the mandatory download-usage trigger, hitting the exact
    // download_location the search response returned.
    const triggerCall = mockFetch.mock.calls[1];
    expect(triggerCall[0]).toBe("https://api.unsplash.com/photos/photo-1/download");

    if ("photo" in result) {
      expect(result.photo.id).toBe("photo-1");
      expect(result.mimeType).toBe("image/jpeg");
      expect(Buffer.from(result.base64, "base64")).toEqual(Buffer.from([1, 2, 3]));
    } else {
      throw new Error(`expected a photo result, got ${JSON.stringify(result)}`);
    }
  });

  it("fires the download trigger before downloading bytes even if the trigger request itself fails (best-effort, AC3)", async () => {
    vi.stubEnv("UNSPLASH_ACCESS_KEY", "test-key");
    mockFetch
      .mockResolvedValueOnce(jsonResponse(validSearchJson()))
      .mockRejectedValueOnce(new Error("network blip")) // download trigger fails
      .mockResolvedValueOnce(
        new Response(new Uint8Array([9]).buffer, { status: 200, headers: { "content-type": "image/png" } })
      );

    const result = await fetchUnsplashImageAction("topic");
    expect("photo" in result).toBe(true);
  });

  it("classifies a 403 search response as rate-limited (AC3 - Demo-tier quota)", async () => {
    vi.stubEnv("UNSPLASH_ACCESS_KEY", "test-key");
    mockFetch.mockResolvedValueOnce(new Response(JSON.stringify({ errors: ["Rate Limit Exceeded"] }), { status: 403 }));
    const result = await fetchUnsplashImageAction("topic");
    expect(result).toMatchObject({ rateLimited: true });
    expect("error" in result && result.error).toContain("403");
  });

  it("classifies a 429 search response as rate-limited (AC3)", async () => {
    vi.stubEnv("UNSPLASH_ACCESS_KEY", "test-key");
    mockFetch.mockResolvedValueOnce(new Response(JSON.stringify({}), { status: 429 }));
    const result = await fetchUnsplashImageAction("topic");
    expect(result).toMatchObject({ rateLimited: true });
  });

  it("classifies a 500 search response as a non-rate-limited error", async () => {
    vi.stubEnv("UNSPLASH_ACCESS_KEY", "test-key");
    mockFetch.mockResolvedValueOnce(new Response(JSON.stringify({}), { status: 500 }));
    const result = await fetchUnsplashImageAction("topic");
    expect(result).toMatchObject({ rateLimited: false });
  });

  it("skips with 'no_results' for an empty results array (AC3)", async () => {
    vi.stubEnv("UNSPLASH_ACCESS_KEY", "test-key");
    mockFetch.mockResolvedValueOnce(jsonResponse({ results: [] }));
    const result = await fetchUnsplashImageAction("topic");
    expect(result).toEqual({ skipped: true, reason: "no_results" });
    expect(mockFetch).toHaveBeenCalledTimes(1); // never reaches the trigger/download calls
  });

  it("skips with 'malformed_response' for a response missing the fields this feature needs (AC3)", async () => {
    vi.stubEnv("UNSPLASH_ACCESS_KEY", "test-key");
    mockFetch.mockResolvedValueOnce(jsonResponse({ results: [{ id: "x" }] }));
    const result = await fetchUnsplashImageAction("topic");
    expect(result).toEqual({ skipped: true, reason: "malformed_response" });
  });

  it("skips with 'network_error' when the search fetch itself throws (AC3)", async () => {
    vi.stubEnv("UNSPLASH_ACCESS_KEY", "test-key");
    mockFetch.mockRejectedValueOnce(new Error("DNS failure"));
    const result = await fetchUnsplashImageAction("topic");
    expect(result).toEqual({ skipped: true, reason: "network_error" });
  });

  it("skips with 'download_failed' when the byte download itself fails after a good search", async () => {
    vi.stubEnv("UNSPLASH_ACCESS_KEY", "test-key");
    mockFetch
      .mockResolvedValueOnce(jsonResponse(validSearchJson()))
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 500 }));
    const result = await fetchUnsplashImageAction("topic");
    expect(result).toEqual({ skipped: true, reason: "download_failed" });
  });
});
