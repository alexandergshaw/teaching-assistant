import { describe, it, expect } from "vitest";
import { emptyCourseProject } from "@/lib/course-project";
import {
  buildCourseEvents,
  diffPlannedEvents,
  isRecognizedEventKey,
  sundayOfWeek,
  findCurrentWeekChecklistEvent,
  CHECKLIST_DONE_PREFIX,
  type PlannedEvent,
  type ExistingEvent,
} from "./course-calendar-events";
import type { Course } from "@/lib/supabase/courses";
import type { WeeklyChecklistItem } from "@/lib/weekly-checklist";

// 2026-01-05 is a Monday - picked so every date-math test below can be
// hand-verified without a calendar in hand. 2026-01-04, the day before, is a
// Sunday (verified against weekly-checklist.test.ts's own anchor comment) -
// the Sunday that begins MONDAY's own calendar week; used directly (as
// `new Date(2026, 0, 4)`) in the sundayOfWeek tests below.
const MONDAY = "2026-01-05";

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

function checklistItem(overrides: Partial<WeeklyChecklistItem> = {}): WeeklyChecklistItem {
  return {
    id: "item-1",
    label: "Grade discussion posts",
    checked: false,
    checkedAt: null,
    deadline: { weekday: 3, time: "09:00" }, // Wednesday 09:00
    ...overrides,
  };
}

function checklistKeys(result: { events: PlannedEvent[] }): string[] {
  return eventsOfKind(result, "checklist")
    .map((e) => e.key)
    .sort();
}

describe("buildCourseEvents - term", () => {
  it("emits one all-day event spanning startDate through endDate, end exclusive (+1 day)", () => {
    const course = baseCourse({ startDate: MONDAY, endDate: "2026-01-20" });
    const result = buildCourseEvents({ course });
    const term = eventsOfKind(result, "term");
    expect(term).toHaveLength(1);
    expect(term[0]).toMatchObject({
      key: "term",
      kind: "term",
      allDay: true,
      startISO: "2026-01-05",
      endISO: "2026-01-21", // one day after endDate - the off-by-one this AC calls out
    });
  });

  it("uses courseCode when set, falling back to name otherwise", () => {
    const withCode = buildCourseEvents({
      course: baseCourse({ startDate: MONDAY, endDate: "2026-01-20", courseCode: "CS 101", name: "Intro" }),
    });
    expect(eventsOfKind(withCode, "term")[0].summary).toBe("CS 101 - term");

    const withoutCode = buildCourseEvents({
      course: baseCourse({ startDate: MONDAY, endDate: "2026-01-20", courseCode: "   ", name: "Intro to CS" }),
    });
    expect(eventsOfKind(withoutCode, "term")[0].summary).toBe("Intro to CS - term");
  });

  it("skips with a note when startDate is missing", () => {
    const result = buildCourseEvents({ course: baseCourse({ startDate: null, endDate: "2026-01-20" }) });
    expect(eventsOfKind(result, "term")).toHaveLength(0);
    expect(result.notes).toContain("no start date or end date set - the term event was skipped");
  });

  it("skips with a note when endDate is missing", () => {
    const result = buildCourseEvents({ course: baseCourse({ startDate: MONDAY, endDate: null }) });
    expect(eventsOfKind(result, "term")).toHaveLength(0);
    expect(result.notes).toContain("no start date or end date set - the term event was skipped");
  });
});

