import { describe, it, expect, vi, beforeEach } from "vitest";

// Mirrors discussion-replies-extract.test.ts's own mock shape: requireOwner
// stubbed, "@/lib/llm" partially mocked (callLlm controllable, everything
// else - describeLlmFailure/describeEmptyLlmText - the REAL implementation
// via importActual, since the failure-message tests below assert on their
// actual formatting). Per this repo's "no cross-test-file imports" rule,
// nothing is imported from a sibling *.test.ts file.
//
// FIXTURE SHAPE: every `ok: true` fixture below is exactly LlmResult's
// success branch (src/lib/llm.ts) - `{ ok: true; text: string; sources?:
// Source[]; finishReason?: string }` - no `status`/`body` fields, which
// belong only to the `ok: false` branch. Earlier fixtures carried
// `status: 200, body: ""` on success results too, a shape LlmResult's
// success branch does not have, hidden behind an `as never` cast that
// suppressed the type error instead of surfacing it. None of the fixtures
// below need that cast.

vi.mock("@/lib/supabase/auth", () => ({
  requireOwner: vi.fn(),
}));

vi.mock("@/lib/llm", async () => {
  const actual = await vi.importActual<typeof import("@/lib/llm")>("@/lib/llm");
  return {
    ...actual,
    callLlm: vi.fn(),
  };
});

import { requireOwner } from "@/lib/supabase/auth";
import { callLlm } from "@/lib/llm";
import { UPLOAD_WIRE_BUDGET_BYTES } from "@/lib/upload-budget";
import { GRADING_EXTRACT_BATCH_SIZE, MAX_SUBMISSION_CHARS } from "@/app/components/grading-recording/grading-extraction-prompt";
import { extractGradingSubmissionsAction } from "./grading-submission-extract";

const OWNER = { id: "owner-1", email: "owner@example.com" };

function base64OfWireBytes(wireBytes: number): string {
  return "A".repeat(wireBytes);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireOwner).mockResolvedValue(OWNER as never);
});

describe("extractGradingSubmissionsAction - ownership, frame-cap, wire-budget refusals happen BEFORE any model call", () => {
  it("requires ownership - a rejected requireOwner is caught and returned as { error }, never thrown", async () => {
    vi.mocked(requireOwner).mockRejectedValueOnce(new Error("Not authorized. Sign in with an approved account."));

    await expect(extractGradingSubmissionsAction([{ base64: "abc" }], "gemini")).resolves.toEqual({
      error: "Not authorized. Sign in with an approved account.",
    });
    expect(callLlm).not.toHaveBeenCalled();
  });

  it("refuses zero frames without calling the model", async () => {
    const result = await extractGradingSubmissionsAction([], "gemini");
    expect(result).toEqual({ error: "No frames were captured from the screen." });
    expect(callLlm).not.toHaveBeenCalled();
  });

  it("refuses a batch over GRADING_EXTRACT_BATCH_SIZE without calling the model", async () => {
    const frames = Array.from({ length: GRADING_EXTRACT_BATCH_SIZE + 1 }, () => ({ base64: "x" }));
    const result = await extractGradingSubmissionsAction(frames, "gemini");
    expect(result).toEqual({ error: "Too many frames in one batch." });
    expect(callLlm).not.toHaveBeenCalled();
  });

  it("accepts exactly GRADING_EXTRACT_BATCH_SIZE frames (the boundary is inclusive)", async () => {
    vi.mocked(callLlm).mockResolvedValueOnce({
      ok: true,
      text: JSON.stringify([{ studentName: "Maria Alvarez", submissionText: "A real submission with several words in it" }]),
    });
    const frames = Array.from({ length: GRADING_EXTRACT_BATCH_SIZE }, () => ({ base64: "x" }));
    const result = await extractGradingSubmissionsAction(frames, "gemini");
    expect(callLlm).toHaveBeenCalledTimes(1);
    expect("submissions" in result).toBe(true);
  });

  it("refuses an over-wire-budget batch BEFORE calling the model", async () => {
    const frames = [{ base64: base64OfWireBytes(UPLOAD_WIRE_BUDGET_BYTES + 1_000) }];
    const result = await extractGradingSubmissionsAction(frames, "gemini");
    expect("error" in result).toBe(true);
    if ("error" in result) expect(result.error).toContain("too large to upload in one request");
    expect(callLlm).not.toHaveBeenCalled();
  });

  it("checks ownership before the frame-count/wire-budget checks (requireOwner is called first, unconditionally)", async () => {
    vi.mocked(requireOwner).mockRejectedValueOnce(new Error("nope"));
    await extractGradingSubmissionsAction([], "gemini");
    expect(requireOwner).toHaveBeenCalledTimes(1);
    expect(callLlm).not.toHaveBeenCalled();
  });
});

