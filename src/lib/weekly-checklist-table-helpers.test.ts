import { describe, it, expect } from "vitest";
import {
  buildWeeklyChecklistOverviewRows,
  compareWeeklyChecklistRows,
  sortWeeklyChecklistRows,
  parseWeeklyChecklistSortState,
  DEFAULT_WEEKLY_CHECKLIST_SORT,
  type WeeklyChecklistOverviewRow,
  type WeeklyChecklistSortState,
} from "./weekly-checklist-table-helpers";
import type { Course } from "./supabase/courses";
import {
  checklistDeadlineInstant,
  weeklyOccurrenceInstant,
  buildDailyChecklistDeadline,
  buildMonthlyChecklistDeadline,
  type WeeklyChecklistItem,
} from "./weekly-checklist";
import { emptyCourseProject } from "./course-project";

// A fixed instant: Wednesday, 2026-07-29 12:00:00 local time. Individual
// tests override this where the exact "now" matters (overdue math).
const NOW = new Date(2026, 6, 29, 12, 0, 0).getTime();

function makeItem(overrides: Partial<WeeklyChecklistItem> = {}): WeeklyChecklistItem {
  return {
    id: "item-1",
    label: "Reading",
    checked: false,
    checkedAt: null,
    deadline: null,
    ...overrides,
  };
}

