import { describe, it, expect, vi, beforeEach } from "vitest";
import { emptyCourseProject } from "@/lib/course-project";

vi.mock("@/lib/supabase/auth", () => ({
  requireOwner: vi.fn(),
}));

vi.mock("@/lib/supabase/courses", () => ({
  listCourses: vi.fn(),
}));

vi.mock("@/lib/google-credentials", () => ({
  getValidAccessToken: vi.fn(),
}));

vi.mock("@/lib/google-calendar", () => ({
  resolveCalendarTarget: vi.fn(),
  createCalendarEvent: vi.fn(),
  updateCalendarEvent: vi.fn(),
  deleteCalendarEvent: vi.fn(),
  listEventsByPrivateProps: vi.fn(),
}));

import { requireOwner } from "@/lib/supabase/auth";
import { listCourses } from "@/lib/supabase/courses";
import { getValidAccessToken } from "@/lib/google-credentials";
import {
  resolveCalendarTarget,
  createCalendarEvent,
  updateCalendarEvent,
  deleteCalendarEvent,
  listEventsByPrivateProps,
} from "@/lib/google-calendar";
import { getSchedulingConfig } from "@/lib/scheduling";
import { syncCourseCalendarAction } from "./course-calendar";
import type { Course } from "@/lib/supabase/courses";

const EXPECTED_TIME_ZONE = getSchedulingConfig().timeZone;

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

// One planned event (due-w1) - startDate is a Monday, one week, a simple
// recurring due rule. Enough to exercise create/update/delete without the
// combinatorics of meetings/tests.
const ONE_WEEK_COURSE = baseCourse({ startDate: "2026-01-05", weeks: 1, assignmentDueRule: "sun|23:59" });
// Two planned events (due-w1, due-w2) for scenarios that need both an update
// and a create in the same run.
const TWO_WEEK_COURSE = baseCourse({ startDate: "2026-01-05", weeks: 2, assignmentDueRule: "sun|23:59" });

function mockHappyPathUpTo(course: Course, existingRaw: Array<{ id: string; summary: string; startISO: string | null; privateProps: Record<string, string> }> = []) {
  vi.mocked(requireOwner).mockResolvedValue({ id: "user-1", email: "user@example.com" });
  vi.mocked(listCourses).mockResolvedValue([course]);
  vi.mocked(resolveCalendarTarget).mockResolvedValue({
    ok: true,
    calendarId: "cal-adjuncting",
    calendarName: "Adjuncting",
  });
  vi.mocked(getValidAccessToken).mockResolvedValue("token-abc");
  vi.mocked(listEventsByPrivateProps).mockResolvedValue(existingRaw);
}

