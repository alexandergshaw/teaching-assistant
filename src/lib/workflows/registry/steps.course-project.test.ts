// weeklyTopicsFromSchedule is the pure formatting helper define-course-project
// uses to ground a generation prompt in a BOUND schedule (an earlier step's
// output) instead of the tile's own saved data. It must produce the exact
// same text shape weeklyTopicsFrom(tile) already does for a tile with saved
// CSV data - scheduleToCsv - so the generation prompt reads identically
// whichever source supplied it, per the no-second-convention rule.
//
// ensureCourseProject (docs/REGRESSION.md 152) is the on-demand fallback that
// lets a workflow with no `define-course-project` step (a stale saved copy of
// a preset - see that regression entry) still get a course-long project the
// first time a generator needs one. It is mocked at the `@/app/actions`
// boundary (generateCourseProjectAction/setCourseProjectAction) the same way
// every other step test in this repo mocks server actions.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { weeklyTopicsFromSchedule, ensureCourseProject } from "./steps.course-project";
import { scheduleToCsv } from "@/lib/workflows/types";
import { emptyCourseProject, hasProject } from "@/lib/course-project";
import type { Course } from "@/lib/supabase/courses";
import type { ScheduleWeekPlan } from "@/app/actions";

vi.mock("@/app/actions", () => ({
  generateCourseProjectAction: vi.fn(),
  setCourseProjectAction: vi.fn(),
}));

import { generateCourseProjectAction, setCourseProjectAction } from "@/app/actions";

describe("weeklyTopicsFromSchedule", () => {
  it("matches scheduleToCsv exactly - the same shape tile.csvData already carries", () => {
    const schedule: ScheduleWeekPlan[] = [
      {
        week: 1,
        topic: "Introduction",
        summary: "Course overview",
        assignmentTitle: "Welcome",
        assignmentSlug: "welcome-assignment",
        testName: null,
      },
      {
        week: 2,
        topic: "Topic with, comma",
        summary: "Assignment review",
        assignmentTitle: null,
        assignmentSlug: null,
        testName: "Checkpoint 1",
      },
    ];

    expect(weeklyTopicsFromSchedule(schedule)).toBe(scheduleToCsv(schedule));
    // The header row confirms it is the SAME CSV shape weeklyTopicsFrom(tile)
    // returns for a tile with saved csvData - not a second, differently
    // formatted convention.
    expect(weeklyTopicsFromSchedule(schedule)).toBe(
      "Week,Topic,Summary,Assignment,Test\n" +
        "1,Introduction,Course overview,Welcome,\n" +
        '2,"Topic with, comma",Assignment review,,Checkpoint 1'
    );
  });

  it("an empty schedule returns an empty string rather than a header-only CSV", () => {
    // A blank result (not scheduleToCsv([]), which would be just the header
    // row) is what lets the caller cleanly fall back to weeklyTopicsFrom(tile)
    // when no schedule was bound.
    expect(weeklyTopicsFromSchedule([])).toBe("");
  });

  it("a single-week schedule is one CSV data row under the header", () => {
    const schedule: ScheduleWeekPlan[] = [
      {
        week: 1,
        topic: "Solo week",
        summary: "",
        assignmentTitle: null,
        assignmentSlug: null,
        testName: null,
      },
    ];

    const result = weeklyTopicsFromSchedule(schedule);
    expect(result.split("\n")).toEqual(["Week,Topic,Summary,Assignment,Test", "1,Solo week,,,"]);
  });
});