describe("buildCourseEvents - meeting", () => {
  it("skips ALL meetings with the exact note when classLengthMinutes is missing", () => {
    const result = buildCourseEvents({
      course: baseCourse({ startDate: MONDAY, weeks: 3, dayTime: "M/W/F 10:00am", classLengthMinutes: null }),
    });
    expect(eventsOfKind(result, "meeting")).toHaveLength(0);
    expect(result.notes).toContain("no class length set - class meetings skipped");
  });

  it("does not invent a default duration for a zero or negative classLengthMinutes", () => {
    const zero = buildCourseEvents({
      course: baseCourse({ startDate: MONDAY, weeks: 1, dayTime: "M 10:00am", classLengthMinutes: 0 }),
    });
    expect(eventsOfKind(zero, "meeting")).toHaveLength(0);
    expect(zero.notes).toContain("no class length set - class meetings skipped");

    const negative = buildCourseEvents({
      course: baseCourse({ startDate: MONDAY, weeks: 1, dayTime: "M 10:00am", classLengthMinutes: -10 }),
    });
    expect(eventsOfKind(negative, "meeting")).toHaveLength(0);
  });

  it("skips with a note naming dayTime when parseDayTime returns null", () => {
    const result = buildCourseEvents({
      course: baseCourse({ startDate: MONDAY, weeks: 3, dayTime: "Xyz 10:00am", classLengthMinutes: 75 }),
    });
    expect(eventsOfKind(result, "meeting")).toHaveLength(0);
    expect(result.notes.some((n) => n.includes("dayTime"))).toBe(true);
  });

  it("skips with a note naming dayTime when course.dayTime is blank", () => {
    const result = buildCourseEvents({
      course: baseCourse({ startDate: MONDAY, weeks: 3, dayTime: null, classLengthMinutes: 75 }),
    });
    expect(eventsOfKind(result, "meeting")).toHaveLength(0);
    expect(result.notes.some((n) => n.includes("dayTime"))).toBe(true);
  });

  it("skips with a note when startDate is missing", () => {
    const result = buildCourseEvents({
      course: baseCourse({ startDate: null, weeks: 3, dayTime: "M/W/F 10:00am", classLengthMinutes: 75 }),
    });
    expect(eventsOfKind(result, "meeting")).toHaveLength(0);
    expect(result.notes).toContain("no start date or number of weeks set - class meetings skipped");
  });

  it("skips with a note when weeks is missing or non-positive", () => {
    const missing = buildCourseEvents({
      course: baseCourse({ startDate: MONDAY, weeks: null, dayTime: "M/W/F 10:00am", classLengthMinutes: 75 }),
    });
    expect(eventsOfKind(missing, "meeting")).toHaveLength(0);

    const zeroWeeks = buildCourseEvents({
      course: baseCourse({ startDate: MONDAY, weeks: 0, dayTime: "M/W/F 10:00am", classLengthMinutes: 75 }),
    });
    expect(eventsOfKind(zeroWeeks, "meeting")).toHaveLength(0);
  });

  it("reports every applicable skip reason independently when several are broken at once", () => {
    const result = buildCourseEvents({
      course: baseCourse({ startDate: null, weeks: null, dayTime: null, classLengthMinutes: null }),
    });
    expect(result.notes).toContain("no start date or number of weeks set - class meetings skipped");
    expect(result.notes).toContain("no class length set - class meetings skipped");
    expect(result.notes.some((n) => n.includes("dayTime"))).toBe(true);
  });

  it("emits one timed event per class session, across multiple weekdays and weeks", () => {
    const result = buildCourseEvents({
      course: baseCourse({ startDate: MONDAY, weeks: 2, dayTime: "M/W/F 10:00am", classLengthMinutes: 75 }),
    });
    const meetings = eventsOfKind(result, "meeting");
    expect(meetings).toHaveLength(6); // 2 weeks x 3 weekdays

    const keys = meetings.map((m) => m.key).sort();
    expect(keys).toEqual(
      ["meeting-w1-d1", "meeting-w1-d3", "meeting-w1-d5", "meeting-w2-d1", "meeting-w2-d3", "meeting-w2-d5"].sort()
    );

    const week1Monday = meetings.find((m) => m.key === "meeting-w1-d1")!;
    expect(week1Monday.startISO).toBe("2026-01-05T10:00:00");
    expect(week1Monday.endISO).toBe("2026-01-05T11:15:00"); // +75 minutes
    expect(week1Monday.summary).toBe("CS 101"); // courseCode-or-name, no suffix
    expect(week1Monday.allDay).toBe(false);

    const week2Friday = meetings.find((m) => m.key === "meeting-w2-d5")!;
    expect(week2Friday.startISO).toBe("2026-01-16T10:00:00");
  });
});

describe("buildCourseEvents - test", () => {
  it("places one all-day event per deriveTestWeeks result, on the earliest class day of that week", () => {
    const result = buildCourseEvents({
      course: baseCourse({ startDate: MONDAY, weeks: 4, tests: 2, dayTime: "M/W/F 10:00am" }),
    });
    const tests = eventsOfKind(result, "test");
    expect(tests).toHaveLength(2); // deriveTestWeeks(4, 2) -> [2, 4]

    const test1 = tests.find((t) => t.key === "test-1")!;
    expect(test1.startISO).toBe("2026-01-12"); // Monday of week 2 (earliest of M/W/F)
    expect(test1.endISO).toBe("2026-01-13"); // all-day end is exclusive here too
    expect(test1.allDay).toBe(true);
    expect(test1.summary).toBe("CS 101 - Test 1");

    const test2 = tests.find((t) => t.key === "test-2")!;
    expect(test2.startISO).toBe("2026-01-26"); // Monday of week 4
  });

  it("says the dates are derived/estimated, never implying an authored source", () => {
    const result = buildCourseEvents({
      course: baseCourse({ startDate: MONDAY, weeks: 4, tests: 1, dayTime: "M/W/F 10:00am" }),
    });
    const [test1] = eventsOfKind(result, "test");
    expect(test1.description).toBe(
      "Estimated: tests are spaced evenly across the term. Adjust as needed."
    );
  });

  it("falls back to the week's Monday when dayTime does not parse", () => {
    const result = buildCourseEvents({
      course: baseCourse({ startDate: MONDAY, weeks: 4, tests: 1, dayTime: "Xyz 10:00am" }),
    });
    const [test1] = eventsOfKind(result, "test");
    expect(test1.startISO).toBe("2026-01-26"); // Monday of week 4 (deriveTestWeeks(4,1) -> [4])
  });

  it("emits zero test events (no note) when tests is null or zero", () => {
    const nullTests = buildCourseEvents({ course: baseCourse({ startDate: MONDAY, weeks: 4, tests: null }) });
    expect(eventsOfKind(nullTests, "test")).toHaveLength(0);

    const zeroTests = buildCourseEvents({ course: baseCourse({ startDate: MONDAY, weeks: 4, tests: 0 }) });
    expect(eventsOfKind(zeroTests, "test")).toHaveLength(0);
  });

  it("skips with a note when startDate or weeks is missing", () => {
    const result = buildCourseEvents({ course: baseCourse({ startDate: null, weeks: 4, tests: 2 }) });
    expect(eventsOfKind(result, "test")).toHaveLength(0);
    expect(result.notes).toContain("no start date or number of weeks set - test events skipped");
  });
});

