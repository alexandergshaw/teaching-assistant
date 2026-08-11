// Proves the ONE shared check every Course Engine entry point now calls,
// instead of trusting that both call sites independently reimplemented the
// same byte math correctly. See course-engine-upload.ts's header for the
// drift this replaces.
import { describe, it, expect } from "vitest";
import { checkCourseEngineUpload } from "./course-engine-upload";
import { maxFileBytesForWireBudget } from "./upload-budget";

const MB = 1024 * 1024;

describe("checkCourseEngineUpload", () => {
  it("accepts a file comfortably under budget", () => {
    expect(checkCourseEngineUpload(1 * MB, "This file").ok).toBe(true);
  });

  it("refuses a file well over budget", () => {
    const result = checkCourseEngineUpload(50 * MB, "This file");
    expect(result.ok).toBe(false);
    expect(result.error).toBeDefined();
  });

  it("THE DEFECT: refuses a 4.5MB raw file - exactly the size the old check let through", () => {
    // The old check in useLessonPlanner.ts compared file.size directly to
    // the platform's own 4.5MB cap. A 4.5MB file passed that check, but
    // base64-encoded it rides the wire at 6MB - well past what the platform
    // actually accepts. Under a naive raw-byte cap at the platform's number,
    // this exact file would have been wrongly accepted.
    const fileBytes = 4.5 * MB;
    const result = checkCourseEngineUpload(fileBytes, "This file");
    expect(result.ok).toBe(false);
  });

  it("names the file being refused, so the message is usable wherever it is shown", () => {
    const result = checkCourseEngineUpload(50 * MB, "This course repository");
    expect(result.error?.startsWith("This course repository")).toBe(true);
  });

  it("is inclusive at the boundary and refuses one byte past it", () => {
    const maxFile = maxFileBytesForWireBudget();
    expect(checkCourseEngineUpload(maxFile, "x").ok).toBe(true);
    expect(checkCourseEngineUpload(maxFile + 1, "x").ok).toBe(false);
  });
});
