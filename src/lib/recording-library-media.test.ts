import { describe, expect, it } from "vitest";
import { isRecordingLibraryMedia } from "./recording-library-media";

const row = { kind: "file" as const, mimeType: "application/octet-stream", name: "Example", storagePath: "owner/id" };
describe("recording library media selection", () => {
  it("includes audio and video regardless of library category, ignoring MIME case and codec parameters", () => {
    expect(isRecordingLibraryMedia({ ...row, kind: "recording", mimeType: "video/webm;codecs=vp9" })).toBe(true);
    expect(isRecordingLibraryMedia({ ...row, kind: "file", mimeType: "AUDIO/MP4" })).toBe(true);
    expect(isRecordingLibraryMedia({ ...row, kind: "captioned", mimeType: "video/mp4" })).toBe(true);
  });
  it("uses media extensions only for generic or absent MIME", () => {
    expect(isRecordingLibraryMedia({ ...row, storagePath: "owner/id.MP4" })).toBe(true);
    expect(isRecordingLibraryMedia({ ...row, mimeType: "", name: "Lecture.ogg" })).toBe(true);
    expect(isRecordingLibraryMedia({ ...row, mimeType: "application/pdf", name: "fake.mp4" })).toBe(false);
    expect(isRecordingLibraryMedia({ ...row })).toBe(false);
  });
  it("excludes reports, documents, images and bundles", () => {
    for (const mimeType of ["application/pdf", "text/plain", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/zip", "image/png"]) {
      expect(isRecordingLibraryMedia({ ...row, mimeType })).toBe(false);
    }
    expect(isRecordingLibraryMedia({ ...row, kind: "bundle", mimeType: "video/mp4" })).toBe(false);
  });
});