describe("buildCourseEvents - due", () => {
  it("emits a 30-minute timed event per week at dueDateForWeek(start, week, rule)", () => {
    const result = buildCourseEvents({
      course: baseCourse({ startDate: MONDAY, weeks: 2, assignmentDueRule: "sun|23:59" }),
    });
    const due = eventsOfKind(result, "due");
    expect(due).toHaveLength(2);

    const week1 = due.find((d) => d.key === "due-w1")!;
    expect(week1.startISO).toBe("2026-01-11T23:59:00"); // Sunday ending week 1
    expect(week1.endISO).toBe("2026-01-12T00:29:00"); // +30 minutes, rolls to the next day
    expect(week1.summary).toBe("CS 101 - Week 1 assignment due");
    expect(week1.allDay).toBe(false);

    const week2 = due.find((d) => d.key === "due-w2")!;
    expect(week2.startISO).toBe("2026-01-18T23:59:00");
  });

  it("skips all with a note when the rule is absent", () => {
    const result = buildCourseEvents({
      course: baseCourse({ startDate: MONDAY, weeks: 2, assignmentDueRule: null }),
    });
    expect(eventsOfKind(result, "due")).toHaveLength(0);
    expect(result.notes).toContain("no assignment due rule set - weekly due-date events skipped");
  });

  it("skips all with a note when the rule is unparseable", () => {
    const result = buildCourseEvents({
      course: baseCourse({ startDate: MONDAY, weeks: 2, assignmentDueRule: "garbage" }),
    });
    expect(eventsOfKind(result, "due")).toHaveLength(0);
    expect(result.notes).toContain("no assignment due rule set - weekly due-date events skipped");
  });

  it("skips with a note when startDate or weeks is missing (rule present)", () => {
    const result = buildCourseEvents({
      course: baseCourse({ startDate: null, weeks: null, assignmentDueRule: "sun|23:59" }),
    });
    expect(eventsOfKind(result, "due")).toHaveLength(0);
    expect(result.notes).toContain("no start date or number of weeks set - weekly due-date events skipped");
  });
});

describe("buildCourseEvents - breaks", () => {
  it("adds the exact annotation-only note when breaks is non-empty", () => {
    const result = buildCourseEvents({ course: baseCourse({ breaks: "Week 8 - Spring Break" }) });
    expect(result.notes).toContain(
      "breaks are recorded on the tile but are not applied to calendar events"
    );
  });

  it("does not add a breaks note when breaks is null or whitespace-only", () => {
    const nullBreaks = buildCourseEvents({ course: baseCourse({ breaks: null }) });
    expect(nullBreaks.notes.some((n) => n.includes("breaks"))).toBe(false);

    const blankBreaks = buildCourseEvents({ course: baseCourse({ breaks: "   " }) });
    expect(blankBreaks.notes.some((n) => n.includes("breaks"))).toBe(false);
  });

  it("does not shift week numbering or skip any week's events", () => {
    // AC: breaks are annotation-only - a course with a break recorded still
    // gets every week's due event, unshifted.
    const result = buildCourseEvents({
      course: baseCourse({ startDate: MONDAY, weeks: 3, assignmentDueRule: "sun|23:59", breaks: "Week 2 - Break" }),
    });
    const dueWeeks = eventsOfKind(result, "due").map((d) => d.key).sort();
    expect(dueWeeks).toEqual(["due-w1", "due-w2", "due-w3"]);
  });
});

