// Gap-fill coverage for src/lib/cell-copy.ts - everything cell-copy.test.ts
// (mine, already green) does NOT cover: SortContext threading for the
// syllabus columns, the summary/patch truncation split, and the exact text
// shape of materials/courseProject/studentRepos/gradesDue/weeklyChecklist.
//
// cell-copy.ts was written by a different model than cell-copy.test.ts. Its
// doc comments describe intended behavior; where a comment and the actual
// code disagree, these tests assert what the CODE does, and any discrepancy
// is called out in the handoff report rather than "fixed" here.
import { describe, it, expect } from "vitest";
import { makeCourse } from "./courses-table-helpers.fixtures";
import { cellCopyPlan, columnTextForCopy } from "./cell-copy";
import type { SortContext } from "./courses-table-helpers";
import { describeProject } from "./course-project";

const FILE = (name: string, path: string) => ({
  name,
  path,
  size: 1024,
  addedAt: "2026-01-01T00:00:00.000Z",
});

describe("context threading - syllabusId / syllabusTemplate resolve through SortContext", () => {
  const ctx: SortContext = {
    syllabusNameById: new Map([["syl-1", "Fall syllabus"]]),
    syllabusTemplateNameById: new Map([["tpl-1", "Standard template"]]),
  };

  it("cellCopyPlan(...).summary shows the resolved syllabus NAME, not the raw id", () => {
    const course = makeCourse({ syllabusId: "syl-1" });
    const plan = cellCopyPlan(course, "syllabusId", ctx);
    if (!plan.copyable) throw new Error("syllabusId must be copyable");
    expect(plan.summary).toBe("Fall syllabus");
    expect(plan.summary).not.toContain("syl-1");
    // The patch itself still writes the raw stored id - ctx only affects the
    // human-readable summary, never what gets written.
    expect(plan.patch).toEqual({ syllabusId: "syl-1" });
  });

  it("cellCopyPlan(...).summary shows the resolved syllabus TEMPLATE name, not the raw id", () => {
    const course = makeCourse({ syllabusTemplateId: "tpl-1" });
    const plan = cellCopyPlan(course, "syllabusTemplate", ctx);
    if (!plan.copyable) throw new Error("syllabusTemplate must be copyable");
    expect(plan.summary).toBe("Standard template");
    expect(plan.summary).not.toContain("tpl-1");
    expect(plan.patch).toEqual({ syllabusTemplateId: "tpl-1" });
  });

  it("columnTextForCopy resolves syllabus names too", () => {
    const course = makeCourse({ id: "a", name: "CS 101", syllabusId: "syl-1" });
    const text = columnTextForCopy([course], "syllabusId", ctx);
    expect(text).toBe("CS 101: Fall syllabus");
  });

  it("columnTextForCopy resolves syllabus template names too", () => {
    const course = makeCourse({ id: "a", name: "CS 101", syllabusTemplateId: "tpl-1" });
    const text = columnTextForCopy([course], "syllabusTemplate", ctx);
    expect(text).toBe("CS 101: Standard template");
  });

  it("omitting ctx falls back to the raw id for the summary", () => {
    const course = makeCourse({ syllabusId: "syl-1" });
    const plan = cellCopyPlan(course, "syllabusId");
    if (!plan.copyable) throw new Error("syllabusId must be copyable");
    expect(plan.summary).toBe("syl-1");
  });

  it("omitting ctx falls back to the raw id for syllabusTemplate's summary", () => {
    const course = makeCourse({ syllabusTemplateId: "tpl-1" });
    const plan = cellCopyPlan(course, "syllabusTemplate");
    if (!plan.copyable) throw new Error("syllabusTemplate must be copyable");
    expect(plan.summary).toBe("tpl-1");
  });

  it("omitting ctx falls back to the raw id in columnTextForCopy", () => {
    const course = makeCourse({ id: "a", name: "CS 101", syllabusId: "syl-1" });
    expect(columnTextForCopy([course], "syllabusId")).toBe("CS 101: syl-1");
  });
});

describe("summary truncates but the patch does not", () => {
  it("plan.summary is shortened for a long description while plan.patch.description is the full value", () => {
    const long = "Rocket ".repeat(20).trim(); // well over 60 characters
    expect(long.length).toBeGreaterThan(60);
    const plan = cellCopyPlan(makeCourse({ description: long }), "description");
    if (!plan.copyable) throw new Error("description must be copyable");
    expect(plan.summary.length).toBeLessThan(long.length);
    expect(plan.summary).not.toBe(long);
    // The patch is what actually gets written - a copy that wrote the
    // truncated display string would be silent data loss.
    expect(plan.patch.description).toBe(long);
  });
});

