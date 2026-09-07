// Tests for ./cross-course-prompt - the block and the turns for an answer
// that spans courses.
//
// TWO PROPERTIES THIS FILE EXISTS FOR:
//
//  1. THE ANSWER'S OWN STUDENT NUMBERING (D24g). Each course numbers its
//     students from 1, so S3 means a different person in each of them. A
//     collision in the one field this feature uses instead of a name is the
//     worst kind available - the answer reads normally and is about the wrong
//     person - so the offsets are asserted directly, on courses that all start
//     at 1.
//  2. NO NAME REACHES THE MODEL. Not a student's, and not a course's. The
//     fixtures below carry REAL-LOOKING names precisely so the assertion has
//     something to find if the rendering ever interpolates one.
//
// The fixtures are local rather than imported from a sibling *.test.ts: this
// repo has already been bitten by a cross-test-file import re-running the
// other file's describe blocks.

import { describe, it, expect } from "vitest";

import {
  MAX_CROSS_COURSE_CONCERN_ROWS,
  buildCrossCourseContext,
  buildCrossCourseTurns,
  renderPromptCoverage,
  renderRollupLine,
  superlativeContract,
} from "./cross-course-prompt";
import type { CourseSignalRollup, CrossCourseSlice } from "./cross-course";
import type { ConcernRow, LmsConnection } from "./types";

const NONCE = "nonce-2f8c1a";

const LIVE: LmsConnection = { state: "live" };
const NO_LINK: LmsConnection = { state: "unavailable", reason: "no-lms-course", detail: "No Canvas URL." };
const DOWN: LmsConnection = { state: "unavailable", reason: "unreachable", detail: "Canvas returned 503." };

function rollup(over: Partial<CourseSignalRollup> = {}): CourseSignalRollup {
  return {
    students: 2,
    studentsMeasured: 2,
    consideredSubmissions: 16,
    missing: 6,
    late: 4,
    graded: 10,
    awaitingGrade: 2,
    concernRows: 2,
    insufficientData: 0,
    clear: 3,
    ...over,
  };
}

function concernRow(index: number): ConcernRow {
  return {
    studentIndex: index,
    userId: 4000 + index,
    identitySource: "lms-roster",
    signals: [{ kind: "late-work", label: "2 late submissions", value: 2 }],
    sortWeight: 200,
  };
}

/** Two courses that BOTH number their students from 1 - the collision this
 *  module exists to prevent, present in every fixture rather than in one
 *  special case. */
const HACKING: CrossCourseSlice = {
  courseId: "c-hack",
  name: "Ethical Hacking",
  connection: LIVE,
  rollup: rollup(),
  concernRows: [concernRow(1), concernRow(2)],
  students: [
    { index: 1, name: "Ada Lovelace", userId: 4001 },
    { index: 2, name: "Grace Hopper", userId: 4002 },
  ],
};

const NETWORKING: CrossCourseSlice = {
  courseId: "c-net",
  name: "Computer Networking",
  connection: NO_LINK,
  rollup: rollup({ missing: null, late: null, consideredSubmissions: null, awaitingGrade: null, clear: 5 }),
  concernRows: [{ ...concernRow(1), userId: null, identitySource: "course-roster-name" }],
  students: [{ index: 1, name: "Katherine Johnson", userId: null }],
};

function context(slices: readonly CrossCourseSlice[] = [HACKING, NETWORKING]) {
  return buildCrossCourseContext({ slices, nonce: NONCE });
}

function allPromptText(slices: readonly CrossCourseSlice[] = [HACKING, NETWORKING]): string {
  const built = context(slices);
  const turns = buildCrossCourseTurns({
    contextBlock: built.text,
    nonce: NONCE,
    questionForModel: "what courses have had the least amount of items turned in late",
    courseCount: built.courses.length,
    superlative: built.superlative,
  });
  return turns.map((turn) => turn.parts.map((part) => ("text" in part ? part.text : "")).join("\n")).join("\n\n");
}

