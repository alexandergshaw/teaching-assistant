import { describe, it, expect, vi, beforeEach } from "vitest";
import { emptyCourseProject } from "@/lib/course-project";

vi.mock("@/app/actions", () => ({
  listCourseHubAction: vi.fn(),
  createCourseAssignmentAction: vi.fn(),
  generateAssignmentAction: vi.fn(),
  draftAssignmentDescriptionAction: vi.fn(),
}));

import { listCourseHubAction, createCourseAssignmentAction } from "@/app/actions";
import { assignmentCreationSteps } from "./steps.assignments-creation";
import type { StepRunHelpers } from "@/lib/workflows/registry-helpers";
import type { Course } from "@/lib/supabase/courses";
import type { EnsuredModule } from "@/lib/workflows/types";

const step = assignmentCreationSteps.find((s) => s.type === "lms-assignments")!;

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
    workflowId: "workflow-1",
    workflowName: "Test Workflow",
    workflowRunId: "run-1",
    ...overrides,
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

describe("lms-assignments step", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createCourseAssignmentAction).mockResolvedValue({
      id: 1,
      name: "Week 01 Deliverable",
      htmlUrl: "https://canvas.example.edu/courses/1/assignments/1",
      addedToModule: true,
    });
  });

  it("applies the course tile's assignmentDueRule to the created assignment's due date, and notes it in the summary", async () => {
    const tile = baseCourse({ id: "course-1", assignmentDueRule: "wed|17:30" });
    vi.mocked(listCourseHubAction).mockResolvedValue({ courses: [tile] });

    const modules: EnsuredModule[] = [{ week: 1, id: 10, name: "Module 01" }];

    const result = await step.run(
      {
        course: "https://canvas.example.edu/courses/1",
        modules,
        schedule: [],
        repo: "org/repo",
        hubCourse: "course-1",
        startDate: "2026-01-05", // Monday
      },
      testHelpers(),
      () => {}
    );

    expect(createCourseAssignmentAction).toHaveBeenCalledTimes(1);
    const fields = vi.mocked(createCourseAssignmentAction).mock.calls[0][1];
    const due = new Date(fields.dueAt);
    expect(due.getDay()).toBe(3); // Wednesday
    expect(due.getHours()).toBe(17);
    expect(due.getMinutes()).toBe(30);

    expect(result.summary.kind).toBe("list");
    if (result.summary.kind === "list") {
      expect(result.summary.label).toContain("deadlines set to Wednesdays at 5:30 PM");
    }
  });

  it("keeps the historical Sunday 23:59 deadline and adds no note when no rule is set on the tile", async () => {
    const tile = baseCourse({ id: "course-1", assignmentDueRule: null });
    vi.mocked(listCourseHubAction).mockResolvedValue({ courses: [tile] });

    const modules: EnsuredModule[] = [{ week: 1, id: 10, name: "Module 01" }];

    const result = await step.run(
      {
        course: "https://canvas.example.edu/courses/1",
        modules,
        schedule: [],
        repo: "org/repo",
        hubCourse: "course-1",
        startDate: "2026-01-05",
      },
      testHelpers(),
      () => {}
    );

    const fields = vi.mocked(createCourseAssignmentAction).mock.calls[0][1];
    const due = new Date(fields.dueAt);
    expect(due.getDay()).toBe(0); // Sunday
    expect(due.getHours()).toBe(23);
    expect(due.getMinutes()).toBe(59);

    expect(result.summary.kind).toBe("list");
    if (result.summary.kind === "list") {
      expect(result.summary.label).not.toContain("deadlines set to");
    }
  });

  // Chunk D step-11 regression: createCourseAssignmentAction can succeed at
  // creating the assignment but fail to link it into the module (a
  // success-shaped `{ addedToModule: false, linkError }`, no `error` key).
  // This step only ever checked `"error" in created`, so it used to report
  // "Week 01 Deliverable -> Module 01" as if the link had happened. THE
  // REGRESSION test: the orphan's id must appear in the summary, the line
  // must never claim the module link succeeded, and the step must keep
  // creating the remaining modules' assignments (unlike a genuine create
  // failure, which still throws and aborts the whole step).
  it("reports the orphan by id (never a bare success line) when the module link fails, and keeps going for the remaining modules", async () => {
    const tile = baseCourse({ id: "course-1" });
    vi.mocked(listCourseHubAction).mockResolvedValue({ courses: [tile] });

    vi.mocked(createCourseAssignmentAction)
      .mockResolvedValueOnce({
        id: 77,
        name: "Week 01 Deliverable",
        htmlUrl: "https://canvas.example.edu/courses/1/assignments/77",
        addedToModule: false,
        linkError: "Module not found",
      })
      .mockResolvedValueOnce({
        id: 78,
        name: "Week 02 Deliverable",
        htmlUrl: "https://canvas.example.edu/courses/1/assignments/78",
        addedToModule: true,
      });

    const modules: EnsuredModule[] = [
      { week: 1, id: 10, name: "Module 01" },
      { week: 2, id: 11, name: "Module 02" },
    ];

    const result = await step.run(
      {
        course: "https://canvas.example.edu/courses/1",
        modules,
        schedule: [],
        repo: "org/repo",
        hubCourse: "course-1",
      },
      testHelpers(),
      () => {}
    );

    expect(createCourseAssignmentAction).toHaveBeenCalledTimes(2);
    expect(result.summary.kind).toBe("list");
    if (result.summary.kind === "list") {
      expect(result.summary.items[0]).not.toMatch(/->/);
      expect(result.summary.items[0]).toContain("77");
      expect(result.summary.items[0]).toContain("Module not found");
      expect(result.summary.items[1]).toContain("Week 02 Deliverable -> Module 02");
    }
  });
});

