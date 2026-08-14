import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";
import {
  coursesStartingSoon,
  coursesUnderWay,
  upcomingCourseDates,
  formatUpcomingDate,
  UPCOMING_HORIZON_DAYS,
  MAX_VISIBLE_UPCOMING_DATES,
  type CourseUpcomingCandidate,
} from "./course-upcoming-dates";
import { coursesInSession } from "./courses-in-session";
import type { WeeklyChecklistItem } from "./weekly-checklist";

// 2026-03-10 is a Tuesday. Every date below is written relative to it so the
// horizon boundaries are readable at a glance:
//   today      2026-03-10 (Tue)
//   tomorrow   2026-03-11 (Wed)
//   +5         2026-03-15 (Sun)
//   +14        2026-03-24 (Tue)  <- last day inside the default horizon
//   +15        2026-03-25 (Wed)  <- first day outside it
// The time-of-day is deliberately mid-morning: nothing here may depend on it.
const NOW = new Date(2026, 2, 10, 9, 30, 0);

// A second reference date whose horizon window (2026-02-20 .. 2026-03-06)
// CONTAINS the impossible calendar date "2026-02-30". Under NOW that string
// sorts before today and would be dropped by the window check alone, so the
// malformed-date rules can only be proven from here.
const LATE_FEB = new Date(2026, 1, 20, 9, 30, 0);

function course(overrides: Partial<CourseUpcomingCandidate> = {}): CourseUpcomingCandidate {
  return {
    id: "c1",
    name: "Course One",
    startDate: "2026-01-12",
    endDate: null,
    breaks: null,
    ...overrides,
  };
}

function checklistItem(overrides: Partial<WeeklyChecklistItem> = {}): WeeklyChecklistItem {
  return {
    id: "i1",
    label: "Post the weekly recap",
    checked: false,
    checkedAt: null,
    deadline: null,
    ...overrides,
  };
}

describe("module constants", () => {
  it("pins the horizon at 14 days", () => {
    expect(UPCOMING_HORIZON_DAYS).toBe(14);
  });

  it("pins the visible-entry cap at 6", () => {
    expect(MAX_VISIBLE_UPCOMING_DATES).toBe(6);
  });

  it("uses UPCOMING_HORIZON_DAYS as the default horizon, not a separate literal", () => {
    const list = [
      course({ id: "in", startDate: "2026-03-24" }),
      course({ id: "out", startDate: "2026-03-25" }),
    ];
    expect(coursesStartingSoon(list, NOW)).toEqual(coursesStartingSoon(list, NOW, UPCOMING_HORIZON_DAYS));
    const dated = [course({ gradesDueDate: "2026-03-24" })];
    expect(upcomingCourseDates(dated, [], NOW)).toEqual(
      upcomingCourseDates(dated, [], NOW, UPCOMING_HORIZON_DAYS)
    );
  });
});

