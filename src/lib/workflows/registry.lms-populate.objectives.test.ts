// AC3: module objectives files must become native LMS Pages through the
// SAME role+pageText mechanism "introduction" files already use in
// lms-populate (steps.lms-modules.ts), not a parallel path. This is the only
// direct run-behavior coverage of that mechanism at all (no prior test file
// exercised lms-populate's run() beyond its input specs), so it also pins
// the pre-existing "introduction" branch while it is here.

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/app/actions", () => ({
  listCourseContentAction: vi.fn(),
  createModuleAction: vi.fn(),
  requestFileUploadAction: vi.fn(),
  createModuleItemAction: vi.fn(),
  deleteModuleAction: vi.fn(),
  createPageAction: vi.fn(),
}));

import { createPageAction, createModuleItemAction, requestFileUploadAction } from "@/app/actions";
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

function objectivesFile(pageText: string): GeneratedCourseFile {
  return {
    name: "Week 1 - Module Objectives.docx",
    blob: new Blob(["doc bytes"]),
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    weekNumber: 1,
    sortOrder: 0.5,
    role: "objectives",
    pageText,
  };
}

describe("lms-populate turns an objectives file into a native LMS Page (AC3)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createPageAction).mockResolvedValue({
      page: { pageId: 1, url: "week-1-module-objectives", title: "Week 1 - Module Objectives", body: "", published: true, updatedAt: null },
    });
    vi.mocked(createModuleItemAction).mockResolvedValue({ ok: true });
  });

  it("creates a page from the objectives file's pageText and links it into the module, instead of uploading the docx", async () => {
    const result = await step.run(
      {
        course: "https://canvas.example.com/courses/1",
        modules: MODULES,
        files: [objectivesFile("# Module Objectives: Week 1\n\n## Learning Objectives\n- Build a stakeholder register")],
      },
      testHelpers(),
      () => {}
    );

    expect(createPageAction).toHaveBeenCalledTimes(1);
    const [, fields] = vi.mocked(createPageAction).mock.calls[0];
    expect(fields.title).toBe("Week 1 - Module Objectives");
    expect(fields.body).toContain("Build a stakeholder register");

    expect(createModuleItemAction).toHaveBeenCalledTimes(1);
    const [, moduleId, item] = vi.mocked(createModuleItemAction).mock.calls[0];
    expect(moduleId).toBe(10);
    expect(item).toEqual({ type: "Page", pageUrl: "week-1-module-objectives" });

    // Never uploaded as a raw file - the whole point of the role+pageText path.
    expect(requestFileUploadAction).not.toHaveBeenCalled();

    expect(result.summary.kind).toBe("list");
    if (result.summary.kind === "list") {
      expect(result.summary.items[0]).toContain("(page)");
    }
  });

  it("falls back to a raw file upload for an objectives entry with no pageText (defensive - should not happen in practice)", async () => {
    vi.mocked(requestFileUploadAction).mockResolvedValue({
      ticket: { uploadUrl: "https://upload.example.com", uploadParams: {} },
    });
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: 99 }) }) as never;

    const noPageText: GeneratedCourseFile = { ...objectivesFile(""), pageText: undefined };

    await step.run(
      { course: "https://canvas.example.com/courses/1", modules: MODULES, files: [noPageText] },
      testHelpers(),
      () => {}
    );

    expect(createPageAction).not.toHaveBeenCalled();
    expect(requestFileUploadAction).toHaveBeenCalledTimes(1);
  });
});
