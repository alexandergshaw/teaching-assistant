// TDD contract for the Tasks tab's pure domain model. These tests were written
// BEFORE the implementation, from the acceptance criteria, and they assert
// observable behavior only - never internal structure. They are the definition
// of done for src/lib/course-tasks-catalog.ts and src/lib/course-tasks.ts.
import { describe, expect, it } from "vitest";
import {
  TERM_TASKS,
  RECURRING_TASKS,
  BUILT_IN_TASKS,
  TASK_GROUPS,
} from "./course-tasks-catalog";
import {
  TASK_STATUSES,
  TASK_NOTE_MAX_LENGTH,
  EMPTY_TASK_CELL,
  isTaskStatus,
  coerceTaskCellMap,
  isEmptyTaskCell,
  taskCellAt,
  parseSheetCellValue,
  nextTaskStatus,
  setTaskCellStatus,
  setTaskCellNote,
  applyTaskCell,
  mergeTaskCellEntries,
  isTaskDoneNow,
  effectiveTaskStatus,
  isTaskOutstanding,
  type TaskCell,
  type TaskCellMap,
} from "./course-tasks";
import { isSameLocalDay, isSameLocalWeek } from "./weekly-checklist";

// A fixed reference instant used throughout: Wednesday 2026-08-05 14:00 local.
const WED = new Date(2026, 7, 5, 14, 0, 0).getTime();

describe("built-in catalog", () => {
  it("ships the 40 term-setup tasks from the Recurring Tasks sheet, split 17 / 23", () => {
    expect(TERM_TASKS).toHaveLength(40);
    expect(TERM_TASKS.filter((t) => t.group === "dependent")).toHaveLength(17);
    expect(TERM_TASKS.filter((t) => t.group === "independent")).toHaveLength(23);
  });

  it("keeps the sheet's column order, anchored at both ends and across the group boundary", () => {
    // Anchoring on specific ids at specific indexes is what stops this test
    // passing against a reordered or regenerated catalog.
    expect(TERM_TASKS[0].id).toBe("course-evaluation-form");
    expect(TERM_TASKS[16].id).toBe("syllabus-uploaded-college");
    expect(TERM_TASKS[17].id).toBe("labs-added");
    expect(TERM_TASKS[39].id).toBe("final-grades-entered");
  });

  it("carries the sheet's exact labels, with the AI2 typo corrected", () => {
    const byId = new Map(TERM_TASKS.map((t) => [t.id, t.label]));
    expect(byId.get("course-evaluation-form")).toBe("Course Evaluation Form Owned?");
    expect(byId.get("lms-population-method")).toBe("Method of Populating LMS Shells Identified?");
    expect(byId.get("syllabus-upload-location")).toBe("Syllabus Upload Location ID'ed?");
    // AC A2: the sheet reads "Weclome"; we ship the corrected spelling.
    expect(byId.get("welcome-note-scheduled")).toBe(
      "Welcome Note Scheduled in LMS (course days/times/location)?"
    );
    expect(byId.get("final-grades-entered")).toBe("Final Grades Entered?");
  });

  it("ships the 12 daily/weekly tasks, split 4 / 8", () => {
    expect(RECURRING_TASKS).toHaveLength(12);
    expect(RECURRING_TASKS.filter((t) => t.group === "daily")).toHaveLength(4);
    expect(RECURRING_TASKS.filter((t) => t.group === "weekly")).toHaveLength(8);
  });

  it("ships the daily/weekly catalog's actual ids and labels, in order", () => {
    // Anchored the same way the term catalog is: a catalog of twelve
    // placeholders would otherwise satisfy the count and split above.
    expect(RECURRING_TASKS.map((t) => t.id)).toEqual([
      "daily-lms-inbox",
      "daily-questions-answered",
      "daily-submissions-pulled",
      "daily-attendance",
      "weekly-announcement-posted",
      "weekly-module-published",
      "weekly-lecture-ready",
      "weekly-assignment-published",
      "weekly-grades-posted",
      "weekly-feedback-returned",
      "weekly-at-risk-contacted",
      "weekly-backup",
    ]);
    const byId = new Map(RECURRING_TASKS.map((t) => [t.id, t.label]));
    expect(byId.get("daily-lms-inbox")).toBe("LMS inbox and student email cleared?");
    expect(byId.get("daily-attendance")).toBe("Attendance / standup recorded?");
    expect(byId.get("weekly-announcement-posted")).toBe("Weekly announcement posted?");
    expect(byId.get("weekly-backup")).toBe("Grades and materials backed up?");
  });

  it("gives every term task cadence 'once' and every recurring task a real cadence", () => {
    expect(TERM_TASKS.every((t) => t.cadence === "once")).toBe(true);
    expect(TERM_TASKS.every((t) => t.view === "term")).toBe(true);
    for (const task of RECURRING_TASKS) {
      expect(task.view).toBe("recurring");
      expect(task.cadence).toBe(task.group === "daily" ? "daily" : "weekly");
    }
  });

  it("marks every built-in as built-in and gives each a non-empty label", () => {
    expect(BUILT_IN_TASKS).toHaveLength(52);
    expect(BUILT_IN_TASKS.every((t) => t.builtIn)).toBe(true);
    expect(BUILT_IN_TASKS.every((t) => t.label.trim().length > 0)).toBe(true);
  });

  it("is exactly the two catalogs concatenated - not a third, independent list", () => {
    // Without this, a BUILT_IN_TASKS of 52 unrelated tasks satisfies every
    // other assertion here, and any caller deriving a known-id set from it
    // would be working off the wrong vocabulary.
    expect(BUILT_IN_TASKS.map((t) => t.id)).toEqual([...TERM_TASKS, ...RECURRING_TASKS].map((t) => t.id));
  });

  it("uses ids that are unique ACROSS both catalogs - they share one status map", () => {
    const ids = BUILT_IN_TASKS.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every((id) => id.length > 0)).toBe(true);
  });

  it("declares exactly the four groups the two views need, each bound to its view", () => {
    expect(TASK_GROUPS.map((g) => g.id)).toEqual(["dependent", "independent", "daily", "weekly"]);
    const byId = new Map(TASK_GROUPS.map((g) => [g.id, g]));
    expect(byId.get("dependent")?.label).toBe("Dependent Upon Others");
    expect(byId.get("independent")?.label).toBe("Independent of Others");
    expect(byId.get("daily")?.label).toBe("Daily");
    expect(byId.get("weekly")?.label).toBe("Weekly");
    expect(byId.get("dependent")?.view).toBe("term");
    expect(byId.get("independent")?.view).toBe("term");
    expect(byId.get("daily")?.view).toBe("recurring");
    expect(byId.get("weekly")?.view).toBe("recurring");
  });

  it("puts every task in a group that belongs to that task's own view", () => {
    const groupView = new Map(TASK_GROUPS.map((g) => [g.id, g.view]));
    for (const task of BUILT_IN_TASKS) {
      expect(groupView.get(task.group)).toBe(task.view);
    }
  });
});

