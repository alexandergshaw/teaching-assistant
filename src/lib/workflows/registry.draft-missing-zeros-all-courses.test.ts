import { describe, it, expect, vi, beforeEach } from "vitest";
import { emptyCourseProject } from "@/lib/course-project";
import type { CanvasModule } from "@/lib/canvas-modules";

vi.mock("@/app/actions", () => ({
  listCourseHubAction: vi.fn(),
  listCourseContentAction: vi.fn(),
  draftZerosForMissingAction: vi.fn(),
  listAssignmentDueDatesByUrlAction: vi.fn(),
}));

import {
  listCourseHubAction,
  listCourseContentAction,
  draftZerosForMissingAction,
  listAssignmentDueDatesByUrlAction,
} from "@/app/actions";
import { getStepDefinition } from "./registry";
import type { StepRunHelpers } from "./registry-helpers";
import type { Course } from "@/lib/supabase/courses";

const step = getStepDefinition("draft-missing-zeros")!;

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

// A minimal, well-typed CanvasModule with a single Assignment item, so the
// step's module-item filter (`type === "Assignment" && contentId != null`)
// has something real to find.
function makeModule(name: string, assignmentContentId: number): CanvasModule {
  return {
    id: assignmentContentId * 10,
    name,
    position: 1,
    published: true,
    itemsCount: 1,
    items: [
      {
        id: assignmentContentId * 10 + 1,
        moduleId: assignmentContentId * 10,
        title: `${name} assignment`,
        type: "Assignment",
        position: 1,
        indent: 0,
        published: true,
        pageUrl: null,
        contentId: assignmentContentId,
        dueAt: null,
        pointsPossible: 100,
        htmlUrl: null,
        externalUrl: null,
      },
    ],
  };
}

const noProgress = () => {};

const NOT_STARTED_URL = "https://school.instructure.com/courses/10";
const COMPLETE_URL = "https://school.instructure.com/courses/20";
const IN_PROGRESS_URL = "https://school.instructure.com/courses/30";