// A 3-week term, Sunday-bounded on both ends (Jan 4 is a Sunday, so Jan 5
// (Monday) starts the term's first week and Jan 25 (also a Sunday) ends its
// last), so every weekday's occurrence count within the term can be
// hand-verified: Jan 7/14/21 (Wednesdays), Jan 11/18/25 (Sundays - the first,
// Jan 4, falls one day before the term starts and is excluded), Jan
// 10/17/24 (Saturdays - the fourth, Jan 31, falls after the term ends and is
// excluded).
const CHECKLIST_TERM_START = MONDAY; // 2026-01-05
const CHECKLIST_TERM_END = "2026-01-25";

describe("buildCourseEvents - checklist", () => {
  it("emits nothing and adds no note when there is no weekly checklist at all", () => {
    const result = buildCourseEvents({
      course: baseCourse({ startDate: CHECKLIST_TERM_START, endDate: CHECKLIST_TERM_END }),
    });
    expect(eventsOfKind(result, "checklist")).toHaveLength(0);
    expect(result.notes.some((n) => n.includes("checklist"))).toBe(false);
  });

  it("emits nothing for an item with no deadline - AC2", () => {
    const result = buildCourseEvents({
      course: baseCourse({
        startDate: CHECKLIST_TERM_START,
        endDate: CHECKLIST_TERM_END,
        weeklyChecklist: [checklistItem({ deadline: null })],
      }),
    });
    expect(eventsOfKind(result, "checklist")).toHaveLength(0);
  });

  it("does not add a 'skipped' note for a course with only non-deadlined items and no start/end date", () => {
    const result = buildCourseEvents({
      course: baseCourse({ startDate: null, endDate: null, weeklyChecklist: [checklistItem({ deadline: null })] }),
    });
    expect(result.notes.some((n) => n.includes("checklist"))).toBe(false);
  });

  it("skips with a note when startDate is missing (AC3: no start/end -> no events, ever-firing reminder avoided)", () => {
    const result = buildCourseEvents({
      course: baseCourse({ startDate: null, endDate: CHECKLIST_TERM_END, weeklyChecklist: [checklistItem()] }),
    });
    expect(eventsOfKind(result, "checklist")).toHaveLength(0);
    expect(result.notes).toContain("no start date or end date set - weekly checklist events were skipped");
  });

  it("skips with a note when endDate is missing", () => {
    const result = buildCourseEvents({
      course: baseCourse({ startDate: CHECKLIST_TERM_START, endDate: null, weeklyChecklist: [checklistItem()] }),
    });
    expect(eventsOfKind(result, "checklist")).toHaveLength(0);
    expect(result.notes).toContain("no start date or end date set - weekly checklist events were skipped");
  });

  it("expands one timed event per week across the term (AC3: expanded, not a repeating rule)", () => {
    const result = buildCourseEvents({
      course: baseCourse({
        startDate: CHECKLIST_TERM_START,
        endDate: CHECKLIST_TERM_END,
        weeklyChecklist: [checklistItem({ deadline: { weekday: 3, time: "09:00" } })], // Wednesday 09:00
      }),
    });
    const checklist = eventsOfKind(result, "checklist");
    expect(checklist).toHaveLength(3); // Jan 7, 14, 21
    expect(checklistKeys(result)).toEqual(["checklist-item-1-w0", "checklist-item-1-w1", "checklist-item-1-w2"]);

    const w0 = checklist.find((e) => e.key === "checklist-item-1-w0")!;
    expect(w0.startISO).toBe("2026-01-07T09:00:00");
    expect(w0.endISO).toBe("2026-01-07T09:30:00"); // +30 minutes, matching the "due" kind's convention
    expect(w0.allDay).toBe(false);
    expect(w0.summary).toBe("CS 101 - Grade discussion posts");

    const w1 = checklist.find((e) => e.key === "checklist-item-1-w1")!;
    expect(w1.startISO).toBe("2026-01-14T09:00:00");
    const w2 = checklist.find((e) => e.key === "checklist-item-1-w2")!;
    expect(w2.startISO).toBe("2026-01-21T09:00:00");
  });

  it("excludes the occurrence that falls in the term's first partial week, before startDate", () => {
    const result = buildCourseEvents({
      course: baseCourse({
        startDate: CHECKLIST_TERM_START,
        endDate: CHECKLIST_TERM_END,
        weeklyChecklist: [checklistItem({ deadline: { weekday: 0, time: null } })], // Sunday - Jan 4 precedes startDate
      }),
    });
    const dates = eventsOfKind(result, "checklist").map((e) => e.startISO).sort();
    expect(dates).toEqual(["2026-01-11", "2026-01-18", "2026-01-25"]); // Jan 4 excluded, Jan 25 included (exact end boundary)
  });

  it("excludes the occurrence that falls in the term's last partial week, after endDate", () => {
    const result = buildCourseEvents({
      course: baseCourse({
        startDate: CHECKLIST_TERM_START,
        endDate: CHECKLIST_TERM_END,
        weeklyChecklist: [checklistItem({ deadline: { weekday: 6, time: null } })], // Saturday - Jan 31 is past endDate
      }),
    });
    const dates = eventsOfKind(result, "checklist").map((e) => e.startISO).sort();
    expect(dates).toEqual(["2026-01-10", "2026-01-17", "2026-01-24"]); // Jan 31 excluded
  });

  it("produces an all-day event (exclusive end, +1 day) when the deadline has no time", () => {
    const result = buildCourseEvents({
      course: baseCourse({
        startDate: CHECKLIST_TERM_START,
        endDate: CHECKLIST_TERM_END,
        weeklyChecklist: [checklistItem({ deadline: { weekday: 3, time: null } })],
      }),
    });
    const [first] = eventsOfKind(result, "checklist").sort((a, b) => (a.startISO < b.startISO ? -1 : 1));
    expect(first.allDay).toBe(true);
    expect(first.startISO).toBe("2026-01-07");
    expect(first.endISO).toBe("2026-01-08");
  });

  it("applies CHECKLIST_DONE_PREFIX to exactly the week the item was checked in, and no other week (AC4)", () => {
    // Jan 13 falls in the Sunday-anchored week Jan 11-17, which is the same
    // week as the w1 occurrence (Jan 14).
    const checkedAt = new Date(2026, 0, 13, 10, 0, 0).getTime();
    const result = buildCourseEvents({
      course: baseCourse({
        startDate: CHECKLIST_TERM_START,
        endDate: CHECKLIST_TERM_END,
        weeklyChecklist: [checklistItem({ checked: true, checkedAt })],
      }),
    });
    const checklist = eventsOfKind(result, "checklist");
    const w0 = checklist.find((e) => e.key === "checklist-item-1-w0")!;
    const w1 = checklist.find((e) => e.key === "checklist-item-1-w1")!;
    const w2 = checklist.find((e) => e.key === "checklist-item-1-w2")!;
    expect(w0.summary.startsWith(CHECKLIST_DONE_PREFIX)).toBe(false);
    expect(w1.summary.startsWith(CHECKLIST_DONE_PREFIX)).toBe(true);
    expect(w1.summary).toBe(`${CHECKLIST_DONE_PREFIX}CS 101 - Grade discussion posts`);
    expect(w2.summary.startsWith(CHECKLIST_DONE_PREFIX)).toBe(false);
  });

  it("unchecking (checked: false, checkedAt: null) removes the prefix from every week's title (AC5)", () => {
    const checkedAt = new Date(2026, 0, 13, 10, 0, 0).getTime();
    const uncheckedResult = buildCourseEvents({
      course: baseCourse({
        startDate: CHECKLIST_TERM_START,
        endDate: CHECKLIST_TERM_END,
        // coerceWeeklyChecklist (run inside buildCourseEvents) forces checkedAt
        // to null whenever checked is false - this mirrors what
        // toggleWeeklyChecklistItem actually produces on an uncheck.
        weeklyChecklist: [checklistItem({ checked: false, checkedAt })],
      }),
    });
    expect(eventsOfKind(uncheckedResult, "checklist").some((e) => e.summary.includes(CHECKLIST_DONE_PREFIX))).toBe(
      false
    );
  });

  it("reset-all (every item back to checked:false) removes the prefix from every previously marked week", () => {
    const checkedAt = new Date(2026, 0, 13, 10, 0, 0).getTime();
    const beforeReset = buildCourseEvents({
      course: baseCourse({
        startDate: CHECKLIST_TERM_START,
        endDate: CHECKLIST_TERM_END,
        weeklyChecklist: [checklistItem({ checked: true, checkedAt })],
      }),
    });
    expect(eventsOfKind(beforeReset, "checklist").some((e) => e.summary.includes(CHECKLIST_DONE_PREFIX))).toBe(true);

    const afterReset = buildCourseEvents({
      course: baseCourse({
        startDate: CHECKLIST_TERM_START,
        endDate: CHECKLIST_TERM_END,
        weeklyChecklist: [checklistItem({ checked: false, checkedAt: null })],
      }),
    });
    expect(eventsOfKind(afterReset, "checklist").every((e) => !e.summary.includes(CHECKLIST_DONE_PREFIX))).toBe(
      true
    );
  });

  it("uses each item's own label in its summary and its own id in its keys, for multiple items", () => {
    const result = buildCourseEvents({
      course: baseCourse({
        startDate: CHECKLIST_TERM_START,
        endDate: CHECKLIST_TERM_END,
        weeklyChecklist: [
          checklistItem({ id: "a", label: "Grade posts", deadline: { weekday: 3, time: "09:00" } }),
          checklistItem({ id: "b", label: "Post announcement", deadline: { weekday: 3, time: "09:00" } }),
        ],
      }),
    });
    const keys = checklistKeys(result);
    expect(keys.every((k) => k.startsWith("checklist-a-w") || k.startsWith("checklist-b-w"))).toBe(true);
    expect(eventsOfKind(result, "checklist").some((e) => e.summary.includes("Grade posts"))).toBe(true);
    expect(eventsOfKind(result, "checklist").some((e) => e.summary.includes("Post announcement"))).toBe(true);
  });
});

