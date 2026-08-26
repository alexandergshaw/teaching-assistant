import { describe, it, expect, vi, beforeEach } from "vitest";
import { emptyCourseProject } from "@/lib/course-project";

vi.mock("@/app/actions", () => ({
  listCourseHubAction: vi.fn(),
  generateAssignmentRubricAction: vi.fn(),
  gradeRepoAction: vi.fn(),
  ingestRepoAction: vi.fn(),
  saveGradingDraftAction: vi.fn(),
  getRepoTreeAction: vi.fn(),
  getFileTextAction: vi.fn(),
  listAssignmentDueDatesByUrlAction: vi.fn(),
  listCourseContentAction: vi.fn(),
}));

import {
  listCourseHubAction,
  generateAssignmentRubricAction,
  gradeRepoAction,
  saveGradingDraftAction,
  getRepoTreeAction,
} from "@/app/actions";
import { getStepDefinition } from "./registry";
import type { StepRunHelpers } from "./registry-helpers";
import type { Course } from "@/lib/supabase/courses";

const step = getStepDefinition("batch-grade-repos-to-draft")!;

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

const noProgress = () => {};

function mockGradeResult(student: string) {
  return {
    fullName: `org/${student}-repo`,
    run: {
      results: [
        {
          student,
          totalScore: "10/10",
          overallComment: "",
          strengths: "",
          improvements: "",
          resubmitNotice: "",
          feedback: "",
          mergedFileCount: 0,
          submittedFiles: [],
          rubricAreas: [],
        },
      ],
      rubricAreaNames: [],
      fullCreditChecklist: [],
    },
    rubric: "Generated rubric text",
  };
}

function mockTree(...paths: string[]) {
  return { tree: paths.map((path) => ({ path, type: "blob" as const, size: 0, sha: "" })) };
}

describe("batch-grade-repos-to-draft: all-courses path (hubCourses input)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(generateAssignmentRubricAction).mockResolvedValue("Generated rubric text");
    vi.mocked(saveGradingDraftAction).mockResolvedValue({ id: "draft-multi" });
  });

  function makeTiles(): Course[] {
    const notStarted = baseCourse({
      id: "t-not-started",
      name: "Not Started Course",
      startDate: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString(),
      weeks: 15,
      studentRepos: [{ student: "Alice", canvasUserId: "1", repo: "org/alice-repo" }],
    });
    const complete = baseCourse({
      id: "t-complete",
      name: "Complete Course",
      startDate: new Date(Date.now() - 1000 * 24 * 3600 * 1000).toISOString(),
      weeks: 2,
      studentRepos: [{ student: "Bob", canvasUserId: "2", repo: "org/bob-repo" }],
    });
    const inProgress = baseCourse({
      id: "t-in-progress",
      name: "In Progress Course",
      startDate: new Date(Date.now() - 14 * 24 * 3600 * 1000).toISOString(),
      weeks: 15,
      studentRepos: [{ student: "Carol", canvasUserId: "3", repo: "org/carol-repo" }],
    });
    return [notStarted, complete, inProgress];
  }

  it("skips a not-started tile and a completed tile, and grades an in-progress one", async () => {
    vi.mocked(listCourseHubAction).mockResolvedValue({ courses: makeTiles() });
    vi.mocked(getRepoTreeAction).mockResolvedValue(mockTree("week-3/starter.py"));
    vi.mocked(gradeRepoAction).mockResolvedValue(mockGradeResult("Carol"));

    const result = await step.run(
      { hubCourses: "t-not-started\nt-complete\nt-in-progress" },
      testHelpers(),
      noProgress
    );

    // Only the in-progress tile's repo is ever graded.
    expect(getRepoTreeAction).toHaveBeenCalledTimes(1);
    expect(getRepoTreeAction).toHaveBeenCalledWith("org/carol-repo");
    expect(gradeRepoAction).toHaveBeenCalledTimes(1);
    expect(saveGradingDraftAction).toHaveBeenCalledTimes(1);

    expect(result.outputs.graded).toBe(1);

    const items = result.summary.kind === "list" ? result.summary.items : [];
    expect(items.some((n) => n.includes("Not Started Course") && n.includes("has not started"))).toBe(true);
    expect(items.some((n) => n.includes("Complete Course") && n.includes("already finished"))).toBe(true);
    expect(items.some((n) => n.includes("In Progress Course") && n.includes("graded 1 repo"))).toBe(true);
  });

  it("isolates a per-course failure: a course with no repos configured does not stop the others", async () => {
    const tileA = baseCourse({
      id: "t-a",
      name: "Course A (no repos)",
      startDate: new Date(Date.now() - 14 * 24 * 3600 * 1000).toISOString(),
      weeks: 15,
      studentRepos: [], // triggers "Add student repos..." inside gradeTileRepos
    });
    const tileB = baseCourse({
      id: "t-b",
      name: "Course B",
      startDate: new Date(Date.now() - 14 * 24 * 3600 * 1000).toISOString(),
      weeks: 15,
      studentRepos: [{ student: "Dave", canvasUserId: "4", repo: "org/dave-repo" }],
    });
    vi.mocked(listCourseHubAction).mockResolvedValue({ courses: [tileA, tileB] });
    vi.mocked(getRepoTreeAction).mockResolvedValue(mockTree("week-3/starter.py"));
    vi.mocked(gradeRepoAction).mockResolvedValue(mockGradeResult("Dave"));

    const result = await step.run({ hubCourses: "t-a\nt-b" }, testHelpers(), noProgress);

    // B still graded despite A's failure.
    expect(gradeRepoAction).toHaveBeenCalledTimes(1);
    expect(saveGradingDraftAction).toHaveBeenCalledTimes(1);
    expect(result.outputs.graded).toBe(1);

    const items = result.summary.kind === "list" ? result.summary.items : [];
    expect(items.some((n) => n.includes("Course A") && n.includes("Add student repos"))).toBe(true);
    expect(items.some((n) => n.includes("Course B") && n.includes("graded 1 repo"))).toBe(true);
  });
});

