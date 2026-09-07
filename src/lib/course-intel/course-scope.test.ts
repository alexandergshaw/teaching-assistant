// Tests for ./course-scope - the module that decides which course a question
// is about now that there is no picker (D24b).
//
// THE COLLISION IS THE HEADLINE. The same course runs every term, so two
// "Ethical Hacking" rows are the normal case rather than the edge case, and
// the two things that matter about them are asserted in both directions here:
// that the in-session row wins when there is exactly one, and that the refusal
// SHOWS THE TERMS when there is not - because a refusal listing two identical
// names is unanswerable, and a term-qualified retype has to actually work.
//
// The fixtures are local rather than imported from a sibling *.test.ts: this
// repo has already been bitten by a cross-test-file import re-running the
// other file's describe blocks.

import fs from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";

import {
  MIN_COURSE_FORM_CHARS,
  assertNoCourseNameRemains,
  courseNameVariants,
  renderCourseMarker,
  scopeCourseIntelCourses,
  type CourseScopeResult,
  type ScopeCourseEntry,
} from "./course-scope";

// ---------------------------------------------------------------------------
// Fixtures.
// ---------------------------------------------------------------------------

function course(over: Partial<ScopeCourseEntry> & { courseId: string; name: string }): ScopeCourseEntry {
  return { courseCode: null, term: null, active: false, ...over };
}

const HACKING_FALL = course({
  courseId: "c-hack-fall",
  name: "Ethical Hacking",
  courseCode: "CIS-4200-01",
  term: "Fall 2026",
  active: true,
});
const HACKING_SPRING = course({
  courseId: "c-hack-spring",
  name: "Ethical Hacking",
  courseCode: "CIS-4200-02",
  term: "Spring 2026",
  active: false,
});
const NETWORKING = course({
  courseId: "c-net",
  name: "Computer Networking",
  courseCode: "CIS-3100",
  term: "Fall 2026",
  active: true,
});

/** The scoped branch, or a failure naming what came back instead. */
function scoped(result: CourseScopeResult) {
  if (result.status !== "scoped") {
    throw new Error(`expected a scoped result, got ${result.status}`);
  }
  return result;
}

function ambiguous(result: CourseScopeResult) {
  if (result.status !== "ambiguous") {
    throw new Error(`expected an ambiguous result, got ${result.status}`);
  }
  return result;
}

// ---------------------------------------------------------------------------
// The three scopes.
// ---------------------------------------------------------------------------

describe("scopeCourseIntelCourses", () => {
  it("resolves a question that names one course to that course", () => {
    const result = scoped(
      scopeCourseIntelCourses({
        question: "what students are struggling in Ethical Hacking?",
        courses: [HACKING_FALL, NETWORKING],
      })
    );
    expect(result.kind).toBe("one-course");
    expect(result.courseIds).toEqual(["c-hack-fall"]);
  });

  it("treats a question that names NO course as the all-courses scope", () => {
    // The owner's second question verbatim, and the one the picker made
    // impossible to ask at all.
    const result = scoped(
      scopeCourseIntelCourses({
        question: "what courses have had the least amount of items turned in late",
        courses: [HACKING_FALL, NETWORKING],
      })
    );
    expect(result.kind).toBe("all-courses");
    // Concrete, and in the instructor's own list order - never an empty list
    // the caller has to know to expand.
    expect(result.courseIds).toEqual(["c-hack-fall", "c-net"]);
  });

  it("answers a question naming two courses over exactly those two, in list order", () => {
    const result = scoped(
      scopeCourseIntelCourses({
        question: "is Computer Networking behind Ethical Hacking on late work?",
        courses: [HACKING_FALL, NETWORKING],
      })
    );
    expect(result.kind).toBe("some-courses");
    // LIST order, not mention order: the C-marker for a course is its position
    // here, and two phrasings of the same question must number the same
    // courses the same way.
    expect(result.courseIds).toEqual(["c-hack-fall", "c-net"]);
  });
});