describe("checklist keys - AC6 idempotency across rename/re-time/weekday-change/delete", () => {
  function plannedFor(weeklyChecklist: WeeklyChecklistItem[]): PlannedEvent[] {
    // Filtered to "checklist" only - baseCourse's startDate/endDate also
    // produce a "term" event, which is irrelevant noise for these
    // checklist-key-identity tests and would otherwise inflate every count.
    return buildCourseEvents({
      course: baseCourse({ startDate: CHECKLIST_TERM_START, endDate: CHECKLIST_TERM_END, weeklyChecklist }),
    }).events.filter((e) => e.kind === "checklist");
  }

  function asExisting(planned: PlannedEvent[]): ExistingEvent[] {
    return planned.map((e, i) => ({ id: `evt-${i}`, key: e.key }));
  }

  it("a rename (same deadline) keeps the same keys - the diff is all updates, no create/delete", () => {
    const original = plannedFor([checklistItem({ label: "Grade posts" })]);
    const existing = asExisting(original);

    const renamed = plannedFor([checklistItem({ label: "Grade discussion posts, all sections" })]);
    const diff = diffPlannedEvents(renamed, existing);
    expect(diff.toCreate).toEqual([]);
    expect(diff.toDelete).toEqual([]);
    expect(diff.toUpdate.map((u) => u.id).sort()).toEqual(existing.map((e) => e.id).sort());
    expect(diff.toUpdate.some((u) => u.event.summary.includes("all sections"))).toBe(true);
  });

  it("a re-time (same weekday, different time) keeps the same keys - update only", () => {
    const original = plannedFor([checklistItem({ deadline: { weekday: 3, time: "09:00" } })]);
    const existing = asExisting(original);

    const retimed = plannedFor([checklistItem({ deadline: { weekday: 3, time: "16:30" } })]);
    const diff = diffPlannedEvents(retimed, existing);
    expect(diff.toCreate).toEqual([]);
    expect(diff.toDelete).toEqual([]);
    expect(diff.toUpdate).toHaveLength(3);
    expect(diff.toUpdate.every((u) => u.event.startISO.endsWith("16:30:00"))).toBe(true);
  });

  it("changing the weekday shifts the occurrence set - stale weeks are deleted, new weeks are created", () => {
    const original = plannedFor([checklistItem({ deadline: { weekday: 3, time: "09:00" } })]); // Wed: Jan 7/14/21
    const existing = asExisting(original);

    const changed = plannedFor([checklistItem({ deadline: { weekday: 0, time: "09:00" } })]); // Sun: Jan 11/18/25
    const diff = diffPlannedEvents(changed, existing);
    // w0 (Jan 7's slot) no longer occurs for Sunday - it is now unplanned -> delete.
    // w1, w2 still occur (now on different actual dates) -> update in place.
    // w3 (Jan 25) is a NEW occurrence Sunday produces that Wednesday didn't -> create.
    expect(diff.toDelete).toHaveLength(1);
    expect(diff.toUpdate).toHaveLength(2);
    expect(diff.toCreate).toHaveLength(1);
  });

  it("deleting the item removes every one of its occurrences - all deletes, nothing created or updated", () => {
    const original = plannedFor([checklistItem()]);
    const existing = asExisting(original);

    const afterDelete = plannedFor([]); // item removed from the checklist entirely
    const diff = diffPlannedEvents(afterDelete, existing);
    expect(diff.toCreate).toEqual([]);
    expect(diff.toUpdate).toEqual([]);
    expect(diff.toDelete.sort()).toEqual(existing.map((e) => e.id).sort());
  });

  it("re-syncing against its own prior output is a true no-op idempotency check: all update, nothing create/delete", () => {
    const planned = plannedFor([checklistItem({ checked: true, checkedAt: new Date(2026, 0, 13).getTime() })]);
    const existing = asExisting(planned);
    const diff = diffPlannedEvents(planned, existing);
    expect(diff.toCreate).toEqual([]);
    expect(diff.toDelete).toEqual([]);
    expect(diff.toUpdate).toHaveLength(planned.length);
  });
});

