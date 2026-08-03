// Split out of steps.course-schedule-from-source.test.ts (which had grown to
// 1304 lines, over this repo's 1000-line-per-file cap) - covers ONLY the
// "tile-repo" schedule source (AC5: the seventh source, resolving the
// repository already linked on the selected course tile's own row): reusing
// the existing "hubCourse" input, delegating to
// generateSchedulePlanFromRepoAction via the SAME positional call shape and
// underlying scheduleFromRepo path the codebase source uses (cross-checked
// directly against that source's own output), always picking the FIRST
// linked repo, the "coding" courseKind resolution, naming the tile (never a
// silent empty schedule) when no repo is linked, and resolvedSourceMaterial
// pass-through. See steps.course-schedule-from-source.fixtures.ts for the
// shared step/testHelpers/scheduleSummary helpers every source's split file
// now imports instead of redefining.
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

import { listCourseHubAction, generateSchedulePlanFromRepoAction } from "@/app/actions";
import { step, testHelpers, scheduleSummary } from "./steps.course-schedule-from-source.fixtures";

describe("source: tile-repo", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // The seventh source - the repository already linked on the selected
  // course tile's own row (src/lib/supabase/courses.ts's `repos` column,
  // CourseRepo[]). Unlike tile-export (which needs helpers.loadCourseExport
  // to reach Supabase Storage), resolving a tile's own repo needs nothing
  // but the course row listCourseHubAction already returns, so these tests
  // mock only listCourseHubAction and generateSchedulePlanFromRepoAction -
  // no loadCourseExport helper is involved at all.
  function hubTileWithRepos(
    repos: { repo: string; branch: string | null }[],
    overrides: Partial<{ id: string; name: string }> = {}
  ) {
    return {
      id: overrides.id ?? "tile-1",
      name: overrides.name ?? "Biology 101",
      repos,
    } as never;
  }

  it("delegates to generateSchedulePlanFromRepoAction with the tile's own repo, via the SAME positional call shape the codebase source uses", async () => {
    vi.mocked(listCourseHubAction).mockResolvedValue({
      courses: [hubTileWithRepos([{ repo: "org/bio-repo", branch: "main" }])],
    });
    vi.mocked(generateSchedulePlanFromRepoAction).mockResolvedValue({
      courseTitle: "Biology 101",
      schedule: [
        { week: 1, topic: "Intro", summary: "s", assignmentTitle: "A1", assignmentSlug: "a1", testName: null },
        { week: 2, topic: "More", summary: "s2", assignmentTitle: "A2", assignmentSlug: "a2", testName: null },
      ],
    });

    const result = await step.run(
      { source: "tile-repo", hubCourse: "tile-1", weeks: "2", tests: "0", context: "focus on basics" },
      testHelpers(),
      () => {}
    );

    // Same positional args the "source: codebase" test above pins -
    // (repo, weeks, tests, provider, context) - proof this source funnels
    // through the identical generateSchedulePlanFromRepoAction call.
    expect(generateSchedulePlanFromRepoAction).toHaveBeenCalledWith(
      "org/bio-repo",
      2,
      0,
      "gemini",
      "focus on basics"
    );
    expect(result.outputs.courseTitle).toBe("Biology 101");
    expect(result.outputs.weeks).toBe(2);
    expect(scheduleSummary(result).schedule).toHaveLength(2);
  });

  // AC1's direct cross-check: given the SAME repo string (one typed/picked,
  // one read off the tile's row) and the same weeks/tests, the codebase
  // and tile-repo sources must produce byte-identical outputs - proof they
  // share the SAME underlying path (the step's own `scheduleFromRepo`
  // closure), not two implementations that merely look alike.
  it("agrees with the codebase source given an equivalent repo (both route through the same scheduleFromRepo path)", async () => {
    const schedule = [
      { week: 1, topic: "Intro", summary: "s", assignmentTitle: "A1", assignmentSlug: "a1", testName: null },
    ];
    vi.mocked(generateSchedulePlanFromRepoAction).mockResolvedValue({
      courseTitle: "CS 101",
      schedule,
    });

    const codebaseResult = await step.run(
      { source: "codebase", repo: "org/repo", weeks: "1", tests: "0" },
      testHelpers(),
      () => {}
    );

    vi.mocked(listCourseHubAction).mockResolvedValue({
      courses: [hubTileWithRepos([{ repo: "org/repo", branch: null }])],
    });
    const tileRepoResult = await step.run(
      { source: "tile-repo", hubCourse: "tile-1", weeks: "1", tests: "0" },
      testHelpers(),
      () => {}
    );

    expect(tileRepoResult.outputs).toEqual(codebaseResult.outputs);
    expect(scheduleSummary(tileRepoResult).schedule).toEqual(scheduleSummary(codebaseResult).schedule);
  });

  // AC2's multi-repo rule: repos[0], the FIRST linked repository - never
  // "newest" (CourseRepo carries no timestamp to rank by) and never a
  // choice forced onto the instructor (this source asks for nothing beyond
  // the tile already selected).
  it("uses the FIRST repo when the tile has several linked", async () => {
    vi.mocked(listCourseHubAction).mockResolvedValue({
      courses: [
        hubTileWithRepos([
          { repo: "org/first-repo", branch: null },
          { repo: "org/second-repo", branch: null },
        ]),
      ],
    });
    vi.mocked(generateSchedulePlanFromRepoAction).mockResolvedValue({
      courseTitle: "Biology 101",
      schedule: [
        { week: 1, topic: "Intro", summary: "s", assignmentTitle: "A1", assignmentSlug: "a1", testName: null },
      ],
    });

    await step.run({ source: "tile-repo", hubCourse: "tile-1" }, testHelpers(), () => {});

    expect(generateSchedulePlanFromRepoAction).toHaveBeenCalledWith(
      "org/first-repo",
      null,
      null,
      "gemini",
      undefined
    );
  });

  // AC4: the same kind of input as "codebase" (a repository), so it must
  // resolve to the same course kind.
  it("resolves courseKind to 'coding'", async () => {
    vi.mocked(listCourseHubAction).mockResolvedValue({
      courses: [hubTileWithRepos([{ repo: "org/bio-repo", branch: null }])],
    });
    vi.mocked(generateSchedulePlanFromRepoAction).mockResolvedValue({
      courseTitle: "Biology 101",
      schedule: [
        { week: 1, topic: "Intro", summary: "s", assignmentTitle: "A1", assignmentSlug: "a1", testName: null },
      ],
    });

    const result = await step.run({ source: "tile-repo", hubCourse: "tile-1" }, testHelpers(), () => {});

    expect(result.outputs.courseKind).toBe("coding");
  });

  it("fails with a message naming the missing field when no course tile is chosen", async () => {
    await expect(
      step.run({ source: "tile-repo", hubCourse: "" }, testHelpers(), () => {})
    ).rejects.toThrow(/Choose a course tile/);
    expect(generateSchedulePlanFromRepoAction).not.toHaveBeenCalled();
  });

  // AC3: never a silent empty schedule - the error names the TILE, exactly
  // as the tile-export source's own missing-export test above does.
  it("fails with a message naming the tile - never a silent empty schedule - when the tile has no repository linked", async () => {
    vi.mocked(listCourseHubAction).mockResolvedValue({
      courses: [hubTileWithRepos([], { name: "Biology 101 (Fall)" })],
    });

    await expect(
      step.run({ source: "tile-repo", hubCourse: "tile-1" }, testHelpers(), () => {})
    ).rejects.toThrow(/Biology 101 \(Fall\)/);
    expect(generateSchedulePlanFromRepoAction).not.toHaveBeenCalled();
  });

  it("falls back to naming the raw tile id when the tile's own name cannot be resolved either", async () => {
    vi.mocked(listCourseHubAction).mockResolvedValue({ error: "network down" });

    await expect(
      step.run({ source: "tile-repo", hubCourse: "tile-404" }, testHelpers(), () => {})
    ).rejects.toThrow(/tile-404/);
  });

  it("forwards the shared sourceMaterial field unchanged as resolvedSourceMaterial (no TOC derivation on this source, same as codebase)", async () => {
    vi.mocked(listCourseHubAction).mockResolvedValue({
      courses: [hubTileWithRepos([{ repo: "org/bio-repo", branch: null }])],
    });
    vi.mocked(generateSchedulePlanFromRepoAction).mockResolvedValue({
      courseTitle: "Biology 101",
      schedule: [
        { week: 1, topic: "Intro", summary: "s", assignmentTitle: "A1", assignmentSlug: "a1", testName: null },
      ],
    });

    const result = await step.run(
      { source: "tile-repo", hubCourse: "tile-1", sourceMaterial: "Hand-pasted TOC the instructor typed" },
      testHelpers(),
      () => {}
    );

    expect(result.outputs.resolvedSourceMaterial).toBe("Hand-pasted TOC the instructor typed");
  });
});
