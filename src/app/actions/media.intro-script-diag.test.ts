import { describe, it, expect, vi, beforeEach } from "vitest";

// L2 (step-10c review of the intro-video-script bug fix): every existing
// test that touches generateModuleIntroScriptAction (media.ts) vi.mock's the
// WHOLE function - see lms-generation.test.ts's own
// `vi.mock("./media", () => ({ generateModuleIntroScriptAction: vi.fn() }))`.
// That means the real `diag` object literal this action builds on its
// failure path - including
// `failureBodyRedacted: !r.ok ? redactSensitiveText(r.body) : undefined`,
// the exact line L1 was about - has NO executable coverage proving it is
// ever actually reached. redactSensitiveText itself is well tested in
// isolation (generation-diag.test.ts); this file instead exercises the REAL
// generateModuleIntroScriptAction end to end, mocking only its two
// boundaries (the LLM call and the auth/Supabase call), matching the
// pattern media.script-length.test.ts already established for
// generateLectureScriptAction in this same file.
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
import { getWritingStyleBlock } from "./shared";
import { callLlm } from "@/lib/llm";
import { generateModuleIntroScriptAction } from "./media";

const OWNER = { id: "owner-1", email: "owner@example.com" };
const COURSE_NAME = "Intro to CS";
const MODULE_LABEL = "Week 2";
const MATERIALS_TEXT = "Lecture notes on recursion.";

// A realistic upstream Gemini failure body: describeLlmFailure's own
// convention embeds up to 200 raw characters of exactly this shape (see
// src/lib/llm.ts), and Gemini sends its API key as a URL query parameter
// (generation-diag.ts's own header comment) - so an upstream validation
// error echoing the request it rejected is a real credential-shaped string,
// not a contrived one.
const CREDENTIAL_SHAPED_BODY =
  "Bad Request: the request to https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=AIzaSyREALLOOKINGSECRET123 could not be processed";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireOwner).mockResolvedValue(OWNER as never);
  vi.mocked(getWritingStyleBlock).mockResolvedValue("" as never);
});

describe("generateModuleIntroScriptAction - diag reachability and redaction (L1/L2)", () => {
  it("REACHES the real diag object literal on a failing LLM call and redacts the credential-shaped upstream body", async () => {
    vi.mocked(callLlm).mockResolvedValue({
      ok: false,
      status: 400,
      body: CREDENTIAL_SHAPED_BODY,
    } as never);

    const result = await generateModuleIntroScriptAction(COURSE_NAME, MODULE_LABEL, MATERIALS_TEXT, 2);

    expect(result).toHaveProperty("error");
    expect(result.diag.attempted).toBe(true);
    expect(result.diag.ok).toBe(false);
    // THE ASSERTION THAT MATTERS: if failureBodyRedacted were ever built from
    // the raw body instead of redactSensitiveText(r.body) - the exact
    // regression L1 found one field over from this one - this fails.
    expect(result.diag.failureBodyRedacted).toBeDefined();
    expect(result.diag.failureBodyRedacted).not.toContain("AIzaSyREALLOOKINGSECRET123");
    expect(result.diag.failureBodyRedacted).not.toContain("https://");
    expect(result.diag.failureBodyRedacted).not.toMatch(/key=/i);
    expect(result.diag.failureBodyRedacted).toContain("[url redacted]");
  });

  it("leaves failureBodyRedacted absent (not merely empty) on a successful call", async () => {
    vi.mocked(callLlm).mockResolvedValue({ ok: true, status: 200, text: "A short script." } as never);

    const result = await generateModuleIntroScriptAction(COURSE_NAME, MODULE_LABEL, MATERIALS_TEXT, 2);

    expect(result).toHaveProperty("script");
    expect(result.diag.ok).toBe(true);
    expect(result.diag.failureBodyRedacted).toBeUndefined();
  });
});
