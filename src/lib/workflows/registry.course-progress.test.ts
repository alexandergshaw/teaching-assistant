import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/app/actions", () => ({
  listCourseHubAction: vi.fn(),
  listAssignmentDueDatesByUrlAction: vi.fn(),
  listCourseContentAction: vi.fn(),
}));

import { listCourseHubAction } from "@/app/actions";
import { getStepDefinition } from "./registry";
import type { StepRunHelpers } from "./registry-helpers";
import type { Course } from "@/lib/supabase/courses";
import { parseLmsModuleValue } from "./module-value";

const step = getStepDefinition("course-progress")!;

function testHelpers(): StepRunHelpers {
  return {
    activeInstitution: null,
    provider: "gemini",
    author: "Test Author",
    saveBundle: null,
    saveCourseMaterialFile: null,
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
    materialsFiles: [],
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

describe("course-progress step - moduleRef output (AC3)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("in-progress: moduleRef is a name-reference value wrapping moduleName, moduleName stays a plain text output", async () => {
    const tile = baseCourse({
      id: "course-1",
      canvasUrl: null,
      // 3 weeks ago: well within an in-progress course.
      startDate: new Date(Date.now() - 3 * 7 * 24 * 3600 * 1000).toISOString(),
      weeks: 15,
    });
    vi.mocked(listCourseHubAction).mockResolvedValue({ courses: [tile] });

    const result = await step.run({ hubCourse: "course-1" }, testHelpers(), noProgress);

    expect(result.outputs.status).toBe("in-progress");
    const moduleName = result.outputs.moduleName as string;
    expect(moduleName).toMatch(/^Module \d{2}/);
    const moduleRef = result.outputs.moduleRef as string;
    expect(moduleRef).toBe(`name|${moduleName}`);
    const parsed = parseLmsModuleValue(moduleRef);
    expect(parsed).toEqual({ liveId: null, name: moduleName, fromExport: false, byName: true });
  });

  it("not-started: moduleRef is the RAW sentinel text (not wrapped), moduleName unchanged", async () => {
    const tile = baseCourse({
      id: "course-1",
      canvasUrl: null,
      startDate: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString(),
    });
    vi.mocked(listCourseHubAction).mockResolvedValue({ courses: [tile] });

    const result = await step.run({ hubCourse: "course-1" }, testHelpers(), noProgress);

    expect(result.outputs.status).toBe("not-started");
    expect(result.outputs.moduleName).toBe("Not started");
    expect(result.outputs.moduleRef).toBe("Not started");
  });

  it("complete: moduleRef is the RAW sentinel text (not wrapped), moduleName unchanged", async () => {
    const tile = baseCourse({
      id: "course-1",
      canvasUrl: null,
      startDate: new Date(Date.now() - 400 * 24 * 3600 * 1000).toISOString(),
      weeks: 2,
    });
    vi.mocked(listCourseHubAction).mockResolvedValue({ courses: [tile] });

    const result = await step.run({ hubCourse: "course-1" }, testHelpers(), noProgress);

    expect(result.outputs.status).toBe("complete");
    expect(result.outputs.moduleName).toBe("Complete");
    expect(result.outputs.moduleRef).toBe("Complete");
  });

  it("declares a moduleRef output of type lmsModule alongside the unchanged moduleName text output", () => {
    const moduleNameOutput = step.outputs.find((o) => o.key === "moduleName");
    const moduleRefOutput = step.outputs.find((o) => o.key === "moduleRef");
    expect(moduleNameOutput).toEqual({ key: "moduleName", label: "Current module", type: "text" });
    expect(moduleRefOutput).toEqual({ key: "moduleRef", label: "Current module (reference)", type: "lmsModule" });
  });
});