// ---------------------------------------------------------------------------
// The answer's own student numbering (D24g).
// ---------------------------------------------------------------------------

describe("student indices across courses", () => {
  it("offsets each course so two courses' S1 never collide", () => {
    const built = context();
    expect(built.courses.map((c) => c.studentIndexOffset)).toEqual([0, 2]);
    expect(built.concernRows.map((row) => row.studentIndex)).toEqual([1, 2, 3]);
    // Every index in the answer is distinct - the property, not just the
    // arithmetic that produced it.
    const indices = built.concernRows.map((row) => row.studentIndex);
    expect(new Set(indices).size).toBe(indices.length);
  });

  it("resolves each global index back to the right person in the right course", () => {
    const built = context();
    expect(built.students).toEqual([
      { index: 1, courseIndex: 1, name: "Ada Lovelace", userId: 4001 },
      { index: 2, courseIndex: 1, name: "Grace Hopper", userId: 4002 },
      { index: 3, courseIndex: 2, name: "Katherine Johnson", userId: null },
    ]);
  });

  it("marks the same global indices it rendered, so a citation resolves", () => {
    const built = context();
    expect(built.markedStudents.map((s) => s.index)).toEqual(built.concernRows.map((r) => r.studentIndex));
  });

  it("never fills a student's null Canvas id from the concern row beside it", () => {
    // `null` here is a FACT the offline identity index reports rather than
    // guesses (D19f): this student has no cached Canvas id. Coalescing it from
    // the row would launder a matched name into the one field this design
    // treats as ground truth, and every consumer downstream would stop
    // distinguishing a verified identity from a matched one.
    const mismatched: CrossCourseSlice = {
      ...NETWORKING,
      concernRows: [concernRow(1)],
      students: [{ index: 1, name: "Katherine Johnson", userId: null }],
    };
    expect(context([mismatched]).students[0].userId).toBeNull();
  });

  it("offsets by the HIGHEST index a course used, not by how many students it has", () => {
    // An off-roster participant appended after a gap leaves a hole. Offsetting
    // by the count would put this course's S5 on the next course's S4.
    const gappy: CrossCourseSlice = {
      ...HACKING,
      students: [{ index: 5, name: "Ada Lovelace", userId: 4001 }],
      concernRows: [concernRow(5)],
    };
    const built = context([gappy, NETWORKING]);
    expect(built.courses.map((c) => c.studentIndexOffset)).toEqual([0, 5]);
    expect(built.concernRows.map((r) => r.studentIndex)).toEqual([5, 6]);
  });
});

// ---------------------------------------------------------------------------
// No name reaches the model.
// ---------------------------------------------------------------------------

describe("what the model is shown", () => {
  it("contains no course name and no student name anywhere in the turns", () => {
    const text = allPromptText();
    for (const name of ["Ethical Hacking", "Computer Networking", "Ada Lovelace", "Grace Hopper", "Katherine Johnson"]) {
      expect(text, `${name} must never reach a prompt`).not.toContain(name);
    }
  });

  it("identifies courses and students by marker instead", () => {
    const text = allPromptText();
    expect(text).toContain("C1");
    expect(text).toContain("C2");
    expect(text).toContain("S3");
  });

  it("carries the per-request nonce in the block header", () => {
    expect(context().text).toContain(`=== COURSE SIGNALS ${NONCE} ===`);
  });

  it("keeps the instructor's own course names on the BROWSER side of the same object", () => {
    const built = context();
    expect(built.courses.map((c) => c.name)).toEqual(["Ethical Hacking", "Computer Networking"]);
    expect(built.coverageLines.join(" ")).toContain("Ethical Hacking");
  });
});

// ---------------------------------------------------------------------------
// Coverage, in both renderings.
// ---------------------------------------------------------------------------

