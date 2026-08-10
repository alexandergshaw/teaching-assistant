import { describe, it, expect } from "vitest";
import { computeSyllabusAckDueAt, findExistingAckQuiz, syllabusAckTaskPatch, SYLLABUS_ACK_QUIZ_TITLE, SYLLABUS_ACK_TASK_ID } from "./syllabus-ack-quiz";
import { TERM_TASKS } from "./course-tasks-catalog";

// Timezone-sensitive date math: construct the expected date with numeric
// Date(...) args (never a "YYYY-MM-DD" string, which some engines parse as
// UTC) and read the result back through LOCAL getters only, per
// docs/REGRESSION.md #248 check 7 - this is the same convention
// course-calendar-dates.ts itself documents and course-calendar-dates.test.ts
// (if present) would already exercise for parseCourseDate/addDays alone; this
// suite proves the COMBINATION (parse + addDays(3) + setHours(23,59) +
// toISOString) behaves correctly end to end, regardless of the machine's TZ.
describe("computeSyllabusAckDueAt", () => {
  it("returns start date + 3 days at 23:59 local time", () => {
    const result = computeSyllabusAckDueAt("2026-09-01");
    expect("dueAt" in result).toBe(true);
    if (!("dueAt" in result)) throw new Error("expected a dueAt");
    const due = new Date(result.dueAt);
    const expected = new Date(2026, 8, 4, 23, 59, 0, 0); // Sep 4 2026, local
    expect(due.getFullYear()).toBe(expected.getFullYear());
    expect(due.getMonth()).toBe(expected.getMonth());
    expect(due.getDate()).toBe(expected.getDate());
    expect(due.getHours()).toBe(23);
    expect(due.getMinutes()).toBe(59);
    expect(due.getSeconds()).toBe(0);
  });

  it("rolls over a month boundary correctly", () => {
    const result = computeSyllabusAckDueAt("2026-01-30");
    if (!("dueAt" in result)) throw new Error("expected a dueAt");
    const due = new Date(result.dueAt);
    const expected = new Date(2026, 1, 2, 23, 59, 0, 0); // Feb 2 2026, local
    expect(due.getFullYear()).toBe(expected.getFullYear());
    expect(due.getMonth()).toBe(expected.getMonth());
    expect(due.getDate()).toBe(expected.getDate());
  });

  it("rolls over a year boundary correctly", () => {
    const result = computeSyllabusAckDueAt("2026-12-30");
    if (!("dueAt" in result)) throw new Error("expected a dueAt");
    const due = new Date(result.dueAt);
    const expected = new Date(2027, 0, 2, 23, 59, 0, 0); // Jan 2 2027, local
    expect(due.getFullYear()).toBe(expected.getFullYear());
    expect(due.getMonth()).toBe(expected.getMonth());
    expect(due.getDate()).toBe(expected.getDate());
  });

  it("errors rather than creating a due-date-less quiz when the course has no start date (null)", () => {
    const result = computeSyllabusAckDueAt(null);
    expect("error" in result).toBe(true);
  });

  it("errors when the course has no start date (undefined)", () => {
    const result = computeSyllabusAckDueAt(undefined);
    expect("error" in result).toBe(true);
  });

  it("errors when the start date is an empty string", () => {
    const result = computeSyllabusAckDueAt("");
    expect("error" in result).toBe(true);
  });

  it("errors when the start date is whitespace-only", () => {
    const result = computeSyllabusAckDueAt("   ");
    expect("error" in result).toBe(true);
  });

  it("errors when the start date is malformed and cannot be parsed", () => {
    const result = computeSyllabusAckDueAt("not-a-date");
    expect("error" in result).toBe(true);
  });

  it("the error message names the missing start date, not a generic failure", () => {
    const result = computeSyllabusAckDueAt(null);
    if (!("error" in result)) throw new Error("expected an error");
    expect(result.error.toLowerCase()).toContain("start date");
  });

  it("the ISO output round-trips to the exact wall-clock date regardless of process TZ (toISOString only at the boundary)", () => {
    const result = computeSyllabusAckDueAt("2026-06-15");
    if (!("dueAt" in result)) throw new Error("expected a dueAt");
    // ISO string itself carries a "Z" (UTC) - proves conversion happened only
    // once, at the very end, not mid-arithmetic.
    expect(result.dueAt.endsWith("Z")).toBe(true);
  });
});