function makeCourse(overrides: Partial<Course> = {}): Course {
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
    weeklyChecklist: [],
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function row(overrides: Partial<WeeklyChecklistOverviewRow> = {}): WeeklyChecklistOverviewRow {
  return {
    key: "course-1:item-1",
    courseId: "course-1",
    courseName: "CS 101",
    itemId: "item-1",
    label: "Reading",
    deadline: null,
    checked: false,
    overdue: false,
    whenInstant: null,
    ...overrides,
  };
}

function sortState(field: WeeklyChecklistSortState["field"], direction: WeeklyChecklistSortState["direction"]): WeeklyChecklistSortState {
  return { field, direction };
}

// ---------------------------------------------------------------------------
// buildWeeklyChecklistOverviewRows (flattening)
// ---------------------------------------------------------------------------

describe("buildWeeklyChecklistOverviewRows", () => {
  it("flattens every course's items into one row per item, across all courses", () => {
    const courses = [
      makeCourse({ id: "c1", name: "CS 101", weeklyChecklist: [makeItem({ id: "i1", label: "Reading" }), makeItem({ id: "i2", label: "Quiz" })] }),
      makeCourse({ id: "c2", name: "MATH 200", weeklyChecklist: [makeItem({ id: "i3", label: "Problem set" })] }),
    ];

    const rows = buildWeeklyChecklistOverviewRows(courses, NOW);

    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.key)).toEqual(["c1:i1", "c1:i2", "c2:i3"]);
    expect(rows.every((r) => r.courseId === "c1" || r.courseId === "c2")).toBe(true);
  });

  it("a course with no items contributes zero rows, not a placeholder", () => {
    const courses = [makeCourse({ id: "c1", weeklyChecklist: [] }), makeCourse({ id: "c2", weeklyChecklist: [makeItem({ id: "i1" })] })];
    const rows = buildWeeklyChecklistOverviewRows(courses, NOW);
    expect(rows).toHaveLength(1);
    expect(rows[0].courseId).toBe("c2");
  });

  it("a course whose weeklyChecklist is undefined (never coerced through toCourse) contributes zero rows, not a crash", () => {
    const courses = [makeCourse({ id: "c1", weeklyChecklist: undefined })];
    expect(buildWeeklyChecklistOverviewRows(courses, NOW)).toEqual([]);
  });

  it("carries the item's own courseName, label, deadline and checked state onto the row", () => {
    const courses = [
      makeCourse({
        id: "c1",
        name: "CS 101",
        weeklyChecklist: [makeItem({ id: "i1", label: "Reading", checked: true, deadline: { weekday: 2, time: "09:00" } })],
      }),
    ];
    const [r] = buildWeeklyChecklistOverviewRows(courses, NOW);
    expect(r.courseName).toBe("CS 101");
    expect(r.label).toBe("Reading");
    expect(r.checked).toBe(true);
    expect(r.deadline).toEqual({ weekday: 2, time: "09:00" });
  });

  it("preserves which course each item came from when two courses share an item label", () => {
    const courses = [
      makeCourse({ id: "c1", name: "CS 101", weeklyChecklist: [makeItem({ id: "i1", label: "Reading" })] }),
      makeCourse({ id: "c2", name: "MATH 200", weeklyChecklist: [makeItem({ id: "i2", label: "Reading" })] }),
    ];
    const rows = buildWeeklyChecklistOverviewRows(courses, NOW);
    expect(rows.find((r) => r.courseId === "c1")?.label).toBe("Reading");
    expect(rows.find((r) => r.courseId === "c2")?.label).toBe("Reading");
    expect(rows.map((r) => r.courseName).sort()).toEqual(["CS 101", "MATH 200"]);
  });

  // Overdue rule (AC2/AC8): an item is overdue only when unchecked, has a
  // deadline, and this week's occurrence of that deadline has passed.
  describe("overdue computation", () => {
    it("marks an unchecked item overdue once this week's deadline instant has passed", () => {
      // NOW is Wednesday. Monday (weekday 1) at 09:00 has already passed this week.
      const courses = [makeCourse({ weeklyChecklist: [makeItem({ deadline: { weekday: 1, time: "09:00" } })] })];
      const [r] = buildWeeklyChecklistOverviewRows(courses, NOW);
      expect(r.overdue).toBe(true);
    });

    it("does not mark an item overdue when its deadline this week has not yet arrived", () => {
      // Friday (weekday 5) has not happened yet as of Wednesday.
      const courses = [makeCourse({ weeklyChecklist: [makeItem({ deadline: { weekday: 5, time: "09:00" } })] })];
      const [r] = buildWeeklyChecklistOverviewRows(courses, NOW);
      expect(r.overdue).toBe(false);
    });

    it("a checked item is never overdue, even past its deadline (checked state is persistent)", () => {
      const courses = [makeCourse({ weeklyChecklist: [makeItem({ checked: true, deadline: { weekday: 1, time: "09:00" } })] })];
      const [r] = buildWeeklyChecklistOverviewRows(courses, NOW);
      expect(r.overdue).toBe(false);
    });

    it("an item with no deadline is never overdue", () => {
      const courses = [makeCourse({ weeklyChecklist: [makeItem({ deadline: null })] })];
      const [r] = buildWeeklyChecklistOverviewRows(courses, NOW);
      expect(r.overdue).toBe(false);
    });
  });

  // The Overview window's "checked" field must reflect the PER-PERIOD check
  // for a daily/monthly item (isChecklistItemCheckedNow), not the raw stored
  // flag - otherwise the window's Done/Open badge, "Hide completed" filter,
  // and "checked" sort column would all keep showing a daily item as
  // permanently done. Weekly/one-off/none items are unaffected (see
  // isChecklistItemCheckedNow's own persistent-by-default rule).
  describe("checked computation (period-aware for daily/monthly)", () => {
    it("reports a daily item's raw-checked-yesterday flag as NOT checked today", () => {
      const yesterday = new Date(2026, 6, 28, 9, 0, 0).getTime(); // Tuesday, the day before NOW (Wed)
      const courses = [
        makeCourse({
          weeklyChecklist: [makeItem({ checked: true, checkedAt: yesterday, deadline: buildDailyChecklistDeadline(null) })],
        }),
      ];
      const [r] = buildWeeklyChecklistOverviewRows(courses, NOW);
      expect(r.checked).toBe(false);
    });

    it("reports a daily item checked earlier the SAME day as checked", () => {
      const earlierToday = new Date(2026, 6, 29, 6, 0, 0).getTime(); // same calendar day as NOW
      const courses = [
        makeCourse({
          weeklyChecklist: [
            makeItem({ checked: true, checkedAt: earlierToday, deadline: buildDailyChecklistDeadline(null) }),
          ],
        }),
      ];
      const [r] = buildWeeklyChecklistOverviewRows(courses, NOW);
      expect(r.checked).toBe(true);
    });

    it("reports a monthly item checked last month as NOT checked this month", () => {
      const lastMonth = new Date(2026, 5, 15, 9, 0, 0).getTime(); // June, NOW is July
      const courses = [
        makeCourse({
          weeklyChecklist: [
            makeItem({ checked: true, checkedAt: lastMonth, deadline: buildMonthlyChecklistDeadline(15, null) }),
          ],
        }),
      ];
      const [r] = buildWeeklyChecklistOverviewRows(courses, NOW);
      expect(r.checked).toBe(false);
    });

    it("leaves a weekly item's raw-checked-days-ago flag reported as checked (persistent, unlike daily/monthly)", () => {
      const daysAgo = new Date(2026, 6, 20, 9, 0, 0).getTime();
      const courses = [
        makeCourse({
          weeklyChecklist: [makeItem({ checked: true, checkedAt: daysAgo, deadline: { weekday: 1, time: null } })],
        }),
      ];
      const [r] = buildWeeklyChecklistOverviewRows(courses, NOW);
      expect(r.checked).toBe(true);
    });
  });

  // AC6: whenInstant backs the merged "When" column - see
  // WeeklyChecklistOverviewRow's own doc comment for why it exists.
  describe("whenInstant computation", () => {
    it("computes whenInstant for a recurring deadline via checklistDeadlineInstant (this week's occurrence)", () => {
      const deadline = { weekday: 1, time: "09:00" }; // Monday this week
      const courses = [makeCourse({ weeklyChecklist: [makeItem({ deadline })] })];
      const [r] = buildWeeklyChecklistOverviewRows(courses, NOW);
      expect(r.whenInstant).toBe(weeklyOccurrenceInstant(deadline, NOW));
      expect(r.whenInstant).toBe(checklistDeadlineInstant(deadline, NOW));
    });

    it("computes whenInstant for a one-off deadline via its own fixed date, ignoring NOW", () => {
      const deadline = { weekday: 0, time: "17:00", date: "2026-08-15" };
      const courses = [makeCourse({ weeklyChecklist: [makeItem({ deadline })] })];
      const [r] = buildWeeklyChecklistOverviewRows(courses, NOW);
      expect(r.whenInstant).toBe(checklistDeadlineInstant(deadline, NOW));
      expect(new Date(r.whenInstant as number)).toEqual(new Date(2026, 7, 15, 17, 0, 0, 0));
    });

    it("is null when the item has no deadline at all - the only empty case for the 'when' column", () => {
      const courses = [makeCourse({ weeklyChecklist: [makeItem({ deadline: null })] })];
      const [r] = buildWeeklyChecklistOverviewRows(courses, NOW);
      expect(r.whenInstant).toBeNull();
    });

    it("is a real (non-null) instant even for a deadline with no specific time - 'end of day' is a real instant, not an empty one", () => {
      const deadline = { weekday: 3, time: null };
      const courses = [makeCourse({ weeklyChecklist: [makeItem({ deadline })] })];
      const [r] = buildWeeklyChecklistOverviewRows(courses, NOW);
      expect(r.whenInstant).not.toBeNull();
      expect(r.whenInstant).toBe(checklistDeadlineInstant(deadline, NOW));
    });
  });
});

