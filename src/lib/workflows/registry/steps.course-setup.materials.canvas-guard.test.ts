// Regression coverage for the Canvas-only LMS-target guard on
// starter-materials (see lms-target-guard.ts, docs/REGRESSION.md entry 217
// for the four steps that got it first, and entry 222 for this one).
//
// starter-materials differs from those four: it takes a course LIST, not a
// single course + hubCourse pair, so the guard runs PER COURSE inside its own
// loop rather than once per step. Two things had to be right, and only one of
// them is obvious:
//
//   1. A non-Canvas course must be skipped before any Canvas action runs.
//   2. The step's terminal `failures === urls.length` check must not count a
//      skip as a failure - otherwise a single Blackboard course (the shape
//      every preset binding `courses` from step 0 produces) still throws.
//
// The non-obvious part is tile RESOLUTION: the step's own `lookup` map is
// keyed by parsed Canvas course id, and parseCanvasCourseId returns null for a
// Blackboard Ultra URL, so a Blackboard tile is absent from it by
// construction. A guard that resolved the tile only by id would find nothing,
// resolveLmsFromTile would return "", isCanvasLms would say "Canvas", and the
// guard would silently never fire - the same gate-can-never-trigger shape
// entry 218 records. Hence the by-URL index, and hence the first test below.

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/app/actions", () => ({
  listCourseHubAction: vi.fn(),
  createModuleAction: vi.fn(),
  listCourseContentAction: vi.fn(),
  createGradableAction: vi.fn(),
  createQuizQuestionAction: vi.fn(),
  bulkUpdateAction: vi.fn(),
  createModuleItemAction: vi.fn(),
  createCourseAssignmentAction: vi.fn(),
  getFinalizedSyllabusAction: vi.fn(),
  generateCourseSyllabusAction: vi.fn(),
  createFinalizedSyllabusAction: vi.fn(),
  placeSyllabusInModuleAction: vi.fn(),
  updateCourseHubAction: vi.fn(),
  createPageAction: vi.fn(),
  requestFileUploadAction: vi.fn(),
}));

import { listCourseHubAction, listCourseContentAction, createModuleAction } from "@/app/actions";
import { courseSetupMaterialsSteps } from "./steps.course-setup.materials";
import type { StepRunHelpers } from "@/lib/workflows/registry-helpers";
import type { Course } from "@/lib/supabase/courses";
import { emptyCourseProject } from "@/lib/course-project";

const starterMaterials = courseSetupMaterialsSteps.find((s) => s.type === "starter-materials")!;

// The real Blackboard Ultra URL from run 756544e0-f94b-4172-9a19-ecc8967e4a25,
// the run this whole guard family was written against. Deliberately the same
// constant steps.lms-modules.test.ts uses, so all five guarded step families
// are proven against the identical real-world URL shape.
const BLACKBOARD_URL = "https://wncc.blackboard.com/ultra/courses/_33114_1/outline";
const CANVAS_URL = "https://canvas.example.edu/courses/1";

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

