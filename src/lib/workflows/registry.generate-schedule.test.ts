import { describe, it, expect, vi, beforeEach } from "vitest";

// steps.planning.ts (and the planning-generators it re-exports) import
// exactly these action names - mocking the module lets the step's run()
// execute for real without hitting an LLM or Supabase.
vi.mock("@/app/actions", () => ({
  generateSchedulePlanAction: vi.fn(),
  generateSchedulePlanFromRepoAction: vi.fn(),
  listCourseHubAction: vi.fn(),
  listCoursesByTermAction: vi.fn(),
  listCourseAssignmentDueDatesAction: vi.fn(),
  listConfiguredInstitutionsAction: vi.fn(),
  listAssignmentDueDatesByUrlAction: vi.fn(),
  listInstitutionsWithFeedsAction: vi.fn(),
  fetchIcsFeedAction: vi.fn(),
  listInstitutionFeedUrlsAction: vi.fn(),
  generateCourseScheduleAction: vi.fn(),
}));

import { generateSchedulePlanAction, listCourseHubAction } from "@/app/actions";
import { planningSteps } from "./registry/steps.planning";
import type { StepRunHelpers } from "./registry-helpers";
import type { Course } from "@/lib/supabase/courses";

const step = planningSteps.find((s) => s.type === "generate-schedule")!;

function testHelpers(): StepRunHelpers {
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
  };
}

