// BULK-ZIP BW1, I-syllabus-segment-bind (docs/bulk-zip-grading-scope.md S3).
// "grading-uploads" joined the shared UPLOAD_PATH_SEGMENTS union, so
// isKnownUploadPath alone now ACCEPTS a grading path. These actions must still
// refuse it BEFORE any Storage call (same-uid, so RLS would not catch it), while
// the legitimate syllabus and rubric segments keep reaching the lifecycle.
import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockDownloadFile, mockRemoveFiles } = vi.hoisted(() => ({
  mockDownloadFile: vi.fn(),
  mockRemoveFiles: vi.fn(),
}));

vi.mock("@/lib/supabase/auth", () => ({
  requireOwner: vi.fn().mockResolvedValue({ id: "user-1", email: "user@example.com" }),
}));
vi.mock("@/lib/supabase/course-syllabi", () => ({ createSyllabus: vi.fn() }));
vi.mock("@/lib/supabase/courses", () => ({ getCourse: vi.fn(), updateCourse: vi.fn() }));
vi.mock("@/lib/docx", () => ({ buildDocxFromPlainText: vi.fn() }));
vi.mock("@/lib/supabase/storage", () => ({ downloadFile: mockDownloadFile, removeFiles: mockRemoveFiles }));

import { extractSyllabusTextAction, uploadSyllabusAction } from "./syllabus-upload";

const NOT_FOUND = { error: "That upload could not be found. Please try uploading the file again." };

beforeEach(() => {
  vi.clearAllMocks();
  mockDownloadFile.mockResolvedValue({ data: new Blob(["Week 1 text."], { type: "text/plain" }), error: null });
  mockRemoveFiles.mockResolvedValue({ error: null });
});

describe("extractSyllabusTextAction refuses the grading-uploads segment", () => {
  it("refuses a grading path before any download or remove", async () => {
    const result = await extractSyllabusTextAction({
      name: "x.txt",
      storagePath: "user-1/grading-uploads/x.txt",
      mimeType: "text/plain",
    });
    expect(result).toEqual(NOT_FOUND);
    expect(mockDownloadFile).not.toHaveBeenCalled();
    expect(mockRemoveFiles).not.toHaveBeenCalled();
  });

  it.each([
    ["syllabus-uploads", "user-1/syllabus-uploads/x.txt"],
    ["rubric-uploads", "user-1/rubric-uploads/x.txt"],
  ])("still serves a %s path", async (_segment, storagePath) => {
    const result = await extractSyllabusTextAction({ name: "x.txt", storagePath, mimeType: "text/plain" });
    expect(result).toEqual({ text: "Week 1 text." });
    expect(mockDownloadFile).toHaveBeenCalledWith("course-files", storagePath);
    expect(mockRemoveFiles).toHaveBeenCalledWith("course-files", [storagePath]);
  });
});

describe("uploadSyllabusAction refuses the grading-uploads segment", () => {
  it("refuses a grading path before any download or remove", async () => {
    const result = await uploadSyllabusAction("course-1", {
      name: "x.txt",
      storagePath: "user-1/grading-uploads/x.txt",
      mimeType: "text/plain",
    });
    expect(result).toEqual(NOT_FOUND);
    expect(mockDownloadFile).not.toHaveBeenCalled();
    expect(mockRemoveFiles).not.toHaveBeenCalled();
  });
});