describe("batch-grade-repos-to-draft: single-course path (backward compatibility)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(generateAssignmentRubricAction).mockResolvedValue("Generated rubric text");
  });

  it("still grades the single hubCourse tile when hubCourses is blank", async () => {
    const tile = baseCourse({
      id: "solo",
      name: "Solo Course",
      startDate: new Date(Date.now() - 14 * 24 * 3600 * 1000).toISOString(),
      weeks: 15,
      studentRepos: [{ student: "Eve", canvasUserId: "5", repo: "org/eve-repo" }],
    });
    vi.mocked(listCourseHubAction).mockResolvedValue({ courses: [tile] });
    vi.mocked(getRepoTreeAction).mockResolvedValue(mockTree("week-3/starter.py"));
    vi.mocked(gradeRepoAction).mockResolvedValue(mockGradeResult("Eve"));
    vi.mocked(saveGradingDraftAction).mockResolvedValue({ id: "draft-solo" });

    const result = await step.run({ hubCourse: "solo" }, testHelpers(), noProgress);

    expect(result.outputs.draftId).toBe("draft-solo");
    expect(result.outputs.graded).toBe(1);
    expect(result.summary.kind).toBe("text");
  });

  // The single-course path does NOT skip a not-started tile - it grades
  // whatever repo content exists and labels the module "Not started"
  // (unchanged pre-existing behavior; only the all-courses path added a skip).
  it("does not skip a not-started tile - unchanged behavior for the single-course path", async () => {
    const tile = baseCourse({
      id: "solo-future",
      name: "Future Course",
      startDate: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString(),
      weeks: 15,
      studentRepos: [{ student: "Frank", canvasUserId: "6", repo: "org/frank-repo" }],
    });
    vi.mocked(listCourseHubAction).mockResolvedValue({ courses: [tile] });
    vi.mocked(getRepoTreeAction).mockResolvedValue(mockTree());
    vi.mocked(saveGradingDraftAction).mockResolvedValue({ id: "draft-future" });

    const result = await step.run({ hubCourse: "solo-future" }, testHelpers(), noProgress);

    expect(result.outputs.moduleName).toBe("Not started");
    // gradeRepoAction is never reached because no week-0 folder exists in
    // the (empty) tree - this asserts the pre-existing "no folder matching"
    // note, not a status-based skip.
    expect(gradeRepoAction).not.toHaveBeenCalled();
  });

  it("errors when neither hubCourse nor hubCourses is provided", async () => {
    await expect(step.run({}, testHelpers(), noProgress)).rejects.toThrow(/Choose a course tile/);
  });
});
