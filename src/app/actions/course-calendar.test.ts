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
import { syncCourseCalendarAction, syncChecklistItemCalendarAction, syncAllCoursesCalendarAction } from "./course-calendar";
import { CHECKLIST_DONE_PREFIX } from "@/lib/course-calendar-events";
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

// AC1/AC2: syncChecklistItemCalendarAction is the bounded-cost write every
// checklist mutation (add, rename, re-day/re-time, toggle, remove) now
// triggers, covering ONE item's own occurrences across the WHOLE term (not
// just "this week", which is what this action used to do before this fix -
// see the doc comment in course-calendar.ts for why that was the bug). The
// term below (Jan 5 - Jan 25, a 3-Wednesday span) is the exact fixture
// course-calendar-events.test.ts hand-verifies for findAllChecklistItemEvents.
describe("syncChecklistItemCalendarAction", () => {
  const CHECKLIST_COURSE = baseCourse({
    startDate: "2026-01-05",
    endDate: "2026-01-25",
    weeklyChecklist: [
      { id: "item-1", label: "Grade discussion posts", checked: false, checkedAt: null, deadline: { weekday: 3, time: "09:00" } },
    ],
  });
  // The three occurrences findAllChecklistItemEvents produces for item-1 above.
  const ITEM1_KEYS = ["checklist-item-1-w0", "checklist-item-1-w1", "checklist-item-1-w2"];

  function mockUpTo(existing: Array<{ id: string; summary: string; startISO: string | null; privateProps: Record<string, string> }> = []) {
    vi.mocked(requireOwner).mockResolvedValue({ id: "user-1", email: "user@example.com" });
    vi.mocked(listCourses).mockResolvedValue([CHECKLIST_COURSE]);
    vi.mocked(resolveCalendarTarget).mockResolvedValue({ ok: true, calendarId: "cal-adjuncting", calendarName: "Adjuncting" });
    vi.mocked(getValidAccessToken).mockResolvedValue("token-abc");
    vi.mocked(listEventsByPrivateProps).mockResolvedValue(existing);
  }

  function taggedFor(itemId: string, weekIndex: number, idSuffix = "") {
    const key = `checklist-${itemId}-w${weekIndex}`;
    return { id: `evt-${key}${idSuffix}`, summary: "old", startISO: null, privateProps: { taCourseId: "course-1", taKind: "checklist", taKey: key } };
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Guards / error paths", () => {
    it("rejects a blank courseId without calling listCourses", async () => {
      vi.mocked(requireOwner).mockResolvedValue({ id: "user-1", email: "user@example.com" });
      const result = await syncChecklistItemCalendarAction("", "item-1");
      expect(result).toEqual({ error: "Choose a course." });
      expect(listCourses).not.toHaveBeenCalled();
    });

    it("rejects a blank itemId without calling listCourses", async () => {
      vi.mocked(requireOwner).mockResolvedValue({ id: "user-1", email: "user@example.com" });
      const result = await syncChecklistItemCalendarAction("course-1", "   ");
      expect(result).toEqual({ error: "Choose a checklist item." });
      expect(listCourses).not.toHaveBeenCalled();
    });

    it("returns 'Course not found.' when the id is not among the owner's tiles", async () => {
      vi.mocked(requireOwner).mockResolvedValue({ id: "user-1", email: "user@example.com" });
      vi.mocked(listCourses).mockResolvedValue([baseCourse({ id: "different-course" })]);
      const result = await syncChecklistItemCalendarAction("course-1", "item-1");
      expect(result).toEqual({ error: "Course not found." });
    });
  });

  describe("nothing to sync", () => {
    it("returns synced:false, reason:nothing-to-sync when the item has no deadline and nothing was ever created for it", async () => {
      mockUpTo([]);
      vi.mocked(listCourses).mockResolvedValue([
        baseCourse({
          startDate: "2026-01-05",
          endDate: "2026-01-25",
          weeklyChecklist: [{ id: "item-1", label: "No deadline item", checked: false, checkedAt: null, deadline: null }],
        }),
      ]);
      const result = await syncChecklistItemCalendarAction("course-1", "item-1");
      expect(result).toEqual({ synced: false, reason: "nothing-to-sync" });
      expect(createCalendarEvent).not.toHaveBeenCalled();
      expect(updateCalendarEvent).not.toHaveBeenCalled();
      expect(deleteCalendarEvent).not.toHaveBeenCalled();
    });
  });

  describe("AC1: add-with-deadline pushes every occurrence", () => {
    it("creates one event per week the item is planned for", async () => {
      mockUpTo([]);
      vi.mocked(createCalendarEvent).mockResolvedValue({ htmlLink: null, meetLink: null });
      const result = await syncChecklistItemCalendarAction("course-1", "item-1");
      expect(result).toEqual({ synced: true });
      expect(createCalendarEvent).toHaveBeenCalledTimes(3);
      const keys = vi.mocked(createCalendarEvent).mock.calls.map(([, input]) => input.privateProps?.taKey).sort();
      expect(keys).toEqual(ITEM1_KEYS);
      const [, input] = vi.mocked(createCalendarEvent).mock.calls[0];
      expect(input.privateProps?.taCourseId).toBe("course-1");
      expect(input.privateProps?.taKind).toBe("checklist");
      expect(input.withMeet).toBe(false);
    });
  });

  describe("AC1: changing day/time moves the events", () => {
    it("updates every existing occurrence in place when only the time changes (same weekday, same keys)", async () => {
      mockUpTo(ITEM1_KEYS.map((k, i) => taggedFor("item-1", i)));
      vi.mocked(listCourses).mockResolvedValue([
        baseCourse({
          startDate: "2026-01-05",
          endDate: "2026-01-25",
          weeklyChecklist: [{ id: "item-1", label: "Grade discussion posts", checked: false, checkedAt: null, deadline: { weekday: 3, time: "16:30" } }],
        }),
      ]);
      vi.mocked(updateCalendarEvent).mockResolvedValue({ htmlLink: null, meetLink: null });
      const result = await syncChecklistItemCalendarAction("course-1", "item-1");
      expect(result).toEqual({ synced: true });
      expect(updateCalendarEvent).toHaveBeenCalledTimes(3);
      expect(createCalendarEvent).not.toHaveBeenCalled();
      expect(deleteCalendarEvent).not.toHaveBeenCalled();
      const startTimes = vi.mocked(updateCalendarEvent).mock.calls.map(([, , , input]) => input.startISO);
      expect(startTimes.every((iso) => iso.endsWith("16:30:00"))).toBe(true);
    });

    it("deletes stale weeks and creates new ones when the weekday itself changes", async () => {
      // Existing tagged events reflect the OLD Wednesday schedule; the course
      // now has item-1 on Sunday (weekday 0), which produces a different key set.
      mockUpTo(ITEM1_KEYS.map((k, i) => taggedFor("item-1", i)));
      vi.mocked(listCourses).mockResolvedValue([
        baseCourse({
          startDate: "2026-01-05",
          endDate: "2026-01-25",
          weeklyChecklist: [{ id: "item-1", label: "Grade discussion posts", checked: false, checkedAt: null, deadline: { weekday: 0, time: "09:00" } }],
        }),
      ]);
      vi.mocked(createCalendarEvent).mockResolvedValue({ htmlLink: null, meetLink: null });
      vi.mocked(updateCalendarEvent).mockResolvedValue({ htmlLink: null, meetLink: null });
      vi.mocked(deleteCalendarEvent).mockResolvedValue(undefined);
      const result = await syncChecklistItemCalendarAction("course-1", "item-1");
      expect(result).toEqual({ synced: true });
      // Mirrors course-calendar-events.test.ts's own hand-verified diff for
      // this exact weekday change: 1 delete, 2 updates, 1 create.
      expect(deleteCalendarEvent).toHaveBeenCalledTimes(1);
      expect(updateCalendarEvent).toHaveBeenCalledTimes(2);
      expect(createCalendarEvent).toHaveBeenCalledTimes(1);
    });
  });

  describe("AC1: clearing a deadline removes the events it owned", () => {
    it("deletes every previously-planned occurrence and creates/updates nothing", async () => {
      mockUpTo(ITEM1_KEYS.map((k, i) => taggedFor("item-1", i)));
      vi.mocked(listCourses).mockResolvedValue([
        baseCourse({
          startDate: "2026-01-05",
          endDate: "2026-01-25",
          weeklyChecklist: [{ id: "item-1", label: "Grade discussion posts", checked: false, checkedAt: null, deadline: null }],
        }),
      ]);
      vi.mocked(deleteCalendarEvent).mockResolvedValue(undefined);
      const result = await syncChecklistItemCalendarAction("course-1", "item-1");
      expect(result).toEqual({ synced: true });
      expect(deleteCalendarEvent).toHaveBeenCalledTimes(3);
      expect(createCalendarEvent).not.toHaveBeenCalled();
      expect(updateCalendarEvent).not.toHaveBeenCalled();
    });
  });

  describe("AC1: removing an item removes the events it owned", () => {
    it("deletes every previously-planned occurrence when the item is no longer in the checklist at all", async () => {
      mockUpTo(ITEM1_KEYS.map((k, i) => taggedFor("item-1", i)));
      vi.mocked(listCourses).mockResolvedValue([baseCourse({ startDate: "2026-01-05", endDate: "2026-01-25", weeklyChecklist: [] })]);
      vi.mocked(deleteCalendarEvent).mockResolvedValue(undefined);
      const result = await syncChecklistItemCalendarAction("course-1", "item-1");
      expect(result).toEqual({ synced: true });
      expect(deleteCalendarEvent).toHaveBeenCalledTimes(3);
    });
  });

  describe("AC2: rename updates titles", () => {
    it("updates every occurrence's summary to the new label, without touching keys", async () => {
      mockUpTo(ITEM1_KEYS.map((k, i) => taggedFor("item-1", i)));
      vi.mocked(listCourses).mockResolvedValue([
        baseCourse({
          startDate: "2026-01-05",
          endDate: "2026-01-25",
          weeklyChecklist: [{ id: "item-1", label: "Grade discussion posts, all sections", checked: false, checkedAt: null, deadline: { weekday: 3, time: "09:00" } }],
        }),
      ]);
      vi.mocked(updateCalendarEvent).mockResolvedValue({ htmlLink: null, meetLink: null });
      const result = await syncChecklistItemCalendarAction("course-1", "item-1");
      expect(result).toEqual({ synced: true });
      expect(createCalendarEvent).not.toHaveBeenCalled();
      expect(deleteCalendarEvent).not.toHaveBeenCalled();
      const summaries = vi.mocked(updateCalendarEvent).mock.calls.map(([, , , input]) => input.summary);
      expect(summaries.every((s) => s.includes("all sections"))).toBe(true);
    });

    it("pushes the CHECKLIST_DONE_PREFIX-ed title for the week the item was checked in", async () => {
      const checkedAt = new Date(2026, 0, 13, 9, 0, 0).getTime(); // same Sunday-anchored week as w1 (Jan 14)
      mockUpTo([]);
      vi.mocked(listCourses).mockResolvedValue([
        baseCourse({
          startDate: "2026-01-05",
          endDate: "2026-01-25",
          weeklyChecklist: [{ id: "item-1", label: "Grade discussion posts", checked: true, checkedAt, deadline: { weekday: 3, time: "09:00" } }],
        }),
      ]);
      vi.mocked(createCalendarEvent).mockResolvedValue({ htmlLink: null, meetLink: null });
      await syncChecklistItemCalendarAction("course-1", "item-1");
      const w1Call = vi.mocked(createCalendarEvent).mock.calls.find(([, input]) => input.privateProps?.taKey === "checklist-item-1-w1");
      expect(w1Call?.[1].summary.startsWith(CHECKLIST_DONE_PREFIX)).toBe(true);
      const w0Call = vi.mocked(createCalendarEvent).mock.calls.find(([, input]) => input.privateProps?.taKey === "checklist-item-1-w0");
      expect(w0Call?.[1].summary.startsWith(CHECKLIST_DONE_PREFIX)).toBe(false);
    });
  });

  describe("the scoped path stays scoped (no full-term resync)", () => {
    it("queries listEventsByPrivateProps by taCourseId + taKind:checklist, never taCourseId alone", async () => {
      mockUpTo([]);
      vi.mocked(createCalendarEvent).mockResolvedValue({ htmlLink: null, meetLink: null });
      await syncChecklistItemCalendarAction("course-1", "item-1");
      expect(listEventsByPrivateProps).toHaveBeenCalledTimes(1);
      expect(listEventsByPrivateProps).toHaveBeenCalledWith("token-abc", "cal-adjuncting", {
        taCourseId: "course-1",
        taKind: "checklist",
      });
    });

    it("never creates, updates, or deletes another item's checklist events, even when they come back in the same query", async () => {
      mockUpTo([
        taggedFor("item-1", 0),
        taggedFor("item-1", 1),
        taggedFor("item-1", 2),
        taggedFor("other-item", 0), // a different checklist item's own event
        taggedFor("other-item", 1),
      ]);
      vi.mocked(updateCalendarEvent).mockResolvedValue({ htmlLink: null, meetLink: null });
      await syncChecklistItemCalendarAction("course-1", "item-1");
      const touchedIds = [
        ...vi.mocked(updateCalendarEvent).mock.calls.map((c) => c[2]),
        ...vi.mocked(deleteCalendarEvent).mock.calls.map((c) => c[2]),
        ...vi.mocked(createCalendarEvent).mock.calls.map(() => "n/a"),
      ];
      expect(touchedIds.some((id) => id.includes("other-item"))).toBe(false);
    });

    it("never touches term/meeting/test/due events - it never queries or diffs the whole course", async () => {
      mockUpTo([]);
      vi.mocked(createCalendarEvent).mockResolvedValue({ htmlLink: null, meetLink: null });
      await syncChecklistItemCalendarAction("course-1", "item-1");
      // A course-wide sync would call listEventsByPrivateProps with taCourseId
      // ALONE (see syncCourseCalendarAction's own test above) - this action
      // never does, so every call it makes carries taKind too.
      for (const call of vi.mocked(listEventsByPrivateProps).mock.calls) {
        expect(call[2]).toHaveProperty("taKind", "checklist");
      }
    });
  });

  describe("error paths", () => {
    it("surfaces the not-connected message from resolveCalendarTarget", async () => {
      vi.mocked(requireOwner).mockResolvedValue({ id: "user-1", email: "user@example.com" });
      vi.mocked(listCourses).mockResolvedValue([CHECKLIST_COURSE]);
      vi.mocked(resolveCalendarTarget).mockResolvedValue({
        ok: false,
        reason: "not-connected",
        message: "Google Calendar isn't connected. Connect it under Account > Integrations.",
      });
      const result = await syncChecklistItemCalendarAction("course-1", "item-1");
      expect(result).toEqual({ error: "Google Calendar isn't connected. Connect it under Account > Integrations." });
    });

    it("returns an error when the token disappears between resolveCalendarTarget and the fetch", async () => {
      vi.mocked(requireOwner).mockResolvedValue({ id: "user-1", email: "user@example.com" });
      vi.mocked(listCourses).mockResolvedValue([CHECKLIST_COURSE]);
      vi.mocked(resolveCalendarTarget).mockResolvedValue({ ok: true, calendarId: "cal-adjuncting", calendarName: "Adjuncting" });
      vi.mocked(getValidAccessToken).mockResolvedValue(null);
      const result = await syncChecklistItemCalendarAction("course-1", "item-1");
      expect("error" in result).toBe(true);
      expect(listEventsByPrivateProps).not.toHaveBeenCalled();
    });

    it("surfaces a createCalendarEvent failure as a plain error - the caller treats this as non-fatal on its own", async () => {
      mockUpTo([]);
      vi.mocked(createCalendarEvent).mockRejectedValue(new Error("boom"));
      const result = await syncChecklistItemCalendarAction("course-1", "item-1");
      expect("error" in result).toBe(true);
      if ("error" in result) expect(result.error).toContain("boom");
    });
  });
});

