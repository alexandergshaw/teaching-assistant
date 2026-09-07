import { describe, expect, it } from "vitest";
import { describeCourseIntelHistoryScope, formatCourseIntelHistoryExport } from "./CourseIntelHistory";
import type { CourseIntelHistoryEntry } from "@/lib/course-intel/history";

// Pure-function tests for CourseIntelHistory.tsx's own scope-label and
// export-formatting logic. vitest here is node-env and collects only
// src/**/*.test.ts, and NO component in this feature is ever rendered by a
// test - this file imports the module for its two plain exported functions
// only, and never mounts <CourseIntelHistory>.

function entry(overrides: Partial<CourseIntelHistoryEntry> = {}): CourseIntelHistoryEntry {
  return {
    id: "e1",
    courseId: "course-1",
    courseIds: [],
    scopeStudent: "",
    question: "What students are struggling in Ethical Hacking?",
    answerMarkdown: "S1 is missing 3 of 7 assignments.",
    citedStudents: [],
    omissions: [],
    tier: "signals",
    assembledAt: "2026-09-01T00:00:00Z",
    createdAt: "2026-09-01T00:05:00Z",
    ...overrides,
  };
}

const COURSE_NAMES = {
  "course-1": "Ethical Hacking",
  "course-2": "Networks I",
  "course-3": "Intro to Programming",
};

describe("describeCourseIntelHistoryScope", () => {
  it("names the single course for a single-course entry", () => {
    const scope = describeCourseIntelHistoryScope(entry({ courseId: "course-1", courseIds: [] }), COURSE_NAMES);
    expect(scope).toBe("Ethical Hacking");
  });

  it("falls back to a stated sentence, never a raw uuid, when the course is gone from the current list", () => {
    const scope = describeCourseIntelHistoryScope(entry({ courseId: "deleted-course-id", courseIds: [] }), COURSE_NAMES);
    expect(scope).toBe("a course no longer in your course list");
    expect(scope).not.toContain("deleted-course-id");
  });

  it("names every covered course for a cross-course entry that covers a SUBSET", () => {
    const scope = describeCourseIntelHistoryScope(
      entry({ courseId: null, courseIds: ["course-1", "course-2"] }),
      COURSE_NAMES
    );
    expect(scope).toBe("2 courses: Ethical Hacking, Networks I");
  });

  it("reports \"all N of your courses\" when the covered set equals the full current course list", () => {
    const scope = describeCourseIntelHistoryScope(
      entry({ courseId: null, courseIds: ["course-1", "course-2", "course-3"] }),
      COURSE_NAMES
    );
    expect(scope).toBe("all 3 of your courses");
  });

  it("does NOT report \"all\" when the covered set is smaller than the current course list, even by one", () => {
    const scope = describeCourseIntelHistoryScope(
      entry({ courseId: null, courseIds: ["course-1", "course-2"] }),
      COURSE_NAMES
    );
    expect(scope).not.toContain("all");
  });

  it("does NOT report \"all\" when the covered set has the same SIZE as the current list but a different course", () => {
    // Same cardinality (3 == 3) but "course-4" is not in COURSE_NAMES at all -
    // a naive length-only comparison would wrongly call this "all of your
    // courses". Sabotage target: dropping the knownIds.every(...) membership
    // check and comparing only ids.length === knownIds.length.
    const scope = describeCourseIntelHistoryScope(
      entry({ courseId: null, courseIds: ["course-1", "course-2", "course-4"] }),
      COURSE_NAMES
    );
    expect(scope).not.toContain("all");
    expect(scope).toContain("3 courses");
  });

  it("names a deleted course inside a cross-course list rather than dropping it silently", () => {
    const scope = describeCourseIntelHistoryScope(
      entry({ courseId: null, courseIds: ["course-1", "deleted-course-id"] }),
      COURSE_NAMES
    );
    expect(scope).toBe("2 courses: Ethical Hacking, a course no longer in your course list");
  });

  it("never crashes on an entry with neither courseId nor courseIds populated", () => {
    // Unreachable while course_intel_answers_course_scope_check holds, but
    // this reads rows a service-role client could in principle hand back
    // malformed - guarded, not assumed.
    expect(() => describeCourseIntelHistoryScope(entry({ courseId: null, courseIds: [] }), COURSE_NAMES)).not.toThrow();
  });
});

describe("formatCourseIntelHistoryExport", () => {
  it("reverses newest-first entries to oldest-first (the chronological reading order D8 asks for)", () => {
    const newest = entry({ id: "newest", question: "Q-newest", createdAt: "2026-09-03T00:00:00Z" });
    const oldest = entry({ id: "oldest", question: "Q-oldest", createdAt: "2026-09-01T00:00:00Z" });
    const text = formatCourseIntelHistoryExport([newest, oldest], COURSE_NAMES);

    expect(text.indexOf("Q-oldest")).toBeLessThan(text.indexOf("Q-newest"));
  });

  it("does not mutate the entries array it was given", () => {
    const list = [entry({ id: "a" }), entry({ id: "b" })];
    const copy = [...list];
    formatCourseIntelHistoryExport(list, COURSE_NAMES);
    expect(list).toEqual(copy);
  });

  it("includes the scope, question and answer for every entry", () => {
    const text = formatCourseIntelHistoryExport(
      [entry({ courseId: "course-1", question: "Who is at risk?", answerMarkdown: "S1 is at risk." })],
      COURSE_NAMES
    );
    expect(text).toContain("Scope: Ethical Hacking");
    expect(text).toContain("Question: Who is at risk?");
    expect(text).toContain("S1 is at risk.");
  });

  it("separates entries with a visible divider", () => {
    const text = formatCourseIntelHistoryExport(
      [entry({ id: "a", question: "First?" }), entry({ id: "b", question: "Second?" })],
      COURSE_NAMES
    );
    expect(text).toContain("---");
  });

  it("returns an empty string for an empty list, rather than throwing", () => {
    expect(formatCourseIntelHistoryExport([], COURSE_NAMES)).toBe("");
  });
});
