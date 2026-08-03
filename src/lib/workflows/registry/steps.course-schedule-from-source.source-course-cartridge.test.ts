// Split out of steps.course-schedule-from-source.test.ts (which had grown to
// 1304 lines, over this repo's 1000-line-per-file cap) - covers ONLY the
// "course-cartridge" (.imscc upload) schedule source: mapping the parsed
// cartridge's modules through the shared courseStructureToSchedule
// normalizer, title fallbacks (hubCourse tile name, then a generic default),
// required-field validation, the "applied" courseKind resolution (a
// cartridge carries no coding signal), and resolvedSourceMaterial
// pass-through. See steps.course-schedule-from-source.fixtures.ts for the
// shared step/testHelpers/scheduleSummary/cartridgeFile helpers - cartridgeFile
// in particular is shared with the placeholder-topic-guard split file, which
// exercises this SAME source.
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

import { listCourseHubAction } from "@/app/actions";
import { parseCartridgeBlob } from "@/lib/cartridge-import";
import { step, testHelpers, scheduleSummary, cartridgeFile } from "./steps.course-schedule-from-source.fixtures";

describe("source: course-cartridge", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("maps the parsed cartridge's modules through the shared normalizer", async () => {
    vi.mocked(parseCartridgeBlob).mockResolvedValue({
      title: "Biology 101",
      courseCode: null,
      startAt: null,
      syllabusHtml: null,
      modules: [
        { name: "Module 1", position: 1, items: [{ title: "Syllabus", type: "" }, { title: "  ", type: "" }] },
        { name: "Module 2", position: 2, items: [{ title: "Reading", type: "" }] },
      ],
      rubrics: [],
      hasCourseSettings: true,
    });

    const result = await step.run(
      { source: "course-cartridge", cartridge: [cartridgeFile()] },
      testHelpers(),
      () => {}
    );

    expect(parseCartridgeBlob).toHaveBeenCalledTimes(1);
    expect(result.outputs.courseTitle).toBe("Biology 101");
    expect(result.outputs.weeks).toBe(2);
    const summary = scheduleSummary(result);
    expect(summary.schedule[0]).toMatchObject({ week: 1, topic: "Module 1", summary: "Covers: Syllabus" });
    expect(summary.schedule[1]).toMatchObject({ week: 2, topic: "Module 2", summary: "Covers: Reading" });
    // Defect 2: a cartridge carries no coding signal, so it keeps today's
    // "applied" default - only "codebase" implies a programming course.
    expect(result.outputs.courseKind).toBe("applied");
  });

  it("forwards the shared sourceMaterial field unchanged as resolvedSourceMaterial (no TOC derivation on this source)", async () => {
    vi.mocked(parseCartridgeBlob).mockResolvedValue({
      title: "Biology 101",
      courseCode: null,
      startAt: null,
      syllabusHtml: null,
      modules: [{ name: "Module 1", position: 1, items: [{ title: "Syllabus", type: "" }] }],
      rubrics: [],
      hasCourseSettings: true,
    });

    const result = await step.run(
      {
        source: "course-cartridge",
        cartridge: [cartridgeFile()],
        sourceMaterial: "Hand-pasted TOC the instructor typed",
      },
      testHelpers(),
      () => {}
    );

    expect(result.outputs.resolvedSourceMaterial).toBe("Hand-pasted TOC the instructor typed");
  });

  it("falls back to the hubCourse tile's name when the cartridge has no title", async () => {
    vi.mocked(parseCartridgeBlob).mockResolvedValue({
      title: null,
      courseCode: null,
      startAt: null,
      syllabusHtml: null,
      modules: [{ name: "Module 1", position: 1, items: [] }],
      rubrics: [],
      hasCourseSettings: true,
    });
    vi.mocked(listCourseHubAction).mockResolvedValue({
      courses: [{ id: "tile-1", name: "Fallback Course Name" } as never],
    });

    const result = await step.run(
      { source: "course-cartridge", cartridge: [cartridgeFile()], hubCourse: "tile-1" },
      testHelpers(),
      () => {}
    );

    expect(result.outputs.courseTitle).toBe("Fallback Course Name");
  });

  it("falls back to a generic title when the cartridge has no title and no hubCourse is bound", async () => {
    vi.mocked(parseCartridgeBlob).mockResolvedValue({
      title: null,
      courseCode: null,
      startAt: null,
      syllabusHtml: null,
      modules: [{ name: "Module 1", position: 1, items: [] }],
      rubrics: [],
      hasCourseSettings: true,
    });

    const result = await step.run(
      { source: "course-cartridge", cartridge: [cartridgeFile()] },
      testHelpers(),
      () => {}
    );

    expect(result.outputs.courseTitle).toBe("Course");
    expect(listCourseHubAction).not.toHaveBeenCalled();
  });

  it("fails with a message naming the missing field when no cartridge is uploaded", async () => {
    await expect(
      step.run({ source: "course-cartridge", cartridge: [] }, testHelpers(), () => {})
    ).rejects.toThrow(/Upload a course cartridge/);
    expect(parseCartridgeBlob).not.toHaveBeenCalled();
  });

  it("fails rather than reporting success when the cartridge has no modules", async () => {
    vi.mocked(parseCartridgeBlob).mockResolvedValue({
      title: "Empty Course",
      courseCode: null,
      startAt: null,
      syllabusHtml: null,
      modules: [],
      rubrics: [],
      hasCourseSettings: true,
    });

    await expect(
      step.run({ source: "course-cartridge", cartridge: [cartridgeFile()] }, testHelpers(), () => {})
    ).rejects.toThrow(/no weeks were produced/);
  });
});