// ---------------------------------------------------------------------------
// compareWeeklyChecklistRows / sortWeeklyChecklistRows
// ---------------------------------------------------------------------------

describe("compareWeeklyChecklistRows - course", () => {
  it("sorts ascending and descending alphabetically by course name", () => {
    const a = row({ courseName: "Zeta", label: "A" });
    const b = row({ courseName: "Alpha", label: "B" });
    expect(compareWeeklyChecklistRows(a, b, sortState("course", "asc"))).toBeGreaterThan(0);
    expect(compareWeeklyChecklistRows(a, b, sortState("course", "desc"))).toBeLessThan(0);
  });
});

describe("compareWeeklyChecklistRows - item", () => {
  it("sorts ascending and descending alphabetically by label", () => {
    const a = row({ courseName: "A", label: "Zebra" });
    const b = row({ courseName: "A", label: "Apple" });
    expect(compareWeeklyChecklistRows(a, b, sortState("item", "asc"))).toBeGreaterThan(0);
    expect(compareWeeklyChecklistRows(a, b, sortState("item", "desc"))).toBeLessThan(0);
  });
});

// AC6: "weekday" and "time" were retired as separate sort columns in favor
// of a single "when" column, driven by whenInstant (epoch ms) rather than
// the raw deadline shape - see WeeklyChecklistOverviewRow.whenInstant's own
// doc comment for why a weekday number and a one-off date could never be
// honestly compared as two separate columns.
describe("compareWeeklyChecklistRows - when", () => {
  it("sorts ascending and descending by whenInstant", () => {
    const sooner = row({ courseName: "A", label: "A", whenInstant: 1_000 });
    const later = row({ courseName: "B", label: "B", whenInstant: 2_000 });
    expect(compareWeeklyChecklistRows(sooner, later, sortState("when", "asc"))).toBeLessThan(0);
    expect(compareWeeklyChecklistRows(sooner, later, sortState("when", "desc"))).toBeGreaterThan(0);
  });

  it("treats an instant of epoch 0 as a real value, not a missing one - only a null whenInstant is empty", () => {
    const epoch = row({ courseName: "A", label: "A", whenInstant: 0 });
    const noDeadline = row({ courseName: "B", label: "B", whenInstant: null });
    expect(compareWeeklyChecklistRows(epoch, noDeadline, sortState("when", "asc"))).toBeLessThan(0);
    expect(compareWeeklyChecklistRows(epoch, noDeadline, sortState("when", "desc"))).toBeLessThan(0);
  });

  it("sorts an item with no deadline (whenInstant null) last in both directions", () => {
    const withDeadline = row({ courseName: "A", label: "A", whenInstant: 1_000 });
    const noDeadline = row({ courseName: "B", label: "B", whenInstant: null });
    expect(compareWeeklyChecklistRows(withDeadline, noDeadline, sortState("when", "asc"))).toBeLessThan(0);
    expect(compareWeeklyChecklistRows(withDeadline, noDeadline, sortState("when", "desc"))).toBeLessThan(0);
    expect(compareWeeklyChecklistRows(noDeadline, withDeadline, sortState("when", "asc"))).toBeGreaterThan(0);
    expect(compareWeeklyChecklistRows(noDeadline, withDeadline, sortState("when", "desc"))).toBeGreaterThan(0);
  });

  it("ranks a recurring item's this-week occurrence against a one-off item's own date on one shared timeline", () => {
    const recurringDeadline = { weekday: 1, time: "09:00" }; // Monday this week (2026-07-27)
    const oneOffDeadline = { weekday: 0, time: "09:00", date: "2026-08-15" }; // weeks later
    const recurringRow = row({
      courseName: "A",
      label: "A",
      deadline: recurringDeadline,
      whenInstant: checklistDeadlineInstant(recurringDeadline, NOW),
    });
    const oneOffRow = row({
      courseName: "B",
      label: "B",
      deadline: oneOffDeadline,
      whenInstant: checklistDeadlineInstant(oneOffDeadline, NOW),
    });
    expect(compareWeeklyChecklistRows(recurringRow, oneOffRow, sortState("when", "asc"))).toBeLessThan(0);
    expect(compareWeeklyChecklistRows(recurringRow, oneOffRow, sortState("when", "desc"))).toBeGreaterThan(0);
  });
});

