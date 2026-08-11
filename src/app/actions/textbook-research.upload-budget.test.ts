import { describe, it, expect, vi, beforeEach } from "vitest";

// DEFECT 2 (see the "no upload cap" audit): extractTextbookFromImageAction
// takes textbook-photo base64 from the Courses hub Textbook cell with no
// size cap. Its near-twin, extractTextbookInfoAction (src/app/actions/media.ts,
// the same feature reached from the Add Course form), gets the identical
// treatment via the same @/lib/upload-budget helper so the two size rules
// cannot drift apart.
//
// requireOwner and callLlm are mocked (auth + network); filesToLlmParts runs
// unmocked using image/png fixtures, which llm-files.ts's
// isGeminiInlineSupported inlines directly without touching the extraction
// path.
vi.mock("@/lib/supabase/auth", () => ({
  requireOwner: vi.fn().mockResolvedValue({ id: "owner-1", email: "owner@example.com" }),
}));

vi.mock("@/lib/llm", async () => {
  const actual = await vi.importActual<typeof import("@/lib/llm")>("@/lib/llm");
  return {
    ...actual,
    callLlm: vi.fn(),
  };
});

import { callLlm } from "@/lib/llm";
import { requireOwner } from "@/lib/supabase/auth";
import { extractTextbookFromImageAction } from "./textbook-research";
import { UPLOAD_WIRE_BUDGET_BYTES } from "@/lib/upload-budget";

function imageFile(base64: string) {
  return { name: "photo.png", base64, mimeType: "image/png" };
}

const VALID_TEXTBOOK_JSON = JSON.stringify({
  title: "Intro to Testing",
  authors: "A. Author",
  edition: "3rd",
  isbn: "123",
  publisher: "Pub Co",
  year: "2020",
  url: "https://example.test/book",
});

describe("extractTextbookFromImageAction - upload budget (DEFECT 2)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireOwner).mockResolvedValue({ id: "owner-1", email: "owner@example.com" });
    vi.mocked(callLlm).mockResolvedValue({ ok: true, text: VALID_TEXTBOOK_JSON } as never);
  });

  it("refuses a single image over budget, before any LLM call", async () => {
    const oversized = "A".repeat(UPLOAD_WIRE_BUDGET_BYTES + 1);

    const result = await extractTextbookFromImageAction([imageFile(oversized)], "gemini");

    expect(result).toEqual({ error: expect.stringContaining("too large to upload in one request") });
    expect(callLlm).not.toHaveBeenCalled();
  });

  it("refuses several images that are each individually fine but total over budget", async () => {
    // Each image alone is well under the 3.5MB budget; four of them together
    // are not. A per-file check would let this through - that is the bug
    // this test exists to catch.
    const each = "x".repeat(Math.ceil(UPLOAD_WIRE_BUDGET_BYTES / 3));
    const files = [imageFile(each), imageFile(each), imageFile(each), imageFile(each)];

    const result = await extractTextbookFromImageAction(files, "gemini");

    expect("error" in (result as { error?: string })).toBe(true);
    expect(callLlm).not.toHaveBeenCalled();
  });

  it("proceeds to call the LLM for an under-budget request", async () => {
    const result = await extractTextbookFromImageAction([imageFile("AAAA"), imageFile("BBBB")], "gemini");

    expect("error" in (result as { error?: string })).toBe(false);
    expect(callLlm).toHaveBeenCalledTimes(1);
  });
});
