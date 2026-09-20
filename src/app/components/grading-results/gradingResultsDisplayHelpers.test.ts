// A16-1 (docs/REGRESSION.md entry 359, docs/a16-scope.md section 4.4): unit
// tests for the two pure functions moved out of GradingResults.tsx as this
// file's line-budget extraction, ahead of that feature's own additions. A
// separate file from gradingResultsHelpers.test.ts (963 lines, 37 from the
// 1000-line ceiling) so this extraction does not push that file over it.
import { describe, expect, it } from "vitest";
import { buildDownloadFilename, speedGraderHref } from "./gradingResultsHelpers";

describe("speedGraderHref", () => {
  it("builds the deep link when a base URL and a numeric userId are both present", () => {
    expect(speedGraderHref("https://canvas.example/speedgrader?assignment_id=1", 42)).toBe(
      "https://canvas.example/speedgrader?assignment_id=1&student_id=42"
    );
  });

  it("returns null when there is no SpeedGrader base URL (not a Canvas source)", () => {
    expect(speedGraderHref(undefined, 42)).toBeNull();
    expect(speedGraderHref(null, 42)).toBeNull();
    expect(speedGraderHref("", 42)).toBeNull();
  });

  it("returns null when userId is not a number (a github/livefeed row with no Canvas id)", () => {
    expect(speedGraderHref("https://canvas.example/speedgrader?assignment_id=1", undefined)).toBeNull();
  });
});

describe("buildDownloadFilename", () => {
  it("appends the extension when the name does not already end with it", () => {
    expect(buildDownloadFilename("essay", "pdf")).toBe("essay.pdf");
  });

  it("leaves the name unchanged when it already ends with the extension", () => {
    expect(buildDownloadFilename("essay.pdf", "pdf")).toBe("essay.pdf");
  });

  it("matches the extension case-insensitively", () => {
    expect(buildDownloadFilename("essay.PDF", "pdf")).toBe("essay.PDF");
    expect(buildDownloadFilename("essay.pdf", "PDF")).toBe("essay.pdf");
  });
});