describe("extractGradingSubmissionsAction - LLM call shape", () => {
  it("uses maxOutputTokens 8192 and temperature 0.1, mirroring extractDiscussionPostsAction's own AC4b-i/ii", async () => {
    vi.mocked(callLlm).mockResolvedValueOnce({
      ok: true,
      text: JSON.stringify([{ noSubmissionsVisible: true, reason: "empty page" }]),
    });
    await extractGradingSubmissionsAction([{ base64: "x" }], "gemini");
    const callArgs = vi.mocked(callLlm).mock.calls[0][0];
    expect(callArgs.generationConfig?.maxOutputTokens).toBe(8192);
    expect(callArgs.generationConfig?.temperature).toBe(0.1);
  });
});

describe("extractGradingSubmissionsAction - hard failures (unchanged from the discussion action's own shape)", () => {
  it("preserves the REAL reason on a failed call - a 429 and a 400 must read differently", async () => {
    vi.mocked(callLlm).mockResolvedValueOnce({ ok: false, status: 429, body: "Rate limit exceeded" });
    const result429 = await extractGradingSubmissionsAction([{ base64: "x" }], "gemini");

    vi.mocked(callLlm).mockResolvedValueOnce({ ok: false, status: 400, body: "Bad request: invalid image" });
    const result400 = await extractGradingSubmissionsAction([{ base64: "x" }], "gemini");

    expect("error" in result429 && "error" in result400).toBe(true);
    if ("error" in result429 && "error" in result400) {
      expect(result429.error).not.toBe(result400.error);
      expect(result429.error).toContain("429");
      expect(result400.error).toContain("400");
    }
  });

  it("returns a distinct error for a successful-but-empty response (fully blank model output)", async () => {
    vi.mocked(callLlm).mockResolvedValueOnce({ ok: true, text: "", finishReason: "MAX_TOKENS" });
    const result = await extractGradingSubmissionsAction([{ base64: "x" }], "gemini");
    expect("error" in result).toBe(true);
    if ("error" in result) {
      expect(result.error).toContain("empty response");
      expect(result.error).toContain("MAX_TOKENS");
    }
  });

  it("returns a distinct error when the response cannot be parsed at all", async () => {
    vi.mocked(callLlm).mockResolvedValueOnce({ ok: true, text: "not json and no brackets at all" });
    const result = await extractGradingSubmissionsAction([{ base64: "x" }], "gemini");
    expect(result).toEqual({ error: "Could not read any submissions from that part of the screen." });
  });
});

