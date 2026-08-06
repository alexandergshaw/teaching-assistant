// TDD suite written from the AC BEFORE the implementation (F3/F4).
//
// These assert the COPY CONTRACT, not the implementation's internals: which
// columns can be written to their siblings, what patch a copy produces, and
// the exact text block "Copy all" puts on the clipboard.
//
// The column list and the CourseInput key list below are FROZEN LITERALS, not
// re-derived from ALL_COLUMN_IDS / the CourseInput type. That is the whole
// point: a column added without a copy classification, or a patch that invents
// a key CourseInput does not have (which courseToInput's spread would silently
// drop, reporting a successful write that wrote nothing), must FAIL here.
import { describe, it, expect } from "vitest";
import { makeCourse } from "./courses-table-helpers.fixtures";
import {
  CELL_COPY_COLUMN_IDS,
  cellCopyPlan,
  cellTextValue,
  columnTextForCopy,
  type CellColumnId,
} from "./cell-copy";

// Every cell that can carry a menu: the sticky Name cell plus all 37 data
// columns. Written out, so adding a column to ALL_COLUMN_IDS without
// classifying it here is a test failure rather than a silent pass.
const EXPECTED_COLUMN_IDS: CellColumnId[] = [
  "name",
  "institution",
  "modality",
  "startDate",
  "endDate",
  "gradesDue",
  "dayTime",
  "classLength",
  "weeks",
  "breaks",
  "tests",
  "assignmentDue",
  "weeklyChecklist",
  "lms",
  "githubOrg",
  "integrations",
  "repos",
  "studentRepos",
  "roster",
  "email",
  "emailClient",
  "instructorTitle",
  "instructorDepartment",
  "instructorCredentials",
  "instructorBio",
  "syllabusId",
  "syllabusTemplate",
  "description",
  "courseKind",
  "topicOutline",
  "scheduleCsv",
  "textbook",
  "rubric",
  "materials",
  "lmsExports",
  "castletop",
  "miscFiles",
  "courseProject",
];

// Frozen list of the writable CourseInput keys (src/lib/supabase/courses.ts).
// A patch key outside this set is dropped by courseToInput's spread and the
// copy silently does nothing while reporting success.
const COURSE_INPUT_KEYS = new Set([
  "name",
  "courseCode",
  "term",
  "canvasUrl",
  "repos",
  "githubOrg",
  "textbook",
  "syllabusId",
  "institution",
  "integrations",
  "roster",
  "notes",
  "topics",
  "csvName",
  "csvData",
  "rubricName",
  "rubricData",
  "startDate",
  "description",
  "weeks",
  "tests",
  "lms",
  "dayTime",
  "modality",
  "topicOutline",
  "syllabusTemplateId",
  "courseKind",
  "endDate",
  "breaks",
  "assignmentDueRule",
  "email",
  "emailClient",
  "classLengthMinutes",
  "customTiles",
  "hiddenTiles",
  "studentRepos",
  "weeklyChecklist",
  "gradesDueDate",
  "gradesDueTime",
  "instructorBio",
  "instructorTitle",
  "instructorCredentials",
  "instructorDepartment",
]);

// Columns the copy action must refuse.
//
// Five have no writable home on CourseInput: four file collections plus the
// dedicated-writer course project (AC29).
//
// "name" is refused for a different reason, decided after seeing the copy
// contract whole: a course name is the row's IDENTIFIER. Copying it to every
// other course in view renames all of them to the same string at once, which
// leaves the table unnavigable, breaks the very "Copy all" block that
// attributes values BY course name, and has no use case that would justify
// the risk. The undo path exists, but a destructive default nobody wants is
// still the wrong default.
const NOT_COPYABLE: CellColumnId[] = [
  "name",
  "materials",
  "lmsExports",
  "castletop",
  "miscFiles",
  "courseProject",
];

const CHECKLIST_ITEM = {
  id: "i1",
  label: "Post the weekly announcement",
  checked: false,
  checkedAt: null,
  deadline: null,
};

const FILE = (name: string, path: string) => ({
  name,
  path,
  size: 1024,
  addedAt: "2026-01-01T00:00:00.000Z",
});