// FROZEN ORACLE (regression entry 232, check 2): the 40 Term Setup ids and
// labels, inlined here as literals in the source workbook's own column
// order (D-AQ, Dependent Upon Others then Independent of Others). Entry
// 232's check originally read "diff against the workbook" - unexecutable,
// since Adjuncting Tasks.xlsx is not in this repo, and this doc's own
// preamble requires every check to be runnable by a fresh agent with no
// session context. These two arrays ARE the diff now: they were copied
// verbatim from course-tasks-catalog.ts (already verified against the real
// workbook by an external one-off diff), so a future edit to that file -
// intentional or not - shows up here as a failing assertion instead of an
// unrunnable instruction. Deliberately duplicated rather than derived from
// TERM_TASKS itself: an oracle built FROM the thing it is meant to catch
// changes to would go stale silently right alongside it.
const TERM_TASK_IDS_FROM_WORKBOOK = [
  // Dependent Upon Others (17, columns D-T)
  "course-evaluation-form",
  "syllabus-template-obtained",
  "room-code-fob",
  "room-days-times",
  "textbook-owned",
  "textbook-location",
  "textbook-for-students",
  "syllabus-objectives-owned",
  "course-accessible-lms",
  "lms-population-method",
  "lms-shells-populated",
  "external-grade-percentage",
  "digital-office-hours",
  "syllabus-in-lms",
  "syllabus-ack-quiz",
  "syllabus-upload-location",
  "syllabus-uploaded-college",
  // Independent of Others (23, columns U-AQ)
  "labs-added",
  "projects-run-through",
  "lectures-added",
  "software-versions",
  "deadlines-added",
  "points-added",
  "modules-assignments-published",
  "ferpa-title-ix",
  "accessibility-100",
  "links-validated",
  "modules-double-checked",
  "test-dates-chosen",
  "tests-made",
  "course-published",
  "welcome-note-scheduled",
  "closing-note-scheduled",
  "standups-implemented",
  "lecture-practiced",
  "census-on-calendar",
  "grade-deadlines-marked",
  "census-entered",
  "midterm-grades-entered",
  "final-grades-entered",
];

const TERM_TASK_LABELS_FROM_WORKBOOK = [
  // Dependent Upon Others (17)
  "Course Evaluation Form Owned?",
  "Updated Syllabus Template Obtained?",
  "Lecture room code / fob obtained?",
  "Lecture room # / class days / times obtained?",
  "Textbook Owned?",
  "Textbook Location Specified?",
  "Textbook Specified for Students?",
  "Syllabus/Course Objectives Owned?",
  "Course Accessible in LMS?",
  "Method of Populating LMS Shells Identified?",
  "LMS Shells Populated?",
  "External Grade Set to Percentage?",
  "Digital Office Hours Linked and Checked?",
  "Syllabus Added to LMS?",
  "Syllabus Acknowledgement Quiz Added?",
  "Syllabus Upload Location ID'ed?",
  "Syllabus Uploaded to College?",
  // Independent of Others (23)
  "Labs Added?",
  "Run Through Projects/Homework on My Own?",
  "Lectures Added?",
  "Instructor/Student Versions of Software Obtained?",
  "Deadlines Added?",
  "Points Added?",
  "All Modules and Assignments Published?",
  "Updated for FERPA and Title IX?",
  "Accessibility at 100%?",
  "Links Validated?",
  "All Modules Double Checked?",
  "Dates Chosen for Tests?",
  "Tests Made?",
  "Course Published?",
  // AC A2: the sheet's AI2 header reads "Weclome Note Scheduled in LMS..."
  // - shipped with the typo corrected and the stray trailing " ?" removed.
  "Welcome Note Scheduled in LMS (course days/times/location)?",
  "Closing Note Scheduled in LMS?",
  "Standups Implemented?",
  "Lecture/Lab Practiced in Classroom?",
  "Census Marked on Calendar?",
  "Midterm and Final Grade Deadlines Marked?",
  "Census Entered?",
  "Midterm Grades Entered?",
  "Final Grades Entered?",
];

