// Pins the behaviour AC8/AC8a of
// docs/modules-cartridge-import-upload-acceptance-criteria.md requires to
// survive the extraction out of ImportCourseExportControl.tsx UNCHANGED:
// step order, exact error message text, the NO `generated` flag on the
// attach call, the storage-cleanup-on-failure behaviour, and the three
// distinguishable success outcomes.
//
// Per this repo's own standing rule (a consolidation makes any test that
// compares two implementations a tautology - AGENTS.md-linked note
// "refactors disarm tests"), every expectation below is a FROZEN LITERAL:
// an exact message string, or an exact call/no-call assertion - never a
// comparison against "whatever ImportCourseExportControl.tsx does".
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../actions", () => ({
  listCourseHubAction: vi.fn(),
  createCourseHubAction: vi.fn(),
  updateCourseHubAction: vi.fn(),
  appendCourseExportFileAction: vi.fn(),
}));

vi.mock("@/lib/cartridge-import", () => ({
  parseCartridgeBlob: vi.fn(),
}));

vi.mock("@/lib/imported-export-destination", () => ({
  chooseImportDestination: vi.fn(),
  resolveImportFallbackName: vi.fn(() => "fallback-name"),
}));

vi.mock("@/lib/courses-tab-helpers", () => ({
  courseToInput: vi.fn((c: { name: string }) => ({ name: c.name, stub: true })),
}));

vi.mock("@/lib/course-files", () => ({
  uploadCourseZipChunked: vi.fn(),
  removeCourseZipObjects: vi.fn(),
}));

import {
  listCourseHubAction,
  createCourseHubAction,
  updateCourseHubAction,
  appendCourseExportFileAction,
} from "../../actions";
import { parseCartridgeBlob } from "@/lib/cartridge-import";
import { chooseImportDestination } from "@/lib/imported-export-destination";
import { uploadCourseZipChunked, removeCourseZipObjects } from "@/lib/course-files";
import { importCourseExportFile } from "./importCourseExportPipeline";

const supabase = {} as never;

