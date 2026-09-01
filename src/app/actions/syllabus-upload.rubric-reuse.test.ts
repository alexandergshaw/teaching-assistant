// The extract-then-delete lifecycle inside syllabus-upload.ts is reused
// WHOLE by two callers now: the course-schedule-from-source workflow step
// (a syllabus, under the "syllabus-uploads" storage path segment) and
// RubricInputModal.tsx (a rubric, under the new "rubric-uploads" segment -
// src/lib/syllabus-upload-source.ts's UPLOAD_PATH_SEGMENTS). Both go through
// the exact same extractSyllabusTextAction, with no branch inside it for
// which feature is calling.
//
// These are action-level tests (not just syllabus-upload-source.test.ts's
// lower-level withUploadedSyllabusFile/isKnownUploadPath tests) so the thing
// actually pinned is the real caller-facing contract: extractSyllabusTextAction
// itself, called the way RubricInputModal.tsx and the workflow step really
// call it, with a real (mocked) Storage client underneath.
//
// Frozen literal oracles throughout - no default appears on both sides of an
// equality, and nothing here early-returns past an assertion.
import { describe, it, expect, vi, beforeEach } from "vitest";

// vi.mock() calls are hoisted above every import AND every top-level const
// in this file, so a plain `const mockDownloadFile = vi.fn()` referenced
// from inside the factory below throws "Cannot access before initialization"
// - confirmed by actually running this file (see this feature's report).
// vi.hoisted() is Vitest's own escape hatch: its callback runs BEFORE the
// hoisted vi.mock() factories do, so the returned fns exist by the time the
// factory needs them. Deliberately untyped vi.fn() rather than a typed
// vi.mocked() wrapper around the real downloadFile/removeFiles, so a mocked
// resolved value only needs to match the SHAPE withUploadedSyllabusFile
// actually reads ({ data, error: { message } | null }) - the same
// intentionally-narrow shape SyllabusUploadStorageClient declares - not
// Supabase's full StorageError type.
const { mockDownloadFile, mockRemoveFiles } = vi.hoisted(() => ({
  mockDownloadFile: vi.fn(),
  mockRemoveFiles: vi.fn(),
}));

vi.mock("@/lib/supabase/auth", () => ({
  requireOwner: vi.fn().mockResolvedValue({ id: "user-1", email: "user@example.com" }),
}));

vi.mock("@/lib/supabase/course-syllabi", () => ({
  createSyllabus: vi.fn(),
}));

vi.mock("@/lib/supabase/courses", () => ({
  getCourse: vi.fn(),
  updateCourse: vi.fn(),
}));

vi.mock("@/lib/docx", () => ({
  buildDocxFromPlainText: vi.fn(),
}));

vi.mock("@/lib/supabase/storage", () => ({
  downloadFile: mockDownloadFile,
  removeFiles: mockRemoveFiles,
}));

import { extractSyllabusTextAction } from "./syllabus-upload";

const mockedDownloadFile = mockDownloadFile;
const mockedRemoveFiles = mockRemoveFiles;

const SYLLABUS_PATH = "user-1/syllabus-uploads/upload-1.txt";
const RUBRIC_PATH = "user-1/rubric-uploads/upload-2.txt";
const THIRD_SEGMENT_PATH = "user-1/attachment-uploads/upload-3.txt";

function textBlob(text: string): Blob {
  return new Blob([text], { type: "text/plain" });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedDownloadFile.mockResolvedValue({ data: textBlob("Week 1: Intro to grading rubrics."), error: null });
  mockedRemoveFiles.mockResolvedValue({ error: null });
});

describe("extractSyllabusTextAction: the syllabus caller is unaffected (frozen oracle)", () => {
  it("extracts the downloaded text unchanged, under the syllabus-uploads segment", async () => {
    const result = await extractSyllabusTextAction({
      name: "syllabus.txt",
      storagePath: SYLLABUS_PATH,
      mimeType: "text/plain",
    });
    expect(result).toEqual({ text: "Week 1: Intro to grading rubrics." });
  });

  it("downloads from, and removes, exactly the syllabus path it was given", async () => {
    await extractSyllabusTextAction({
      name: "syllabus.txt",
      storagePath: SYLLABUS_PATH,
      mimeType: "text/plain",
    });
    expect(mockedDownloadFile).toHaveBeenCalledWith("course-files", SYLLABUS_PATH);
    expect(mockedRemoveFiles).toHaveBeenCalledWith("course-files", [SYLLABUS_PATH]);
  });
});