// ---------------------------------------------------------------------------
// The every-term collision.
// ---------------------------------------------------------------------------

describe("two courses with the same name", () => {
  it("resolves to the term the course list says is in session", () => {
    const result = scoped(
      scopeCourseIntelCourses({
        question: "what students are struggling in Ethical Hacking?",
        courses: [HACKING_SPRING, HACKING_FALL],
      })
    );
    expect(result.courseIds).toEqual(["c-hack-fall"]);
  });

  it("reports the row it set aside, with its term, rather than resolving silently", () => {
    const result = scoped(
      scopeCourseIntelCourses({
        question: "how is Ethical Hacking going?",
        courses: [HACKING_SPRING, HACKING_FALL],
      })
    );
    expect(result.activeTermPicks).toEqual([
      {
        matchedText: "Ethical Hacking",
        courseId: "c-hack-fall",
        setAside: [{ courseId: "c-hack-spring", term: "Spring 2026" }],
      },
    ]);
  });

  it("REFUSES with the terms shown when no single row is in session", () => {
    const result = ambiguous(
      scopeCourseIntelCourses({
        question: "what students are struggling in Ethical Hacking?",
        courses: [{ ...HACKING_FALL, active: false }, HACKING_SPRING],
      })
    );
    expect(result.matchedText).toBe("Ethical Hacking");
    // The term is the ONLY thing distinguishing the two rows, so a refusal
    // that did not carry it would be unanswerable.
    expect(result.candidates).toEqual([
      { courseId: "c-hack-fall", term: "Fall 2026" },
      { courseId: "c-hack-spring", term: "Spring 2026" },
    ]);
  });

  it("REFUSES when BOTH rows are in session - two actives is not a tiebreak", () => {
    const result = ambiguous(
      scopeCourseIntelCourses({
        question: "how is Ethical Hacking going?",
        courses: [HACKING_FALL, { ...HACKING_SPRING, active: true }],
      })
    );
    expect(result.candidates.map((c) => c.courseId)).toEqual(["c-hack-fall", "c-hack-spring"]);
  });

  it("makes the refusal answerable: the term-qualified name resolves it", () => {
    // The whole point of showing the terms. If retyping what the refusal
    // printed did not resolve, the refusal would be a dead end.
    const result = scoped(
      scopeCourseIntelCourses({
        question: "what students are struggling in Ethical Hacking Spring 2026?",
        courses: [{ ...HACKING_FALL, active: false }, HACKING_SPRING],
      })
    );
    expect(result.kind).toBe("one-course");
    expect(result.courseIds).toEqual(["c-hack-spring"]);
  });

  it("resolves a collision by course code too", () => {
    const result = scoped(
      scopeCourseIntelCourses({
        question: "how is CIS 4200 02 doing?",
        courses: [{ ...HACKING_FALL, active: false }, HACKING_SPRING],
      })
    );
    expect(result.courseIds).toEqual(["c-hack-spring"]);
  });
});

// ---------------------------------------------------------------------------
// The rewrite - the half ./prompt cannot verify.
// ---------------------------------------------------------------------------