describe("CELL_COPY_COLUMN_IDS + classification completeness - AC30 (canary)", () => {
  it("is exactly the frozen list of Name plus every data column", () => {
    expect([...CELL_COPY_COLUMN_IDS].sort()).toEqual([...EXPECTED_COLUMN_IDS].sort());
    expect(CELL_COPY_COLUMN_IDS).toHaveLength(38);
  });

  it("classifies every column exactly once - copyable with a patch, or not with a reason", () => {
    const course = makeCourse({ name: "CS 101" });
    for (const id of CELL_COPY_COLUMN_IDS) {
      const plan = cellCopyPlan(course, id);
      if (plan.copyable) {
        expect(Object.keys(plan.patch).length, `${id} produced an empty patch`).toBeGreaterThan(0);
        expect(typeof plan.summary, `${id} has no value summary`).toBe("string");
      } else {
        expect(plan.reason.trim().length, `${id} is not copyable but gives no reason`).toBeGreaterThan(10);
      }
    }
  });

  it("only ever emits patch keys that CourseInput actually has", () => {
    // The failure this catches: a `default: { [columnId]: value }` arm, which
    // type-checks through a cast, writes nothing, and reports success.
    const course = makeCourse({
      name: "CS 101",
      institution: "Rocket U",
      csvData: "a,b",
      csvName: "s.csv",
      rubricData: "r",
      rubricName: "r.csv",
      lms: "canvas",
      canvasUrl: "https://x.test",
      gradesDueDate: "2026-12-18",
      gradesDueTime: "17:00",
      classLengthMinutes: 75,
      assignmentDueRule: "sun|23:59",
      syllabusTemplateId: "tpl-1",
      weeklyChecklist: [CHECKLIST_ITEM],
    });
    for (const id of CELL_COPY_COLUMN_IDS) {
      const plan = cellCopyPlan(course, id);
      if (!plan.copyable) continue;
      for (const key of Object.keys(plan.patch)) {
        expect(COURSE_INPUT_KEYS.has(key), `${id} emits unknown CourseInput key "${key}"`).toBe(true);
      }
    }
  });

  it("marks exactly the file-backed and dedicated-writer columns as not copyable", () => {
    const course = makeCourse({});
    const notCopyable = CELL_COPY_COLUMN_IDS.filter((id) => !cellCopyPlan(course, id).copyable);
    expect([...notCopyable].sort()).toEqual([...NOT_COPYABLE].sort());
  });
});

