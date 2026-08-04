// Split out of steps.course-schedule-from-source.test.ts (which was already
// at this repo's 1000-line-per-file cap before this feature - adding more
// assertions there would have pushed it further over, not brought it back
// under) - covers ONLY the "repo"/"isCodebase" outputs (Codebase-and-
// associated-assignments/Start-Here output families, output-selection.ts;
// see this step's own header comment in steps.course-schedule-from-source.ts
// for the full contract): non-blank/"1" on the two codebase-anchored sources
// ("codebase", "tile-repo"), blank/"" on every other source. steps.course-
// build-codebase.ts's "resolve-codebase-repo" (the "repo" consumer) and
// course-build.ts's "include-starter-materials.includeGithub" bindOverride (the "isCodebase"
// consumer) both have their own dedicated tests for their own logic; this
// file only proves the producer side.
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/app/actions", () => ({
  generateSchedulePlanAction: vi.fn(),
  generateSchedulePlanFromRepoAction: vi.fn(),
  listCourseContentAction: vi.fn(),
  listCourseHubAction: vi.fn(),
  extractSyllabusTextAction: vi.fn(),
}));

vi.mock("@/lib/cartridge-import", () => ({
  parseCartridgeBlob: vi.fn(),
}));

import {
  generateSchedulePlanAction,
  generateSchedulePlanFromRepoAction,
  listCourseHubAction,
} from "@/app/actions";
import { courseScheduleFromSourceSteps } from "./steps.course-schedule-from-source";
import type { StepRunHelpers } from "../registry-helpers";

const step = courseScheduleFromSourceSteps.find((s) => s.type === "course-schedule-from-source")!;

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

const oneWeekSchedule = [
  { week: 1, topic: "Intro", summary: "s", assignmentTitle: "A1", assignmentSlug: "a1", testName: null },
];

describe("course-schedule-from-source step - repo/isCodebase outputs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("source: codebase - repo is the typed/picked repo string, isCodebase is '1'", async () => {
    vi.mocked(generateSchedulePlanFromRepoAction).mockResolvedValue({
      courseTitle: "CS 101",
      schedule: oneWeekSchedule,
    });

    const result = await step.run({ source: "codebase", repo: "org/repo" }, testHelpers(), () => {});

    expect(result.outputs.repo).toBe("org/repo");
    expect(result.outputs.isCodebase).toBe("1");
  });

  it("source: tile-repo - repo is the tile's own linked repo, isCodebase is '1'", async () => {
    vi.mocked(listCourseHubAction).mockResolvedValue({
      courses: [{ id: "tile-1", name: "Biology 101", repos: [{ repo: "org/bio-repo", branch: "main" }] } as never],
    });
    vi.mocked(generateSchedulePlanFromRepoAction).mockResolvedValue({
      courseTitle: "Biology 101",
      schedule: oneWeekSchedule,
    });

    const result = await step.run({ source: "tile-repo", hubCourse: "tile-1" }, testHelpers(), () => {});

    expect(result.outputs.repo).toBe("org/bio-repo");
    expect(result.outputs.isCodebase).toBe("1");
  });

  it("source: course-description (not codebase-anchored) - both repo and isCodebase are blank", async () => {
    vi.mocked(generateSchedulePlanAction).mockResolvedValue({
      courseTitle: "Intro to Testing",
      schedule: oneWeekSchedule,
    });

    const result = await step.run(
      { source: "course-description", description: "A course about testing" },
      testHelpers(),
      () => {}
    );

    expect(result.outputs.repo).toBe("");
    expect(result.outputs.isCodebase).toBe("");
  });
});