describe("compareWeeklyChecklistRows - checked", () => {
  it("sorts open (not yet done) before done ascending, and the reverse descending", () => {
    const open = row({ courseName: "A", label: "A", checked: false });
    const done = row({ courseName: "B", label: "B", checked: true });
    expect(compareWeeklyChecklistRows(open, done, sortState("checked", "asc"))).toBeLessThan(0);
    expect(compareWeeklyChecklistRows(open, done, sortState("checked", "desc"))).toBeGreaterThan(0);
  });
});

describe("compareWeeklyChecklistRows - overdue", () => {
  it("sorts overdue before not-overdue ascending, and the reverse descending", () => {
    const overdue = row({ courseName: "A", label: "A", overdue: true });
    const onTrack = row({ courseName: "B", label: "B", overdue: false });
    expect(compareWeeklyChecklistRows(overdue, onTrack, sortState("overdue", "asc"))).toBeLessThan(0);
    expect(compareWeeklyChecklistRows(overdue, onTrack, sortState("overdue", "desc"))).toBeGreaterThan(0);
  });
});

describe("compareWeeklyChecklistRows - stability", () => {
  it("breaks a tie on the sorted field by course name, then item label, regardless of direction", () => {
    const a = row({ courseName: "Zeta", label: "A", checked: false });
    const b = row({ courseName: "Alpha", label: "B", checked: false });
    expect(compareWeeklyChecklistRows(a, b, sortState("checked", "asc"))).toBeGreaterThan(0);
    expect(compareWeeklyChecklistRows(a, b, sortState("checked", "desc"))).toBeGreaterThan(0);
  });

  it("within the same course, breaks a tie by item label", () => {
    const a = row({ courseName: "CS 101", label: "Zebra", checked: false });
    const b = row({ courseName: "CS 101", label: "Apple", checked: false });
    expect(compareWeeklyChecklistRows(a, b, sortState("checked", "asc"))).toBeGreaterThan(0);
  });

  it("two rows that are both missing the sorted value still tie-break deterministically", () => {
    const a = row({ courseName: "Zeta", label: "A", whenInstant: null });
    const b = row({ courseName: "Alpha", label: "B", whenInstant: null });
    expect(compareWeeklyChecklistRows(a, b, sortState("when", "asc"))).toBeGreaterThan(0);
    expect(compareWeeklyChecklistRows(a, b, sortState("when", "desc"))).toBeGreaterThan(0);
  });

  it("sortWeeklyChecklistRows produces a fully deterministic order for equal-key rows", () => {
    const rows = [
      row({ courseName: "Charlie", label: "X", checked: false }),
      row({ courseName: "Alpha", label: "X", checked: false }),
      row({ courseName: "Bravo", label: "X", checked: false }),
    ];
    const sorted = sortWeeklyChecklistRows(rows, sortState("checked", "asc"));
    expect(sorted.map((r) => r.courseName)).toEqual(["Alpha", "Bravo", "Charlie"]);
  });
});