describe("sundayOfWeek", () => {
  it("returns the same date when given a Sunday", () => {
    expect(sundayOfWeek(new Date(2026, 0, 4))).toEqual(new Date(2026, 0, 4));
  });

  it("returns the preceding Sunday for a mid-week date", () => {
    expect(sundayOfWeek(new Date(2026, 0, 7, 15, 30))).toEqual(new Date(2026, 0, 4)); // Wednesday -> that week's Sunday
    expect(sundayOfWeek(new Date(2026, 0, 10, 23, 59))).toEqual(new Date(2026, 0, 4)); // Saturday -> same week's Sunday
  });

  it("normalizes time-of-day to local midnight", () => {
    const withTime = sundayOfWeek(new Date(2026, 0, 6, 8, 45, 30));
    expect(withTime.getHours()).toBe(0);
    expect(withTime.getMinutes()).toBe(0);
    expect(withTime.getSeconds()).toBe(0);
  });
});

describe("findCurrentWeekChecklistEvent", () => {
  function planned(item: WeeklyChecklistItem = checklistItem()): PlannedEvent[] {
    return buildCourseEvents({
      course: baseCourse({ startDate: CHECKLIST_TERM_START, endDate: CHECKLIST_TERM_END, weeklyChecklist: [item] }),
    }).events;
  }

  it("finds the occurrence whose own week contains nowMs", () => {
    const events = planned(); // Wed 09:00: w0=Jan7, w1=Jan14, w2=Jan21
    const nowMs = new Date(2026, 0, 13, 10, 0, 0).getTime(); // Jan 13, same week as w1 (Jan 11-17)
    const found = findCurrentWeekChecklistEvent(events, "item-1", nowMs);
    expect(found?.key).toBe("checklist-item-1-w1");
  });

  it("returns null when the current week falls outside the term (item's deadline no longer applies)", () => {
    const events = planned();
    const longAfterTerm = new Date(2026, 5, 1).getTime(); // June - well past endDate
    expect(findCurrentWeekChecklistEvent(events, "item-1", longAfterTerm)).toBeNull();
  });

  it("returns null for an item with no deadline (nothing was planned for it)", () => {
    const events = planned(checklistItem({ deadline: null }));
    const nowMs = new Date(2026, 0, 13).getTime();
    expect(findCurrentWeekChecklistEvent(events, "item-1", nowMs)).toBeNull();
  });

  it("returns null for an unknown itemId", () => {
    const events = planned();
    const nowMs = new Date(2026, 0, 13).getTime();
    expect(findCurrentWeekChecklistEvent(events, "not-a-real-item", nowMs)).toBeNull();
  });
});

