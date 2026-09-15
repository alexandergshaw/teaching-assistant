import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { emptyCourseProject } from "@/lib/course-project";
import { renderCourseFacts } from "./course-facts";
import type { Course } from "@/lib/supabase/courses";
import type { WeeklyChecklistItem } from "@/lib/weekly-checklist";

function checklistItem(overrides: Partial<WeeklyChecklistItem> & Pick<WeeklyChecklistItem, "label" | "checked">): WeeklyChecklistItem {
  return {
    id: "item-1",
    checkedAt: null,
    deadline: null,
    ...overrides,
  };
}

// AC-REACH-1 (Ruling A1-9): a source-text assertion that AskAiModal's
// renderCourseFacts call passes the opt-in, following the live precedent at
// src/app/components/snapshot-grading/snapshot-role-setrole-callsites.structure.test.ts.
// Without this, flipping the includeStudentData boolean at the call site
// ships the feature completely dead while every other criterion, tsc, lint,
// and build stay green.
function readAskAiModalSource(): string {
  const filePath = path.resolve(
    process.cwd(),
    "src/app/components/courses/AskAiModal.tsx"
  );
  return fs.readFileSync(filePath, "utf-8");
}

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

  it("returns a plain empty string for a course with nothing set, even with the opt-in enabled", () => {
    // AC-EMPTY: weeklyChecklist and gradesDueDate are left absent (their
    // natural, already-untyped state in baseCourse()) - roster is already
    // null there. includeStudentData: true confirms the empty-course
    // contract holds even when the caller asks for student data that does
    // not exist.
    const bare = renderCourseFacts(
      baseCourse({ name: "", courseCode: null }),
      { includeStudentData: true }
    );
    expect(bare).toBe("");
  });
});

describe("renderCourseFacts - student data gate (AC-GATE-1/2, Rulings A1-3/A1-4/A1-7/A1-8)", () => {
  // The all-fields-set fixture used by AC-GATE-1/2: roster, weeklyChecklist,
  // and gradesDueDate/gradesDueTime are all set, everything else at
  // baseCourse()'s defaults (Name: CS 101, Course code: CS101, nothing else).
  const allStudentFieldsSet = () =>
    baseCourse({
      roster: "Ada Lovelace | ada\nGrace Hopper",
      weeklyChecklist: [
        checklistItem({ label: "Email Grace Hopper about the late lab", checked: false }),
      ],
      gradesDueDate: "2026-12-15",
      gradesDueTime: "17:00",
    });

  // AC-GATE-1: this literal was captured BEFORE course-facts.ts was changed
  // to add the opt-in, by calling today's committed renderCourseFacts(course)
  // (single argument, exactly as every non-Ask-AI call site already calls
  // it) on the fixture above and recording its exact output. Per Ruling
  // A1-8, this is the oracle - "byte-identical to today's committed
  // behaviour" names no oracle once the pre-change function no longer
  // exists to compare against, so the literal is written down instead of
  // computed. Under Ruling A1-7 there is no permitted delta: grades-due is
  // gated the same as roster/checklist, so calling with no opt-in at all
  // must reproduce this exact string.
  const PRE_CHANGE_NO_OPT_IN_OUTPUT = "Name: CS 101\nCourse code: CS101";

  it("AC-GATE-1: called with exactly the arguments every non-Ask-AI call site uses (no opt-in) produces the pinned pre-change literal, unchanged", () => {
    const text = renderCourseFacts(allStudentFieldsSet());
    expect(text).toBe(PRE_CHANGE_NO_OPT_IN_OUTPUT);
    expect(text).not.toContain("Roster");
    expect(text).not.toContain("Weekly checklist");
    expect(text).not.toContain("Grades due");
  });

  it("AC-GATE-2: called with the opt-in enabled, the same fixture DOES include the Roster and Weekly checklist blocks", () => {
    const text = renderCourseFacts(allStudentFieldsSet(), { includeStudentData: true });
    expect(text).toContain("Roster:");
    expect(text).toContain("Weekly checklist:");
    expect(text).toContain("Grades due:");
  });

  it("an explicit includeStudentData: false behaves exactly like omitting the option", () => {
    const text = renderCourseFacts(allStudentFieldsSet(), { includeStudentData: false });
    expect(text).toBe(PRE_CHANGE_NO_OPT_IN_OUTPUT);
  });
});

describe("renderCourseFacts - roster (AC-ROSTER-1/2)", () => {
  it("AC-ROSTER-1: opt-in enabled, a non-blank roster produces a Roster block with the field's raw text verbatim", () => {
    const roster = "Ada Lovelace | ada\nGrace Hopper";
    const text = renderCourseFacts(baseCourse({ roster }), { includeStudentData: true });
    expect(text).toContain(`Roster:\n${roster}`);
  });

  it("AC-ROSTER-2: opt-in enabled, a null roster omits the block", () => {
    const text = renderCourseFacts(baseCourse({ roster: null }), { includeStudentData: true });
    expect(text).not.toContain("Roster");
  });

  it("AC-ROSTER-2: opt-in enabled, a whitespace-only roster omits the block", () => {
    const text = renderCourseFacts(baseCourse({ roster: "   " }), { includeStudentData: true });
    expect(text).not.toContain("Roster");
  });

  it("without the opt-in, a set roster never appears at all", () => {
    const text = renderCourseFacts(baseCourse({ roster: "Ada Lovelace | ada" }));
    expect(text).not.toContain("Roster");
    expect(text).not.toContain("Ada Lovelace");
  });
});

