import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/app/actions", () => ({
  listCourseHubAction: vi.fn(),
  saveLibraryFileAction: vi.fn(),
}));

vi.mock("@/app/actions/castletop", () => ({
  generateCastletopWorkbookAction: vi.fn(),
}));

import {
  listCourseHubAction,
  saveLibraryFileAction,
} from "@/app/actions";
import { generateCastletopWorkbookAction } from "@/app/actions/castletop";
import { getStepDefinition } from "./registry";
import type { StepRunHelpers } from "./registry-helpers";
import type { Course } from "@/lib/supabase/courses";

const step = getStepDefinition("castletop-workbook")!;

function testHelpers(): StepRunHelpers {
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
    workflowId: "workflow-1",
    workflowName: "Test Workflow",
    workflowRunId: "run-1",
  };
}

function baseCourse(overrides: Partial<Course> = {}): Course {
  return {
    id: "course-1",
    name: "CS 101",
    courseCode: null,
    term: null,
    canvasUrl: null,
    repos: [],
    githubOrg: null,
    textbook: null,
    syllabusId: null,
    institution: null,
    integrations: [],
    roster: null,
    notes: null,
    topics: null,
    csvName: null,
    csvData: null,
    rubricName: null,
    rubricData: null,
    startDate: null,
    description: null,
    weeks: null,
    tests: null,
    lms: null,
    dayTime: null,
    modality: null,
    topicOutline: null,
    materialsFiles: [],
    castletopFiles: [],
    exportFiles: [],
    materialsZipName: null,
    materialsZipPath: null,
    materialsZipSize: null,
    customTiles: [],
    hiddenTiles: [],
    studentRepos: [],
    updatedAt: "2024-09-01T00:00:00Z",
    ...overrides,
  };
}