describe("TERM_TASKS frozen oracle (regression entry 232, check 2)", () => {
  it("has exactly 40 ids, matching the workbook's column order character-for-character", () => {
    expect(TERM_TASK_IDS_FROM_WORKBOOK).toHaveLength(40);
    expect(TERM_TASKS.map((t) => t.id)).toEqual(TERM_TASK_IDS_FROM_WORKBOOK);
  });

  it("has exactly 40 labels, matching the workbook's column order character-for-character", () => {
    expect(TERM_TASK_LABELS_FROM_WORKBOOK).toHaveLength(40);
    expect(TERM_TASKS.map((t) => t.label)).toEqual(TERM_TASK_LABELS_FROM_WORKBOOK);
  });
});

describe("status vocabulary", () => {
  it("has exactly four statuses", () => {
    expect([...TASK_STATUSES]).toEqual(["open", "done", "blocked", "na"]);
  });

  it("recognizes only those four", () => {
    for (const s of TASK_STATUSES) expect(isTaskStatus(s)).toBe(true);
    expect(isTaskStatus("Y")).toBe(false);
    expect(isTaskStatus("")).toBe(false);
    expect(isTaskStatus(null)).toBe(false);
    expect(isTaskStatus(undefined)).toBe(false);
    expect(isTaskStatus(0)).toBe(false);
  });

  it("cycles open -> done -> blocked -> na -> open", () => {
    expect(nextTaskStatus("open")).toBe("done");
    expect(nextTaskStatus("done")).toBe("blocked");
    expect(nextTaskStatus("blocked")).toBe("na");
    expect(nextTaskStatus("na")).toBe("open");
  });

  it("returns to the starting status after four cycles", () => {
    let s = nextTaskStatus("open");
    s = nextTaskStatus(s);
    s = nextTaskStatus(s);
    s = nextTaskStatus(s);
    expect(s).toBe("open");
  });
});

describe("constants", () => {
  it("caps a note at 200 characters", () => {
    // Pinned to a literal: every other note-cap assertion in this file
    // compares against this constant, so without this they are all
    // self-referential and a cap of 1 would satisfy them.
    expect(TASK_NOTE_MAX_LENGTH).toBe(200);
  });
});

describe("the empty cell", () => {
  it("is open, unnoted and undated", () => {
    expect(EMPTY_TASK_CELL).toEqual({ status: "open", note: "", doneAt: null });
  });

  it("counts as empty, and anything else does not", () => {
    expect(isEmptyTaskCell(EMPTY_TASK_CELL)).toBe(true);
    expect(isEmptyTaskCell({ status: "open", note: "waiting on the dean", doneAt: null })).toBe(false);
    expect(isEmptyTaskCell({ status: "done", note: "", doneAt: WED })).toBe(false);
    expect(isEmptyTaskCell({ status: "na", note: "", doneAt: null })).toBe(false);
    expect(isEmptyTaskCell({ status: "blocked", note: "", doneAt: null })).toBe(false);
  });

  it("is what an unstored task reads back as", () => {
    expect(taskCellAt({}, "textbook-owned")).toEqual(EMPTY_TASK_CELL);
    expect(taskCellAt({ "labs-added": { status: "done", note: "", doneAt: WED } }, "textbook-owned"))
      .toEqual(EMPTY_TASK_CELL);
  });

  it("returns the STORED cell when the task has one", () => {
    // Without this, `taskCellAt = () => EMPTY_TASK_CELL` would satisfy every
    // other assertion about this function.
    const stored: TaskCell = { status: "blocked", note: "waiting on the dean", doneAt: null };
    expect(taskCellAt({ "labs-added": stored }, "labs-added")).toEqual(stored);
    expect(taskCellAt({ "labs-added": stored, "tests-made": { status: "done", note: "", doneAt: WED } }, "tests-made"))
      .toEqual({ status: "done", note: "", doneAt: WED });
  });

  it("does not let a caller corrupt the map through the cell it returns", () => {
    // Deliberately NOT asserting that the write throws: that would force
    // taskCellAt to hand back the shared frozen constant by reference, and
    // reject the equally-correct `return { ...EMPTY_TASK_CELL }`. What must
    // hold is only that the map is unharmed.
    const map: TaskCellMap = {};
    const cell = taskCellAt(map, "labs-added");
    try {
      (cell as { status: string }).status = "done";
    } catch {
      // A frozen constant is a fine implementation too.
    }
    expect(taskCellAt(map, "labs-added").status).toBe("open");
    expect(map).toEqual({});
  });
});

