import { describe, it, expect, vi } from "vitest";
import { emptyCourseProject } from "@/lib/course-project";

// Every named export steps.course-setup.rosters.ts imports from "@/app/actions"
// must be present here (even the ones a given test never calls) or the import
// binds to undefined - see the same pattern in steps.grading-repos.grade-repo.test.ts.
vi.mock("@/app/actions", () => ({
  listCourseHubAction: vi.fn(),
  updateCourseHubAction: vi.fn(),
  listAssignmentTextSubmissionsAction: vi.fn(),
  listCourseRosterAction: vi.fn(),
  listCoursesByTermAction: vi.fn(),
  listConfiguredInstitutionsAction: vi.fn(),
}));

import {
  listCourseHubAction,
  listAssignmentTextSubmissionsAction,
  listCourseRosterAction,
  listConfiguredInstitutionsAction,
} from "@/app/actions";
import { courseSetupRosterSteps } from "./steps.course-setup.rosters";
import type { StepRunHelpers } from "@/lib/workflows/registry-helpers";
import type { Course } from "@/lib/supabase/courses";

const mockListCourseHubAction = vi.mocked(listCourseHubAction);
const mockListAssignmentTextSubmissionsAction = vi.mocked(listAssignmentTextSubmissionsAction);
const mockListCourseRosterAction = vi.mocked(listCourseRosterAction);
const mockListConfiguredInstitutionsAction = vi.mocked(listConfiguredInstitutionsAction);

const linkStep = courseSetupRosterSteps.find((s) => s.type === "link-github-usernames")!;
const fetchStep = courseSetupRosterSteps.find((s) => s.type === "fetch-course-roster")!;

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
    canvasUrl: "https://canvas.example.edu/courses/1",
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
  } as Course;
}

describe("link-github-usernames institution resolution", () => {
  it("resolves the institution from the course tile when nothing is bound and no header institution is active (AC1 rung 2, AC3 unattended)", async () => {
    mockListCourseHubAction.mockResolvedValue({
      courses: [baseCourse({ id: "tile-1", institution: "MCC" })],
    });
    mockListAssignmentTextSubmissionsAction.mockResolvedValue({ submissions: [] });
    mockListConfiguredInstitutionsAction.mockResolvedValue({ acronyms: [] });

    const result = await linkStep.run(
      {
        course: "https://canvas.example.edu/courses/123",
        assignment: "https://canvas.example.edu/courses/123/assignments/9",
        hubCourse: "tile-1",
        institution: "",
      },
      // activeInstitution: null mirrors a headless run where no browser (and
      // no schedule institution) supplies one - see buildServerStepRunHelpers.
      testHelpers({ activeInstitution: null }),
      () => {}
    );

    expect(result.summary.kind).toBe("text");
    expect(mockListAssignmentTextSubmissionsAction).toHaveBeenCalledWith("MCC", "123", "9");
  });

  it("prefers the header's active institution over the single-configured fallback when the tile has none", async () => {
    mockListCourseHubAction.mockResolvedValue({
      courses: [baseCourse({ id: "tile-1", institution: null })],
    });
    mockListAssignmentTextSubmissionsAction.mockResolvedValue({ submissions: [] });
    mockListConfiguredInstitutionsAction.mockResolvedValue({ acronyms: ["OTHER"] });

    await linkStep.run(
      {
        course: "https://canvas.example.edu/courses/123",
        assignment: "https://canvas.example.edu/courses/123/assignments/9",
        hubCourse: "tile-1",
        institution: "",
      },
      testHelpers({ activeInstitution: "MPCC" }),
      () => {}
    );

    expect(mockListAssignmentTextSubmissionsAction).toHaveBeenCalledWith("MPCC", "123", "9");
  });

  it("throws the ladder-aware failure message when nothing resolves", async () => {
    mockListCourseHubAction.mockResolvedValue({
      courses: [baseCourse({ id: "tile-1", institution: null })],
    });
    mockListConfiguredInstitutionsAction.mockResolvedValue({ acronyms: [] });

    await expect(
      linkStep.run(
        {
          course: "https://canvas.example.edu/courses/123",
          assignment: "https://canvas.example.edu/courses/123/assignments/9",
          hubCourse: "tile-1",
          institution: "",
        },
        testHelpers({ activeInstitution: null }),
        () => {}
      )
    ).rejects.toThrow(/bind an institution|course tile|header|configure/i);
  });
});

describe("fetch-course-roster institution resolution", () => {
  it("resolves via the single configured institution when no header institution is active (AC3 unattended)", async () => {
    mockListCourseRosterAction.mockResolvedValue({ students: [] });
    mockListConfiguredInstitutionsAction.mockResolvedValue({ acronyms: ["MCC"] });

    await fetchStep.run(
      { course: "https://canvas.example.edu/courses/456", institution: "" },
      testHelpers({ activeInstitution: null }),
      () => {}
    );

    expect(mockListCourseRosterAction).toHaveBeenCalledWith("MCC", "456");
  });

  it("does not fall back to the single-configured institution when two or more are configured", async () => {
    mockListConfiguredInstitutionsAction.mockResolvedValue({ acronyms: ["MCC", "MPCC"] });

    await expect(
      fetchStep.run(
        { course: "https://canvas.example.edu/courses/456", institution: "" },
        testHelpers({ activeInstitution: null }),
        () => {}
      )
    ).rejects.toThrow();
  });
});
