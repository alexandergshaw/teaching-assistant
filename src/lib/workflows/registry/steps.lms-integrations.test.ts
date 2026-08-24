// Regression coverage for the Canvas-only LMS-target guard on
// integrate-source-into-lms (see lms-target-guard.ts and
// docs/REGRESSION.md entries 217/218): a Blackboard (or any non-Canvas)
// course tile must get a clean, explanatory no-op instead of falling
// through into the per-week loop and reporting "No module found in LMS" -
// and it must never touch the Canvas-only server actions. A Canvas tile (or
// a tile with no `lms` value at all, predating the lms column) must
// proceed exactly as it did before this guard existed. The guard also sits
// BEFORE the pre-existing canvasUrl-emptiness gate on purpose: a
// Blackboard tile's canvasUrl column is non-blank (it holds the Blackboard
// URL), so that gate can never fire for Blackboard - the guard must win
// the ordering.

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/app/actions", () => ({
  listCourseHubAction: vi.fn(),
  listCourseContentAction: vi.fn(),
  createPageAction: vi.fn(),
  createCourseAssignmentAction: vi.fn(),
}));

import {
  listCourseHubAction,
  listCourseContentAction,
  createPageAction,
  createCourseAssignmentAction,
} from "@/app/actions";
import { lmsIntegrationsSteps } from "./steps.lms-integrations";
import { canvasOnlySkipText } from "@/lib/workflows/registry/lms-target-guard";
import type { StepRunHelpers } from "@/lib/workflows/registry-helpers";
import type { Course } from "@/lib/supabase/courses";
import type { ScheduleWeekPlan } from "@/app/actions-types";
import type { CanvasModule } from "@/lib/canvas-modules/types";
import { emptyCourseProject } from "@/lib/course-project";

const step = lmsIntegrationsSteps.find((s) => s.type === "integrate-source-into-lms")!;

function canvasModule(overrides: Partial<CanvasModule> = {}): CanvasModule {
  return {
    id: 1,
    name: "Module 01",
    position: 1,
    published: true,
    itemsCount: 0,
    items: [],
    ...overrides,
  };
}

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

// A real Blackboard Ultra course URL - not Canvas-shaped. Entry 218: the
// course tile's canvasUrl column holds this even for a Blackboard course,
// so the pre-existing `if (!canvasUrl)` gate can never fire for it; only
// this guard, placed before that gate, catches it.
const BLACKBOARD_URL = "https://wncc.blackboard.com/ultra/courses/_33114_1/outline";
const CANVAS_URL = "https://canvas.example.edu/courses/1";

// Deliberately valid/non-empty so nothing else in the step could
// short-circuit before the guard is reached.
const SOURCE_MATERIAL = "Chapter 1: Introduction to the course";
const SCHEDULE: ScheduleWeekPlan[] = [
  {
    week: 1,
    topic: "Introduction",
    summary: "Cover Chapter 1 material",
    assignmentTitle: null,
    assignmentSlug: null,
    testName: null,
  },
];

beforeEach(() => {
  vi.clearAllMocks();
});

