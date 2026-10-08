import { describe, it, expect } from "vitest";
import { collectInlineVisualParts } from "./inline-visuals";
import type { SubmittedFileInfo } from "./types";

function file(overrides: Partial<SubmittedFileInfo>): SubmittedFileInfo {
  return {
    name: "f",
    extension: "",
    previewContent: "",
    previewTruncated: false,
    ...overrides,
  };
}

describe("collectInlineVisualParts (wave 1a)", () => {
  it("includes a pdf and an image that carry bytes", () => {
    const parts = collectInlineVisualParts([
      file({ name: "a.pdf", mimeType: "application/pdf", rawBase64: "PDFB64" }),
      file({ name: "b.png", mimeType: "image/png", rawBase64: "PNGB64" }),
    ]);
    expect(parts).toEqual([
      { name: "a.pdf", base64: "PDFB64", mimeType: "application/pdf" },
      { name: "b.png", base64: "PNGB64", mimeType: "image/png" },
    ]);
  });

  it("omits non-visual files in wave 1a (txt, docx)", () => {
    const parts = collectInlineVisualParts([
      file({ name: "n.txt", mimeType: "text/plain", rawBase64: "X" }),
      file({
        name: "d.docx",
        mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        rawBase64: "Y",
      }),
    ]);
    expect(parts).toEqual([]);
  });

  it("omits a file with no rawBase64 or no mime type", () => {
    const parts = collectInlineVisualParts([
      file({ name: "a.pdf", mimeType: "application/pdf" }),
      file({ name: "b.png", rawBase64: "PNGB64" }),
    ]);
    expect(parts).toEqual([]);
  });
});