describe("coerceTaskCellMap - never throws on untrusted jsonb", () => {
  const knownIds = new Set(BUILT_IN_TASKS.map((t) => t.id));

  it("returns an empty map for anything that is not a plain object", () => {
    expect(coerceTaskCellMap(null)).toEqual({});
    expect(coerceTaskCellMap(undefined)).toEqual({});
    expect(coerceTaskCellMap([])).toEqual({});
    expect(coerceTaskCellMap([{ id: "x" }])).toEqual({});
    expect(coerceTaskCellMap("labs-added")).toEqual({});
    expect(coerceTaskCellMap(42)).toEqual({});
    expect(coerceTaskCellMap(true)).toEqual({});
  });

  it("keeps a well-formed entry verbatim", () => {
    const out = coerceTaskCellMap({ "labs-added": { status: "done", note: "in Canvas", doneAt: WED } });
    expect(out).toEqual({ "labs-added": { status: "done", note: "in Canvas", doneAt: WED } });
  });

  it("drops entries whose value is not a plain object", () => {
    const out = coerceTaskCellMap({
      "labs-added": { status: "done", note: "", doneAt: WED },
      "tests-made": "done",
      "points-added": null,
      "deadlines-added": ["done"],
      "lectures-added": 7,
    });
    expect(Object.keys(out)).toEqual(["labs-added"]);
  });

  it("falls back to open for an unknown status rather than dropping the note", () => {
    const out = coerceTaskCellMap({ "labs-added": { status: "PARTIAL", note: "half", doneAt: null } });
    expect(out["labs-added"]).toEqual({ status: "open", note: "half", doneAt: null });
  });

  it("drops a non-string note instead of stringifying it", () => {
    const out = coerceTaskCellMap({ "labs-added": { status: "done", note: 12, doneAt: WED } });
    expect(out["labs-added"]).toEqual({ status: "done", note: "", doneAt: WED });
  });

  it("trims and truncates an over-long note to the cap", () => {
    const long = "x".repeat(TASK_NOTE_MAX_LENGTH + 50);
    const out = coerceTaskCellMap({ "labs-added": { status: "done", note: `   ${long}   `, doneAt: WED } });
    expect(out["labs-added"].note).toHaveLength(TASK_NOTE_MAX_LENGTH);
  });

  it("forces the status/doneAt pairing on read, whatever the payload claims", () => {
    // doneAt on a non-done cell is a lie; it must not survive.
    const out = coerceTaskCellMap({
      a: { status: "open", note: "n", doneAt: WED },
      b: { status: "blocked", note: "n", doneAt: WED },
      c: { status: "na", note: "n", doneAt: WED },
    });
    expect(out.a.doneAt).toBeNull();
    expect(out.b.doneAt).toBeNull();
    expect(out.c.doneAt).toBeNull();
  });

  it("nulls a non-finite doneAt on a done cell rather than propagating it", () => {
    expect(coerceTaskCellMap({ a: { status: "done", note: "", doneAt: NaN } }).a.doneAt).toBeNull();
    expect(coerceTaskCellMap({ a: { status: "done", note: "", doneAt: Infinity } }).a.doneAt).toBeNull();
    expect(coerceTaskCellMap({ a: { status: "done", note: "", doneAt: "1754409600000" } }).a.doneAt).toBeNull();
    expect(coerceTaskCellMap({ a: { status: "done", note: "", doneAt: null } }).a.doneAt).toBeNull();
  });

  it("keeps a doneAt of 0 - it is finite, and truthiness is the wrong test", () => {
    // `raw.doneAt ? x : null` passes every other assertion here and silently
    // discards the one legitimate falsy timestamp.
    expect(coerceTaskCellMap({ a: { status: "done", note: "", doneAt: 0 } }).a.doneAt).toBe(0);
  });

  it("cannot have its own prototype hijacked by a __proto__ key in the payload", () => {
    // The stored value is untrusted jsonb. JSON.parse creates a real OWN
    // "__proto__" key, so `out[key] = cell` on a bare `{}` invokes the
    // setter and makes that cell the returned map's PROTOTYPE. Global
    // Object.prototype is untouched, so asserting on `({}).status` proves
    // nothing - sabotage-verified, that assertion stayed green against the
    // broken build. What is observable is that every unrelated lookup then
    // resolves THROUGH the injected object.
    const polluted = coerceTaskCellMap(
      JSON.parse('{"__proto__": {"status": "done", "note": "pwned", "doneAt": 1}, "labs-added": {"status":"done","note":"","doneAt":1}}')
    );
    // "status", "note" and "doneAt" are not task ids; they must read as
    // absent, not as whatever the injected object holds under those names.
    expect(taskCellAt(polluted, "status")).toEqual(EMPTY_TASK_CELL);
    expect(taskCellAt(polluted, "note")).toEqual(EMPTY_TASK_CELL);
    expect(taskCellAt(polluted, "doneAt")).toEqual(EMPTY_TASK_CELL);
    expect(polluted.status).toBeUndefined();
    // "__proto__" survives as an ordinary, inert OWN key (unknown ids are
    // preserved by default - see amendment 120), which is exactly the point:
    // on a null-prototype map it is data, not a setter.
    expect(Object.keys(polluted).sort()).toEqual(["__proto__", "labs-added"]);
    expect(polluted["labs-added"]).toEqual({ status: "done", note: "", doneAt: 1 });
  });

  it("drops entries whose key is blank", () => {
    const out = coerceTaskCellMap({ "": { status: "done", note: "", doneAt: WED }, "   ": { status: "done", note: "", doneAt: WED } });
    expect(out).toEqual({});
  });

  it("drops entries that coerce down to an empty cell - absence and open are the same thing", () => {
    const out = coerceTaskCellMap({
      "labs-added": { status: "open", note: "", doneAt: null },
      "tests-made": { status: "nonsense", note: "  ", doneAt: null },
      "points-added": { status: "done", note: "", doneAt: WED },
    });
    expect(Object.keys(out)).toEqual(["points-added"]);
  });

  it("keeps an unknown task id when no id filter is supplied", () => {
    const out = coerceTaskCellMap({ "retired-custom-task": { status: "done", note: "", doneAt: WED } });
    expect(Object.keys(out)).toEqual(["retired-custom-task"]);
  });

  it("drops an unknown task id when an id filter IS supplied", () => {
    const out = coerceTaskCellMap(
      {
        "labs-added": { status: "done", note: "", doneAt: WED },
        "not-a-real-task": { status: "done", note: "", doneAt: WED },
      },
      knownIds
    );
    expect(Object.keys(out)).toEqual(["labs-added"]);
  });

  it("survives a payload mixing every failure mode at once", () => {
    expect(() =>
      coerceTaskCellMap({
        "": null,
        a: undefined,
        b: { status: {}, note: [], doneAt: {} },
        "labs-added": { status: "done", note: "ok", doneAt: WED },
        c: [[[]]],
      })
    ).not.toThrow();
    const out = coerceTaskCellMap({
      "": null,
      a: undefined,
      b: { status: {}, note: [], doneAt: {} },
      "labs-added": { status: "done", note: "ok", doneAt: WED },
    });
    expect(out).toEqual({ "labs-added": { status: "done", note: "ok", doneAt: WED } });
  });
});