describe("cellCopyPlan - the patch a copy writes", () => {
  it("copies a plain scalar column as its own CourseInput field", () => {
    const plan = cellCopyPlan(makeCourse({ institution: "Rocket U" }), "institution");
    if (!plan.copyable) throw new Error("institution must be copyable");
    expect(plan.patch).toEqual({ institution: "Rocket U" });
    expect(plan.summary).toContain("Rocket U");
  });

  it("refuses to copy the Name column, and says why", () => {
    const plan = cellCopyPlan(makeCourse({ name: "CS 101" }), "name");
    expect(plan.copyable).toBe(false);
    if (plan.copyable) throw new Error("name must not be copyable");
    // The reason has to name the actual hazard, not just say "unsupported" -
    // this is the one refusal a user would otherwise read as a bug.
    expect(plan.reason.toLowerCase()).toContain("name");
    expect(plan.reason.length).toBeGreaterThan(10);
  });

  it("copies a numeric column as a number, not the raw string", () => {
    const weeks = cellCopyPlan(makeCourse({ weeks: 15 }), "weeks");
    if (!weeks.copyable) throw new Error("weeks must be copyable");
    expect(weeks.patch).toEqual({ weeks: 15 });

    const length = cellCopyPlan(makeCourse({ classLengthMinutes: 75 }), "classLength");
    if (!length.copyable) throw new Error("classLength must be copyable");
    expect(length.patch).toEqual({ classLengthMinutes: 75 });
  });

  it("maps columns whose CourseInput field is named differently", () => {
    const due = cellCopyPlan(makeCourse({ assignmentDueRule: "sun|23:59" }), "assignmentDue");
    if (!due.copyable) throw new Error("assignmentDue must be copyable");
    expect(due.patch).toEqual({ assignmentDueRule: "sun|23:59" });

    const tpl = cellCopyPlan(makeCourse({ syllabusTemplateId: "tpl-1" }), "syllabusTemplate");
    if (!tpl.copyable) throw new Error("syllabusTemplate must be copyable");
    expect(tpl.patch).toEqual({ syllabusTemplateId: "tpl-1" });
  });

  it("AC32: an EMPTY string column copies as a clear, and says so in the summary", () => {
    const plan = cellCopyPlan(makeCourse({ description: null }), "description");
    if (!plan.copyable) throw new Error("description must be copyable");
    expect(plan.patch).toEqual({ description: "" });
    expect(plan.summary).toBe("Not set");
  });

  it("AC32: an empty NUMBER column clears to null, never to undefined", () => {
    const plan = cellCopyPlan(makeCourse({ weeks: null }), "weeks");
    if (!plan.copyable) throw new Error("weeks must be copyable");
    expect(plan.patch).toEqual({ weeks: null });
    expect(Object.prototype.hasOwnProperty.call(plan.patch, "weeks")).toBe(true);
  });

  it("AC32: an empty LIST column clears to an empty array", () => {
    const plan = cellCopyPlan(makeCourse({ integrations: [] }), "integrations");
    if (!plan.copyable) throw new Error("integrations must be copyable");
    expect(plan.patch).toEqual({ integrations: [] });
  });

  it("AC31: the LMS column carries canvasUrl with it, in both directions", () => {
    const set = cellCopyPlan(
      makeCourse({ lms: "canvas", canvasUrl: "https://school.instructure.com" }),
      "lms"
    );
    if (!set.copyable) throw new Error("lms must be copyable");
    expect(set.patch).toEqual({ lms: "canvas", canvasUrl: "https://school.instructure.com" });

    const cleared = cellCopyPlan(makeCourse({ lms: null, canvasUrl: null }), "lms");
    if (!cleared.copyable) throw new Error("lms must be copyable");
    expect(cleared.patch).toEqual({ lms: null, canvasUrl: "" });
  });

  it("AC31: the Grades due column carries its time with it, in both directions", () => {
    const set = cellCopyPlan(
      makeCourse({ gradesDueDate: "2026-12-18", gradesDueTime: "17:00" }),
      "gradesDue"
    );
    if (!set.copyable) throw new Error("gradesDue must be copyable");
    expect(set.patch).toEqual({ gradesDueDate: "2026-12-18", gradesDueTime: "17:00" });

    const cleared = cellCopyPlan(makeCourse({ gradesDueDate: null, gradesDueTime: null }), "gradesDue");
    if (!cleared.copyable) throw new Error("gradesDue must be copyable");
    expect(cleared.patch).toEqual({ gradesDueDate: null, gradesDueTime: null });
  });

  it("AC31: Schedule of Topics and Rubric each carry their file name with them", () => {
    const csv = cellCopyPlan(
      makeCourse({ csvData: "week,topic\n1,Intro", csvName: "schedule.csv" }),
      "scheduleCsv"
    );
    if (!csv.copyable) throw new Error("scheduleCsv must be copyable");
    expect(csv.patch).toEqual({ csvData: "week,topic\n1,Intro", csvName: "schedule.csv" });

    const rubric = cellCopyPlan(
      makeCourse({ rubricData: "criterion,points", rubricName: "rubric.csv" }),
      "rubric"
    );
    if (!rubric.copyable) throw new Error("rubric must be copyable");
    expect(rubric.patch).toEqual({ rubricData: "criterion,points", rubricName: "rubric.csv" });
  });

  it("copies list-backed columns as structured values, not as their text form", () => {
    const integrations = cellCopyPlan(
      makeCourse({ integrations: [{ name: "Cengage", url: "https://cengage.com" }] }),
      "integrations"
    );
    if (!integrations.copyable) throw new Error("integrations must be copyable");
    expect(integrations.patch).toEqual({
      integrations: [{ name: "Cengage", url: "https://cengage.com" }],
    });

    const repos = cellCopyPlan(
      makeCourse({ repos: [{ repo: "org/starter", branch: "main" }] }),
      "repos"
    );
    if (!repos.copyable) throw new Error("repos must be copyable");
    expect(repos.patch).toEqual({ repos: [{ repo: "org/starter", branch: "main" }] });
  });

  it("copies the weekly checklist as its item list", () => {
    const plan = cellCopyPlan(makeCourse({ weeklyChecklist: [CHECKLIST_ITEM] }), "weeklyChecklist");
    if (!plan.copyable) throw new Error("weeklyChecklist must be copyable");
    expect(plan.patch).toEqual({ weeklyChecklist: [CHECKLIST_ITEM] });
  });

  it("gives a human reason for each not-copyable column", () => {
    for (const id of NOT_COPYABLE) {
      const plan = cellCopyPlan(makeCourse({}), id);
      expect(plan.copyable, `${id} must not be copyable`).toBe(false);
      if (plan.copyable) throw new Error("unreachable");
      expect(plan.reason.length).toBeGreaterThan(10);
    }
  });
});

