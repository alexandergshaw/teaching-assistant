import { describe, it, expect, vi, beforeEach } from "vitest";

// extractTextFromBuffer pulls in jszip/officeparser (real file parsing) - mock
// it so these tests exercise only filesToLlmPartsDetailed's own branching
// (inline passthrough vs. extraction vs. skip), not the parsers themselves.
vi.mock("./office-extract", () => ({
  extractTextFromBuffer: vi.fn(),
}));

import { extractTextFromBuffer } from "./office-extract";
import { filesToLlmParts, filesToLlmPartsDetailed, isGeminiInlineSupported, type UploadedFile } from "./llm-files";

const b64 = (s: string) => Buffer.from(s, "utf-8").toString("base64");

function file(name: string, mimeType: string, content = "content"): UploadedFile {
  return { name, mimeType, base64: b64(content) };
}

describe("isGeminiInlineSupported", () => {
  it("accepts PDF and any image mime type", () => {
    expect(isGeminiInlineSupported("application/pdf")).toBe(true);
    expect(isGeminiInlineSupported("image/png")).toBe(true);
    expect(isGeminiInlineSupported("image/jpeg")).toBe(true);
  });

  it("rejects everything else", () => {
    expect(isGeminiInlineSupported("application/vnd.openxmlformats-officedocument.wordprocessingml.document")).toBe(false);
    expect(isGeminiInlineSupported("text/plain")).toBe(false);
  });
});

describe("filesToLlmPartsDetailed", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("passes PDFs and images through as inline data without calling the extractor", async () => {
    const files = [file("scan.pdf", "application/pdf"), file("photo.png", "image/png")];

    const result = await filesToLlmPartsDetailed(files);

    expect(result.skipped).toEqual([]);
    expect(result.parts).toEqual([
      { inlineData: { mimeType: "application/pdf", data: files[0].base64 } },
      { inlineData: { mimeType: "image/png", data: files[1].base64 } },
    ]);
    expect(extractTextFromBuffer).not.toHaveBeenCalled();
  });

  it("extracts text for a non-inline file and labels it", async () => {
    vi.mocked(extractTextFromBuffer).mockResolvedValueOnce("Extracted document body.");

    const result = await filesToLlmPartsDetailed([file("notes.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document")]);

    expect(result.skipped).toEqual([]);
    expect(result.parts).toHaveLength(1);
    expect(result.parts[0]).toEqual({
      text: "\n\nCONTEXT FILE (notes.docx):\nExtracted document body.",
    });
  });

  it("uses the supplied label instead of the default", async () => {
    vi.mocked(extractTextFromBuffer).mockResolvedValueOnce("Body text.");

    const result = await filesToLlmPartsDetailed(
      [file("brief.txt", "text/plain")],
      "HOMEWORK ASSIGNMENT"
    );

    expect(result.parts[0]).toEqual({
      text: "\n\nHOMEWORK ASSIGNMENT (brief.txt):\nBody text.",
    });
  });

  it("reports a file as skipped when extraction throws", async () => {
    vi.mocked(extractTextFromBuffer).mockRejectedValueOnce(new Error("corrupt file"));

    const result = await filesToLlmPartsDetailed([file("broken.pptx", "application/vnd.openxmlformats-officedocument.presentationml.presentation")]);

    expect(result.parts).toEqual([]);
    expect(result.skipped).toEqual(["broken.pptx"]);
  });

  it("reports a file as skipped when extraction returns null", async () => {
    vi.mocked(extractTextFromBuffer).mockResolvedValueOnce(null);

    const result = await filesToLlmPartsDetailed([file("unknown.xyz", "application/octet-stream")]);

    expect(result.parts).toEqual([]);
    expect(result.skipped).toEqual(["unknown.xyz"]);
  });

  it("reports a file as skipped when extraction returns whitespace-only text", async () => {
    vi.mocked(extractTextFromBuffer).mockResolvedValueOnce("   \n\t  ");

    const result = await filesToLlmPartsDetailed([file("empty.txt", "text/plain")]);

    expect(result.parts).toEqual([]);
    expect(result.skipped).toEqual(["empty.txt"]);
  });

  it("processes a mix of inline, extracted, and skipped files in order", async () => {
    vi.mocked(extractTextFromBuffer)
      .mockResolvedValueOnce("Good text.")
      .mockResolvedValueOnce(null);

    const files = [
      file("img.png", "image/png"),
      file("doc.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
      file("bad.xyz", "application/octet-stream"),
    ];

    const result = await filesToLlmPartsDetailed(files);

    expect(result.parts).toHaveLength(2);
    expect(result.parts[0]).toEqual({ inlineData: { mimeType: "image/png", data: files[0].base64 } });
    expect(result.parts[1]).toEqual({ text: "\n\nCONTEXT FILE (doc.docx):\nGood text." });
    expect(result.skipped).toEqual(["bad.xyz"]);
  });

  it("returns empty parts and skipped for an empty file list", async () => {
    const result = await filesToLlmPartsDetailed([]);
    expect(result).toEqual({ parts: [], skipped: [] });
  });
});

describe("filesToLlmParts (existing callers: generateLessonPlanAction, generateAssignmentAction)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns exactly the parts array filesToLlmPartsDetailed would return, dropping only the skipped list", async () => {
    vi.mocked(extractTextFromBuffer)
      .mockResolvedValueOnce("Extracted.")
      .mockResolvedValueOnce(null);

    const files = [
      file("slide.pdf", "application/pdf"),
      file("handout.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
      file("junk.xyz", "application/octet-stream"),
    ];

    const detailed = await filesToLlmPartsDetailed(files);

    vi.mocked(extractTextFromBuffer)
      .mockResolvedValueOnce("Extracted.")
      .mockResolvedValueOnce(null);
    const parts = await filesToLlmParts(files);

    expect(parts).toEqual(detailed.parts);
  });

  it("keeps the default label 'CONTEXT FILE' unchanged", async () => {
    vi.mocked(extractTextFromBuffer).mockResolvedValueOnce("Body.");
    const parts = await filesToLlmParts([file("f.txt", "text/plain")]);
    expect(parts).toEqual([{ text: "\n\nCONTEXT FILE (f.txt):\nBody." }]);
  });

  it("honors a custom label, matching the 'HOMEWORK ASSIGNMENT' call site", async () => {
    vi.mocked(extractTextFromBuffer).mockResolvedValueOnce("Body.");
    const parts = await filesToLlmParts([file("f.txt", "text/plain")], "HOMEWORK ASSIGNMENT");
    expect(parts).toEqual([{ text: "\n\nHOMEWORK ASSIGNMENT (f.txt):\nBody." }]);
  });

  it("swallows a thrown extraction error and returns no part for that file, matching prior behavior", async () => {
    vi.mocked(extractTextFromBuffer).mockRejectedValueOnce(new Error("boom"));
    const parts = await filesToLlmParts([file("f.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document")]);
    expect(parts).toEqual([]);
  });

  it("returns an empty array for no files", async () => {
    const parts = await filesToLlmParts([]);
    expect(parts).toEqual([]);
  });
});
