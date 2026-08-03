import { describe, it, expect } from "vitest";
import { emptyCourseProject } from "@/lib/course-project";
import {
  buildCourseEvents,
  diffPlannedEvents,
  isRecognizedEventKey,
  isChecklistEventKeyForItem,
  findAllChecklistItemEvents,
  checklistCalendarBlockers,
  CHECKLIST_DONE_PREFIX,
  type PlannedEvent,
  type ExistingEvent,
} from "./course-calendar-events";
import type { Course } from "@/lib/supabase/courses";
import type { WeeklyChecklistItem } from "@/lib/weekly-checklist";

// New sibling file (see course-calendar-events.test.ts's own 1138-line size,
// already over this project's 1000-line-per-test-file cap) covering ONLY the
// daily/monthly checklist frequencies added to buildCourseEvents. Reuses the
// parent file's own conventions (baseCourse, checklistItem-style factories,
// eventsOfKind) rather than importing from it, matching how that file is
// itself self-contained.
//
// 2026-01-04 is a Sunday (verified against weekly-checklist.test.ts's own
// anchor comment), so within January 2026: Jan 5 = Monday, Jan 11/18/25 =
// Sunday, Jan 10/17/24/31 = Saturday. The term below (Jan 5 - Jan 25) is the
// exact same term course-calendar-events.test.ts's own checklist describe
// block uses, reused here for the same "hand-verifiable without a calendar"
// property.
const TERM_START = "2026-01-05"; // Monday
const TERM_END = "2026-01-25"; // Sunday

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

function eventsOfKind(result: { events: PlannedEvent[] }, kind: PlannedEvent["kind"]): PlannedEvent[] {
  return result.events.filter((e) => e.kind === kind);
}

function checklistKeys(result: { events: PlannedEvent[] }): string[] {
  return eventsOfKind(result, "checklist")
    .map((e) => e.key)
    .sort();
}

function dailyItem(overrides: Partial<WeeklyChecklistItem> = {}): WeeklyChecklistItem {
  return {
    id: "item-1",
    label: "Take attendance",
    checked: false,
    checkedAt: null,
    deadline: { weekday: 0, time: "09:00", frequency: "daily" },
    ...overrides,
  };
}

function monthlyItem(overrides: Partial<WeeklyChecklistItem> = {}): WeeklyChecklistItem {
  return {
    id: "item-1",
    label: "Submit attendance report",
    checked: false,
    checkedAt: null,
    deadline: { weekday: 0, time: "09:00", frequency: "monthly", dayOfMonth: 15 },
    ...overrides,
  };
}

