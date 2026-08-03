// Split out of steps.course-schedule-from-source.test.ts (which had grown to
// 1304 lines, over this repo's 1000-line-per-file cap) - covers ONLY the
// "course-description" schedule source: delegating to
// generateSchedulePlanAction, its required-field validation, error
// propagation, the "applied" courseKind resolution (this source carries no
// coding signal), and every resolvedSourceMaterial case including derived-TOC
// forwarding. See steps.course-schedule-from-source.fixtures.ts for the
// shared step/testHelpers helpers every source's split file now imports
// instead of redefining.
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

import { generateSchedulePlanAction } from "@/app/actions";
import { step, testHelpers } from "./steps.course-schedule-from-source.fixtures";

describe("source: course-description", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("delegates to generateSchedulePlanAction with weeks/tests/context/sourceMaterial", async () => {
    vi.mocked(generateSchedulePlanAction).mockResolvedValue({
      courseTitle: "Intro to Testing",
      schedule: [
        { week: 1, topic: "Intro", summary: "s", assignmentTitle: "A1", assignmentSlug: "a1", testName: null },
      ],
    });

    const result = await step.run(
      {
        source: "course-description",
        description: "A course about testing",
        weeks: "1",
        tests: "0",
        context: "steer it",
        sourceMaterial: "Chapter 1: Basics",
      },
      testHelpers(),
      () => {}
    );

    expect(generateSchedulePlanAction).toHaveBeenCalledWith(
      "A course about testing",
      1,
      0,
      "gemini",
      "steer it",
      "Chapter 1: Basics"
    );
    expect(result.outputs.courseTitle).toBe("Intro to Testing");
    expect(result.outputs.weeks).toBe(1);
  });

  it("fails with a message naming the missing field when description is blank", async () => {
    await expect(
      step.run({ source: "course-description", description: "  " }, testHelpers(), () => {})
    ).rejects.toThrow(/Provide a course description/);
    expect(generateSchedulePlanAction).not.toHaveBeenCalled();
  });

  it("propagates an error returned by generateSchedulePlanAction", async () => {
    vi.mocked(generateSchedulePlanAction).mockResolvedValue({ error: "Enter a number of weeks between 1 and 52." });
    await expect(
      step.run({ source: "course-description", description: "A course" }, testHelpers(), () => {})
    ).rejects.toThrow("Enter a number of weeks between 1 and 52.");
  });

  it("resolves courseKind to 'applied' (not a code-implying source)", async () => {
    vi.mocked(generateSchedulePlanAction).mockResolvedValue({
      courseTitle: "Intro to Testing",
      schedule: [
        { week: 1, topic: "Intro", summary: "s", assignmentTitle: "A1", assignmentSlug: "a1", testName: null },
      ],
    });

    const result = await step.run(
      { source: "course-description", description: "A course about testing" },
      testHelpers(),
      () => {}
    );

    expect(result.outputs.courseKind).toBe("applied");
  });

  // Defect 1: the SAME contract generate-schedule's own resolvedSourceMaterial
  // output uses (registry.generate-schedule.test.ts) - forwards the
  // sourceMaterial actually used when generateSchedulePlanAction found no
  // derived TOC (a pasted TOC, or a name-only citation with no derivation).
  it("resolvedSourceMaterial is the pasted sourceMaterial unchanged when no derivation occurred", async () => {
    vi.mocked(generateSchedulePlanAction).mockResolvedValue({
      courseTitle: "Intro to Testing",
      schedule: [
        { week: 1, topic: "Intro", summary: "s", assignmentTitle: "A1", assignmentSlug: "a1", testName: null },
      ],
    });

    const result = await step.run(
      {
        source: "course-description",
        description: "A course about testing",
        sourceMaterial: "Chapter 1: Basics\nChapter 2: Advanced",
      },
      testHelpers(),
      () => {}
    );

    expect(result.outputs.resolvedSourceMaterial).toBe("Chapter 1: Basics\nChapter 2: Advanced");
  });

  it("resolvedSourceMaterial is the derived TOC when generateSchedulePlanAction found one", async () => {
    const derivedToc = "Module 1: Introduction\nModule 2: Footprinting";
    vi.mocked(generateSchedulePlanAction).mockResolvedValue({
      courseTitle: "CEH v12",
      schedule: [
        { week: 1, topic: "Intro", summary: "s", assignmentTitle: "A1", assignmentSlug: "a1", testName: null },
      ],
      derivedToc,
      derivedSources: [{ title: "uCertify CEH v12 course outline", uri: "https://example.com/toc" }],
    });

    const result = await step.run(
      {
        source: "course-description",
        description: "A CEH prep course",
        sourceMaterial: "https://www.ucertify.com/app/?func=load_course&course=CEH-v12.AE1",
      },
      testHelpers(),
      () => {}
    );

    expect(result.outputs.resolvedSourceMaterial).toBe(derivedToc);
  });

  it("resolvedSourceMaterial is blank when no sourceMaterial was given", async () => {
    vi.mocked(generateSchedulePlanAction).mockResolvedValue({
      courseTitle: "Intro to Testing",
      schedule: [
        { week: 1, topic: "Intro", summary: "s", assignmentTitle: "A1", assignmentSlug: "a1", testName: null },
      ],
    });

    const result = await step.run(
      { source: "course-description", description: "A course about testing" },
      testHelpers(),
      () => {}
    );

    expect(result.outputs.resolvedSourceMaterial).toBe("");
  });
});