describe("the module never reads the clock", () => {
  it("contains no argument-less new Date() and no Date.now()", () => {
    const source = readFileSync(path.resolve(process.cwd(), "src/lib/course-upcoming-dates.ts"), "utf-8");
    expect(source).not.toMatch(/new\s+Date\s*\(\s*\)/);
    expect(source).not.toMatch(/Date\s*\.\s*now\s*\(/);
  });
});

describe("coursesUnderWay", () => {
  it("includes a course whose term has begun and has not ended", () => {
    const c = course({ id: "running", startDate: "2026-01-12", endDate: "2026-05-01" });
    expect(coursesUnderWay([c], NOW).map((x) => x.id)).toEqual(["running"]);
  });

  it("includes a course that is ON BREAK today - the break hides the chip, not the deadlines", () => {
    const onBreak = course({ id: "break", startDate: "2026-01-12", breaks: "2026-03-09..2026-03-14 | Spring Break" });
    expect(coursesInSession([onBreak], NOW)).toEqual([]);
    expect(coursesUnderWay([onBreak], NOW).map((x) => x.id)).toEqual(["break"]);
  });

  it("includes a course starting today and a course ending today", () => {
    const startsToday = course({ id: "starts", startDate: "2026-03-10" });
    const endsToday = course({ id: "ends", startDate: "2026-01-12", endDate: "2026-03-10" });
    expect(coursesUnderWay([startsToday, endsToday], NOW).map((x) => x.id)).toEqual(["starts", "ends"]);
  });

  it("excludes a course that has not started, has already ended, or has no start date", () => {
    const future = course({ id: "future", startDate: "2026-04-01" });
    const over = course({ id: "over", startDate: "2026-01-12", endDate: "2026-02-01" });
    const undated = course({ id: "undated", startDate: null });
    expect(coursesUnderWay([future, over, undated], NOW)).toEqual([]);
  });

  it("is a superset of coursesInSession over the same list", () => {
    const list = [
      course({ id: "running", startDate: "2026-01-12" }),
      course({ id: "break", startDate: "2026-01-12", breaks: "2026-03-09..2026-03-14 | Spring Break" }),
      course({ id: "future", startDate: "2026-04-01" }),
    ];
    const inSession = coursesInSession(list, NOW).map((c) => c.id);
    const underWay = coursesUnderWay(list, NOW).map((c) => c.id);
    expect(inSession.every((id) => underWay.includes(id))).toBe(true);
    expect(underWay).toContain("break");
    expect(inSession).not.toContain("break");
  });

  it("preserves order and never mutates the input", () => {
    const list = [course({ id: "b", startDate: "2026-01-12" }), course({ id: "a", startDate: "2026-01-12" })];
    const copy = structuredClone(list);
    expect(coursesUnderWay(list, NOW).map((c) => c.id)).toEqual(["b", "a"]);
    expect(list).toEqual(copy);
  });
});

describe("coursesStartingSoon", () => {
  it("includes a course starting tomorrow", () => {
    const soon = course({ id: "soon", startDate: "2026-03-11" });
    expect(coursesStartingSoon([soon], NOW).map((c) => c.id)).toEqual(["soon"]);
  });

  it("includes a course starting on the last day of the horizon", () => {
    const soon = course({ id: "edge", startDate: "2026-03-24" });
    expect(coursesStartingSoon([soon], NOW).map((c) => c.id)).toEqual(["edge"]);
  });

  it("excludes a course starting the day after the horizon", () => {
    const later = course({ id: "later", startDate: "2026-03-25" });
    expect(coursesStartingSoon([later], NOW)).toEqual([]);
  });

  it("excludes a course starting TODAY - that course is already in session", () => {
    const startsToday = course({ id: "today", startDate: "2026-03-10" });
    expect(coursesStartingSoon([startsToday], NOW)).toEqual([]);
  });

  it("excludes a course that started in the past", () => {
    const running = course({ id: "running", startDate: "2026-01-12" });
    expect(coursesStartingSoon([running], NOW)).toEqual([]);
  });

  it("excludes a course with no start date at all", () => {
    const undated = course({ id: "undated", startDate: null });
    expect(coursesStartingSoon([undated], NOW)).toEqual([]);
  });

  it("excludes a course whose end date precedes its start date (a stale copied-forward row)", () => {
    const stale = course({ id: "stale", startDate: "2026-03-16", endDate: "2026-02-01" });
    expect(coursesStartingSoon([stale], NOW)).toEqual([]);
  });

  it("keeps a course whose end date follows its start date", () => {
    const ok = course({ id: "ok", startDate: "2026-03-16", endDate: "2026-06-01" });
    expect(coursesStartingSoon([ok], NOW).map((c) => c.id)).toEqual(["ok"]);
  });

  // Round-3 bug report - finding 2: the endDate < startDate check used to
  // compare a RAW course.endDate against the already-COERCED startDate, so
  // the malformed-endDate rule flipped on the SHAPE of the garbage instead of
  // degrading consistently to "open-ended" like coursesUnderWay's own endDate
  // check does. A low-sorting malformed value ("2026-02-30", which sorts
  // below "2026-03-16" as a plain string) used to wrongly exclude the course;
  // a high-sorting one ("2026-13-01") happened to pass either way, but both
  // are asserted here so the rule is proven to apply consistently rather than
  // only in the case that happened to already work.
  it("does not let a malformed end date exclude an otherwise valid about-to-begin course, regardless of how the garbage sorts", () => {
    const lowSorting = course({ id: "low", startDate: "2026-03-16", endDate: "2026-02-30" });
    const highSorting = course({ id: "high", startDate: "2026-03-16", endDate: "2026-13-01" });
    expect(coursesStartingSoon([lowSorting], NOW).map((c) => c.id)).toEqual(["low"]);
    expect(coursesStartingSoon([highSorting], NOW).map((c) => c.id)).toEqual(["high"]);
  });

  it("preserves the given order and never mutates the input", () => {
    const list = [
      course({ id: "b", name: "B", startDate: "2026-03-20" }),
      course({ id: "a", name: "A", startDate: "2026-03-12" }),
    ];
    const copy = structuredClone(list);
    expect(coursesStartingSoon(list, NOW).map((c) => c.id)).toEqual(["b", "a"]);
    expect(list).toEqual(copy);
  });

  it("honours an explicit horizon override", () => {
    const list = [
      course({ id: "in", startDate: "2026-03-12" }),
      course({ id: "out", startDate: "2026-03-18" }),
    ];
    expect(coursesStartingSoon(list, NOW, 3).map((c) => c.id)).toEqual(["in"]);
  });

  it("counts the horizon in CALENDAR days across a month and year boundary", () => {
    const dec28 = new Date(2026, 11, 28, 9, 30, 0);
    const list = [
      course({ id: "in", startDate: "2027-01-11" }),
      course({ id: "out", startDate: "2027-01-12" }),
    ];
    expect(coursesStartingSoon(list, dec28).map((c) => c.id)).toEqual(["in"]);
  });

  it("counts the horizon in CALENDAR days across a daylight-saving transition", () => {
    // 2026-11-01 is the US fall-back Sunday (a 25-hour local day), so adding
    // 14 * 86400000 milliseconds lands a day short of the calendar answer.
    const nov1 = new Date(2026, 10, 1, 0, 30, 0);
    const list = [
      course({ id: "in", startDate: "2026-11-15" }),
      course({ id: "out", startDate: "2026-11-16" }),
    ];
    expect(coursesStartingSoon(list, nov1).map((c) => c.id)).toEqual(["in"]);
  });

  it("can never overlap with coursesInSession over the same list", () => {
    const list = [
      course({ id: "running", startDate: "2026-01-12" }),
      course({ id: "starts-today", startDate: "2026-03-10" }),
      course({ id: "soon", startDate: "2026-03-14" }),
      course({ id: "far", startDate: "2026-06-01" }),
      course({ id: "over", startDate: "2026-01-12", endDate: "2026-02-01" }),
    ];
    const inSession = coursesInSession(list, NOW).map((c) => c.id);
    const soon = coursesStartingSoon(list, NOW).map((c) => c.id);
    expect(inSession).toContain("running");
    expect(soon).toContain("soon");
    expect(soon.filter((id) => inSession.includes(id))).toEqual([]);
  });

  // Bug: coursesInSession (frozen) compares startDate RAW, and a
  // whitespace-padded value sorts BELOW any digit as a plain string - so
  // " 2026-03-16" sorts below "2026-03-10" and coursesInSession's raw
  // `startDate > today` gate is false, admitting the course as IN SESSION.
  // coerceGradesDueDate trims the same value to "2026-03-16" - strictly
  // future and inside the horizon - so before this fix it was ALSO admitted
  // as STARTING SOON, putting one course in both sets at once.
  it("excludes a startDate that coercion would change (leading whitespace), even though the trimmed value would otherwise qualify", () => {
    const leadingSpace = course({ id: "space", startDate: " 2026-03-16" });
    const leadingTab = course({ id: "tab", startDate: "\t2026-03-16" });
    expect(coursesStartingSoon([leadingSpace], NOW)).toEqual([]);
    expect(coursesStartingSoon([leadingTab], NOW)).toEqual([]);
  });

  it("stays disjoint from coursesInSession across whitespace-padded, malformed and impossible startDate shapes, not just well-formed ones", () => {
    const list = [
      course({ id: "padded", startDate: " 2026-03-16" }),
      course({ id: "tabbed", startDate: "\t2026-03-20" }),
      course({ id: "impossible", startDate: "2026-02-30" }),
      course({ id: "malformed-month", startDate: "2026-13-01" }),
      course({ id: "timestamp", startDate: "2026-03-15T00:00:00.000Z" }),
      course({ id: "running", startDate: "2026-01-12" }),
      course({ id: "starts-today", startDate: "2026-03-10" }),
      course({ id: "soon", startDate: "2026-03-14" }),
    ];
    const inSession = coursesInSession(list, NOW).map((c) => c.id);
    // Prove the padded/tabbed rows actually reproduce the bug (they really do
    // land in coursesInSession via its frozen raw comparison) so excluding
    // them from coursesStartingSoon below is the thing doing the work, not a
    // coincidence of some other guard.
    expect(inSession).toContain("padded");
    expect(inSession).toContain("tabbed");
    const soon = coursesStartingSoon(list, NOW).map((c) => c.id);
    expect(soon).toContain("soon");
    expect(soon.filter((id) => inSession.includes(id))).toEqual([]);
  });
});

describe("upcomingCourseDates - courses whose term is under way", () => {
  it("emits the grades-due date with its time", () => {
    const c = course({ gradesDueDate: "2026-03-15", gradesDueTime: "17:00" });
    const out = upcomingCourseDates([c], [], NOW);
    expect(out).toHaveLength(1);
    expect(out[0].kind).toBe("grades-due");
    expect(out[0].date).toBe("2026-03-15");
    expect(out[0].time).toBe("17:00");
    expect(out[0].courseId).toBe("c1");
    expect(out[0].courseName).toBe("Course One");
    expect(out[0].label.trim().length).toBeGreaterThan(0);
  });

  it("emits nothing for a missing grades-due date", () => {
    const missing = course({ gradesDueDate: null, gradesDueTime: "17:00" });
    expect(upcomingCourseDates([missing], [], NOW)).toEqual([]);
  });

  it("rejects an impossible grades-due calendar date that falls INSIDE the horizon", () => {
    const real = course({ id: "real", gradesDueDate: "2026-02-28" });
    expect(upcomingCourseDates([real], [], LATE_FEB)).toHaveLength(1);
    const impossible = course({ id: "impossible", gradesDueDate: "2026-02-30" });
    expect(upcomingCourseDates([impossible], [], LATE_FEB)).toEqual([]);
  });

  it("rejects a malformed end date that falls INSIDE the horizon", () => {
    const c = course({ endDate: "2026-03-1a" });
    expect(upcomingCourseDates([c], [], NOW)).toEqual([]);
  });

  it("rejects a malformed one-off checklist date that falls INSIDE the horizon", () => {
    const c = course({
      weeklyChecklist: [checklistItem({ deadline: { weekday: 0, time: null, date: "2026-03-1a" } })],
    });
    expect(upcomingCourseDates([c], [], NOW)).toEqual([]);
  });

  it("keeps a valid grades-due date whose time is garbage, with no time", () => {
    const c = course({ gradesDueDate: "2026-03-15", gradesDueTime: "not-a-time" });
    const out = upcomingCourseDates([c], [], NOW);
    expect(out).toHaveLength(1);
    expect(out[0].time).toBeNull();
  });

  it("emits the course end date", () => {
    const c = course({ endDate: "2026-03-20" });
    const out = upcomingCourseDates([c], [], NOW);
    expect(out).toHaveLength(1);
    expect(out[0].kind).toBe("class-end");
    expect(out[0].date).toBe("2026-03-20");
    expect(out[0].time).toBeNull();
  });

  it("emits an end date falling TODAY", () => {
    const c = course({ endDate: "2026-03-10" });
    const out = upcomingCourseDates([c], [], NOW);
    expect(out.map((e) => e.kind)).toEqual(["class-end"]);
  });

  it("emits the START of each structured break, carrying the break's own label", () => {
    const c = course({ breaks: "2026-03-16..2026-03-20 | Spring Break" });
    const out = upcomingCourseDates([c], [], NOW);
    expect(out).toHaveLength(1);
    expect(out[0].kind).toBe("break-start");
    expect(out[0].date).toBe("2026-03-16");
    expect(out[0].label).toContain("Spring Break");
  });

  it("still emits an unlabelled break, with a non-empty label of its own", () => {
    const c = course({ breaks: "2026-03-16..2026-03-20" });
    const out = upcomingCourseDates([c], [], NOW);
    expect(out).toHaveLength(1);
    expect(out[0].kind).toBe("break-start");
    expect(out[0].label.trim().length).toBeGreaterThan(0);
  });

  it("emits nothing for free-text breaks that do not parse as ranges", () => {
    const c = course({ breaks: "Week 8 - Spring Break" });
    expect(upcomingCourseDates([c], [], NOW)).toEqual([]);
  });

  it("excludes a break already under way (its start date has passed)", () => {
    const c = course({ breaks: "2026-03-05..2026-03-12 | Reading Week" });
    expect(upcomingCourseDates([c], [], NOW)).toEqual([]);
  });

  it("emits a break that starts TODAY, even though that same break hides the course's chip", () => {
    const c = course({ breaks: "2026-03-10..2026-03-14 | Spring Break" });
    const out = upcomingCourseDates([c], [], NOW);
    expect(out.map((e) => e.kind)).toEqual(["break-start"]);
    expect(out[0].date).toBe("2026-03-10");
  });

  it("emits one entry per structured break range", () => {
    const c = course({ breaks: "2026-03-12..2026-03-13 | A\n2026-03-18..2026-03-19 | B" });
    const out = upcomingCourseDates([c], [], NOW);
    expect(out.map((e) => e.date)).toEqual(["2026-03-12", "2026-03-18"]);
  });

  it("emits a ONE-OFF checklist item under the item's own label", () => {
    const c = course({
      weeklyChecklist: [
        checklistItem({ label: "Submit midterm grades", deadline: { weekday: 0, time: "23:59", date: "2026-03-15" } }),
      ],
    });
    const out = upcomingCourseDates([c], [], NOW);
    expect(out).toHaveLength(1);
    expect(out[0].kind).toBe("checklist");
    expect(out[0].label).toBe("Submit midterm grades");
    expect(out[0].date).toBe("2026-03-15");
    expect(out[0].time).toBe("23:59");
  });

  it("emits nothing for recurring, daily or monthly checklist deadlines", () => {
    const c = course({
      weeklyChecklist: [
        checklistItem({ id: "w", label: "Weekly", deadline: { weekday: 1, time: "09:00" } }),
        checklistItem({ id: "d", label: "Daily", deadline: { weekday: 0, time: "09:00", frequency: "daily" } }),
        checklistItem({
          id: "m",
          label: "Monthly",
          deadline: { weekday: 0, time: "09:00", frequency: "monthly", dayOfMonth: 15 },
        }),
      ],
    });
    expect(upcomingCourseDates([c], [], NOW)).toEqual([]);
  });

  it("emits nothing for a checklist item the instructor has already checked off", () => {
    const done = checklistItem({
      label: "Submit midterm grades",
      checked: true,
      checkedAt: new Date(2026, 2, 9, 12, 0, 0).getTime(),
      deadline: { weekday: 0, time: "23:59", date: "2026-03-15" },
    });
    expect(upcomingCourseDates([course({ weeklyChecklist: [done] })], [], NOW)).toEqual([]);
  });

  it("emits nothing for a checklist item with no deadline, or no checklist at all", () => {
    expect(upcomingCourseDates([course({ weeklyChecklist: [checklistItem()] })], [], NOW)).toEqual([]);
    expect(upcomingCourseDates([course({ weeklyChecklist: undefined })], [], NOW)).toEqual([]);
  });

  it("never emits the start date of a course whose term is already under way", () => {
    const c = course({ startDate: "2026-03-10" });
    expect(upcomingCourseDates([c], [], NOW).map((e) => e.kind)).not.toContain("class-start");
  });

  it("excludes anything past the horizon or already in the past", () => {
    const past = course({ id: "past", gradesDueDate: "2026-03-09" });
    const beyond = course({ id: "beyond", gradesDueDate: "2026-03-25" });
    const edge = course({ id: "edge", gradesDueDate: "2026-03-24" });
    const out = upcomingCourseDates([past, beyond, edge], [], NOW);
    expect(out.map((e) => e.courseId)).toEqual(["edge"]);
  });

  it("measures the horizon in CALENDAR days across a month and year boundary", () => {
    const dec28 = new Date(2026, 11, 28, 9, 30, 0);
    const inWindow = course({ id: "in", gradesDueDate: "2027-01-11" });
    const outWindow = course({ id: "out", gradesDueDate: "2027-01-12" });
    const out = upcomingCourseDates([inWindow, outWindow], [], dec28);
    expect(out.map((e) => e.courseId)).toEqual(["in"]);
  });

  it("honours an explicit horizon override", () => {
    const c = course({ gradesDueDate: "2026-03-18" });
    expect(upcomingCourseDates([c], [], NOW, 3)).toEqual([]);
    expect(upcomingCourseDates([c], [], NOW, 10)).toHaveLength(1);
  });

  it("collects every kind a single course can contribute at once", () => {
    const c = course({
      endDate: "2026-03-22",
      breaks: "2026-03-16..2026-03-17 | Break",
      gradesDueDate: "2026-03-18",
      gradesDueTime: "17:00",
      weeklyChecklist: [checklistItem({ deadline: { weekday: 6, time: null, date: "2026-03-14" } })],
    });
    const out = upcomingCourseDates([c], [], NOW);
    expect(out.map((e) => e.kind)).toEqual(["checklist", "break-start", "grades-due", "class-end"]);
  });

  it("does not emit the same entry twice when a course is listed twice", () => {
    const c = course({ gradesDueDate: "2026-03-15", gradesDueTime: "17:00" });
    expect(upcomingCourseDates([c, { ...c }], [], NOW)).toHaveLength(1);
  });
});

describe("upcomingCourseDates - courses about to begin", () => {
  it("emits exactly the start date, with no time", () => {
    const soon = course({ id: "soon", name: "Course Two", startDate: "2026-03-16" });
    const out = upcomingCourseDates([], [soon], NOW);
    expect(out).toHaveLength(1);
    expect(out[0].kind).toBe("class-start");
    expect(out[0].date).toBe("2026-03-16");
    expect(out[0].time).toBeNull();
    expect(out[0].courseId).toBe("soon");
    expect(out[0].courseName).toBe("Course Two");
    expect(out[0].label.trim().length).toBeGreaterThan(0);
  });

  it("emits ONLY the start date, ignoring every other dated field on that course", () => {
    const soon = course({
      id: "soon",
      startDate: "2026-03-16",
      endDate: "2026-03-20",
      breaks: "2026-03-17..2026-03-18 | Break",
      gradesDueDate: "2026-03-19",
      gradesDueTime: "17:00",
      weeklyChecklist: [checklistItem({ deadline: { weekday: 3, time: "09:00", date: "2026-03-18" } })],
    });
    const out = upcomingCourseDates([], [soon], NOW);
    expect(out.map((e) => e.kind)).toEqual(["class-start"]);
  });

  it("lets about-to-begin win when the same course is handed to both lists", () => {
    const both = course({
      id: "both",
      startDate: "2026-03-16",
      gradesDueDate: "2026-03-19",
      endDate: "2026-03-20",
    });
    expect(upcomingCourseDates([both], [both], NOW).map((e) => e.kind)).toEqual(["class-start"]);
  });

  it("still applies the horizon to the start date itself", () => {
    const soon = course({ id: "soon", startDate: "2026-03-16" });
    expect(upcomingCourseDates([], [soon], NOW, 3)).toEqual([]);
  });

  it("emits nothing for a starting-soon course with no start date", () => {
    expect(upcomingCourseDates([], [course({ startDate: null })], NOW)).toEqual([]);
  });
});

describe("upcomingCourseDates - ordering", () => {
  it("sorts by date ascending across courses", () => {
    const a = course({ id: "a", name: "Alpha", gradesDueDate: "2026-03-20" });
    const b = course({ id: "b", name: "Beta", endDate: "2026-03-12" });
    const c = course({ id: "c", name: "Gamma", startDate: "2026-03-16" });
    const out = upcomingCourseDates([a, b], [c], NOW);
    expect(out.map((e) => e.date)).toEqual(["2026-03-12", "2026-03-16", "2026-03-20"]);
  });

  it("puts a timed entry before an untimed one on the same date, against name order", () => {
    const timed = course({ id: "timed", name: "Zulu", gradesDueDate: "2026-03-15", gradesDueTime: "17:00" });
    const untimed = course({ id: "untimed", name: "Alpha", endDate: "2026-03-15" });
    const out = upcomingCourseDates([untimed, timed], [], NOW);
    expect(out.map((e) => e.courseId)).toEqual(["timed", "untimed"]);
  });

  it("puts the earlier time first when two entries share a date, against name order", () => {
    const late = course({ id: "late", name: "Alpha", gradesDueDate: "2026-03-15", gradesDueTime: "17:00" });
    const early = course({ id: "early", name: "Zulu", gradesDueDate: "2026-03-15", gradesDueTime: "08:00" });
    const out = upcomingCourseDates([late, early], [], NOW);
    expect(out.map((e) => e.courseId)).toEqual(["early", "late"]);
  });

  it("breaks a date/time tie by course NAME, not by course id", () => {
    const zed = course({ id: "z", name: "Ada", gradesDueDate: "2026-03-15", gradesDueTime: "09:00" });
    const ada = course({ id: "a", name: "Zed", gradesDueDate: "2026-03-15", gradesDueTime: "09:00" });
    expect(upcomingCourseDates([zed, ada], [], NOW).map((e) => e.courseId)).toEqual(["z", "a"]);
    expect(upcomingCourseDates([ada, zed], [], NOW).map((e) => e.courseId)).toEqual(["z", "a"]);
  });

  it("orders two untimed entries of one course on the same day deterministically, by kind", () => {
    const c = course({ endDate: "2026-03-16", breaks: "2026-03-16..2026-03-17 | Break" });
    expect(upcomingCourseDates([c], [], NOW).map((e) => e.kind)).toEqual(["break-start", "class-end"]);
  });

  it("never mutates the lists or the courses it was given", () => {
    const list = [
      course({ id: "a", gradesDueDate: "2026-03-20" }),
      course({
        id: "b",
        endDate: "2026-03-12",
        weeklyChecklist: [checklistItem({ deadline: { weekday: 4, time: null, date: "2026-03-12" } })],
      }),
    ];
    const copy = structuredClone(list);
    upcomingCourseDates(list, [], NOW);
    expect(list).toEqual(copy);
  });
});

describe("formatUpcomingDate", () => {
  it("names today as Today and still carries the absolute date", () => {
    const text = formatUpcomingDate("2026-03-10", null, NOW);
    expect(text).toContain("Today");
    expect(text).toContain("Mar 10");
  });

  it("names tomorrow as Tomorrow and still carries the absolute date", () => {
    const text = formatUpcomingDate("2026-03-11", null, NOW);
    expect(text).toContain("Tomorrow");
    expect(text).toContain("Mar 11");
  });

  it("rolls Tomorrow over a month boundary", () => {
    const mar31 = new Date(2026, 2, 31, 9, 30, 0);
    const text = formatUpcomingDate("2026-04-01", null, mar31);
    expect(text).toContain("Tomorrow");
    expect(text).toContain("Apr 1");
  });

  it("rolls Tomorrow over a year boundary", () => {
    const dec31 = new Date(2026, 11, 31, 9, 30, 0);
    expect(formatUpcomingDate("2027-01-01", null, dec31)).toContain("Tomorrow");
  });

  it("uses a weekday plus the absolute date further out", () => {
    const text = formatUpcomingDate("2026-03-15", null, NOW);
    expect(text).toContain("Sun");
    expect(text).toContain("Mar 15");
    expect(text).not.toContain("Today");
    expect(text).not.toContain("Tomorrow");
  });

  it("gets the weekday right for a different day of the week", () => {
    expect(formatUpcomingDate("2026-03-13", null, NOW)).toContain("Fri");
  });

  it("appends a 12-hour time when one is given", () => {
    expect(formatUpcomingDate("2026-03-15", "17:00", NOW)).toContain("5:00 PM");
  });

  it("gets the 12-hour boundaries right", () => {
    expect(formatUpcomingDate("2026-03-15", "00:00", NOW)).toContain("12:00 AM");
    expect(formatUpcomingDate("2026-03-15", "12:00", NOW)).toContain("12:00 PM");
  });

  it("omits any time when none is given", () => {
    const text = formatUpcomingDate("2026-03-15", null, NOW);
    expect(text).not.toContain("AM");
    expect(text).not.toContain("PM");
  });

  it("does not shift the calendar day, at either end of the year", () => {
    expect(formatUpcomingDate("2026-01-01", null, NOW)).toContain("Jan 1");
    expect(formatUpcomingDate("2026-12-31", null, NOW)).toContain("Dec 31");
  });

  it("does not depend on the reference date's time of day", () => {
    const a = formatUpcomingDate("2026-03-15", "09:00", new Date(2026, 2, 10, 0, 0, 1));
    const b = formatUpcomingDate("2026-03-15", "09:00", new Date(2026, 2, 10, 23, 59, 59));
    expect(a).toBe(b);
  });

  it("appends the year when the entry's year differs from the reference year", () => {
    const dec31 = new Date(2026, 11, 31, 9, 30, 0);
    // 2027-01-15 is neither today nor tomorrow relative to dec31, so this
    // exercises the weekday-plus-absolute-date branch with a year mismatch.
    const text = formatUpcomingDate("2027-01-15", null, dec31);
    expect(text).toContain("2027");
  });

  it("omits the year when the entry's year matches the reference year", () => {
    const text = formatUpcomingDate("2026-03-15", null, NOW);
    expect(text).not.toContain("2026");
  });
});

// Round-1 bug report - BLOCKER 1: the class-start date used to be copied
// verbatim from course.startDate with no validation, unlike every other date
// this module emits. coursesStartingSoon's own lexicographic membership
// check and the horizon filter both operate on plain strings, so a malformed
// value can sort INSIDE a plausible window exactly like an unvalidated
// gradesDueDate or checklist date could (see the module comment) - these
// cases were reproduced against the shipped code before the fix.
describe("coursesStartingSoon / startingSoonEntriesForCourse - startDate is validated (BLOCKER 1)", () => {
  it("rejects an impossible calendar date even though it sorts inside the horizon as a string", () => {
    const sep20 = new Date(2026, 8, 20, 9, 30, 0);
    const bad = course({ id: "bad", startDate: "2026-09-31" });
    expect(coursesStartingSoon([bad], sep20)).toEqual([]);
    expect(upcomingCourseDates([], [bad], sep20)).toEqual([]);
  });

  it("rejects an out-of-range month even though it sorts inside the horizon as a string", () => {
    const dec28 = new Date(2026, 11, 28, 9, 30, 0);
    const bad = course({ id: "bad", startDate: "2026-13-01" });
    expect(coursesStartingSoon([bad], dec28)).toEqual([]);
    expect(upcomingCourseDates([], [bad], dec28)).toEqual([]);
  });

  it("rejects a timestamp-shaped startDate rather than emitting a NaN date", () => {
    const bad = course({ id: "bad", startDate: "2026-03-15T00:00:00.000Z" });
    expect(coursesStartingSoon([bad], NOW)).toEqual([]);
    expect(upcomingCourseDates([], [bad], NOW)).toEqual([]);
  });

  it("still emits a valid start date alongside rejected ones", () => {
    const dec28 = new Date(2026, 11, 28, 9, 30, 0);
    const bad = course({ id: "bad", startDate: "2026-13-01" });
    const ok = course({ id: "ok", name: "Course OK", startDate: "2027-01-02" });
    expect(coursesStartingSoon([bad, ok], dec28).map((c) => c.id)).toEqual(["ok"]);
    const out = upcomingCourseDates([], [bad, ok], dec28);
    expect(out.map((e) => e.courseId)).toEqual(["ok"]);
  });
});

// Round-1 bug report - SHOULD-FIX 3: the dedupe key used to omit the
// checklist item's own id, so two DIFFERENT checklist items on one course
// that happened to share a label, a one-off date and a time collapsed into
// one entry.
describe("upcomingCourseDates - dedupe keeps distinct checklist items separate (SHOULD-FIX 3)", () => {
  it("keeps two distinct checklist items separate even when label, date and time all match", () => {
    const c = course({
      weeklyChecklist: [
        checklistItem({ id: "sec1", label: "Grade essays", deadline: { weekday: 0, time: null, date: "2026-03-15" } }),
        checklistItem({ id: "sec2", label: "Grade essays", deadline: { weekday: 0, time: null, date: "2026-03-15" } }),
      ],
    });
    const out = upcomingCourseDates([c], [], NOW);
    expect(out).toHaveLength(2);
  });
});

// Round-1 bug report - SHOULD-FIX 4: a checklist deadline's time reached
// compareTimeForSort (lexicographic) and formatClockTime (Number()) raw,
// unlike every other time this module emits - an unpadded "9:05" sorted
// AFTER "17:00" as a plain string, and an out-of-range value like "25:99"
// would render as a mangled clock instead of degrading to no time.
describe("upcomingCourseDates - checklist deadline time is validated (SHOULD-FIX 4)", () => {
  it("zero-pads an unpadded checklist time so it sorts correctly against a padded one", () => {
    const c = course({
      weeklyChecklist: [
        checklistItem({ id: "late", label: "Late item", deadline: { weekday: 0, time: "17:00", date: "2026-03-15" } }),
        checklistItem({ id: "early", label: "Early item", deadline: { weekday: 0, time: "9:05", date: "2026-03-15" } }),
      ],
    });
    const out = upcomingCourseDates([c], [], NOW);
    expect(out.map((e) => e.label)).toEqual(["Early item", "Late item"]);
    expect(out[0].time).toBe("09:05");
  });

  it("rejects an out-of-range checklist time rather than emitting a mangled clock value", () => {
    const c = course({
      weeklyChecklist: [checklistItem({ label: "Garbage", deadline: { weekday: 0, time: "25:99", date: "2026-03-16" } })],
    });
    const out = upcomingCourseDates([c], [], NOW);
    expect(out).toHaveLength(1);
    expect(out[0].time).toBeNull();
  });
});

// Round-1 bug report - SHOULD-FIX 5: with a null course name, both
// `null < "Alpha"` and `"Alpha" < null` are false, so compareEntries used to
// report a===b's comparison as a tie in BOTH directions - not a stable
// order, an actually inconsistent one that can garble TimSort's output with
// more entries.
describe("upcomingCourseDates - ordering is total even with a null course name (SHOULD-FIX 5)", () => {
  it("sorts identically regardless of input order when a course name is null (legacy row)", () => {
    const x = course({ id: "x", name: null as unknown as string, endDate: "2026-03-15" });
    const y = course({ id: "y", name: "Alpha", endDate: "2026-03-15" });
    const forward = upcomingCourseDates([x, y], [], NOW).map((e) => e.courseId);
    const backward = upcomingCourseDates([y, x], [], NOW).map((e) => e.courseId);
    expect(forward).toEqual(backward);
  });
});

// Round-1 bug report - SHOULD-FIX 6: InSessionBanner renders on every route,
// so a hostile shape reaching this module (a non-array weeklyChecklist, a
// null checklist item, or a null course in the list) must degrade to "no
// entries" rather than throw and take the whole app shell down with it.
describe("hostile input shapes degrade to no entries instead of throwing (SHOULD-FIX 6)", () => {
  it("treats a non-array weeklyChecklist as empty rather than throwing", () => {
    const c = { ...course(), weeklyChecklist: {} as unknown as WeeklyChecklistItem[] };
    expect(() => upcomingCourseDates([c], [], NOW)).not.toThrow();
    expect(upcomingCourseDates([c], [], NOW)).toEqual([]);
  });

  it("skips a null checklist item rather than throwing", () => {
    const c = course({ weeklyChecklist: [null as unknown as WeeklyChecklistItem] });
    expect(() => upcomingCourseDates([c], [], NOW)).not.toThrow();
    expect(upcomingCourseDates([c], [], NOW)).toEqual([]);
  });

  it("skips a null course rather than throwing, in every course-list function", () => {
    const hostile = [null as unknown as CourseUpcomingCandidate];
    expect(() => coursesUnderWay(hostile, NOW)).not.toThrow();
    expect(coursesUnderWay(hostile, NOW)).toEqual([]);
    expect(() => coursesStartingSoon(hostile, NOW)).not.toThrow();
    expect(coursesStartingSoon(hostile, NOW)).toEqual([]);
    expect(() => upcomingCourseDates(hostile, hostile, NOW)).not.toThrow();
    expect(upcomingCourseDates(hostile, hostile, NOW)).toEqual([]);
  });
});

// Round-3 bug report - finding 1: round-2 finding 8 coerced coursesUnderWay's
// own startDate membership test "for consistency", but coursesInSession
// (courses-in-session.ts, frozen) compares course.startDate RAW - so
// coercing here made the two selectors disagree over a malformed startDate
// like "2026-02-30" (which sorts lexicographically INSIDE a plausible range
// as a plain string, exactly like an unvalidated gradesDueDate could), and
// falsified the "coursesUnderWay is a strict superset of coursesInSession"
// invariant: a course with that startDate kept its chip (coursesInSession
// admits it) but lost every grades-due/class-end/break-start/checklist entry
// (coursesUnderWay rejected it). This test used to assert the OPPOSITE of
// what is below - that the malformed-startDate course was EXCLUDED - which
// was itself the bug. Only this one assertion was authorized to change;
// every other assertion in this file is untouched.
describe("coursesUnderWay - startDate stays raw to match the frozen coursesInSession (round-3 finding 1)", () => {
  it("includes a course with an unparseable start date, matching coursesInSession, and still contributes its other valid dates without ever emitting its own start date", () => {
    const bad = course({ id: "bad", startDate: "2026-02-30", gradesDueDate: "2026-03-15" });
    const ok = course({ id: "ok", startDate: "2026-01-12", gradesDueDate: "2026-03-16" });
    const underWay = coursesUnderWay([bad, ok], NOW);
    expect(underWay.map((c) => c.id)).toEqual(["bad", "ok"]);
    const out = upcomingCourseDates(underWay, [], NOW);
    expect(out.map((e) => e.courseId).sort()).toEqual(["bad", "ok"]);
    expect(out.every((e) => e.kind !== "class-start")).toBe(true);
  });

  it("keeps the superset invariant over coursesInSession even for a course with a MALFORMED start date", () => {
    const bad = course({ id: "bad", startDate: "2026-02-30" });
    const list = [bad, course({ id: "ok", startDate: "2026-01-12" })];
    const inSession = coursesInSession(list, NOW).map((c) => c.id);
    const underWay = coursesUnderWay(list, NOW).map((c) => c.id);
    expect(inSession.every((id) => underWay.includes(id))).toBe(true);
    expect(underWay).toContain("bad");
  });

  it("treats a MALFORMED end date as open-ended rather than wrongly ending an under-way course", () => {
    // "2026-02-30" sorts LOWER than NOW's "2026-03-10" as a raw string, so
    // without endDate coercion this course would be wrongly excluded as
    // already-ended - the exact case the emit-site-only test for endDate
    // coercion (upcomingCourseDates directly) never covered, which is why
    // finding 8's break in coursesUnderWay's own membership test went
    // unnoticed.
    const c = course({ id: "c", startDate: "2026-01-12", endDate: "2026-02-30" });
    expect(coursesUnderWay([c], NOW).map((x) => x.id)).toEqual(["c"]);
  });
});

// Round-2 bug report - finding 10a: sourceId's contract used to be pinned
// only indirectly - the only test was a bare count-of-2 for two DIFFERENT
// checklist items sharing everything else. Nothing asserted sourceId
// actually equals the source item's own id, that it is absent for every
// non-checklist kind, or that dedupe still collapses two IDENTICAL checklist
// entries (same item id) reached by listing the same course twice. An
// implementation that made sourceId non-deterministic per call (e.g. a
// freshly generated value each time) could have passed every existing test
// while breaking checklist dedupe outright.
describe("upcomingCourseDates - sourceId contract (round-2 finding 10a)", () => {
  it("sets sourceId to the source checklist item's own id", () => {
    const c = course({
      weeklyChecklist: [
        checklistItem({ id: "item-9", label: "Grade essays", deadline: { weekday: 0, time: null, date: "2026-03-15" } }),
      ],
    });
    const out = upcomingCourseDates([c], [], NOW);
    expect(out).toHaveLength(1);
    expect(out[0].sourceId).toBe("item-9");
  });

  it("leaves sourceId undefined for every kind other than checklist", () => {
    const underWay = course({
      id: "u",
      endDate: "2026-03-20",
      breaks: "2026-03-16..2026-03-17 | Break",
      gradesDueDate: "2026-03-18",
      gradesDueTime: "17:00",
    });
    const startingSoon = course({ id: "s", startDate: "2026-03-16" });
    const out = upcomingCourseDates([underWay], [startingSoon], NOW);
    expect(out.map((e) => e.kind).sort()).toEqual(["break-start", "class-end", "class-start", "grades-due"]);
    for (const entry of out) {
      expect(entry.sourceId).toBeUndefined();
    }
  });

  it("still dedupes two IDENTICAL checklist entries (same item id) when the course is listed twice", () => {
    const c = course({
      weeklyChecklist: [
        checklistItem({ id: "item-1", label: "Grade essays", deadline: { weekday: 0, time: null, date: "2026-03-15" } }),
      ],
    });
    const out = upcomingCourseDates([c, { ...c }], [], NOW);
    expect(out).toHaveLength(1);
  });
});

// Round-2 bug report - finding 10b: "a missing time sorts last" (AC6) used
// to be exercised only incidentally, by a test in the general "ordering"
// describe block named for course-name ordering rather than for this rule -
// if that test were ever rewritten toward its own stated purpose, this AC6
// rule would go uncovered with no test left to catch it. Course names here
// run Alpha < Bravo < Zulu - the OPPOSITE of the expected result order - and
// the timed entries span the full range including 23:59, so this only
// passes if a missing time is genuinely treated as later than every
// specific time (not merely later than whichever time happened to be
// compared, or coincidentally right because of name order - the way the
// original version of this suite was broken).
describe("upcomingCourseDates - a missing time sorts after every timed entry on the same date (round-2 finding 10b)", () => {
  it("sorts a null-time entry last on a shared date, even when alphabetical name order says otherwise", () => {
    const untimed = course({ id: "untimed", name: "Alpha", endDate: "2026-03-15" });
    const early = course({ id: "early", name: "Bravo", gradesDueDate: "2026-03-15", gradesDueTime: "00:01" });
    const late = course({ id: "late", name: "Zulu", gradesDueDate: "2026-03-15", gradesDueTime: "23:59" });
    const out = upcomingCourseDates([untimed, early, late], [], NOW);
    expect(out.map((e) => e.courseId)).toEqual(["early", "late", "untimed"]);
  });
});