describe("buildCourseEvents - daily checklist (current-week bound)", () => {
  it("emits nothing and adds no note when there is no weekly checklist at all", () => {
    const result = buildCourseEvents({
      course: baseCourse({ startDate: TERM_START, endDate: TERM_END }),
      today: new Date(2026, 0, 14),
    });
    expect(eventsOfKind(result, "checklist")).toHaveLength(0);
    expect(result.notes.some((n) => n.includes("checklist"))).toBe(false);
  });

  it("skips with a note when startDate or endDate is missing", () => {
    const noStart = buildCourseEvents({
      course: baseCourse({ startDate: null, endDate: TERM_END, weeklyChecklist: [dailyItem()] }),
      today: new Date(2026, 0, 14),
    });
    expect(eventsOfKind(noStart, "checklist")).toHaveLength(0);
    expect(noStart.notes).toContain("no start date or end date set - daily checklist events were skipped");

    const noEnd = buildCourseEvents({
      course: baseCourse({ startDate: TERM_START, endDate: null, weeklyChecklist: [dailyItem()] }),
      today: new Date(2026, 0, 14),
    });
    expect(eventsOfKind(noEnd, "checklist")).toHaveLength(0);
    expect(noEnd.notes).toContain("no start date or end date set - daily checklist events were skipped");
  });

  it("does not add a 'skipped' note for a course with no start/end date when the only items are non-daily", () => {
    const result = buildCourseEvents({
      course: baseCourse({ startDate: null, endDate: null, weeklyChecklist: [] }),
      today: new Date(2026, 0, 14),
    });
    expect(result.notes.some((n) => n.includes("daily"))).toBe(false);
  });

  it("produces exactly one event per day of the CURRENT calendar week (Sun-Sat), never more than 7", () => {
    // Wednesday Jan 14 falls in the Sunday-anchored week Jan 11-17, entirely
    // inside the [Jan 5, Jan 25] term - all 7 days should produce an event.
    const result = buildCourseEvents({
      course: baseCourse({ startDate: TERM_START, endDate: TERM_END, weeklyChecklist: [dailyItem()] }),
      today: new Date(2026, 0, 14),
    });
    const checklist = eventsOfKind(result, "checklist");
    expect(checklist).toHaveLength(7);
    expect(checklistKeys(result)).toEqual([
      "checklist-item-1-d2026-01-11",
      "checklist-item-1-d2026-01-12",
      "checklist-item-1-d2026-01-13",
      "checklist-item-1-d2026-01-14",
      "checklist-item-1-d2026-01-15",
      "checklist-item-1-d2026-01-16",
      "checklist-item-1-d2026-01-17",
    ]);
  });

  it("never expands beyond the current week even across a many-month term (the AC2 fan-out bound)", () => {
    // A ~16-week-equivalent term (Jan 5 - Apr 30) must still cap out at 7
    // events, not ~112 (16 weeks x 7 days) - this is the exact runaway
    // scenario the instructor's second decision exists to prevent.
    const result = buildCourseEvents({
      course: baseCourse({
        startDate: TERM_START,
        endDate: "2026-04-30",
        weeklyChecklist: [dailyItem()],
      }),
      today: new Date(2026, 0, 14),
    });
    expect(eventsOfKind(result, "checklist")).toHaveLength(7);
  });

  it("excludes days in the current week that fall before the course start date", () => {
    // Tuesday Jan 6 falls in the Sunday-anchored week Jan 4-10; Jan 4
    // precedes the Jan 5 start date and must be excluded, leaving 6 days.
    const result = buildCourseEvents({
      course: baseCourse({ startDate: TERM_START, endDate: TERM_END, weeklyChecklist: [dailyItem()] }),
      today: new Date(2026, 0, 6),
    });
    const dates = eventsOfKind(result, "checklist").map((e) => e.startISO.slice(0, 10)).sort();
    expect(dates).toEqual(["2026-01-05", "2026-01-06", "2026-01-07", "2026-01-08", "2026-01-09", "2026-01-10"]);
  });

  it("excludes days in the current week that fall after the course end date", () => {
    // Sunday Jan 25 (the term's own last day) begins the week Jan 25-31;
    // only Jan 25 itself is within the term, leaving exactly 1 day.
    const result = buildCourseEvents({
      course: baseCourse({ startDate: TERM_START, endDate: TERM_END, weeklyChecklist: [dailyItem()] }),
      today: new Date(2026, 0, 25),
    });
    const dates = eventsOfKind(result, "checklist").map((e) => e.startISO.slice(0, 10));
    expect(dates).toEqual(["2026-01-25"]);
  });

  it("produces zero events (no note) when the entire current week falls outside the term", () => {
    const result = buildCourseEvents({
      course: baseCourse({ startDate: TERM_START, endDate: TERM_END, weeklyChecklist: [dailyItem()] }),
      today: new Date(2026, 1, 10), // February, well past TERM_END
    });
    expect(eventsOfKind(result, "checklist")).toHaveLength(0);
    // Same precedent as buildChecklistEvents' own boundary-exclusion tests -
    // zero occurrences in bounds is not the same as "dates entirely unset",
    // so no note is expected.
    expect(result.notes.some((n) => n.includes("daily"))).toBe(false);
  });

  it("produces a timed event using the deadline's own time, +30 minutes end", () => {
    const result = buildCourseEvents({
      course: baseCourse({
        startDate: TERM_START,
        endDate: TERM_END,
        weeklyChecklist: [dailyItem({ deadline: { weekday: 0, time: "09:00", frequency: "daily" } })],
      }),
      today: new Date(2026, 0, 14),
    });
    const day13 = eventsOfKind(result, "checklist").find((e) => e.key === "checklist-item-1-d2026-01-13")!;
    expect(day13.allDay).toBe(false);
    expect(day13.startISO).toBe("2026-01-13T09:00:00");
    expect(day13.endISO).toBe("2026-01-13T09:30:00");
    expect(day13.summary).toBe("CS 101 - Take attendance");
  });

  it("produces an all-day event (exclusive end, +1 day) when the deadline has no time", () => {
    const result = buildCourseEvents({
      course: baseCourse({
        startDate: TERM_START,
        endDate: TERM_END,
        weeklyChecklist: [dailyItem({ deadline: { weekday: 0, time: null, frequency: "daily" } })],
      }),
      today: new Date(2026, 0, 14),
    });
    const day13 = eventsOfKind(result, "checklist").find((e) => e.key === "checklist-item-1-d2026-01-13")!;
    expect(day13.allDay).toBe(true);
    expect(day13.startISO).toBe("2026-01-13");
    expect(day13.endISO).toBe("2026-01-14");
  });

  it("applies CHECKLIST_DONE_PREFIX to exactly the day the item was checked in, and no other day", () => {
    const checkedAt = new Date(2026, 0, 13, 10, 0, 0).getTime();
    const result = buildCourseEvents({
      course: baseCourse({
        startDate: TERM_START,
        endDate: TERM_END,
        weeklyChecklist: [dailyItem({ checked: true, checkedAt })],
      }),
      today: new Date(2026, 0, 14),
    });
    const checklist = eventsOfKind(result, "checklist");
    const checkedDay = checklist.find((e) => e.key === "checklist-item-1-d2026-01-13")!;
    const otherDays = checklist.filter((e) => e.key !== "checklist-item-1-d2026-01-13");
    expect(checkedDay.summary.startsWith(CHECKLIST_DONE_PREFIX)).toBe(true);
    expect(checkedDay.summary).toBe(`${CHECKLIST_DONE_PREFIX}CS 101 - Take attendance`);
    expect(otherDays.every((e) => !e.summary.includes(CHECKLIST_DONE_PREFIX))).toBe(true);
    expect(otherDays).toHaveLength(6);
  });

  it("does not apply CHECKLIST_DONE_PREFIX anywhere for an unchecked item", () => {
    const result = buildCourseEvents({
      course: baseCourse({
        startDate: TERM_START,
        endDate: TERM_END,
        weeklyChecklist: [dailyItem({ checked: false, checkedAt: null })],
      }),
      today: new Date(2026, 0, 14),
    });
    expect(eventsOfKind(result, "checklist").every((e) => !e.summary.includes(CHECKLIST_DONE_PREFIX))).toBe(true);
  });

  it("uses each item's own label and id for multiple daily items in the same course", () => {
    const result = buildCourseEvents({
      course: baseCourse({
        startDate: TERM_START,
        endDate: TERM_END,
        weeklyChecklist: [
          dailyItem({ id: "a", label: "Take attendance" }),
          dailyItem({ id: "b", label: "Post office hours reminder" }),
        ],
      }),
      today: new Date(2026, 0, 14),
    });
    const checklist = eventsOfKind(result, "checklist");
    expect(checklist).toHaveLength(14); // 7 days x 2 items
    expect(checklist.every((e) => e.key.startsWith("checklist-a-d") || e.key.startsWith("checklist-b-d"))).toBe(
      true
    );
    expect(checklist.filter((e) => e.summary.includes("Take attendance"))).toHaveLength(7);
    expect(checklist.filter((e) => e.summary.includes("Post office hours reminder"))).toHaveLength(7);
  });

  it("rolls the window forward across a later re-sync: the old week's keys become deletes, the new week's become creates (no orphans, no duplicates)", () => {
    // First sync happens on Wednesday Jan 14 (week Jan 11-17).
    const week1 = buildCourseEvents({
      course: baseCourse({ startDate: TERM_START, endDate: TERM_END, weeklyChecklist: [dailyItem()] }),
      today: new Date(2026, 0, 14),
    });
    // A later re-sync happens on Wednesday Jan 21 (week Jan 18-24) - a full
    // week later, so the two windows share no dates at all.
    const week2 = buildCourseEvents({
      course: baseCourse({ startDate: TERM_START, endDate: TERM_END, weeklyChecklist: [dailyItem()] }),
      today: new Date(2026, 0, 21),
    });

    const week1Keys = new Set(checklistKeys(week1));
    const week2Keys = new Set(checklistKeys(week2));
    expect([...week1Keys].some((k) => week2Keys.has(k))).toBe(false); // fully disjoint

    const existing: ExistingEvent[] = eventsOfKind(week1, "checklist").map((e, i) => ({ id: `g-${i}`, key: e.key }));
    const diff = diffPlannedEvents(eventsOfKind(week2, "checklist"), existing);

    expect(diff.toCreate.map((e) => e.key).sort()).toEqual([...week2Keys].sort());
    expect(diff.toDelete.sort()).toEqual(existing.map((e) => e.id).sort());
    expect(diff.toUpdate).toHaveLength(0);
  });

  it("re-syncing on the SAME day (same current week) updates in place rather than deleting and recreating", () => {
    const first = buildCourseEvents({
      course: baseCourse({ startDate: TERM_START, endDate: TERM_END, weeklyChecklist: [dailyItem()] }),
      today: new Date(2026, 0, 14, 8, 0),
    });
    const second = buildCourseEvents({
      course: baseCourse({ startDate: TERM_START, endDate: TERM_END, weeklyChecklist: [dailyItem()] }),
      today: new Date(2026, 0, 14, 20, 0), // later the same day
    });

    const existing: ExistingEvent[] = eventsOfKind(first, "checklist").map((e, i) => ({ id: `g-${i}`, key: e.key }));
    const diff = diffPlannedEvents(eventsOfKind(second, "checklist"), existing);

    expect(diff.toCreate).toHaveLength(0);
    expect(diff.toDelete).toHaveLength(0);
    expect(diff.toUpdate).toHaveLength(7);
  });
});

