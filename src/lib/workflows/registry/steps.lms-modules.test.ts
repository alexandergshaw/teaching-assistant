// Regression coverage for the Canvas-only LMS-target guard on lms-wipe,
// lms-modules, and lms-populate (see lms-target-guard.ts): a Blackboard (or
// any non-Canvas) course tile must get a clean, explanatory no-op instead of
// the Canvas-only server actions throwing "Could not read a course from that
// URL" (canvas-core.ts's resolveCourse, fed a non-Canvas course URL) - and a
// Canvas tile (or a run with no course tile bound at all) must behave
// exactly as it did before this guard existed.

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/app/actions", () => ({
  listCourseHubAction: vi.fn(),
  listCourseContentAction: vi.fn(),
  createModuleAction: vi.fn(),
  requestFileUploadAction: vi.fn(),
  createModuleItemAction: vi.fn(),
  deleteModuleAction: vi.fn(),
  createPageAction: vi.fn(),
}));

import {
  listCourseHubAction,
  listCourseContentAction,
  createModuleAction,
  deleteModuleAction,
} from "@/app/actions";
import { lmsModuleSteps } from "./steps.lms-modules";
import type { StepRunHelpers } from "@/lib/workflows/registry-helpers";
import type { Course } from "@/lib/supabase/courses";
import type { EnsuredModule } from "@/lib/workflows/types";
import type { CanvasModule } from "@/lib/canvas-modules/types";
import { emptyCourseProject } from "@/lib/course-project";

function canvasModule(overrides: Partial<CanvasModule> = {}): CanvasModule {
  return {
    id: 1,
    name: "Old Module",
    position: 1,
    published: true,
    itemsCount: 0,
    items: [],
    ...overrides,
  };
}

const lmsModules = lmsModuleSteps.find((s) => s.type === "lms-modules")!;
const lmsWipe = lmsModuleSteps.find((s) => s.type === "lms-wipe")!;
const lmsPopulate = lmsModuleSteps.find((s) => s.type === "lms-populate")!;

