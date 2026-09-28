// RULING 127 (docs/service-role-predicate-audit.md Finding 2, docs/ruling-127.md):
// before this fix, the four append*File actions below validated NOTHING
// about a caller-supplied `file.path` (or, for the export action,
// `file.parts`) before persisting it onto the caller's own course_hub row.
// That row is later read back through a SERVICE-ROLE signed URL
// (appendCourseExportFileAction's entry, read via
// src/app/api/lms-export/selection/route.ts -> downloadCourseZipBlob, which
// prefers `parts` over `path` whenever `parts` is present - src/lib/course-
// files.ts) and through the workflow zip-run-log-completion delete path
// (src/lib/workflows/zip-run-log-completion.ts) - both bypass the
// "course-files" bucket's RLS entirely, so an unvalidated path/parts value
// let a non-owner register another tenant's object against their own course
// tile and have it read or deleted later.
//
// requireOwner() is mocked directly (the idiom in
// src/app/actions/course-hub-integrations.test.ts, castletop.test.ts, etc.)
// rather than exercised through the full guard chain - this file is testing
// the STORAGE-PATH validation these actions now perform, not the
// owner/non-owner distinction (requireOwner() is `requireUser()` under an
// alias today - see src/lib/supabase/auth.ts - so any active account reaches
// the validation either way).
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase/auth", () => ({
  requireOwner: vi.fn(),
}));

vi.mock("@/lib/supabase/courses", () => ({
  appendCourseMaterialFile: vi.fn(),
  appendCourseCastletopFile: vi.fn(),
  appendCourseMiscFile: vi.fn(),
  appendCourseExportFile: vi.fn(),
}));

import { requireOwner } from "@/lib/supabase/auth";
import {
  appendCourseMaterialFile,
  appendCourseCastletopFile,
  appendCourseMiscFile,
  appendCourseExportFile,
} from "@/lib/supabase/courses";
import {
  appendCourseMaterialFileAction,
  appendCourseCastletopFileAction,
  appendCourseMiscFileAction,
  appendCourseExportFileAction,
} from "./course-hub-core";

const ME = { id: "user-1", email: "me@example.edu", role: "owner" as const, status: "active" as const };
const VICTIM_PATH = "victim-user/course-1/file.zip";
const OWN_PATH = "user-1/course-1/file.zip";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireOwner).mockResolvedValue(ME as never);
});

describe("appendCourseMaterialFileAction: file.path is validated against the caller's own prefix", () => {
  it("REFUSES a victim-prefixed path and never calls appendCourseMaterialFile - RED confirmed by hand against the pre-fix source (it called through and returned a replacedPath)", async () => {
    const result = await appendCourseMaterialFileAction("course-1", { name: "a.zip", path: VICTIM_PATH, size: 10 });
    expect(result).toEqual({ error: "That file's storage path is invalid." });
    expect(appendCourseMaterialFile).not.toHaveBeenCalled();
  });

  it("accepts the caller's own path (positive control)", async () => {
    vi.mocked(appendCourseMaterialFile).mockResolvedValue(null);
    const result = await appendCourseMaterialFileAction("course-1", { name: "a.zip", path: OWN_PATH, size: 10 });
    expect(result).toEqual({ replacedPath: null });
    expect(appendCourseMaterialFile).toHaveBeenCalledWith("user-1", "course-1", expect.objectContaining({ path: OWN_PATH }));
  });
});

describe("appendCourseCastletopFileAction: file.path is validated against the caller's own prefix", () => {
  it("REFUSES a victim-prefixed path and never calls appendCourseCastletopFile", async () => {
    const result = await appendCourseCastletopFileAction("course-1", { name: "a.zip", path: VICTIM_PATH, size: 10 });
    expect(result).toEqual({ error: "That file's storage path is invalid." });
    expect(appendCourseCastletopFile).not.toHaveBeenCalled();
  });

  it("accepts the caller's own path (positive control)", async () => {
    vi.mocked(appendCourseCastletopFile).mockResolvedValue(null);
    const result = await appendCourseCastletopFileAction("course-1", { name: "a.zip", path: OWN_PATH, size: 10 });
    expect(result).toEqual({ replacedPath: null });
  });
});

describe("appendCourseMiscFileAction: file.path is validated against the caller's own prefix", () => {
  it("REFUSES a victim-prefixed path and never calls appendCourseMiscFile", async () => {
    const result = await appendCourseMiscFileAction("course-1", { name: "a.zip", path: VICTIM_PATH, size: 10 });
    expect(result).toEqual({ error: "That file's storage path is invalid." });
    expect(appendCourseMiscFile).not.toHaveBeenCalled();
  });

  it("accepts the caller's own path (positive control)", async () => {
    vi.mocked(appendCourseMiscFile).mockResolvedValue(null);
    const result = await appendCourseMiscFileAction("course-1", { name: "a.zip", path: OWN_PATH, size: 10 });
    expect(result).toEqual({ replacedPath: null });
  });
});

describe("appendCourseExportFileAction: BOTH file.path and every entry of file.parts are validated (Finding 2's own emphasis - downloadCourseZipBlob prefers parts over path)", () => {
  it("REFUSES a victim-prefixed path and never calls appendCourseExportFile", async () => {
    const result = await appendCourseExportFileAction("course-1", { name: "a.zip", path: VICTIM_PATH, size: 10 });
    expect(result).toEqual({ error: "That file's storage path is invalid." });
    expect(appendCourseExportFile).not.toHaveBeenCalled();
  });

  it("REFUSES when path is the caller's own but a `parts` entry is a victim's path - the exact bypass a path-only check would miss", async () => {
    const result = await appendCourseExportFileAction("course-1", {
      name: "a.zip",
      path: OWN_PATH,
      size: 10,
      parts: ["user-1/course-1/file.zip.part00", VICTIM_PATH + ".part01"],
    });
    expect(result).toEqual({ error: "That file's storage path is invalid." });
    expect(appendCourseExportFile).not.toHaveBeenCalled();
  });

  it("accepts the caller's own path with no parts (positive control)", async () => {
    vi.mocked(appendCourseExportFile).mockResolvedValue([]);
    const result = await appendCourseExportFileAction("course-1", { name: "a.zip", path: OWN_PATH, size: 10 });
    expect(result).toEqual({ replacedPaths: [] });
  });

  it("accepts the caller's own path with every part also under the caller's own prefix (positive control)", async () => {
    vi.mocked(appendCourseExportFile).mockResolvedValue([]);
    const result = await appendCourseExportFileAction("course-1", {
      name: "a.zip",
      path: OWN_PATH,
      size: 10,
      parts: ["user-1/course-1/file.zip.part00", "user-1/course-1/file.zip.part01"],
    });
    expect(result).toEqual({ replacedPaths: [] });
    expect(appendCourseExportFile).toHaveBeenCalled();
  });
});