describe("buildCourseEvents - monthly checklist (term-wide expansion)", () => {
  it("skips with a note when startDate or endDate is missing", () => {
    const noStart = buildCourseEvents({
      course: baseCourse({ startDate: null, endDate: TERM_END, weeklyChecklist: [monthlyItem()] }),
    });
    expect(eventsOfKind(noStart, "checklist")).toHaveLength(0);
    expect(noStart.notes).toContain("no start date or end date set - monthly checklist events were skipped");

    const noEnd = buildCourseEvents({
      course: baseCourse({ startDate: TERM_START, endDate: null, weeklyChecklist: [monthlyItem()] }),
    });
    expect(eventsOfKind(noEnd, "checklist")).toHaveLength(0);
    expect(noEnd.notes).toContain("no start date or end date set - monthly checklist events were skipped");
  });

  it("emits one event per calendar month across the term, keyed by a stable month index", () => {
    const result = buildCourseEvents({
      course: baseCourse({
        startDate: TERM_START, // Jan 5
        endDate: "2026-03-25", // spans Jan, Feb, Mar
        weeklyChecklist: [monthlyItem({ deadline: { weekday: 0, time: "09:00", frequency: "monthly", dayOfMonth: 15 } })],
      }),
    });
    const checklist = eventsOfKind(result, "checklist");
    expect(checklist).toHaveLength(3);
    expect(checklistKeys(result)).toEqual(["checklist-item-1-m0", "checklist-item-1-m1", "checklist-item-1-m2"]);

    const jan = checklist.find((e) => e.key === "checklist-item-1-m0")!;
    const feb = checklist.find((e) => e.key === "checklist-item-1-m1")!;
    const mar = checklist.find((e) => e.key === "checklist-item-1-m2")!;
    expect(jan.startISO).toBe("2026-01-15T09:00:00");
    expect(feb.startISO).toBe("2026-02-15T09:00:00");
    expect(mar.startISO).toBe("2026-03-15T09:00:00");
  });

  it("clamps a day-of-month past the end of a short month (e.g. 31 in February) rather than rolling into the next month", () => {
    const result = buildCourseEvents({
      course: baseCourse({
        startDate: TERM_START,
        endDate: "2026-03-25",
        weeklyChecklist: [monthlyItem({ deadline: { weekday: 0, time: null, frequency: "monthly", dayOfMonth: 31 } })],
      }),
    });
    const checklist = eventsOfKind(result, "checklist");
    const feb = checklist.find((e) => e.key === "checklist-item-1-m1")!;
    expect(feb.startISO).toBe("2026-02-28"); // 2026 is not a leap year
    const jan = checklist.find((e) => e.key === "checklist-item-1-m0")!;
    expect(jan.startISO).toBe("2026-01-31");
    // March's own unclamped occurrence (day 31 - March genuinely has 31 days)
    // is 2026-03-31, past the 2026-03-25 term end, so it is EXCLUDED entirely
    // rather than clamped a second time into the bound - see the dedicated
    // boundary test just below.
    expect(checklist.find((e) => e.key === "checklist-item-1-m2")).toBeUndefined();
  });

  it("excludes an occurrence that, after clamping, still falls outside the term bound", () => {
    // March's occurrence (day 31, unclamped, since March has 31 days) would
    // land on 2026-03-31 - past the 2026-03-25 term end - so it must be
    // excluded entirely, not clamped a second time into the bound.
    const result = buildCourseEvents({
      course: baseCourse({
        startDate: TERM_START,
        endDate: "2026-03-25",
        weeklyChecklist: [monthlyItem({ deadline: { weekday: 0, time: null, frequency: "monthly", dayOfMonth: 31 } })],
      }),
    });
    const checklist = eventsOfKind(result, "checklist");
    expect(checklist.find((e) => e.key === "checklist-item-1-m2")).toBeUndefined();
    expect(checklist).toHaveLength(2); // January and February only
  });

  it("excludes the occurrence in the term's first partial month, before startDate", () => {
    // startDate is Jan 5; a dayOfMonth of 1 resolves to Jan 1, which
    // precedes the start date and must be excluded from month index 0.
    const result = buildCourseEvents({
      course: baseCourse({
        startDate: TERM_START,
        endDate: "2026-03-25",
        weeklyChecklist: [monthlyItem({ deadline: { weekday: 0, time: null, frequency: "monthly", dayOfMonth: 1 } })],
      }),
    });
    const checklist = eventsOfKind(result, "checklist");
    expect(checklist.find((e) => e.key === "checklist-item-1-m0")).toBeUndefined();
    expect(checklistKeys(result)).toEqual(["checklist-item-1-m1", "checklist-item-1-m2"]);
  });

  it("produces an all-day event (exclusive end, +1 day) when the deadline has no time", () => {
    const result = buildCourseEvents({
      course: baseCourse({
        startDate: TERM_START,
        endDate: TERM_END,
        weeklyChecklist: [monthlyItem({ deadline: { weekday: 0, time: null, frequency: "monthly", dayOfMonth: 15 } })],
      }),
    });
    const [event] = eventsOfKind(result, "checklist");
    expect(event.allDay).toBe(true);
    expect(event.startISO).toBe("2026-01-15");
    expect(event.endISO).toBe("2026-01-16");
  });

  it("applies CHECKLIST_DONE_PREFIX to exactly the month the item was checked in, and no other month", () => {
    const checkedAt = new Date(2026, 1, 10, 10, 0, 0).getTime(); // Feb 10
    const result = buildCourseEvents({
      course: baseCourse({
        startDate: TERM_START,
        endDate: "2026-03-25",
        weeklyChecklist: [monthlyItem({ checked: true, checkedAt, deadline: { weekday: 0, time: "09:00", frequency: "monthly", dayOfMonth: 15 } })],
      }),
    });
    const checklist = eventsOfKind(result, "checklist");
    const jan = checklist.find((e) => e.key === "checklist-item-1-m0")!;
    const feb = checklist.find((e) => e.key === "checklist-item-1-m1")!;
    const mar = checklist.find((e) => e.key === "checklist-item-1-m2")!;
    expect(jan.summary.startsWith(CHECKLIST_DONE_PREFIX)).toBe(false);
    expect(feb.summary.startsWith(CHECKLIST_DONE_PREFIX)).toBe(true);
    expect(feb.summary).toBe(`${CHECKLIST_DONE_PREFIX}CS 101 - Submit attendance report`);
    expect(mar.summary.startsWith(CHECKLIST_DONE_PREFIX)).toBe(false);
  });

  it("re-timing the day of month within the SAME month keeps the same key (an update, not a delete+recreate)", () => {
    const before = buildCourseEvents({
      course: baseCourse({
        startDate: TERM_START,
        endDate: "2026-03-25",
        weeklyChecklist: [monthlyItem({ deadline: { weekday: 0, time: null, frequency: "monthly", dayOfMonth: 15 } })],
      }),
    });
    const after = buildCourseEvents({
      course: baseCourse({
        startDate: TERM_START,
        endDate: "2026-03-25",
        weeklyChecklist: [monthlyItem({ deadline: { weekday: 0, time: null, frequency: "monthly", dayOfMonth: 20 } })],
      }),
    });
    expect(checklistKeys(before)).toEqual(checklistKeys(after));

    const existing: ExistingEvent[] = eventsOfKind(before, "checklist").map((e, i) => ({ id: `g-${i}`, key: e.key }));
    const diff = diffPlannedEvents(eventsOfKind(after, "checklist"), existing);
    expect(diff.toCreate).toHaveLength(0);
    expect(diff.toDelete).toHaveLength(0);
    expect(diff.toUpdate).toHaveLength(3);
  });
});

