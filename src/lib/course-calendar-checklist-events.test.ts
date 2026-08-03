import { describe, it, expect } from "vitest";
import { emptyCourseProject } from "@/lib/course-project";
import {
  buildCourseEvents,
  diffPlannedEvents,
  isChecklistEventKeyForItem,
  checklistCalendarBlockers,
  CHECKLIST_DONE_PREFIX,
  type PlannedEvent,
  type ExistingEvent,
} from "./course-calendar-events";
import type { Course } from "@/lib/supabase/courses";
import type { WeeklyChecklistItem } from "@/lib/weekly-checklist";

// Sibling of course-calendar-events.test.ts (see that file's own 1138-line
// size, already over this project's 1000-line-per-test-file cap before this
// split) covering everything CHECKLIST-specific: the four kinds of checklist
// event, the checklist key shape/identity tests, and the checklist-scoped
// blocker. Split along the exact same seam as the production module split
// (course-calendar-checklist-events.ts vs course-calendar-events.ts) - see
// that pair's own header comments for the full dependency-direction
// rationale. Every test below is moved VERBATIM from
// course-calendar-events.test.ts; no assertion was edited to accommodate the
// move.
//
// Imports everything from "./course-calendar-events" rather than
// "./course-calendar-checklist-events" directly, matching how
// course-calendar-events.frequency.test.ts already does the same thing - the
// re-export surface on course-calendar-events.ts is stable regardless of
// which module a symbol is actually defined in, so tests do not need to know
// or care about the internal split.
//
// baseCourse/eventsOfKind/checklistItem/checklistKeys/MONDAY are duplicated
// from course-calendar-events.test.ts rather than imported from it, matching
// how course-calendar-events.frequency.test.ts already reuses the parent
// file's own conventions without cross-importing them - each test file in
// this family stays self-contained.

// 2026-01-05 is a Monday - picked so every date-math test below can be
// hand-verified without a calendar in hand. 2026-01-04, the day before, is a
// Sunday (verified against weekly-checklist.test.ts's own anchor comment) -
// the Sunday that begins MONDAY's own calendar week.
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

describe("buildCourseEvents - checklist one-off (AC4/AC5)", () => {
  const ONE_OFF_DATE = "2026-02-10"; // arbitrary calendar date, well inside CHECKLIST_TERM_START..END

  function oneOffItem(overrides: Partial<WeeklyChecklistItem> = {}): WeeklyChecklistItem {
    return {
      id: "item-1",
      label: "Submit final grades",
      checked: false,
      checkedAt: null,
      deadline: { weekday: 0, time: "14:00", date: ONE_OFF_DATE },
      ...overrides,
    };
  }

  it("emits exactly ONE event for a one-off item, keyed 'checklist-<id>-once'", () => {
    const result = buildCourseEvents({
      course: baseCourse({ startDate: CHECKLIST_TERM_START, endDate: CHECKLIST_TERM_END, weeklyChecklist: [oneOffItem()] }),
    });
    const checklist = eventsOfKind(result, "checklist");
    expect(checklist).toHaveLength(1);
    expect(checklist[0].key).toBe("checklist-item-1-once");
    expect(checklist[0].startISO).toBe("2026-02-10T14:00:00");
    expect(checklist[0].endISO).toBe("2026-02-10T14:30:00");
    expect(checklist[0].allDay).toBe(false);
    expect(checklist[0].summary).toBe("CS 101 - Submit final grades");
  });

  it("produces an all-day event (exclusive end, +1 day) when the one-off deadline has no time", () => {
    const result = buildCourseEvents({
      course: baseCourse({
        startDate: CHECKLIST_TERM_START,
        endDate: CHECKLIST_TERM_END,
        weeklyChecklist: [oneOffItem({ deadline: { weekday: 0, time: null, date: ONE_OFF_DATE } })],
      }),
    });
    const [event] = eventsOfKind(result, "checklist");
    expect(event.allDay).toBe(true);
    expect(event.startISO).toBe("2026-02-10");
    expect(event.endISO).toBe("2026-02-11");
  });

  it("AC5: syncs a one-off item even when the course has NO start/end date at all", () => {
    const result = buildCourseEvents({
      course: baseCourse({ startDate: null, endDate: null, weeklyChecklist: [oneOffItem()] }),
    });
    const checklist = eventsOfKind(result, "checklist");
    expect(checklist).toHaveLength(1);
    expect(checklist[0].key).toBe("checklist-item-1-once");
  });

  it("AC5: does not add a 'skipped' note when the only deadlined item is one-off and dates are missing", () => {
    const result = buildCourseEvents({
      course: baseCourse({ startDate: null, endDate: null, weeklyChecklist: [oneOffItem()] }),
    });
    expect(result.notes.some((n) => n.includes("checklist"))).toBe(false);
  });

  it("a mix of one-off and recurring items: the one-off event syncs, the recurring one is skipped with a note, when dates are missing", () => {
    const result = buildCourseEvents({
      course: baseCourse({
        startDate: null,
        endDate: null,
        weeklyChecklist: [oneOffItem({ id: "once-item" }), checklistItem({ id: "recurring-item" })],
      }),
    });
    const checklist = eventsOfKind(result, "checklist");
    expect(checklist).toHaveLength(1);
    expect(checklist[0].key).toBe("checklist-once-item-once");
    expect(result.notes).toContain("no start date or end date set - weekly checklist events were skipped");
  });

  it("AC6: applies CHECKLIST_DONE_PREFIX to a checked one-off item, regardless of checkedAt", () => {
    const result = buildCourseEvents({
      course: baseCourse({
        startDate: CHECKLIST_TERM_START,
        endDate: CHECKLIST_TERM_END,
        weeklyChecklist: [oneOffItem({ checked: true, checkedAt: null })],
      }),
    });
    const [event] = eventsOfKind(result, "checklist");
    expect(event.summary.startsWith(CHECKLIST_DONE_PREFIX)).toBe(true);
  });

  it("AC6: does not apply the prefix to an unchecked one-off item", () => {
    const result = buildCourseEvents({
      course: baseCourse({
        startDate: CHECKLIST_TERM_START,
        endDate: CHECKLIST_TERM_END,
        weeklyChecklist: [oneOffItem({ checked: false })],
      }),
    });
    const [event] = eventsOfKind(result, "checklist");
    expect(event.summary.startsWith(CHECKLIST_DONE_PREFIX)).toBe(false);
  });
});

