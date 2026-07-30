import { describe, it, expect, vi, beforeEach } from "vitest";

// AC4: captures every file name handed to the mocked JSZip's .file() so
// tests can prove WHICH files actually went into the zip - the step's
// "count"/"files" outputs alone don't distinguish "zipped only the openers"
// from "zipped the full accumulated set".
const { zipFileNames } = vi.hoisted(() => ({ zipFileNames: [] as string[] }));

vi.mock("@/app/actions", () => ({
  getRepoZipAction: vi.fn(),
  generateLecturePlansAction: vi.fn(),
  generateLectureMaterialsFromScheduleAction: vi.fn(),
  listCourseContentAction: vi.fn(),
  listCourseHubAction: vi.fn(),
  generateLectureFromMaterialsAction: vi.fn(),
  regenerateAnnouncementAction: vi.fn(),
  generateClassOpenerAction: vi.fn(),
  findCaseStudyMaterialAction: vi.fn(),
  findPracticeProblemsAction: vi.fn(),
  saveLibraryFileAction: vi.fn(),
}));

// buildDocxFromPlainText is mocked so each opener's document build is a
// deterministic, fast, DOM-free operation - the step's own orchestration
// (what it hands generateClassOpenerAction, in what order) is what these
// tests exercise, not real docx binary generation.
vi.mock("@/lib/docx", () => ({
  buildDocxFromPlainText: vi.fn(async () => new Uint8Array([1, 2, 3]).buffer),
}));

// Real jszip cannot read a Blob wrapping a mocked docx buffer under this
// suite's node test environment (see registry-helpers.assembleLectureFiles.
// test.ts's identical mock for the same reason) - only the step's own
// orchestration is under test here, not real zip binary assembly.
vi.mock("jszip", () => ({
  default: class {
    file(name: string) {
      zipFileNames.push(name);
      return this;
    }
    async generateAsync() {
      return new Blob([]);
    }
  },
}));

import { generateClassOpenerAction, findCaseStudyMaterialAction, findPracticeProblemsAction, listCourseHubAction } from "@/app/actions";
import { getStepDefinition } from "./registry";
import type { StepRunHelpers } from "./registry-helpers";
import type { GeneratedCourseFile } from "./types";
import type { ScheduleWeekPlan } from "@/app/actions-types";

const step = getStepDefinition("generate-class-openers")!;

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
    workflowId: "workflow-1",
    workflowName: "Test Workflow",
    workflowRunId: "run-1",
    ...overrides,
  };
}

const SCHEDULE: ScheduleWeekPlan[] = [
  { week: 1, topic: "Stakeholder Analysis", summary: "Mapping stakeholders.", assignmentTitle: null, assignmentSlug: null, testName: null },
];

function instructionsFile(weekNumber: number, pageText: string): GeneratedCourseFile {
  return {
    name: `Week ${weekNumber} Instructions.docx`,
    blob: new Blob(["x"]),
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    weekNumber,
    sortOrder: 2,
    role: "instructions",
    pageText,
  };
}

function mockHappyPath() {
  vi.mocked(findCaseStudyMaterialAction).mockResolvedValue({ material: null } as never);
  vi.mocked(findPracticeProblemsAction).mockResolvedValue({ problems: [] } as never);
  vi.mocked(generateClassOpenerAction).mockResolvedValue({
    title: "Class Opener: Stakeholder Analysis",
    text: "# Class Opener: Stakeholder Analysis\n\nBody",
  });
}

