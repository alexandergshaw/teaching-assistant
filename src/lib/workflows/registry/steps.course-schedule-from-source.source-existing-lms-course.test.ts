// Split out of steps.course-schedule-from-source.test.ts (which had grown to
// 1304 lines, over this repo's 1000-line-per-file cap) - covers ONLY the
// "existing-lms-course" schedule source: mapping the live Canvas course's
// modules (via listCourseContentAction) through the shared normalizer,
// required-field validation, error propagation, the "applied" courseKind
// resolution (an existing LMS course carries no coding signal), and
// resolvedSourceMaterial pass-through. See
// steps.course-schedule-from-source.fixtures.ts for the shared
// step/testHelpers/scheduleSummary helpers every source's split file now
// imports instead of redefining.
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

import { listCourseContentAction } from "@/app/actions";
import { step, testHelpers, scheduleSummary } from "./steps.course-schedule-from-source.fixtures";

describe("source: existing-lms-course", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("maps the live course's modules through the shared normalizer", async () => {
    vi.mocked(listCourseContentAction).mockResolvedValue({
      courseName: "History 201",
      modules: [
        {
          id: 1,
          name: "Week 1",
          position: 1,
          published: true,
          itemsCount: 1,
          items: [
            { id: 1, moduleId: 1, title: "Overview", type: "Page", position: 1, indent: 0, published: true, pageUrl: "overview", contentId: null, dueAt: null, pointsPossible: null, htmlUrl: null, externalUrl: null },
          ],
        },
      ],
      pages: [],
    });

    const result = await step.run(
      { source: "existing-lms-course", lmsCourse: "https://canvas.example.edu/courses/1" },
      testHelpers({ activeInstitution: "UT" }),
      () => {}
    );

    expect(listCourseContentAction).toHaveBeenCalledWith("https://canvas.example.edu/courses/1", "UT");
    expect(result.outputs.courseTitle).toBe("History 201");
    const summary = scheduleSummary(result);
    expect(summary.schedule[0]).toMatchObject({ topic: "Week 1", summary: "Covers: Overview" });
    // Defect 2: an existing LMS course carries no coding signal, so it
    // keeps today's "applied" default - only "codebase" implies coding.
    expect(result.outputs.courseKind).toBe("applied");
  });

  it("forwards the shared sourceMaterial field unchanged as resolvedSourceMaterial (no TOC derivation on this source)", async () => {
    vi.mocked(listCourseContentAction).mockResolvedValue({
      courseName: "History 201",
      modules: [
        {
          id: 1,
          name: "Week 1",
          position: 1,
          published: true,
          itemsCount: 1,
          items: [
            { id: 1, moduleId: 1, title: "Overview", type: "Page", position: 1, indent: 0, published: true, pageUrl: "overview", contentId: null, dueAt: null, pointsPossible: null, htmlUrl: null, externalUrl: null },
          ],
        },
      ],
      pages: [],
    });

    const result = await step.run(
      {
        source: "existing-lms-course",
        lmsCourse: "https://canvas.example.edu/courses/1",
        sourceMaterial: "Hand-pasted TOC the instructor typed",
      },
      testHelpers({ activeInstitution: "UT" }),
      () => {}
    );

    expect(result.outputs.resolvedSourceMaterial).toBe("Hand-pasted TOC the instructor typed");
  });

  it("fails with a message naming the missing field when no LMS course is selected", async () => {
    await expect(
      step.run({ source: "existing-lms-course", lmsCourse: "" }, testHelpers(), () => {})
    ).rejects.toThrow(/Select an existing LMS course/);
    expect(listCourseContentAction).not.toHaveBeenCalled();
  });

  it("propagates an error returned by listCourseContentAction", async () => {
    vi.mocked(listCourseContentAction).mockResolvedValue({ error: "Canvas is down" });
    await expect(
      step.run(
        { source: "existing-lms-course", lmsCourse: "https://canvas.example.edu/courses/1" },
        testHelpers(),
        () => {}
      )
    ).rejects.toThrow("Canvas is down");
  });
});