describe("buildCourseEvents - ordering", () => {
  it("returns events sorted by startISO then key", () => {
    const result = buildCourseEvents({
      course: baseCourse({
        startDate: MONDAY,
        endDate: "2026-03-01",
        weeks: 3,
        tests: 1,
        dayTime: "M/W/F 10:00am",
        classLengthMinutes: 75,
        assignmentDueRule: "sun|23:59",
      }),
    });
    expect(result.events.length).toBeGreaterThan(5);
    for (let i = 1; i < result.events.length; i += 1) {
      const prev = result.events[i - 1];
      const cur = result.events[i];
      const inOrder =
        prev.startISO < cur.startISO || (prev.startISO === cur.startISO && prev.key <= cur.key);
      expect(inOrder).toBe(true);
    }
  });
});

describe("isRecognizedEventKey", () => {
  it("accepts every key shape buildCourseEvents produces", () => {
    expect(isRecognizedEventKey("term")).toBe(true);
    expect(isRecognizedEventKey("meeting-w1-d0")).toBe(true);
    expect(isRecognizedEventKey("meeting-w12-d6")).toBe(true);
    expect(isRecognizedEventKey("test-1")).toBe(true);
    expect(isRecognizedEventKey("test-42")).toBe(true);
    expect(isRecognizedEventKey("due-w1")).toBe(true);
    expect(isRecognizedEventKey("due-w52")).toBe(true);
    expect(isRecognizedEventKey("checklist-item-1-w0")).toBe(true);
    expect(isRecognizedEventKey("checklist-abc-123-w12")).toBe(true); // a dash-bearing id (e.g. a UUID) still matches
    expect(isRecognizedEventKey("checklist-550e8400-e29b-41d4-a716-446655440000-w7")).toBe(true); // a real UUID id
  });

  it("rejects missing, blank, or unrecognised keys", () => {
    expect(isRecognizedEventKey("checklist-item-1")).toBe(false); // missing -wN suffix
    expect(isRecognizedEventKey("checklist--w0")).toBe(false); // empty id (`.+` requires at least one char)
    expect(isRecognizedEventKey("checklist-item-1-wX")).toBe(false); // non-numeric week index
    expect(isRecognizedEventKey("")).toBe(false);
    expect(isRecognizedEventKey("garbage")).toBe(false);
    expect(isRecognizedEventKey("meeting-w1-d7")).toBe(false); // weekday out of 0-6 range
    expect(isRecognizedEventKey("meeting-wX-d1")).toBe(false);
    expect(isRecognizedEventKey("Term")).toBe(false); // case sensitive
  });
});

