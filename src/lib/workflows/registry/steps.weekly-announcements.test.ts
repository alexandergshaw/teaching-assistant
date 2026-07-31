// Group Q3: weekly announcements composed from each week's ACTUAL module
// materials, not the schedule topic alone. gatherWeekMaterials/weekStartDate
// are exercised directly (pure logic); the full step.run() is exercised
// through mocked actions for the grounding-or-skip, opt-in posting, and
// past-date-never-posts behaviors.

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ScheduleWeekPlan } from "@/app/actions";
import type { StepRunHelpers } from "@/lib/workflows/registry-helpers";
import type { GeneratedCourseFile } from "@/lib/workflows/types";
import { emptyCourseProject } from "@/lib/course-project";
import type { Course } from "@/lib/supabase/courses";

vi.mock("@/app/actions", () => ({
  listCourseHubAction: vi.fn(),
  draftAnnouncementAction: vi.fn(),
  createScheduledAnnouncementAction: vi.fn(),
}));

import { listCourseHubAction, draftAnnouncementAction, createScheduledAnnouncementAction } from "@/app/actions";
import { weekStartDate, gatherWeekMaterials, weeklyAnnouncementSteps } from "./steps.weekly-announcements";

const step = weeklyAnnouncementSteps.find((s) => s.type === "generate-weekly-announcements")!;

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
    ...overrides,
  };
}

function baseCourse(overrides: Partial<Course> = {}): Course {
  return {
    id: "course-1",
    name: "CS 101",
    courseCode: "CS101",
    term: null,
    canvasUrl: "https://canvas.example.edu/courses/123",
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
    startDate: "2026-01-05",
    description: null,
    weeks: 3,
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
  } as Course;
}

function objectivesFile(week: number, text: string): GeneratedCourseFile {
  return {
    name: `Week ${week} Objectives.docx`,
    blob: new Blob(["x"]),
    mimeType: "application/octet-stream",
    weekNumber: week,
    sortOrder: 0.5,
    role: "objectives",
    pageText: text,
  };
}

describe("weekStartDate", () => {
  it("is the tile's start date for week 1, at 8am local", () => {
    const start = new Date("2026-01-05T00:00:00");
    const d = weekStartDate(start, 1);
    expect(d.getDate()).toBe(5);
    expect(d.getHours()).toBe(8);
  });

  it("advances by 7 days per additional week", () => {
    const start = new Date("2026-01-05T00:00:00");
    const week1 = weekStartDate(start, 1);
    const week3 = weekStartDate(start, 3);
    const diffDays = (week3.getTime() - week1.getTime()) / 86_400_000;
    expect(diffDays).toBe(14);
  });
});

describe("gatherWeekMaterials", () => {
  it("returns '' when no file matches the week - the caller must skip, never fall back to the bare topic", () => {
    expect(gatherWeekMaterials([], 1)).toBe("");
    expect(gatherWeekMaterials([objectivesFile(2, "Week 2 stuff")], 1)).toBe("");
  });

  it("combines objectives, slides (by name only), instructions, and opener for the matching week", () => {
    const files: GeneratedCourseFile[] = [
      objectivesFile(1, "Learn loops"),
      { name: "Week 1 Slides.pptx", blob: new Blob(["x"]), mimeType: "application/octet-stream", weekNumber: 1, sortOrder: 1, role: "slides" },
      { name: "Week 1 Instructions.docx", blob: new Blob(["x"]), mimeType: "application/octet-stream", weekNumber: 1, sortOrder: 2, role: "instructions", pageText: "Submit a loop program." },
      { name: "Week 1 Opener.docx", blob: new Blob(["x"]), mimeType: "application/octet-stream", weekNumber: 1, sortOrder: 3, role: "opener", pageText: "Warm up with a puzzle." },
    ];
    const materials = gatherWeekMaterials(files, 1);
    expect(materials).toContain("Learn loops");
    expect(materials).toContain("Week 1 Slides.pptx");
    expect(materials).toContain("Submit a loop program.");
    expect(materials).toContain("Warm up with a puzzle.");
  });
});