describe("findExistingAckQuiz", () => {
  it("finds a quiz whose title matches exactly", () => {
    const items = [{ id: "1", title: SYLLABUS_ACK_QUIZ_TITLE }];
    expect(findExistingAckQuiz(items)?.id).toBe("1");
  });

  it("matches case-insensitively", () => {
    const items = [{ id: "1", title: "syllabus acknowledgement" }];
    expect(findExistingAckQuiz(items)?.id).toBe("1");
  });

  it("matches with extra leading/trailing whitespace in the stored title", () => {
    const items = [{ id: "1", title: "  Syllabus Acknowledgement  " }];
    expect(findExistingAckQuiz(items)?.id).toBe("1");
  });

  it("returns undefined when no item matches", () => {
    const items = [{ id: "1", title: "Week 1 Quiz" }];
    expect(findExistingAckQuiz(items)).toBeUndefined();
  });

  it("returns undefined for an empty item list", () => {
    expect(findExistingAckQuiz([])).toBeUndefined();
  });

  it("does not match a title that merely contains the target as a substring", () => {
    const items = [{ id: "1", title: "Syllabus Acknowledgement Extra Credit" }];
    expect(findExistingAckQuiz(items)).toBeUndefined();
  });
});

describe("syllabusAckTaskPatch", () => {
  const NOW = 1_760_000_000_000;

  it("marks an unstored task done - absence and open are the same thing", () => {
    // A course whose Tasks row has never been written reads back as {}.
    expect(syllabusAckTaskPatch(undefined, NOW)).toEqual({
      "syllabus-ack-quiz": { status: "done", note: "", doneAt: NOW },
    });
    expect(syllabusAckTaskPatch({}, NOW)).toEqual({
      "syllabus-ack-quiz": { status: "done", note: "", doneAt: NOW },
    });
  });

  it("PRESERVES an existing note - a bare status object would wipe it", () => {
    // mergeStatusMap SETS the whole value at a task id rather than merging
    // into it, so writing {status:"done"} alone would silently discard the
    // instructor's note. This is the REGRESSION #250 hazard in miniature.
    const statuses = {
      "syllabus-ack-quiz": { status: "open", note: "waiting on the dean", doneAt: null },
    };
    expect(syllabusAckTaskPatch(statuses, NOW)).toEqual({
      "syllabus-ack-quiz": { status: "done", note: "waiting on the dean", doneAt: NOW },
    });
  });

  it("returns null when the task is already done, so no pointless write happens", () => {
    const statuses = {
      "syllabus-ack-quiz": { status: "done", note: "", doneAt: 1 },
    };
    expect(syllabusAckTaskPatch(statuses, NOW)).toBeNull();
  });

  it("does not re-stamp doneAt on an already-done task", () => {
    // doneAt is "the most recent transition INTO done", so bumping it on
    // every press would misreport when the work actually happened.
    const statuses = {
      "syllabus-ack-quiz": { status: "done", note: "kept", doneAt: 42 },
    };
    expect(syllabusAckTaskPatch(statuses, NOW)).toBeNull();
  });

  it("overwrites a blocked or na cell, because the quiz demonstrably exists now", () => {
    for (const status of ["blocked", "na"]) {
      const statuses = { "syllabus-ack-quiz": { status, note: "n/a for this section", doneAt: null } };
      expect(syllabusAckTaskPatch(statuses, NOW)).toEqual({
        "syllabus-ack-quiz": { status: "done", note: "n/a for this section", doneAt: NOW },
      });
    }
  });

  it("touches ONLY its own task id - every other task is left out of the patch", () => {
    const statuses = {
      "syllabus-ack-quiz": { status: "open", note: "", doneAt: null },
      "syllabus-in-lms": { status: "done", note: "keep me", doneAt: 7 },
      "textbook-owned": { status: "blocked", note: "keep me too", doneAt: null },
    };
    const patch = syllabusAckTaskPatch(statuses, NOW);
    expect(Object.keys(patch ?? {})).toEqual(["syllabus-ack-quiz"]);
  });

  it("survives a garbage statuses blob rather than throwing", () => {
    // The column is untrusted jsonb; coerceTaskCellMap drops garbage.
    expect(syllabusAckTaskPatch("not an object", NOW)).toEqual({
      "syllabus-ack-quiz": { status: "done", note: "", doneAt: NOW },
    });
    expect(syllabusAckTaskPatch([1, 2, 3], NOW)).toEqual({
      "syllabus-ack-quiz": { status: "done", note: "", doneAt: NOW },
    });
    expect(syllabusAckTaskPatch({ "syllabus-ack-quiz": "nonsense" }, NOW)).toEqual({
      "syllabus-ack-quiz": { status: "done", note: "", doneAt: NOW },
    });
  });

  it("uses the catalog's real task id, not a lookalike", () => {
    // The id is the persistence key for course_tasks.statuses and must match
    // course-tasks-catalog.ts:66 exactly or the checkbox never moves.
    expect(SYLLABUS_ACK_TASK_ID).toBe("syllabus-ack-quiz");
    expect(TERM_TASKS.some((t) => t.id === SYLLABUS_ACK_TASK_ID)).toBe(true);
  });
});