describe("diffPlannedEvents", () => {
  function plannedEvent(key: string, overrides: Partial<PlannedEvent> = {}): PlannedEvent {
    return {
      key,
      kind: "due",
      summary: `Event ${key}`,
      description: "",
      startISO: "2026-01-12T10:00:00",
      endISO: "2026-01-12T10:30:00",
      allDay: false,
      ...overrides,
    };
  }

  it("creates when a planned key has no existing match", () => {
    const planned = [plannedEvent("due-w1")];
    const diff = diffPlannedEvents(planned, []);
    expect(diff.toCreate).toEqual(planned);
    expect(diff.toUpdate).toEqual([]);
    expect(diff.toDelete).toEqual([]);
  });

  it("updates unconditionally when a key is present in both", () => {
    const planned = [plannedEvent("due-w1", { summary: "Fresh summary" })];
    const existing: ExistingEvent[] = [{ id: "evt-1", key: "due-w1" }];
    const diff = diffPlannedEvents(planned, existing);
    expect(diff.toCreate).toEqual([]);
    expect(diff.toDelete).toEqual([]);
    expect(diff.toUpdate).toEqual([{ id: "evt-1", event: planned[0] }]);
  });

  it("deletes when an existing recognized key has no planned match", () => {
    const existing: ExistingEvent[] = [{ id: "evt-1", key: "due-w1" }];
    const diff = diffPlannedEvents([], existing);
    expect(diff.toDelete).toEqual(["evt-1"]);
    expect(diff.toCreate).toEqual([]);
    expect(diff.toUpdate).toEqual([]);
  });

  it("deletes everything when planned is empty against a non-empty existing list", () => {
    const existing: ExistingEvent[] = [
      { id: "evt-1", key: "term" },
      { id: "evt-2", key: "meeting-w1-d1" },
      { id: "evt-3", key: "due-w1" },
    ];
    const diff = diffPlannedEvents([], existing);
    expect(diff.toDelete.sort()).toEqual(["evt-1", "evt-2", "evt-3"]);
    expect(diff.toCreate).toEqual([]);
    expect(diff.toUpdate).toEqual([]);
  });

  it("tolerates duplicate keys in existing: updates the first occurrence, deletes the rest", () => {
    const planned = [plannedEvent("term")];
    const existing: ExistingEvent[] = [
      { id: "evt-1", key: "term" },
      { id: "evt-2", key: "term" },
      { id: "evt-3", key: "term" },
    ];
    const diff = diffPlannedEvents(planned, existing);
    expect(diff.toUpdate).toEqual([{ id: "evt-1", event: planned[0] }]);
    expect(diff.toDelete).toEqual(["evt-2", "evt-3"]);
    expect(diff.toCreate).toEqual([]);
  });

  it("the untagged-event guard: a missing ('') key is left alone entirely, never deleted", () => {
    const existing: ExistingEvent[] = [{ id: "untagged-1", key: "" }];
    const diff = diffPlannedEvents([], existing);
    expect(diff.toDelete).toEqual([]);
    expect(diff.toUpdate).toEqual([]);
    expect(diff.toCreate).toEqual([]);
  });

  it("the untagged-event guard: an unrecognised key is left alone entirely, never deleted", () => {
    const existing: ExistingEvent[] = [{ id: "untagged-2", key: "some-other-apps-key" }];
    const diff = diffPlannedEvents([], existing);
    expect(diff.toDelete).toEqual([]);
    expect(diff.toUpdate).toEqual([]);
  });

  it("leaves untagged entries alone while still correctly diffing the recognized ones around them", () => {
    const planned = [plannedEvent("term"), plannedEvent("due-w2")];
    const existing: ExistingEvent[] = [
      { id: "keep-untagged", key: "" },
      { id: "keep-unknown", key: "not-ours" },
      { id: "update-term", key: "term" },
      { id: "delete-old-due", key: "due-w1" },
    ];
    const diff = diffPlannedEvents(planned, existing);
    expect(diff.toUpdate).toEqual([{ id: "update-term", event: planned[0] }]);
    expect(diff.toDelete).toEqual(["delete-old-due"]);
    expect(diff.toCreate).toEqual([planned[1]]); // due-w2 had no existing match
    // The untagged/unknown ids must never appear anywhere in the diff.
    const touchedIds = new Set([...diff.toDelete, ...diff.toUpdate.map((u) => u.id)]);
    expect(touchedIds.has("keep-untagged")).toBe(false);
    expect(touchedIds.has("keep-unknown")).toBe(false);
  });
});