describe("draft-missing-zeros: all-courses path (courses input)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // resolveTileCurrentWeek falls back to start-date arithmetic whenever the
    // deadline lookup errors - keeps week resolution deterministic in these
    // tests regardless of the tile's canvasUrl being set.
    vi.mocked(listAssignmentDueDatesByUrlAction).mockResolvedValue({ error: "no deadlines mocked" });

    // Every canvas URL resolves SOME module/assignment, keyed by the tile's
    // own displayWeek, so a skip is provably caused by the status check
    // alone (not by an accidental "no module found" fallback).
    vi.mocked(listCourseContentAction).mockImplementation(async (courseUrl: string) => {
      if (courseUrl === NOT_STARTED_URL) {
        return { courseName: "Not Started Course", modules: [makeModule("Module 00", 111)], pages: [] };
      }
      if (courseUrl === COMPLETE_URL) {
        return { courseName: "Complete Course", modules: [makeModule("Module 02", 222)], pages: [] };
      }
      if (courseUrl === IN_PROGRESS_URL) {
        return { courseName: "In Progress Course", modules: [makeModule("Module 03", 333)], pages: [] };
      }
      return { error: `unexpected courseUrl ${courseUrl}` };
    });

    vi.mocked(draftZerosForMissingAction).mockResolvedValue({
      draftId: "draft-1",
      assignmentsAffected: 1,
      zeroed: 2,
      summary: "Drafted 0 for 2 missing submission(s) across 1 assignment(s).",
    });
  });

  function makeTiles(): Course[] {
    const notStarted = baseCourse({
      id: "t-not-started",
      name: "Not Started Course",
      canvasUrl: NOT_STARTED_URL,
      // 30 days in the future - has not started.
      startDate: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString(),
      weeks: 15,
    });
    const complete = baseCourse({
      id: "t-complete",
      name: "Complete Course",
      canvasUrl: COMPLETE_URL,
      // ~1000 days ago with only 2 weeks total - long finished.
      startDate: new Date(Date.now() - 1000 * 24 * 3600 * 1000).toISOString(),
      weeks: 2,
    });
    const inProgress = baseCourse({
      id: "t-in-progress",
      name: "In Progress Course",
      canvasUrl: IN_PROGRESS_URL,
      // 14 days ago -> raw week 3, well within a 15-week course.
      startDate: new Date(Date.now() - 14 * 24 * 3600 * 1000).toISOString(),
      weeks: 15,
    });
    return [notStarted, complete, inProgress];
  }

  it("skips a not-started tile and a completed tile, and processes an in-progress one", async () => {
    vi.mocked(listCourseHubAction).mockResolvedValue({ courses: makeTiles() });

    const result = await step.run(
      { courses: "t-not-started\nt-complete\nt-in-progress" },
      testHelpers(),
      noProgress
    );

    // Only the in-progress tile ever reaches Canvas module lookup or zeroing.
    expect(vi.mocked(listCourseContentAction).mock.calls.map((c) => c[0])).toEqual([IN_PROGRESS_URL]);
    expect(draftZerosForMissingAction).toHaveBeenCalledTimes(1);
    expect(draftZerosForMissingAction).toHaveBeenCalledWith({ courseUrl: IN_PROGRESS_URL, assignmentId: "333" });

    expect(result.outputs.zeroed).toBe("2");

    const items = result.summary.kind === "list" ? result.summary.items : [];
    expect(items.some((n) => n.includes("Not Started Course") && n.includes("has not started"))).toBe(true);
    expect(items.some((n) => n.includes("Complete Course") && n.includes("already finished"))).toBe(true);
    expect(items.some((n) => n.includes("In Progress Course") && n.includes("drafted 0 for 2"))).toBe(true);
  });

  it("isolates a per-course failure: one course's Canvas error does not stop the others", async () => {
    const tileA = baseCourse({
      id: "t-a",
      name: "Course A",
      canvasUrl: "https://school.instructure.com/courses/40",
      startDate: new Date(Date.now() - 14 * 24 * 3600 * 1000).toISOString(),
      weeks: 15,
    });
    const tileB = baseCourse({
      id: "t-b",
      name: "Course B",
      canvasUrl: IN_PROGRESS_URL,
      startDate: new Date(Date.now() - 14 * 24 * 3600 * 1000).toISOString(),
      weeks: 15,
    });
    vi.mocked(listCourseHubAction).mockResolvedValue({ courses: [tileA, tileB] });
    // Course A blows up unexpectedly (a thrown exception, not a modeled
    // error return) - exercises the outer per-course try/catch, not the
    // inner "error" in content branch.
    vi.mocked(listCourseContentAction).mockImplementation(async (courseUrl: string) => {
      if (courseUrl === "https://school.instructure.com/courses/40") {
        throw new Error("Canvas is down");
      }
      return { courseName: "Course B", modules: [makeModule("Module 03", 333)], pages: [] };
    });

    const result = await step.run({ courses: "t-a\nt-b" }, testHelpers(), noProgress);

    // B still ran despite A's failure.
    expect(draftZerosForMissingAction).toHaveBeenCalledTimes(1);
    expect(draftZerosForMissingAction).toHaveBeenCalledWith({ courseUrl: IN_PROGRESS_URL, assignmentId: "333" });
    expect(result.outputs.zeroed).toBe("2");

    const items = result.summary.kind === "list" ? result.summary.items : [];
    expect(items.some((n) => n.includes("Course A") && n.includes("Canvas is down"))).toBe(true);
    expect(items.some((n) => n.includes("Course B") && n.includes("drafted 0 for 2"))).toBe(true);
  });
});

describe("draft-missing-zeros: single-course path (backward compatibility)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("still calls draftZerosForMissingAction directly with no course-tile lookup when courses is blank", async () => {
    vi.mocked(draftZerosForMissingAction).mockResolvedValue({
      draftId: "draft-9",
      assignmentsAffected: 1,
      zeroed: 5,
      summary: "Drafted 0 for 5 missing submission(s) across 1 assignment(s).",
    });

    const result = await step.run(
      { course: "https://school.instructure.com/courses/99", assignment: "" },
      testHelpers(),
      noProgress
    );

    expect(listCourseHubAction).not.toHaveBeenCalled();
    expect(listCourseContentAction).not.toHaveBeenCalled();
    expect(draftZerosForMissingAction).toHaveBeenCalledTimes(1);
    expect(draftZerosForMissingAction).toHaveBeenCalledWith({
      courseUrl: "https://school.instructure.com/courses/99",
      assignmentId: undefined,
    });
    expect(result.outputs.draftId).toBe("draft-9");
    expect(result.outputs.zeroed).toBe("5");
    expect(result.summary).toEqual({
      kind: "text",
      text: "Drafted 0 for 5 missing submission(s) across 1 assignment(s).",
    });
  });

  it("errors when neither course nor courses is provided", async () => {
    await expect(step.run({}, testHelpers(), noProgress)).rejects.toThrow(/Provide the Canvas course URL/);
  });
});
