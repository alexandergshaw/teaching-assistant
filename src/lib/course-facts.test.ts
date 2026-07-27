import { describe, it, expect } from "vitest";
import { emptyCourseProject } from "@/lib/course-project";
import { renderCourseFacts } from "./course-facts";
import type { Course } from "@/lib/supabase/courses";

function baseCourse(overrides: Partial<Course> = {}): Course {
  return {
    id: "course-1",
    name: "CS 101",
    courseCode: "CS101",
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

describe("renderCourseFacts", () => {
  it("emits the fields that are set", () => {
    const text = renderCourseFacts(
      baseCourse({ textbook: "Clean Code", weeks: 15, dayTime: "MW 10:00" })
    );
    expect(text).toContain("Name: CS 101");
    expect(text).toContain("Textbook: Clean Code");
    expect(text).toContain("Weeks: 15");
    expect(text).toContain("Meets: MW 10:00");
  });

  // A wall of "(none)" lines reads to the model as recorded fact - "this
  // course has no textbook" - when it usually just means nobody filled the
  // column in.
  it("OMITS unset fields rather than reporting them as none", () => {
    const text = renderCourseFacts(baseCourse());
    expect(text).not.toContain("Textbook");
    expect(text).not.toContain("(none)");
    expect(text).not.toContain("null");
  });

  it("treats a whitespace-only value as unset", () => {
    expect(renderCourseFacts(baseCourse({ textbook: "   " }))).not.toContain("Textbook");
  });

  it("keeps a zero value, which is a real answer and not an empty one", () => {
    expect(renderCourseFacts(baseCourse({ tests: 0 }))).toContain("Tests: 0");
  });

  it("lists codebases and counts integrations", () => {
    const text = renderCourseFacts(
      baseCourse({
        repos: [{ repo: "org/one", branch: null }, { repo: "org/two", branch: null }] as Course["repos"],
        integrations: [{ name: "Canvas", value: "x" }] as unknown as Course["integrations"],
      })
    );
    expect(text).toContain("Codebases: org/one, org/two");
    expect(text).toContain("Integrations: 1 configured");
  });

  it("includes the schedule in full - it is the most useful grounding there is", () => {
    const csv = "Week,Topic\n1,Intro\n2,Loops";
    expect(renderCourseFacts(baseCourse({ csvData: csv }))).toContain(csv);
  });

  it("omits the schedule when it is blank", () => {
    expect(renderCourseFacts(baseCourse({ csvData: "   " }))).not.toContain("Schedule of topics");
  });

  it("returns a plain empty string for a course with nothing set", () => {
    const bare = renderCourseFacts(
      baseCourse({ name: "", courseCode: null })
    );
    expect(bare).toBe("");
  });
});

describe("course project grounding", () => {
  const withProject = () =>
    baseCourse({
      courseProject: {
        mode: "course-long",
        name: "Harden a small-business network",
        definition: "Assess and harden one small business end to end.",
        brief: "",
        briefFileName: "",
        milestones: [
          { week: 1, title: "Asset inventory", deliverable: "An asset register" },
          { week: 3, title: "Threat model", deliverable: "" },
        ],
        generatedAt: "",
      },
    });

  it("states the project, its definition, and every milestone", () => {
    const text = renderCourseFacts(withProject());
    expect(text).toContain("Course project: Harden a small-business network");
    expect(text).toContain("Assess and harden one small business end to end.");
    expect(text).toContain("Week 1: Asset inventory");
    expect(text).toContain("hand in An asset register");
    expect(text).toContain("Week 3: Threat model");
  });

  it("omits the deliverable clause for a milestone that has none", () => {
    const text = renderCourseFacts(withProject());
    const milestoneLine = text
      .split("\n")
      .find((l) => l.includes("Week 3: Threat model"))!;
    expect(milestoneLine).toBeDefined();
    expect(milestoneLine).not.toContain("hand in");
  });

  // Saying "(none)" would read to the model as a recorded decision that this
  // course deliberately has no project.
  it("says nothing at all when there is no project", () => {
    const text = renderCourseFacts(baseCourse());
    expect(text).not.toContain("Course project");
    expect(text).not.toContain("milestone");
  });

  it("says nothing when the project is switched off, even with milestones stored", () => {
    const off = withProject();
    const text = renderCourseFacts({
      ...off,
      courseProject: { ...off.courseProject, mode: "none" },
    });
    expect(text).not.toContain("Course project");
  });
});