describe("parseSheetCellValue - the spreadsheet's own vocabulary", () => {
  it("reads Y as done, in any casing", () => {
    for (const raw of ["Y", "y", "Yes", "YES", " y "]) {
      expect(parseSheetCellValue(raw)).toEqual({ status: "done", note: "", doneAt: null });
    }
  });

  it("reads N as blocked", () => {
    for (const raw of ["N", "n", "No", "NO"]) {
      expect(parseSheetCellValue(raw)).toEqual({ status: "blocked", note: "", doneAt: null });
    }
  });

  it("reads N/A in any casing as not-applicable, including the sheet's single N/N typo", () => {
    // JUDGEMENT CALL, recorded so it is not mistaken for a fact: the workbook
    // contains ZERO plain "N" values (the tally over D:AQ is Y 260, N/A 122,
    // n/a 6, N/N 1, plus free text). The lone "N/N" sits in column F beside
    // 122 "N/A" values, so it is far more plausibly a mistyped "N/A" than a
    // deliberate "no". "N"/"No" still map to blocked above for data typed in
    // future.
    for (const raw of ["N/A", "n/a", "NA", "na", " N/A ", "N/N", "n/n"]) {
      expect(parseSheetCellValue(raw)).toEqual({ status: "na", note: "", doneAt: null });
    }
  });

  it("reads blank, whitespace and non-strings as open", () => {
    for (const raw of ["", "   ", null, undefined, 5, {}, []]) {
      expect(parseSheetCellValue(raw)).toEqual(EMPTY_TASK_CELL);
    }
  });

  it("treats any other free text as an answered cell carrying that text as its note", () => {
    // This is the sheet's real behavior: "Talk with lead" in a Y/N column
    // means the question has been answered, and the answer is the text.
    expect(parseSheetCellValue("Talk with lead")).toEqual({
      status: "done",
      note: "Talk with lead",
      doneAt: null,
    });
    expect(parseSheetCellValue("  Sharepoint  ")).toEqual({
      status: "done",
      note: "Sharepoint",
      doneAt: null,
    });
    expect(parseSheetCellValue("Swanson 006/008").note).toBe("Swanson 006/008");
  });

  it("truncates an over-long free-text answer to the note cap", () => {
    expect(parseSheetCellValue("z".repeat(500)).note).toHaveLength(TASK_NOTE_MAX_LENGTH);
  });
});

describe("editing a cell", () => {
  it("stamps doneAt when the status becomes done", () => {
    const next = setTaskCellStatus(EMPTY_TASK_CELL, "done", WED);
    expect(next).toEqual({ status: "done", note: "", doneAt: WED });
  });

  it("clears doneAt for every status other than done", () => {
    const done: TaskCell = { status: "done", note: "", doneAt: WED };
    expect(setTaskCellStatus(done, "open", WED).doneAt).toBeNull();
    expect(setTaskCellStatus(done, "blocked", WED).doneAt).toBeNull();
    expect(setTaskCellStatus(done, "na", WED).doneAt).toBeNull();
  });

  it("preserves the note across a status change", () => {
    const cell: TaskCell = { status: "open", note: "waiting on the dean", doneAt: null };
    expect(setTaskCellStatus(cell, "done", WED).note).toBe("waiting on the dean");
    expect(setTaskCellStatus(cell, "na", WED).note).toBe("waiting on the dean");
  });

  it("preserves the status across a note change", () => {
    const cell: TaskCell = { status: "done", note: "", doneAt: WED };
    const next = setTaskCellNote(cell, "Sharepoint");
    expect(next.status).toBe("done");
    expect(next.doneAt).toBe(WED);
    expect(next.note).toBe("Sharepoint");
  });

  it("trims and caps a note on write", () => {
    expect(setTaskCellNote(EMPTY_TASK_CELL, "   spaced   ").note).toBe("spaced");
    expect(setTaskCellNote(EMPTY_TASK_CELL, "q".repeat(400)).note).toHaveLength(TASK_NOTE_MAX_LENGTH);
  });

  it("does not mutate the cell it was given", () => {
    const cell: TaskCell = { status: "open", note: "before", doneAt: null };
    setTaskCellStatus(cell, "done", WED);
    setTaskCellNote(cell, "after");
    expect(cell).toEqual({ status: "open", note: "before", doneAt: null });
  });

  it("re-stamps doneAt when a done cell is set to done again at a later instant", () => {
    const later = WED + 86_400_000;
    const cell: TaskCell = { status: "done", note: "", doneAt: WED };
    expect(setTaskCellStatus(cell, "done", later).doneAt).toBe(later);
  });
});

