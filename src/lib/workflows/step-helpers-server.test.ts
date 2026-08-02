// Regression coverage for buildServerMaterialLoaders's loadCourseExport/
// loadCourseMaterials closures (defect-1 write-up, AC1/AC2): a real Course
// Build run (556b49f0) failed the tile-export source with the bare message
// "Failed to fetch" - a raw browser/network rejection with zero context
// about what it was trying to fetch. This exercises the SERVER-side half of
// the fix (the attended counterpart, WorkflowsTab.tsx's loadCourseExportData,
// wraps the identical way but lives in a "use client" component this suite's
// node environment cannot import - see that file's own comment for why both
// are kept in sync by hand instead).

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/app/actions", () => ({
  listCourseHubAction: vi.fn(),
}));

vi.mock("@/lib/course-files", () => ({
  downloadCourseZipBlob: vi.fn(),
}));

vi.mock("@/lib/cartridge-import", () => ({
  parseCartridgeBlob: vi.fn(),
}));

import { listCourseHubAction } from "@/app/actions";
import { downloadCourseZipBlob } from "@/lib/course-files";
import { parseCartridgeBlob } from "@/lib/cartridge-import";
import { buildServerMaterialLoaders } from "./step-helpers-server";

// The real function's `supabase` parameter is only ever forwarded, unread,
// straight into downloadCourseZipBlob (mocked above) - a fake object is
// enough to satisfy the type and prove nothing else touches it.
const fakeSupabase = {} as Parameters<typeof buildServerMaterialLoaders>[0];

const exportFile = { name: "export.imscc", path: "u1/c1/abc.zip", size: 100, addedAt: "2026-01-01T00:00:00Z" };

function courseRow(overrides: Partial<{ id: string; name: string; exportFiles: typeof exportFile[] }> = {}) {
  return {
    id: overrides.id ?? "course-1",
    name: overrides.name ?? "Biology 101",
    exportFiles: overrides.exportFiles ?? [exportFile],
    materialsFiles: [],
    materialsZipPath: null,
    materialsZipName: null,
  } as never;
}

describe("buildServerMaterialLoaders - loadCourseExport", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the parsed export when the download and parse both succeed", async () => {
    const blob = new Blob(["zip-bytes"]);
    vi.mocked(listCourseHubAction).mockResolvedValue({ courses: [courseRow()] });
    vi.mocked(downloadCourseZipBlob).mockResolvedValue(blob);
    vi.mocked(parseCartridgeBlob).mockResolvedValue({
      title: "Biology 101",
      courseCode: null,
      startAt: null,
      syllabusHtml: null,
      modules: [],
      rubrics: [],
      hasCourseSettings: true,
    });

    const { loadCourseExport } = buildServerMaterialLoaders(fakeSupabase);
    const result = await loadCourseExport!("course-1");

    expect(result?.title).toBe("Biology 101");
    expect(downloadCourseZipBlob).toHaveBeenCalledWith(fakeSupabase, exportFile);
  });

  it("returns null (not an error) when the tile has no export files - a normal, expected outcome", async () => {
    vi.mocked(listCourseHubAction).mockResolvedValue({ courses: [courseRow({ exportFiles: [] })] });

    const { loadCourseExport } = buildServerMaterialLoaders(fakeSupabase);
    expect(await loadCourseExport!("course-1")).toBeNull();
    expect(downloadCourseZipBlob).not.toHaveBeenCalled();
  });

  it("returns null when the course id does not match any tile", async () => {
    vi.mocked(listCourseHubAction).mockResolvedValue({ courses: [courseRow({ id: "other-course" })] });

    const { loadCourseExport } = buildServerMaterialLoaders(fakeSupabase);
    expect(await loadCourseExport!("course-1")).toBeNull();
  });

  // AC1/AC2 (defect-1 write-up): the actual real-run failure. downloadCourseZipBlob
  // rejecting with the browser's own bare "Failed to fetch" must not reach
  // the caller unchanged - it must be wrapped to name the course tile and
  // the export file it was trying to read, with the underlying error still
  // included verbatim.
  it("wraps a downloadCourseZipBlob failure with the tile name, the export file name, and the underlying error", async () => {
    vi.mocked(listCourseHubAction).mockResolvedValue({ courses: [courseRow({ name: "Biology 101" })] });
    vi.mocked(downloadCourseZipBlob).mockRejectedValue(new Error("Failed to fetch"));

    const { loadCourseExport } = buildServerMaterialLoaders(fakeSupabase);

    await expect(loadCourseExport!("course-1")).rejects.toThrow(
      'Could not read "Biology 101"\'s LMS export "export.imscc": Failed to fetch'
    );
  });

  it("wraps a parseCartridgeBlob failure the same way (a genuine parse error, not just a download failure)", async () => {
    vi.mocked(listCourseHubAction).mockResolvedValue({ courses: [courseRow({ name: "Biology 101" })] });
    vi.mocked(downloadCourseZipBlob).mockResolvedValue(new Blob(["not a zip"]));
    vi.mocked(parseCartridgeBlob).mockRejectedValue(new Error("End of central directory not found"));

    const { loadCourseExport } = buildServerMaterialLoaders(fakeSupabase);

    await expect(loadCourseExport!("course-1")).rejects.toThrow(
      'Could not read "Biology 101"\'s LMS export "export.imscc": End of central directory not found'
    );
  });

  it("wraps a non-Error throw (e.g. a rejected string) by stringifying it, rather than losing it", async () => {
    vi.mocked(listCourseHubAction).mockResolvedValue({ courses: [courseRow({ name: "Biology 101" })] });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- deliberately not an Error, to exercise the String(err) fallback.
    vi.mocked(downloadCourseZipBlob).mockRejectedValue("network offline" as any);

    const { loadCourseExport } = buildServerMaterialLoaders(fakeSupabase);

    await expect(loadCourseExport!("course-1")).rejects.toThrow(
      'Could not read "Biology 101"\'s LMS export "export.imscc": network offline'
    );
  });

  it("picks the NEWEST export file by addedAt when a tile has more than one on file", async () => {
    const older = { name: "old.imscc", path: "u1/c1/old.zip", size: 10, addedAt: "2025-01-01T00:00:00Z" };
    const newer = { name: "new.imscc", path: "u1/c1/new.zip", size: 20, addedAt: "2026-01-01T00:00:00Z" };
    vi.mocked(listCourseHubAction).mockResolvedValue({
      courses: [courseRow({ exportFiles: [older, newer] })],
    });
    vi.mocked(downloadCourseZipBlob).mockRejectedValue(new Error("boom"));

    const { loadCourseExport } = buildServerMaterialLoaders(fakeSupabase);

    await expect(loadCourseExport!("course-1")).rejects.toThrow(/"new\.imscc"/);
    expect(downloadCourseZipBlob).toHaveBeenCalledWith(fakeSupabase, newer);
  });

  it("propagates listCourseHubAction's own error unchanged (no course list to read at all)", async () => {
    vi.mocked(listCourseHubAction).mockResolvedValue({ error: "not signed in" });

    const { loadCourseExport } = buildServerMaterialLoaders(fakeSupabase);
    await expect(loadCourseExport!("course-1")).rejects.toThrow("not signed in");
  });
});