describe("R1a - the empty-vs-nothing distinction", () => {
  it("outcome 1 (CONFIRMED EMPTY): the model's marker element is SUCCESS with confirmedEmpty: true, not an error", async () => {
    vi.mocked(callLlm).mockResolvedValueOnce({
      ok: true,
      text: JSON.stringify([{ noSubmissionsVisible: true, reason: "a gradebook list, no submission open" }]),
    });
    const result = await extractGradingSubmissionsAction([{ base64: "x" }], "gemini");
    expect(result).toEqual({ submissions: [], confirmedEmpty: true, skippedUnnamed: 0 });
  });

  it("outcome 3 (NOTHING, NO CONFIRMATION): a bare `[]` with no marker is a hard { error }, never treated as success", async () => {
    vi.mocked(callLlm).mockResolvedValueOnce({ ok: true, text: "[]" });
    const result = await extractGradingSubmissionsAction([{ base64: "x" }], "gemini");
    expect("error" in result).toBe(true);
    expect("submissions" in result).toBe(false);
    if ("error" in result) {
      expect(result.error).toContain("did not confirm");
    }
  });

  it("a batch with real submissions is success, confirmedEmpty is false, and any stray marker element in the same array is ignored as a submission", async () => {
    vi.mocked(callLlm).mockResolvedValueOnce({
      ok: true,
      text: JSON.stringify([
        { studentName: "Maria Alvarez", submissionText: "A real submission with several words in it" },
        { noSubmissionsVisible: true, reason: "should be ignored - a real submission was also found" },
      ]),
    });
    const result = await extractGradingSubmissionsAction([{ base64: "x" }], "gemini");
    expect(result).toEqual({
      submissions: [{ name: "Maria Alvarez", text: "A real submission with several words in it" }],
      confirmedEmpty: false,
      skippedUnnamed: 0,
    });
  });

  it("outcome 2 (FOUND SOMETHING, NAME UNREADABLE): a real submission with no name is skipped, counted in skippedUnnamed, and this is SUCCESS not the outcome-3 error", async () => {
    vi.mocked(callLlm).mockResolvedValueOnce({
      ok: true,
      text: JSON.stringify([{ submissionText: "Some real submission text with no name attached to it" }]),
    });
    const result = await extractGradingSubmissionsAction([{ base64: "x" }], "gemini");
    expect(result).toEqual({ submissions: [], confirmedEmpty: false, skippedUnnamed: 1 });
  });

  it("skippedUnnamed and a real submission can coexist in the same batch", async () => {
    vi.mocked(callLlm).mockResolvedValueOnce({
      ok: true,
      text: JSON.stringify([
        { studentName: "Maria Alvarez", submissionText: "A named, real submission with words" },
        { submissionText: "An unnamed submission that must be skipped per R3" },
      ]),
    });
    const result = await extractGradingSubmissionsAction([{ base64: "x" }], "gemini");
    expect(result).toEqual({
      submissions: [{ name: "Maria Alvarez", text: "A named, real submission with words" }],
      confirmedEmpty: false,
      skippedUnnamed: 1,
    });
  });
});

describe("R3 - the name rule, at the JSON-coercion boundary", () => {
  it("drops an entry with an empty-string studentName", async () => {
    vi.mocked(callLlm).mockResolvedValueOnce({
      ok: true,
      text: JSON.stringify([{ studentName: "", submissionText: "Some submission text with several words" }]),
    });
    const result = await extractGradingSubmissionsAction([{ base64: "x" }], "gemini");
    expect(result).toEqual({ submissions: [], confirmedEmpty: false, skippedUnnamed: 1 });
  });

  it("drops an entry with a whitespace-only studentName", async () => {
    vi.mocked(callLlm).mockResolvedValueOnce({
      ok: true,
      text: JSON.stringify([{ studentName: "   ", submissionText: "Some submission text with several words" }]),
    });
    const result = await extractGradingSubmissionsAction([{ base64: "x" }], "gemini");
    expect(result).toEqual({ submissions: [], confirmedEmpty: false, skippedUnnamed: 1 });
  });

  it("never invents a name - an unnamed entry never appears in `submissions` under any key", async () => {
    vi.mocked(callLlm).mockResolvedValueOnce({
      ok: true,
      text: JSON.stringify([{ submissionText: "Unnamed submission text here" }]),
    });
    const result = await extractGradingSubmissionsAction([{ base64: "x" }], "gemini");
    // Narrow BEFORE asserting on the success branch - an unguarded `if
    // ("submissions" in result)` here used to let an R3-skip-rule
    // regression (the model's unnamed entry leaking into `submissions`)
    // silently execute zero assertions if the action instead returned an
    // `{ error }` for some unrelated reason: the test would still report
    // green. Asserting the branch first turns that into a hard failure.
    expect("submissions" in result).toBe(true);
    if ("submissions" in result) {
      expect(result.submissions).toHaveLength(0);
      expect(JSON.stringify(result)).not.toContain("Unnamed submission text here");
    }
  });

  it("drops an entry with no submissionText at all, without counting it toward skippedUnnamed (nothing to skip - it never claimed a submission)", async () => {
    vi.mocked(callLlm).mockResolvedValueOnce({
      ok: true,
      text: JSON.stringify([{ studentName: "Maria Alvarez" }]),
    });
    const result = await extractGradingSubmissionsAction([{ base64: "x" }], "gemini");
    // No submissionText and no confirmation marker: this is outcome 3, a
    // hard error - an entry naming a student but carrying no text is not a
    // usable submission and not a confirmation either.
    expect("error" in result).toBe(true);
  });
});

