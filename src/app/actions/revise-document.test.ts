import { describe, it, expect, vi, beforeEach } from "vitest";

// reviseDocumentAction calls callLlm() (network), which is mocked so the
// action's own logic - the input guards, the embedded fallback, the prompt it
// builds, and its handling of a failed or empty model response - runs for real
// without hitting the API.
vi.mock("@/lib/llm", async () => {
  const actual = await vi.importActual<typeof import("@/lib/llm")>("@/lib/llm");
  return { ...actual, callLlm: vi.fn() };
});

import { callLlm } from "@/lib/llm";
import { reviseDocumentAction } from "./llm-content";

const DOC = "# Syllabus\n\nWeek 1: Intro.";

function mockLlm(text: string) {
  vi.mocked(callLlm).mockResolvedValue({ ok: true, text, status: 200, body: text } as never);
}

describe("reviseDocumentAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects an empty document without calling the model", async () => {
    const result = await reviseDocumentAction("   ", "make it shorter");
    expect(result).toEqual({ error: "There is no document text to revise." });
    expect(callLlm).not.toHaveBeenCalled();
  });

  it("rejects empty instructions without calling the model", async () => {
    const result = await reviseDocumentAction(DOC, "   ");
    expect(result).toEqual({ error: "Say what you would like changed." });
    expect(callLlm).not.toHaveBeenCalled();
  });

  it("returns the revised document on success", async () => {
    mockLlm("# Syllabus\n\nWeek 1: Introduction and course policies.");
    const result = await reviseDocumentAction(DOC, "expand week 1");
    expect(result).toEqual({ text: "# Syllabus\n\nWeek 1: Introduction and course policies." });
  });

  it("sends both the current document and the instructions to the model", async () => {
    mockLlm("revised");
    await reviseDocumentAction(DOC, "add a late policy");

    const prompt = String(
      (vi.mocked(callLlm).mock.calls[0][0] as { contents: Array<{ parts: Array<{ text: string }> }> })
        .contents[0].parts[0].text
    );
    expect(prompt).toContain(DOC);
    expect(prompt).toContain("add a late policy");
    // The contract is replacement, not commentary - the caller writes the
    // result straight over the document being edited.
    expect(prompt).toContain("COMPLETE revised document");
  });

  it("trims the model's response", async () => {
    mockLlm("\n\n  revised body  \n\n");
    const result = await reviseDocumentAction(DOC, "tidy it");
    expect(result).toEqual({ text: "revised body" });
  });

  it("reports an error rather than throwing when the model call fails", async () => {
    vi.mocked(callLlm).mockResolvedValue({ ok: false, status: 503, body: "upstream unavailable", text: "" } as never);
    const result = await reviseDocumentAction(DOC, "tidy it");
    expect("error" in result).toBe(true);
    if ("error" in result) expect(result.error).toContain("503");
  });

  it("treats an empty model response as an error, never as an empty document", async () => {
    mockLlm("   ");
    const result = await reviseDocumentAction(DOC, "tidy it");
    expect(result).toEqual({ error: "The model returned an empty document." });
  });

  it("reports an error rather than throwing when the model call rejects", async () => {
    vi.mocked(callLlm).mockRejectedValue(new Error("socket hang up"));
    const result = await reviseDocumentAction(DOC, "tidy it");
    expect(result).toEqual({ error: "socket hang up" });
  });

  // The embedded provider has no model, so it must not silently hand back the
  // input unchanged - that would look like a revision that quietly did nothing.
  it("embedded: returns the document with the request recorded, and calls no model", async () => {
    const result = await reviseDocumentAction(DOC, "make it formal", "embedded");
    expect(callLlm).not.toHaveBeenCalled();
    expect("text" in result).toBe(true);
    if ("text" in result) {
      expect(result.text).toContain(DOC);
      expect(result.text).toContain("make it formal");
      expect(result.text).toContain("not applied");
    }
  });
});