// AC8/AC9/AC10: syncAllCoursesCalendarAction fans the SAME per-course sync
// (syncOneCourseCalendar - buildCourseEvents + diffPlannedEvents, never a
// second planner) out across every course, isolating one course's failure
// from the rest, and reporting per-course outcomes instead of one pass/fail.
describe("syncAllCoursesCalendarAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function mockConnected() {
    vi.mocked(requireOwner).mockResolvedValue({ id: "user-1", email: "user@example.com" });
    vi.mocked(resolveCalendarTarget).mockResolvedValue({ ok: true, calendarId: "cal-adjuncting", calendarName: "Adjuncting" });
    vi.mocked(getValidAccessToken).mockResolvedValue("token-abc");
  }

  it("surfaces the not-connected message once, up front, without listing any course's events", async () => {
    vi.mocked(requireOwner).mockResolvedValue({ id: "user-1", email: "user@example.com" });
    vi.mocked(listCourses).mockResolvedValue([ONE_WEEK_COURSE, TWO_WEEK_COURSE]);
    vi.mocked(resolveCalendarTarget).mockResolvedValue({
      ok: false,
      reason: "not-connected",
      message: "Google Calendar isn't connected. Connect it under Account > Integrations.",
    });
    const result = await syncAllCoursesCalendarAction();
    expect(result).toEqual({ error: "Google Calendar isn't connected. Connect it under Account > Integrations." });
    expect(listEventsByPrivateProps).not.toHaveBeenCalled();
  });

  it("resolves the calendar target and token exactly once, not once per course", async () => {
    mockConnected();
    vi.mocked(listCourses).mockResolvedValue([ONE_WEEK_COURSE, TWO_WEEK_COURSE]);
    vi.mocked(listEventsByPrivateProps).mockResolvedValue([]);
    vi.mocked(createCalendarEvent).mockResolvedValue({ htmlLink: null, meetLink: null });
    await syncAllCoursesCalendarAction();
    expect(resolveCalendarTarget).toHaveBeenCalledTimes(1);
    expect(getValidAccessToken).toHaveBeenCalledTimes(1);
  });

  it("every course syncs: reports outcome:synced with real counts, one entry per course", async () => {
    mockConnected();
    vi.mocked(listCourses).mockResolvedValue([ONE_WEEK_COURSE, TWO_WEEK_COURSE]);
    vi.mocked(listEventsByPrivateProps).mockResolvedValue([]);
    vi.mocked(createCalendarEvent).mockResolvedValue({ htmlLink: null, meetLink: null });
    const result = await syncAllCoursesCalendarAction();
    expect("error" in result).toBe(false);
    if ("error" in result) return;
    expect(result.perCourse).toHaveLength(2);
    expect(result.perCourse.every((c) => c.outcome === "synced")).toBe(true);
    const oneWeek = result.perCourse.find((c) => c.courseId === "course-1");
    expect(oneWeek).toMatchObject({ outcome: "synced", created: 1 });
  });

  it("a course with no start/end date is reported skipped, with the term-event note as the reason", async () => {
    mockConnected();
    const noDatesCourse = baseCourse({ id: "course-no-dates", name: "No Dates Course", startDate: null, endDate: null });
    vi.mocked(listCourses).mockResolvedValue([noDatesCourse]);
    vi.mocked(listEventsByPrivateProps).mockResolvedValue([]);
    const result = await syncAllCoursesCalendarAction();
    expect("error" in result).toBe(false);
    if ("error" in result) return;
    expect(result.perCourse).toHaveLength(1);
    const [course] = result.perCourse;
    expect(course.outcome).toBe("skipped");
    expect(course.courseId).toBe("course-no-dates");
    expect(course.courseName).toBe("No Dates Course");
    // baseCourse also lacks weeks/dayTime/tests/assignmentDueRule, so
    // buildCourseEvents notes every skipped kind, not only the term event -
    // this test only asserts the one AC9 cares about is among them.
    if (course.outcome === "skipped") {
      expect(course.notes).toContain("no start date or end date set - the term event was skipped");
    }
    expect(createCalendarEvent).not.toHaveBeenCalled();
  });

  it("one course erroring does not abort the rest - the other courses still complete", async () => {
    mockConnected();
    const badCourse = baseCourse({ id: "course-bad", name: "Bad Course", startDate: "2026-01-05", weeks: 1, assignmentDueRule: "sun|23:59" });
    vi.mocked(listCourses).mockResolvedValue([badCourse, ONE_WEEK_COURSE, TWO_WEEK_COURSE]);
    // listEventsByPrivateProps fails for the FIRST course only, then succeeds.
    vi.mocked(listEventsByPrivateProps)
      .mockRejectedValueOnce(new Error("Google tagged events list failed (HTTP 500): boom"))
      .mockResolvedValue([]);
    vi.mocked(createCalendarEvent).mockResolvedValue({ htmlLink: null, meetLink: null });
    const result = await syncAllCoursesCalendarAction();
    expect("error" in result).toBe(false);
    if ("error" in result) return;
    expect(result.perCourse).toHaveLength(3);
    const bad = result.perCourse.find((c) => c.courseId === "course-bad");
    expect(bad?.outcome).toBe("error");
    if (bad?.outcome === "error") expect(bad.error).toContain("boom");
    const rest = result.perCourse.filter((c) => c.courseId !== "course-bad");
    expect(rest.every((c) => c.outcome === "synced")).toBe(true);
  });

  it("idempotency: a second run against the first run's own output is all-update, no create/delete", async () => {
    mockConnected();
    vi.mocked(listCourses).mockResolvedValue([TWO_WEEK_COURSE]);
    // Simulate the calendar already holding exactly what the first run would
    // have created: due-w1 and due-w2, tagged for this course.
    vi.mocked(listEventsByPrivateProps).mockResolvedValue([
      { id: "evt-w1", summary: "old", startISO: null, privateProps: { taCourseId: "course-1", taKey: "due-w1" } },
      { id: "evt-w2", summary: "old", startISO: null, privateProps: { taCourseId: "course-1", taKey: "due-w2" } },
    ]);
    vi.mocked(updateCalendarEvent).mockResolvedValue({ htmlLink: null, meetLink: null });
    const result = await syncAllCoursesCalendarAction();
    expect("error" in result).toBe(false);
    if ("error" in result) return;
    expect(createCalendarEvent).not.toHaveBeenCalled();
    expect(deleteCalendarEvent).not.toHaveBeenCalled();
    expect(updateCalendarEvent).toHaveBeenCalledTimes(2);
    expect(result.perCourse[0].outcome).toBe("synced");
  });
});
