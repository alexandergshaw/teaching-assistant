import { describe, it, expect } from "vitest";
import { buildSyllabusFactsFromCourse, resolveSyllabusTemplateId } from "./syllabus-facts";
import type { Course } from "./supabase/courses";

function makeCourse(overrides: Partial<Course> = {}): Course {
  return {
    id: "course-1",
    name: "Intro to Databases",
    courseCode: "CS101",
    term: "Fall 2026",
    canvasUrl: null,
    repos: [],
    githubOrg: null,
    textbook: "Database Systems, 7th ed.",
    syllabusId: null,
    institution: "MCC",
    integrations: [],
    roster: null,
    notes: null,
    topics: null,
    csvName: null,
    csvData: null,
    rubricName: null,
    rubricData: null,
    startDate: "2026-09-01",
    description: "An introduction to relational databases.",
    weeks: 15,
    tests: 3,
    lms: null,
    dayTime: "MW 10:00-11:15",
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
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("buildSyllabusFactsFromCourse", () => {
  it("maps every one of the 12 keys from a fully populated course", () => {
    const course = makeCourse();
    const facts = buildSyllabusFactsFromCourse(course, { email: "prof@mcc.edu", lmsUrl: "https://canvas.mcc.edu" });
    expect(facts).toEqual({
      courseName: "Intro to Databases",
      courseCode: "CS101",
      term: "Fall 2026",
      description: "An introduction to relational databases.",
      dayTime: "MW 10:00-11:15",
      startDate: "2026-09-01",
      weeks: "15",
      tests: "3",
      textbook: "Database Systems, 7th ed.",
      email: "prof@mcc.edu",
      lmsUrl: "https://canvas.mcc.edu",
      institution: "MCC",
    });
    expect(Object.keys(facts)).toHaveLength(12);
  });

  it("maps courseName from course.name (not courseCode)", () => {
    const facts = buildSyllabusFactsFromCourse(makeCourse({ name: "Databases II", courseCode: "CS202" }), { email: "", lmsUrl: "" });
    expect(facts.courseName).toBe("Databases II");
    expect(facts.courseCode).toBe("CS202");
  });

  it("turns null numerics (weeks, tests) into empty strings, never the string \"null\"", () => {
    const facts = buildSyllabusFactsFromCourse(makeCourse({ weeks: null, tests: null }), { email: "", lmsUrl: "" });
    expect(facts.weeks).toBe("");
    expect(facts.tests).toBe("");
    expect(facts.weeks).not.toBe("null");
    expect(facts.tests).not.toBe("null");
  });

  it("keeps a zero week/test count as \"0\", not empty (0 is a real value, not absence)", () => {
    const facts = buildSyllabusFactsFromCourse(makeCourse({ weeks: 0, tests: 0 }), { email: "", lmsUrl: "" });
    expect(facts.weeks).toBe("0");
    expect(facts.tests).toBe("0");
  });

  it("turns null string fields into empty strings", () => {
    const facts = buildSyllabusFactsFromCourse(
      makeCourse({
        courseCode: null,
        term: null,
        description: null,
        dayTime: null,
        startDate: null,
        textbook: null,
        institution: null,
      }),
      { email: "", lmsUrl: "" }
    );
    expect(facts.courseCode).toBe("");
    expect(facts.term).toBe("");
    expect(facts.description).toBe("");
    expect(facts.dayTime).toBe("");
    expect(facts.startDate).toBe("");
    expect(facts.textbook).toBe("");
    expect(facts.institution).toBe("");
  });

  it("leaves already-blank string fields blank rather than substituting a placeholder", () => {
    const facts = buildSyllabusFactsFromCourse(makeCourse({ description: "" }), { email: "", lmsUrl: "" });
    expect(facts.description).toBe("");
  });

  it("passes email and lmsUrl through from the extra argument, independent of the course row", () => {
    const facts = buildSyllabusFactsFromCourse(makeCourse(), { email: "instructor@example.edu", lmsUrl: "https://lms.example.edu" });
    expect(facts.email).toBe("instructor@example.edu");
    expect(facts.lmsUrl).toBe("https://lms.example.edu");
  });

  it("leaves email and lmsUrl blank when the institution has neither set", () => {
    const facts = buildSyllabusFactsFromCourse(makeCourse(), { email: "", lmsUrl: "" });
    expect(facts.email).toBe("");
    expect(facts.lmsUrl).toBe("");
  });

  it("trims leading/trailing whitespace from the email extra", () => {
    const facts = buildSyllabusFactsFromCourse(makeCourse(), { email: "  a@b.edu\n", lmsUrl: "" });
    expect(facts.email).toBe("a@b.edu");
  });

  it("trims leading/trailing whitespace from the lmsUrl extra", () => {
    const facts = buildSyllabusFactsFromCourse(makeCourse(), { email: "", lmsUrl: "  https://lms.example.edu\n" });
    expect(facts.lmsUrl).toBe("https://lms.example.edu");
  });

  it("turns a whitespace-only email or lmsUrl extra into an empty string, not the whitespace itself", () => {
    const facts = buildSyllabusFactsFromCourse(makeCourse(), { email: "   ", lmsUrl: "\n\t " });
    expect(facts.email).toBe("");
    expect(facts.lmsUrl).toBe("");
  });
});

describe("resolveSyllabusTemplateId", () => {
  it("course value set, institution set - the course column wins", () => {
    const result = resolveSyllabusTemplateId("course-tpl", [
      { id: "syllabusTemplate", value: "inst-tpl" },
    ]);
    expect(result).toEqual({ templateId: "course-tpl", source: "course" });
  });

  it("course blank, institution set - falls through to the institution field", () => {
    const result = resolveSyllabusTemplateId("", [
      { id: "syllabusTemplate", value: "inst-tpl" },
    ]);
    expect(result).toEqual({ templateId: "inst-tpl", source: "institution" });
  });

  it("course null/undefined, institution set - falls through to the institution field", () => {
    expect(
      resolveSyllabusTemplateId(null, [{ id: "syllabusTemplate", value: "inst-tpl" }])
    ).toEqual({ templateId: "inst-tpl", source: "institution" });
    expect(
      resolveSyllabusTemplateId(undefined, [{ id: "syllabusTemplate", value: "inst-tpl" }])
    ).toEqual({ templateId: "inst-tpl", source: "institution" });
  });

  it("course whitespace-only, institution set - the institution field wins, not the blank course value", () => {
    const result = resolveSyllabusTemplateId("   ", [
      { id: "syllabusTemplate", value: "inst-tpl" },
    ]);
    expect(result).toEqual({ templateId: "inst-tpl", source: "institution" });
  });

  it("both blank - templateId empty, source none", () => {
    const result = resolveSyllabusTemplateId("", [{ id: "syllabusTemplate", value: "" }]);
    expect(result).toEqual({ templateId: "", source: "none" });
  });

  it("institution fields array empty - handled, source none", () => {
    const result = resolveSyllabusTemplateId("", []);
    expect(result).toEqual({ templateId: "", source: "none" });
  });

  it("institution fields missing the syllabusTemplate id entirely - handled, source none", () => {
    const result = resolveSyllabusTemplateId(null, [
      { id: "email", value: "prof@mcc.edu" },
      { id: "lmsUrl", value: "https://canvas.mcc.edu" },
    ]);
    expect(result).toEqual({ templateId: "", source: "none" });
  });

  it("institution field present but whitespace-only value - treated as absent (source none)", () => {
    const result = resolveSyllabusTemplateId("", [{ id: "syllabusTemplate", value: "   " }]);
    expect(result).toEqual({ templateId: "", source: "none" });
  });

  it("institution field present but whitespace-only value, course also blank - still none (not a false institution win)", () => {
    const result = resolveSyllabusTemplateId(undefined, [
      { id: "syllabusTemplate", value: "   " },
    ]);
    expect(result.source).toBe("none");
    expect(result.templateId).toBe("");
  });

  it("trims a padded course value in the returned templateId", () => {
    const result = resolveSyllabusTemplateId("  course-tpl  ", [
      { id: "syllabusTemplate", value: "inst-tpl" },
    ]);
    expect(result).toEqual({ templateId: "course-tpl", source: "course" });
  });

  it("trims a padded institution value in the returned templateId", () => {
    const result = resolveSyllabusTemplateId("", [
      { id: "syllabusTemplate", value: "  inst-tpl  " },
    ]);
    expect(result).toEqual({ templateId: "inst-tpl", source: "institution" });
  });
});