describe("cellTextValue - AC39 (raw stored value, except selects, which use their label)", () => {
  it("returns the whole value, never a truncated/ellipsised one", () => {
    const long = "Rocket ".repeat(60).trim();
    const text = cellTextValue(makeCourse({ description: long }), "description");
    expect(text).toBe(long);
    expect(text).not.toContain("…");
  });

  it("returns the course name for the Name column", () => {
    expect(cellTextValue(makeCourse({ name: "CS 101" }), "name")).toBe("CS 101");
  });

  it("returns the human label a select cell displays, not the stored code", () => {
    expect(cellTextValue(makeCourse({ modality: "async" }), "modality")).toBe("Asynchronous");
    expect(cellTextValue(makeCourse({ modality: "sync" }), "modality")).toBe("Synchronous");
    expect(cellTextValue(makeCourse({ emailClient: "outlook" }), "emailClient")).toBe("Outlook");
    expect(cellTextValue(makeCourse({ lms: "canvas" }), "lms")).toBe("Canvas");
    expect(cellTextValue(makeCourse({ courseKind: "coding" }), "courseKind")).not.toBe("coding");
    expect(cellTextValue(makeCourse({ courseKind: "coding" }), "courseKind").length).toBeGreaterThan(0);
  });

  it("falls back to the stored value for an LMS not in the options list", () => {
    expect(cellTextValue(makeCourse({ lms: "sakai" }), "lms")).toBe("sakai");
  });

  it("returns the ISO date for date columns, so copied text is locale-independent", () => {
    expect(cellTextValue(makeCourse({ startDate: "2026-08-24" }), "startDate")).toBe("2026-08-24");
    expect(cellTextValue(makeCourse({ endDate: "2026-12-11" }), "endDate")).toBe("2026-12-11");
    expect(
      cellTextValue(makeCourse({ gradesDueDate: "2026-12-18", gradesDueTime: "17:00" }), "gradesDue")
    ).toBe("2026-12-18 17:00");
    expect(cellTextValue(makeCourse({ gradesDueDate: "2026-12-18" }), "gradesDue")).toBe("2026-12-18");
  });

  it("renders the assignment-due rule the way the cell reads it, not the encoded form", () => {
    const text = cellTextValue(makeCourse({ assignmentDueRule: "sun|23:59" }), "assignmentDue");
    expect(text).not.toBe("sun|23:59");
    expect(text.toLowerCase()).toContain("sunday");
  });

  it("returns an empty string for an unset value", () => {
    expect(cellTextValue(makeCourse({ description: null }), "description")).toBe("");
    expect(cellTextValue(makeCourse({ weeks: null }), "weeks")).toBe("");
    expect(cellTextValue(makeCourse({ modality: null }), "modality")).toBe("");
    expect(cellTextValue(makeCourse({ assignmentDueRule: null }), "assignmentDue")).toBe("");
    expect(cellTextValue(makeCourse({ miscFiles: [] }), "miscFiles")).toBe("");
  });

  it("renders numbers bare", () => {
    expect(cellTextValue(makeCourse({ weeks: 15 }), "weeks")).toBe("15");
    expect(cellTextValue(makeCourse({ classLengthMinutes: 75 }), "classLength")).toBe("75");
  });

  it("renders list-backed columns one entry per line", () => {
    expect(
      cellTextValue(
        makeCourse({
          integrations: [
            { name: "Cengage", url: "https://cengage.com" },
            { name: "uCertify", url: null },
          ],
        }),
        "integrations"
      )
    ).toBe("Cengage | https://cengage.com\nuCertify");

    expect(
      cellTextValue(
        makeCourse({
          repos: [
            { repo: "org/starter", branch: "main" },
            { repo: "org/solutions", branch: null },
          ],
        }),
        "repos"
      )
    ).toBe("org/starter#main\norg/solutions");
  });

  it("renders the weekly checklist as its item labels, one per line", () => {
    expect(
      cellTextValue(
        makeCourse({ weeklyChecklist: [CHECKLIST_ITEM, { ...CHECKLIST_ITEM, id: "i2", label: "Grade quizzes" }] }),
        "weeklyChecklist"
      )
    ).toBe("Post the weekly announcement\nGrade quizzes");
  });

  it("AC40: file-backed columns produce readable text even though they cannot be written", () => {
    const withFiles = makeCourse({
      miscFiles: [FILE("handout.pdf", "p1"), FILE("policy.docx", "p2")],
    });
    expect(cellTextValue(withFiles, "miscFiles")).toBe("handout.pdf\npolicy.docx");
    expect(cellCopyPlan(withFiles, "miscFiles").copyable).toBe(false);
  });

  it("resolves the syllabus and template columns through the supplied name context", () => {
    const course = makeCourse({ syllabusId: "syl-1", syllabusTemplateId: "tpl-1" });
    const ctx = {
      syllabusNameById: new Map([["syl-1", "Fall syllabus"]]),
      syllabusTemplateNameById: new Map([["tpl-1", "Standard template"]]),
    };
    expect(cellTextValue(course, "syllabusId", ctx)).toBe("Fall syllabus");
    expect(cellTextValue(course, "syllabusTemplate", ctx)).toBe("Standard template");
  });

  it("falls back to the raw id when no name context is supplied", () => {
    const course = makeCourse({ syllabusId: "syl-1", syllabusTemplateId: "tpl-1" });
    expect(cellTextValue(course, "syllabusId")).toBe("syl-1");
    expect(cellTextValue(course, "syllabusTemplate", {})).toBe("tpl-1");
  });

  it("produces a string for every column without throwing", () => {
    const course = makeCourse({ name: "CS 101" });
    for (const id of CELL_COPY_COLUMN_IDS) {
      expect(typeof cellTextValue(course, id), `${id} did not return a string`).toBe("string");
    }
  });
});