describe("renderCourseFacts - weekly checklist (AC-CHECKLIST-1/2)", () => {
  it("AC-CHECKLIST-1: opt-in enabled, each item's label appears, one line per item, with no done-state", () => {
    const text = renderCourseFacts(
      baseCourse({
        weeklyChecklist: [
          checklistItem({ label: "Email Grace Hopper about the late lab", checked: false }),
          checklistItem({ label: "Post this week's slides", checked: true, checkedAt: 1_700_000_000_000 }),
        ],
      }),
      { includeStudentData: true }
    );
    expect(text).toContain("Weekly checklist:");
    expect(text).toContain("Email Grace Hopper about the late lab");
    expect(text).toContain("Post this week's slides");
  });

  // Guards against reintroducing item.checked (or any done-state marker) into
  // the emitted block. Per weekly-checklist.ts:280-288, a daily/monthly
  // item's checked state EXPIRES at read-time with no write path, so a raw
  // "checked"/"unchecked" flag written into a facts blob (a display site)
  // would go stale and be asserted to the instructor as fact - the ruling
  // was to drop the done-state entirely rather than thread a clock through.
  it("AC-CHECKLIST-1: the emitted block never contains a done-state marker, checked or not", () => {
    const text = renderCourseFacts(
      baseCourse({
        weeklyChecklist: [
          checklistItem({ label: "Email Grace Hopper about the late lab", checked: false }),
          checklistItem({ label: "Post this week's slides", checked: true, checkedAt: 1_700_000_000_000 }),
        ],
      }),
      { includeStudentData: true }
    );
    expect(text).not.toContain("checked");
    expect(text).not.toContain("unchecked");
  });

  it("AC-CHECKLIST-2: opt-in enabled, an empty weeklyChecklist omits the block", () => {
    const text = renderCourseFacts(baseCourse({ weeklyChecklist: [] }), { includeStudentData: true });
    expect(text).not.toContain("Weekly checklist");
  });

  it("AC-CHECKLIST-2: opt-in enabled, an absent weeklyChecklist omits the block", () => {
    const text = renderCourseFacts(baseCourse(), { includeStudentData: true });
    expect(text).not.toContain("Weekly checklist");
  });

  it("without the opt-in, a set weeklyChecklist never appears at all", () => {
    const text = renderCourseFacts(
      baseCourse({ weeklyChecklist: [checklistItem({ label: "Email Grace Hopper about the late lab", checked: false })] })
    );
    expect(text).not.toContain("Weekly checklist");
    expect(text).not.toContain("Grace Hopper");
  });
});

describe("renderCourseFacts - grades due (AC-GRADESDUE-1/2/4)", () => {
  it("AC-GRADESDUE-4: a valid gradesDueDate/gradesDueTime produces a Grades due line matching the pinned describeGradesDue literal", () => {
    // Pinned literal, not a call to describeGradesDue inside this test (per
    // Ruling A1-8/M3): reused from src/lib/grades-due.test.ts's own already-
    // pinned pair ("2026-12-15", "17:00") -> "Dec 15, 2026 at 5:00 PM".
    const text = renderCourseFacts(
      baseCourse({ gradesDueDate: "2026-12-15", gradesDueTime: "17:00" }),
      { includeStudentData: true }
    );
    expect(text).toContain("Grades due: Dec 15, 2026 at 5:00 PM");
  });

  it("AC-GRADESDUE-2: a null gradesDueDate omits the line", () => {
    const text = renderCourseFacts(baseCourse({ gradesDueDate: null }), { includeStudentData: true });
    expect(text).not.toContain("Grades due");
  });

  it("AC-GRADESDUE-2: an invalid gradesDueDate omits the line", () => {
    const text = renderCourseFacts(
      baseCourse({ gradesDueDate: "not-a-date" }),
      { includeStudentData: true }
    );
    expect(text).not.toContain("Grades due");
  });

  it("AC-GRADESDUE-1: gradesDueDate is gated the same as roster/checklist - without the opt-in it never appears", () => {
    const text = renderCourseFacts(baseCourse({ gradesDueDate: "2026-12-15", gradesDueTime: "17:00" }));
    expect(text).not.toContain("Grades due");
  });
});

describe("renderCourseFacts - ordering (AC-ORDER-1)", () => {
  it("places the Roster and Weekly checklist blocks after the Schedule of topics block", () => {
    const text = renderCourseFacts(
      baseCourse({
        csvData: "Week,Topic\n1,Intro",
        roster: "Ada Lovelace | ada",
        weeklyChecklist: [checklistItem({ label: "Post slides", checked: false })],
      }),
      { includeStudentData: true }
    );
    const scheduleIndex = text.indexOf("Schedule of topics:");
    const rosterIndex = text.indexOf("Roster:");
    const checklistIndex = text.indexOf("Weekly checklist:");
    expect(scheduleIndex).toBeGreaterThanOrEqual(0);
    expect(rosterIndex).toBeGreaterThan(scheduleIndex);
    expect(checklistIndex).toBeGreaterThan(scheduleIndex);
  });
});

describe("AskAiModal call site is reachable (AC-REACH-1, Ruling A1-9)", () => {
  const source = readAskAiModalSource();

  it("passes includeStudentData: true to its renderCourseFacts call - flipping this boolean must fail this test", () => {
    const callMatch = source.match(/renderCourseFacts\(\s*course\s*,\s*\{[^}]*\}\s*\)/);
    expect(callMatch).not.toBeNull();
    expect(callMatch![0]).toMatch(/includeStudentData:\s*true/);
  });

  it("calls renderCourseFacts exactly once", () => {
    const matches = source.match(/renderCourseFacts\(/g) ?? [];
    expect(matches.length).toBe(1);
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
        tools: [],
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
