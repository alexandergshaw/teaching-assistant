import { describe, it, expect, vi, beforeEach } from "vitest";

// steps.media.ts imports exactly these action names - mocking the module lets
// the step's run() execute for real without hitting an LLM or Supabase.
vi.mock("@/app/actions", () => ({
  listCourseContentAction: vi.fn(),
  listCourseHubAction: vi.fn(),
  createPageAction: vi.fn(),
  generateConceptPlanAction: vi.fn(),
  generateConceptAnimationAction: vi.fn(),
  findCaseStudyMaterialAction: vi.fn(),
  generateSlidesAction: vi.fn(),
  generateLectureScriptAction: vi.fn(),
  reviseLectureSlidesAction: vi.fn(),
  extractPptxSlidesAction: vi.fn(),
  synthesizeLongNarrationAction: vi.fn(),
  generateAvatarVideoAction: vi.fn(),
  getAvatarVideoStatusAction: vi.fn(),
  getDeckTemplateAction: vi.fn(),
  generateDeckFromTemplateAction: vi.fn(),
  savePresentationFileAction: vi.fn(),
  saveLibraryFileAction: vi.fn(),
}));

import {
  getDeckTemplateAction,
  generateDeckFromTemplateAction,
  savePresentationFileAction,
} from "@/app/actions";
import { mediaSteps } from "./registry/steps.media";
import type { StepRunHelpers } from "./registry-helpers";

const step = mediaSteps.find((s) => s.type === "generate-presentation-from-template")!;

function testHelpers(overrides: Partial<StepRunHelpers> = {}): StepRunHelpers {
  return {
    activeInstitution: null,
    provider: "gemini",
    author: "Test Author",
    saveBundle: null,
    saveCourseMaterialFile: null,
    saveCourseExportFile: null,
    loadCommonResources: null,
    getLibraryFile: null,
    getInstitutionFields: null,
    loadCourseExport: null,
    loadCourseMaterials: null,
    workflowId: "wf-1",
    workflowName: "My Workflow",
    workflowRunId: "run-1",
    ...overrides,
  };
}

const template = {
  name: "Basic Template",
  audience: "Students",
  tone: "neutral",
  theme: null,
  slides: [{ role: "title" }],
  loops: [],
};

const deck = {
  presentationTitle: "Intro to Testing",
  slides: [
    { title: "Slide 1", bullets: ["Point A"] },
    { title: "Slide 2", bullets: ["Point B"] },
  ],
};

describe("generate-presentation-from-template step run()", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getDeckTemplateAction).mockResolvedValue({ template } as never);
    vi.mocked(generateDeckFromTemplateAction).mockResolvedValue(deck as never);
  });

  it("saves the deck to Files as the primary deliverable and reports the Files destination", async () => {
    vi.mocked(savePresentationFileAction).mockResolvedValue({ id: "file-123" });

    const result = await step.run(
      { template: "basic" },
      testHelpers(),
      () => {}
    );

    expect(savePresentationFileAction).toHaveBeenCalledWith(
      expect.objectContaining({
        presentationTitle: "Intro to Testing",
        slides: deck.slides,
        workflowId: "wf-1",
        workflowName: "My Workflow",
        workflowRunId: "run-1",
      })
    );

    expect(result.outputs.draftId).toBe("file-123");
    expect(result.outputs.slideCount).toBe("2");
    expect(result.outputs.presentationTitle).toBe("Intro to Testing");

    const summaryText =
      result.summary.kind === "text"
        ? result.summary.text
        : result.summary.kind === "list"
          ? result.summary.label
          : "";
    expect(summaryText).toContain("Files library");
    expect(summaryText).not.toContain("Drafts");
  });

  it("throws (fails the step) when the Files save fails", async () => {
    vi.mocked(savePresentationFileAction).mockResolvedValue({ error: "disk full" });

    await expect(
      step.run({ template: "basic" }, testHelpers(), () => {})
    ).rejects.toThrow("disk full");
  });
});