// Canvas-only LMS-target guard (lms-target-guard.ts): lms-assignments calls
// createCourseAssignmentAction, which goes through canvas-core.ts's
// Canvas-only URL parser and throws on a non-Canvas course URL (e.g. a real
// Blackboard Ultra course link). A Blackboard tile must get a clean,
// explanatory no-op instead - never a throw, which is what cascades into
// every dependent step ("Skipped - depends on step N, which failed").
describe("lms-assignments: Canvas-only LMS-target guard", () => {
  const MODULES: EnsuredModule[] = [{ week: 1, id: 10, name: "Module 01" }];
  const BLACKBOARD_URL = "https://wncc.blackboard.com/ultra/courses/_33114_1/outline";
  const CANVAS_URL = "https://canvas.example.edu/courses/1";

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createCourseAssignmentAction).mockResolvedValue({
      id: 1,
      name: "Week 01 Deliverable",
      htmlUrl: "https://canvas.example.edu/courses/1/assignments/1",
      addedToModule: true,
    });
  });

  it("returns a clean, explanatory no-op for a Blackboard course, without calling createCourseAssignmentAction", async () => {
    const tile = baseCourse({ id: "tile-1", lms: "blackboard" });
    vi.mocked(listCourseHubAction).mockResolvedValue({ courses: [tile] });

    const result = await step.run(
      {
        course: BLACKBOARD_URL,
        modules: MODULES,
        schedule: [],
        repo: "org/repo",
        hubCourse: "tile-1",
      },
      testHelpers(),
      () => {}
    );

    expect(createCourseAssignmentAction).not.toHaveBeenCalled();
    expect(result.summary).toEqual({
      kind: "text",
      text: "Skipped - this course is on Blackboard; this step targets Canvas.",
    });
    expect(result.outputs).toEqual({});
  });

  it("is unaffected on a Canvas course tile - proceeds exactly as before this guard existed", async () => {
    const tile = baseCourse({ id: "tile-1", lms: "canvas" });
    vi.mocked(listCourseHubAction).mockResolvedValue({ courses: [tile] });

    const result = await step.run(
      {
        course: CANVAS_URL,
        modules: MODULES,
        schedule: [],
        repo: "org/repo",
        hubCourse: "tile-1",
      },
      testHelpers(),
      () => {}
    );

    expect(createCourseAssignmentAction).toHaveBeenCalledTimes(1);
    expect(result.summary.kind).toBe("list");
  });

  it("is unaffected when no course tile is bound at all - byte-identical to pre-guard behavior", async () => {
    const result = await step.run(
      {
        course: CANVAS_URL,
        modules: MODULES,
        schedule: [],
        repo: "org/repo",
      },
      testHelpers(),
      () => {}
    );

    expect(listCourseHubAction).not.toHaveBeenCalled();
    expect(createCourseAssignmentAction).toHaveBeenCalledTimes(1);
    expect(result.summary.kind).toBe("list");
  });
});