function baseCourse(overrides: Partial<Course> = {}): Course {
  return {
    id: "course-1",
    name: "PM 101",
    courseCode: "PM101",
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
    topicOutline: null,
    syllabusTemplateId: null,
    endDate: null,
    breaks: null,
    assignmentDueRule: null,
    email: null,
    emailClient: null,
    classLengthMinutes: null,
    courseProject: emptyCourseProject(),
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

const generatedPlan = {
  name: "Community Garden Launch Plan",
  brief: "Plan and pitch a community garden.",
  milestones: [
    { week: 1, title: "Stakeholder map", deliverable: "A one-page stakeholder map." },
    { week: 2, title: "Charter draft", deliverable: "A draft project charter." },
  ],
};

describe("ensureCourseProject", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("an existing project is returned unchanged - no generation call at all (AC2/AC4 idempotency)", async () => {
    const project = { ...emptyCourseProject(), mode: "course-long" as const, name: "X", definition: "X" };
    const tile = baseCourse({ courseProject: project, weeks: 10 });

    const result = await ensureCourseProject(tile, "gemini", "applied", []);

    expect(result).toEqual({ project, created: false });
    expect(generateCourseProjectAction).not.toHaveBeenCalled();
    expect(setCourseProjectAction).not.toHaveBeenCalled();
  });

  it("a CODING course with no project is left alone - never auto-generates (AC2: applied-only gate)", async () => {
    const tile = baseCourse({ weeks: 10, csvData: "Week,Topic\n1,Intro" });

    const result = await ensureCourseProject(tile, "gemini", "coding", []);

    expect(result.created).toBe(false);
    expect(hasProject(result.project)).toBe(false);
    expect(generateCourseProjectAction).not.toHaveBeenCalled();
    expect(setCourseProjectAction).not.toHaveBeenCalled();
  });

  it("no week count resolvable (no tile.weeks, no schedule) - left alone, never calls generation", async () => {
    const tile = baseCourse({ weeks: null });

    const result = await ensureCourseProject(tile, "gemini", "applied", []);

    expect(result.created).toBe(false);
    expect(generateCourseProjectAction).not.toHaveBeenCalled();
  });

  it("applied course, no project, weeks set on the tile - generates (blank definition) and persists", async () => {
    vi.mocked(generateCourseProjectAction).mockResolvedValue(generatedPlan);
    vi.mocked(setCourseProjectAction).mockResolvedValue({ ok: true });
    const tile = baseCourse({ id: "course-9", weeks: 2, csvData: "Week,Topic\n1,Intro\n2,Planning" });

    const result = await ensureCourseProject(tile, "gemini", "applied", []);

    expect(generateCourseProjectAction).toHaveBeenCalledTimes(1);
    const callArgs = vi.mocked(generateCourseProjectAction).mock.calls[0];
    // Blank definition (AC2): the "propose one" mode, same as autoDefine.
    expect(callArgs[0]).toBe("");
    expect(callArgs[2]).toBe(2);
    expect(callArgs[4]).toBe("gemini");
    expect(callArgs[5]).toBe("applied");

    expect(setCourseProjectAction).toHaveBeenCalledTimes(1);
    expect(vi.mocked(setCourseProjectAction).mock.calls[0][0]).toBe("course-9");

    expect(result.created).toBe(true);
    expect(result.project.mode).toBe("course-long");
    expect(result.project.name).toBe("Community Garden Launch Plan");
    // AC4: the stored definition is never left blank - a blank definition
    // reads as "no project" to hasProject(), which would defeat this same
    // function's own idempotency check on the very next call.
    expect(result.project.definition).toBe("Community Garden Launch Plan");
    expect(hasProject(result.project)).toBe(true);
    expect(result.project.milestones).toHaveLength(2);
  });

  it("prefers a bound schedule's weekly topics over the tile's own csvData when both are present", async () => {
    vi.mocked(generateCourseProjectAction).mockResolvedValue(generatedPlan);
    vi.mocked(setCourseProjectAction).mockResolvedValue({ ok: true });
    const tile = baseCourse({ weeks: null, csvData: "Week,Topic\n1,Stale tile data" });
    const schedule: ScheduleWeekPlan[] = [
      { week: 1, topic: "Fresh schedule topic", summary: "", assignmentTitle: null, assignmentSlug: null, testName: null },
      { week: 2, topic: "Second week", summary: "", assignmentTitle: null, assignmentSlug: null, testName: null },
    ];

    await ensureCourseProject(tile, "gemini", "applied", schedule);

    const callArgs = vi.mocked(generateCourseProjectAction).mock.calls[0];
    // weeks derived from schedule.length when tile.weeks is unset.
    expect(callArgs[2]).toBe(2);
    expect(callArgs[3]).toContain("Fresh schedule topic");
    expect(callArgs[3]).not.toContain("Stale tile data");
  });

  it("a generation failure degrades to the unchanged existing project, not a throw", async () => {
    vi.mocked(generateCourseProjectAction).mockResolvedValue({ error: "LLM unavailable" });
    const tile = baseCourse({ weeks: 4 });

    const result = await ensureCourseProject(tile, "gemini", "applied", []);

    expect(result).toEqual({ project: tile.courseProject, created: false });
    expect(setCourseProjectAction).not.toHaveBeenCalled();
  });

  it("a save failure degrades to the unchanged existing project, not a throw, and is never reported as created", async () => {
    vi.mocked(generateCourseProjectAction).mockResolvedValue(generatedPlan);
    vi.mocked(setCourseProjectAction).mockResolvedValue({ error: "Database unavailable" });
    const tile = baseCourse({ weeks: 4 });

    const result = await ensureCourseProject(tile, "gemini", "applied", []);

    expect(result).toEqual({ project: tile.courseProject, created: false });
  });

  it("idempotent across two sequential calls: the second call (tile now carrying the persisted project) generates nothing new", async () => {
    vi.mocked(generateCourseProjectAction).mockResolvedValue(generatedPlan);
    vi.mocked(setCourseProjectAction).mockResolvedValue({ ok: true });
    const tile = baseCourse({ id: "course-9", weeks: 2 });

    const first = await ensureCourseProject(tile, "gemini", "applied", []);
    expect(first.created).toBe(true);
    expect(generateCourseProjectAction).toHaveBeenCalledTimes(1);

    // Simulate a second run (or a second step in the same run) reloading the
    // tile after the first call's setCourseProjectAction persisted it - the
    // same "fresh load per step" pattern every real caller uses.
    const reloadedTile = { ...tile, courseProject: first.project };
    const second = await ensureCourseProject(reloadedTile, "gemini", "applied", []);

    expect(second).toEqual({ project: first.project, created: false });
    // Still exactly once total - the second call never re-generates or
    // replaces the first project (AC2/AC4: no double-generation).
    expect(generateCourseProjectAction).toHaveBeenCalledTimes(1);
    expect(setCourseProjectAction).toHaveBeenCalledTimes(1);
  });
});
