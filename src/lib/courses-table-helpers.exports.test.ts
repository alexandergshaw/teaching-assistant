// Split out of courses-table-helpers.test.ts (which had grown past this
// repo's 1000-line-per-file cap). Covers export-file selection - which
// export file a course tile exposes for LMS-connect vs import-from-export,
// and which files count as app-generated vs instructor-provided. Both
// describe blocks below are the direct coverage for docs/REGRESSION.md
// entry 196 (a tile must never read its own app-generated cartridge back in
// as course input).

import { describe, it, expect } from "vitest";
import {
  canLms,
  canImport,
  isGeneratedExportFile,
  latestSourceExportFile,
  hasOnlyGeneratedExports,
} from "./courses-table-helpers";
import { makeCourse } from "./courses-table-helpers.fixtures";
import type { CourseMaterialFile } from "./supabase/courses";

describe("canLms / canImport", () => {
  it("canLms requires both a Canvas URL and an institution", () => {
    expect(canLms(makeCourse({ canvasUrl: "https://x/courses/1", institution: "MCC" }))).toBe(true);
    expect(canLms(makeCourse({ canvasUrl: "https://x/courses/1", institution: null }))).toBe(false);
    expect(canLms(makeCourse({ canvasUrl: null, institution: "MCC" }))).toBe(false);
    expect(canLms(makeCourse({ canvasUrl: "  ", institution: "  " }))).toBe(false);
  });

  it("canImport is true only when canLms is false and a source (non-generated) export exists", () => {
    const withExport = makeCourse({
      canvasUrl: null,
      institution: null,
      exportFiles: [{ name: "a.imscc", path: "p/a", size: 10, addedAt: "2024-01-01T00:00:00.000Z" }],
    });
    expect(canImport(withExport)).toBe(true);
    expect(canImport(makeCourse({ canvasUrl: "https://x/courses/1", institution: "MCC", exportFiles: withExport.exportFiles }))).toBe(false);
    expect(canImport(makeCourse({ canvasUrl: null, institution: null, exportFiles: [] }))).toBe(false);
  });

  // AC2 (docs/REGRESSION.md entry 196): a tile holding only app-generated
  // cartridges must not offer "import from export" - taking that offer IS
  // the self-consumption defect this chunk fixes.
  it("canImport is false when the course's only export files are all app-generated", () => {
    const onlyGenerated = makeCourse({
      canvasUrl: null,
      institution: null,
      exportFiles: [
        { name: "built.imscc", path: "p/built", size: 10, addedAt: "2024-01-01T00:00:00.000Z", generated: true },
      ],
    });
    expect(canImport(onlyGenerated)).toBe(false);
  });
});

// AC2 (docs/REGRESSION.md entry 196): every read-as-input site selects an
// export via latestSourceExportFile instead of raw "greatest addedAt", so an
// app-generated cartridge (the app's own output) never gets fed back in as
// course input.
describe("isGeneratedExportFile / latestSourceExportFile / hasOnlyGeneratedExports", () => {
  function file(overrides: Partial<CourseMaterialFile>): CourseMaterialFile {
    return {
      name: "f.imscc",
      path: "p/f",
      size: 1,
      addedAt: "2024-01-01T00:00:00.000Z",
      ...overrides,
    };
  }

  describe("isGeneratedExportFile", () => {
    it("is false for a legacy entry with no generated property (instructor-provided)", () => {
      expect(isGeneratedExportFile(file({ path: "p/legacy" }))).toBe(false);
    });

    it("is false when generated is explicitly false", () => {
      expect(isGeneratedExportFile(file({ path: "p/explicit-false", generated: false }))).toBe(false);
    });

    it("is true only when generated is exactly true", () => {
      expect(isGeneratedExportFile(file({ path: "p/generated", generated: true }))).toBe(true);
    });
  });

  describe("latestSourceExportFile", () => {
    it("returns null for an empty export list", () => {
      expect(latestSourceExportFile(makeCourse({ exportFiles: [] }))).toBeNull();
    });

    it("treats legacy entries with no generated property as instructor-provided, picking the newest", () => {
      const older = file({ path: "p/old", addedAt: "2024-01-01T00:00:00.000Z" });
      const newer = file({ path: "p/new", addedAt: "2024-06-01T00:00:00.000Z" });
      expect(latestSourceExportFile(makeCourse({ exportFiles: [older, newer] }))?.path).toBe("p/new");
    });

    // The actual defect (docs/REGRESSION.md entry 196 AC0/AC1): the app's
    // own generated output is by construction the newest by addedAt, so a
    // naive "greatest addedAt" pick returns app output instead of the
    // instructor's real upload. The fix must skip it and fall back to the
    // older, genuinely instructor-provided file.
    it("skips a generated file even when it is the newest, resolving to the older instructor upload", () => {
      const instructorUpload = file({ path: "p/instructor", addedAt: "2024-01-01T00:00:00.000Z" });
      const appGenerated = file({ path: "p/generated", addedAt: "2024-06-01T00:00:00.000Z", generated: true });
      const result = latestSourceExportFile(makeCourse({ exportFiles: [instructorUpload, appGenerated] }));
      expect(result?.path).toBe("p/instructor");
    });

    it("returns null when every export file is app-generated", () => {
      const g1 = file({ path: "p/g1", addedAt: "2024-01-01T00:00:00.000Z", generated: true });
      const g2 = file({ path: "p/g2", addedAt: "2024-02-01T00:00:00.000Z", generated: true });
      expect(latestSourceExportFile(makeCourse({ exportFiles: [g1, g2] }))).toBeNull();
    });

    it("picks the newest instructor-provided file, ignoring a generated file in between", () => {
      const a = file({ path: "p/a", addedAt: "2024-01-01T00:00:00.000Z" });
      const b = file({ path: "p/b", addedAt: "2024-03-01T00:00:00.000Z" });
      const g = file({ path: "p/g", addedAt: "2024-02-01T00:00:00.000Z", generated: true });
      expect(latestSourceExportFile(makeCourse({ exportFiles: [a, g, b] }))?.path).toBe("p/b");
    });
  });

  describe("hasOnlyGeneratedExports", () => {
    it("is false for an empty export list", () => {
      expect(hasOnlyGeneratedExports(makeCourse({ exportFiles: [] }))).toBe(false);
    });

    it("is false when the only export is a legacy entry with no generated property", () => {
      expect(hasOnlyGeneratedExports(makeCourse({ exportFiles: [file({ path: "p/legacy" })] }))).toBe(false);
    });

    it("is false for a mixed list, even when the generated file is newest", () => {
      const instructorUpload = file({ path: "p/instructor", addedAt: "2024-01-01T00:00:00.000Z" });
      const appGenerated = file({ path: "p/generated", addedAt: "2024-06-01T00:00:00.000Z", generated: true });
      expect(hasOnlyGeneratedExports(makeCourse({ exportFiles: [instructorUpload, appGenerated] }))).toBe(false);
    });

    it("is true when every export file is app-generated", () => {
      const g1 = file({ path: "p/g1", generated: true });
      const g2 = file({ path: "p/g2", addedAt: "2024-02-01T00:00:00.000Z", generated: true });
      expect(hasOnlyGeneratedExports(makeCourse({ exportFiles: [g1, g2] }))).toBe(true);
    });
  });
});
