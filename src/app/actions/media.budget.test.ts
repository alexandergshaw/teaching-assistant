import { describe, it, expect, vi, beforeEach } from "vitest";

// Coverage for the upload-budget guards added to src/app/actions/media.ts:
//
//   extractPptxSlidesAction  - reached, with NO size protection before this
//     fix, from six production call sites (Slide Studio deck mode, file
//     preview, and four workflow steps). None of them capped the request,
//     and Vercel rejects an oversized body at the PLATFORM layer before this
//     function ever runs - so the guard has to live here to protect every
//     caller at once.
//   extractDocxTextAction   - same treatment, same reasoning.
//   extractTextbookInfoAction - budgets the TOTAL wire size across every
//     uploaded image (sumBase64WireBytes), not per-image, because several
//     individually-fine images can add up to an over-budget request.
//   describeScreenRecordingAction / generateVideoNarrationAction - found
//     during the audit: both take an array of base64 keyframes bounded only
//     by a frame COUNT cap (30), never a byte budget, so 30 large frames
//     could still exceed the request body.
//
// Every guard must fire BEFORE the expensive work (office-paragraph parsing
// or the LLM call), so each test mocks that downstream call and asserts it
// was never reached for an over-budget payload.

vi.mock("@/lib/supabase/auth", () => ({
  requireOwner: vi.fn(),
}));

vi.mock("@/lib/office-edit", () => ({
  parseOfficeParagraphs: vi.fn(),
}));

vi.mock("./shared", () => ({
  extractTextbookInfoFromImages: vi.fn(),
  getWritingStyleBlock: vi.fn(),
  jsonObjectSlice: vi.fn(),
}));

vi.mock("@/lib/llm", () => ({
  callLlm: vi.fn(),
}));

import { requireOwner } from "@/lib/supabase/auth";
import { parseOfficeParagraphs } from "@/lib/office-edit";
import { extractTextbookInfoFromImages } from "./shared";
import { callLlm } from "@/lib/llm";
import { UPLOAD_WIRE_BUDGET_BYTES } from "@/lib/upload-budget";
import {
  extractPptxSlidesAction,
  extractDocxTextAction,
  extractTextbookInfoAction,
  describeScreenRecordingAction,
  generateVideoNarrationAction,
} from "./media";

const OWNER = { id: "owner-1", email: "owner@example.com" };

/** A base64 payload of exactly `wireBytes` characters. Every budget check
 * under test sums `base64.length` directly, so the string's length IS the
 * wire byte count - it never needs to decode to a real file, because the
 * guard runs before any decoding. */
function base64OfWireBytes(wireBytes: number): string {
  return "A".repeat(wireBytes);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireOwner).mockResolvedValue(OWNER as never);
});

describe("extractPptxSlidesAction - wire-size budget", () => {
  it("refuses an over-budget file BEFORE parsing", async () => {
    const result = await extractPptxSlidesAction(base64OfWireBytes(UPLOAD_WIRE_BUDGET_BYTES + 1_000));

    expect("error" in result).toBe(true);
    if ("error" in result) {
      expect(result.error).toContain("too large to upload in one request");
    }
    expect(parseOfficeParagraphs).not.toHaveBeenCalled();
  });

  it("proceeds to parsing for an under-budget file", async () => {
    vi.mocked(parseOfficeParagraphs).mockResolvedValue([
      { id: "1", slide: 1, text: "Title slide", runs: [], style: "" } as never,
    ]);

    const result = await extractPptxSlidesAction(base64OfWireBytes(1_000));

    expect(parseOfficeParagraphs).toHaveBeenCalledTimes(1);
    expect("error" in result).toBe(false);
    if (!("error" in result)) {
      expect(result.slides).toHaveLength(1);
    }
  });
});

describe("extractDocxTextAction - wire-size budget", () => {
  it("refuses an over-budget file BEFORE parsing", async () => {
    const result = await extractDocxTextAction(base64OfWireBytes(UPLOAD_WIRE_BUDGET_BYTES + 1_000));

    expect("error" in result).toBe(true);
    if ("error" in result) {
      expect(result.error).toContain("too large to upload in one request");
    }
    expect(parseOfficeParagraphs).not.toHaveBeenCalled();
  });

  it("proceeds to parsing for an under-budget file", async () => {
    vi.mocked(parseOfficeParagraphs).mockResolvedValue([
      { id: "1", text: "Some text", runs: [], style: "" } as never,
    ]);

    const result = await extractDocxTextAction(base64OfWireBytes(1_000));

    expect(parseOfficeParagraphs).toHaveBeenCalledTimes(1);
    expect("error" in result).toBe(false);
  });
});

