// Split out of steps.course-schedule-from-source.test.ts (which had grown to
// 1304 lines, over this repo's 1000-line-per-file cap) - covers ONLY the
// "tile-export" schedule source: reading a course tile's own saved LMS
// export via helpers.loadCourseExport and mapping it through the SAME
// shared courseStructureToSchedule normalizer the course-cartridge source
// uses (cross-checked directly against that real, unmocked function), title
// fallbacks, required-field validation, the run-context-not-wired failure,
// naming the tile (never a silent empty schedule) when the export is
// missing or empty, and propagating loadCourseExport's own error message
// unchanged. See steps.course-schedule-from-source.fixtures.ts for the
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

import { listCourseHubAction } from "@/app/actions";
import { step, testHelpers, scheduleSummary } from "./steps.course-schedule-from-source.fixtures";
// Real (unmocked) import: the tile-export tests below cross-check the
// step's own output against this SAME pure function, called directly with
// the identical {title,items} shape the step's branch narrows the parsed
// export down to - proof this source genuinely routes through the shared
// normalizer rather than a fourth parallel implementation that merely
// LOOKS the same.
import { courseStructureToSchedule } from "@/lib/course-structure-schedule";

describe("source: tile-export", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // The shape helpers.loadCourseExport (step-helpers-server.ts /
  // useWorkflowRun.ts) already resolves to - CartridgeCourseData, the SAME
  // type parseCartridgeBlob returns for the course-cartridge source above.
  function exportData(
    overrides: Partial<{
      title: string | null;
      modules: { name: string; position: number; items: { title: string; type: string }[] }[];
    }> = {}
  ) {
    return {
      title: overrides.title === undefined ? "Biology 101" : overrides.title,
      courseCode: null,
      startAt: null,
      syllabusHtml: null,
      modules:
        overrides.modules ??
        [
          { name: "Module 1", position: 1, items: [{ title: "Syllabus", type: "" }, { title: "  ", type: "" }] },
          { name: "Module 2", position: 2, items: [{ title: "Reading", type: "" }] },
        ],
      rubrics: [],
      hasCourseSettings: true,
    };
  }

  it("maps the tile's saved export through the SAME shared normalizer the course-cartridge source uses (cross-checked directly against courseStructureToSchedule)", async () => {
    const loadCourseExport = vi.fn(async () => exportData());
    vi.mocked(listCourseHubAction).mockResolvedValue({ courses: [] });

    const result = await step.run(
      { source: "tile-export", hubCourse: "tile-1" },
      testHelpers({ loadCourseExport }),
      () => {}
    );

    expect(loadCourseExport).toHaveBeenCalledWith("tile-1");
    expect(result.outputs.courseTitle).toBe("Biology 101");
    expect(result.outputs.weeks).toBe(2);

    // Cross-check: call the REAL shared normalizer directly with the exact
    // {title,items} shape this branch narrows the export's modules down to
    // (steps.course-schedule-from-source.ts's own mapping, identical to
    // the course-cartridge branch's own mapping just above) - proves this
    // is not a fourth parallel implementation that merely produces a
    // similarly-shaped schedule.
    const expectedSchedule = courseStructureToSchedule(
      [
        { title: "Module 1", items: [{ title: "Syllabus" }, { title: "  " }] },
        { title: "Module 2", items: [{ title: "Reading" }] },
      ],
      null
    );
    const summary = scheduleSummary(result);
    expect(summary.schedule).toEqual(expectedSchedule);
    // Defect 2: a saved LMS export carries no coding signal, same as the
    // course-cartridge and existing-LMS-course sources - only "codebase"
    // implies a programming course.
    expect(result.outputs.courseKind).toBe("applied");
  });

  it("forwards the shared sourceMaterial field unchanged as resolvedSourceMaterial (no TOC derivation on this source)", async () => {
    const loadCourseExport = vi.fn(async () => exportData());
    vi.mocked(listCourseHubAction).mockResolvedValue({ courses: [] });

    const result = await step.run(
      {
        source: "tile-export",
        hubCourse: "tile-1",
        sourceMaterial: "Hand-pasted TOC the instructor typed",
      },
      testHelpers({ loadCourseExport }),
      () => {}
    );

    expect(result.outputs.resolvedSourceMaterial).toBe("Hand-pasted TOC the instructor typed");
  });

  it("falls back to the hubCourse tile's name when the export has no title", async () => {
    const loadCourseExport = vi.fn(async () => exportData({ title: null }));
    vi.mocked(listCourseHubAction).mockResolvedValue({
      courses: [{ id: "tile-1", name: "Fallback Course Name" } as never],
    });

    const result = await step.run(
      { source: "tile-export", hubCourse: "tile-1" },
      testHelpers({ loadCourseExport }),
      () => {}
    );

    expect(result.outputs.courseTitle).toBe("Fallback Course Name");
  });

  it("fails with a message naming the missing field when no course tile is chosen", async () => {
    await expect(
      step.run({ source: "tile-export", hubCourse: "" }, testHelpers(), () => {})
    ).rejects.toThrow(/Choose a course tile/);
  });

  // helpers.loadCourseExport is null in a run context that cannot supply it
  // (see StepRunHelpers.loadCourseExport, registry-helpers.ts - null when,
  // for instance, no signed-in user/Supabase client is available) - the
  // default testHelpers() below already sets it null, matching every other
  // step test file's baseline.
  it("fails with a clear message when loadCourseExport is not wired for this run context", async () => {
    await expect(
      step.run({ source: "tile-export", hubCourse: "tile-1" }, testHelpers(), () => {})
    ).rejects.toThrow(/not available in this run context/);
  });

  it("fails with a message naming the tile - never a silent empty schedule - when the tile has no export on file", async () => {
    const loadCourseExport = vi.fn(async () => null);
    vi.mocked(listCourseHubAction).mockResolvedValue({
      courses: [{ id: "tile-1", name: "Biology 101 (Fall)" } as never],
    });

    await expect(
      step.run({ source: "tile-export", hubCourse: "tile-1" }, testHelpers({ loadCourseExport }), () => {})
    ).rejects.toThrow(/Biology 101 \(Fall\)/);
  });

  it("falls back to naming the raw tile id when the tile's own name cannot be resolved either", async () => {
    const loadCourseExport = vi.fn(async () => null);
    vi.mocked(listCourseHubAction).mockResolvedValue({ error: "network down" });

    await expect(
      step.run({ source: "tile-export", hubCourse: "tile-404" }, testHelpers({ loadCourseExport }), () => {})
    ).rejects.toThrow(/tile-404/);
  });

  it("fails rather than reporting success when the export has no modules", async () => {
    const loadCourseExport = vi.fn(async () => exportData({ modules: [] }));

    await expect(
      step.run({ source: "tile-export", hubCourse: "tile-1" }, testHelpers({ loadCourseExport }), () => {})
    ).rejects.toThrow(/no weeks were produced/);
  });

  // AC2 (defect-1 write-up, real run 556b49f0): a bare "Failed to fetch"
  // told the user nothing. helpers.loadCourseExport (step-helpers-server.ts
  // / WorkflowsTab.tsx) now wraps that failure with the tile and export
  // file name before it ever reaches this step - this proves the step
  // itself does not re-swallow or re-generalize that message on the way
  // out (no try/catch wraps this call in the step's own source), so
  // whatever diagnosable message loadCourseExport produced reaches the run
  // log verbatim.
  it("propagates loadCourseExport's own error message unchanged, rather than a generic failure", async () => {
    const loadCourseExport = vi.fn(async () => {
      throw new Error('Could not read "Biology 101"\'s LMS export "export.imscc": Failed to fetch');
    });

    await expect(
      step.run({ source: "tile-export", hubCourse: "tile-1" }, testHelpers({ loadCourseExport }), () => {})
    ).rejects.toThrow('Could not read "Biology 101"\'s LMS export "export.imscc": Failed to fetch');
  });
});