describe("field coercion", () => {
  it("trims studentName and submissionText", async () => {
    vi.mocked(callLlm).mockResolvedValueOnce({
      ok: true,
      text: JSON.stringify([{ studentName: "  Maria Alvarez  ", submissionText: "  Some text with several words  " }]),
    });
    const result = await extractGradingSubmissionsAction([{ base64: "x" }], "gemini");
    expect("submissions" in result).toBe(true);
    if ("submissions" in result) {
      expect(result.submissions[0]).toEqual({ name: "Maria Alvarez", text: "Some text with several words" });
    }
  });

  it("truncates an over-long submission to MAX_SUBMISSION_CHARS with a visible marker", async () => {
    const longText = "x".repeat(MAX_SUBMISSION_CHARS + 1000);
    vi.mocked(callLlm).mockResolvedValueOnce({
      ok: true,
      text: JSON.stringify([{ studentName: "Maria Alvarez", submissionText: longText }]),
    });
    const result = await extractGradingSubmissionsAction([{ base64: "x" }], "gemini");
    expect("submissions" in result).toBe(true);
    if ("submissions" in result) {
      expect(result.submissions).toHaveLength(1);
      expect(result.submissions[0].text.length).toBeLessThanOrEqual(MAX_SUBMISSION_CHARS + 3);
      expect(result.submissions[0].text.endsWith("...")).toBe(true);
    }
  });

  it("does not append the truncation marker to a submission under the limit", async () => {
    vi.mocked(callLlm).mockResolvedValueOnce({
      ok: true,
      text: JSON.stringify([{ studentName: "Maria Alvarez", submissionText: "A short submission." }]),
    });
    const result = await extractGradingSubmissionsAction([{ base64: "x" }], "gemini");
    // See the "never invents a name" test above for why this assertion
    // has to come BEFORE the narrowing `if` - an unguarded branch here
    // would let a regression that turned this success into an error pass
    // silently, executing zero assertions.
    expect("submissions" in result).toBe(true);
    if ("submissions" in result) {
      expect(result.submissions[0].text).toBe("A short submission.");
    }
  });

  it("ignores a non-object element in the array rather than throwing", async () => {
    vi.mocked(callLlm).mockResolvedValueOnce({
      ok: true,
      text: JSON.stringify([null, "a stray string", { studentName: "Maria Alvarez", submissionText: "Real submission text here" }]),
    });
    const result = await extractGradingSubmissionsAction([{ base64: "x" }], "gemini");
    expect(result).toEqual({
      submissions: [{ name: "Maria Alvarez", text: "Real submission text here" }],
      confirmedEmpty: false,
      skippedUnnamed: 0,
    });
  });
});
