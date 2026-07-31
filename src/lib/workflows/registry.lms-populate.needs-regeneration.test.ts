// V3 (professional-lift audit): a deck that fell back to the placeholder
// template (registry-helpers.ts's assembleLectureFiles) is not a
// deliverable - lms-populate must never upload it to the LMS as if it were
// a finished lecture, no matter what role/pageText it carries.

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/app/actions", () => ({
  listCourseContentAction: vi.fn(),
  createModuleAction: vi.fn(),
  requestFileUploadAction: vi.fn(),
  createModuleItemAction: vi.fn(),
  deleteModuleAction: vi.fn(),
  createPageAction: vi.fn(),
}));

import { requestFileUploadAction, createPageAction, createModuleItemAction } from "@/app/actions";
import { getStepDefinition } from "./registry";
import type { StepRunHelpers } from "./registry-helpers";
import type { GeneratedCourseFile, EnsuredModule } from "./types";

const step = getStepDefinition("lms-populate")!;

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

const MODULES: EnsuredModule[] = [{ week: 1, id: 10, name: "Module 01" }];

function slidesFile(overrides: Partial<GeneratedCourseFile> = {}): GeneratedCourseFile {
  return {
    name: "Week 1 - Lecture Slides - NEEDS REGENERATION.pptx",
    blob: new Blob(["pptx bytes"]),
    mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    weekNumber: 1,
    sortOrder: 1,
    role: "slides",
    needsRegeneration: true,
    ...overrides,
  };
}

describe("lms-populate skips a file marked needsRegeneration (V3)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("never uploads a needsRegeneration slides file", async () => {
    const result = await step.run(
      { course: "https://canvas.example.com/courses/1", modules: MODULES, files: [slidesFile()] },
      testHelpers(),
      () => {}
    );

    expect(requestFileUploadAction).not.toHaveBeenCalled();
    expect(result.summary.kind).toBe("list");
    if (result.summary.kind === "list") {
      expect(result.summary.items[0]).toContain("skipped");
    }
  });

  it("still uploads a normal (non-flagged) slides file", async () => {
    vi.mocked(requestFileUploadAction).mockResolvedValue({
      ticket: { uploadUrl: "https://upload.example.com", uploadParams: {} },
    });
    vi.mocked(createModuleItemAction).mockResolvedValue({ ok: true });
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: 99 }) }) as never;

    await step.run(
      { course: "https://canvas.example.com/courses/1", modules: MODULES, files: [slidesFile({ needsRegeneration: undefined })] },
      testHelpers(),
      () => {}
    );

    expect(requestFileUploadAction).toHaveBeenCalledTimes(1);
  });

  it("a needsRegeneration file is skipped even if it also carries pageText that would otherwise route to createPageAction", async () => {
    const flaggedIntro: GeneratedCourseFile = {
      ...slidesFile({ role: "introduction", pageText: "some text" }),
    };

    await step.run(
      { course: "https://canvas.example.com/courses/1", modules: MODULES, files: [flaggedIntro] },
      testHelpers(),
      () => {}
    );

    expect(createPageAction).not.toHaveBeenCalled();
    expect(requestFileUploadAction).not.toHaveBeenCalled();
  });
});
