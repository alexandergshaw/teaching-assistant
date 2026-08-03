// F3 (course-tile-authoritative-kind fix): course-schedule-from-source is
// the ONE place COURSE_BUILD's course kind is resolved (see that step's own
// header comment), so this is where the course tile's own explicit
// "courseKind" column (src/lib/supabase/courses.ts's `Course.courseKind` -
// null until an instructor sets it on the tile) must be consulted.
//
// THE PRECEDENCE RULE: the tile's own stored value WINS whenever it is set
// (exactly "coding" or "applied" - src/lib/course-kind.ts's own
// courseKindOrNull, which returns null for anything else, including unset).
// The existing source-derived value (source is "codebase"/"tile-repo" ->
// "coding", every other source -> "applied") applies ONLY when the tile has
// no explicit value - so a tile that predates this column (courseKind is
// null, the only state possible before this feature shipped) gets EXACTLY
// today's source-derived behavior, unchanged.
//
// Split into its own file (matching how presets.course-build.scope.test.ts
// was split out of presets.course-build.test.ts) rather than growing
// steps.course-schedule-from-source.test.ts, which is already at this
// repo's 1000-line-per-file cap.
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

// Matches steps.course-schedule-from-source.test.ts's own hubTileWithRepos
// convention: a minimal tile fixture, cast past Course's full shape (`as
// never`) since only the fields this step actually reads matter here.
function hubTile(overrides: Partial<{ id: string; name: string; courseKind: string | null; repos: unknown[] }> = {}) {
  return {
    id: overrides.id ?? "tile-1",
    name: overrides.name ?? "CS Principles",
    courseKind: overrides.courseKind ?? null,
    repos: overrides.repos ?? [],
  } as never;
}

describe("course-schedule-from-source: F3 course-kind precedence (tile value wins when set)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("F3: a tile's explicit courseKind ('coding') OVERRIDES a course-description source's own 'applied' derivation - a CS Principles course built from a description can be a coding course", async () => {
    vi.mocked(listCourseHubAction).mockResolvedValue({
      courses: [hubTile({ courseKind: "coding" })],
    });
    vi.mocked(generateSchedulePlanAction).mockResolvedValue({
      courseTitle: "CS Principles",
      schedule: [
        { week: 1, topic: "Intro", summary: "s", assignmentTitle: "A1", assignmentSlug: "a1", testName: null },
      ],
    });

    const result = await step.run(
      { source: "course-description", description: "A CS Principles course", hubCourse: "tile-1" },
      testHelpers(),
      () => {}
    );

    expect(result.outputs.courseKind).toBe("coding");
  });

  it("F3: a tile's explicit courseKind ('applied') OVERRIDES a codebase source's own 'coding' derivation - precedence is not one-directional", async () => {
    vi.mocked(listCourseHubAction).mockResolvedValue({
      courses: [hubTile({ courseKind: "applied" })],
    });
    vi.mocked(generateSchedulePlanFromRepoAction).mockResolvedValue({
      courseTitle: "Ethics in Tech",
      schedule: [
        { week: 1, topic: "Intro", summary: "s", assignmentTitle: null, assignmentSlug: null, testName: null },
      ],
    });

    const result = await step.run(
      { source: "codebase", repo: "org/repo", hubCourse: "tile-1" },
      testHelpers(),
      () => {}
    );

    expect(result.outputs.courseKind).toBe("applied");
    // isCodebase and repo stay tied to the structural fact "is a repository
    // actually anchoring this run" - F3 only overrides the PEDAGOGY signal
    // (courseKind), never these two, which the codebase output family and
    // the Start-Here GitHub sign-up gate depend on.
    expect(result.outputs.isCodebase).toBe("1");
    expect(result.outputs.repo).toBe("org/repo");
  });

  it("F3 backfill guarantee: a tile with NO courseKind set (null - the only state possible before this column existed) behaves EXACTLY as before - the source-derived value applies unchanged", async () => {
    vi.mocked(listCourseHubAction).mockResolvedValue({
      courses: [hubTile({ courseKind: null })],
    });
    vi.mocked(generateSchedulePlanAction).mockResolvedValue({
      courseTitle: "Intro to Testing",
      schedule: [
        { week: 1, topic: "Intro", summary: "s", assignmentTitle: "A1", assignmentSlug: "a1", testName: null },
      ],
    });

    const result = await step.run(
      { source: "course-description", description: "A course about testing", hubCourse: "tile-1" },
      testHelpers(),
      () => {}
    );

    // course-description is not a code-implying source, so the unchanged
    // source-derivation rule (steps.course-schedule-from-source.ts's own
    // header comment) still resolves this to "applied" - byte-identical to
    // the pre-F3 behavior this exact scenario already had.
    expect(result.outputs.courseKind).toBe("applied");
  });

  it("F3 backfill guarantee: no hubCourse bound at all (never resolves a tile) behaves exactly as before - purely source-derived", async () => {
    vi.mocked(generateSchedulePlanFromRepoAction).mockResolvedValue({
      courseTitle: "CS 101",
      schedule: [
        { week: 1, topic: "Intro", summary: "s", assignmentTitle: null, assignmentSlug: null, testName: null },
      ],
    });

    const result = await step.run({ source: "codebase", repo: "org/repo" }, testHelpers(), () => {});

    expect(result.outputs.courseKind).toBe("coding");
    // listCourseHubAction must never be called when there is no tile to
    // resolve - resolveHubTile's own early-return guard (course-schedule-
    // from-source.ts) short-circuits on a blank hubCourseId.
    expect(listCourseHubAction).not.toHaveBeenCalled();
  });

  it("F3: an invalid/garbage tile courseKind value is treated as unset (courseKindOrNull), falling back to the source-derived value rather than propagating garbage", async () => {
    vi.mocked(listCourseHubAction).mockResolvedValue({
      courses: [hubTile({ courseKind: "not-a-real-kind" })],
    });
    vi.mocked(generateSchedulePlanAction).mockResolvedValue({
      courseTitle: "Intro to Testing",
      schedule: [
        { week: 1, topic: "Intro", summary: "s", assignmentTitle: "A1", assignmentSlug: "a1", testName: null },
      ],
    });

    const result = await step.run(
      { source: "course-description", description: "A course about testing", hubCourse: "tile-1" },
      testHelpers(),
      () => {}
    );

    expect(result.outputs.courseKind).toBe("applied");
  });
});