describe("generate-weekly-announcements step", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(listCourseHubAction).mockResolvedValue({ courses: [baseCourse()] });
    vi.mocked(draftAnnouncementAction).mockResolvedValue({ title: "Week update", message: "Here is what's happening this week." });
  });

  function schedule(): ScheduleWeekPlan[] {
    return [
      { week: 1, topic: "Intro", summary: "", assignmentTitle: null, assignmentSlug: null, testName: null },
      { week: 2, topic: "Loops", summary: "", assignmentTitle: null, assignmentSlug: null, testName: null },
    ];
  }

  it("skips a week with no generated module materials, rather than composing from the bare topic", async () => {
    const files: GeneratedCourseFile[] = [objectivesFile(1, "Week 1 objectives text")];
    const result = await step.run({ schedule: schedule(), files }, testHelpers(), () => {});

    expect(draftAnnouncementAction).toHaveBeenCalledTimes(1); // only week 1 has materials
    expect(result.outputs.announcementCount).toBe(1);
    const report = result.outputs.report as string;
    expect(report).toContain("Week 2: skipped - no generated module materials");
  });

  it("grounds the instruction in real materials, not just the topic line", async () => {
    const files: GeneratedCourseFile[] = [objectivesFile(1, "Students will practice recursion this week.")];
    await step.run({ schedule: [schedule()[0]], files }, testHelpers(), () => {});

    const [instruction] = vi.mocked(draftAnnouncementAction).mock.calls[0];
    expect(instruction).toContain("Students will practice recursion this week.");
    expect(instruction).toContain("do not just restate the topic");
  });

  it("produces a supplement file per week, filed under that week's own weekNumber (not Course-Wide)", async () => {
    const files: GeneratedCourseFile[] = [objectivesFile(1, "Materials for week 1")];
    const result = await step.run({ schedule: [schedule()[0]], files }, testHelpers(), () => {});
    const outFiles = result.outputs.files as GeneratedCourseFile[];
    const announcement = outFiles.find((f) => f.name.includes("Announcement"));
    expect(announcement).toBeDefined();
    expect(announcement!.role).toBe("supplement");
    expect(announcement!.weekNumber).toBe(1);
  });

  it("does not post to the LMS when postToLms is off (default), and says so", async () => {
    const files: GeneratedCourseFile[] = [objectivesFile(1, "Materials for week 1")];
    const result = await step.run({ schedule: [schedule()[0]], files, hubCourse: "course-1" }, testHelpers(), () => {});
    expect(createScheduledAnnouncementAction).not.toHaveBeenCalled();
    const report = result.outputs.report as string;
    expect(report).toContain("posting is turned off");
  });

  it("never posts an announcement with a past release date, even when postToLms is on", async () => {
    // Course started a year ago - week 1's release date is far in the past.
    vi.mocked(listCourseHubAction).mockResolvedValue({
      courses: [baseCourse({ startDate: "2020-01-01" })],
    });
    const files: GeneratedCourseFile[] = [objectivesFile(1, "Materials for week 1")];
    const result = await step.run(
      { schedule: [schedule()[0]], files, hubCourse: "course-1", postToLms: "1" },
      testHelpers(),
      () => {}
    );
    expect(createScheduledAnnouncementAction).not.toHaveBeenCalled();
    const report = result.outputs.report as string;
    expect(report).toContain("is in the past");
  });

  it("schedules a future week's announcement when postToLms is on", async () => {
    const farFuture = new Date(Date.now() + 1000 * 86_400_000).toISOString().slice(0, 10);
    vi.mocked(listCourseHubAction).mockResolvedValue({
      courses: [baseCourse({ startDate: farFuture })],
    });
    vi.mocked(createScheduledAnnouncementAction).mockResolvedValue({ id: 1 });
    const files: GeneratedCourseFile[] = [objectivesFile(1, "Materials for week 1")];
    const result = await step.run(
      { schedule: [schedule()[0]], files, hubCourse: "course-1", postToLms: "1" },
      testHelpers(),
      () => {}
    );
    expect(createScheduledAnnouncementAction).toHaveBeenCalledTimes(1);
    const report = result.outputs.report as string;
    expect(report).toContain("scheduled for");
  });

  // RCA19 (RCA round 4): an invalid start date used to throw, which -
  // exactly like steps.course-guides.ts's bare throws - cascades to every
  // dependent step bound to this step's `files` output (server-runner.ts's
  // failedSteps). Degrades instead: still composes every week's
  // announcement (grounded materials don't depend on the date at all), only
  // LMS scheduling is skipped, and the summary/report say why.
  it("RCA19: an invalid start date degrades instead of throwing - announcements still generate, only LMS scheduling is skipped", async () => {
    const files: GeneratedCourseFile[] = [objectivesFile(1, "Materials for week 1")];
    const result = await step.run(
      { schedule: [schedule()[0]], files, hubCourse: "course-1", startDate: "not-a-date", postToLms: "1" },
      testHelpers(),
      () => {}
    );

    // Did not throw, and the incoming/generated files still come back.
    expect(createScheduledAnnouncementAction).not.toHaveBeenCalled();
    expect(result.outputs.announcementCount).toBe(1);
    const outFiles = result.outputs.files as GeneratedCourseFile[];
    expect(outFiles.some((f) => f.name.includes("Announcement"))).toBe(true);

    const report = result.outputs.report as string;
    expect(report).toContain("not a valid date");
    expect(report).toContain("not posted");
  });

  it("continues to the next week when one week's draft fails", async () => {
    vi.mocked(draftAnnouncementAction)
      .mockResolvedValueOnce({ error: "model unavailable" })
      .mockResolvedValueOnce({ title: "Week 2", message: "body" });
    const files: GeneratedCourseFile[] = [objectivesFile(1, "m1"), objectivesFile(2, "m2")];
    const result = await step.run({ schedule: schedule(), files }, testHelpers(), () => {});
    expect(result.outputs.announcementCount).toBe(1);
    const report = result.outputs.report as string;
    expect(report).toContain("Week 1: error");
  });

  it("returns the incoming files unchanged when the schedule is empty", async () => {
    const incoming: GeneratedCourseFile[] = [objectivesFile(1, "m1")];
    const result = await step.run({ schedule: [], files: incoming }, testHelpers(), () => {});
    expect(result.outputs.files).toBe(incoming);
    expect(result.outputs.announcementCount).toBe(0);
  });
});
