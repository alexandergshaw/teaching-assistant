// docs/weekly-announcement-scheduling-acceptance-criteria.md AC8 item 31 -
// the SOURCE-READING GUARD TEST covering item 30 (registry files are
// client-bundled; this step must not import, even transitively,
// @/lib/supabase/server, @/app/actions/shared, or next/headers). Modeled on
// src/lib/workflows/course-schedule-docx.test.ts:40-48, whose own comment
// records that only `next build` caught the original incident this pattern
// guards against - tsc/eslint/vitest all stay green on a violation.
//
// The rest of this file covers the step's own input validation and its
// thin orchestration over scheduleWeeklyAnnouncementsAction (mocked here);
// the actual scheduling/idempotency logic is covered by
// src/lib/announcement-schedule.test.ts (pure) and
// src/app/actions/canvas-inbox.weekly-announcement-schedule.test.ts (the
// server action).

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Course } from "@/lib/supabase/courses";
import type { StepRunHelpers } from "@/lib/workflows/registry-helpers";

vi.mock("@/app/actions", () => ({
  listCourseHubAction: vi.fn(),
  scheduleWeeklyAnnouncementsAction: vi.fn(),
  planWeeklyAnnouncementsAction: vi.fn(),
  draftModuleAnnouncementsAction: vi.fn(),
}));

import {
  listCourseHubAction,
  scheduleWeeklyAnnouncementsAction,
  planWeeklyAnnouncementsAction,
  draftModuleAnnouncementsAction,
} from "@/app/actions";
import { weeklyAnnouncementScheduleSteps } from "./steps.weekly-announcement-schedule";

const step = weeklyAnnouncementScheduleSteps.find(
  (s) => s.type === "schedule-weekly-announcements-for-term"
)!;