// AC5/F5 (docs/REGRESSION.md entry 196): a THIRD tier - a "coding" signal
// read off the course NAME - now sits between tileKind and sourceDerivedKind.
// courseKindFromCourseName (course-kind.ts) can only ever return "coding" or
// null, so it can upgrade sourceDerivedKind's evidence-free "applied" default
// but can never overturn an explicit tile override. Full precedence:
// tileKind ?? nameKind ?? sourceDerivedKind.
describe("course-schedule-from-source: F5 name-derived course-kind (the new middle tier)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("F5: name beats source-derived - a coding-vocabulary courseTitle overrides a non-code source's evidence-free 'applied' default when no tile courseKind is set", async () => {
    vi.mocked(listCourseHubAction).mockResolvedValue({
      courses: [hubTile({ courseKind: null })],
    });
    vi.mocked(generateSchedulePlanAction).mockResolvedValue({
      // The actual defect course (REGRESSION.md entry 196 AC0).
      courseTitle: "INFO 1020 - Computer Science Principles",
      schedule: [
        { week: 1, topic: "Intro", summary: "s", assignmentTitle: "A1", assignmentSlug: "a1", testName: null },
      ],
    });

    const result = await step.run(
      { source: "course-description", description: "A course description", hubCourse: "tile-1" },
      testHelpers(),
      () => {}
    );

    // course-description's own sourceDerivedKind is "applied" - the name
    // signal is what flips this to "coding".
    expect(result.outputs.courseKind).toBe("coding");
  });

  it("F5: tile kind still beats name - an explicit tile courseKind of 'applied' overrides a coding-vocabulary courseTitle", async () => {
    vi.mocked(listCourseHubAction).mockResolvedValue({
      courses: [hubTile({ courseKind: "applied" })],
    });
    vi.mocked(generateSchedulePlanAction).mockResolvedValue({
      courseTitle: "INFO 1020 - Computer Science Principles",
      schedule: [
        { week: 1, topic: "Intro", summary: "s", assignmentTitle: "A1", assignmentSlug: "a1", testName: null },
      ],
    });

    const result = await step.run(
      { source: "course-description", description: "A course description", hubCourse: "tile-1" },
      testHelpers(),
      () => {}
    );

    // The explicit tile override still wins over everything, even a strong
    // name signal - precedence is tileKind FIRST, unconditionally.
    expect(result.outputs.courseKind).toBe("applied");
  });

  it("F5: nameKind falls back to the tile's own name when the resolved courseTitle itself carries no signal", async () => {
    vi.mocked(listCourseHubAction).mockResolvedValue({
      courses: [hubTile({ courseKind: null, name: "INFO 1020 - Computer Science Principles" })],
    });
    vi.mocked(generateSchedulePlanAction).mockResolvedValue({
      // The source's OWN title carries no coding signal and differs from
      // the tile's name - only the tile name (checked second) matches.
      courseTitle: "Intro to Testing",
      schedule: [
        { week: 1, topic: "Intro", summary: "s", assignmentTitle: "A1", assignmentSlug: "a1", testName: null },
      ],
    });

    const result = await step.run(
      { source: "course-description", description: "A course description", hubCourse: "tile-1" },
      testHelpers(),
      () => {}
    );

    expect(result.outputs.courseTitle).toBe("Intro to Testing");
    expect(result.outputs.courseKind).toBe("coding");
  });

  it("F5: sourceDerivedKind still applies when neither tileKind nor nameKind fires - neither the courseTitle nor the tile's name carries a coding signal", async () => {
    vi.mocked(listCourseHubAction).mockResolvedValue({
      courses: [hubTile({ courseKind: null, name: "Intro to Testing" })],
    });
    vi.mocked(generateSchedulePlanAction).mockResolvedValue({
      courseTitle: "Business Ethics",
      schedule: [
        { week: 1, topic: "Intro", summary: "s", assignmentTitle: "A1", assignmentSlug: "a1", testName: null },
      ],
    });

    const result = await step.run(
      { source: "course-description", description: "A course description", hubCourse: "tile-1" },
      testHelpers(),
      () => {}
    );

    expect(result.outputs.courseKind).toBe("applied");
  });
});