describe("extractSyllabusTextAction: a rubric upload under the new rubric-uploads segment works identically", () => {
  it("extracts the downloaded text - same code path, no special-casing by segment", async () => {
    const result = await extractSyllabusTextAction({
      name: "rubric.txt",
      storagePath: RUBRIC_PATH,
      mimeType: "text/plain",
    });
    expect(result).toEqual({ text: "Week 1: Intro to grading rubrics." });
  });

  it("downloads from, and removes, exactly the rubric path it was given", async () => {
    await extractSyllabusTextAction({
      name: "rubric.txt",
      storagePath: RUBRIC_PATH,
      mimeType: "text/plain",
    });
    expect(mockedDownloadFile).toHaveBeenCalledWith("course-files", RUBRIC_PATH);
    expect(mockedRemoveFiles).toHaveBeenCalledWith("course-files", [RUBRIC_PATH]);
  });
});

describe("extractSyllabusTextAction: an invented third segment is rejected, not silently accepted", () => {
  it("refuses a path under a segment that is not in the allow-list, with no download and no removal call", async () => {
    const result = await extractSyllabusTextAction({
      name: "sneaky.txt",
      storagePath: THIRD_SEGMENT_PATH,
      mimeType: "text/plain",
    });
    expect(result).toEqual({ error: "That upload could not be found. Please try uploading the file again." });
    expect(mockedDownloadFile).not.toHaveBeenCalled();
    expect(mockedRemoveFiles).not.toHaveBeenCalled();
  });
});

describe("extractSyllabusTextAction: the always-delete guarantee holds on every failure branch, for both segments", () => {
  it("syllabus segment: a download failure still triggers removal", async () => {
    mockedDownloadFile.mockResolvedValueOnce({ data: null, error: { message: "network down" } });
    const result = await extractSyllabusTextAction({
      name: "syllabus.txt",
      storagePath: SYLLABUS_PATH,
      mimeType: "text/plain",
    });
    expect(result).toEqual({ error: "network down" });
    expect(mockedRemoveFiles).toHaveBeenCalledWith("course-files", [SYLLABUS_PATH]);
  });

  it("rubric segment: a download failure still triggers removal", async () => {
    mockedDownloadFile.mockResolvedValueOnce({ data: null, error: { message: "network down" } });
    const result = await extractSyllabusTextAction({
      name: "rubric.txt",
      storagePath: RUBRIC_PATH,
      mimeType: "text/plain",
    });
    expect(result).toEqual({ error: "network down" });
    expect(mockedRemoveFiles).toHaveBeenCalledWith("course-files", [RUBRIC_PATH]);
  });

  it("syllabus segment: an extraction failure (unsupported type) still triggers removal", async () => {
    const result = await extractSyllabusTextAction({
      name: "syllabus.xyz",
      storagePath: SYLLABUS_PATH,
      mimeType: "application/octet-stream",
    });
    expect(result).toEqual({ error: "File type not supported. Accepted formats: .docx, .pdf, .txt, .md" });
    expect(mockedRemoveFiles).toHaveBeenCalledWith("course-files", [SYLLABUS_PATH]);
  });

  it("rubric segment: an extraction failure (unsupported type) still triggers removal", async () => {
    const result = await extractSyllabusTextAction({
      name: "rubric.xyz",
      storagePath: RUBRIC_PATH,
      mimeType: "application/octet-stream",
    });
    expect(result).toEqual({ error: "File type not supported. Accepted formats: .docx, .pdf, .txt, .md" });
    expect(mockedRemoveFiles).toHaveBeenCalledWith("course-files", [RUBRIC_PATH]);
  });

  it("rubric segment: a blank extraction still triggers removal", async () => {
    mockedDownloadFile.mockResolvedValueOnce({ data: textBlob("   "), error: null });
    const result = await extractSyllabusTextAction({
      name: "rubric.txt",
      storagePath: RUBRIC_PATH,
      mimeType: "text/plain",
    });
    expect(result).toEqual({
      error: "No text found in that file. Upload a file with readable content.",
    });
    expect(mockedRemoveFiles).toHaveBeenCalledWith("course-files", [RUBRIC_PATH]);
  });

  it("third-segment path: refused before any Storage call, so there is nothing this lifecycle owns to delete", async () => {
    const result = await extractSyllabusTextAction({
      name: "sneaky.txt",
      storagePath: THIRD_SEGMENT_PATH,
      mimeType: "text/plain",
    });
    expect(result).toEqual({ error: "That upload could not be found. Please try uploading the file again." });
    expect(mockedDownloadFile).not.toHaveBeenCalled();
    expect(mockedRemoveFiles).not.toHaveBeenCalled();
  });
});
