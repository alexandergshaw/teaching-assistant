import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/app/actions", () => ({
  syncCourseCalendarAction: vi.fn(),
}));

import { syncCourseCalendarAction } from "@/app/actions";
import { getStepDefinition } from "./registry";
import type { StepRunHelpers } from "./registry-helpers";

const step = getStepDefinition("sync-course-calendar")!;

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

describe("sync-course-calendar step", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("blank hubCourse throws 'Choose a course.' without calling the action", async () => {
    await expect(step.run({ hubCourse: "" }, testHelpers(), () => {})).rejects.toThrow(
      "Choose a course."
    );
    expect(syncCourseCalendarAction).not.toHaveBeenCalled();
  });

  it("whitespace-only hubCourse also throws without calling the action", async () => {
    await expect(step.run({ hubCourse: "   " }, testHelpers(), () => {})).rejects.toThrow(
      "Choose a course."
    );
    expect(syncCourseCalendarAction).not.toHaveBeenCalled();
  });

  it("not-connected: the action's error message is surfaced as a thrown error", async () => {
    vi.mocked(syncCourseCalendarAction).mockResolvedValue({
      error: "Google Calendar isn't connected. Connect it under Account > Integrations.",
    });
    await expect(step.run({ hubCourse: "course-1" }, testHelpers(), () => {})).rejects.toThrow(
      "Google Calendar isn't connected. Connect it under Account > Integrations."
    );
  });

  it("calendar-not-found: the action's error message is surfaced as a thrown error", async () => {
    vi.mocked(syncCourseCalendarAction).mockResolvedValue({
      error: 'Could not find a Google Calendar named "Adjuncting". Calendars you can write to: Personal.',
    });
    await expect(step.run({ hubCourse: "course-1" }, testHelpers(), () => {})).rejects.toThrow(
      'Could not find a Google Calendar named "Adjuncting"'
    );
  });

  it("passes the trimmed courseId, calendarName, and dryRun through to the action", async () => {
    vi.mocked(syncCourseCalendarAction).mockResolvedValue({
      created: 0,
      updated: 0,
      deleted: 0,
      skippedUntagged: 0,
      calendarName: "Adjuncting",
      notes: [],
    });
    await step.run(
      { hubCourse: "  course-1  ", calendarName: "  My Calendar  ", dryRun: "1" },
      testHelpers(),
      () => {}
    );
    expect(syncCourseCalendarAction).toHaveBeenCalledWith("course-1", {
      calendarName: "My Calendar",
      dryRun: true,
    });
  });

  it("dryRun defaults to false and calendarName to undefined when not given", async () => {
    vi.mocked(syncCourseCalendarAction).mockResolvedValue({
      created: 0,
      updated: 0,
      deleted: 0,
      skippedUntagged: 0,
      calendarName: "Adjuncting",
      notes: [],
    });
    await step.run({ hubCourse: "course-1" }, testHelpers(), () => {});
    expect(syncCourseCalendarAction).toHaveBeenCalledWith("course-1", {
      calendarName: undefined,
      dryRun: false,
    });
  });

  it("a dry run writes nothing: the step relays the previewed counts and the dry-run note without erroring", async () => {
    vi.mocked(syncCourseCalendarAction).mockResolvedValue({
      created: 3,
      updated: 1,
      deleted: 0,
      skippedUntagged: 0,
      calendarName: "Adjuncting",
      notes: ["Dry run - no events were created, updated, or deleted."],
    });
    const result = await step.run({ hubCourse: "course-1", dryRun: "1" }, testHelpers(), () => {});
    expect(result.outputs).toEqual({ created: 3, updated: 1, deleted: 0 });
    expect(result.summary.kind).toBe("list");
    if (result.summary.kind === "list") {
      expect(result.summary.label).toContain("3 created, 1 updated, 0 deleted");
      expect(result.summary.items).toContain(
        "Dry run - no events were created, updated, or deleted."
      );
    }
  });

  it("a per-event failure still returns real counts and surfaces the failure notes", async () => {
    vi.mocked(syncCourseCalendarAction).mockResolvedValue({
      created: 2,
      updated: 0,
      deleted: 0,
      skippedUntagged: 0,
      calendarName: "Adjuncting",
      notes: ['create "CS 101 - Week 2 assignment due" (due-w2) failed: Google event creation failed (HTTP 500)'],
    });
    const result = await step.run({ hubCourse: "course-1" }, testHelpers(), () => {});
    expect(result.outputs).toEqual({ created: 2, updated: 0, deleted: 0 });
    expect(result.summary.kind).toBe("list");
    if (result.summary.kind === "list") {
      expect(result.summary.items.some((i) => i.includes("failed"))).toBe(true);
    }
  });

  it("mentions untagged events left alone only when there are any", async () => {
    vi.mocked(syncCourseCalendarAction).mockResolvedValue({
      created: 0,
      updated: 0,
      deleted: 0,
      skippedUntagged: 2,
      calendarName: "Adjuncting",
      notes: [],
    });
    const withUntagged = await step.run({ hubCourse: "course-1" }, testHelpers(), () => {});
    if (withUntagged.summary.kind === "list") {
      expect(withUntagged.summary.items.some((i) => i.includes("2 untagged"))).toBe(true);
    }

    vi.mocked(syncCourseCalendarAction).mockResolvedValue({
      created: 0,
      updated: 0,
      deleted: 0,
      skippedUntagged: 0,
      calendarName: "Adjuncting",
      notes: [],
    });
    const withoutUntagged = await step.run({ hubCourse: "course-1" }, testHelpers(), () => {});
    if (withoutUntagged.summary.kind === "list") {
      expect(withoutUntagged.summary.items.some((i) => i.includes("untagged"))).toBe(false);
    }
  });

  it("the step is registered as headless-safe: sets no requireInput/requireConfirmation", async () => {
    vi.mocked(syncCourseCalendarAction).mockResolvedValue({
      created: 0,
      updated: 0,
      deleted: 0,
      skippedUntagged: 0,
      calendarName: "Adjuncting",
      notes: [],
    });
    const result = await step.run({ hubCourse: "course-1" }, testHelpers(), () => {});
    expect(result.requireInput).toBeUndefined();
    expect(result.requireConfirmation).toBeUndefined();
  });
});
