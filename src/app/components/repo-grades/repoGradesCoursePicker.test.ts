// TDD for A6 (docs/BACKLOG.md; scratchpad/a6-ac.md section 3). Pins
// `buildCourseOptions`'s only contract: the LABEL carries both the course
// name and its institution (RULING A6-1), never normalized (RULING A6-1's
// "not folded" clause), with option order matching input order exactly.
//
// `courseOptionMatchesQuery` is deliberately NOT tested here - RULING A6-1
// withdraws it. Matching happens entirely through MUI Autocomplete's own
// default filter over the label this leaf produces, so there is no second
// predicate to pin.
import { describe, it, expect } from "vitest";
import { buildCourseOptions } from "./repoGradesCoursePicker";
import type { Course } from "@/lib/supabase/courses";
import { emptyCourseProject } from "@/lib/course-project";

/** A minimal Course fixture - only the two fields `buildCourseOptions` reads
 * are meaningful; everything else is present only because `Course` requires
 * it, matching this codebase's own "hand-built Course fixture" precedent
 * (courses.types.ts's repeated comment about not forcing every fixture to
 * grow when the type gains an unrelated field). */
function course(overrides: Partial<Course> & { id: string; name: string }): Course {
  return {
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
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("buildCourseOptions", () => {
  it("uses the course id as the option value, unchanged", () => {
    const options = buildCourseOptions([course({ id: "c1", name: "Intro Bio" })]);
    expect(options[0].value).toBe("c1");
  });

  it("puts the institution in the label, in parentheses, when present", () => {
    const options = buildCourseOptions([
      course({ id: "c1", name: "Intro Bio", institution: "State University" }),
    ]);
    expect(options[0].label).toBe("Intro Bio (State University)");
  });

  it("renders the institution AS TYPED - no case or whitespace normalization beyond trim", () => {
    const options = buildCourseOptions([
      course({ id: "c1", name: "Intro Bio", institution: "  state UNIVERSITY  " }),
    ]);
    expect(options[0].label).toBe("Intro Bio (state UNIVERSITY)");
  });

  it("falls back to a bare-name label with no parenthetical for a null institution", () => {
    const options = buildCourseOptions([course({ id: "c1", name: "Intro Bio", institution: null })]);
    expect(options[0].label).toBe("Intro Bio");
  });

  it("falls back to a bare-name label with no trailing space for an all-whitespace institution", () => {
    const options = buildCourseOptions([course({ id: "c1", name: "Intro Bio", institution: "   " })]);
    expect(options[0].label).toBe("Intro Bio");
  });

  it("still produces a selectable option for an empty course name", () => {
    const options = buildCourseOptions([course({ id: "c1", name: "", institution: "State University" })]);
    expect(options).toHaveLength(1);
    expect(options[0].value).toBe("c1");
    expect(options[0].label).toBe(" (State University)");
  });

  it("gives two same-named courses at different institutions two DIFFERENT labels - the owner's actual case", () => {
    const options = buildCourseOptions([
      course({ id: "c1", name: "Intro Bio", institution: "State University" }),
      course({ id: "c2", name: "Intro Bio", institution: "Tech College" }),
    ]);
    expect(options[0].value).not.toBe(options[1].value);
    expect(options[0].label).not.toBe(options[1].label);
    expect(options[0].label).toBe("Intro Bio (State University)");
    expect(options[1].label).toBe("Intro Bio (Tech College)");
  });

  it("preserves input order - no implicit sort or grouping by institution", () => {
    const options = buildCourseOptions([
      course({ id: "c3", name: "Zebra Studies", institution: "Z University" }),
      course({ id: "c1", name: "Algebra I", institution: "A University" }),
    ]);
    expect(options.map((o) => o.value)).toEqual(["c3", "c1"]);
  });

  it("returns an empty list for an empty course list", () => {
    expect(buildCourseOptions([])).toEqual([]);
  });
});