describe("coverage", () => {
  it("states every course's mode to the model, by marker", () => {
    const built = context();
    const coverage = renderPromptCoverage(built.courses);
    expect(coverage.split("\n")).toHaveLength(2);
    expect(coverage).toContain("C1: read from the LMS.");
    expect(coverage).toContain("C2: read from work recorded outside any LMS.");
  });

  it("marks a course whose LMS was not read as not comparable", () => {
    const built = context([HACKING, { ...NETWORKING, connection: DOWN }]);
    expect(renderPromptCoverage(built.courses)).toContain("THE LMS WAS NOT READ");
    expect(built.superlative).toBe("partial");
  });

  it("reports the coverage for the browser even when every course succeeded", () => {
    const built = context([HACKING, { ...NETWORKING, connection: LIVE }]);
    expect(built.coverageLines).toHaveLength(2);
  });

  it("sums the clear students across courses", () => {
    expect(context().clearCount).toBe(8);
  });
});

describe("renderRollupLine", () => {
  it("says a count could not be computed rather than writing a zero", () => {
    const line = renderRollupLine("C2", rollup({ missing: null, late: null, consideredSubmissions: null }), "recorded");
    expect(line).toContain("missing work could not be computed for this course");
    expect(line).toContain("late work could not be computed for this course");
    expect(line).not.toContain("0 items turned in late");
  });

  it("writes both numbers of a missing count from the same denominator", () => {
    expect(renderRollupLine("C1", rollup(), "live")).toContain("6 of 16 considered items missing");
  });

  it("names how many students the counts are actually over", () => {
    expect(renderRollupLine("C1", rollup({ students: 30, studentsMeasured: 12 }), "live")).toContain(
      "30 students on this course's list, 12 of them with a measurable work record"
    );
  });
});

// ---------------------------------------------------------------------------
// The superlative rule (D24e).
// ---------------------------------------------------------------------------

describe("superlativeContract", () => {
  it("forbids a bare superlative when the coverage is partial", () => {
    const partial = superlativeContract("partial");
    expect(partial).toContain("NOT directly comparable");
    expect(partial).toContain("Do not write a bare superlative");
    expect(partial).toContain("name the set it ranked over");
    expect(partial).toContain("NOT a course with a zero");
  });

  it("permits a direct comparison when every course was read the same way", () => {
    const complete = superlativeContract("complete");
    expect(complete).toContain("you may compare them directly");
    expect(complete).not.toContain("Do not write a bare superlative");
  });

  it("puts the partial rule into the turns, and repeats it last", () => {
    const text = allPromptText();
    expect(text).toContain("Do not write a bare superlative");
    // The last instruction over a long record carries the most weight.
    const lastRemember = text.lastIndexOf("REMEMBER:");
    expect(text.slice(lastRemember)).toContain("name the set it ranked over");
  });

  it("does not carry the partial rule when every course was read the same way", () => {
    const text = allPromptText([HACKING, { ...NETWORKING, connection: LIVE, rollup: rollup() }]);
    expect(text).not.toContain("Do not write a bare superlative");
  });
});

// ---------------------------------------------------------------------------
// The cap.
// ---------------------------------------------------------------------------

describe("the concern row cap", () => {
  it("states what it left out rather than shortening the list silently", () => {
    const many: CrossCourseSlice = {
      ...HACKING,
      concernRows: Array.from({ length: MAX_CROSS_COURSE_CONCERN_ROWS + 4 }, (_, i) => concernRow(i + 1)),
      students: Array.from({ length: MAX_CROSS_COURSE_CONCERN_ROWS + 4 }, (_, i) => ({
        index: i + 1,
        name: `Student ${i + 1}`,
        userId: 4000 + i,
      })),
    };
    const built = context([many]);
    expect(built.concernRows).toHaveLength(MAX_CROSS_COURSE_CONCERN_ROWS);
    expect(built.omittedConcernRows).toBe(4);
    expect(built.text).toContain("4 further student rows exist and were not included");
    expect(built.text).toContain("NOT the complete set");
  });

  it("says nothing about a cap that did not fire", () => {
    const built = context();
    expect(built.omittedConcernRows).toBe(0);
    expect(built.text).not.toContain("further student rows exist");
  });
});