describe("applyTaskCell - an open, unnoted cell is stored as absence", () => {
  it("writes a non-empty cell into the map", () => {
    const out = applyTaskCell({}, "labs-added", { status: "done", note: "", doneAt: WED });
    expect(out).toEqual({ "labs-added": { status: "done", note: "", doneAt: WED } });
  });

  it("deletes the key when the cell becomes empty, rather than storing an open cell", () => {
    const before: TaskCellMap = { "labs-added": { status: "done", note: "", doneAt: WED } };
    const after = applyTaskCell(before, "labs-added", EMPTY_TASK_CELL);
    expect(after).toEqual({});
    expect("labs-added" in after).toBe(false);
  });

  it("replaces an existing non-empty cell with another non-empty cell", () => {
    const before: TaskCellMap = { "labs-added": { status: "done", note: "old", doneAt: WED } };
    const after = applyTaskCell(before, "labs-added", { status: "blocked", note: "new", doneAt: null });
    expect(after).toEqual({ "labs-added": { status: "blocked", note: "new", doneAt: null } });
  });

  it("keeps an open cell that carries a note", () => {
    const out = applyTaskCell({}, "labs-added", { status: "open", note: "waiting", doneAt: null });
    expect(out["labs-added"]).toEqual({ status: "open", note: "waiting", doneAt: null });
  });

  it("leaves the other keys alone", () => {
    const before: TaskCellMap = {
      "labs-added": { status: "done", note: "", doneAt: WED },
      "tests-made": { status: "na", note: "", doneAt: null },
    };
    const after = applyTaskCell(before, "labs-added", EMPTY_TASK_CELL);
    expect(after).toEqual({ "tests-made": { status: "na", note: "", doneAt: null } });
  });

  it("does not mutate the map it was given", () => {
    const before: TaskCellMap = { "labs-added": { status: "done", note: "", doneAt: WED } };
    applyTaskCell(before, "tests-made", { status: "done", note: "", doneAt: WED });
    applyTaskCell(before, "labs-added", EMPTY_TASK_CELL);
    expect(Object.keys(before)).toEqual(["labs-added"]);
  });
});

describe("mergeTaskCellEntries - the server-side per-key merge", () => {
  // This is what stops two cells of the same course clobbering each other:
  // the server re-reads the stored map and merges the changed KEYS into it,
  // rather than accepting a whole map built from stale client state.
  it("adds a new key without disturbing the others", () => {
    const current: TaskCellMap = { a: { status: "done", note: "", doneAt: WED } };
    const out = mergeTaskCellEntries(current, { b: { status: "na", note: "", doneAt: null } });
    expect(out).toEqual({
      a: { status: "done", note: "", doneAt: WED },
      b: { status: "na", note: "", doneAt: null },
    });
  });

  it("overwrites only the keys named in the patch", () => {
    const current: TaskCellMap = {
      a: { status: "done", note: "keep", doneAt: WED },
      b: { status: "open", note: "old", doneAt: null },
    };
    const out = mergeTaskCellEntries(current, { b: { status: "blocked", note: "new", doneAt: null } });
    expect(out.a).toEqual({ status: "done", note: "keep", doneAt: WED });
    expect(out.b).toEqual({ status: "blocked", note: "new", doneAt: null });
  });

  it("deletes a key when the patch maps it to null", () => {
    const current: TaskCellMap = {
      a: { status: "done", note: "", doneAt: WED },
      b: { status: "na", note: "", doneAt: null },
    };
    expect(mergeTaskCellEntries(current, { a: null })).toEqual({ b: { status: "na", note: "", doneAt: null } });
  });

  it("deletes a key when the patch supplies an empty cell, rather than storing an open cell", () => {
    const current: TaskCellMap = { a: { status: "done", note: "", doneAt: WED } };
    expect(mergeTaskCellEntries(current, { a: EMPTY_TASK_CELL })).toEqual({});
  });

  it("applies several keys in one pass, mixing writes and deletes", () => {
    const current: TaskCellMap = {
      a: { status: "done", note: "", doneAt: WED },
      b: { status: "done", note: "", doneAt: WED },
      c: { status: "done", note: "", doneAt: WED },
    };
    const out = mergeTaskCellEntries(current, {
      a: null,
      b: { status: "na", note: "", doneAt: null },
      d: { status: "blocked", note: "", doneAt: null },
    });
    expect(out).toEqual({
      b: { status: "na", note: "", doneAt: null },
      c: { status: "done", note: "", doneAt: WED },
      d: { status: "blocked", note: "", doneAt: null },
    });
  });

  it("coerces an untrusted stored map before merging, so a corrupt row cannot survive a write", () => {
    const out = mergeTaskCellEntries(
      { a: { status: "nonsense", note: 7, doneAt: "x" } } as unknown as TaskCellMap,
      { b: { status: "done", note: "", doneAt: WED } }
    );
    expect(out).toEqual({ b: { status: "done", note: "", doneAt: WED } });
  });

  it("tolerates a non-object stored map", () => {
    expect(mergeTaskCellEntries(null as unknown as TaskCellMap, { a: { status: "done", note: "", doneAt: WED } }))
      .toEqual({ a: { status: "done", note: "", doneAt: WED } });
    expect(mergeTaskCellEntries(undefined as unknown as TaskCellMap, {})).toEqual({});
  });

  it("returns the stored map unchanged for an empty patch", () => {
    const current: TaskCellMap = { a: { status: "done", note: "", doneAt: WED } };
    expect(mergeTaskCellEntries(current, {})).toEqual(current);
  });

  it("does not mutate the map it was given", () => {
    const current: TaskCellMap = { a: { status: "done", note: "", doneAt: WED } };
    mergeTaskCellEntries(current, { a: null, b: { status: "na", note: "", doneAt: null } });
    expect(current).toEqual({ a: { status: "done", note: "", doneAt: WED } });
  });
});