describe("syncCourseCalendarAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Guards / error paths", () => {
    it("rejects a blank courseId without calling listCourses", async () => {
      vi.mocked(requireOwner).mockResolvedValue({ id: "user-1", email: "user@example.com" });
      const result = await syncCourseCalendarAction("");
      expect(result).toEqual({ error: "Choose a course." });
      expect(listCourses).not.toHaveBeenCalled();
    });

    it("rejects a whitespace-only courseId", async () => {
      vi.mocked(requireOwner).mockResolvedValue({ id: "user-1", email: "user@example.com" });
      const result = await syncCourseCalendarAction("   ");
      expect(result).toEqual({ error: "Choose a course." });
    });

    it("returns 'Course not found.' when the id is not among the owner's tiles", async () => {
      vi.mocked(requireOwner).mockResolvedValue({ id: "user-1", email: "user@example.com" });
      vi.mocked(listCourses).mockResolvedValue([baseCourse({ id: "different-course" })]);
      const result = await syncCourseCalendarAction("course-1");
      expect(result).toEqual({ error: "Course not found." });
    });

    it("surfaces the message when requireOwner rejects", async () => {
      vi.mocked(requireOwner).mockRejectedValue(new Error("Not authorized"));
      const result = await syncCourseCalendarAction("course-1");
      expect("error" in result).toBe(true);
      if ("error" in result) expect(result.error).toContain("Not authorized");
    });
  });

  describe("Calendar resolution", () => {
    it("surfaces the not-connected message from resolveCalendarTarget", async () => {
      vi.mocked(requireOwner).mockResolvedValue({ id: "user-1", email: "user@example.com" });
      vi.mocked(listCourses).mockResolvedValue([ONE_WEEK_COURSE]);
      vi.mocked(resolveCalendarTarget).mockResolvedValue({
        ok: false,
        reason: "not-connected",
        message: "Google Calendar isn't connected. Connect it under Account > Integrations.",
      });
      const result = await syncCourseCalendarAction("course-1");
      expect(result).toEqual({
        error: "Google Calendar isn't connected. Connect it under Account > Integrations.",
      });
      expect(listEventsByPrivateProps).not.toHaveBeenCalled();
    });

    it("surfaces the calendar-not-found message from resolveCalendarTarget", async () => {
      vi.mocked(requireOwner).mockResolvedValue({ id: "user-1", email: "user@example.com" });
      vi.mocked(listCourses).mockResolvedValue([ONE_WEEK_COURSE]);
      vi.mocked(resolveCalendarTarget).mockResolvedValue({
        ok: false,
        reason: "calendar-not-found",
        message: 'Could not find a Google Calendar named "Adjuncting". Calendars you can write to: Personal.',
      });
      const result = await syncCourseCalendarAction("course-1");
      expect(result).toEqual({
        error: 'Could not find a Google Calendar named "Adjuncting". Calendars you can write to: Personal.',
      });
    });

    it("defaults the calendar name to Adjuncting when none is given", async () => {
      mockHappyPathUpTo(ONE_WEEK_COURSE);
      await syncCourseCalendarAction("course-1");
      expect(resolveCalendarTarget).toHaveBeenCalledWith("user-1", "Adjuncting");
    });

    it("uses a trimmed custom calendar name when given", async () => {
      mockHappyPathUpTo(ONE_WEEK_COURSE);
      await syncCourseCalendarAction("course-1", { calendarName: "  My Teaching Calendar  " });
      expect(resolveCalendarTarget).toHaveBeenCalledWith("user-1", "My Teaching Calendar");
    });

    it("returns an error when the token disappears between resolveCalendarTarget and the fetch", async () => {
      vi.mocked(requireOwner).mockResolvedValue({ id: "user-1", email: "user@example.com" });
      vi.mocked(listCourses).mockResolvedValue([ONE_WEEK_COURSE]);
      vi.mocked(resolveCalendarTarget).mockResolvedValue({
        ok: true,
        calendarId: "cal-adjuncting",
        calendarName: "Adjuncting",
      });
      vi.mocked(getValidAccessToken).mockResolvedValue(null);
      const result = await syncCourseCalendarAction("course-1");
      expect("error" in result).toBe(true);
      expect(listEventsByPrivateProps).not.toHaveBeenCalled();
    });
  });

  describe("taCourseId scoping and the untagged-event guard", () => {
    it("queries listEventsByPrivateProps with taCourseId only", async () => {
      mockHappyPathUpTo(ONE_WEEK_COURSE);
      await syncCourseCalendarAction("course-1");
      expect(listEventsByPrivateProps).toHaveBeenCalledWith("token-abc", "cal-adjuncting", {
        taCourseId: "course-1",
      });
    });

    it("counts missing/unrecognised taKey events as skippedUntagged and never touches them", async () => {
      mockHappyPathUpTo(ONE_WEEK_COURSE, [
        { id: "untagged-missing", summary: "My own event", startISO: null, privateProps: { taCourseId: "course-1" } },
        { id: "untagged-unknown", summary: "Some other tag", startISO: null, privateProps: { taCourseId: "course-1", taKey: "not-a-real-key" } },
        { id: "recognized-due-w1", summary: "CS 101 - Week 1 assignment due", startISO: null, privateProps: { taCourseId: "course-1", taKey: "due-w1" } },
      ]);
      vi.mocked(updateCalendarEvent).mockResolvedValue({ htmlLink: null, meetLink: null });

      const result = await syncCourseCalendarAction("course-1");
      expect("error" in result).toBe(false);
      if ("error" in result) return;
      expect(result.skippedUntagged).toBe(2);

      const deletedIds = vi.mocked(deleteCalendarEvent).mock.calls.map((c) => c[2]);
      expect(deletedIds).not.toContain("untagged-missing");
      expect(deletedIds).not.toContain("untagged-unknown");
      const updatedIds = vi.mocked(updateCalendarEvent).mock.calls.map((c) => c[2]);
      expect(updatedIds).not.toContain("untagged-missing");
      expect(updatedIds).not.toContain("untagged-unknown");
    });
  });

  describe("dryRun", () => {
    it("defaults to false: a plain call actually writes", async () => {
      mockHappyPathUpTo(ONE_WEEK_COURSE);
      vi.mocked(createCalendarEvent).mockResolvedValue({ htmlLink: null, meetLink: null });
      await syncCourseCalendarAction("course-1");
      expect(createCalendarEvent).toHaveBeenCalledTimes(1);
    });

    it("writes nothing and reports the counts that WOULD change", async () => {
      mockHappyPathUpTo(TWO_WEEK_COURSE, [
        { id: "evt-due-w1", summary: "old", startISO: null, privateProps: { taCourseId: "course-1", taKey: "due-w1" } },
        { id: "evt-due-w5", summary: "stale", startISO: null, privateProps: { taCourseId: "course-1", taKey: "due-w5" } },
      ]);

      const result = await syncCourseCalendarAction("course-1", { dryRun: true });
      expect("error" in result).toBe(false);
      if ("error" in result) return;

      // due-w1 -> update, due-w2 -> create, due-w5 (no longer planned) -> delete.
      expect(result.created).toBe(1);
      expect(result.updated).toBe(1);
      expect(result.deleted).toBe(1);
      expect(result.notes.some((n) => n.toLowerCase().includes("dry run"))).toBe(true);

      expect(createCalendarEvent).not.toHaveBeenCalled();
      expect(updateCalendarEvent).not.toHaveBeenCalled();
      expect(deleteCalendarEvent).not.toHaveBeenCalled();
    });
  });

  describe("applying the diff", () => {
    it("creates with withMeet:false and the three private properties", async () => {
      mockHappyPathUpTo(ONE_WEEK_COURSE);
      vi.mocked(createCalendarEvent).mockResolvedValue({ htmlLink: "https://cal/x", meetLink: null });

      const result = await syncCourseCalendarAction("course-1");
      expect("error" in result).toBe(false);
      if ("error" in result) return;
      expect(result.created).toBe(1);

      const [, input] = vi.mocked(createCalendarEvent).mock.calls[0];
      expect(input.withMeet).toBe(false);
      expect(input.calendarId).toBe("cal-adjuncting");
      expect(input.timeZone).toBe(EXPECTED_TIME_ZONE);
      expect(input.privateProps).toEqual({
        taCourseId: "course-1",
        taKind: "due",
        taKey: "due-w1",
      });
    });

    it("bridges an all-day PlannedEvent to a local-midnight timed span (no native date-only mode exists to consume)", async () => {
      mockHappyPathUpTo(baseCourse({ startDate: "2026-01-05", endDate: "2026-01-20" }));
      vi.mocked(createCalendarEvent).mockResolvedValue({ htmlLink: null, meetLink: null });

      await syncCourseCalendarAction("course-1");
      const [, input] = vi.mocked(createCalendarEvent).mock.calls[0];
      expect(input.startISO).toBe("2026-01-05T00:00:00");
      expect(input.endISO).toBe("2026-01-21T00:00:00"); // end-exclusive day already added by the builder
    });

    it("applies create, then update, then delete, reporting the real counts", async () => {
      mockHappyPathUpTo(TWO_WEEK_COURSE, [
        { id: "evt-due-w1", summary: "old", startISO: null, privateProps: { taCourseId: "course-1", taKey: "due-w1" } },
        { id: "evt-due-w5", summary: "stale", startISO: null, privateProps: { taCourseId: "course-1", taKey: "due-w5" } },
      ]);
      vi.mocked(createCalendarEvent).mockResolvedValue({ htmlLink: null, meetLink: null });
      vi.mocked(updateCalendarEvent).mockResolvedValue({ htmlLink: null, meetLink: null });
      vi.mocked(deleteCalendarEvent).mockResolvedValue(undefined);

      const result = await syncCourseCalendarAction("course-1");
      expect("error" in result).toBe(false);
      if ("error" in result) return;
      expect(result.created).toBe(1);
      expect(result.updated).toBe(1);
      expect(result.deleted).toBe(1);
      expect(createCalendarEvent).toHaveBeenCalledTimes(1);
      expect(updateCalendarEvent).toHaveBeenCalledTimes(1);
      expect(deleteCalendarEvent).toHaveBeenCalledTimes(1);
      expect(deleteCalendarEvent).toHaveBeenCalledWith("token-abc", "cal-adjuncting", "evt-due-w5");
    });

    it("folds the builder's own notes (e.g. breaks) into the result", async () => {
      mockHappyPathUpTo(
        baseCourse({ startDate: "2026-01-05", weeks: 1, assignmentDueRule: "sun|23:59", breaks: "Week 1 - Break" })
      );
      vi.mocked(createCalendarEvent).mockResolvedValue({ htmlLink: null, meetLink: null });
      const result = await syncCourseCalendarAction("course-1");
      expect("error" in result).toBe(false);
      if ("error" in result) return;
      expect(result.notes).toContain("breaks are recorded on the tile but are not applied to calendar events");
    });
  });

  describe("partial-success handling (do not fail-fast)", () => {
    it("keeps going after a create failure and reports the real counts plus a note", async () => {
      // Three planned creates (a 3-week due-date course); the middle one fails.
      mockHappyPathUpTo(baseCourse({ startDate: "2026-01-05", weeks: 3, assignmentDueRule: "sun|23:59" }));
      vi.mocked(createCalendarEvent)
        .mockResolvedValueOnce({ htmlLink: null, meetLink: null })
        .mockRejectedValueOnce(new Error("Google event creation failed (HTTP 500): boom"))
        .mockResolvedValueOnce({ htmlLink: null, meetLink: null });

      const result = await syncCourseCalendarAction("course-1");
      expect("error" in result).toBe(false);
      if ("error" in result) return;
      expect(createCalendarEvent).toHaveBeenCalledTimes(3); // the loop did not abandon after the failure
      expect(result.created).toBe(2);
      expect(result.notes.some((n) => n.includes("failed") && n.includes("boom"))).toBe(true);
    });

    it("keeps going across create/update/delete failures in the same run", async () => {
      mockHappyPathUpTo(TWO_WEEK_COURSE, [
        { id: "evt-due-w1", summary: "old", startISO: null, privateProps: { taCourseId: "course-1", taKey: "due-w1" } },
        { id: "evt-due-w5", summary: "stale", startISO: null, privateProps: { taCourseId: "course-1", taKey: "due-w5" } },
      ]);
      vi.mocked(createCalendarEvent).mockRejectedValue(new Error("create failed"));
      vi.mocked(updateCalendarEvent).mockRejectedValue(new Error("update failed"));
      vi.mocked(deleteCalendarEvent).mockRejectedValue(new Error("delete failed"));

      const result = await syncCourseCalendarAction("course-1");
      expect("error" in result).toBe(false);
      if ("error" in result) return;
      expect(result.created).toBe(0);
      expect(result.updated).toBe(0);
      expect(result.deleted).toBe(0);
      expect(result.notes.some((n) => n.includes("create") && n.includes("create failed"))).toBe(true);
      expect(result.notes.some((n) => n.includes("update") && n.includes("update failed"))).toBe(true);
      expect(result.notes.some((n) => n.includes("delete") && n.includes("delete failed"))).toBe(true);
    });

    it("caps failure notes and appends a '+N more' line", async () => {
      // 20 weeks of due-date events, all failing to create.
      mockHappyPathUpTo(baseCourse({ startDate: "2026-01-05", weeks: 20, assignmentDueRule: "sun|23:59" }));
      vi.mocked(createCalendarEvent).mockRejectedValue(new Error("down"));

      const result = await syncCourseCalendarAction("course-1");
      expect("error" in result).toBe(false);
      if ("error" in result) return;
      expect(createCalendarEvent).toHaveBeenCalledTimes(20); // still attempted every one
      expect(result.created).toBe(0);
      const failureLines = result.notes.filter((n) => n.includes("failed"));
      expect(failureLines.length).toBe(10);
      expect(result.notes.some((n) => n === "+10 more")).toBe(true);
    });
  });
});