const noop = () => {};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("starter-materials: Canvas-only LMS-target guard", () => {
  it("skips a single Blackboard course cleanly instead of throwing", async () => {
    // The exact shape COURSE_REFRESH / COURSE_KICKOFF / COURSE_KICKOFF_NO_CODE
    // produce: `courses` bound to step 0's output, i.e. ONE url - the tile's
    // own canvas_url column, which holds a Blackboard URL for a Blackboard
    // tile. Before the guard, failures === urls.length === 1 and the step
    // threw outright.
    vi.mocked(listCourseHubAction).mockResolvedValue({
      courses: [baseCourse({ id: "tile-1", lms: "blackboard", canvasUrl: BLACKBOARD_URL })],
    });

    const result = await starterMaterials.run(
      { courses: BLACKBOARD_URL },
      testHelpers(),
      noop
    );

    expect(result).toBeDefined();
    expect(listCourseContentAction).not.toHaveBeenCalled();
    expect(createModuleAction).not.toHaveBeenCalled();
  });

  it("names Blackboard in the skip line, using the shared wording", async () => {
    vi.mocked(listCourseHubAction).mockResolvedValue({
      courses: [baseCourse({ id: "tile-1", lms: "blackboard", canvasUrl: BLACKBOARD_URL })],
    });

    const result = await starterMaterials.run(
      { courses: BLACKBOARD_URL },
      testHelpers(),
      noop
    );

    const text = JSON.stringify(result.summary ?? {});
    expect(text).toContain("Blackboard");
    expect(text).toContain("this step targets Canvas");
  });

  it("finds the tile by its raw URL - the id index cannot hold a Blackboard tile", async () => {
    // This is the load-bearing test. parseCanvasCourseId(BLACKBOARD_URL) is
    // null, so the step's id-keyed `lookup` map never contains this tile. If
    // the guard resolved the tile by id alone it would see `undefined`, treat
    // the course as Canvas, and call straight through to the Canvas actions.
    vi.mocked(listCourseHubAction).mockResolvedValue({
      courses: [
        // A Canvas tile that DOES land in the id index, present so the test
        // proves the by-URL lookup is what matched, not an empty-map accident.
        baseCourse({ id: "tile-canvas", lms: "canvas", canvasUrl: CANVAS_URL }),
        baseCourse({ id: "tile-bb", name: "System Administration", lms: "blackboard", canvasUrl: BLACKBOARD_URL }),
      ],
    });

    const result = await starterMaterials.run(
      { courses: BLACKBOARD_URL },
      testHelpers(),
      noop
    );

    // The tile was found: its NAME appears in the skip line rather than the
    // bare URL, which only happens when the by-URL lookup resolved it.
    expect(JSON.stringify(result.summary ?? {})).toContain("System Administration");
    expect(listCourseContentAction).not.toHaveBeenCalled();
  });

  it("still attempts a Canvas course, unchanged", async () => {
    vi.mocked(listCourseHubAction).mockResolvedValue({
      courses: [baseCourse({ id: "tile-1", lms: "canvas", canvasUrl: CANVAS_URL })],
    });
    vi.mocked(listCourseContentAction).mockResolvedValue({ error: "boom" });

    await starterMaterials.run({ courses: CANVAS_URL }, testHelpers(), noop).catch(() => {});

    // The guard must not short-circuit a Canvas course - the Canvas action is
    // reached exactly as before this change.
    expect(listCourseContentAction).toHaveBeenCalled();
  });

  it("treats a tile with no LMS recorded as Canvas, so pre-guard tiles are unaffected", async () => {
    vi.mocked(listCourseHubAction).mockResolvedValue({
      courses: [baseCourse({ id: "tile-1", lms: null, canvasUrl: CANVAS_URL })],
    });
    vi.mocked(listCourseContentAction).mockResolvedValue({ error: "boom" });

    await starterMaterials.run({ courses: CANVAS_URL }, testHelpers(), noop).catch(() => {});

    expect(listCourseContentAction).toHaveBeenCalled();
  });

  it("a mixed run skips only the Blackboard course and still attempts the Canvas one", async () => {
    vi.mocked(listCourseHubAction).mockResolvedValue({
      courses: [
        baseCourse({ id: "tile-canvas", lms: "canvas", canvasUrl: CANVAS_URL }),
        baseCourse({ id: "tile-bb", lms: "blackboard", canvasUrl: BLACKBOARD_URL }),
      ],
    });
    vi.mocked(listCourseContentAction).mockResolvedValue({ error: "boom" });

    // The multi-course shape the standalone "Starter Materials" workflow uses.
    await starterMaterials
      .run({ courses: `${CANVAS_URL}\n${BLACKBOARD_URL}` }, testHelpers(), noop)
      .catch(() => {});

    // Exactly one Canvas attempt: the Blackboard course never reached it.
    expect(vi.mocked(listCourseContentAction).mock.calls).toHaveLength(1);
    expect(vi.mocked(listCourseContentAction).mock.calls[0][0]).toBe(CANVAS_URL);
  });
});

// The terminal `failures === urls.length` check, separately from the guard.
//
// Worth being precise about what this does and does not do: the GUARD ALONE
// already fixes the reported bug. Once a Blackboard course is skipped,
// `failures` stays 0, so the ORIGINAL check (`failures === urls.length`) is
// already false for a single Blackboard course and does not throw. Reverting
// the terminal check to its old form leaves every test above green - verified.
//
// The change from `urls.length` to `attempted` is a deliberate SEPARATE
// correction, in the stricter direction: it restores the check's original
// meaning ("every course we could serve failed") once skips exist. Without it,
// a run whose only attempted course failed would stay silent merely because
// some OTHER course was skipped, which weakens a real total-failure signal.
describe("starter-materials: the terminal all-failed check counts attempts, not urls", () => {
  it("still throws when every course it could actually serve failed", async () => {
    vi.mocked(listCourseHubAction).mockResolvedValue({
      courses: [
        baseCourse({ id: "tile-canvas", lms: "canvas", canvasUrl: CANVAS_URL }),
        baseCourse({ id: "tile-bb", lms: "blackboard", canvasUrl: BLACKBOARD_URL }),
      ],
    });
    // The one Canvas course fails; the Blackboard one is skipped, not failed.
    vi.mocked(listCourseContentAction).mockResolvedValue({ error: "boom" });

    await expect(
      starterMaterials.run(
        { courses: `${CANVAS_URL}\n${BLACKBOARD_URL}` },
        testHelpers(),
        noop
      )
    ).rejects.toThrow("Starter materials failed for every course");
  });

  it("does NOT throw when every course was skipped as non-Canvas", async () => {
    vi.mocked(listCourseHubAction).mockResolvedValue({
      courses: [baseCourse({ id: "tile-bb", lms: "blackboard", canvasUrl: BLACKBOARD_URL })],
    });

    await expect(
      starterMaterials.run({ courses: BLACKBOARD_URL }, testHelpers(), noop)
    ).resolves.toBeDefined();
  });
});