function makeFile(name = "export.imscc", size = 1024): File {
  return { name, size } as File;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("importCourseExportFile - step 1: size ceiling (AC7 item 1)", () => {
  it("rejects a file over 100 MB with the exact message, before parsing", async () => {
    const file = makeFile("big.zip", 100 * 1024 * 1024 + 1);
    await expect(importCourseExportFile(supabase, "user-1", file)).rejects.toThrow(
      "Export is too large (max 100 MB)."
    );
    expect(parseCartridgeBlob).not.toHaveBeenCalled();
  });

  it("accepts a file at exactly 100 MB (boundary is inclusive)", async () => {
    vi.mocked(parseCartridgeBlob).mockRejectedValue(new Error("stop here"));
    const file = makeFile("boundary.zip", 100 * 1024 * 1024);
    await expect(importCourseExportFile(supabase, "user-1", file)).rejects.toThrow("stop here");
    expect(parseCartridgeBlob).toHaveBeenCalledTimes(1);
  });
});

describe("importCourseExportFile - step 2: parse before anything is uploaded or created (AC7 item 2)", () => {
  it("reports the parser's own error message and never calls listCourseHubAction", async () => {
    vi.mocked(parseCartridgeBlob).mockRejectedValue(new Error("Bad cartridge structure."));
    await expect(importCourseExportFile(supabase, "user-1", makeFile())).rejects.toThrow(
      "Bad cartridge structure."
    );
    expect(listCourseHubAction).not.toHaveBeenCalled();
  });

  it("falls back to a generic message when the parser throws a non-Error value", async () => {
    vi.mocked(parseCartridgeBlob).mockRejectedValue("weird rejection");
    await expect(importCourseExportFile(supabase, "user-1", makeFile())).rejects.toThrow(
      "Could not read this export file."
    );
  });

  it("calls onPhase with 'parsing' before parseCartridgeBlob resolves, and never with 'idle'", async () => {
    const phases: string[] = [];
    vi.mocked(parseCartridgeBlob).mockImplementation(async () => {
      phases.push("parse-ran");
      throw new Error("stop");
    });
    await expect(
      importCourseExportFile(supabase, "user-1", makeFile(), (p) => phases.push(p))
    ).rejects.toThrow();
    expect(phases).toEqual(["parsing", "parse-ran"]);
  });
});

describe("importCourseExportFile - step 3: pick or create the destination row (AC7 item 3)", () => {
  it("surfaces listCourseHubAction's own error verbatim", async () => {
    vi.mocked(parseCartridgeBlob).mockResolvedValue({ title: "T", canvasIdentity: undefined } as never);
    vi.mocked(listCourseHubAction).mockResolvedValue({ error: "Could not list your courses." });
    await expect(importCourseExportFile(supabase, "user-1", makeFile())).rejects.toThrow(
      "Could not list your courses."
    );
    expect(chooseImportDestination).not.toHaveBeenCalled();
  });

  describe("destination: existing, no stamp needed", () => {
    beforeEach(() => {
      vi.mocked(parseCartridgeBlob).mockResolvedValue({ title: "T", canvasIdentity: undefined } as never);
      vi.mocked(listCourseHubAction).mockResolvedValue({
        courses: [{ id: "course-1", name: "Existing Course", canvasUrl: "https://canvas/1" }] as never,
      });
      vi.mocked(chooseImportDestination).mockReturnValue({
        kind: "existing",
        courseId: "course-1",
        stampCanvasUrl: null,
      });
    });

    it("never calls createCourseHubAction or updateCourseHubAction", async () => {
      vi.mocked(uploadCourseZipChunked).mockResolvedValue({ path: "p", parts: null });
      vi.mocked(appendCourseExportFileAction).mockResolvedValue({ replacedPaths: [] });
      await importCourseExportFile(supabase, "user-1", makeFile());
      expect(createCourseHubAction).not.toHaveBeenCalled();
      expect(updateCourseHubAction).not.toHaveBeenCalled();
    });

    it("resolves the 'attached' outcome naming the existing course", async () => {
      vi.mocked(uploadCourseZipChunked).mockResolvedValue({ path: "p", parts: null });
      vi.mocked(appendCourseExportFileAction).mockResolvedValue({ replacedPaths: [] });
      const outcome = await importCourseExportFile(supabase, "user-1", makeFile());
      expect(outcome).toEqual({ kind: "attached", courseId: "course-1", courseName: "Existing Course" });
    });
  });

  describe("destination: existing, stamp required (chunk 3h defect fix)", () => {
    beforeEach(() => {
      vi.mocked(parseCartridgeBlob).mockResolvedValue({ title: "T", canvasIdentity: undefined } as never);
      vi.mocked(listCourseHubAction).mockResolvedValue({
        courses: [{ id: "course-1", name: "Existing Course", canvasUrl: "" }] as never,
      });
      vi.mocked(chooseImportDestination).mockReturnValue({
        kind: "existing",
        courseId: "course-1",
        stampCanvasUrl: "https://canvas.example/courses/9",
      });
    });

    it("stamps the row BEFORE uploading, and only then uploads", async () => {
      vi.mocked(updateCourseHubAction).mockResolvedValue({ course: { id: "course-1" } as never });
      vi.mocked(uploadCourseZipChunked).mockResolvedValue({ path: "p", parts: null });
      vi.mocked(appendCourseExportFileAction).mockResolvedValue({ replacedPaths: [] });

      await importCourseExportFile(supabase, "user-1", makeFile());

      const updateOrder = vi.mocked(updateCourseHubAction).mock.invocationCallOrder[0];
      const uploadOrder = vi.mocked(uploadCourseZipChunked).mock.invocationCallOrder[0];
      expect(updateOrder).toBeLessThan(uploadOrder);
      expect(updateCourseHubAction).toHaveBeenCalledWith("course-1", {
        name: "Existing Course",
        stub: true,
        canvasUrl: "https://canvas.example/courses/9",
      });
    });

    it("resolves the 'stamped' outcome, distinct from plain 'attached'", async () => {
      vi.mocked(updateCourseHubAction).mockResolvedValue({ course: { id: "course-1" } as never });
      vi.mocked(uploadCourseZipChunked).mockResolvedValue({ path: "p", parts: null });
      vi.mocked(appendCourseExportFileAction).mockResolvedValue({ replacedPaths: [] });

      const outcome = await importCourseExportFile(supabase, "user-1", makeFile());
      expect(outcome).toEqual({ kind: "stamped", courseId: "course-1", courseName: "Existing Course" });
    });

    it("if the matched row vanished before the stamp write, fails with the exact recovery message and never uploads", async () => {
      vi.mocked(listCourseHubAction).mockResolvedValue({ courses: [] as never });
      await expect(importCourseExportFile(supabase, "user-1", makeFile())).rejects.toThrow(
        "The matched course could not be re-read to link its Canvas URL. Try again."
      );
      expect(updateCourseHubAction).not.toHaveBeenCalled();
      expect(uploadCourseZipChunked).not.toHaveBeenCalled();
    });

    it("if the stamp write itself fails, reports it with the exact combined message and never uploads (row left untouched)", async () => {
      vi.mocked(updateCourseHubAction).mockResolvedValue({ error: "network blip" });
      await expect(importCourseExportFile(supabase, "user-1", makeFile())).rejects.toThrow(
        'Found your existing course "Existing Course" by name, but could not link its Canvas URL: network blip Nothing was uploaded - try again.'
      );
      expect(uploadCourseZipChunked).not.toHaveBeenCalled();
    });
  });

  describe("destination: create", () => {
    beforeEach(() => {
      vi.mocked(parseCartridgeBlob).mockResolvedValue({ title: "T", canvasIdentity: undefined } as never);
      vi.mocked(listCourseHubAction).mockResolvedValue({ courses: [] as never });
      vi.mocked(chooseImportDestination).mockReturnValue({
        kind: "create",
        name: "fallback-name",
        canvasUrl: null,
      });
    });

    it("surfaces createCourseHubAction's own error verbatim and never uploads", async () => {
      vi.mocked(createCourseHubAction).mockResolvedValue({ error: "Enter a course name." });
      await expect(importCourseExportFile(supabase, "user-1", makeFile())).rejects.toThrow(
        "Enter a course name."
      );
      expect(uploadCourseZipChunked).not.toHaveBeenCalled();
    });

    it("resolves the 'created' outcome naming the new course", async () => {
      vi.mocked(createCourseHubAction).mockResolvedValue({
        course: { id: "course-9", name: "fallback-name" } as never,
      });
      vi.mocked(uploadCourseZipChunked).mockResolvedValue({ path: "p", parts: null });
      vi.mocked(appendCourseExportFileAction).mockResolvedValue({ replacedPaths: [] });

      const outcome = await importCourseExportFile(supabase, "user-1", makeFile());
      expect(outcome).toEqual({ kind: "created", courseId: "course-9", courseName: "fallback-name" });
    });
  });
});

describe("importCourseExportFile - step 4: upload + attach, NO generated flag (AC7 item 4)", () => {
  beforeEach(() => {
    vi.mocked(parseCartridgeBlob).mockResolvedValue({ title: "T", canvasIdentity: undefined } as never);
    vi.mocked(listCourseHubAction).mockResolvedValue({
      courses: [{ id: "course-1", name: "Existing Course", canvasUrl: "https://canvas/1" }] as never,
    });
    vi.mocked(chooseImportDestination).mockReturnValue({
      kind: "existing",
      courseId: "course-1",
      stampCanvasUrl: null,
    });
  });

  it("calls onPhase with 'uploading' only after the destination step completes", async () => {
    const phases: string[] = [];
    vi.mocked(uploadCourseZipChunked).mockResolvedValue({ path: "p", parts: null });
    vi.mocked(appendCourseExportFileAction).mockResolvedValue({ replacedPaths: [] });
    await importCourseExportFile(supabase, "user-1", makeFile(), (p) => phases.push(p));
    expect(phases).toEqual(["parsing", "uploading"]);
  });

  it("attaches with exactly {name, path, size} and NO generated key when there are no parts", async () => {
    vi.mocked(uploadCourseZipChunked).mockResolvedValue({ path: "storage/path.zip", parts: null });
    vi.mocked(appendCourseExportFileAction).mockResolvedValue({ replacedPaths: [] });
    const file = makeFile("my-export.zip", 2048);

    await importCourseExportFile(supabase, "user-1", file);

    expect(appendCourseExportFileAction).toHaveBeenCalledTimes(1);
    const [, sentFile] = vi.mocked(appendCourseExportFileAction).mock.calls[0];
    expect(sentFile).toEqual({ name: "my-export.zip", path: "storage/path.zip", size: 2048 });
    expect("generated" in sentFile).toBe(false);
    expect("parts" in sentFile).toBe(false);
  });

  it("includes parts (still no generated key) when the upload was chunked", async () => {
    vi.mocked(uploadCourseZipChunked).mockResolvedValue({
      path: "storage/path.zip",
      parts: ["storage/path.zip.part00", "storage/path.zip.part01"],
    });
    vi.mocked(appendCourseExportFileAction).mockResolvedValue({ replacedPaths: [] });

    await importCourseExportFile(supabase, "user-1", makeFile("big.zip", 90 * 1024 * 1024));

    const [, sentFile] = vi.mocked(appendCourseExportFileAction).mock.calls[0];
    expect(sentFile).toMatchObject({
      parts: ["storage/path.zip.part00", "storage/path.zip.part01"],
    });
    expect("generated" in sentFile).toBe(false);
  });

  it("passes userId straight through to uploadCourseZipChunked (AC8a: no nullable user object)", async () => {
    vi.mocked(uploadCourseZipChunked).mockResolvedValue({ path: "p", parts: null });
    vi.mocked(appendCourseExportFileAction).mockResolvedValue({ replacedPaths: [] });
    await importCourseExportFile(supabase, "the-user-id", makeFile());
    expect(uploadCourseZipChunked).toHaveBeenCalledWith(supabase, "the-user-id", "course-1", expect.anything());
  });
});

describe("importCourseExportFile - failure after a row was created names that row (AC7 item 5)", () => {
  beforeEach(() => {
    vi.mocked(parseCartridgeBlob).mockResolvedValue({ title: "T", canvasIdentity: undefined } as never);
    vi.mocked(listCourseHubAction).mockResolvedValue({ courses: [] as never });
    vi.mocked(chooseImportDestination).mockReturnValue({ kind: "create", name: "New Course", canvasUrl: null });
    vi.mocked(createCourseHubAction).mockResolvedValue({
      course: { id: "course-9", name: "New Course" } as never,
    });
  });

  it("when uploadCourseZipChunked itself throws, names the created row and never calls removeCourseZipObjects", async () => {
    vi.mocked(uploadCourseZipChunked).mockRejectedValue(new Error("network down"));
    await expect(importCourseExportFile(supabase, "user-1", makeFile())).rejects.toThrow(
      'Created the course "New Course", but this failed: network down Find "New Course" in the Courses table and try uploading the export again from its LMS Exports cell.'
    );
    expect(removeCourseZipObjects).not.toHaveBeenCalled();
  });

  it("when uploadCourseZipChunked throws a non-Error value, falls back to the generic upload message", async () => {
    vi.mocked(uploadCourseZipChunked).mockRejectedValue("weird");
    await expect(importCourseExportFile(supabase, "user-1", makeFile())).rejects.toThrow(
      'Created the course "New Course", but this failed: Could not upload the export. Find "New Course" in the Courses table and try uploading the export again from its LMS Exports cell.'
    );
  });

  it("when appendCourseExportFileAction returns an error, cleans up storage first, then names the created row", async () => {
    vi.mocked(uploadCourseZipChunked).mockResolvedValue({
      path: "p",
      parts: ["p.part00"],
    });
    vi.mocked(appendCourseExportFileAction).mockResolvedValue({ error: "row write failed" });

    await expect(importCourseExportFile(supabase, "user-1", makeFile())).rejects.toThrow(
      'Created the course "New Course", but this failed: row write failed Find "New Course" in the Courses table and try uploading the export again from its LMS Exports cell.'
    );
    expect(removeCourseZipObjects).toHaveBeenCalledWith(supabase, ["p.part00"]);
  });

  it("cleans up with [path] (not parts) when the upload was not chunked", async () => {
    vi.mocked(uploadCourseZipChunked).mockResolvedValue({ path: "solo.zip", parts: null });
    vi.mocked(appendCourseExportFileAction).mockResolvedValue({ error: "row write failed" });

    await expect(importCourseExportFile(supabase, "user-1", makeFile())).rejects.toThrow();
    expect(removeCourseZipObjects).toHaveBeenCalledWith(supabase, ["solo.zip"]);
  });

  it("a bug found but NOT fixed (per instructions): this function's own thrown outcomeError is never re-caught by its own catch, proven by asserting removeCourseZipObjects (cleanup) runs exactly once even though the surrounding try/catch could in principle re-wrap it", async () => {
    vi.mocked(uploadCourseZipChunked).mockResolvedValue({ path: "p", parts: null });
    vi.mocked(appendCourseExportFileAction).mockResolvedValue({ error: "row write failed" });
    await expect(importCourseExportFile(supabase, "user-1", makeFile())).rejects.toThrow(
      /^Created the course "New Course", but this failed: row write failed Find/
    );
    expect(removeCourseZipObjects).toHaveBeenCalledTimes(1);
  });
});

describe("importCourseExportFile - failure with NO created row leaves the message unwrapped", () => {
  beforeEach(() => {
    vi.mocked(parseCartridgeBlob).mockResolvedValue({ title: "T", canvasIdentity: undefined } as never);
    vi.mocked(listCourseHubAction).mockResolvedValue({
      courses: [{ id: "course-1", name: "Existing Course", canvasUrl: "https://canvas/1" }] as never,
    });
    vi.mocked(chooseImportDestination).mockReturnValue({
      kind: "existing",
      courseId: "course-1",
      stampCanvasUrl: null,
    });
  });

  it("an existing-row upload failure reports the raw message, with no 'Created the course' wrapper", async () => {
    vi.mocked(uploadCourseZipChunked).mockRejectedValue(new Error("network down"));
    await expect(importCourseExportFile(supabase, "user-1", makeFile())).rejects.toThrow("network down");
  });
});