describe("checklist event keys - daily/monthly recognition (AC6 idempotency)", () => {
  it("isRecognizedEventKey accepts a daily key and a monthly key", () => {
    expect(isRecognizedEventKey("checklist-item-1-d2026-01-13")).toBe(true);
    expect(isRecognizedEventKey("checklist-item-1-m0")).toBe(true);
    expect(isRecognizedEventKey("checklist-item-1-m12")).toBe(true);
  });

  it("isRecognizedEventKey rejects a malformed daily/monthly-looking key", () => {
    expect(isRecognizedEventKey("checklist-item-1-d2026-1-13")).toBe(false); // month not zero-padded
    expect(isRecognizedEventKey("checklist-item-1-daily")).toBe(false);
    expect(isRecognizedEventKey("checklist-item-1-m")).toBe(false);
    expect(isRecognizedEventKey("checklist-item-1-monthly")).toBe(false);
  });

  it("isChecklistEventKeyForItem matches a daily/monthly key to its own item id, and no other", () => {
    expect(isChecklistEventKeyForItem("checklist-item-1-d2026-01-13", "item-1")).toBe(true);
    expect(isChecklistEventKeyForItem("checklist-item-1-m3", "item-1")).toBe(true);
    expect(isChecklistEventKeyForItem("checklist-item-1-d2026-01-13", "item-2")).toBe(false);
    // A different item id that happens to be a literal string-prefix must
    // not falsely match - same guard buildChecklistEvents' own weekly/one-off
    // keys already rely on.
    expect(isChecklistEventKeyForItem("checklist-item-1-extra-d2026-01-13", "item-1")).toBe(false);
  });

  it("cleans up an item's OLD daily keys when it is switched to monthly, and vice versa", () => {
    const dailyCourse = baseCourse({
      startDate: TERM_START,
      endDate: TERM_END,
      weeklyChecklist: [dailyItem()],
    });
    const monthlyCourse = baseCourse({
      startDate: TERM_START,
      endDate: TERM_END,
      weeklyChecklist: [monthlyItem()],
    });

    const dailyPlanned = findAllChecklistItemEvents(dailyCourse, "item-1", new Date(2026, 0, 14));
    const monthlyPlanned = findAllChecklistItemEvents(monthlyCourse, "item-1");

    // Simulate "existing" as whatever the daily kind had already pushed to
    // the calendar, then diff against the item's NEW (monthly) planned set.
    const existing: ExistingEvent[] = dailyPlanned.map((e, i) => ({ id: `g-${i}`, key: e.key }));
    const diff = diffPlannedEvents(monthlyPlanned, existing);

    expect(diff.toDelete.sort()).toEqual(existing.map((e) => e.id).sort()); // every old daily key removed
    expect(diff.toCreate.map((e) => e.key)).toEqual(monthlyPlanned.map((e) => e.key)); // every new monthly key created
  });
});

