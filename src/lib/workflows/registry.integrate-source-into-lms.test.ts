import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/app/actions", () => ({
  createPageAction: vi.fn(),
  createCourseAssignmentAction: vi.fn(),
  listCourseContentAction: vi.fn(),
  listCourseHubAction: vi.fn(),
}));

import {
  createPageAction,
  createCourseAssignmentAction,
  listCourseContentAction,
  listCourseHubAction,
} from "@/app/actions";
import { lmsIntegrationsSteps } from "./registry/steps.lms-integrations";
import type { StepRunHelpers } from "./registry-helpers";
import type { ScheduleWeekPlan } from "@/app/actions-types";
import type { Course } from "@/lib/supabase/courses";
import type { CanvasModule, CanvasPageSummary } from "@/lib/canvas-modules";

const step = lmsIntegrationsSteps.find((s) => s.type === "integrate-source-into-lms")!;

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
  };
}

function baseCourse(overrides: Partial<Course> = {}): Course {
  return {
    id: "course-1",
    name: "CS 101",
    courseCode: null,
    term: null,
    canvasUrl: "https://canvas.example.com/courses/1",
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

const schedule: ScheduleWeekPlan[] = [
  { week: 1, topic: "Intro", summary: "Chapter 1: Basics", assignmentTitle: "A1", assignmentSlug: "a1", testName: null },
  { week: 2, topic: "Review", summary: "Midterm review", assignmentTitle: null, assignmentSlug: null, testName: null },
];

function moduleFixture(overrides: Partial<CanvasModule> = {}): CanvasModule {
  return {
    id: 101,
    name: "Module 01",
    position: 1,
    published: true,
    itemsCount: 0,
    items: [],
    ...overrides,
  };
}

describe("integrate-source-into-lms step", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("matches lms-modules' 'Module NN' name format (not just 'Week N')", async () => {
    vi.mocked(listCourseHubAction).mockResolvedValue({ courses: [baseCourse()] });
    vi.mocked(listCourseContentAction).mockResolvedValue({
      courseName: "Course",
      modules: [moduleFixture({ name: "Module 01" })],
      pages: [] as CanvasPageSummary[],
    });
    vi.mocked(createPageAction).mockResolvedValue({
      page: { pageId: 1, url: "week-1", title: "x", body: "", published: true, updatedAt: null },
    });
    vi.mocked(createCourseAssignmentAction).mockResolvedValue({
      id: 1,
      name: "Complete Chapter 1 exercises",
      htmlUrl: "https://canvas.example.com/x",
      addedToModule: true,
    });

    const result = await step.run(
      {
        hubCourse: "course-1",
        schedule,
        sourceMaterial: "My Textbook",
        sourceUrl: "",
      },
      testHelpers(),
      () => {}
    );

    expect(result.outputs.pagesCreated).toBe(1);
    expect(result.outputs.assignmentsCreated).toBe(1);
    expect(createPageAction).toHaveBeenCalledTimes(1);
    expect(createCourseAssignmentAction).toHaveBeenCalledWith(
      "https://canvas.example.com/courses/1",
      expect.objectContaining({ name: "Complete Chapter 1 exercises" }),
      101
    );
  });

  it("skips a page/assignment whose exact title already exists (idempotent re-run)", async () => {
    vi.mocked(listCourseHubAction).mockResolvedValue({ courses: [baseCourse()] });
    vi.mocked(listCourseContentAction).mockResolvedValue({
      courseName: "Course",
      modules: [
        moduleFixture({
          name: "Module 01",
          items: [
            {
              id: 9001,
              moduleId: 101,
              title: "Complete Chapter 1 exercises",
              type: "Assignment",
              position: 1,
              indent: 0,
              published: true,
              pageUrl: null,
              contentId: 555,
              dueAt: null,
              pointsPossible: 10,
              htmlUrl: null,
              externalUrl: null,
            },
          ],
        }),
      ],
      pages: [
        {
          pageId: 42,
          url: "week-1-my-textbook-chapter-1",
          title: 'Week 1 - My Textbook: Chapter 1',
          published: true,
          frontPage: false,
          updatedAt: null,
        },
      ],
    });

    const result = await step.run(
      {
        hubCourse: "course-1",
        schedule,
        sourceMaterial: "My Textbook",
        sourceUrl: "",
      },
      testHelpers(),
      () => {}
    );

    expect(result.outputs.pagesCreated).toBe(0);
    expect(result.outputs.assignmentsCreated).toBe(0);
    expect(createPageAction).not.toHaveBeenCalled();
    expect(createCourseAssignmentAction).not.toHaveBeenCalled();
    expect(result.summary.kind).toBe("list");
    if (result.summary.kind === "list") {
      expect(result.summary.items.some((i) => i.includes("skipped (already present)"))).toBe(true);
    }
  });

  it("within a single run: two weeks with same chapter ref skip the second's assignment but not page (duplicate-assignment prevention)", async () => {
    const scheduleWithDuplicateChapter: ScheduleWeekPlan[] = [
      { week: 1, topic: "Intro", summary: "Chapter 1: Basics", assignmentTitle: "A1", assignmentSlug: "a1", testName: null },
      { week: 2, topic: "More Intro", summary: "Chapter 1: Basics (more)", assignmentTitle: "A2", assignmentSlug: "a2", testName: null },
    ];

    vi.mocked(listCourseHubAction).mockResolvedValue({ courses: [baseCourse()] });
    vi.mocked(listCourseContentAction).mockResolvedValue({
      courseName: "Course",
      modules: [
        moduleFixture({ name: "Module 01" }),
        moduleFixture({ name: "Module 02", id: 102, position: 2 }),
      ],
      pages: [] as CanvasPageSummary[],
    });
    vi.mocked(createPageAction).mockResolvedValue({
      page: { pageId: 1, url: "week-1", title: "x", body: "", published: true, updatedAt: null },
    });
    vi.mocked(createCourseAssignmentAction).mockResolvedValue({
      id: 1,
      name: "Complete Chapter 1 exercises",
      htmlUrl: "https://canvas.example.com/x",
      addedToModule: true,
    });

    const result = await step.run(
      {
        hubCourse: "course-1",
        schedule: scheduleWithDuplicateChapter,
        sourceMaterial: "My Textbook",
        sourceUrl: "",
      },
      testHelpers(),
      () => {}
    );

    expect(result.outputs.pagesCreated).toBe(2);
    expect(result.outputs.assignmentsCreated).toBe(1);
    expect(createPageAction).toHaveBeenCalledTimes(2);
    expect(createCourseAssignmentAction).toHaveBeenCalledTimes(1);
    expect(result.summary.kind).toBe("list");
    if (result.summary.kind === "list") {
      expect(result.summary.items.some((i) => i.includes("skipped (already present)"))).toBe(true);
    }
  });

  it("matches module names: Module 10 (two digits, no leading zero), week 3 (lowercase), and excludes non-matching Resources", async () => {
    vi.mocked(listCourseHubAction).mockResolvedValue({ courses: [baseCourse()] });
    vi.mocked(listCourseContentAction).mockResolvedValue({
      courseName: "Course",
      modules: [
        moduleFixture({ name: "Module 10", id: 101, position: 1 }),
        moduleFixture({ name: "week 3", id: 102, position: 2 }),
        moduleFixture({ name: "Resources", id: 103, position: 3 }),
      ],
      pages: [] as CanvasPageSummary[],
    });
    vi.mocked(createPageAction).mockResolvedValue({
      page: { pageId: 1, url: "week-1", title: "x", body: "", published: true, updatedAt: null },
    });
    vi.mocked(createCourseAssignmentAction).mockResolvedValue({
      id: 1,
      name: "Complete Chapter 1 exercises",
      htmlUrl: "https://canvas.example.com/x",
      addedToModule: true,
    });

    const scheduleWithMultipleWeeks: ScheduleWeekPlan[] = [
      { week: 10, topic: "Advanced", summary: "Chapter 5: Advanced topics", assignmentTitle: "A1", assignmentSlug: "a1", testName: null },
      { week: 3, topic: "Basics", summary: "Chapter 2: Basics", assignmentTitle: "A2", assignmentSlug: "a2", testName: null },
    ];

    const result = await step.run(
      {
        hubCourse: "course-1",
        schedule: scheduleWithMultipleWeeks,
        sourceMaterial: "My Textbook",
        sourceUrl: "",
      },
      testHelpers(),
      () => {}
    );

    expect(result.outputs.pagesCreated).toBe(2);
    expect(result.outputs.assignmentsCreated).toBe(2);
    expect(createPageAction).toHaveBeenCalledTimes(2);
    expect(createCourseAssignmentAction).toHaveBeenCalledTimes(2);
  });
});