describe("integrate-source-into-lms: Canvas-only LMS-target guard", () => {
  it("returns a clean no-op for a Blackboard course and makes NO Canvas calls at all", async () => {
    vi.mocked(listCourseHubAction).mockResolvedValue({
      courses: [
        baseCourse({ id: "tile-1", lms: "blackboard", canvasUrl: BLACKBOARD_URL }),
      ],
    });

    const result = await step.run(
      { hubCourse: "tile-1", schedule: SCHEDULE, sourceMaterial: SOURCE_MATERIAL, sourceUrl: "" },
      testHelpers(),
      () => {}
    );

    // The whole point of this test: a Blackboard course must never reach
    // any Canvas-only server action.
    expect(listCourseContentAction).not.toHaveBeenCalled();
    expect(createPageAction).not.toHaveBeenCalled();
    expect(createCourseAssignmentAction).not.toHaveBeenCalled();

    expect(result.outputs).toEqual({ pagesCreated: 0, assignmentsCreated: 0 });
    expect(result.summary).toEqual({
      kind: "text",
      text: canvasOnlySkipText("blackboard"),
    });
  });

  it("names Brightspace in the skip message, not Blackboard - proves the label is derived, not hardcoded", async () => {
    vi.mocked(listCourseHubAction).mockResolvedValue({
      courses: [
        baseCourse({ id: "tile-1", lms: "brightspace", canvasUrl: "https://school.brightspace.com/d2l/home/123" }),
      ],
    });

    const result = await step.run(
      { hubCourse: "tile-1", schedule: SCHEDULE, sourceMaterial: SOURCE_MATERIAL, sourceUrl: "" },
      testHelpers(),
      () => {}
    );

    expect(listCourseContentAction).not.toHaveBeenCalled();
    expect(result.summary).toEqual({
      kind: "text",
      text: canvasOnlySkipText("brightspace"),
    });
  });

  it("proceeds past the guard for a Canvas tile - Canvas calls DO happen (regression: guard must not break working Canvas courses)", async () => {
    vi.mocked(listCourseHubAction).mockResolvedValue({
      courses: [baseCourse({ id: "tile-1", lms: "canvas", canvasUrl: CANVAS_URL })],
    });
    vi.mocked(listCourseContentAction).mockResolvedValue({
      courseName: "Test Course",
      modules: [canvasModule({ id: 10, name: "Module 01" })],
      pages: [],
    });
    vi.mocked(createPageAction).mockResolvedValue({
      page: { pageId: 1, url: "week-1-page", title: "Week 1 page", body: "", published: true, updatedAt: null },
    });
    vi.mocked(createCourseAssignmentAction).mockResolvedValue({
      id: 1,
      name: "Complete Chapter 1 exercises",
      htmlUrl: "https://canvas.example.edu/courses/1/assignments/1",
      addedToModule: true,
    });

    const result = await step.run(
      { hubCourse: "tile-1", schedule: SCHEDULE, sourceMaterial: SOURCE_MATERIAL, sourceUrl: "" },
      testHelpers(),
      () => {}
    );

    expect(listCourseContentAction).toHaveBeenCalledTimes(1);
    expect(createPageAction).toHaveBeenCalledTimes(1);
    expect(createCourseAssignmentAction).toHaveBeenCalledTimes(1);
    expect(result.outputs).toEqual({ pagesCreated: 1, assignmentsCreated: 1 });
    expect(result.summary.kind).toBe("list");
  });

  it("fails OPEN for a blank tile.lms with no institution fallback - proceeds against Canvas exactly as before the guard existed", async () => {
    vi.mocked(listCourseHubAction).mockResolvedValue({
      courses: [baseCourse({ id: "tile-1", lms: null, institution: null, canvasUrl: CANVAS_URL })],
    });
    vi.mocked(listCourseContentAction).mockResolvedValue({
      courseName: "Test Course",
      modules: [canvasModule({ id: 10, name: "Module 01" })],
      pages: [],
    });
    vi.mocked(createPageAction).mockResolvedValue({
      page: { pageId: 1, url: "week-1-page", title: "Week 1 page", body: "", published: true, updatedAt: null },
    });
    vi.mocked(createCourseAssignmentAction).mockResolvedValue({
      id: 1,
      name: "Complete Chapter 1 exercises",
      htmlUrl: "https://canvas.example.edu/courses/1/assignments/1",
      addedToModule: true,
    });

    const result = await step.run(
      { hubCourse: "tile-1", schedule: SCHEDULE, sourceMaterial: SOURCE_MATERIAL, sourceUrl: "" },
      testHelpers(),
      () => {}
    );

    expect(listCourseContentAction).toHaveBeenCalledTimes(1);
    expect(createPageAction).toHaveBeenCalledTimes(1);
    expect(createCourseAssignmentAction).toHaveBeenCalledTimes(1);
    expect(result.outputs).toEqual({ pagesCreated: 1, assignmentsCreated: 1 });
    expect(result.summary.kind).toBe("list");
  });

  it("the guard beats the pre-existing canvasUrl gate: a Blackboard tile with a BLANK canvasUrl still gets the Blackboard message, not the 'no live LMS connection' message", async () => {
    vi.mocked(listCourseHubAction).mockResolvedValue({
      courses: [baseCourse({ id: "tile-1", lms: "blackboard", canvasUrl: "" })],
    });

    const result = await step.run(
      { hubCourse: "tile-1", schedule: SCHEDULE, sourceMaterial: SOURCE_MATERIAL, sourceUrl: "" },
      testHelpers(),
      () => {}
    );

    expect(listCourseContentAction).not.toHaveBeenCalled();
    expect(createPageAction).not.toHaveBeenCalled();
    expect(createCourseAssignmentAction).not.toHaveBeenCalled();
    expect(result.summary).toEqual({
      kind: "text",
      text: canvasOnlySkipText("blackboard"),
    });
    expect(result.summary).not.toEqual({
      kind: "text",
      text: "Skipped: Course tile has no live LMS connection (canvasUrl empty).",
    });
  });

  it("falls back to the institution's lms field when the tile has none of its own", async () => {
    vi.mocked(listCourseHubAction).mockResolvedValue({
      courses: [
        baseCourse({ id: "tile-1", lms: null, institution: "ABC", canvasUrl: CANVAS_URL }),
      ],
    });
    const getInstitutionFields = vi.fn().mockResolvedValue([
      { id: "lmsUrl", label: "LMS", type: "lms" as const, value: "", lms: "blackboard" },
    ]);

    const result = await step.run(
      { hubCourse: "tile-1", schedule: SCHEDULE, sourceMaterial: SOURCE_MATERIAL, sourceUrl: "" },
      testHelpers({ getInstitutionFields }),
      () => {}
    );

    expect(getInstitutionFields).toHaveBeenCalledWith("ABC");
    expect(listCourseContentAction).not.toHaveBeenCalled();
    expect(createPageAction).not.toHaveBeenCalled();
    expect(createCourseAssignmentAction).not.toHaveBeenCalled();
    expect(result.summary).toEqual({
      kind: "text",
      text: canvasOnlySkipText("blackboard"),
    });
  });
});