describe("period-scoped completion (AC14) - answered at read time, never by mutation", () => {
  const done = (at: number): TaskCell => ({ status: "done", note: "", doneAt: at });
  const YESTERDAY = new Date(2026, 7, 4, 14, 0, 0).getTime();
  const LAST_WEEK = new Date(2026, 6, 29, 14, 0, 0).getTime();

  it("treats a 'once' task's completion as permanent", () => {
    expect(isTaskDoneNow(done(LAST_WEEK), "once", WED)).toBe(true);
    expect(isTaskDoneNow(done(WED), "once", WED)).toBe(true);
  });

  it("expires a daily task's completion once the local day rolls over", () => {
    expect(isTaskDoneNow(done(WED), "daily", WED)).toBe(true);
    expect(isTaskDoneNow(done(YESTERDAY), "daily", WED)).toBe(false);
  });

  it("keeps a daily completion for the whole of its own local day", () => {
    const earlyWed = new Date(2026, 7, 5, 0, 1, 0).getTime();
    const lateWed = new Date(2026, 7, 5, 23, 59, 0).getTime();
    expect(isTaskDoneNow(done(earlyWed), "daily", lateWed)).toBe(true);
  });

  it("expires a weekly task's completion once the Sunday-started week rolls over", () => {
    expect(isTaskDoneNow(done(WED), "weekly", WED)).toBe(true);
    expect(isTaskDoneNow(done(LAST_WEEK), "weekly", WED)).toBe(false);
  });

  it("keeps a weekly completion across days inside the same week", () => {
    const sunday = new Date(2026, 7, 2, 9, 0, 0).getTime();
    const saturday = new Date(2026, 7, 8, 23, 0, 0).getTime();
    expect(isTaskDoneNow(done(sunday), "weekly", saturday)).toBe(true);
  });

  it("treats a done cell with no doneAt as never-expiring, for every cadence", () => {
    // A legacy or hand-edited row has no period to compare against; silently
    // unchecking it would look like data loss, not a feature. This matches
    // isChecklistItemCheckedNow's own documented decision.
    const noStamp: TaskCell = { status: "done", note: "", doneAt: null };
    expect(isTaskDoneNow(noStamp, "once", WED)).toBe(true);
    expect(isTaskDoneNow(noStamp, "daily", WED)).toBe(true);
    expect(isTaskDoneNow(noStamp, "weekly", WED)).toBe(true);
  });

  it("is false for every status other than done, whatever the cadence", () => {
    for (const status of ["open", "blocked", "na"] as const) {
      const cell: TaskCell = { status, note: "", doneAt: null };
      expect(isTaskDoneNow(cell, "once", WED)).toBe(false);
      expect(isTaskDoneNow(cell, "daily", WED)).toBe(false);
      expect(isTaskDoneNow(cell, "weekly", WED)).toBe(false);
    }
  });

  it("does NOT expire blocked or na - only completion is period-scoped", () => {
    const blocked: TaskCell = { status: "blocked", note: "", doneAt: null };
    const na: TaskCell = { status: "na", note: "", doneAt: null };
    expect(effectiveTaskStatus(blocked, "daily", WED)).toBe("blocked");
    expect(effectiveTaskStatus(na, "weekly", WED)).toBe("na");
  });

  it("reads an expired completion back as open, not as done", () => {
    expect(effectiveTaskStatus(done(YESTERDAY), "daily", WED)).toBe("open");
    expect(effectiveTaskStatus(done(LAST_WEEK), "weekly", WED)).toBe("open");
    expect(effectiveTaskStatus(done(LAST_WEEK), "once", WED)).toBe("done");
  });

  it("never mutates the cell it is asked about", () => {
    const cell = done(LAST_WEEK);
    effectiveTaskStatus(cell, "weekly", WED);
    isTaskDoneNow(cell, "weekly", WED);
    expect(cell).toEqual({ status: "done", note: "", doneAt: LAST_WEEK });
  });

  it("counts open and blocked as outstanding, done and na as not", () => {
    expect(isTaskOutstanding({ status: "open", note: "", doneAt: null }, "once", WED)).toBe(true);
    expect(isTaskOutstanding({ status: "blocked", note: "", doneAt: null }, "once", WED)).toBe(true);
    expect(isTaskOutstanding(done(WED), "once", WED)).toBe(false);
    expect(isTaskOutstanding({ status: "na", note: "", doneAt: null }, "once", WED)).toBe(false);
  });

  it("counts an EXPIRED daily completion as outstanding again", () => {
    expect(isTaskOutstanding(done(YESTERDAY), "daily", WED)).toBe(true);
  });
});