describe("extractTextbookInfoAction - combined wire-size budget across images", () => {
  it("refuses a single image whose wire size is already over budget, BEFORE the model call", async () => {
    const images = [{ base64: base64OfWireBytes(UPLOAD_WIRE_BUDGET_BYTES + 1_000), mimeType: "image/png" }];

    const result = await extractTextbookInfoAction(images);

    expect("error" in result).toBe(true);
    if ("error" in result) {
      expect(result.error).toContain("too large to upload in one request");
    }
    expect(extractTextbookInfoFromImages).not.toHaveBeenCalled();
  });

  it("refuses several INDIVIDUALLY-fine images that together exceed the budget - the case a per-image check misses", async () => {
    const perImageWireBytes = Math.floor(UPLOAD_WIRE_BUDGET_BYTES / 3);
    const images = [
      { base64: base64OfWireBytes(perImageWireBytes), mimeType: "image/png" },
      { base64: base64OfWireBytes(perImageWireBytes), mimeType: "image/png" },
      { base64: base64OfWireBytes(perImageWireBytes), mimeType: "image/png" },
      { base64: base64OfWireBytes(perImageWireBytes), mimeType: "image/png" },
    ];
    // Sanity check on the fixture: no single image is anywhere near the
    // budget, but the four together are well over it.
    expect(perImageWireBytes).toBeLessThan(UPLOAD_WIRE_BUDGET_BYTES / 2);
    expect(perImageWireBytes * images.length).toBeGreaterThan(UPLOAD_WIRE_BUDGET_BYTES);

    const result = await extractTextbookInfoAction(images);

    expect("error" in result).toBe(true);
    if ("error" in result) {
      expect(result.error).toContain("too large to upload in one request");
    }
    expect(extractTextbookInfoFromImages).not.toHaveBeenCalled();
  });

  it("proceeds to the model call when the combined wire size is under budget", async () => {
    vi.mocked(extractTextbookInfoFromImages).mockResolvedValue("Extracted textbook text");
    const images = [
      { base64: base64OfWireBytes(1_000), mimeType: "image/png" },
      { base64: base64OfWireBytes(1_000), mimeType: "image/png" },
    ];

    const result = await extractTextbookInfoAction(images);

    expect(extractTextbookInfoFromImages).toHaveBeenCalledTimes(1);
    expect("error" in result).toBe(false);
    if (!("error" in result)) {
      expect(result.text).toBe("Extracted textbook text");
    }
  });
});

describe("describeScreenRecordingAction - combined wire-size budget across frames", () => {
  it("refuses frames whose combined wire size is over budget, BEFORE the model call", async () => {
    const perFrameWireBytes = Math.floor(UPLOAD_WIRE_BUDGET_BYTES / 3);
    const frames = [
      { timeSec: 0, base64: base64OfWireBytes(perFrameWireBytes) },
      { timeSec: 1, base64: base64OfWireBytes(perFrameWireBytes) },
      { timeSec: 2, base64: base64OfWireBytes(perFrameWireBytes) },
      { timeSec: 3, base64: base64OfWireBytes(perFrameWireBytes) },
    ];

    const result = await describeScreenRecordingAction(frames, 4, "");

    expect("error" in result).toBe(true);
    if ("error" in result) {
      expect(result.error).toContain("too large to upload in one request");
    }
    expect(callLlm).not.toHaveBeenCalled();
  });

  it("proceeds to the model call when the combined wire size is under budget", async () => {
    vi.mocked(callLlm).mockResolvedValue({
      ok: true,
      status: 200,
      text: '[{"start":0,"end":2,"text":"A caption."}]',
      body: "",
    } as never);
    const frames = [{ timeSec: 0, base64: base64OfWireBytes(1_000) }];

    const result = await describeScreenRecordingAction(frames, 2, "");

    expect(callLlm).toHaveBeenCalledTimes(1);
    expect("error" in result).toBe(false);
  });
});

describe("generateVideoNarrationAction - combined wire-size budget across frames", () => {
  it("refuses frames whose combined wire size is over budget, BEFORE the model call", async () => {
    const perFrameWireBytes = Math.floor(UPLOAD_WIRE_BUDGET_BYTES / 3);
    const frames = [
      { timeSec: 0, base64: base64OfWireBytes(perFrameWireBytes) },
      { timeSec: 1, base64: base64OfWireBytes(perFrameWireBytes) },
      { timeSec: 2, base64: base64OfWireBytes(perFrameWireBytes) },
      { timeSec: 3, base64: base64OfWireBytes(perFrameWireBytes) },
    ];

    const result = await generateVideoNarrationAction(frames, 4, "");

    expect("error" in result).toBe(true);
    if ("error" in result) {
      expect(result.error).toContain("too large to upload in one request");
    }
    expect(callLlm).not.toHaveBeenCalled();
  });

  it("proceeds to the model call when the combined wire size is under budget", async () => {
    vi.mocked(callLlm).mockResolvedValue({
      ok: true,
      status: 200,
      text: '[{"start":0,"end":2,"text":"Narration segment."}]',
      body: "",
    } as never);
    const frames = [{ timeSec: 0, base64: base64OfWireBytes(1_000) }];

    const result = await generateVideoNarrationAction(frames, 2, "");

    expect(callLlm).toHaveBeenCalledTimes(1);
    expect("error" in result).toBe(false);
  });
});
