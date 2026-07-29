// Regression coverage for assembleLectureFiles's zip delivery.
//
// Bug: the auto-download of the generated lecture-materials zip was
// suppressed whenever the bound course tile's LMS was Canvas or Blackboard -
// on the theory that a separate step (steps.lms-export.ts) builds a Common
// Cartridge for those LMSes instead. But that cartridge is an import
// artifact FOR the LMS, not the instructor's own copy of the materials; the
// two are not substitutes for one another, and an instructor on Canvas or
// Blackboard never received their zip at all.
//
// Fix: the download now only depends on a genuine capability check - whether
// this run has a `document` to build a download link with (an unattended/
// headless run never does). The tile's LMS no longer gates the download.
// downloadSkipped (and the summary text it drives) is therefore true only
// for the no-`document` case, and the summary names the saved zip and where
// it landed so a headless run's file is still discoverable afterward.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { emptyCourseProject } from "@/lib/course-project";

vi.mock("@/app/actions", () => ({
  listCourseContentAction: vi.fn(),
  listCourseHubAction: vi.fn(),
  getDeckTemplateAction: vi.fn(),
}));

// buildSlidesPptx drives real pptxgenjs shape/theme rendering, whose Blob
// output JSZip cannot re-read under this suite's node test environment (see
// the codeStrippedFromApplied tests below, which are the first in this file
// to feed assembleLectureFiles a non-empty plan). Only buildSlidesPptx is
// replaced - withDeckNotes is real (assembleLectureFiles imports it from the
// same module) so plan.moduleIntroduction still folds onto the slides as it
// does in production.
vi.mock("@/lib/pptx", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/pptx")>();
  return { ...actual, buildSlidesPptx: vi.fn(async () => new Uint8Array([1, 2, 3]).buffer) };
});

import { listCourseHubAction, getDeckTemplateAction } from "@/app/actions";
import { assembleLectureFiles, type StepRunHelpers } from "./registry-helpers";
import type { AssignmentPlan } from "@/app/actions";
import type { Course } from "@/lib/supabase/courses";

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

