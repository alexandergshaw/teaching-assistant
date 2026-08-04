// Split out of steps.course-schedule-from-source.test.ts (which had grown to
// 1304 lines, over this repo's 1000-line-per-file cap) - covers ONLY the
// "existing-lms-course" schedule source: mapping the live Canvas course's
// modules (via listCourseContentAction) through the shared normalizer,
// required-field validation, error propagation, the "applied" courseKind
// resolution (an existing LMS course carries no coding signal),
// resolvedSourceMaterial pass-through, and the course-tile canvasUrl
// fallback (real run 4b6f5162-0808-4a48-9b1b-6eec0db9b25a: this source
// hard-failed on a blank lmsCourse field even though the selected course
// tile's own canvasUrl was already resolved and printed by load-course-tile
// one step earlier) plus its Blackboard gate (a fallback must never hand a
// non-Canvas tile's URL to the Canvas-only listCourseContentAction call).
// See steps.course-schedule-from-source.fixtures.ts for the shared
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

import { listCourseContentAction, listCourseHubAction } from "@/app/actions";
import { step, testHelpers, scheduleSummary } from "./steps.course-schedule-from-source.fixtures";

describe("source: existing-lms-course", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Local tile-fixture helper, mirroring source-tile-repo.test.ts's own
  // hubTileWithRepos: only the fields THIS source's fallback/gate actually
  // reads (canvasUrl, lms, name) - cast `as never` past the rest of the
  // Course shape, same as that helper, since resolveHubTile only ever reads
  // these fields on this branch's path.
  function hubTile(
    overrides: Partial<{ id: string; name: string; canvasUrl: string | null; lms: string | null }> = {}
  ) {
    return {
      id: overrides.id ?? "tile-1",
      name: overrides.name ?? "History 201",
      canvasUrl: overrides.canvasUrl ?? null,
      lms: overrides.lms ?? null,
    } as never;
  }

  function canvasCourseContent() {
    return {
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
    };
  }

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

  // AC1 (real run 4b6f5162-0808-4a48-9b1b-6eec0db9b25a): a blank lmsCourse
  // field must no longer hard-fail when the selected course tile already
  // carries a Canvas course URL - the exact gap that run hit (load-
  // course-tile had already printed "LMS course: /courses/2677174" for the
  // very course this step then refused to read).
  it("falls back to the selected course tile's own canvasUrl when lmsCourse is left blank", async () => {
    vi.mocked(listCourseHubAction).mockResolvedValue({
      courses: [hubTile({ canvasUrl: "/courses/2677174", lms: "canvas" })],
    });
    vi.mocked(listCourseContentAction).mockResolvedValue(canvasCourseContent());

    const result = await step.run(
      { source: "existing-lms-course", lmsCourse: "", hubCourse: "tile-1" },
      testHelpers({ activeInstitution: "UT" }),
      () => {}
    );

    expect(listCourseContentAction).toHaveBeenCalledWith("/courses/2677174", "UT");
    expect(result.outputs.courseTitle).toBe("History 201");
  });

  // AC2: an explicit lmsCourse value must still win over the tile's own -
  // the tile fallback above must never silently override a deliberate
  // instructor choice (cross-listing: pointing this one run at a different
  // Canvas course than the tile's own).
  it("uses the explicit lmsCourse value over the tile's own canvasUrl when both are present", async () => {
    vi.mocked(listCourseHubAction).mockResolvedValue({
      courses: [hubTile({ canvasUrl: "https://canvas.example.edu/courses/999", lms: "canvas" })],
    });
    vi.mocked(listCourseContentAction).mockResolvedValue(canvasCourseContent());

    await step.run(
      {
        source: "existing-lms-course",
        lmsCourse: "https://canvas.example.edu/courses/111",
        hubCourse: "tile-1",
      },
      testHelpers(),
      () => {}
    );

    expect(listCourseContentAction).toHaveBeenCalledWith(
      "https://canvas.example.edu/courses/111",
      undefined
    );
  });

  // AC3: the Blackboard gate - the ONE piece of net-new behavior with no
  // existing analog. This source is Canvas-only end to end, so a naive
  // fallback would hand a Blackboard tile's URL to the Canvas-only
  // listCourseContentAction call, trading today's clear error for a
  // cryptic Canvas-parser one. The gate must fire off the tile's own
  // RECORDED `lms` field - never by attempting to parse the URL - and must
  // never call listCourseContentAction at all.
  it("throws a Blackboard-specific error naming the tile, and never calls listCourseContentAction, when lmsCourse is blank and the tile's lms is blackboard", async () => {
    vi.mocked(listCourseHubAction).mockResolvedValue({
      courses: [
        hubTile({
          name: "Biology 101",
          canvasUrl: "https://blackboard.example.edu/ultra/courses/_33102_1/outline",
          lms: "blackboard",
        }),
      ],
    });

    await expect(
      step.run({ source: "existing-lms-course", lmsCourse: "", hubCourse: "tile-1" }, testHelpers(), () => {})
    ).rejects.toThrow(/Biology 101[\s\S]*Blackboard/);
    expect(listCourseContentAction).not.toHaveBeenCalled();
  });

  // AC4: a non-Blackboard tile with no canvasUrl at all must still hit the
  // ordinary "Select an existing LMS course" failure - never a silent
  // empty schedule, and never mistaken for the Blackboard case above.
  it("still throws the 'Select an existing LMS course' error (not the Blackboard one) when lmsCourse is blank and the tile has no canvasUrl and is not Blackboard", async () => {
    vi.mocked(listCourseHubAction).mockResolvedValue({
      courses: [hubTile({ name: "Biology 101", canvasUrl: null, lms: "canvas" })],
    });

    await expect(
      step.run({ source: "existing-lms-course", lmsCourse: "", hubCourse: "tile-1" }, testHelpers(), () => {})
    ).rejects.toThrow(/Select an existing LMS course/);
    expect(listCourseContentAction).not.toHaveBeenCalled();
  });
});
