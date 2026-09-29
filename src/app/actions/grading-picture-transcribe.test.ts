import { describe, it, expect, vi, beforeEach } from "vitest";

// N15-2 (docs/n15-waves-1-2-test-notes.md R2.1-R2.7). requireUser (auth) and
// callLlm (network) are mocked - describeLlmFailure/describeEmptyLlmText stay
// REAL via vi.importActual (announcement-image.test.ts's pattern), so a
// wiring bug in the error paths cannot hide behind a fake formatter. Network
// is blocked under vitest (vitest.setup.ts) - callLlm is mocked, never fetch.
//
// detectImageMimeFromBase64, checkWireBudget and buildRubricPicturePrompt are
// NEVER mocked: every R2 assertion observes their REAL behaviour through the
// action's observable effects (what reaches the mocked callLlm, and what the
// action returns), so a sabotage that deletes a gate cannot hide behind an
// inert mock.

vi.mock("@/lib/supabase/auth", () => ({
  requireUser: vi.fn().mockResolvedValue({ id: "u1", email: "u@example.com" }),
}));

vi.mock("@/lib/llm", async () => {
  const actual = await vi.importActual<typeof import("@/lib/llm")>("@/lib/llm");
  return {
    ...actual,
    callLlm: vi.fn(),
  };
});

import { requireUser } from "@/lib/supabase/auth";
import { callLlm, type LlmContent } from "@/lib/llm";
import { detectImageMimeFromBase64 } from "@/app/components/snapshot-grading/snapshot-parse";
import { buildRubricPicturePrompt } from "@/lib/grade/rubric-picture-prompt";
import {
  UPLOAD_WIRE_BUDGET_BYTES,
  maxFileBytesForWireBudget,
} from "@/lib/upload-budget";
import { transcribeGradingPictureAction } from "./grading-picture-transcribe";

// Frozen oracle fixtures, built from raw bytes (never a hand-typed base64
// literal) so the magic number is provably correct - test-notes "Frozen
// oracle fixtures" section, computed against the real constants.

// PNG: 8-byte PNG signature + pad to 12 bytes. detectImageMimeFromBase64 -> "image/png".
const PNG_BASE64 = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
]).toString("base64");

// JPEG: FF D8 FF SOI/marker + JFIF bytes to 12 bytes. -> "image/jpeg".
const JPEG_BASE64 = Buffer.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
]).toString("base64");

// Strict base64, decodes to 12 bytes, NO image magic. -> null.
const BOGUS_BASE64 = Buffer.from([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]).toString("base64");

// Oversized but VALID png: file bytes one over the boundary so ONLY the
// budget gate can refuse it (it passes the mime gate).
const OVERSIZED_FILE_BYTES = maxFileBytesForWireBudget(UPLOAD_WIRE_BUDGET_BYTES) + 1;
const oversizedBuf = new Uint8Array(OVERSIZED_FILE_BYTES);
oversizedBuf.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
const OVERSIZED_PNG_BASE64 = Buffer.from(oversizedBuf).toString("base64");

function findInlineDataPart(contents: LlmContent[]) {
  const parts = contents[0].parts;
  const inlineParts = parts.filter(
    (p): p is Extract<typeof p, { inlineData: unknown }> => "inlineData" in p
  );
  expect(inlineParts).toHaveLength(1);
  return inlineParts[0];
}

function findTextPart(contents: LlmContent[]) {
  const parts = contents[0].parts;
  const textPart = parts.find((p): p is Extract<typeof p, { text: string }> => "text" in p);
  return textPart;
}

describe("construction-sanity: the frozen fixtures are what they claim to be", () => {
  it("PNG_BASE64 sniffs as image/png, JPEG_BASE64 as image/jpeg, BOGUS_BASE64 as null", () => {
    expect(detectImageMimeFromBase64(PNG_BASE64)).toBe("image/png");
    expect(detectImageMimeFromBase64(JPEG_BASE64)).toBe("image/jpeg");
    expect(detectImageMimeFromBase64(BOGUS_BASE64)).toBeNull();
  });

  it("OVERSIZED_PNG_BASE64 is over the wire budget AND still sniffs as a valid PNG (so only the budget gate can refuse it)", () => {
    expect(OVERSIZED_PNG_BASE64.length).toBeGreaterThan(UPLOAD_WIRE_BUDGET_BYTES);
    expect(detectImageMimeFromBase64(OVERSIZED_PNG_BASE64)).toBe("image/png");
  });
});

