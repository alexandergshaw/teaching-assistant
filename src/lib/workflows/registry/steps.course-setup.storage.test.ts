// Regression coverage for save-zip-to-course's terminal-bundle behavior
// (docs/REGRESSION.md 155): the step now merges the per-week "files" chain
// with an optional rubricFiles input and a CSV built from an optional
// schedule input into ONE zip, organized into "Week NN/" and "Course-Wide/"
// folders with collision-safe paths, and downloads it in an attended run
// (guarded by `typeof document`) in addition to the pre-existing course-tile
// save. See steps.course-setup.storage.ts's save-zip-to-course for the
// implementation this exercises.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/app/actions", () => ({
  setCourseCsvAction: vi.fn(),
  listCourseHubAction: vi.fn(),
}));

// JSZip cannot read a native Node Blob back out of a real zip in this
// suite's node test environment (no jsdom/FileReader shim) - see
// registry-helpers.assembleLectureFiles.test.ts's comment on the same
// limitation. save-zip-to-course's interesting logic (the Week NN /
// Course-Wide folder layout and the collision-suffix dedup) happens entirely
// BEFORE the zip.file() call, so a lightweight fake that just records the
// (path, blob) pairs it was given - instead of producing real zip bytes -
// exercises that logic exactly as thoroughly as a real JSZip would, without
// the environment limitation.
const recordedFiles: Array<{ path: string; blob: Blob }> = [];
vi.mock("jszip", () => {
  class FakeJSZip {
    file(path: string, blob: Blob) {
      recordedFiles.push({ path, blob });
    }
    async generateAsync() {
      return new Blob(["fake-zip-bytes"], { type: "application/zip" });
    }
  }
  return { default: FakeJSZip };
});

import { listCourseHubAction } from "@/app/actions";
import { courseSetupStorageSteps } from "./steps.course-setup.storage";
import type { StepRunHelpers } from "../registry-helpers";
import type { GeneratedCourseFile } from "../types";
import type { ScheduleWeekPlan } from "@/app/actions";

const saveZipToCourse = courseSetupStorageSteps.find((s) => s.type === "save-zip-to-course")!;

function testHelpers(overrides: Partial<StepRunHelpers> = {}): StepRunHelpers {
  return {
    activeInstitution: null,
    provider: "gemini",
    author: "Test Author",
    saveBundle: null,
    saveCourseMaterialFile: null,
    saveCourseCastletopFile: null,
    saveCourseExportFile: null,
    loadCommonResources: null,
    getLibraryFile: null,
    getInstitutionFields: null,
    loadCourseExport: null,
    loadCourseMaterials: null,
    ...overrides,
  };
}

const noProgress = () => {};

function weekFile(
  name: string,
  weekNumber: number,
  overrides: Partial<GeneratedCourseFile> = {}
): GeneratedCourseFile {
  return {
    name,
    blob: new Blob([`content of ${name}`], { type: "text/plain" }),
    mimeType: "text/plain",
    weekNumber,
    sortOrder: 1,
    role: "slides",
    ...overrides,
  };
}

// Stubs a minimal browser `document` + `URL.createObjectURL/revokeObjectURL`
// so `typeof document !== "undefined"` is true and the download branch's two
// calls succeed. The suite's default environment has no `document` global at
// all (the headless/unattended case), so only the attended-path tests below
// call this.
function stubDom() {
  const click = vi.fn();
  const appendChild = vi.fn();
  const removeChild = vi.fn();
  const createElement = vi.fn(() => ({ href: "", download: "", click }));
  const createObjectURL = vi.fn(() => "blob:mock-url");
  const revokeObjectURL = vi.fn();
  vi.stubGlobal("document", { createElement, body: { appendChild, removeChild } });
  vi.stubGlobal("URL", { createObjectURL, revokeObjectURL });
  return { click, appendChild, removeChild, createElement, createObjectURL, revokeObjectURL };
}

