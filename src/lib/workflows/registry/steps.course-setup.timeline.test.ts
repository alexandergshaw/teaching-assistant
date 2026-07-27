import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/app/actions", () => ({
  listCourseHubAction: vi.fn(),
  updateCourseHubAction: vi.fn(),
  listCourseContentAction: vi.fn(),
  setModuleDueDatesAction: vi.fn(),
}));

import {
  listCourseHubAction,
  listCourseContentAction,
  setModuleDueDatesAction,
} from "@/app/actions";
import { courseSetupTimelineSteps } from "./steps.course-setup.timeline";
import type { StepRunHelpers } from "@/lib/workflows/registry-helpers";
import type { Course } from "@/lib/supabase/courses";
import type { DueDateUpdate } from "@/lib/canvas-modules";

const step = courseSetupTimelineSteps.find((s) => s.type === "assign-week-deadlines")!;

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

function baseCourse(overrides: Partial<Course> = {}): Course {
  return {
    id: "course-1",
    name: "CS 101",
    courseCode: null,
    term: null,
    canvasUrl: "https://canvas.example.edu/courses/1",
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
    topicOutline: null,
    syllabusTemplateId: null,
    endDate: null,
    breaks: null,
    assignmentDueRule: null,
    email: null,
    emailClient: null,
    classLengthMinutes: null,
    materialsFiles: [],
    castletopFiles: [],
    miscFiles: [],
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

// One module ("Module 01" -> week 1) with a single gradable item, so every
// call to setModuleDueDatesAction carries exactly one DueDateUpdate whose
// dueAt is the thing under test. contentId varies per course so the two
// courses' updates are never confused with one another.
function makeContent(contentId: number) {
  return {
    courseName: "Course",
    modules: [
      {
        id: 1,
        name: "Module 01",
        position: 1,
        published: true,
        itemsCount: 1,
        items: [
          {
            id: 9000 + contentId,
            moduleId: 1,
            title: "Week 1 Deliverable",
            type: "Assignment",
            position: 1,
            indent: 0,
            published: true,
            pageUrl: null,
            contentId,
            dueAt: null,
            pointsPossible: 100,
            htmlUrl: null,
            externalUrl: null,
          },
        ],
      },
    ],
    pages: [],
  };
}

describe("assign-week-deadlines step", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // The per-course-in-the-loop guard (AC B3): each course's assignmentDueRule
  // column must be resolved fresh on every iteration. If the rule were
  // resolved once outside the loop (e.g. from the first course only), Course
  // Two would silently inherit Course One's Wednesday rule instead of its own
  // Friday rule - this test fails under that bug (verified via the mandatory
  // acceptance check: hoisting the resolution out of the loop makes this
  // test fail).
  it("resolves the due-date rule per course - two courses with different rules land on different weekdays/times", async () => {
    const tile1 = baseCourse({
      id: "course-1",
      name: "Course One",
      canvasUrl: "https://canvas.example.edu/courses/1",
      assignmentDueRule: "wed|17:30",
    });
    const tile2 = baseCourse({
      id: "course-2",
      name: "Course Two",
      canvasUrl: "https://canvas.example.edu/courses/2",
      assignmentDueRule: "fri|09:00",
    });

    vi.mocked(listCourseHubAction).mockResolvedValue({ courses: [tile1, tile2] });
    vi.mocked(listCourseContentAction).mockImplementation(async (courseUrl: string) => {
      if (courseUrl === tile1.canvasUrl) return makeContent(501);
      if (courseUrl === tile2.canvasUrl) return makeContent(502);
      return { error: "unexpected course url" };
    });
    vi.mocked(setModuleDueDatesAction).mockResolvedValue({ updated: 1, failures: [] });

    const result = await step.run(
      { courses: `${tile1.id}\n${tile2.id}`, startDate: "2026-01-05" }, // 2026-01-05 is a Monday
      testHelpers(),
      () => {}
    );

    const calls = vi.mocked(setModuleDueDatesAction).mock.calls;
    expect(calls).toHaveLength(2);

    const call1 = calls.find((c) => c[0] === tile1.canvasUrl);
    const call2 = calls.find((c) => c[0] === tile2.canvasUrl);
    expect(call1).toBeDefined();
    expect(call2).toBeDefined();

    const updates1 = call1![1] as DueDateUpdate[];
    const updates2 = call2![1] as DueDateUpdate[];
    expect(updates1).toHaveLength(1);
    expect(updates2).toHaveLength(1);

    const due1 = new Date(updates1[0].dueAt!);
    const due2 = new Date(updates2[0].dueAt!);

    // Course One: wed|17:30 -> Wednesday of week 1 at 17:30.
    expect(due1.getDay()).toBe(3);
    expect(due1.getHours()).toBe(17);
    expect(due1.getMinutes()).toBe(30);

    // Course Two: fri|09:00 -> Friday of week 1 at 09:00. If the rule
    // resolution were hoisted out of the loop, this would incorrectly equal
    // due1 (Course One's Wednesday/17:30 rule applied to both courses).
    expect(due2.getDay()).toBe(5);
    expect(due2.getHours()).toBe(9);
    expect(due2.getMinutes()).toBe(0);

    expect(due1.getTime()).not.toBe(due2.getTime());

    expect(result.summary.kind).toBe("list");
    if (result.summary.kind === "list") {
      expect(
        result.summary.items.some(
          (i) => i.includes("Course One") && i.includes("deadlines set to Wednesdays at 5:30 PM")
        )
      ).toBe(true);
      expect(
        result.summary.items.some(
          (i) => i.includes("Course Two") && i.includes("deadlines set to Fridays at 9:00 AM")
        )
      ).toBe(true);
    }
  });

  it("adds no rule note, and keeps the historical Sunday 23:59 deadline, when a course has no assignmentDueRule set", async () => {
    const tile = baseCourse({
      id: "course-1",
      name: "Course One",
      canvasUrl: "https://canvas.example.edu/courses/1",
      assignmentDueRule: null,
    });
    vi.mocked(listCourseHubAction).mockResolvedValue({ courses: [tile] });
    vi.mocked(listCourseContentAction).mockResolvedValue(makeContent(501));
    vi.mocked(setModuleDueDatesAction).mockResolvedValue({ updated: 1, failures: [] });

    const result = await step.run(
      { courses: tile.id, startDate: "2026-01-05" },
      testHelpers(),
      () => {}
    );

    const calls = vi.mocked(setModuleDueDatesAction).mock.calls;
    const updates = calls[0][1] as DueDateUpdate[];
    const due = new Date(updates[0].dueAt!);
    expect(due.getDay()).toBe(0); // Sunday
    expect(due.getHours()).toBe(23);
    expect(due.getMinutes()).toBe(59);

    expect(result.summary.kind).toBe("list");
    if (result.summary.kind === "list") {
      expect(result.summary.items[0]).not.toContain("deadlines set to");
    }
  });
});