describe("findAllChecklistItemEvents - daily/monthly", () => {
  it("finds a daily item's current-week occurrences, bounded to the current week (not the whole term)", () => {
    const course = baseCourse({ startDate: TERM_START, endDate: TERM_END, weeklyChecklist: [dailyItem()] });
    const found = findAllChecklistItemEvents(course, "item-1", new Date(2026, 0, 14));
    expect(found).toHaveLength(7);
    expect(found.every((e) => isChecklistEventKeyForItem(e.key, "item-1"))).toBe(true);
  });

  it("finds a monthly item's occurrences across the whole term", () => {
    const course = baseCourse({
      startDate: TERM_START,
      endDate: "2026-03-25",
      weeklyChecklist: [monthlyItem()],
    });
    const found = findAllChecklistItemEvents(course, "item-1");
    expect(found).toHaveLength(3);
  });

  it("returns nothing for an unknown item id", () => {
    const course = baseCourse({ startDate: TERM_START, endDate: TERM_END, weeklyChecklist: [dailyItem()] });
    expect(findAllChecklistItemEvents(course, "no-such-item", new Date(2026, 0, 14))).toEqual([]);
  });
});

describe("checklistCalendarBlockers - daily/monthly need the term bound", () => {
  it("reports missing-dates for a daily item with no start/end date", () => {
    const course = baseCourse({ startDate: null, endDate: null });
    expect(checklistCalendarBlockers(course, [dailyItem()], true)).toContain("missing-dates");
  });

  it("reports missing-dates for a monthly item with no start/end date", () => {
    const course = baseCourse({ startDate: null, endDate: null });
    expect(checklistCalendarBlockers(course, [monthlyItem()], true)).toContain("missing-dates");
  });

  it("does not report missing-dates once both dates are set", () => {
    const course = baseCourse({ startDate: TERM_START, endDate: TERM_END });
    expect(checklistCalendarBlockers(course, [dailyItem()], true)).not.toContain("missing-dates");
    expect(checklistCalendarBlockers(course, [monthlyItem()], true)).not.toContain("missing-dates");
  });
});