describe("transcribeGradingPictureAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireUser).mockResolvedValue({ id: "u1", email: "u@example.com" } as never);
    vi.mocked(callLlm).mockResolvedValue({ ok: true, text: "  Transcribed rubric text  " });
  });

  // R2.1: the N15-1 prompt for the correct `kind` is sent (parameter is live end to end).
  it("R2.1: sends the kind-correct N15-1 prompt for 'rubric'", async () => {
    await transcribeGradingPictureAction(PNG_BASE64, "rubric", "gemini");

    const [req] = vi.mocked(callLlm).mock.calls[0];
    const textPart = findTextPart(req.contents);
    expect(textPart?.text).toBe(buildRubricPicturePrompt("rubric"));
  });

  it("R2.1: sends the kind-correct N15-1 prompt for 'assignment description'", async () => {
    await transcribeGradingPictureAction(PNG_BASE64, "assignment description", "gemini");

    const [req] = vi.mocked(callLlm).mock.calls[0];
    const textPart = findTextPart(req.contents);
    expect(textPart?.text).toBe(buildRubricPicturePrompt("assignment description"));
  });

  // R2.2: the inlineData mime is DERIVED from the bytes, not hardcoded (TRAP 3A).
  it("R2.2: a PNG capture rides the wire as image/png (frozen literal), with the same data", async () => {
    await transcribeGradingPictureAction(PNG_BASE64, "rubric", "gemini");

    const [req] = vi.mocked(callLlm).mock.calls[0];
    const part = findInlineDataPart(req.contents);
    expect(part.inlineData.mimeType).toBe("image/png");
    expect(part.inlineData.data).toBe(PNG_BASE64);
  });

  it("R2.2: a JPEG capture rides the wire as image/jpeg (frozen literal), with the same data", async () => {
    await transcribeGradingPictureAction(JPEG_BASE64, "rubric", "gemini");

    const [req] = vi.mocked(callLlm).mock.calls[0];
    const part = findInlineDataPart(req.contents);
    expect(part.inlineData.mimeType).toBe("image/jpeg");
    expect(part.inlineData.data).toBe(JPEG_BASE64);
  });

  // R2.3: the model text is returned, trimmed, as { text }.
  it("R2.3: returns the model's text trimmed", async () => {
    vi.mocked(callLlm).mockResolvedValue({ ok: true, text: "  Transcribed rubric text  " });

    const result = await transcribeGradingPictureAction(PNG_BASE64, "rubric", "gemini");

    expect(result).toEqual({ text: "Transcribed rubric text" });
  });

  // R2.4: an over-budget payload is REFUSED before any model call (checkWireBudget).
  it("R2.4: refuses an over-budget (but validly-imaged) payload before calling the model", async () => {
    const result = await transcribeGradingPictureAction(OVERSIZED_PNG_BASE64, "rubric", "gemini");

    expect(callLlm).not.toHaveBeenCalled();
    expect(result).toHaveProperty("error");
    expect((result as { error: string }).error).toContain("too large to upload");
  });

  // R2.5: requireUser gates the call (auth).
  it("R2.5: calls requireUser exactly once on the happy path", async () => {
    await transcribeGradingPictureAction(PNG_BASE64, "rubric", "gemini");

    expect(requireUser).toHaveBeenCalledTimes(1);
  });

  it("R2.5: an unauthenticated caller never reaches the model", async () => {
    vi.mocked(requireUser).mockRejectedValueOnce(new Error("not signed in"));

    await transcribeGradingPictureAction(PNG_BASE64, "rubric", "gemini").catch(() => undefined);

    expect(callLlm).not.toHaveBeenCalled();
  });

  // R2.6: a non-image payload is refused before any model call (input validation).
  it("R2.6: refuses a strict-base64 payload with no image magic before calling the model", async () => {
    const result = await transcribeGradingPictureAction(BOGUS_BASE64, "rubric", "gemini");

    expect(callLlm).not.toHaveBeenCalled();
    expect(result).toHaveProperty("error");
  });

  // R2.7: the two error paths return { error } through the REAL formatters.
  it("R2.7: an HTTP failure is formatted via the real describeLlmFailure", async () => {
    vi.mocked(callLlm).mockResolvedValue({ ok: false, status: 429, body: "Quota exceeded" });

    const result = await transcribeGradingPictureAction(PNG_BASE64, "rubric", "gemini");

    expect(result).toHaveProperty("error");
    const { error } = result as { error: string };
    expect(error).toContain("HTTP 429");
    expect(error).toContain("Quota exceeded");
  });

  it("R2.7: an empty (whitespace-only) model response is formatted via the real describeEmptyLlmText", async () => {
    vi.mocked(callLlm).mockResolvedValue({ ok: true, text: "   " });

    const result = await transcribeGradingPictureAction(PNG_BASE64, "rubric", "gemini");

    expect(result).toHaveProperty("error");
    const { error } = result as { error: string };
    expect(error).toContain("empty response");
  });
});