describe("checklist switch-kind cleanup (AC4)", () => {
  const ONE_OFF_DATE = "2026-01-14"; // falls inside CHECKLIST_TERM_START..END, matches w1's Wednesday-week window

  function plannedChecklistFor(weeklyChecklist: WeeklyChecklistItem[]): PlannedEvent[] {
    return buildCourseEvents({
      course: baseCourse({ startDate: CHECKLIST_TERM_START, endDate: CHECKLIST_TERM_END, weeklyChecklist }),
    }).events.filter((e) => e.kind === "checklist");
  }

  function asExisting(planned: PlannedEvent[]): ExistingEvent[] {
    return planned.map((e, i) => ({ id: `evt-${i}`, key: e.key }));
  }

  it("switching a recurring item to one-off deletes every old weekly key and creates exactly the new one-off key", () => {
    const recurringPlanned = plannedChecklistFor([checklistItem()]); // 3 weekly events: w0/w1/w2
    expect(recurringPlanned).toHaveLength(3);
    const existing = asExisting(recurringPlanned);

    const oneOffPlanned = plannedChecklistFor([
      checklistItem({ deadline: { weekday: 3, time: "09:00", date: ONE_OFF_DATE } }),
    ]);
    expect(oneOffPlanned).toHaveLength(1);
    expect(oneOffPlanned[0].key).toBe("checklist-item-1-once");

    const diff = diffPlannedEvents(oneOffPlanned, existing);
    expect(diff.toDelete.sort()).toEqual(existing.map((e) => e.id).sort());
    expect(diff.toCreate).toEqual(oneOffPlanned);
    expect(diff.toUpdate).toEqual([]);
  });

  it("switching a one-off item back to recurring deletes the old one-off key and creates every new weekly key", () => {
    const oneOffPlanned = plannedChecklistFor([
      checklistItem({ deadline: { weekday: 3, time: "09:00", date: ONE_OFF_DATE } }),
    ]);
    const existing = asExisting(oneOffPlanned);

    const recurringPlanned = plannedChecklistFor([checklistItem()]);
    const diff = diffPlannedEvents(recurringPlanned, existing);
    expect(diff.toDelete).toEqual(existing.map((e) => e.id));
    expect(diff.toCreate.sort((a, b) => (a.key < b.key ? -1 : 1))).toEqual(
      [...recurringPlanned].sort((a, b) => (a.key < b.key ? -1 : 1))
    );
    expect(diff.toUpdate).toEqual([]);
  });

  it("the existing-event filter (isChecklistEventKeyForItem) recognizes BOTH an item's old recurring keys and its new one-off key", () => {
    expect(isChecklistEventKeyForItem("checklist-item-1-w0", "item-1")).toBe(true);
    expect(isChecklistEventKeyForItem("checklist-item-1-once", "item-1")).toBe(true);
  });
});