describe("save-zip-to-course - terminal bundle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    recordedFiles.length = 0;
    vi.mocked(listCourseHubAction).mockResolvedValue({
      courses: [{ id: "course-1", courseCode: "CS-101", name: "Intro to CS" }] as never,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("skips with no save when files, rubricFiles, and schedule are all empty", async () => {
    const saveCourseMaterialFile = vi.fn();
    const result = await saveZipToCourse.run(
      { hubCourse: "course-1", files: [] },
      testHelpers({ saveCourseMaterialFile }),
      noProgress
    );

    expect(result.summary).toEqual({ kind: "text", text: "Skipped - no generated files to bundle." });
    expect(saveCourseMaterialFile).not.toHaveBeenCalled();
    expect(recordedFiles).toHaveLength(0);
  });

  it("bundles per-week files into Week NN folders and rubric/CSV into Course-Wide", async () => {
    const saveCourseMaterialFile = vi.fn().mockResolvedValue(undefined);
    const files: GeneratedCourseFile[] = [
      weekFile("Lecture Slides - Week 1.pptx", 1),
      weekFile("Assignment Instructions - Week 1.docx", 1, { role: "instructions", sortOrder: 2 }),
      weekFile("Lecture Slides - Week 2.pptx", 2),
    ];
    const rubricFiles: GeneratedCourseFile[] = [
      weekFile("Grading Rubric.docx", 0, { role: "instructions", sortOrder: 0 }),
    ];
    const schedule: ScheduleWeekPlan[] = [
      { week: 1, topic: "Intro", summary: "", assignmentTitle: null, assignmentSlug: null, testName: null },
      { week: 2, topic: "Loops", summary: "", assignmentTitle: null, assignmentSlug: null, testName: null },
    ];

    const result = await saveZipToCourse.run(
      { hubCourse: "course-1", files, rubricFiles, schedule },
      testHelpers({ saveCourseMaterialFile }),
      noProgress
    );

    expect(saveCourseMaterialFile).toHaveBeenCalledTimes(1);
    const [courseId, , fileName] = saveCourseMaterialFile.mock.calls[0];
    expect(courseId).toBe("course-1");
    expect(fileName).toMatch(/\.zip$/);

    const paths = recordedFiles.map((f) => f.path).sort();
    expect(paths).toContain("Week 01/Lecture Slides - Week 1.pptx");
    expect(paths).toContain("Week 01/Assignment Instructions - Week 1.docx");
    expect(paths).toContain("Week 02/Lecture Slides - Week 2.pptx");
    expect(paths).toContain("Course-Wide/Grading Rubric.docx");
    expect(paths.some((p) => p.startsWith("Course-Wide/") && p.includes("Course Schedule") && p.endsWith(".csv"))).toBe(true);
    expect(paths.length).toBe(5);

    expect(result.summary.kind).toBe("text");
    if (result.summary.kind === "text") {
      expect(result.summary.text).toContain("5 file(s)");
    }
  });

  it("de-duplicates two files that land on the identical zip path", async () => {
    const saveCourseMaterialFile = vi.fn().mockResolvedValue(undefined);
    // Same name AND same week - a real (if rare) collision, e.g. two
    // differently-sourced files that happened to render an identical name.
    const files: GeneratedCourseFile[] = [
      weekFile("Lecture Slides - Week 1.pptx", 1, { blob: new Blob(["first"]) }),
      weekFile("Lecture Slides - Week 1.pptx", 1, { blob: new Blob(["second"]) }),
    ];

    const result = await saveZipToCourse.run(
      { hubCourse: "course-1", files },
      testHelpers({ saveCourseMaterialFile }),
      noProgress
    );

    const paths = recordedFiles.map((f) => f.path).sort();
    expect(paths).toEqual(
      ["Week 01/Lecture Slides - Week 1 (2).pptx", "Week 01/Lecture Slides - Week 1.pptx"].sort()
    );

    // Both distinct contents survived under their own path - neither was
    // silently overwritten before reaching the zip.
    const byPath = new Map(recordedFiles.map((f) => [f.path, f.blob]));
    const first = await byPath.get("Week 01/Lecture Slides - Week 1.pptx")!.text();
    const second = await byPath.get("Week 01/Lecture Slides - Week 1 (2).pptx")!.text();
    expect(new Set([first, second])).toEqual(new Set(["first", "second"]));

    expect(result.summary.kind).toBe("text");
    if (result.summary.kind === "text") {
      expect(result.summary.text).toContain("2 file(s)");
    }
  });

  it("three-way collision gets (2) and (3) suffixes in order", async () => {
    const saveCourseMaterialFile = vi.fn().mockResolvedValue(undefined);
    const files: GeneratedCourseFile[] = [
      weekFile("Same Name.docx", 1),
      weekFile("Same Name.docx", 1),
      weekFile("Same Name.docx", 1),
    ];

    await saveZipToCourse.run(
      { hubCourse: "course-1", files },
      testHelpers({ saveCourseMaterialFile }),
      noProgress
    );

    const paths = recordedFiles.map((f) => f.path).sort();
    expect(paths).toEqual(
      [
        "Week 01/Same Name (2).docx",
        "Week 01/Same Name (3).docx",
        "Week 01/Same Name.docx",
      ].sort()
    );
  });

  it("downloads the zip when a document is present (attended run)", async () => {
    const dom = stubDom();
    const saveCourseMaterialFile = vi.fn().mockResolvedValue(undefined);

    const result = await saveZipToCourse.run(
      { hubCourse: "course-1", files: [weekFile("Slides.pptx", 1)] },
      testHelpers({ saveCourseMaterialFile }),
      noProgress
    );

    expect(dom.createObjectURL).toHaveBeenCalledTimes(1);
    expect(dom.click).toHaveBeenCalledTimes(1);
    expect(dom.revokeObjectURL).toHaveBeenCalledTimes(1);
    expect(saveCourseMaterialFile).toHaveBeenCalledTimes(1);
    expect(result.summary.kind).toBe("text");
    if (result.summary.kind === "text") {
      expect(result.summary.text).toContain("Downloaded");
    }
  });

  it("skips the download but still saves to the course tile when no document is present (unattended run)", async () => {
    // No stubDom() call: this suite's default environment has no `document`
    // global, exactly matching a headless/server run.
    const saveCourseMaterialFile = vi.fn().mockResolvedValue(undefined);

    const result = await saveZipToCourse.run(
      { hubCourse: "course-1", files: [weekFile("Slides.pptx", 1)] },
      testHelpers({ saveCourseMaterialFile }),
      noProgress
    );

    expect(saveCourseMaterialFile).toHaveBeenCalledTimes(1);
    expect(result.summary.kind).toBe("text");
    if (result.summary.kind === "text") {
      expect(result.summary.text).toContain("Saved");
    }
  });

  it("throws when there are files to bundle but no saveCourseMaterialFile helper (sign-in required)", async () => {
    await expect(
      saveZipToCourse.run(
        { hubCourse: "course-1", files: [weekFile("Slides.pptx", 1)] },
        testHelpers({ saveCourseMaterialFile: null }),
        noProgress
      )
    ).rejects.toThrow("Sign in to save course materials.");
  });

  it("bundles when only rubricFiles are present (no per-week files, no schedule)", async () => {
    const saveCourseMaterialFile = vi.fn().mockResolvedValue(undefined);
    const rubricFiles: GeneratedCourseFile[] = [
      weekFile("Grading Rubric.docx", 0, { role: "instructions", sortOrder: 0 }),
    ];

    const result = await saveZipToCourse.run(
      { hubCourse: "course-1", files: [], rubricFiles },
      testHelpers({ saveCourseMaterialFile }),
      noProgress
    );

    expect(saveCourseMaterialFile).toHaveBeenCalledTimes(1);
    const paths = recordedFiles.map((f) => f.path);
    expect(paths).toEqual(["Course-Wide/Grading Rubric.docx"]);
    expect(result.summary.kind).toBe("text");
    if (result.summary.kind === "text") {
      expect(result.summary.text).toContain("1 file(s)");
    }
  });
});