describe("the local-period predicates shared with the weekly checklist", () => {
  it("isSameLocalDay is true only within one calendar day", () => {
    const a = new Date(2026, 7, 5, 0, 0, 1).getTime();
    const b = new Date(2026, 7, 5, 23, 59, 59).getTime();
    const c = new Date(2026, 7, 6, 0, 0, 1).getTime();
    expect(isSameLocalDay(a, b)).toBe(true);
    expect(isSameLocalDay(b, c)).toBe(false);
  });

  it("isSameLocalWeek treats weeks as Sunday-started", () => {
    // 2026-08-02 is a Sunday; 2026-08-08 is the Saturday that closes that week.
    const sunday = new Date(2026, 7, 2, 0, 0, 1).getTime();
    const saturday = new Date(2026, 7, 8, 23, 59, 59).getTime();
    expect(isSameLocalWeek(sunday, saturday)).toBe(true);
  });

  it("isSameLocalWeek splits at the Saturday/Sunday boundary, not at Monday", () => {
    const saturday = new Date(2026, 7, 1, 23, 59, 0).getTime();
    const sunday = new Date(2026, 7, 2, 0, 1, 0).getTime();
    const monday = new Date(2026, 7, 3, 0, 1, 0).getTime();
    expect(isSameLocalWeek(saturday, sunday)).toBe(false);
    expect(isSameLocalWeek(sunday, monday)).toBe(true);
  });

  it("isSameLocalWeek handles a week that spans a month boundary", () => {
    // Sunday 2026-08-30 through Saturday 2026-09-05.
    const aug30 = new Date(2026, 7, 30, 12, 0, 0).getTime();
    const sep5 = new Date(2026, 8, 5, 12, 0, 0).getTime();
    const sep6 = new Date(2026, 8, 6, 12, 0, 0).getTime();
    expect(isSameLocalWeek(aug30, sep5)).toBe(true);
    expect(isSameLocalWeek(aug30, sep6)).toBe(false);
  });

  it("isSameLocalWeek handles a week that spans a year boundary", () => {
    // Sunday 2026-12-27 through Saturday 2027-01-02.
    const dec27 = new Date(2026, 11, 27, 12, 0, 0).getTime();
    const jan2 = new Date(2027, 0, 2, 12, 0, 0).getTime();
    const jan3 = new Date(2027, 0, 3, 12, 0, 0).getTime();
    expect(isSameLocalWeek(dec27, jan2)).toBe(true);
    expect(isSameLocalWeek(dec27, jan3)).toBe(false);
  });

  it("survives the SPRING-FORWARD transition, where a day is only 23 hours", () => {
    // This is the case that actually catches the naive implementation (floor
    // to Sunday by subtracting getDay() * 86_400_000 from the raw epoch).
    // Sabotage-verified: an autumn fall-back week does NOT catch it, because
    // subtracting whole 24-hour blocks from a midday timestamp still lands on
    // the right calendar day. Spring forward is different - subtracting three
    // 24-hour blocks from Wednesday 00:30 CDT lands at Saturday 23:30 CST,
    // the PREVIOUS day and the PREVIOUS week, because the intervening Sunday
    // was only 23 hours long.
    //
    // In US locales DST begins on Sunday 2026-03-08. Times are deliberately
    // just after local midnight, which is where the error surfaces.
    const sunday = new Date(2026, 2, 8, 12, 0, 0).getTime();
    const wednesdayEarly = new Date(2026, 2, 11, 0, 30, 0).getTime();
    const saturdayLate = new Date(2026, 2, 14, 23, 30, 0).getTime();
    const nextSunday = new Date(2026, 2, 15, 0, 30, 0).getTime();
    expect(isSameLocalWeek(sunday, wednesdayEarly)).toBe(true);
    expect(isSameLocalWeek(sunday, saturdayLate)).toBe(true);
    expect(isSameLocalWeek(saturdayLate, nextSunday)).toBe(false);
  });

  it("survives the autumn fall-back transition too", () => {
    // DST ends Sunday 2026-11-01 in US locales; the 25-hour day must not
    // spill the week either.
    const sunday = new Date(2026, 10, 1, 12, 0, 0).getTime();
    const saturday = new Date(2026, 10, 7, 23, 30, 0).getTime();
    const nextSunday = new Date(2026, 10, 8, 0, 30, 0).getTime();
    expect(isSameLocalWeek(sunday, saturday)).toBe(true);
    expect(isSameLocalWeek(saturday, nextSunday)).toBe(false);
    expect(isSameLocalDay(new Date(2026, 10, 1, 0, 30, 0).getTime(), new Date(2026, 10, 1, 23, 30, 0).getTime())).toBe(true);
  });

  it("is reflexive and symmetric", () => {
    const a = new Date(2026, 7, 5, 8, 0, 0).getTime();
    const b = new Date(2026, 7, 7, 8, 0, 0).getTime();
    expect(isSameLocalWeek(a, a)).toBe(true);
    expect(isSameLocalWeek(a, b)).toBe(isSameLocalWeek(b, a));
    expect(isSameLocalDay(a, a)).toBe(true);
  });
});
