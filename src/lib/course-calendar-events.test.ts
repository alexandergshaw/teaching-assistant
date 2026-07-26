import { describe, it, expect } from "vitest";
import {
  buildCourseEvents,
  diffPlannedEvents,
  isRecognizedEventKey,
  type PlannedEvent,
  type ExistingEvent,
} from "./course-calendar-events";
import type { Course } from "@/lib/supabase/courses";

// 2026-01-05 is a Monday - picked so every date-math test below can be
// hand-verified without a calendar in hand.
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
    materialsFiles: [],
    castletopFiles: [],
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
  });

  it("rejects missing, blank, or unrecognised keys", () => {
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