describe("generate-class-openers step", () => {
  const def = getStepDefinition("generate-class-openers");
  expect(def, "generate-class-openers step is registered").toBeTruthy();

  it("has the correct name and description", () => {
    expect(def!.name).toBe("Generate class openers");
    expect(def!.description).toContain("~30-minute class openers");
  });

  it("has a required schedule input", () => {
    const scheduleInput = def!.inputs.find((inp) => inp.key === "schedule");
    expect(scheduleInput).toBeTruthy();
    expect(scheduleInput!.required).toBe(true);
    expect(scheduleInput!.type).toBe("schedule");
  });

  it("has an optional hubCourse input", () => {
    const hubCourseInput = def!.inputs.find((inp) => inp.key === "hubCourse");
    expect(hubCourseInput).toBeTruthy();
    expect(hubCourseInput!.required).toBe(false);
    expect(hubCourseInput!.type).toBe("hubCourse");
  });

  it("has an optional minutes input with number type", () => {
    const minutesInput = def!.inputs.find((inp) => inp.key === "minutes");
    expect(minutesInput).toBeTruthy();
    expect(minutesInput!.required).toBe(false);
    expect(minutesInput!.type).toBe("number");
  });

  it("outputs report (longtext) and count (number)", () => {
    const reportOutput = def!.outputs.find((out) => out.key === "report");
    const countOutput = def!.outputs.find((out) => out.key === "count");
    expect(reportOutput).toBeTruthy();
    expect(reportOutput!.type).toBe("longtext");
    expect(countOutput).toBeTruthy();
    expect(countOutput!.type).toBe("number");
  });

  // AC1/AC2/AC4/AC5: the no-code kickoff opts into this via a bound
  // "groundInAssignment" input (course-setup.ts's NO_CODE_KICKOFF
  // bindOverrides "4.groundInAssignment") - unbound (every other preset) it
  // is simply skipped, per this repo's "unbound inputs are skipped" idiom.
  describe("groundInAssignment (AC1/AC2)", () => {
    it("declares an optional boolean groundInAssignment input", () => {
      const input = def!.inputs.find((i) => i.key === "groundInAssignment");
      expect(input, "the step declares a groundInAssignment input").toBeTruthy();
      expect(input!.required).toBeFalsy();
      expect(input!.type).toBe("boolean");
    });

    beforeEach(() => {
      vi.clearAllMocks();
      mockHappyPath();
    });

    it("off (the default) -> generateClassOpenerAction receives an empty assignmentContext even when a matching file exists", async () => {
      await step.run(
        {
          schedule: SCHEDULE,
          files: [instructionsFile(1, "# Real assignment: build a stakeholder register")],
        },
        testHelpers(),
        () => {}
      );

      expect(vi.mocked(generateClassOpenerAction).mock.calls[0][7]).toBe("");
    });

    it("on -> passes the matching week's instructions pageText as assignmentContext", async () => {
      await step.run(
        {
          schedule: SCHEDULE,
          groundInAssignment: "1",
          files: [instructionsFile(1, "# Real assignment: build a stakeholder register")],
        },
        testHelpers(),
        () => {}
      );

      expect(vi.mocked(generateClassOpenerAction).mock.calls[0][7]).toBe(
        "# Real assignment: build a stakeholder register"
      );
    });

    it("on but no matching week's file -> passes an empty assignmentContext, no throw", async () => {
      const result = await step.run(
        {
          schedule: SCHEDULE,
          groundInAssignment: "1",
          files: [instructionsFile(2, "# A different week's assignment")],
        },
        testHelpers(),
        () => {}
      );

      expect(vi.mocked(generateClassOpenerAction).mock.calls[0][7]).toBe("");
      expect(result.outputs.count).toBe(1);
    });

    it("on but a non-'instructions' file for the same week is ignored", async () => {
      const slidesFile: GeneratedCourseFile = {
        name: "Week 1 Slides.pptx",
        blob: new Blob(["x"]),
        mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        weekNumber: 1,
        sortOrder: 1,
        role: "slides",
        pageText: "should never be used",
      };

      await step.run(
        { schedule: SCHEDULE, groundInAssignment: "1", files: [slidesFile] },
        testHelpers(),
        () => {}
      );

      expect(vi.mocked(generateClassOpenerAction).mock.calls[0][7]).toBe("");
    });
  });

  // AC4: openers join the SAME materials zip as the earlier
  // lecture-zip/lecture-materials-from-schedule step, instead of shipping
  // in a second, separate "Class Openers.zip". A standalone run of this
  // step (no incoming files bound) must be completely unaffected.
  describe("the produced zip joins the earlier materials zip when chained (AC4)", () => {
    beforeEach(() => {
      vi.clearAllMocks();
      mockHappyPath();
      zipFileNames.length = 0;
      vi.mocked(listCourseHubAction).mockResolvedValue({
        courses: [{ id: "course-1", courseCode: "CS-101", name: "Course One" } as never],
      });
    });

    it("chained (incoming files present): the zip contains the incoming files too, not just the new openers", async () => {
      await step.run(
        {
          schedule: SCHEDULE,
          files: [instructionsFile(1, "# Real assignment")],
        },
        testHelpers(),
        () => {}
      );

      expect(zipFileNames).toContain("Week 1 Instructions.docx");
      expect(zipFileNames.some((n) => n.includes("Opener"))).toBe(true);
    });

    it("chained: saves under the SAME \"Lecture Materials\" name the earlier step used, not \"Class Openers\"", async () => {
      const saveCourseMaterialFile = vi.fn<NonNullable<import("./registry-helpers").StepRunHelpers["saveCourseMaterialFile"]>>(
        async () => {}
      );

      await step.run(
        {
          schedule: SCHEDULE,
          hubCourse: "course-1",
          files: [instructionsFile(1, "# Real assignment")],
        },
        testHelpers({ saveCourseMaterialFile }),
        () => {}
      );

      expect(saveCourseMaterialFile).toHaveBeenCalledTimes(1);
      const fileName = saveCourseMaterialFile.mock.calls[0][2];
      expect(fileName).toContain("Lecture Materials");
      expect(fileName).not.toContain("Class Openers");
    });

    it("standalone (no incoming files): the zip contains only the openers, saved as \"Class Openers\" - unaffected by AC4", async () => {
      const saveCourseMaterialFile = vi.fn<NonNullable<import("./registry-helpers").StepRunHelpers["saveCourseMaterialFile"]>>(
        async () => {}
      );

      await step.run(
        { schedule: SCHEDULE, hubCourse: "course-1" },
        testHelpers({ saveCourseMaterialFile }),
        () => {}
      );

      expect(zipFileNames.every((n) => n.includes("Opener"))).toBe(true);
      const fileName = saveCourseMaterialFile.mock.calls[0][2];
      expect(fileName).toContain("Class Openers");
      expect(fileName).not.toContain("Lecture Materials");
    });

    it("the outputs.files chain is unaffected by AC4 either way (incoming + new openers)", async () => {
      const result = await step.run(
        { schedule: SCHEDULE, files: [instructionsFile(1, "# Real assignment")] },
        testHelpers(),
        () => {}
      );

      const files = result.outputs.files as Array<{ role: string }>;
      expect(files.some((f) => f.role === "instructions")).toBe(true);
      expect(files.some((f) => f.role === "opener")).toBe(true);
    });
  });
});