// A course-hub tile with an overridable `lms` - used to prove the download
// decision no longer reads it at all.
function hubTile(lms: string | null, overrides: Partial<Course> = {}): Course {
  return {
    id: "course-1",
    name: "Course One",
    courseCode: "CS-101",
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
    weeks: null,
    tests: null,
    lms,
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

// No plans are needed to exercise the download/summary logic under test -
// assembleLectureFiles still assembles (and downloads/saves) an empty zip
// when `plans` is empty, without touching the pptx/docx generation path.
const noPlans: AssignmentPlan[] = [];
const noProgress = () => {};

// Stubs a minimal browser `document` + `URL.createObjectURL/revokeObjectURL`
// so `typeof document !== "undefined"` is true and the download branch's two
// calls succeed. The suite's default environment is "node" (no `document`
// global at all), which is exactly the headless/unattended case - so the
// no-DOM tests below need no setup, and only the DOM-present tests call this.
function stubDom() {
  const click = vi.fn();
  const appendChild = vi.fn();
  const removeChild = vi.fn();
  const createElement = vi.fn(() => ({ href: "", download: "", click }));
  const createObjectURL = vi.fn(() => "blob:mock-url");
  const revokeObjectURL = vi.fn();
  vi.stubGlobal("document", { createElement, body: { appendChild, removeChild } });
  vi.stubGlobal("URL", { createObjectURL, revokeObjectURL });
  return { click, appendChild, removeChild, createElement, createObjectURL, revokeObjectURL };
}

describe("assembleLectureFiles - zip delivery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getDeckTemplateAction).mockResolvedValue({ error: "not found" });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("with a document present, the download is taken regardless of the tile's LMS", () => {
    it.each([
      ["canvas", "canvas"],
      ["blackboard", "blackboard"],
      ["a third LMS (moodle)", "moodle"],
      ["no LMS set on the tile", null],
    ])("%s", async (_label, lms) => {
      vi.mocked(listCourseHubAction).mockResolvedValue({ courses: [hubTile(lms)] });
      const dom = stubDom();

      const result = await assembleLectureFiles(
        noPlans,
        { hubCourse: "course-1" },
        testHelpers(),
        noProgress,
        "Lecture Materials"
      );

      expect(dom.createObjectURL).toHaveBeenCalledTimes(1);
      expect(dom.click).toHaveBeenCalledTimes(1);
      expect(dom.revokeObjectURL).toHaveBeenCalledTimes(1);
      expect(result.summary).toEqual({
        kind: "list",
        label: "Generated 0 files (zip downloaded)",
        items: [],
      });
    });

    it("also downloads with no course tile bound at all", async () => {
      const dom = stubDom();

      const result = await assembleLectureFiles(
        noPlans,
        {},
        testHelpers(),
        noProgress,
        "Lecture Materials"
      );

      expect(dom.createObjectURL).toHaveBeenCalledTimes(1);
      expect(dom.click).toHaveBeenCalledTimes(1);
      expect(listCourseHubAction).not.toHaveBeenCalled();
      expect(result.summary).toEqual({
        kind: "list",
        label: "Generated 0 files (zip downloaded)",
        items: [],
      });
    });
  });

  describe("with no document (a headless/unattended run), the download is skipped regardless of the tile's LMS", () => {
    it.each([
      ["canvas", "canvas"],
      ["blackboard", "blackboard"],
      ["a third LMS (moodle)", "moodle"],
    ])("%s", async (_label, lms) => {
      vi.mocked(listCourseHubAction).mockResolvedValue({ courses: [hubTile(lms)] });
      // No stubDom() call - the suite's default "node" environment already
      // has no `document` global, exactly like a real headless run.
      expect(typeof document).toBe("undefined");

      const result = await assembleLectureFiles(
        noPlans,
        { hubCourse: "course-1" },
        testHelpers(),
        noProgress,
        "Lecture Materials"
      );

      // downloadSkipped -> the summary names the saved zip and where it
      // landed, so a headless run's file is discoverable afterward.
      expect(result.summary).toEqual({
        kind: "list",
        label: 'Generated 0 files (zip saved to the Files tab as "CS-101 - Lecture Materials.zip" - this run had no browser to download it to)',
        items: [],
      });
    });

    it("names the fallback file when no course tile is bound", async () => {
      expect(typeof document).toBe("undefined");

      const result = await assembleLectureFiles(
        noPlans,
        {},
        testHelpers(),
        noProgress,
        "My Fallback Name"
      );

      expect(result.summary).toEqual({
        kind: "list",
        label: 'Generated 0 files (zip saved to the Files tab as "My Fallback Name.zip" - this run had no browser to download it to)',
        items: [],
      });
    });
  });

  it("still saves to the library (Files tab) via helpers.saveBundle when the download is skipped", async () => {
    const saveBundle = vi.fn<NonNullable<StepRunHelpers["saveBundle"]>>(async () => {});
    // No stubDom() here - default node environment - so this exercises the
    // no-DOM/skip branch.
    await assembleLectureFiles(
      noPlans,
      {},
      testHelpers({ saveBundle }),
      noProgress,
      "Lecture Materials"
    );
    expect(saveBundle).toHaveBeenCalledTimes(1);
    expect(saveBundle.mock.calls[0][1]).toBe("Lecture Materials.zip");
  });

  it("still saves to the library (Files tab) via helpers.saveBundle when the download is also taken", async () => {
    const saveBundle = vi.fn<NonNullable<StepRunHelpers["saveBundle"]>>(async () => {});
    stubDom();
    await assembleLectureFiles(
      noPlans,
      {},
      testHelpers({ saveBundle }),
      noProgress,
      "Lecture Materials"
    );
    expect(saveBundle).toHaveBeenCalledTimes(1);
    expect(saveBundle.mock.calls[0][1]).toBe("Lecture Materials.zip");
  });

  // AC2: codeStrippedFromApplied must surface in the summary the same way
  // slidesFailed/introFailed/instructionsFailed already do - "Degradation is
  // VISIBLE" (see docs/REGRESSION.md 81.5). Without this, a run that shipped
  // a code-bearing deck to a no-code course (later cleaned by the guard)
  // would look like a clean success. buildSlidesPptx is mocked above (a real
  // pptx Blob is not zip-readable under this suite's node environment - see
  // that mock's comment); jszip itself is mocked here too, since none of
  // these other tests ever feed assembleLectureFiles a real file to zip.
  describe("codeStrippedFromApplied surfaces in the degraded list", () => {
    beforeEach(() => {
      vi.doMock("jszip", () => ({
        default: class {
          file() {
            return this;
          }
          async generateAsync() {
            return new Blob([]);
          }
        },
      }));
    });

    afterEach(() => {
      vi.doUnmock("jszip");
    });

    function planWith(overrides: Partial<AssignmentPlan> = {}): AssignmentPlan {
      return {
        assignmentName: "week-01",
        slides: [{ title: "Principle: Scope", bullets: ["b"] }],
        presentationTitle: "Week 1",
        label: "Week 1",
        moduleIntroduction: "Intro",
        assignmentInstructions: "Instructions",
        weekNumber: 1,
        introTemplateHeadings: [],
        instructionsTemplateHeadings: [],
        ...overrides,
      };
    }

    // includeInstructions: false routes around the docx/stampDocxAppProperties
    // path (its own real jszip round-trip, unrelated to this test's concern)
    // so only the pptx path - already fully stubbed above - runs.
    it("lists a week whose deck had code stripped at the top of the summary", async () => {
      const result = await assembleLectureFiles(
        [planWith({ codeStrippedFromApplied: 2 })],
        { includeInstructions: "" },
        testHelpers(),
        noProgress,
        "Lecture Materials"
      );

      expect(result.summary.kind).toBe("list");
      if (result.summary.kind !== "list") return;
      expect(result.summary.items[0]).toContain("Week 1");
      expect(result.summary.items[0]).toContain("code removed from 2 slide(s)");
    });

    it("a clean applied week (no codeStrippedFromApplied) is not listed as degraded", async () => {
      const result = await assembleLectureFiles(
        [planWith()],
        { includeInstructions: "" },
        testHelpers(),
        noProgress,
        "Lecture Materials"
      );

      expect(result.summary.kind).toBe("list");
      if (result.summary.kind !== "list") return;
      expect(result.summary.items.some((i) => i.includes("code removed"))).toBe(false);
    });

    // AC6: a module whose assignment failed to generate must surface not just
    // the failure itself but its knock-on effect - the intro/deck were NOT
    // given fake grounding to compensate (see buildScheduleWeekPlan's
    // assignmentContextForDownstream), so the run must say so, not just that
    // "assignment instructions" fell back to a placeholder.
    it("instructionsFailed names the downstream grounding loss, not just the assignment fallback", async () => {
      const result = await assembleLectureFiles(
        [planWith({ instructionsFailed: true })],
        { includeInstructions: "" },
        testHelpers(),
        noProgress,
        "Lecture Materials"
      );

      expect(result.summary.kind).toBe("list");
      if (result.summary.kind !== "list") return;
      expect(result.summary.items[0]).toContain("Week 1");
      expect(result.summary.items[0]).toContain("assignment instructions");
      expect(result.summary.items[0]).toContain("without assignment grounding");
    });

    // AC3: an applied week whose required-tool selection failed must be
    // visible too - the assignment and the deck each named a tool
    // independently instead of sharing one.
    it("moduleToolsSelectionFailed surfaces in the degraded list", async () => {
      const result = await assembleLectureFiles(
        [planWith({ moduleToolsSelectionFailed: true })],
        { includeInstructions: "" },
        testHelpers(),
        noProgress,
        "Lecture Materials"
      );

      expect(result.summary.kind).toBe("list");
      if (result.summary.kind !== "list") return;
      expect(result.summary.items[0]).toContain("Week 1");
      expect(result.summary.items[0]).toContain("required tool selection");
    });

    it("a clean applied week (no moduleToolsSelectionFailed) is not listed as degraded", async () => {
      const result = await assembleLectureFiles(
        [planWith()],
        { includeInstructions: "" },
        testHelpers(),
        noProgress,
        "Lecture Materials"
      );

      expect(result.summary.kind).toBe("list");
      if (result.summary.kind !== "list") return;
      expect(result.summary.items.some((i) => i.includes("required tool selection"))).toBe(false);
    });
  });
});
