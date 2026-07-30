// docs/REGRESSION.md 152 (AC4): define-course-project must converge with the
// new on-demand path (ensureCourseProject, steps.course-project.ts) on the
// SAME single project - a workflow that has BOTH this step and an earlier
// generator step that already created a project on demand must not end up
// with two projects, or a needlessly regenerated one. Two of this step's own
// PRE-EXISTING branches independently guard exactly this case for a blank
// definition + autoDefine on (the "!definition && hasProject(existing)"
// branch, and the "hasProject(existing) && !regenerate && !(autoDefine &&
// definition)" branch that follows it) - both unchanged by this feature.
// This file is their first direct test, added to prove convergence rather
// than only inferring it from reading the code (sabotage-checked: disabling
// BOTH branches together makes this test fail with a real double-generation
// attempt; disabling only one leaves the other to correctly catch it, which
// is why this test targets the OBSERVABLE outcome - no generation call,
// existing data returned - rather than pinning to a specific branch).

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/app/actions", () => ({
  listCourseHubAction: vi.fn(),
  generateCourseProjectAction: vi.fn(),
  setCourseProjectAction: vi.fn(),
}));

import { listCourseHubAction, generateCourseProjectAction, setCourseProjectAction } from "@/app/actions";
import { getStepDefinition } from "./registry";
import type { StepRunHelpers } from "./registry-helpers";
import { emptyCourseProject } from "@/lib/course-project";
import type { Course } from "@/lib/supabase/courses";

const step = getStepDefinition("define-course-project")!;

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
    name: "PM 101",
    courseCode: "PM101",
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
    weeks: 2,
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

describe("define-course-project step", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("AC4: a project already on the tile (e.g. created moments earlier by ensureCourseProject at an EARLIER step in the same run) with a blank definition and autoDefine on - left alone, no generation call at all", async () => {
    const alreadyEnsured = {
      mode: "course-long" as const,
      name: "Community Garden Launch",
      definition: "Community Garden Launch",
      brief: "Plan and pitch a community garden to the city.",
      briefFileName: "",
      milestones: [
        { week: 1, title: "Stakeholder map", deliverable: "A one-page stakeholder map." },
        { week: 2, title: "Project charter", deliverable: "A signed-off project charter." },
      ],
      generatedAt: "2024-01-01T00:00:00Z",
    };
    vi.mocked(listCourseHubAction).mockResolvedValue({
      courses: [baseCourse({ courseProject: alreadyEnsured })],
    });

    const result = await step.run(
      {
        hubCourse: "course-1",
        courseKind: "applied",
        definition: "",
        regenerate: "",
        autoDefine: "1",
      },
      testHelpers(),
      () => {}
    );

    // AC4: converges on the SAME project - never a second generation call,
    // never a second setCourseProjectAction write.
    expect(generateCourseProjectAction).not.toHaveBeenCalled();
    expect(setCourseProjectAction).not.toHaveBeenCalled();
    expect(result.outputs.projectName).toBe("Community Garden Launch");
    expect(result.outputs.milestoneCount).toBe(2);
    expect(result.summary.kind).toBe("text");
    if (result.summary.kind === "text") {
      expect(result.summary.text).toContain("left alone");
    }
  });

  it("sanity check on the branch above: with NO existing project (autoDefine on, blank definition), the step DOES generate - confirms the 'left alone' case is because a project existed, not because generation itself is broken", async () => {
    vi.mocked(listCourseHubAction).mockResolvedValue({
      courses: [baseCourse({ courseProject: emptyCourseProject() })],
    });
    vi.mocked(generateCourseProjectAction).mockResolvedValue({
      name: "Fresh Project",
      brief: "A fresh brief.",
      milestones: [{ week: 1, title: "Kickoff", deliverable: "A plan." }],
    });
    vi.mocked(setCourseProjectAction).mockResolvedValue({ ok: true });

    const result = await step.run(
      {
        hubCourse: "course-1",
        courseKind: "applied",
        definition: "",
        regenerate: "",
        autoDefine: "1",
      },
      testHelpers(),
      () => {}
    );

    expect(generateCourseProjectAction).toHaveBeenCalledTimes(1);
    expect(setCourseProjectAction).toHaveBeenCalledTimes(1);
    expect(result.outputs.projectName).toBe("Fresh Project");
  });
});