describe("sortWeeklyChecklistRows", () => {
  it("does not mutate the input array", () => {
    const rows = [row({ courseName: "Beta" }), row({ courseName: "Alpha" })];
    const original = [...rows];
    sortWeeklyChecklistRows(rows, sortState("course", "asc"));
    expect(rows).toEqual(original);
  });
});

// ---------------------------------------------------------------------------
// parseWeeklyChecklistSortState
// ---------------------------------------------------------------------------

describe("parseWeeklyChecklistSortState", () => {
  it("parses a valid persisted value for every sortable field", () => {
    for (const field of ["course", "item", "when", "checked", "overdue"] as const) {
      const stored = JSON.stringify({ field, direction: "desc" });
      expect(parseWeeklyChecklistSortState(stored)).toEqual({ field, direction: "desc" });
    }
  });

  it("falls back to the default for an unrecognized column", () => {
    const stored = JSON.stringify({ field: "notARealColumn", direction: "asc" });
    expect(parseWeeklyChecklistSortState(stored)).toEqual(DEFAULT_WEEKLY_CHECKLIST_SORT);
  });

  it("falls back to the default for an unrecognized direction", () => {
    const stored = JSON.stringify({ field: "course", direction: "sideways" });
    expect(parseWeeklyChecklistSortState(stored)).toEqual(DEFAULT_WEEKLY_CHECKLIST_SORT);
  });

  it("falls back to the default for corrupt JSON", () => {
    expect(parseWeeklyChecklistSortState("{not json")).toEqual(DEFAULT_WEEKLY_CHECKLIST_SORT);
  });

  it("falls back to the default for null/empty input", () => {
    expect(parseWeeklyChecklistSortState(null)).toEqual(DEFAULT_WEEKLY_CHECKLIST_SORT);
    expect(parseWeeklyChecklistSortState(undefined)).toEqual(DEFAULT_WEEKLY_CHECKLIST_SORT);
    expect(parseWeeklyChecklistSortState("")).toEqual(DEFAULT_WEEKLY_CHECKLIST_SORT);
  });

  it("falls back to the default for a well-formed but wrong-shaped value", () => {
    expect(parseWeeklyChecklistSortState(JSON.stringify(["course", "asc"]))).toEqual(DEFAULT_WEEKLY_CHECKLIST_SORT);
    expect(parseWeeklyChecklistSortState(JSON.stringify({ field: "course" }))).toEqual(DEFAULT_WEEKLY_CHECKLIST_SORT);
  });

  // AC6: a sort persisted before the "weekday"/"time" -> "when" column merge
  // must migrate gracefully rather than crash or silently misbehave - see
  // this function's own doc comment (weekly-checklist-table-helpers.ts) for
  // why this falls out of the existing WEEKLY_CHECKLIST_SORT_FIELDS.includes
  // check with no separate migration code path, and why that is still worth
  // pinning down with an explicit test.
  describe("retired-field migration", () => {
    it("falls back to the default for a sort persisted against the retired 'weekday' column", () => {
      const stored = JSON.stringify({ field: "weekday", direction: "asc" });
      expect(parseWeeklyChecklistSortState(stored)).toEqual(DEFAULT_WEEKLY_CHECKLIST_SORT);
    });

    it("falls back to the default for a sort persisted against the retired 'time' column", () => {
      const stored = JSON.stringify({ field: "time", direction: "desc" });
      expect(parseWeeklyChecklistSortState(stored)).toEqual(DEFAULT_WEEKLY_CHECKLIST_SORT);
    });
  });
});
