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
  listCourseContentAction,
} from "@/app/actions";
import { getStepDefinition } from "./registry";
import { assembleLectureFiles, type StepRunHelpers } from "./registry-helpers";
import type { Course } from "@/lib/supabase/courses";
import type { AssignmentPlan } from "@/app/actions-types";
import { nameModuleValue } from "./module-value";

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

  it("materials present but every schedule tier is topic-less: actionable error naming what to add, never the raw action error", async () => {
    const tile = baseCourse({
      id: "course-1",
      csvData: "week,topic,summary,assignment,test\n1,,,,",
      topics: null,
      description: "Some description with real material content",
    });
    vi.mocked(listCourseHubAction).mockResolvedValue({ courses: [tile] });

    await expect(
      step.run(
        { repo: "", minutes: 50, hubCourse: "course-1", sources: JSON.stringify({ order: ["tile-meta"], strategy: "first-success" }) },
        testHelpers(),
        () => {}
      )
    ).rejects.toThrow(/add a schedule with topics to the course tile, bind a schedule, or fill the tile's topics field/);
    expect(generateLectureMaterialsFromScheduleAction).not.toHaveBeenCalled();
  });

  it("bound schedule value arrives as a JSON string: parsed, topic-filtered, and used instead of the csv/topics tiers", async () => {
    const boundSchedule = JSON.stringify([
      { week: 1, topic: "Bound Topic", summary: "", assignmentTitle: null, assignmentSlug: null, testName: null },
    ]);
    const tile = baseCourse({
      id: "course-1",
      csvData: "week,topic,summary,assignment,test\n1,CSV Topic,,,",
      topics: "Topics field",
    });
    vi.mocked(listCourseHubAction).mockResolvedValue({ courses: [tile] });
    vi.mocked(generateLectureMaterialsFromScheduleAction).mockResolvedValue([plan()]);
    vi.mocked(assembleLectureFiles).mockResolvedValue({
      files: [],
      summary: { kind: "list", label: "label", items: [] },
    });

    await step.run(
      { repo: "", minutes: 50, hubCourse: "course-1", schedule: boundSchedule },
      testHelpers(),
      () => {}
    );

    const callArgs = vi.mocked(generateLectureMaterialsFromScheduleAction).mock.calls[0];
    const scheduleArg = JSON.parse(callArgs[0] as string);
    expect(scheduleArg).toEqual([
      { week: 1, topic: "Bound Topic", summary: "", assignmentTitle: null, assignmentSlug: null, testName: null },
    ]);
  });

  it("csv is topic-less but the tile's topics field has lines: synthesizes a schedule and still reaches the action", async () => {
    const tile = baseCourse({
      id: "course-1",
      csvData: "week,topic,summary,assignment,test\n1,,,,",
      topics: "Intro to Testing\nAdvanced Testing",
      description: "Course description",
    });
    vi.mocked(listCourseHubAction).mockResolvedValue({ courses: [tile] });
    vi.mocked(generateLectureMaterialsFromScheduleAction).mockResolvedValue([plan()]);
    vi.mocked(assembleLectureFiles).mockResolvedValue({
      files: [{ name: "f.pptx", blob: new Blob([]), mimeType: "x", weekNumber: 1, sortOrder: 1, role: "slides" }],
      summary: { kind: "list", label: "label", items: [] },
    });

    const result = await step.run(
      { repo: "", minutes: 50, hubCourse: "course-1" },
      testHelpers(),
      () => {}
    );

    const callArgs = vi.mocked(generateLectureMaterialsFromScheduleAction).mock.calls[0];
    const scheduleArg = JSON.parse(callArgs[0] as string);
    expect(scheduleArg).toEqual([
      { week: 1, topic: "Intro to Testing", summary: "", assignmentTitle: null, assignmentSlug: null, testName: null },
      { week: 2, topic: "Advanced Testing", summary: "", assignmentTitle: null, assignmentSlug: null, testName: null },
    ]);
    expect(result.summary.kind).toBe("list");
    if (result.summary.kind === "list") {
      expect(result.summary.items.some((i) => i.includes("schedule derived from the tile's topics"))).toBe(true);
    }
  });

  // AC6: the user's exact reported scenario - live-lms policy (the default),
  // a tile with a canvasUrl and modules, a schedule CSV with 10 topic-less
  // weeks, and a blank topics field. Previously: "No usable content sources"
  // (the live-lms gatherer silently no-op'd with no module bound). Now: the
  // step succeeds, sourcing materials from the LMS and weeks from module
  // names.
  it("AC6: live-lms + canvasUrl + modules + 10 topic-less CSV weeks + blank topics -> succeeds", async () => {
    const csvRows = Array.from({ length: 10 }, (_, i) => `${i + 1},,,,`).join("\n");
    const csvData = ["week,topic,summary,assignment,test", csvRows].join("\n");
    const tile = baseCourse({
      id: "course-1",
      name: "Computer Science Principles",
      canvasUrl: "https://canvas.example.com/courses/1",
      csvData,
      topics: "",
    });
    vi.mocked(listCourseHubAction).mockResolvedValue({ courses: [tile] });
    vi.mocked(listCourseContentAction).mockResolvedValue({
      courseName: "Computer Science Principles",
      pages: [],
      modules: [
        {
          id: 1,
          name: "Unit 1: Intro to CS",
          position: 1,
          published: true,
          itemsCount: 1,
          items: [
            {
              id: 1,
              moduleId: 1,
              type: "Page",
              title: "Welcome",
              position: 1,
              indent: 0,
              published: true,
              contentId: null,
              htmlUrl: null,
              pageUrl: null,
              dueAt: null,
              pointsPossible: null,
              externalUrl: null,
            },
          ],
        },
        {
          id: 2,
          name: "Unit 2: Variables",
          position: 2,
          published: true,
          itemsCount: 0,
          items: [],
        },
      ],
    });
    vi.mocked(generateLectureMaterialsFromScheduleAction).mockResolvedValue([plan()]);
    vi.mocked(assembleLectureFiles).mockResolvedValue({
      files: [{ name: "f.pptx", blob: new Blob([]), mimeType: "x", weekNumber: 1, sortOrder: 1, role: "slides" }],
      summary: { kind: "list", label: "label", items: [] },
    });

    const result = await step.run(
      { repo: "", minutes: 50, hubCourse: "course-1" },
      testHelpers(),
      () => {}
    );

    expect(generateLectureMaterialsFromScheduleAction).toHaveBeenCalledTimes(1);
    const callArgs = vi.mocked(generateLectureMaterialsFromScheduleAction).mock.calls[0];
    const scheduleArg = JSON.parse(callArgs[0] as string) as Array<{ topic: string }>;
    expect(scheduleArg.map((w) => w.topic)).toEqual(["Unit 1: Intro to CS", "Unit 2: Variables"]);
    expect(callArgs[6]).toContain("Welcome");

    expect(result.summary.kind).toBe("list");
    if (result.summary.kind === "list") {
      expect(result.summary.items.some((i) => i.includes("schedule derived from"))).toBe(true);
      expect(result.summary.items.some((i) => i.includes("LMS module"))).toBe(true);
    }
  });

  it("declares a moduleId (lmsModule) input mentioning binding to the current-week/module step, picking, or workflow scope", () => {
    const moduleIdInput = step.inputs.find((i) => i.key === "moduleId");
    expect(moduleIdInput).toBeTruthy();
    expect(moduleIdInput!.type).toBe("lmsModule");
    expect(moduleIdInput!.required).toBe(false);
    expect(moduleIdInput!.help).toContain("Find the current week and module");
    expect(moduleIdInput!.help).toContain("workflow scope");
  });

  // AC5: blank/unset moduleId is byte-identical to today's behavior - the
  // repoless path already covers "" via the earlier tests in this file
  // (no moduleId key at all in their values objects); this test makes that
  // equivalence explicit.
  it("AC5: blank moduleId and no moduleId key produce identical gatherModuleMaterials calls", async () => {
    const tile = baseCourse({
      id: "course-1",
      csvData: "week,topic,summary,assignment,test\n1,Intro to Testing,,,",
      topics: "Topic notes",
    });
    vi.mocked(listCourseHubAction).mockResolvedValue({ courses: [tile] });
    vi.mocked(generateLectureMaterialsFromScheduleAction).mockResolvedValue([plan()]);
    vi.mocked(assembleLectureFiles).mockResolvedValue({
      files: [],
      summary: { kind: "list", label: "label", items: [] },
    });

    await step.run({ repo: "", minutes: 50, hubCourse: "course-1" }, testHelpers(), () => {});
    const callsA = vi.mocked(generateLectureMaterialsFromScheduleAction).mock.calls[0][6];

    vi.clearAllMocks();
    vi.mocked(listCourseHubAction).mockResolvedValue({ courses: [tile] });
    vi.mocked(generateLectureMaterialsFromScheduleAction).mockResolvedValue([plan()]);
    vi.mocked(assembleLectureFiles).mockResolvedValue({
      files: [],
      summary: { kind: "list", label: "label", items: [] },
    });
    await step.run({ repo: "", minutes: 50, hubCourse: "course-1", moduleId: "" }, testHelpers(), () => {});
    const callsB = vi.mocked(generateLectureMaterialsFromScheduleAction).mock.calls[0][6];

    expect(callsA).toBe(callsB);
  });

  it("AC5: a resolved module whose name yields a matching schedule week targets ONLY that week", async () => {
    const csvData = [
      "week,topic,summary,assignment,test",
      "1,Intro,,,",
      "2,Loops,,,",
      "3,Functions,,,",
    ].join("\n");
    const tile = baseCourse({ id: "course-1", csvData });
    vi.mocked(listCourseHubAction).mockResolvedValue({ courses: [tile] });
    vi.mocked(generateLectureMaterialsFromScheduleAction).mockResolvedValue([plan()]);
    vi.mocked(assembleLectureFiles).mockResolvedValue({
      files: [{ name: "f.pptx", blob: new Blob([]), mimeType: "x", weekNumber: 2, sortOrder: 1, role: "slides" }],
      summary: { kind: "list", label: "label", items: [] },
    });

    await step.run(
      {
        repo: "",
        minutes: 50,
        hubCourse: "course-1",
        moduleId: nameModuleValue("Module 02: Loops"),
      },
      testHelpers(),
      () => {}
    );

    const callArgs = vi.mocked(generateLectureMaterialsFromScheduleAction).mock.calls[0];
    const scheduleArg = JSON.parse(callArgs[0] as string) as Array<{ week: number; topic: string }>;
    expect(scheduleArg).toEqual([{ week: 2, topic: "Loops", summary: "", assignmentTitle: null, assignmentSlug: null, testName: null }]);
  });

  it("AC1: a targeted module whose week is absent from the resolved schedule synthesizes a single week from the module name, never the full schedule", async () => {
    const csvData = ["week,topic,summary,assignment,test", "1,Intro,,,", "2,Loops,,,"].join("\n");
    const tile = baseCourse({ id: "course-1", csvData });
    vi.mocked(listCourseHubAction).mockResolvedValue({ courses: [tile] });
    vi.mocked(generateLectureMaterialsFromScheduleAction).mockResolvedValue([plan()]);
    vi.mocked(assembleLectureFiles).mockResolvedValue({
      files: [{ name: "f.pptx", blob: new Blob([]), mimeType: "x", weekNumber: 9, sortOrder: 1, role: "slides" }],
      summary: { kind: "list", label: "label", items: [] },
    });

    const result = await step.run(
      {
        repo: "",
        minutes: 50,
        hubCourse: "course-1",
        moduleId: nameModuleValue("Module 09: Nonexistent"),
      },
      testHelpers(),
      () => {}
    );

    const callArgs = vi.mocked(generateLectureMaterialsFromScheduleAction).mock.calls[0];
    const scheduleArg = JSON.parse(callArgs[0] as string) as Array<{ week: number; topic: string }>;
    expect(scheduleArg).toEqual([
      { week: 9, topic: "Nonexistent", summary: "", assignmentTitle: null, assignmentSlug: null, testName: null },
    ]);
    if (result.summary.kind === "list") {
      expect(
        result.summary.items.some((i) =>
          i.includes('module "Module 09: Nonexistent" is not in the resolved schedule - generated week 9 from the module name itself')
        )
      ).toBe(true);
      expect(result.summary.items.some((i) => i.includes("using the full schedule"))).toBe(false);
    }
  });

  // AC4: the user's exact reported scenario - a course whose live LMS has
  // only a front-matter "Start Here" module (no CSV schedule, no tile
  // topics), targeting "Module 07: Algorithms and Data Structures". The
  // ladder's LMS-module-names tier would otherwise build a Week 1 "Start
  // Here" schedule that the targeting block then falls back to in full -
  // exactly the reported bug. It must instead produce exactly ONE deck for
  // week 7, built from the module name, never week 1 / Start Here.
  it("AC4: targeted Module 07 with only a front-matter LMS module produces one week-7 deck, never week 1 / Start Here", async () => {
    const tile = baseCourse({
      id: "course-1",
      canvasUrl: "https://canvas.example.com/courses/1",
      csvData: null,
      topics: null,
    });
    vi.mocked(listCourseHubAction).mockResolvedValue({ courses: [tile] });
    vi.mocked(listCourseContentAction).mockResolvedValue({
      courseName: "CS 101",
      pages: [],
      modules: [{ id: 1, name: "Start Here", position: 1, published: true, itemsCount: 0, items: [] }],
    });
    vi.mocked(generateLectureMaterialsFromScheduleAction).mockResolvedValue([plan()]);
    vi.mocked(assembleLectureFiles).mockResolvedValue({
      files: [{ name: "f.pptx", blob: new Blob([]), mimeType: "x", weekNumber: 7, sortOrder: 1, role: "slides" }],
      summary: { kind: "list", label: "label", items: [] },
    });

    const result = await step.run(
      {
        repo: "",
        minutes: 50,
        hubCourse: "course-1",
        moduleId: nameModuleValue("Module 07: Algorithms and Data Structures"),
      },
      testHelpers(),
      () => {}
    );

    const callArgs = vi.mocked(generateLectureMaterialsFromScheduleAction).mock.calls[0];
    const scheduleArg = JSON.parse(callArgs[0] as string) as Array<{ week: number; topic: string }>;
    expect(scheduleArg).toEqual([
      {
        week: 7,
        topic: "Algorithms and Data Structures",
        summary: "",
        assignmentTitle: null,
        assignmentSlug: null,
        testName: null,
      },
    ]);
    expect(scheduleArg.some((w) => w.week === 1 || /start here/i.test(w.topic))).toBe(false);
    if (result.summary.kind === "list") {
      expect(result.summary.label).toContain("(1 deck)");
      expect(
        result.summary.items.some((i) =>
          i.includes(
            'module "Module 07: Algorithms and Data Structures" is not in the resolved schedule - generated week 7 from the module name itself'
          )
        )
      ).toBe(true);
    }
  });

  it("AC5: the repo-driven path passes moduleId through to the supplemental gatherer", async () => {
    vi.mocked(getRepoZipAction).mockResolvedValue({ base64: "zip-data", name: "repo.zip" });
    const tile = baseCourse({ id: "course-1", canvasUrl: "https://canvas.example.com/courses/1" });
    vi.mocked(listCourseHubAction).mockResolvedValue({ courses: [tile] });
    vi.mocked(listCourseContentAction).mockResolvedValue({
      courseName: "CS 101",
      pages: [],
      modules: [
        {
          id: 7,
          name: "Module 05: Loops",
          position: 5,
          published: true,
          itemsCount: 1,
          items: [
            { id: 1, moduleId: 7, type: "Quiz", title: "Loop quiz", position: 1, indent: 0, published: true, contentId: 1, htmlUrl: null, pageUrl: null, dueAt: null, pointsPossible: null, externalUrl: null },
          ],
        },
      ],
    });

    const generateLecturePlansActionMod = await import("@/app/actions");
    vi.mocked(generateLecturePlansActionMod.generateLecturePlansAction).mockResolvedValue([plan()]);
    vi.mocked(assembleLectureFiles).mockResolvedValue({
      files: [],
      summary: { kind: "list", label: "label", items: [] },
    });

    await step.run(
      {
        repo: "org/repo",
        minutes: 50,
        hubCourse: "course-1",
        moduleId: nameModuleValue("Module 05: Loops"),
      },
      testHelpers(),
      () => {}
    );

    expect(listCourseContentAction).toHaveBeenCalled();
    const callArgs = vi.mocked(generateLecturePlansActionMod.generateLecturePlansAction).mock.calls[0];
    expect(callArgs[5]).toContain("Loop quiz");
  });
});
