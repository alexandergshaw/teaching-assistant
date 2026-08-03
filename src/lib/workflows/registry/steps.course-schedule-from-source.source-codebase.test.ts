// Split out of steps.course-schedule-from-source.test.ts (which had grown to
// 1304 lines, over this repo's 1000-line-per-file cap) - covers ONLY the
// "codebase" schedule source: delegating to generateSchedulePlanFromRepoAction,
// its required-field validation, error propagation, the "coding" courseKind
// resolution, and resolvedSourceMaterial pass-through (this source never
// runs TOC derivation). See steps.course-schedule-from-source.fixtures.ts
// for the shared step/testHelpers/scheduleSummary helpers every source's
// split file now imports instead of redefining.
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

import { generateSchedulePlanFromRepoAction } from "@/app/actions";
import { step, testHelpers, scheduleSummary } from "./steps.course-schedule-from-source.fixtures";

describe("source: codebase", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("delegates to generateSchedulePlanFromRepoAction and returns its schedule", async () => {
    vi.mocked(generateSchedulePlanFromRepoAction).mockResolvedValue({
      courseTitle: "CS 101",
      schedule: [
        { week: 1, topic: "Intro", summary: "s", assignmentTitle: "A1", assignmentSlug: "a1", testName: null },
        { week: 2, topic: "More", summary: "s2", assignmentTitle: "A2", assignmentSlug: "a2", testName: null },
      ],
    });

    const result = await step.run(
      { source: "codebase", repo: "org/repo", weeks: "2", tests: "0", context: "focus on basics" },
      testHelpers(),
      () => {}
    );

    expect(generateSchedulePlanFromRepoAction).toHaveBeenCalledWith(
      "org/repo",
      2,
      0,
      "gemini",
      "focus on basics"
    );
    expect(result.outputs.courseTitle).toBe("CS 101");
    expect(result.outputs.weeks).toBe(2);
    expect(scheduleSummary(result).schedule).toHaveLength(2);
  });

  it("fails with a message naming the missing field when repo is blank", async () => {
    await expect(
      step.run({ source: "codebase", repo: "" }, testHelpers(), () => {})
    ).rejects.toThrow(/Provide a repository/);
    expect(generateSchedulePlanFromRepoAction).not.toHaveBeenCalled();
  });

  it("propagates an error returned by generateSchedulePlanFromRepoAction", async () => {
    vi.mocked(generateSchedulePlanFromRepoAction).mockResolvedValue({ error: "no assignment folders" });
    await expect(
      step.run({ source: "codebase", repo: "org/repo" }, testHelpers(), () => {})
    ).rejects.toThrow("no assignment folders");
  });

  // Defect 2 (course-setup.ts's COURSE_BUILD): "codebase" (and, since AC4,
  // "tile-repo" - see that describe block below) implies a programming
  // course - this is the ONE place that mapping is allowed to live (see
  // this step's own header comment), so it must resolve here.
  it("resolves courseKind to 'coding'", async () => {
    vi.mocked(generateSchedulePlanFromRepoAction).mockResolvedValue({
      courseTitle: "CS 101",
      schedule: [
        { week: 1, topic: "Intro", summary: "s", assignmentTitle: "A1", assignmentSlug: "a1", testName: null },
      ],
    });

    const result = await step.run(
      { source: "codebase", repo: "org/repo" },
      testHelpers(),
      () => {}
    );

    expect(result.outputs.courseKind).toBe("coding");
  });

  // Defect 1: generateSchedulePlanFromRepoAction has no sourceMaterial
  // parameter at all, so this branch never runs TOC derivation - but the
  // shared "Source material" field must still pass through unchanged
  // rather than come out blank, so a hand-pasted TOC is not silently
  // dropped just because the schedule itself came from a different source.
  it("forwards the shared sourceMaterial field unchanged as resolvedSourceMaterial (no TOC derivation on this source)", async () => {
    vi.mocked(generateSchedulePlanFromRepoAction).mockResolvedValue({
      courseTitle: "CS 101",
      schedule: [
        { week: 1, topic: "Intro", summary: "s", assignmentTitle: "A1", assignmentSlug: "a1", testName: null },
      ],
    });

    const result = await step.run(
      { source: "codebase", repo: "org/repo", sourceMaterial: "Hand-pasted TOC the instructor typed" },
      testHelpers(),
      () => {}
    );

    expect(result.outputs.resolvedSourceMaterial).toBe("Hand-pasted TOC the instructor typed");
  });

  it("resolvedSourceMaterial is blank (not undefined/dropped) when no sourceMaterial was given", async () => {
    vi.mocked(generateSchedulePlanFromRepoAction).mockResolvedValue({
      courseTitle: "CS 101",
      schedule: [
        { week: 1, topic: "Intro", summary: "s", assignmentTitle: "A1", assignmentSlug: "a1", testName: null },
      ],
    });

    const result = await step.run({ source: "codebase", repo: "org/repo" }, testHelpers(), () => {});

    expect(result.outputs.resolvedSourceMaterial).toBe("");
  });
});