describe("buildCourseEvents - mixed frequencies in one course do not cross-contaminate", () => {
  it("produces the expected count and distinct keys for weekly + one-off + daily + monthly items together", () => {
    const result = buildCourseEvents({
      course: baseCourse({
        startDate: TERM_START,
        endDate: "2026-03-25",
        weeklyChecklist: [
          { id: "weekly-1", label: "Weekly", checked: false, checkedAt: null, deadline: { weekday: 3, time: "09:00" } },
          {
            id: "once-1",
            label: "Once",
            checked: false,
            checkedAt: null,
            deadline: { weekday: 0, time: null, date: "2026-02-10" },
          },
          dailyItem({ id: "daily-1" }),
          monthlyItem({ id: "monthly-1" }),
        ],
      }),
      today: new Date(2026, 0, 14),
    });

    const checklist = eventsOfKind(result, "checklist");
    const keys = checklist.map((e) => e.key);
    // No key collisions across kinds/items.
    expect(new Set(keys).size).toBe(keys.length);
    // Jan 5 - Mar 25, 2026 spans exactly 12 Wednesdays (Jan 7/14/21/28, Feb
    // 4/11/18/25, Mar 4/11/18/25) - hand-counted against the same
    // weekIndex-per-stepped-week arithmetic course-calendar-events.test.ts's
    // own "expands one timed event per week across the term" test verifies.
    expect(keys.filter((k) => k.startsWith("checklist-weekly-1-w"))).toHaveLength(12);
    expect(keys.filter((k) => k === "checklist-once-1-once")).toHaveLength(1);
    expect(keys.filter((k) => k.startsWith("checklist-daily-1-d"))).toHaveLength(7);
    expect(keys.filter((k) => k.startsWith("checklist-monthly-1-m"))).toHaveLength(3);
  });
});
