import { describe, it, expect, vi, beforeEach } from "vitest";

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
    file() {
      return this;
    }
    async generateAsync() {
      return new Blob([]);
    }
  },
}));

import { generateClassOpenerAction, findCaseStudyMaterialAction, findPracticeProblemsAction } from "@/app/actions";
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
});