describe("isChecklistEventKeyForItem", () => {
  it("matches an item's own recurring and one-off keys", () => {
    expect(isChecklistEventKeyForItem("checklist-abc-w0", "abc")).toBe(true);
    expect(isChecklistEventKeyForItem("checklist-abc-w12", "abc")).toBe(true);
    expect(isChecklistEventKeyForItem("checklist-abc-once", "abc")).toBe(true);
  });

  it("rejects another item's key even when one id is a string-prefix of the other", () => {
    // "abc" is a literal prefix of the key that actually belongs to "abc-def" -
    // the remainder after "checklist-abc-" is "def-w0", which is neither
    // "once" nor "w<digits>", so it must be rejected for itemId "abc".
    expect(isChecklistEventKeyForItem("checklist-abc-def-w0", "abc")).toBe(false);
    expect(isChecklistEventKeyForItem("checklist-abc-def-w0", "abc-def")).toBe(true);
  });

  it("rejects a key belonging to a different item entirely", () => {
    expect(isChecklistEventKeyForItem("checklist-item-2-w0", "item-1")).toBe(false);
    expect(isChecklistEventKeyForItem("checklist-item-2-once", "item-1")).toBe(false);
  });

  it("rejects a non-checklist key", () => {
    expect(isChecklistEventKeyForItem("term", "item-1")).toBe(false);
    expect(isChecklistEventKeyForItem("due-w1", "item-1")).toBe(false);
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

describe("checklistCalendarBlockers (AC5's narrowed blocker)", () => {
  function makeItem(overrides: Partial<WeeklyChecklistItem> = {}): WeeklyChecklistItem {
    return { id: "item-1", label: "Reading", checked: false, checkedAt: null, deadline: null, ...overrides };
  }

  it("is empty for a course with only a one-off deadlined item, even with no start/end date - AC5's over-claim fix", () => {
    const items = [makeItem({ deadline: { weekday: 0, time: null, date: "2026-02-10" } })];
    expect(checklistCalendarBlockers(baseCourse({ startDate: null, endDate: null }), items, true)).toEqual([]);
  });

  it("still flags missing-dates when a RECURRING deadlined item is present and dates are missing", () => {
    const items = [makeItem({ deadline: { weekday: 3, time: "09:00" } })];
    expect(checklistCalendarBlockers(baseCourse({ startDate: null, endDate: null }), items, true)).toEqual([
      "missing-dates",
    ]);
  });

  it("flags missing-dates for a mix of one-off and recurring items - the recurring one still needs the term bound", () => {
    const items = [
      makeItem({ id: "once", deadline: { weekday: 0, time: null, date: "2026-02-10" } }),
      makeItem({ id: "recurring", deadline: { weekday: 3, time: "09:00" } }),
    ];
    expect(checklistCalendarBlockers(baseCourse({ startDate: null, endDate: null }), items, true)).toEqual([
      "missing-dates",
    ]);
  });

  it("is empty for a course with dates set, regardless of item kind", () => {
    const items = [makeItem({ deadline: { weekday: 3, time: "09:00" } })];
    expect(checklistCalendarBlockers(baseCourse({ startDate: MONDAY, endDate: "2026-01-20" }), items, true)).toEqual(
      []
    );
  });

  it("flags not-connected independently of missing-dates and of item kind", () => {
    const items = [makeItem({ deadline: { weekday: 0, time: null, date: "2026-02-10" } })];
    expect(
      checklistCalendarBlockers(baseCourse({ startDate: MONDAY, endDate: "2026-01-20" }), items, false)
    ).toEqual(["not-connected"]);
  });

  it("treats googleCalendarConnected: null as not blocked, same as courseCalendarBlockers", () => {
    const items = [makeItem({ deadline: { weekday: 3, time: "09:00" } })];
    expect(checklistCalendarBlockers(baseCourse({ startDate: null, endDate: null }), items, null)).toEqual([
      "missing-dates",
    ]);
  });

  it("is empty with no items at all, even with no start/end date - nothing needs the term bound", () => {
    expect(checklistCalendarBlockers(baseCourse({ startDate: null, endDate: null }), [], true)).toEqual([]);
  });
});