describe("steps.weekly-announcement-schedule.ts stays client-bundle-safe", () => {
  it("never imports @/lib/supabase/server, @/app/actions/shared, or next/headers", () => {
    const source = readFileSync(
      fileURLToPath(new URL("./steps.weekly-announcement-schedule.ts", import.meta.url)),
      "utf8"
    );
    expect(source).not.toMatch(/from ["']@\/lib\/supabase\/server["']/);
    expect(source).not.toMatch(/from ["']@\/app\/actions\/shared["']/);
    // Matches an actual import specifier (quoted), not this file's own
    // explanatory comments, which mention next/headers in prose while
    // explaining exactly why this guard exists.
    expect(source).not.toMatch(/from ["']next\/headers["']/);
    expect(source).toContain('from "@/app/actions"');
  });
});

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
    institution: "MCC",
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
    weeks: 15,
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
    courseProject: { milestones: [] } as unknown as Course["courseProject"],
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
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

const noop = () => {};

describe("schedule-weekly-announcements-for-term", () => {
  beforeEach(() => {
    vi.mocked(listCourseHubAction).mockReset();
    vi.mocked(scheduleWeeklyAnnouncementsAction).mockReset();
    // The default draftFrom is now module content (blank), so every test
    // below that reaches step.run without setting draftFrom exercises that
    // path too. A plan of zero weeks needing text is the sensible default:
    // it keeps these pre-existing tests exercising exactly what they always
    // asserted, without pulling drafting into their assertions.
    vi.mocked(planWeeklyAnnouncementsAction).mockReset().mockResolvedValue({ weeks: [] } as never);
    vi.mocked(draftModuleAnnouncementsAction).mockReset().mockResolvedValue({ drafts: [] } as never);
  });

  it("throws when no course tile is chosen", async () => {
    await expect(
      step.run({ weekday: "1", title: "Week {week}", message: "Hi" }, testHelpers(), noop)
    ).rejects.toThrow(/choose a course tile/i);
    expect(listCourseHubAction).not.toHaveBeenCalled();
  });

  it("throws when the weekday is missing or not one of the seven options", async () => {
    await expect(
      step.run({ hubCourse: "course-1", title: "Week {week}", message: "Hi" }, testHelpers(), noop)
    ).rejects.toThrow(/weekday/i);
    await expect(
      step.run(
        { hubCourse: "course-1", weekday: "7", title: "Week {week}", message: "Hi" },
        testHelpers(),
        noop
      )
    ).rejects.toThrow(/weekday/i);
  });

  it("throws when title or message is blank", async () => {
    // This now describes TEMPLATE mode only - module mode (the new default,
    // draftFrom blank) requires neither (AC4 item 17).
    await expect(
      step.run({ hubCourse: "course-1", weekday: "1", message: "Hi", draftFrom: "template" }, testHelpers(), noop)
    ).rejects.toThrow(/title and message/i);
    await expect(
      step.run(
        { hubCourse: "course-1", weekday: "1", title: "Week {week}", draftFrom: "template" },
        testHelpers(),
        noop
      )
    ).rejects.toThrow(/title and message/i);
  });

  it("throws when the chosen course tile cannot be found", async () => {
    vi.mocked(listCourseHubAction).mockResolvedValue({ courses: [] });
    await expect(
      step.run(
        { hubCourse: "course-1", weekday: "1", title: "Week {week}", message: "Hi" },
        testHelpers(),
        noop
      )
    ).rejects.toThrow(/choose a course tile/i);
  });

  it("throws a clear error when listCourseHubAction itself errors", async () => {
    vi.mocked(listCourseHubAction).mockResolvedValue({ error: "hub unavailable" });
    await expect(
      step.run(
        { hubCourse: "course-1", weekday: "1", title: "Week {week}", message: "Hi" },
        testHelpers(),
        noop
      )
    ).rejects.toThrow("hub unavailable");
  });

  it("throws when the tile has no LMS course linked", async () => {
    vi.mocked(listCourseHubAction).mockResolvedValue({
      courses: [baseCourse({ canvasUrl: null })],
    });
    await expect(
      step.run(
        { hubCourse: "course-1", weekday: "1", title: "Week {week}", message: "Hi" },
        testHelpers(),
        noop
      )
    ).rejects.toThrow(/lms course/i);
  });

  it("DEFECT 1 FIX: skips cleanly with ZERO database writes on a non-Canvas tile, even though its canvasUrl field is non-blank (docs/REGRESSION.md #218, #229 - a Blackboard tile's canvasUrl holds the Blackboard URL, not a Canvas one)", async () => {
    vi.mocked(listCourseHubAction).mockResolvedValue({
      courses: [
        baseCourse({
          lms: "blackboard",
          canvasUrl: "https://blackboard.example.edu/ultra/courses/_33114_1/outline",
        }),
      ],
    });

    const result = await step.run(
      { hubCourse: "course-1", weekday: "1", title: "Week {week}", message: "Hi" },
      testHelpers(),
      noop
    );

    // scheduleWeeklyAnnouncementsAction is the ONLY path to a database write
    // (it owns every insert/update against weekly_announcement_schedule) -
    // asserting it was never called IS the proof of zero database writes.
    expect(scheduleWeeklyAnnouncementsAction).not.toHaveBeenCalled();
    // The step now reaches two MORE actions on this path, and the guard has to
    // sit above all three. planWeeklyAnnouncementsAction reads the mapping
    // table and paginates Canvas; draftModuleAnnouncementsAction spends a
    // term's worth of LLM calls. Asserting only the write action would stay
    // green if the guard were ever moved below them, while a Blackboard course
    // quietly burned both.
    expect(planWeeklyAnnouncementsAction).not.toHaveBeenCalled();
    expect(draftModuleAnnouncementsAction).not.toHaveBeenCalled();
    expect(result.outputs.scheduledCount).toBe(0);
    expect(result.summary.kind).toBe("text");
    if (result.summary.kind === "text") {
      expect(result.summary.text.toLowerCase()).toContain("blackboard");
    }
  });

  it("does not skip a tile with no recorded LMS at all (blank lms treated as Canvas, matching every tile that predates this guard)", async () => {
    vi.mocked(listCourseHubAction).mockResolvedValue({ courses: [baseCourse({ lms: null })] });
    vi.mocked(scheduleWeeklyAnnouncementsAction).mockResolvedValue({
      result: {
        weeks: [],
        createdCount: 0,
        resolvedCreatedCount: 0,
        rescheduledCount: 0,
        alreadyPresentCount: 0,
        skippedPastCount: 0,
        failedCount: 0,
        stoppedEarly: false,
        report: "",
        lines: [],
      },
    });

    await step.run(
      { hubCourse: "course-1", weekday: "1", title: "Week {week}", message: "Hi" },
      testHelpers(),
      noop
    );

    expect(scheduleWeeklyAnnouncementsAction).toHaveBeenCalled();
  });

  it("throws when the tile has no start date", async () => {
    vi.mocked(listCourseHubAction).mockResolvedValue({
      courses: [baseCourse({ startDate: null })],
    });
    await expect(
      step.run(
        { hubCourse: "course-1", weekday: "1", title: "Week {week}", message: "Hi" },
        testHelpers(),
        noop
      )
    ).rejects.toThrow(/start date/i);
  });

  it("throws when the tile has no weeks set", async () => {
    vi.mocked(listCourseHubAction).mockResolvedValue({
      courses: [baseCourse({ weeks: null })],
    });
    await expect(
      step.run(
        { hubCourse: "course-1", weekday: "1", title: "Week {week}", message: "Hi" },
        testHelpers(),
        noop
      )
    ).rejects.toThrow(/number of weeks/i);
  });

  it("calls scheduleWeeklyAnnouncementsAction with the tile's resolved fields and renders its report", async () => {
    vi.mocked(listCourseHubAction).mockResolvedValue({ courses: [baseCourse()] });
    vi.mocked(scheduleWeeklyAnnouncementsAction).mockResolvedValue({
      result: {
        weeks: [{ week: 1, outcome: "created", detail: "Scheduled for Jan 5." }],
        createdCount: 1,
        resolvedCreatedCount: 0,
        rescheduledCount: 0,
        alreadyPresentCount: 0,
        skippedPastCount: 0,
        failedCount: 0,
        stoppedEarly: false,
        report: "Week 1: created - Scheduled for Jan 5.\nNote: ...",
        lines: ["Week 1: created - Scheduled for Jan 5.", "Note: ..."],
      },
    });

    const result = await step.run(
      {
        hubCourse: "course-1",
        weekday: "4",
        postTime: "09:30",
        title: "Week {week}",
        message: "Hello week {week}",
      },
      testHelpers(),
      noop
    );

    // draftFrom is unset - the new default is module content, not template
    // mode - so the step also plans, appends the (unused) testOverrides slot,
    // and hands over a drafts option. This beforeEach's default plan has zero
    // weeks needing text, so that option is an EMPTY array rather than absent:
    // the action reads the option's presence as "module mode, resolve per
    // week" and its absence as "template mode, both templates required".
    // Asserting `undefined` here is what let a re-run against a fully
    // scheduled term reject itself whenever the templates were left blank.
    expect(scheduleWeeklyAnnouncementsAction).toHaveBeenCalledWith(
      "course-1",
      "https://canvas.example.edu/courses/123",
      "MCC",
      "2026-01-05",
      15,
      4,
      "09:30",
      "Week {week}",
      "Hello week {week}",
      undefined,
      { drafts: [] }
    );
    expect(result.outputs.scheduledCount).toBe(1);
    expect(result.outputs.report).toContain("Week 1: created");
    expect(result.summary.kind).toBe("list");
  });

  it("throws the action's error message when it fails", async () => {
    vi.mocked(listCourseHubAction).mockResolvedValue({ courses: [baseCourse()] });
    vi.mocked(scheduleWeeklyAnnouncementsAction).mockResolvedValue({ error: "Canvas rejected the request." });

    await expect(
      step.run(
        { hubCourse: "course-1", weekday: "1", title: "Week {week}", message: "Hi" },
        testHelpers(),
        noop
      )
    ).rejects.toThrow("Canvas rejected the request.");
  });
});
