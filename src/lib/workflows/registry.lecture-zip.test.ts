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
  getDeckTemplateAction: vi.fn(),
  listAssignmentDueDatesByUrlAction: vi.fn(),
}));

// assembleLectureFiles drives real pptx/docx/zip generation (via jszip),
// which requires browser Blob-reading support that vitest's node environment
// doesn't provide. This test cares about the repoless run's own logic
// (materials gathering, schedule resolution, the generation-action call, and
// the summary override) so assembleLectureFiles is mocked; its own output
// shape is covered by the shared helper's own tests, not duplicated here.
vi.mock("@/lib/workflows/registry-helpers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/workflows/registry-helpers")>();
  return { ...actual, assembleLectureFiles: vi.fn() };
});

import {
  listCourseHubAction,
  generateLectureMaterialsFromScheduleAction,
  getRepoZipAction,
} from "@/app/actions";
import { getStepDefinition } from "./registry";
import { assembleLectureFiles, type StepRunHelpers } from "./registry-helpers";
import type { Course } from "@/lib/supabase/courses";
import type { AssignmentPlan } from "@/app/actions-types";

const step = getStepDefinition("lecture-zip")!;

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

function plan(overrides: Partial<AssignmentPlan> = {}): AssignmentPlan {
  return {
    assignmentName: "week-01",
    slides: [{ title: "Slide 1", bullets: ["a"] }],
    presentationTitle: "Week 1",
    label: "Week 1",
    moduleIntroduction: "Intro text",
    assignmentInstructions: "Instructions text",
    weekNumber: 1,
    introTemplateHeadings: [],
    instructionsTemplateHeadings: [],
    ...overrides,
  };
}

describe("lecture-zip step", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("repo input is optional (required: false)", () => {
    const repoInput = step.inputs.find((i) => i.key === "repo");
    expect(repoInput, "repo input exists").toBeTruthy();
    expect(repoInput!.required).toBe(false);
    expect(repoInput!.help).toContain("primary source when linked");
  });

  it("sources help text no longer states the repo is always primary", () => {
    const sourcesInput = step.inputs.find((i) => i.key === "sources");
    expect(sourcesInput!.help).not.toContain("always the primary source");
    expect(sourcesInput!.help).toContain("primary source when linked");
  });

  it("blank repo and blank hubCourse errors instead of skipping", async () => {
    await expect(
      step.run({ repo: "", minutes: 50, hubCourse: "" }, testHelpers(), () => {})
    ).rejects.toThrow(/Link a repository or choose a course tile/);
    expect(getRepoZipAction).not.toHaveBeenCalled();
  });

  it("blank repo, no usable materials, and no schedule errors with the gather notes", async () => {
    vi.mocked(listCourseHubAction).mockResolvedValue({
      courses: [baseCourse({ id: "course-1", canvasUrl: null, csvData: null })],
    });

    await expect(
      step.run(
        { repo: "", minutes: 50, hubCourse: "course-1", sources: JSON.stringify({ order: ["tile-meta"], strategy: "first-success" }) },
        testHelpers(),
        () => {}
      )
    ).rejects.toThrow(/No usable content sources for "CS 101"/);
    expect(generateLectureMaterialsFromScheduleAction).not.toHaveBeenCalled();
  });

  it("blank repo builds the zip from course sources: gathers materials, resolves schedule from csvData, and generates decks", async () => {
    const csvData = [
      "week,topic,summary,assignment,test",
      "1,Intro to Testing,Chapter 1 basics,,",
    ].join("\n");
    const tile = baseCourse({
      id: "course-1",
      name: "CS 101",
      canvasUrl: null,
      csvData,
      topics: "Topic notes",
      description: "Course description",
    });
    vi.mocked(listCourseHubAction).mockResolvedValue({ courses: [tile] });
    vi.mocked(generateLectureMaterialsFromScheduleAction).mockResolvedValue([plan()]);
    vi.mocked(assembleLectureFiles).mockResolvedValue({
      files: [
        {
          name: "Week 1 Slides.pptx",
          blob: new Blob([]),
          mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
          weekNumber: 1,
          sortOrder: 1,
          role: "slides",
        },
      ],
      summary: { kind: "list", label: "Generated 1 files (zip downloaded)", items: ["Week 1 Slides.pptx"] },
    });

    const result = await step.run(
      {
        repo: "",
        minutes: 50,
        hubCourse: "course-1",
        sources: JSON.stringify({ order: ["tile-meta"], strategy: "first-success" }),
      },
      testHelpers(),
      () => {}
    );

    expect(generateLectureMaterialsFromScheduleAction).toHaveBeenCalledTimes(1);
    const callArgs = vi.mocked(generateLectureMaterialsFromScheduleAction).mock.calls[0];
    const scheduleArg = JSON.parse(callArgs[0] as string);
    expect(scheduleArg[0].topic).toBe("Intro to Testing");
    expect(callArgs[6]).toContain("Topic notes");

    expect(assembleLectureFiles).toHaveBeenCalledTimes(1);
    const assembleArgs = vi.mocked(assembleLectureFiles).mock.calls[0];
    expect(assembleArgs[0]).toEqual([plan()]);
    expect(assembleArgs[4]).toBe("lecture_materials");

    expect(result.outputs.files).toBeTruthy();
    const files = result.outputs.files as unknown[];
    expect(files.length).toBeGreaterThan(0);
    expect(result.summary.kind).toBe("list");
    if (result.summary.kind === "list") {
      expect(result.summary.label).toContain("no repository linked");
      expect(result.summary.items.some((i) => i.includes("includeInstructions"))).toBe(true);
    }
  });

  it("propagates a clear error from the generation action instead of a silent skip", async () => {
    const tile = baseCourse({
      id: "course-1",
      csvData: "week,topic,summary,assignment,test\n1,Intro,Basics,,",
      topics: "Topic notes",
    });
    vi.mocked(listCourseHubAction).mockResolvedValue({ courses: [tile] });
    vi.mocked(generateLectureMaterialsFromScheduleAction).mockResolvedValue({ error: "generation failed" });

    await expect(
      step.run({ repo: "", minutes: 50, hubCourse: "course-1" }, testHelpers(), () => {})
    ).rejects.toThrow("generation failed");
  });
});
