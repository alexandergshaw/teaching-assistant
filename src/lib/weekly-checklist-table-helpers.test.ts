import { describe, it, expect } from "vitest";
import {
  buildWeeklyChecklistOverviewRows,
  compareWeeklyChecklistRows,
  sortWeeklyChecklistRows,
  parseWeeklyChecklistSortState,
  formatWeeklyChecklistTime,
  DEFAULT_WEEKLY_CHECKLIST_SORT,
  type WeeklyChecklistOverviewRow,
  type WeeklyChecklistSortState,
} from "./weekly-checklist-table-helpers";
import type { Course } from "./supabase/courses";
import type { WeeklyChecklistItem } from "./weekly-checklist";
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

describe("compareWeeklyChecklistRows - weekday", () => {
  it("sorts ascending and descending by weekday number", () => {
    const sunday = row({ courseName: "A", label: "A", deadline: { weekday: 0, time: null } });
    const friday = row({ courseName: "B", label: "B", deadline: { weekday: 5, time: null } });
    expect(compareWeeklyChecklistRows(sunday, friday, sortState("weekday", "asc"))).toBeLessThan(0);
    expect(compareWeeklyChecklistRows(sunday, friday, sortState("weekday", "desc"))).toBeGreaterThan(0);
  });

  it("treats weekday 0 (Sunday) as a real value, not a missing one", () => {
    const sunday = row({ courseName: "A", label: "A", deadline: { weekday: 0, time: null } });
    const noDeadline = row({ courseName: "B", label: "B", deadline: null });
    // Sunday (a real, present value) sorts before "no deadline" (missing) in both directions.
    expect(compareWeeklyChecklistRows(sunday, noDeadline, sortState("weekday", "asc"))).toBeLessThan(0);
    expect(compareWeeklyChecklistRows(sunday, noDeadline, sortState("weekday", "desc"))).toBeLessThan(0);
  });

  it("sorts an item with no deadline last in both directions", () => {
    const withDeadline = row({ courseName: "A", label: "A", deadline: { weekday: 3, time: null } });
    const noDeadline = row({ courseName: "B", label: "B", deadline: null });
    expect(compareWeeklyChecklistRows(withDeadline, noDeadline, sortState("weekday", "asc"))).toBeLessThan(0);
    expect(compareWeeklyChecklistRows(withDeadline, noDeadline, sortState("weekday", "desc"))).toBeLessThan(0);
    expect(compareWeeklyChecklistRows(noDeadline, withDeadline, sortState("weekday", "asc"))).toBeGreaterThan(0);
    expect(compareWeeklyChecklistRows(noDeadline, withDeadline, sortState("weekday", "desc"))).toBeGreaterThan(0);
  });
});

describe("compareWeeklyChecklistRows - time", () => {
  it("sorts ascending and descending by clock time", () => {
    const early = row({ courseName: "A", label: "A", deadline: { weekday: 1, time: "08:00" } });
    const late = row({ courseName: "B", label: "B", deadline: { weekday: 1, time: "20:00" } });
    expect(compareWeeklyChecklistRows(early, late, sortState("time", "asc"))).toBeLessThan(0);
    expect(compareWeeklyChecklistRows(early, late, sortState("time", "desc"))).toBeGreaterThan(0);
  });

  it("sorts a deadline with no specific time ('by end of day') last in both directions", () => {
    const timed = row({ courseName: "A", label: "A", deadline: { weekday: 1, time: "08:00" } });
    const endOfDay = row({ courseName: "B", label: "B", deadline: { weekday: 1, time: null } });
    expect(compareWeeklyChecklistRows(timed, endOfDay, sortState("time", "asc"))).toBeLessThan(0);
    expect(compareWeeklyChecklistRows(timed, endOfDay, sortState("time", "desc"))).toBeLessThan(0);
  });

  it("sorts an item with no deadline at all last in both directions, same as end-of-day", () => {
    const timed = row({ courseName: "A", label: "A", deadline: { weekday: 1, time: "08:00" } });
    const noDeadline = row({ courseName: "B", label: "B", deadline: null });
    expect(compareWeeklyChecklistRows(timed, noDeadline, sortState("time", "asc"))).toBeLessThan(0);
    expect(compareWeeklyChecklistRows(timed, noDeadline, sortState("time", "desc"))).toBeLessThan(0);
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
    const a = row({ courseName: "Zeta", label: "A", deadline: null });
    const b = row({ courseName: "Alpha", label: "B", deadline: null });
    expect(compareWeeklyChecklistRows(a, b, sortState("weekday", "asc"))).toBeGreaterThan(0);
    expect(compareWeeklyChecklistRows(a, b, sortState("weekday", "desc"))).toBeGreaterThan(0);
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
    for (const field of ["course", "item", "weekday", "time", "checked", "overdue"] as const) {
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
});

// ---------------------------------------------------------------------------
// formatWeeklyChecklistTime
// ---------------------------------------------------------------------------

describe("formatWeeklyChecklistTime", () => {
  it("formats morning, noon, and midnight correctly", () => {
    expect(formatWeeklyChecklistTime("09:05")).toBe("9:05 AM");
    expect(formatWeeklyChecklistTime("12:00")).toBe("12:00 PM");
    expect(formatWeeklyChecklistTime("00:00")).toBe("12:00 AM");
  });

  it("formats afternoon/evening times correctly", () => {
    expect(formatWeeklyChecklistTime("23:59")).toBe("11:59 PM");
    expect(formatWeeklyChecklistTime("13:30")).toBe("1:30 PM");
  });
});
