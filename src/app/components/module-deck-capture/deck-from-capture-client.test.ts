import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { UPLOAD_WIRE_BUDGET_BYTES } from "@/lib/upload-budget";
import {
  generateDeckFromCaptureApi,
  checkCaptureMaterialsWireBudget,
  type DeckFromCaptureRequest,
} from "./deck-from-capture-client";

const BASE_PAYLOAD: DeckFromCaptureRequest = {
  courseUrl: "https://canvas.example.edu/courses/100",
  templateId: "preset-classic-lecture",
  materialsText: "captured walkthrough text",
};

function jsonResponse(body: unknown, init?: { status?: number }) {
  return {
    status: init?.status ?? 200,
    headers: { get: (name: string) => (name.toLowerCase() === "content-type" ? "application/json" : null) },
    json: async () => body,
  } as unknown as Response;
}

function htmlResponse(status: number) {
  return {
    status,
    headers: { get: (name: string) => (name.toLowerCase() === "content-type" ? "text/html; charset=utf-8" : null) },
    json: async () => {
      throw new Error("Unexpected token '<'");
    },
  } as unknown as Response;
}

describe("checkCaptureMaterialsWireBudget", () => {
  it("passes an ordinary capture's materials text", () => {
    expect(checkCaptureMaterialsWireBudget("a reasonably sized capture").ok).toBe(true);
  });

  it("refuses a materials string whose WIRE bytes exceed the upload budget, with a real reason", () => {
    // One ASCII character is exactly one UTF-8 byte, so this string's byte
    // length is its `.length` - deliberately well past UPLOAD_WIRE_BUDGET_BYTES
    // (3.5MB) so this proves the actual boundary, not merely "some big string
    // fails".
    const oversized = "a".repeat(UPLOAD_WIRE_BUDGET_BYTES + 1);
    const result = checkCaptureMaterialsWireBudget(oversized);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/too large/i);
    expect(result.error).toMatch(/The captured material/);
  });

  it("counts real UTF-8 bytes, not UTF-16 .length - a multi-byte character weighs more than one unit", () => {
    // "MB" worth of a 3-byte-per-char string (e.g. many CJK characters) has a
    // `.length` far under the budget while its actual wire bytes exceed it -
    // proves the guard cannot be fooled by counting JS string units instead
    // of encoded bytes.
    const charCount = Math.floor(UPLOAD_WIRE_BUDGET_BYTES / 3) + 100;
    const multiByte = "文".repeat(charCount); // each char is 3 UTF-8 bytes
    expect(multiByte.length).toBeLessThan(UPLOAD_WIRE_BUDGET_BYTES);
    const result = checkCaptureMaterialsWireBudget(multiByte);
    expect(result.ok).toBe(false);
  });
});

describe("generateDeckFromCaptureApi", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = vi.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("refuses an oversized materialsText BEFORE dispatching any network call", async () => {
    const oversized = "a".repeat(UPLOAD_WIRE_BUDGET_BYTES + 1);
    const result = await generateDeckFromCaptureApi({ ...BASE_PAYLOAD, materialsText: oversized });
    expect("error" in result).toBe(true);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("posts to the deck-from-capture route and returns the parsed success body", async () => {
    vi.mocked(global.fetch).mockResolvedValue(
      jsonResponse({ artifact: { id: "artifact-1", version: 1 } })
    );

    const result = await generateDeckFromCaptureApi(BASE_PAYLOAD);

    expect(global.fetch).toHaveBeenCalledWith(
      "/api/lms-generation/deck-from-capture",
      expect.objectContaining({ method: "POST" })
    );
    expect(result).toEqual({ artifact: { id: "artifact-1", version: 1 } });
  });

  it("sends materialsText verbatim in the request body", async () => {
    vi.mocked(global.fetch).mockResolvedValue(jsonResponse({ artifact: { id: "artifact-1", version: 1 } }));
    await generateDeckFromCaptureApi(BASE_PAYLOAD);
    const [, init] = vi.mocked(global.fetch).mock.calls[0];
    const sentBody = JSON.parse((init as RequestInit).body as string);
    expect(sentBody.materialsText).toBe(BASE_PAYLOAD.materialsText);
  });

  // THE NON-JSON GUARD: a platform timeout or an auth redirect returns an
  // HTML page, not JSON - JSON.parse on that throws "Unexpected token '<'".
  // This must surface as a clean, named error instead.
  it("THE NON-JSON GUARD: a platform-timeout HTML response becomes a clean, named error, never a JSON.parse throw", async () => {
    vi.mocked(global.fetch).mockResolvedValue(htmlResponse(504));

    const result = await generateDeckFromCaptureApi(BASE_PAYLOAD);

    expect("error" in result).toBe(true);
    expect((result as { error: string }).error).toMatch(/timed out|HTTP 504/i);
  });

  it("an expired-session (401) non-JSON response gets its own distinct message, not the generic timeout one", async () => {
    vi.mocked(global.fetch).mockResolvedValue(htmlResponse(401));
    const result = await generateDeckFromCaptureApi(BASE_PAYLOAD);
    expect((result as { error: string }).error).toBe("Your session expired - sign in again.");
  });

  it("a rejected fetch (network failure) is caught and reported, never thrown", async () => {
    vi.mocked(global.fetch).mockRejectedValue(new Error("Failed to fetch"));
    const result = await generateDeckFromCaptureApi(BASE_PAYLOAD);
    expect(result).toEqual({ error: "Failed to fetch" });
  });

  it("propagates a JSON error body from the route unchanged", async () => {
    vi.mocked(global.fetch).mockResolvedValue(jsonResponse({ error: "Pick a template before generating a deck." }));
    const result = await generateDeckFromCaptureApi(BASE_PAYLOAD);
    expect(result).toEqual({ error: "Pick a template before generating a deck." });
  });
});