function baseCourse(overrides: Partial<Course> = {}): Course {
  return {
    id: "course-1",
    name: "System Administration",
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
    syllabusTemplateId: null,
    endDate: null,
    breaks: null,
    assignmentDueRule: null,
    email: null,
    emailClient: null,
    classLengthMinutes: null,
    courseProject: emptyCourseProject(),
    materialsFiles: [],
    castletopFiles: [],
    miscFiles: [],
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

// The real Blackboard Ultra course URL from the run this fix was written
// against (run 756544e0-f94b-4172-9a19-ecc8967e4a25) - not a Canvas-shaped
// URL, so listCourseContentAction/resolveCourse would throw if this guard
// did not short-circuit first.
const BLACKBOARD_URL = "https://wncc.blackboard.com/ultra/courses/_33114_1/outline";
const CANVAS_URL = "https://canvas.example.edu/courses/1";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("lms-wipe: Canvas-only LMS-target guard", () => {
  it("returns a clean, explanatory no-op for a Blackboard course, without calling any Canvas action", async () => {
    vi.mocked(listCourseHubAction).mockResolvedValue({
      courses: [baseCourse({ id: "tile-1", lms: "blackboard" })],
    });

    const result = await lmsWipe.run(
      { course: BLACKBOARD_URL, hubCourse: "tile-1" },
      testHelpers(),
      () => {}
    );

    expect(listCourseContentAction).not.toHaveBeenCalled();
    expect(deleteModuleAction).not.toHaveBeenCalled();
    expect(result.summary).toEqual({
      kind: "text",
      text: "Skipped - this course is on Blackboard; this step targets Canvas.",
    });
    expect(result.outputs).toEqual({});
  });

  it("is unaffected on a Canvas course tile - proceeds exactly as before this guard existed", async () => {
    vi.mocked(listCourseHubAction).mockResolvedValue({
      courses: [baseCourse({ id: "tile-1", lms: "canvas" })],
    });
    vi.mocked(listCourseContentAction).mockResolvedValue({
      courseName: "Test Course",
      modules: [canvasModule({ id: 1, name: "Old Module" })],
      pages: [],
    });
    vi.mocked(deleteModuleAction).mockResolvedValue({ ok: true });

    const result = await lmsWipe.run(
      { course: CANVAS_URL, hubCourse: "tile-1" },
      testHelpers(),
      () => {}
    );

    expect(listCourseContentAction).toHaveBeenCalledTimes(1);
    expect(deleteModuleAction).toHaveBeenCalledTimes(1);
    expect(result.summary).toEqual({ kind: "text", text: "Deleted 1 module(s)." });
  });

  it("is unaffected when no course tile is bound at all (hubCourse unset) - byte-identical to pre-guard behavior", async () => {
    vi.mocked(listCourseContentAction).mockResolvedValue({ courseName: "Test Course", modules: [], pages: [] });

    const result = await lmsWipe.run({ course: CANVAS_URL }, testHelpers(), () => {});

    expect(listCourseHubAction).not.toHaveBeenCalled();
    expect(listCourseContentAction).toHaveBeenCalledTimes(1);
    expect(result.summary).toEqual({ kind: "text", text: "Deleted 0 module(s)." });
  });
});

describe("lms-modules: Canvas-only LMS-target guard", () => {
  it("returns a clean, explanatory no-op for a Blackboard course, with a defined (non-undefined) empty modules output", async () => {
    vi.mocked(listCourseHubAction).mockResolvedValue({
      courses: [baseCourse({ id: "tile-1", lms: "blackboard" })],
    });

    const result = await lmsModules.run(
      { course: BLACKBOARD_URL, weeks: "8", hubCourse: "tile-1" },
      testHelpers(),
      () => {}
    );

    expect(listCourseContentAction).not.toHaveBeenCalled();
    expect(createModuleAction).not.toHaveBeenCalled();
    expect(result.summary).toEqual({
      kind: "text",
      text: "Skipped - this course is on Blackboard; this step targets Canvas.",
    });
    // A DEFINED empty array, not undefined - this is what keeps a dependent
    // step bound to this output from throwing "Missing output from step N".
    expect(result.outputs).toEqual({ modules: [] });
    expect(Array.isArray(result.outputs.modules)).toBe(true);
  });

  it("is unaffected on a Canvas course tile - proceeds exactly as before this guard existed", async () => {
    vi.mocked(listCourseHubAction).mockResolvedValue({
      courses: [baseCourse({ id: "tile-1", lms: "canvas" })],
    });
    vi.mocked(listCourseContentAction).mockResolvedValue({ courseName: "Test Course", modules: [], pages: [] });
    vi.mocked(createModuleAction).mockResolvedValue({
      module: canvasModule({ id: 10, name: "Module 01" }),
    });

    const result = await lmsModules.run(
      { course: CANVAS_URL, weeks: "1", hubCourse: "tile-1" },
      testHelpers(),
      () => {}
    );

    expect(createModuleAction).toHaveBeenCalledTimes(1);
    expect(result.outputs).toEqual({ modules: [{ week: 1, id: 10, name: "Module 01" }] });
  });

  it("is unaffected when no course tile is bound at all - byte-identical to pre-guard behavior", async () => {
    vi.mocked(listCourseContentAction).mockResolvedValue({ courseName: "Test Course", modules: [], pages: [] });
    vi.mocked(createModuleAction).mockResolvedValue({
      module: canvasModule({ id: 10, name: "Module 01" }),
    });

    const result = await lmsModules.run({ course: CANVAS_URL, weeks: "1" }, testHelpers(), () => {});

    expect(listCourseHubAction).not.toHaveBeenCalled();
    expect(createModuleAction).toHaveBeenCalledTimes(1);
    expect(result.outputs).toEqual({ modules: [{ week: 1, id: 10, name: "Module 01" }] });
  });

  it("also skips cleanly for an unrecognized non-Canvas LMS value (e.g. brightspace)", async () => {
    vi.mocked(listCourseHubAction).mockResolvedValue({
      courses: [baseCourse({ id: "tile-1", lms: "brightspace" })],
    });

    const result = await lmsModules.run(
      { course: "https://school.brightspace.com/d2l/home/123", weeks: "8", hubCourse: "tile-1" },
      testHelpers(),
      () => {}
    );

    expect(listCourseContentAction).not.toHaveBeenCalled();
    expect(result.summary).toEqual({
      kind: "text",
      text: "Skipped - this course is on Brightspace; this step targets Canvas.",
    });
  });
});

describe("lms-populate: Canvas-only LMS-target guard, and dependents of lms-modules", () => {
  const MODULES: EnsuredModule[] = [{ week: 1, id: 10, name: "Module 01" }];

  it("returns a clean, explanatory no-op for a Blackboard course (checked independently of lms-modules' own skip)", async () => {
    vi.mocked(listCourseHubAction).mockResolvedValue({
      courses: [baseCourse({ id: "tile-1", lms: "blackboard" })],
    });

    const result = await lmsPopulate.run(
      { course: BLACKBOARD_URL, modules: MODULES, files: [], hubCourse: "tile-1" },
      testHelpers(),
      () => {}
    );

    expect(result.summary).toEqual({
      kind: "text",
      text: "Skipped - this course is on Blackboard; this step targets Canvas.",
    });
  });

  // Simulates the real cascade this fix targets: lms-modules on a Blackboard
  // course now returns { modules: [] } (a real run outcome, not a mock) -
  // feed that straight into lms-populate the way a bound "modules" output
  // would, and confirm it degrades to its OWN pre-existing empty-modules
  // skip instead of throwing.
  it("a Blackboard lms-modules' empty `modules` output flows into lms-populate without either step throwing", async () => {
    vi.mocked(listCourseHubAction).mockResolvedValue({
      courses: [baseCourse({ id: "tile-1", lms: "blackboard" })],
    });

    const modulesResult = await lmsModules.run(
      { course: BLACKBOARD_URL, weeks: "8", hubCourse: "tile-1" },
      testHelpers(),
      () => {}
    );

    const populateResult = await lmsPopulate.run(
      {
        course: BLACKBOARD_URL,
        modules: modulesResult.outputs.modules,
        files: [],
        hubCourse: "tile-1",
      },
      testHelpers(),
      () => {}
    );

    expect(populateResult.summary.kind).toBe("text");
    expect(populateResult.outputs).toEqual({});
  });
});
