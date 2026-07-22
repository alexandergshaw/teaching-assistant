import { describe, it, expect } from "vitest";
import { getPreviewStrategy, getNoPreviewReason } from "./file-preview";

describe("getPreviewStrategy", () => {
  it("returns 'media-play' for video MIME types", () => {
    expect(getPreviewStrategy("video/mp4")).toBe("media-play");
    expect(getPreviewStrategy("video/webm")).toBe("media-play");
    expect(getPreviewStrategy("video/quicktime")).toBe("media-play");
  });

  it("returns 'media-play' for audio MIME types", () => {
    expect(getPreviewStrategy("audio/mpeg")).toBe("media-play");
    expect(getPreviewStrategy("audio/wav")).toBe("media-play");
    expect(getPreviewStrategy("audio/mp3")).toBe("media-play");
  });

  it("returns 'pdf' for PDF files", () => {
    expect(getPreviewStrategy("application/pdf")).toBe("pdf");
  });

  it("returns 'image' for image MIME types", () => {
    expect(getPreviewStrategy("image/png")).toBe("image");
    expect(getPreviewStrategy("image/jpeg")).toBe("image");
    expect(getPreviewStrategy("image/gif")).toBe("image");
    expect(getPreviewStrategy("image/svg+xml")).toBe("image");
  });

  it("returns 'text' for text MIME types", () => {
    expect(getPreviewStrategy("text/plain")).toBe("text");
    expect(getPreviewStrategy("text/markdown")).toBe("text");
    expect(getPreviewStrategy("text/csv")).toBe("text");
  });

  it("returns 'text' for application/json", () => {
    expect(getPreviewStrategy("application/json")).toBe("text");
  });

  it("returns 'text' for text-like extensions", () => {
    expect(getPreviewStrategy("application/octet-stream", "md")).toBe("text");
    expect(getPreviewStrategy("application/octet-stream", "csv")).toBe("text");
    expect(getPreviewStrategy("application/octet-stream", "log")).toBe("text");
    expect(getPreviewStrategy("application/octet-stream", "json")).toBe("text");
    expect(getPreviewStrategy("application/octet-stream", "txt")).toBe("text");
  });

  it("returns 'docx' for Word documents", () => {
    expect(getPreviewStrategy("application/vnd.openxmlformats-officedocument.wordprocessingml.document")).toBe("docx");
  });

  it("returns 'pptx' for PowerPoint presentations", () => {
    expect(getPreviewStrategy("application/vnd.openxmlformats-officedocument.presentationml.presentation")).toBe("pptx");
  });

  it("returns 'zip' for ZIP archives", () => {
    expect(getPreviewStrategy("application/zip")).toBe("zip");
  });

  it("returns 'none' for unknown types", () => {
    expect(getPreviewStrategy("application/octet-stream")).toBe("none");
    expect(getPreviewStrategy("application/vnd.ms-excel")).toBe("none");
    expect(getPreviewStrategy("")).toBe("none");
  });

  it("is case-insensitive", () => {
    expect(getPreviewStrategy("IMAGE/PNG")).toBe("image");
    expect(getPreviewStrategy("VIDEO/MP4")).toBe("media-play");
    expect(getPreviewStrategy("application/PDF")).toBe("pdf");
  });

  it("handles extensions case-insensitively", () => {
    expect(getPreviewStrategy("application/octet-stream", "MD")).toBe("text");
    expect(getPreviewStrategy("application/octet-stream", "CSV")).toBe("text");
  });
});

describe("getNoPreviewReason", () => {
  it("returns empty string for previewable types", () => {
    expect(getNoPreviewReason("image/png")).toBe("");
    expect(getNoPreviewReason("application/pdf")).toBe("");
    expect(getNoPreviewReason("text/plain")).toBe("");
  });

  it("returns a message for non-previewable types", () => {
    const reason = getNoPreviewReason("application/octet-stream");
    expect(reason).toContain("No inline preview");
  });

  it("handles unknown extensions", () => {
    const reason = getNoPreviewReason("application/vnd.ms-excel");
    expect(reason).toContain("No inline preview");
  });
});
