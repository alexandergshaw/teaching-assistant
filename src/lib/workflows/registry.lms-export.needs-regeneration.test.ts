// V3 (professional-lift audit): a deck that fell back to the placeholder
// template must never ride into the Common Cartridge export either - the
// same needsRegeneration flag lms-populate (steps.lms-modules.ts) already
// honors must also keep it out of blackboard-export's cartridgeFiles.

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/app/actions", () => ({
  listCourseHubAction: vi.fn(),
  getFinalizedSyllabusAction: vi.fn(),
  autoFixOfficeFileAction: vi.fn(),
  checkBrokenLinksAction: vi.fn(),
}));

vi.mock("@/lib/workflows/common-cartridge", () => ({
  buildCommonCartridge: vi.fn(async () => new Blob(["cartridge bytes"])),
}));

import { buildCommonCartridge } from "@/lib/workflows/common-cartridge";
import { getStepDefinition } from "./registry";
import type { StepRunHelpers } from "./registry-helpers";
import type { GeneratedCourseFile } from "./types";
import type { ScheduleWeekPlan } from "@/app/actions-types";

const step = getStepDefinition("blackboard-export")!;

function testHelpers(): StepRunHelpers {
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
  };
}

const SCHEDULE: ScheduleWeekPlan[] = [
  { week: 1, topic: "Stakeholder Analysis", summary: "", assignmentTitle: "Week 1 Deliverable", assignmentSlug: "week-01", testName: null },
];

describe("blackboard-export excludes a needsRegeneration file from the cartridge (V3)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("never includes a needsRegeneration slides file among the module's cartridgeFiles", async () => {
    const flaggedSlides: GeneratedCourseFile = {
      name: "Week 1 - Lecture Slides - NEEDS REGENERATION.pptx",
      blob: new Blob(["pptx bytes"]),
      mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      weekNumber: 1,
      sortOrder: 1,
      role: "slides",
      needsRegeneration: true,
    };
    const normalDoc: GeneratedCourseFile = {
      name: "Week 1 - Module Objectives.docx",
      blob: new Blob(["doc bytes"]),
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      weekNumber: 1,
      sortOrder: 0.5,
      role: "objectives",
    };

    await step.run(
      { files: [flaggedSlides, normalDoc], schedule: SCHEDULE, hubCourse: "" },
      testHelpers(),
      () => {}
    );

    expect(buildCommonCartridge).toHaveBeenCalledTimes(1);
    const weeksArg = vi.mocked(buildCommonCartridge).mock.calls[0][1];
    const week1 = weeksArg.find((w) => w.week === 1)!;
    expect(week1).toBeDefined();
    const cartridgeFileNames = week1.files.map((f) => f.name);
    expect(cartridgeFileNames).not.toContain(flaggedSlides.name);
    expect(cartridgeFileNames).toContain(normalDoc.name);
  });
});
