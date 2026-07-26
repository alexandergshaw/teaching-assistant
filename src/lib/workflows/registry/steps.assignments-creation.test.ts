import { describe, it, expect, vi, beforeEach } from "vitest";

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
});