describe("the question rewrite", () => {
  it("replaces the course name with its marker and leaves no name behind", () => {
    const result = scoped(
      scopeCourseIntelCourses({
        question: "what students are struggling in Ethical Hacking?",
        courses: [HACKING_FALL, NETWORKING],
      })
    );
    expect(result.questionForModel).toBe("what students are struggling in C1?");
    expect(result.questionForModel).not.toContain("Ethical Hacking");
  });

  it("rewrites EVERY occurrence, not only the first", () => {
    const result = scoped(
      scopeCourseIntelCourses({
        question: "Ethical Hacking - how is Ethical Hacking doing?",
        courses: [HACKING_FALL],
      })
    );
    expect(result.questionForModel).toBe("C1 - how is C1 doing?");
  });

  it("numbers markers by position in the answer, not by mention order", () => {
    const result = scoped(
      scopeCourseIntelCourses({
        question: "compare Computer Networking with Ethical Hacking",
        courses: [HACKING_FALL, NETWORKING],
      })
    );
    // Networking is mentioned first and is second in the list, so it is C2.
    expect(result.questionForModel).toBe("compare C2 with C1");
    expect(renderCourseMarker(2)).toBe("C2");
  });

  it("leaves a question that named no course exactly as it was typed", () => {
    const question = "what courses have had the least amount of items turned in late";
    const result = scoped(scopeCourseIntelCourses({ question, courses: [HACKING_FALL, NETWORKING] }));
    expect(result.questionForModel).toBe(question);
  });

  it("throws rather than returning when a course name survives", () => {
    // UNREACHABLE ON CORRECT CODE, and exported for exactly that reason: an
    // inline assertion would be a line no test could ever drive.
    expect(() => assertNoCourseNameRemains("how is Ethical Hacking doing", [HACKING_FALL])).toThrow(
      /course name survived/
    );
    expect(() => assertNoCourseNameRemains("how is C1 doing", [HACKING_FALL])).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// What must NOT match.
// ---------------------------------------------------------------------------

describe("what a course name is allowed to match", () => {
  it("never lets a one-word course name that is an ordinary word eat a question", () => {
    // A course really called "Late" would otherwise consume the last word of
    // the owner's own cross-course question and narrow it to one course, which
    // looks entirely normal on screen.
    const late = course({ courseId: "c-late", name: "Late" });
    expect(courseNameVariants(late)).toEqual([]);
    const result = scoped(
      scopeCourseIntelCourses({
        question: "what courses have had the least amount of items turned in late",
        courses: [late, NETWORKING],
      })
    );
    expect(result.kind).toBe("all-courses");
  });

  it("never matches a form shorter than the minimum", () => {
    const tiny = course({ courseId: "c-ai", name: "AI" });
    expect("AI".length).toBeLessThan(MIN_COURSE_FORM_CHARS);
    expect(courseNameVariants(tiny)).toEqual([]);
    expect(scoped(scopeCourseIntelCourses({ question: "how is AI doing", courses: [tiny] })).kind).toBe(
      "all-courses"
    );
  });

  it("matches a whole name only - never one of its words", () => {
    // "Hacking" alone must not resolve: a course name's tokens are ordinary
    // words in a way a student's surname is not, and the safe failure here is
    // an all-courses answer the instructor can see is wider than they asked.
    const result = scoped(
      scopeCourseIntelCourses({ question: "who is struggling with hacking?", courses: [HACKING_FALL] })
    );
    expect(result.kind).toBe("all-courses");
  });

  it("matches a course code written with any of the separators people use", () => {
    for (const typed of ["CIS-3100", "CIS 3100", "cis3100"]) {
      const result = scoped(scopeCourseIntelCourses({ question: `how is ${typed} doing`, courses: [NETWORKING] }));
      expect(result.courseIds, typed).toEqual(["c-net"]);
    }
  });

  it("does not match a name inside a longer word", () => {
    const result = scoped(
      scopeCourseIntelCourses({ question: "is Computer Networkings a course?", courses: [NETWORKING] })
    );
    expect(result.kind).toBe("all-courses");
  });
});

describe("courseNameVariants", () => {
  it("carries the four complete forms and no fragments", () => {
    expect(new Set(courseNameVariants(HACKING_FALL))).toEqual(
      new Set(["ethical hacking", "cis 4200 01", "ethical hacking fall 2026", "cis 4200 01 fall 2026"])
    );
  });
});

// ---------------------------------------------------------------------------
// REACHABILITY. A scoper that resolves perfectly and is never called ships a
// feature that still has a picker, and a rewrite that is never applied ships
// course names to a third-party model - both with every unit test green. The
// chain is traced through source text, the same discipline this feature's
// other reachability canaries use.
// ---------------------------------------------------------------------------

describe("the course scope is actually reachable from the ask route", () => {
  const read = (rel: string) => fs.readFileSync(path.resolve(process.cwd(), rel), "utf-8");
  const route = () => read("src/app/api/course-intel/ask/route.ts");

  it("the route resolves the course FROM THE QUESTION", () => {
    expect(route()).toContain('from "@/lib/course-intel/course-scope"');
    expect(route()).toMatch(/scopeCourseIntelCourses\(\{/);
  });

  it("the in-session flag comes from the app's own frozen rule, not a second one", () => {
    // A private re-derivation here would eventually disagree with the "courses
    // in session" banner at the top of the page about the same course on the
    // same day.
    expect(route()).toContain('from "@/lib/courses-in-session"');
    expect(route()).toMatch(/coursesInSession\(courses, new Date\(\)\)/);
  });

  it("the student scoper is fed the COURSE-REWRITTEN question, not the raw one", () => {
    // The composition order is the whole point: the course rewrite only ever
    // removes text, so a student name that survives it is still there for the
    // student scoper to find. Feeding the raw question here would send every
    // course name to the model inside the question itself, with the rewrite
    // computed and thrown away.
    const source = route();
    // Counted rather than pattern-matched around: EVERY call must be fed the
    // rewritten question, so a second call added later that forgets is caught
    // by the counts disagreeing rather than by a regex that happened to look
    // at the first one.
    const calls = source.split("scopeCourseIntelQuestion({").length - 1;
    const fed = source.split("question: questionForModel").length - 1;
    expect(calls, "no scopeCourseIntelQuestion call found - re-point this check").toBeGreaterThan(0);
    expect(fed).toBe(calls);
  });

  it("no prompt in this feature is handed a real course name", () => {
    // `courseName` and `courseLabel` are the two fields that reach a model:
    // ./context-block renders the first straight into the signals block, and
    // ./prompt puts the second in the concern instruction's lead sentence.
    for (const rel of [
      "src/app/api/course-intel/ask/route.ts",
      "src/lib/course-intel/offline-answer.ts",
      "src/lib/course-intel/cross-course.ts",
      "src/lib/course-intel/cross-course-answer.ts",
    ]) {
      const source = read(rel);
      expect(source, `${rel} must not pass a course name to a prompt`).not.toMatch(
        /course(Name|Label):\s*\w+\.name/
      );
    }
    // And the positive half: the single-course path passes the C1 marker.
    expect(route()).toMatch(/const promptCourseLabel = renderCourseMarker\(1\)/);
    expect(route()).toMatch(/promptLabel: promptCourseLabel/);
  });

  it("the LIVE single-course answer states its coverage too, not only the offline one", () => {
    // D24e says ALWAYS, not "when something failed" - and the live success
    // response is the one place in this feature where nothing failed, so it is
    // the branch most likely to be written without it. It is also the only
    // thing on screen naming the course a question resolved to.
    const source = route();
    const success = source.slice(source.lastIndexOf("return NextResponse.json({"));
    expect(success).toContain("coverageLines: describeCourseCoverage(");
    expect(success).toContain("mode: courseReadMode(");
    expect(success).toContain("students: assembly.students.map(");
  });

  it("the browser puts the course names back", () => {
    // The model wrote C1; the instructor must read the course. A hook that
    // resolved only S markers would leave bare "C2" in the prose, which is the
    // marker leaking out the other end.
    const hook = read("src/app/components/course-intel/useCourseIntel.ts");
    expect(hook).toMatch(/substituteMarkers\(withNames, "C", courseLabelByIndex\)/);
  });

  it("the picker is gone from the view", () => {
    const view = read("src/app/components/course-intel/index.tsx");
    expect(view).not.toContain("MenuItem");
    expect(view).not.toContain("setCourseId");
    expect(view).not.toMatch(/select\s*$/m);
  });
});
