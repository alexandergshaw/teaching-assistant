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

// buildDocxFromPlainText is statically imported by registry-helpers.ts, so
// unlike jszip (dynamically imported inside the function - vi.doMock can
// swap that per test) this needs a file-level vi.mock to take effect at all.
// AC1: assembleLectureFiles now ALWAYS builds a module-objectives docx (not
// gated by includeInstructions the way the instructions docx is), so the
// "codeStrippedFromApplied surfaces" describe block below - which sets
// includeInstructions: "" specifically to dodge the real docx/jszip
// round-trip its own mocked jszip class cannot service (no loadAsync) - would
// otherwise still hit that same real path via the objectives file. No test
// in this file inspects real docx bytes, so mocking this globally changes
// nothing any assertion here depends on.
vi.mock("@/lib/docx", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/docx")>();
  return { ...actual, buildDocxFromPlainText: vi.fn(async () => new Uint8Array([1, 2, 3]).buffer) };
});

import { listCourseHubAction, getDeckTemplateAction } from "@/app/actions";
import { assembleLectureFiles, type StepRunHelpers } from "./registry-helpers";
import { buildSlidesPptx } from "@/lib/pptx";
import { buildDocxFromPlainText } from "@/lib/docx";
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
        moduleObjectives: "Objectives",
        weekNumber: 1,
        introTemplateHeadings: [],
        instructionsTemplateHeadings: [],
        ...overrides,
      };
    }

    it("packages non-empty fallback instructions, folds the fallback intro into deck notes, and reports both degradations", async () => {
      const introScaffold = [
        "# Module Introduction: Week 1",
        "",
        "Trace numeric conversions from the repository source.",
      ].join("\n");
      const instructionsScaffold = [
        "# Week 1",
        "",
        "## Instructions",
        "- Trace numeric conversions from the repository source.",
      ].join("\n");

      const result = await assembleLectureFiles(
        [
          planWith({
            moduleIntroduction: introScaffold,
            introFailed: true,
            assignmentInstructions: instructionsScaffold,
            instructionsFailed: true,
          }),
        ],
        { includeInstructions: "1" },
        testHelpers(),
        noProgress,
        "Lecture Materials"
      );

      const instructionsFile = result.files.find((file) => file.role === "instructions");
      expect(instructionsFile).toBeDefined();
      expect(instructionsFile!.pageText).toBe(instructionsScaffold);
      expect(instructionsFile!.pageText!.trim().length).toBeGreaterThan(0);
      expect(buildDocxFromPlainText).toHaveBeenCalledWith(instructionsScaffold, [], "Test Author");

      const deckInput = vi.mocked(buildSlidesPptx).mock.calls[0][0];
      expect(deckInput.slides[0].notes).toBe(introScaffold);

      expect(result.summary.kind).toBe("list");
      if (result.summary.kind !== "list") return;
      expect(result.summary.items[0]).toContain("lecture notes");
      expect(result.summary.items[0]).toContain("assignment instructions");
    });

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

    // docs/REGRESSION.md #210: caseStudyLibraryExhausted mirrors
    // codeStrippedFromApplied/moduleToolsSelectionFailed's "degraded but not
    // fatal" shape - the flag was already set/threaded by planCourseCaseStudies
    // (case-study-plan.ts) but never surfaced here, so a week whose case
    // study came from the LLM fallback (because the curated library's
    // matching entries were already claimed by an earlier week this run)
    // looked like a clean success.
    it("caseStudyLibraryExhausted surfaces in the degraded list", async () => {
      const result = await assembleLectureFiles(
        [planWith({ caseStudyLibraryExhausted: true })],
        { includeInstructions: "" },
        testHelpers(),
        noProgress,
        "Lecture Materials"
      );

      expect(result.summary.kind).toBe("list");
      if (result.summary.kind !== "list") return;
      expect(result.summary.items[0]).toContain("Week 1");
      expect(result.summary.items[0]).toContain("case study");
      expect(result.summary.items[0]).toContain("ran out of distinct entries");
    });

    it("a clean week (no caseStudyLibraryExhausted) is not listed as degraded", async () => {
      const result = await assembleLectureFiles(
        [planWith()],
        { includeInstructions: "" },
        testHelpers(),
        noProgress,
        "Lecture Materials"
      );

      expect(result.summary.kind).toBe("list");
      if (result.summary.kind !== "list") return;
      expect(result.summary.items.some((i) => i.includes("case study"))).toBe(false);
    });

    // AC1/AC2/AC3: the module objectives document ships in the SAME zip as
    // slides/instructions, with a distinct role and pageText so a later step
    // can turn it into a native LMS Page through the same mechanism
    // "introduction" files use (steps.lms-modules.ts's lms-populate).
    describe("module objectives (AC1/AC2/AC3)", () => {
      it("ships as its own file with role \"objectives\" and pageText equal to the plan's moduleObjectives", async () => {
        const result = await assembleLectureFiles(
          [planWith({ moduleObjectives: "# Module Objectives: Week 1\n\n## Learning Objectives\n- Build a register" })],
          { includeInstructions: "" },
          testHelpers(),
          noProgress,
          "Lecture Materials"
        );

        const objectivesFile = result.files.find((f) => f.role === "objectives");
        expect(objectivesFile, "an objectives file is present").toBeTruthy();
        expect(objectivesFile!.pageText).toBe("# Module Objectives: Week 1\n\n## Learning Objectives\n- Build a register");
        expect(objectivesFile!.weekNumber).toBe(1);
        expect(objectivesFile!.name).toContain("Module Objectives");
      });

      // Unlike the assignment-instructions file, objectives are NOT gated by
      // includeInstructions - that toggle is documented as "Adds each week's
      // Instructions document", not objectives, and AC1 never describes an
      // opt-out for objectives.
      it("ships even when includeInstructions is off", async () => {
        const result = await assembleLectureFiles(
          [planWith({ moduleObjectives: "# Module Objectives: Week 1\n\nBody" })],
          { includeInstructions: "" },
          testHelpers(),
          noProgress,
          "Lecture Materials"
        );

        expect(result.files.some((f) => f.role === "objectives")).toBe(true);
        expect(result.files.some((f) => f.role === "instructions")).toBe(false);
      });

      // AC7: failure isolation - a degraded objectives document must be
      // visible in the run's summary, never silently shipped as if clean.
      it("objectivesFailed surfaces in the degraded list", async () => {
        const result = await assembleLectureFiles(
          [planWith({ objectivesFailed: true })],
          { includeInstructions: "" },
          testHelpers(),
          noProgress,
          "Lecture Materials"
        );

        expect(result.summary.kind).toBe("list");
        if (result.summary.kind !== "list") return;
        expect(result.summary.items[0]).toContain("Week 1");
        expect(result.summary.items[0]).toContain("module objectives");
      });

      it("instructionsFailed's cascading note now also names objectives, not just intro and slides", async () => {
        const result = await assembleLectureFiles(
          [planWith({ instructionsFailed: true })],
          { includeInstructions: "" },
          testHelpers(),
          noProgress,
          "Lecture Materials"
        );

        expect(result.summary.kind).toBe("list");
        if (result.summary.kind !== "list") return;
        expect(result.summary.items[0]).toContain("without assignment grounding");
        expect(result.summary.items[0]).toContain("objectives");
      });
    });

    // T2 (no-code pipeline reorder): the class opener now ships as its own
    // file, exactly like the module objectives file above, but ONLY when
    // buildScheduleWeekPlan's sequenceOpenerBeforeDeck phase actually
    // produced one (plan.openerText) - every other caller (the repo-driven
    // buildAssignmentPlan, and the default schedule-driven call) never sets
    // this field, so this branch must never fire for them.
    describe("class opener (T2)", () => {
      it("ships as its own file with role \"opener\" and pageText equal to the plan's openerText, when present", async () => {
        const result = await assembleLectureFiles(
          [planWith({ openerText: "# Class Opener: Week 1\n\nCase study body" })],
          { includeInstructions: "" },
          testHelpers(),
          noProgress,
          "Lecture Materials"
        );

        const openerFile = result.files.find((f) => f.role === "opener");
        expect(openerFile, "an opener file is present").toBeTruthy();
        expect(openerFile!.pageText).toBe("# Class Opener: Week 1\n\nCase study body");
        expect(openerFile!.weekNumber).toBe(1);
        expect(openerFile!.name).toContain("Class Opener");
      });

      it("ships no opener file when the plan carries none (openerText undefined - every pre-existing caller)", async () => {
        const result = await assembleLectureFiles(
          [planWith()],
          { includeInstructions: "" },
          testHelpers(),
          noProgress,
          "Lecture Materials"
        );

        expect(result.files.some((f) => f.role === "opener")).toBe(false);
      });

      // A failed in-plan opener resolves to "" (course-planning-grounding.ts),
      // not undefined - this must not ship an empty document.
      it("ships no opener file when openerText is an empty string (the opener failed)", async () => {
        const result = await assembleLectureFiles(
          [planWith({ openerText: "", openerFailed: true })],
          { includeInstructions: "" },
          testHelpers(),
          noProgress,
          "Lecture Materials"
        );

        expect(result.files.some((f) => f.role === "opener")).toBe(false);
      });

      // Mirrors objectivesFailed/instructionsFailed above - a degraded opener
      // must be visible in the run's summary, never silently absent.
      it("openerFailed surfaces in the degraded list", async () => {
        const result = await assembleLectureFiles(
          [planWith({ openerFailed: true })],
          { includeInstructions: "" },
          testHelpers(),
          noProgress,
          "Lecture Materials"
        );

        expect(result.summary.kind).toBe("list");
        if (result.summary.kind !== "list") return;
        expect(result.summary.items[0]).toContain("Week 1");
        expect(result.summary.items[0]).toContain("class opener");
      });

      it("a clean plan (no openerFailed) is not listed as degraded for the opener", async () => {
        const result = await assembleLectureFiles(
          [planWith()],
          { includeInstructions: "" },
          testHelpers(),
          noProgress,
          "Lecture Materials"
        );

        expect(result.summary.kind).toBe("list");
        if (result.summary.kind !== "list") return;
        expect(result.summary.items.some((i) => i.includes("class opener"))).toBe(false);
      });

      // Unlike assignment instructions, the opener is NOT gated by
      // includeInstructions - that toggle only ever documented the
      // instructions document, and the opener existed as its own,
      // ungated step before T2 folded it into this function.
      it("ships even when includeInstructions is off", async () => {
        const result = await assembleLectureFiles(
          [planWith({ openerText: "# Class Opener\n\nBody" })],
          { includeInstructions: "" },
          testHelpers(),
          noProgress,
          "Lecture Materials"
        );

        expect(result.files.some((f) => f.role === "opener")).toBe(true);
        expect(result.files.some((f) => f.role === "instructions")).toBe(false);
      });
    });

    // V3 (professional-lift audit): a week whose slide generation failed
    // falls back to an empty slides array, which buildSlidesPptx renders as
    // a single title slide - a real generated run shipped exactly this to
    // Canvas as an ordinary lecture. Mark it unmistakably: the one slide's
    // title, the filename, and needsRegeneration all say so.
    describe("slidesFailed marks the deck NEEDS REGENERATION (V3)", () => {
      it("prefixes the one slide's title with REGENERATE THIS WEEK, marks needsRegeneration, and names it in the filename", async () => {
        const result = await assembleLectureFiles(
          [planWith({ slidesFailed: true, slides: [] })],
          { includeInstructions: "" },
          testHelpers(),
          noProgress,
          "Lecture Materials"
        );

        const slidesFile = result.files.find((f) => f.role === "slides");
        expect(slidesFile).toBeDefined();
        expect(slidesFile!.needsRegeneration).toBe(true);
        expect(slidesFile!.name).toContain("NEEDS REGENERATION");

        const pptxCall = vi.mocked(buildSlidesPptx).mock.calls[0][0];
        expect(pptxCall.presentationTitle).toContain("REGENERATE THIS WEEK");
      });

      it("a clean deck (slidesFailed unset) carries no needsRegeneration flag and an unmodified title/filename", async () => {
        const result = await assembleLectureFiles(
          [planWith()],
          { includeInstructions: "" },
          testHelpers(),
          noProgress,
          "Lecture Materials"
        );

        const slidesFile = result.files.find((f) => f.role === "slides");
        expect(slidesFile).toBeDefined();
        expect(slidesFile!.needsRegeneration).toBeUndefined();
        expect(slidesFile!.name).not.toContain("NEEDS REGENERATION");

        const pptxCall = vi.mocked(buildSlidesPptx).mock.calls[0][0];
        expect(pptxCall.presentationTitle).not.toContain("REGENERATE THIS WEEK");
      });
    });

    // COURSE_BUILD's output selector (steps.course-build-scope.ts's
    // "select-course-outputs") reaches this shared function through four
    // "selectedX" values on `values` - never a runIf gate (see that step's
    // own header comment for why). Unbound (undefined, what every OTHER
    // caller of this function leaves them at) must reproduce full
    // generation exactly - covered by every OTHER describe block in this
    // file, none of which sets these keys at all.
    describe("output selection (selectedObjectives/selectedDecks/selectedAssignments/selectedOpeners)", () => {
      function selectablePlan(overrides: Partial<AssignmentPlan> = {}): AssignmentPlan {
        return planWith({
          moduleObjectives: "Objectives text",
          assignmentInstructions: "Instructions text",
          openerText: "Opener text",
          ...overrides,
        });
      }

      it("selectedObjectives off: no objectives file, everything else ships", async () => {
        const result = await assembleLectureFiles(
          [selectablePlan()],
          { includeInstructions: "1", selectedObjectives: "" },
          testHelpers(),
          noProgress,
          "Lecture Materials"
        );
        expect(result.files.some((f) => f.role === "objectives")).toBe(false);
        expect(result.files.some((f) => f.role === "slides")).toBe(true);
        expect(result.files.some((f) => f.role === "instructions")).toBe(true);
        expect(result.files.some((f) => f.role === "opener")).toBe(true);
      });

      it("selectedDecks off: no slides file (and buildSlidesPptx is never called), everything else ships", async () => {
        const result = await assembleLectureFiles(
          [selectablePlan()],
          { includeInstructions: "1", selectedDecks: "" },
          testHelpers(),
          noProgress,
          "Lecture Materials"
        );
        expect(result.files.some((f) => f.role === "slides")).toBe(false);
        expect(buildSlidesPptx).not.toHaveBeenCalled();
        expect(result.files.some((f) => f.role === "objectives")).toBe(true);
        expect(result.files.some((f) => f.role === "instructions")).toBe(true);
        expect(result.files.some((f) => f.role === "opener")).toBe(true);
      });

      it("selectedAssignments off: no instructions file even though includeInstructions is on, everything else ships", async () => {
        const result = await assembleLectureFiles(
          [selectablePlan()],
          { includeInstructions: "1", selectedAssignments: "" },
          testHelpers(),
          noProgress,
          "Lecture Materials"
        );
        expect(result.files.some((f) => f.role === "instructions")).toBe(false);
        expect(result.files.some((f) => f.role === "objectives")).toBe(true);
        expect(result.files.some((f) => f.role === "slides")).toBe(true);
        expect(result.files.some((f) => f.role === "opener")).toBe(true);
      });

      it("selectedOpeners off: no opener file, everything else ships", async () => {
        const result = await assembleLectureFiles(
          [selectablePlan()],
          { includeInstructions: "1", selectedOpeners: "" },
          testHelpers(),
          noProgress,
          "Lecture Materials"
        );
        expect(result.files.some((f) => f.role === "opener")).toBe(false);
        expect(result.files.some((f) => f.role === "objectives")).toBe(true);
        expect(result.files.some((f) => f.role === "slides")).toBe(true);
        expect(result.files.some((f) => f.role === "instructions")).toBe(true);
      });

      it("every selectedX unset (as every non-COURSE_BUILD caller leaves them): full generation, unchanged", async () => {
        const result = await assembleLectureFiles(
          [selectablePlan()],
          { includeInstructions: "1" },
          testHelpers(),
          noProgress,
          "Lecture Materials"
        );
        expect(result.files.map((f) => f.role).sort()).toEqual(
          ["instructions", "objectives", "opener", "slides"].sort()
        );
      });

      it("names every deselected role in the step summary", async () => {
        const result = await assembleLectureFiles(
          [selectablePlan()],
          { includeInstructions: "1", selectedObjectives: "", selectedOpeners: "" },
          testHelpers(),
          noProgress,
          "Lecture Materials"
        );
        expect(result.summary.kind).toBe("list");
        if (result.summary.kind !== "list") return;
        expect(result.summary.items[0]).toContain("module objectives");
        expect(result.summary.items[0]).toContain("class openers");
        expect(result.summary.items[0]).not.toContain("lecture decks");
        expect(result.summary.items[0]).not.toContain("assignment instructions");
      });

      it("a single selected role (assignments only) still produces exactly that file", async () => {
        const result = await assembleLectureFiles(
          [selectablePlan()],
          {
            includeInstructions: "1",
            selectedObjectives: "",
            selectedDecks: "",
            selectedOpeners: "",
            selectedAssignments: "1",
          },
          testHelpers(),
          noProgress,
          "Lecture Materials"
        );
        expect(result.files.map((f) => f.role)).toEqual(["instructions"]);
      });

      // AssignmentPlan.caseStudy (Z1) must reach every file this plan
      // produces, not just one role - a downstream per-week generator (e.g.
      // generate-weekly-significance) reads it off WHATEVER file happens to
      // ship for that week, since selectedObjectives/Decks/Assignments/
      // Openers can each independently be off.
      it("carries the plan's caseStudy onto EVERY file it produces, regardless of which roles are selected", async () => {
        const caseStudy = { organization: "Denver International Airport", period: "the early 1990s", hook: "Baggage system failure." };
        const result = await assembleLectureFiles(
          [selectablePlan({ caseStudy })],
          { includeInstructions: "1" },
          testHelpers(),
          noProgress,
          "Lecture Materials"
        );
        expect(result.files.length).toBeGreaterThan(0);
        for (const file of result.files) {
          expect(file.caseStudy, `role "${file.role}" is missing caseStudy`).toEqual(caseStudy);
        }
      });

      it("leaves caseStudy undefined on every produced file when the plan has none", async () => {
        const result = await assembleLectureFiles(
          [selectablePlan()],
          { includeInstructions: "1" },
          testHelpers(),
          noProgress,
          "Lecture Materials"
        );
        expect(result.files.length).toBeGreaterThan(0);
        for (const file of result.files) {
          expect(file.caseStudy).toBeUndefined();
        }
      });
    });
  });

  // AC1 (graphics-gap-reporting choke point): assembleLectureFiles now
  // reports any required-graphic gap that survived the upstream repair pass
  // itself, from the `courseKind` its caller passes in - see
  // graphicsGapReportLines' own doc comment and unit tests
  // (registry-helpers.graphicsGapReportLines.test.ts) for the pure
  // computation this delegates to; these tests cover the wiring - the right
  // plans/courseKind reach that function and the result lands in the
  // summary - not the computation itself again.
  describe("graphics-gap reporting (AC1 choke point)", () => {
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
        slides: [],
        presentationTitle: "Week 1",
        label: "Week 1",
        moduleIntroduction: "Intro",
        assignmentInstructions: "Instructions",
        moduleObjectives: "Objectives",
        weekNumber: 1,
        introTemplateHeadings: [],
        instructionsTemplateHeadings: [],
        ...overrides,
      };
    }

    it("an applied plan whose slide is missing its required graphic surfaces the gap in the summary", async () => {
      const result = await assembleLectureFiles(
        [planWith({ slides: [{ title: "Judgment Call: cost vs schedule", bullets: ["b"] }] })],
        { includeInstructions: "" },
        testHelpers(),
        noProgress,
        "Lecture Materials",
        "applied"
      );
      expect(result.summary.kind).toBe("list");
      if (result.summary.kind !== "list") return;
      expect(result.summary.items.some((i) => i.includes("missing a required graphic"))).toBe(true);
    });

    it("a clean applied plan (every required slide carries its graphic) reports no gap", async () => {
      const result = await assembleLectureFiles(
        [
          planWith({
            slides: [
              {
                title: "Artifact: a register",
                bullets: ["b"],
                graphic: { kind: "table", headers: ["A"], rows: [["1"]] },
              },
            ],
          }),
        ],
        { includeInstructions: "" },
        testHelpers(),
        noProgress,
        "Lecture Materials",
        "applied"
      );
      expect(result.summary.kind).toBe("list");
      if (result.summary.kind !== "list") return;
      expect(result.summary.items.some((i) => i.includes("missing a required graphic"))).toBe(false);
    });

    // The default parameter (no 6th argument) must behave as "coding" - same
    // as passing it explicitly - so every pre-existing call site in this file
    // keeps its prior behavior unchanged. An Artifact:-titled slide is not
    // one of coding's own required slide types (Agenda:/Terminology:/the
    // concept-intro slide - see CODING_GRAPHIC_REQUIRED_PREFIXES in
    // slide-graphics.ts), so this specific slide reports no gap either way -
    // this is NOT a claim that "coding" is a blanket no-op any more; a
    // coding deck's OWN required slide types do surface a gap here (covered
    // directly in registry-helpers.graphicsGapReportLines.test.ts, per this
    // describe block's own header comment).
    it("defaults to reporting nothing for an Artifact:-titled slide, which coding does not require a graphic for", async () => {
      const result = await assembleLectureFiles(
        [planWith({ slides: [{ title: "Artifact: a register", bullets: ["b"] }] })],
        { includeInstructions: "" },
        testHelpers(),
        noProgress,
        "Lecture Materials"
      );
      expect(result.summary.kind).toBe("list");
      if (result.summary.kind !== "list") return;
      expect(result.summary.items.some((i) => i.includes("missing a required graphic"))).toBe(false);
    });

    it("an explicit courseKind of \"coding\" also reports nothing for that same Artifact:-titled slide", async () => {
      const result = await assembleLectureFiles(
        [planWith({ slides: [{ title: "Artifact: a register", bullets: ["b"] }] })],
        { includeInstructions: "" },
        testHelpers(),
        noProgress,
        "Lecture Materials",
        "coding"
      );
      expect(result.summary.kind).toBe("list");
      if (result.summary.kind !== "list") return;
      expect(result.summary.items.some((i) => i.includes("missing a required graphic"))).toBe(false);
    });
  });

  // AC3/AC4: assembleLectureFiles threads its own `courseKind` into
  // resolveDeckTheme's blank-template default (fuller coverage lives in
  // registry-helpers.resolveDeckTheme.test.ts).
  describe("resolveDeckTheme wiring: a blank template defaults from this call's own courseKind", () => {
    it("coding -> preset-coding-lecture; applied -> preset-classic-lecture (no applied preset yet)", async () => {
      const onProgress = vi.fn();
      await assembleLectureFiles(noPlans, {}, testHelpers(), onProgress, "Lecture Materials", "coding");
      expect(onProgress).toHaveBeenCalledWith('Template "preset-coding-lecture" not found - used Classic Lecture.');
      onProgress.mockClear();
      await assembleLectureFiles(noPlans, {}, testHelpers(), onProgress, "Lecture Materials", "applied");
      expect(onProgress).toHaveBeenCalledWith('Template "preset-classic-lecture" not found - used Classic Lecture.');
    });
  });
});