describe("castletop-workbook step", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("AC1: blank hubCourse throws 'Choose a course tile.'", async () => {
    await expect(
      step.run({ hubCourse: "" }, testHelpers(), () => {})
    ).rejects.toThrow("Choose a course tile.");
    expect(listCourseHubAction).not.toHaveBeenCalled();
  });

  it("AC2: listCourseHubAction returning error throws that error", async () => {
    vi.mocked(listCourseHubAction).mockResolvedValue({
      error: "List failed",
    });

    await expect(
      step.run({ hubCourse: "course-1" }, testHelpers(), () => {})
    ).rejects.toThrow("List failed");
  });

  it("AC3: tile id not present throws 'Course tile not found.'", async () => {
    vi.mocked(listCourseHubAction).mockResolvedValue({
      courses: [baseCourse({ id: "different-course" })],
    });

    await expect(
      step.run({ hubCourse: "course-1" }, testHelpers(), () => {})
    ).rejects.toThrow("Course tile not found.");
  });

  it("AC4: generateCastletopWorkbookAction returning error is thrown", async () => {
    const tile = baseCourse({ id: "course-1" });
    vi.mocked(listCourseHubAction).mockResolvedValue({ courses: [tile] });
    vi.mocked(generateCastletopWorkbookAction).mockResolvedValue({
      error: "Generation failed",
    });

    await expect(
      step.run({ hubCourse: "course-1" }, testHelpers(), () => {})
    ).rejects.toThrow("Generation failed");
  });

  it("AC5: happy path calls generateCastletopWorkbookAction once with tile id and config object", async () => {
    const tile = baseCourse({ id: "course-1", weeks: 15 });
    vi.mocked(listCourseHubAction).mockResolvedValue({ courses: [tile] });
    vi.mocked(generateCastletopWorkbookAction).mockResolvedValue({
      base64: "dGVzdCBkYXRh",
      fileName: "workbook.xlsx",
      notes: [],
      weeks: 15,
    });
    vi.mocked(saveLibraryFileAction).mockResolvedValue({ id: "lib-1" });

    const result = await step.run(
      { hubCourse: "course-1" },
      testHelpers(),
      () => {}
    );

    expect(generateCastletopWorkbookAction).toHaveBeenCalledTimes(1);
    const callArgs = vi.mocked(generateCastletopWorkbookAction).mock.calls[0];
    expect(callArgs[0]).toBe("course-1");
    expect(callArgs[1]).toEqual({
      instructor: null,
      contactMinutes: undefined,
      readingRate: undefined,
      pagesPerChapter: undefined,
      classSessionMinutes: undefined,
    });
    expect(result.outputs.fileName).toBe("workbook.xlsx");
    expect(result.outputs.weeks).toBe(15);
  });

  it("AC6: saveLibraryFileAction returning error adds it to summary items but step succeeds", async () => {
    const tile = baseCourse({ id: "course-1" });
    vi.mocked(listCourseHubAction).mockResolvedValue({ courses: [tile] });
    vi.mocked(generateCastletopWorkbookAction).mockResolvedValue({
      base64: "dGVzdCBkYXRh",
      fileName: "workbook.xlsx",
      notes: [],
      weeks: 16,
    });
    vi.mocked(saveLibraryFileAction).mockResolvedValue({
      error: "Library save failed",
    });

    const result = await step.run(
      { hubCourse: "course-1" },
      testHelpers(),
      () => {}
    );

    expect(result.summary.kind).toBe("list");
    if (result.summary.kind === "list") {
      expect(result.summary.items.some((i) => i.includes("library save skipped"))).toBe(true);
    }
  });

  it("AC7: helpers.saveCourseCastletopFile is null adds note and step succeeds", async () => {
    const tile = baseCourse({ id: "course-1" });
    const helpers = testHelpers();
    helpers.saveCourseCastletopFile = null;

    vi.mocked(listCourseHubAction).mockResolvedValue({ courses: [tile] });
    vi.mocked(generateCastletopWorkbookAction).mockResolvedValue({
      base64: "dGVzdCBkYXRh",
      fileName: "workbook.xlsx",
      notes: [],
      weeks: 16,
    });
    vi.mocked(saveLibraryFileAction).mockResolvedValue({ id: "lib-1" });

    const result = await step.run(
      { hubCourse: "course-1" },
      helpers,
      () => {}
    );

    expect(result.summary.kind).toBe("list");
    if (result.summary.kind === "list") {
      expect(result.summary.items.some((i) => i.includes("course-tile save skipped"))).toBe(true);
    }
  });

  it("AC8: helpers.saveCourseCastletopFile is called once with (tileId, Blob, fileName)", async () => {
    const tile = baseCourse({ id: "course-1" });
    const castletopSave = vi.fn();
    const helpers = testHelpers();
    helpers.saveCourseCastletopFile = castletopSave;

    vi.mocked(listCourseHubAction).mockResolvedValue({ courses: [tile] });
    vi.mocked(generateCastletopWorkbookAction).mockResolvedValue({
      base64: "dGVzdCBkYXRh",
      fileName: "workbook.xlsx",
      notes: [],
      weeks: 16,
    });
    vi.mocked(saveLibraryFileAction).mockResolvedValue({ id: "lib-1" });

    await step.run(
      { hubCourse: "course-1" },
      helpers,
      () => {}
    );

    expect(castletopSave).toHaveBeenCalledTimes(1);
    const args = castletopSave.mock.calls[0];
    expect(args[0]).toBe("course-1");
    expect(args[1] instanceof Blob).toBe(true);
    expect(args[2]).toBe("workbook.xlsx");
  });

  it("AC9: action's notes appear in the summary items", async () => {
    const tile = baseCourse({ id: "course-1" });
    vi.mocked(listCourseHubAction).mockResolvedValue({ courses: [tile] });
    vi.mocked(generateCastletopWorkbookAction).mockResolvedValue({
      base64: "dGVzdCBkYXRh",
      fileName: "workbook.xlsx",
      notes: ["Note 1", "Note 2"],
      weeks: 16,
    });
    vi.mocked(saveLibraryFileAction).mockResolvedValue({ id: "lib-1" });

    const result = await step.run(
      { hubCourse: "course-1" },
      testHelpers(),
      () => {}
    );

    expect(result.summary.kind).toBe("list");
    if (result.summary.kind === "list") {
      expect(result.summary.items).toContain("Note 1");
      expect(result.summary.items).toContain("Note 2");
    }
  });

  it("AC10: numeric inputs blank/non-finite become undefined (not NaN) in config", async () => {
    const tile = baseCourse({ id: "course-1" });
    vi.mocked(listCourseHubAction).mockResolvedValue({ courses: [tile] });
    vi.mocked(generateCastletopWorkbookAction).mockResolvedValue({
      base64: "dGVzdCBkYXRh",
      fileName: "workbook.xlsx",
      notes: [],
      weeks: 16,
    });
    vi.mocked(saveLibraryFileAction).mockResolvedValue({ id: "lib-1" });

    await step.run(
      {
        hubCourse: "course-1",
        instructor: "Dr. Smith",
        contactMinutes: "",
        readingRate: "19",
        pagesPerChapter: "invalid",
        classSessionMinutes: "120",
      },
      testHelpers(),
      () => {}
    );

    expect(generateCastletopWorkbookAction).toHaveBeenCalledTimes(1);
    const callArgs = vi.mocked(generateCastletopWorkbookAction).mock.calls[0];
    expect(callArgs[1]).toEqual({
      instructor: "Dr. Smith",
      contactMinutes: undefined,
      readingRate: 19,
      pagesPerChapter: undefined,
      classSessionMinutes: 120,
    });
  });

  it("Regression: step reports action's weeks, not recalculated value", async () => {
    const tile = baseCourse({ id: "course-1", weeks: null });
    vi.mocked(listCourseHubAction).mockResolvedValue({ courses: [tile] });
    vi.mocked(generateCastletopWorkbookAction).mockResolvedValue({
      base64: "dGVzdCBkYXRh",
      fileName: "workbook.xlsx",
      notes: [],
      weeks: 5,
    });
    vi.mocked(saveLibraryFileAction).mockResolvedValue({ id: "lib-1" });

    const result = await step.run(
      { hubCourse: "course-1" },
      testHelpers(),
      () => {}
    );

    expect(result.outputs.weeks).toBe(5);
  });
});