describe("columnTextForCopy - AC38/AC39 (the Copy all clipboard block)", () => {
  const courses = [
    makeCourse({ id: "a", name: "CS 101", description: "Intro course." }),
    makeCourse({ id: "b", name: "CS 202", description: null }),
    makeCourse({ id: "c", name: "CS 303", description: "Line one\nLine two" }),
  ];

  it("prefixes every course by name, marks unset values, and indents multi-line text", () => {
    expect(columnTextForCopy(courses, "description")).toBe(
      ["CS 101: Intro course.", "CS 202: Not set", "CS 303:", "  Line one", "  Line two"].join("\n")
    );
  });

  it("emits one entry per course in view - none is skipped for being empty", () => {
    const block = columnTextForCopy(courses, "description");
    expect(block.split("\n").filter((l) => /^CS \d+:/.test(l))).toHaveLength(3);
  });

  it("preserves the order it was given (the table's current sort)", () => {
    const reversed = [...courses].reverse();
    expect(columnTextForCopy(reversed, "description")).toBe(
      ["CS 303:", "  Line one", "  Line two", "CS 202: Not set", "CS 101: Intro course."].join("\n")
    );
  });

  it("renders a list-backed column with its entries indented under the course name", () => {
    const withIntegrations = [
      makeCourse({
        id: "a",
        name: "CS 101",
        integrations: [
          { name: "Cengage", url: "https://cengage.com" },
          { name: "uCertify", url: null },
        ],
      }),
      makeCourse({ id: "b", name: "CS 202", integrations: [] }),
    ];
    expect(columnTextForCopy(withIntegrations, "integrations")).toBe(
      ["CS 101:", "  Cengage | https://cengage.com", "  uCertify", "CS 202: Not set"].join("\n")
    );
  });

  it("works on a not-copyable column too - Copy all is a read, not a write (AC40)", () => {
    expect(
      columnTextForCopy(
        [
          makeCourse({ id: "a", name: "CS 101", miscFiles: [FILE("handout.pdf", "p1")] }),
          makeCourse({ id: "b", name: "CS 202", miscFiles: [] }),
        ],
        "miscFiles"
      )
    ).toBe(["CS 101: handout.pdf", "CS 202: Not set"].join("\n"));
  });

  it("returns an empty string when no courses are in view", () => {
    expect(columnTextForCopy([], "description")).toBe("");
  });

  it("never emits a trailing newline", () => {
    expect(columnTextForCopy(courses, "description").endsWith("\n")).toBe(false);
  });

  it("names every course in view for every column", () => {
    for (const id of CELL_COPY_COLUMN_IDS) {
      const block = columnTextForCopy(courses, id);
      for (const c of courses) {
        expect(block, `${id} omitted ${c.name}`).toContain(`${c.name}:`);
      }
    }
  });
});
