import { describe, it, expect, vi, beforeEach } from "vitest";

// DEFECT 1 (see the "no upload cap" audit): generateLessonPlanAction and
// generateAssignmentAction accept base64 files with no size cap, even though
// the base64 has to cross the wire in the Server Action's JSON body to reach
// the function at all - it is exactly as subject to Vercel's ~4.5MB
// platform-layer request body cap as any other upload path in this repo.
//
// Only callLlm needs mocking to exercise this for real (no auth, no DB) -
// same pattern as llm-content.test.ts. Every fixture file below uses
// mimeType "application/pdf", which llm-files.ts's isGeminiInlineSupported
// inlines directly without touching the extraction path, so filesToLlmParts
// runs unmocked and no office-extract/node dependency is pulled in.
vi.mock("@/lib/llm", async () => {
  const actual = await vi.importActual<typeof import("@/lib/llm")>("@/lib/llm");
  return {
    ...actual,
    callLlm: vi.fn(),
  };
});

import { callLlm } from "@/lib/llm";
import { generateLessonPlanAction, generateAssignmentAction } from "./llm-content";
import { UPLOAD_WIRE_BUDGET_BYTES } from "@/lib/upload-budget";

function pdfFile(name: string, base64: string) {
  return { name, base64, mimeType: "application/pdf" };
}

const VALID_LESSON_JSON = JSON.stringify({
  presentationTitle: "Lesson",
  slides: [{ title: "Intro", bullets: ["a"] }],
});

const VALID_ASSIGNMENT_JSON = JSON.stringify({
  title: "Assignment",
  overview: "Overview",
  steps: [{ stepTitle: "Step 1", description: "Do the thing" }],
  tools: ["Tool"],
  deliverables: ["Deliverable"],
});

describe("generateLessonPlanAction - upload budget (DEFECT 1)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(callLlm).mockResolvedValue({
      ok: true,
      status: 200,
      body: "",
      text: VALID_LESSON_JSON,
    } as never);
  });

  it("refuses a single context file over budget, before any LLM call", async () => {
    const oversized = "A".repeat(UPLOAD_WIRE_BUDGET_BYTES + 1);

    const result = await generateLessonPlanAction(
      "Objectives",
      "Context",
      [pdfFile("big.pdf", oversized)],
      undefined,
      undefined,
      "gemini"
    );

    expect(result).toEqual({ error: expect.stringContaining("too large to upload in one request") });
    expect(callLlm).not.toHaveBeenCalled();
  });

  it("refuses several context files that are each individually fine but total over budget", async () => {
    // Each file alone is well under the 3.5MB budget; four of them together
    // are not. A per-file check would let this through - that is the bug
    // this test exists to catch.
    const each = "x".repeat(Math.ceil(UPLOAD_WIRE_BUDGET_BYTES / 3));
    const files = [
      pdfFile("a.pdf", each),
      pdfFile("b.pdf", each),
      pdfFile("c.pdf", each),
      pdfFile("d.pdf", each),
    ];

    const result = await generateLessonPlanAction("Objectives", "Context", files, undefined, undefined, "gemini");

    expect("error" in (result as { error?: string })).toBe(true);
    expect(callLlm).not.toHaveBeenCalled();
  });

  it("refuses when context files plus the homework file push the TOTAL over budget, even though each side alone is fine", async () => {
    // Reproduces the exact shape DEFECT 1 describes: "multiple context files
    // plus one homework file". Each side is individually under budget.
    const contextFile = "x".repeat(Math.ceil(UPLOAD_WIRE_BUDGET_BYTES * 0.6));
    const homeworkFile = "y".repeat(Math.ceil(UPLOAD_WIRE_BUDGET_BYTES * 0.6));

    const result = await generateLessonPlanAction(
      "Objectives",
      "Context",
      [pdfFile("context.pdf", contextFile)],
      undefined,
      undefined,
      "gemini",
      { files: [pdfFile("homework.pdf", homeworkFile)] }
    );

    expect("error" in (result as { error?: string })).toBe(true);
    expect(callLlm).not.toHaveBeenCalled();
  });

  it("proceeds to call the LLM for an under-budget request with both context and homework files", async () => {
    const result = await generateLessonPlanAction(
      "Objectives",
      "Context",
      [pdfFile("small.pdf", "AAAA")],
      undefined,
      undefined,
      "gemini",
      { files: [pdfFile("hw.pdf", "BBBB")] }
    );

    expect("error" in (result as { error?: string })).toBe(false);
    expect(callLlm).toHaveBeenCalledTimes(1);
  });
});

describe("generateAssignmentAction - upload budget (DEFECT 1)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(callLlm).mockResolvedValue({
      ok: true,
      status: 200,
      body: "",
      text: VALID_ASSIGNMENT_JSON,
    } as never);
  });

  it("refuses a single context file over budget, before any LLM call", async () => {
    const oversized = "A".repeat(UPLOAD_WIRE_BUDGET_BYTES + 1);

    const result = await generateAssignmentAction("Objectives", "Context", [pdfFile("big.pdf", oversized)], "gemini");

    expect("error" in (result as { error?: string })).toBe(true);
    expect(callLlm).not.toHaveBeenCalled();
  });

  it("refuses several context files that are each individually fine but total over budget", async () => {
    const each = "x".repeat(Math.ceil(UPLOAD_WIRE_BUDGET_BYTES / 3));
    const files = [
      pdfFile("a.pdf", each),
      pdfFile("b.pdf", each),
      pdfFile("c.pdf", each),
      pdfFile("d.pdf", each),
    ];

    const result = await generateAssignmentAction("Objectives", "Context", files, "gemini");

    expect("error" in (result as { error?: string })).toBe(true);
    expect(callLlm).not.toHaveBeenCalled();
  });

  it("proceeds to call the LLM for an under-budget request", async () => {
    const result = await generateAssignmentAction("Objectives", "Context", [pdfFile("small.pdf", "AAAA")], "gemini");

    expect("error" in (result as { error?: string })).toBe(false);
    expect(callLlm).toHaveBeenCalledTimes(1);
  });
});