describe("materials text", () => {
  it("zip name only", () => {
    const course = makeCourse({ materialsZipName: "week1.zip", materialsFiles: [] });
    const plan = cellCopyPlan(course, "materials");
    expect(plan.copyable).toBe(false);
    const text = columnTextForCopy([{ ...course, id: "a", name: "CS 101" }], "materials");
    expect(text).toBe("CS 101: week1.zip");
  });

  it("files only, no zip", () => {
    const course = makeCourse({
      id: "a",
      name: "CS 101",
      materialsZipName: null,
      materialsFiles: [FILE("handout.pdf", "p1"), FILE("slides.pptx", "p2")],
    });
    const text = columnTextForCopy([course], "materials");
    expect(text).toBe("CS 101:\n  handout.pdf\n  slides.pptx");
  });

  it("zip plus files - the zip name leads, then every file in order", () => {
    const course = makeCourse({
      id: "a",
      name: "CS 101",
      materialsZipName: "week1.zip",
      materialsFiles: [FILE("handout.pdf", "p1"), FILE("slides.pptx", "p2")],
    });
    const text = columnTextForCopy([course], "materials");
    expect(text).toBe("CS 101:\n  week1.zip\n  handout.pdf\n  slides.pptx");
  });

  it("neither zip nor files -> empty (Not set in the Copy-all block)", () => {
    const course = makeCourse({
      id: "a",
      name: "CS 101",
      materialsZipName: null,
      materialsFiles: [],
    });
    const text = columnTextForCopy([course], "materials");
    expect(text).toBe("CS 101: Not set");
  });
});

describe("courseProject text", () => {
  it("a course with no project -> empty string, NOT describeProject's own 'Not set'", () => {
    const course = makeCourse({});
    const text = columnTextForCopy([{ ...course, id: "a", name: "CS 101" }], "courseProject");
    // describeProject itself would say "Not set" for an empty project; the
    // cell-copy layer deliberately renders that as "" instead, which then
    // shows up as courseColumnLine's OWN "Not set" marker for an empty
    // string - the two happen to read the same on screen but are produced by
    // different code paths, and this pins that courseProject's cellTextValue
    // really is "" here, not describeProject's string.
    expect(text).toBe("CS 101: Not set");
    expect(describeProject(course.courseProject)).toBe("Not set");
  });

  it("a course with a project -> the same string describeProject returns", () => {
    const course = makeCourse({
      courseProject: {
        mode: "course-long",
        name: "Capstone",
        definition: "Build a thing.",
        brief: "",
        briefFileName: "",
        milestones: [{ week: 1, title: "Kickoff", deliverable: "Plan" }],
        tools: [],
        generatedAt: "",
      },
    });
    const expected = describeProject(course.courseProject);
    expect(expected).not.toBe("Not set");
    const text = columnTextForCopy([{ ...course, id: "a", name: "CS 101" }], "courseProject");
    expect(text).toBe(`CS 101: ${expected}`);
  });
});

describe("studentRepos text", () => {
  it("one line per student, in the student | canvasUserId | repo format", () => {
    const course = makeCourse({
      id: "a",
      name: "CS 101",
      studentRepos: [
        { student: "Alice", canvasUserId: "1001", repo: "org/alice-repo" },
        { student: "Bob", canvasUserId: "1002", repo: "org/bob-repo" },
      ],
    });
    const text = columnTextForCopy([course], "studentRepos");
    expect(text).toBe("CS 101:\n  Alice | 1001 | org/alice-repo\n  Bob | 1002 | org/bob-repo");
  });

  it("a row whose canvasUserId is null renders as an empty field, not the literal 'null'", () => {
    const course = makeCourse({
      id: "a",
      name: "CS 101",
      studentRepos: [{ student: "Carol", canvasUserId: null, repo: "org/carol-repo" }],
    });
    const text = columnTextForCopy([course], "studentRepos");
    expect(text).toBe("CS 101: Carol |  | org/carol-repo");
    expect(text).not.toContain("null");
  });
});

describe("gradesDue text", () => {
  it("date and time both set", () => {
    const course = makeCourse({ gradesDueDate: "2026-12-18", gradesDueTime: "17:00" });
    expect(columnTextForCopy([{ ...course, id: "a", name: "CS 101" }], "gradesDue")).toBe(
      "CS 101: 2026-12-18 17:00"
    );
  });

  it("date with no time", () => {
    const course = makeCourse({ gradesDueDate: "2026-12-18", gradesDueTime: null });
    expect(columnTextForCopy([{ ...course, id: "a", name: "CS 101" }], "gradesDue")).toBe(
      "CS 101: 2026-12-18"
    );
  });

  it("no date at all -> empty, even with a time set (a time alone is meaningless)", () => {
    const course = makeCourse({ gradesDueDate: null, gradesDueTime: "17:00" });
    expect(columnTextForCopy([{ ...course, id: "a", name: "CS 101" }], "gradesDue")).toBe(
      "CS 101: Not set"
    );
  });

  it("neither date nor time -> empty", () => {
    const course = makeCourse({ gradesDueDate: null, gradesDueTime: null });
    expect(columnTextForCopy([{ ...course, id: "a", name: "CS 101" }], "gradesDue")).toBe(
      "CS 101: Not set"
    );
  });
});

describe("weeklyChecklist copy patch when course.weeklyChecklist is undefined", () => {
  it("still carries a real array in the patch, never undefined", () => {
    const course = makeCourse({});
    // weeklyChecklist is optional on Course - simulate a row that never
    // carried the field at all, rather than the fixture's own [] default.
    delete (course as { weeklyChecklist?: unknown }).weeklyChecklist;
    expect(course.weeklyChecklist).toBeUndefined();

    const plan = cellCopyPlan(course, "weeklyChecklist");
    if (!plan.copyable) throw new Error("weeklyChecklist must be copyable");
    expect(Array.isArray(plan.patch.weeklyChecklist)).toBe(true);
    expect(plan.patch.weeklyChecklist).toEqual([]);
    expect(plan.patch.weeklyChecklist).not.toBeUndefined();
  });
});