// Chunk D step-11 regression: createCourseAssignmentAction can succeed at
// creating the assignment but fail to link it into the module (a
// success-shaped `{ addedToModule: false, linkError }`, no `error` key).
// This step only ever checked `!("error" in assignmentResult)`, so it used
// to report "Created assignment ..." as if the link had happened, and would
// count the orphan into `existingAssignmentTitles` idempotency tracking
// alongside genuinely-linked ones. THE REGRESSION test: the summary must
// name the orphan by id and must never claim the assignment was (plainly)
// created without qualification.
describe("integrate-source-into-lms: assignment link-failure regression", () => {
  it("reports the orphan by id when the module link fails, instead of a bare 'Created assignment' line", async () => {
    vi.mocked(listCourseHubAction).mockResolvedValue({
      courses: [baseCourse({ id: "tile-1", lms: "canvas", canvasUrl: CANVAS_URL })],
    });
    vi.mocked(listCourseContentAction).mockResolvedValue({
      courseName: "Test Course",
      modules: [canvasModule({ id: 10, name: "Module 01" })],
      pages: [],
    });
    vi.mocked(createPageAction).mockResolvedValue({
      page: { pageId: 1, url: "week-1-page", title: "Week 1 page", body: "", published: true, updatedAt: null },
    });
    vi.mocked(createCourseAssignmentAction).mockResolvedValue({
      id: 91,
      name: "Complete Chapter 1 exercises",
      htmlUrl: "https://canvas.example.edu/courses/1/assignments/91",
      addedToModule: false,
      linkError: "Module not found",
    });

    const result = await step.run(
      { hubCourse: "tile-1", schedule: SCHEDULE, sourceMaterial: SOURCE_MATERIAL, sourceUrl: "" },
      testHelpers(),
      () => {}
    );

    expect(result.outputs).toEqual({ pagesCreated: 1, assignmentsCreated: 1 });
    expect(result.summary.kind).toBe("list");
    if (result.summary.kind === "list") {
      const assignmentLine = result.summary.items.find((line) => line.includes("Chapter 1 exercises"));
      expect(assignmentLine).toBeDefined();
      expect(assignmentLine).toContain("91");
      expect(assignmentLine).toContain("Module not found");
      expect(assignmentLine).not.toMatch(/^Week \d+: Created assignment "Complete Chapter 1 exercises"$/);
    }
  });
});