function baseCourse(overrides: Partial<Course> = {}): Course {
  return {
    id: "course-1",
    name: "CS 101",
    courseCode: null,
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
    lms: null,
    dayTime: null,
    modality: null,
    materialsFiles: [],
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

describe("generate-schedule step", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("is registered with the context, sourceMaterial, and hubCourse optional inputs", () => {
    expect(step, "generate-schedule is registered").toBeTruthy();
    const inputByKey = new Map(step.inputs.map((i) => [i.key, i]));

    expect(inputByKey.get("context")).toMatchObject({ type: "longtext", required: false });
    expect(inputByKey.get("sourceMaterial")).toMatchObject({ type: "longtext", required: false });
    expect(inputByKey.get("hubCourse"), "hubCourse fallback input exists").toMatchObject({
      type: "hubCourse",
      required: false,
    });
  });

  it("appends a chapter-balance summary when sourceMaterial has a parseable TOC", async () => {
    vi.mocked(generateSchedulePlanAction).mockResolvedValue({
      courseTitle: "Intro to Testing",
      schedule: [
        { week: 1, topic: "Intro", summary: "Chapter 1: Basics", assignmentTitle: "A1", assignmentSlug: "a1", testName: null },
        { week: 2, topic: "More", summary: "Chapter 2: Advanced", assignmentTitle: "A2", assignmentSlug: "a2", testName: null },
      ],
    });

    const result = await step.run(
      {
        description: "A course about testing",
        weeks: 2,
        tests: 0,
        sourceMaterial: "Chapter 1: Basics\nChapter 2: Advanced",
      },
      testHelpers(),
      () => {}
    );

    expect(result.summary.kind).toBe("schedule");
    if (result.summary.kind === "schedule") {
      expect(result.summary.notes, "balance note present").toBeTruthy();
      expect(result.summary.notes).toContain("2/2 covered");
    }
  });

  it("notes name-only grounding when sourceMaterial has no parseable chapter list", async () => {
    vi.mocked(generateSchedulePlanAction).mockResolvedValue({
      courseTitle: "Intro to Testing",
      schedule: [
        { week: 1, topic: "Intro", summary: "Overview", assignmentTitle: "A1", assignmentSlug: "a1", testName: null },
      ],
    });

    const result = await step.run(
      {
        description: "A course about testing",
        weeks: 1,
        tests: 0,
        sourceMaterial: "Some Textbook, 3rd Edition",
      },
      testHelpers(),
      () => {}
    );

    expect(result.summary.kind).toBe("schedule");
    if (result.summary.kind === "schedule") {
      expect(result.summary.notes).toContain("name-only grounding");
    }
  });

  it("falls back to the course tile's textbook field when sourceMaterial is blank", async () => {
    vi.mocked(generateSchedulePlanAction).mockResolvedValue({
      courseTitle: "Intro to Testing",
      schedule: [
        { week: 1, topic: "Intro", summary: "Overview", assignmentTitle: "A1", assignmentSlug: "a1", testName: null },
      ],
    });
    vi.mocked(listCourseHubAction).mockResolvedValue({
      courses: [baseCourse({ textbook: "Fallback Textbook" })],
    });

    const result = await step.run(
      {
        description: "A course about testing",
        weeks: 1,
        tests: 0,
        sourceMaterial: "",
        hubCourse: "course-1",
      },
      testHelpers(),
      () => {}
    );

    expect(generateSchedulePlanAction).toHaveBeenCalledWith(
      "A course about testing",
      1,
      0,
      "gemini",
      undefined,
      "Fallback Textbook"
    );
    expect(result.summary.kind).toBe("schedule");
    if (result.summary.kind === "schedule") {
      expect(result.summary.notes).toContain("name-only grounding");
    }
  });

  it("has no balance note when neither sourceMaterial nor a tile fallback apply", async () => {
    vi.mocked(generateSchedulePlanAction).mockResolvedValue({
      courseTitle: "Intro to Testing",
      schedule: [
        { week: 1, topic: "Intro", summary: "Overview", assignmentTitle: "A1", assignmentSlug: "a1", testName: null },
      ],
    });

    const result = await step.run(
      { description: "A course", weeks: 1, tests: 0 },
      testHelpers(),
      () => {}
    );

    expect(result.summary.kind).toBe("schedule");
    if (result.summary.kind === "schedule") {
      expect(result.summary.notes).toBeUndefined();
    }
  });

  it("reports the pasted-TOC tier and outputs the pasted TOC as resolvedSourceMaterial", async () => {
    vi.mocked(generateSchedulePlanAction).mockResolvedValue({
      courseTitle: "Intro to Testing",
      schedule: [
        { week: 1, topic: "Intro", summary: "Chapter 1: Basics", assignmentTitle: "A1", assignmentSlug: "a1", testName: null },
        { week: 2, topic: "More", summary: "Chapter 2: Advanced", assignmentTitle: "A2", assignmentSlug: "a2", testName: null },
      ],
    });

    const result = await step.run(
      {
        description: "A course about testing",
        weeks: 2,
        tests: 0,
        sourceMaterial: "Chapter 1: Basics\nChapter 2: Advanced",
      },
      testHelpers(),
      () => {}
    );

    expect(result.summary.kind).toBe("schedule");
    if (result.summary.kind === "schedule") {
      expect(result.summary.notes).toContain("aligned (pasted TOC)");
    }
    expect(result.outputs.resolvedSourceMaterial).toBe("Chapter 1: Basics\nChapter 2: Advanced");
  });

  it("reports the derived-TOC tier, lists sources, and forwards the derived TOC as resolvedSourceMaterial", async () => {
    const derivedToc = "Module 1: Introduction\nModule 2: Footprinting\nModule 3: Scanning Networks";
    vi.mocked(generateSchedulePlanAction).mockResolvedValue({
      courseTitle: "CEH v12",
      schedule: [
        { week: 1, topic: "Intro", summary: "Module 1: Introduction", assignmentTitle: "A1", assignmentSlug: "a1", testName: null },
        { week: 2, topic: "Recon", summary: "Module 2: Footprinting", assignmentTitle: "A2", assignmentSlug: "a2", testName: null },
        { week: 3, topic: "Scanning", summary: "Module 3: Scanning Networks", assignmentTitle: "A3", assignmentSlug: "a3", testName: null },
      ],
      derivedToc,
      derivedSources: [
        { title: "uCertify CEH v12 course outline", uri: "https://example.com/toc" },
        { title: "EC-Council exam blueprint", uri: "https://example.com/blueprint" },
      ],
    });

    const result = await step.run(
      {
        description: "A CEH prep course",
        weeks: 3,
        tests: 0,
        sourceMaterial: "https://www.ucertify.com/app/?func=load_course&course=CEH-v12.AE1",
      },
      testHelpers(),
      () => {}
    );

    expect(result.summary.kind).toBe("schedule");
    if (result.summary.kind === "schedule") {
      expect(result.summary.notes).toContain("aligned (derived TOC - 3 chapters, 2 sources)");
      expect(result.summary.notes).toContain("uCertify CEH v12 course outline: https://example.com/toc");
      expect(result.summary.notes).toContain("EC-Council exam blueprint: https://example.com/blueprint");
    }
    expect(result.outputs.resolvedSourceMaterial).toBe(derivedToc);
  });

  it("outputs the original sourceMaterial as resolvedSourceMaterial when derivation is absent (name-only)", async () => {
    vi.mocked(generateSchedulePlanAction).mockResolvedValue({
      courseTitle: "Intro to Testing",
      schedule: [
        { week: 1, topic: "Intro", summary: "Overview", assignmentTitle: "A1", assignmentSlug: "a1", testName: null },
      ],
    });

    const result = await step.run(
      {
        description: "A course about testing",
        weeks: 1,
        tests: 0,
        sourceMaterial: "Some Textbook, 3rd Edition",
      },
      testHelpers(),
      () => {}
    );

    expect(result.outputs.resolvedSourceMaterial).toBe("Some Textbook, 3rd Edition");
  });
});
