// TDD contract for the Tasks tab's view logic: resolving the per-user task
// catalog, filtering/sorting rows, progress arithmetic, persisted column state,
// and CSV export. Written BEFORE the implementation, from the acceptance
// criteria. Asserts observable behavior only.
import { describe, expect, it } from "vitest";
import { TERM_TASKS, RECURRING_TASKS } from "./course-tasks-catalog";
import type { TaskCellMap, TaskDefinition } from "./course-tasks";
import {
  ALL_FILTER,
  CURRENT_TASK_COLUMNS_VERSION,
  TASK_COLUMNS_ADDED_IN,
  DEFAULT_TASK_SORT,
  taskCellAccessibleName,
  normalizeTaskLabel,
  buildTasksCsv,
  computeTaskProgress,
  countColumnOutstanding,
  csvCellText,
  distinctInstitutions,
  distinctTerms,
  escapeCsvValue,
  filterTaskRows,
  formatTaskProgress,
  parseTaskColumnSet,
  parseTaskSortState,
  resolveTaskCatalog,
  serializeTaskColumnSet,
  sheetTokenForCell,
  sortTaskRows,
  TASK_STATUS_WORDS,
  type TaskCatalogOverride,
  type TaskRow,
} from "./course-tasks-view";

const NOW = new Date(2026, 7, 5, 14, 0, 0).getTime(); // Wednesday
const YESTERDAY = new Date(2026, 7, 4, 14, 0, 0).getTime();

function override(partial: Partial<TaskCatalogOverride> & { taskId: string }): TaskCatalogOverride {
  return {
    view: null,
    group: null,
    label: null,
    cadence: null,
    position: null,
    retired: false,
    custom: false,
    ...partial,
  };
}

// institution/term are `string | null` on the app's real Course
// (src/lib/supabase/courses.ts) and listCourseHubAction returns exactly that,
// so the row's course type must accept null - not merely undefined, or every
// caller would need an invented null-to-undefined mapping layer.
function row(
  id: string,
  name: string,
  institution: string | null | undefined,
  term: string | null | undefined,
  cells: TaskCellMap = {}
): TaskRow {
  return { course: { id, name, institution, term }, cells };
}

describe("resolveTaskCatalog", () => {
  it("returns the built-in catalog for the view, in order, when there are no overrides", () => {
    const resolved = resolveTaskCatalog(TERM_TASKS, [], "term");
    expect(resolved.map((t) => t.id)).toEqual(TERM_TASKS.map((t) => t.id));
  });

  it("returns only the requested view's tasks", () => {
    const all = [...TERM_TASKS, ...RECURRING_TASKS];
    expect(resolveTaskCatalog(all, [], "term")).toHaveLength(40);
    expect(resolveTaskCatalog(all, [], "recurring")).toHaveLength(12);
    expect(resolveTaskCatalog(all, [], "recurring").every((t) => t.view === "recurring")).toBe(true);
  });

  it("applies a rename while keeping the built-in id and its built-in flag", () => {
    const resolved = resolveTaskCatalog(TERM_TASKS, [override({ taskId: "textbook-owned", label: "Desk copy in hand?" })], "term");
    const task = resolved.find((t) => t.id === "textbook-owned");
    expect(task?.label).toBe("Desk copy in hand?");
    expect(task?.builtIn).toBe(true);
  });

  it("ignores a blank or whitespace-only rename rather than creating an unlabelled column", () => {
    for (const label of ["", "   "]) {
      const resolved = resolveTaskCatalog(TERM_TASKS, [override({ taskId: "textbook-owned", label })], "term");
      expect(resolved.find((t) => t.id === "textbook-owned")?.label).toBe("Textbook Owned?");
    }
  });

  it("drops a retired task from the resolved catalog", () => {
    const resolved = resolveTaskCatalog(TERM_TASKS, [override({ taskId: "labs-added", retired: true })], "term");
    expect(resolved).toHaveLength(39);
    expect(resolved.some((t) => t.id === "labs-added")).toBe(false);
  });

  it("brings a retired task back when its retirement is lifted", () => {
    const resolved = resolveTaskCatalog(TERM_TASKS, [override({ taskId: "labs-added", retired: false })], "term");
    expect(resolved.some((t) => t.id === "labs-added")).toBe(true);
  });

  it("inserts a custom task into the requested group", () => {
    const resolved = resolveTaskCatalog(
      TERM_TASKS,
      [override({ taskId: "custom-parking", label: "Parking pass renewed?", view: "term", group: "dependent", custom: true, position: 0 })],
      "term"
    );
    expect(resolved).toHaveLength(41);
    const task = resolved.find((t) => t.id === "custom-parking");
    expect(task).toMatchObject({ label: "Parking pass renewed?", group: "dependent", builtIn: false });
    expect(resolved[0].id).toBe("custom-parking");
  });

  it("gives a custom term task cadence 'once' and a custom recurring task its declared cadence", () => {
    const termCustom = resolveTaskCatalog(
      TERM_TASKS,
      [override({ taskId: "c1", label: "X", view: "term", group: "dependent", custom: true })],
      "term"
    );
    expect(termCustom.find((t) => t.id === "c1")?.cadence).toBe("once");

    const recurringCustom = resolveTaskCatalog(
      RECURRING_TASKS,
      [override({ taskId: "c2", label: "Y", view: "recurring", group: "daily", cadence: "daily", custom: true })],
      "recurring"
    );
    expect(recurringCustom.find((t) => t.id === "c2")?.cadence).toBe("daily");
  });

  it("does not leak a custom task into the other view", () => {
    const resolved = resolveTaskCatalog(
      TERM_TASKS,
      [override({ taskId: "custom-parking", label: "Parking pass renewed?", view: "term", group: "dependent", custom: true })],
      "recurring"
    );
    expect(resolved.some((t) => t.id === "custom-parking")).toBe(false);
  });

  it("ignores a custom task with a blank label, and one whose group does not belong to the view", () => {
    const blank = resolveTaskCatalog(TERM_TASKS, [override({ taskId: "c1", label: "  ", view: "term", group: "dependent", custom: true })], "term");
    expect(blank.some((t) => t.id === "c1")).toBe(false);

    const wrongGroup = resolveTaskCatalog(TERM_TASKS, [override({ taskId: "c2", label: "X", view: "term", group: "daily", custom: true })], "term");
    expect(wrongGroup.some((t) => t.id === "c2")).toBe(false);
  });

  it("ignores an override naming a built-in id that does not exist, without crashing", () => {
    expect(() => resolveTaskCatalog(TERM_TASKS, [override({ taskId: "not-a-real-task", label: "Ghost" })], "term")).not.toThrow();
    const resolved = resolveTaskCatalog(TERM_TASKS, [override({ taskId: "not-a-real-task", label: "Ghost" })], "term");
    expect(resolved).toHaveLength(40);
    expect(resolved.some((t) => t.id === "not-a-real-task")).toBe(false);
  });

  it("keeps groups contiguous - a repositioned task never escapes its own group", () => {
    const resolved = resolveTaskCatalog(TERM_TASKS, [override({ taskId: "final-grades-entered", position: -100 })], "term");
    const groups = resolved.map((t) => t.group);
    const firstIndependent = groups.indexOf("independent");
    expect(groups.slice(0, firstIndependent).every((g) => g === "dependent")).toBe(true);
    expect(groups.slice(firstIndependent).every((g) => g === "independent")).toBe(true);
    // It moved to the front of ITS group, not the front of the table.
    expect(resolved[firstIndependent].id).toBe("final-grades-entered");
  });

  it("moves a task to another group when the override names one, appending it there", () => {
    // `position` is an index WITHIN the task's resolved group, and null means
    // "append to the end of that group". Without pinning this, a cross-group
    // move with no position could equally land at its old built-in index
    // (17), which is past the end of the 17-member dependent group - two
    // defensible readings, two different tables.
    const resolved = resolveTaskCatalog(TERM_TASKS, [override({ taskId: "labs-added", group: "dependent" })], "term");
    expect(resolved.find((t) => t.id === "labs-added")?.group).toBe("dependent");
    expect(resolved.filter((t) => t.group === "dependent")).toHaveLength(18);
    expect(resolved.filter((t) => t.group === "independent")).toHaveLength(22);
    expect(resolved[17].id).toBe("labs-added");
  });

  it("appends a custom task with no position to the end of its group", () => {
    const resolved = resolveTaskCatalog(
      TERM_TASKS,
      [override({ taskId: "custom-parking", label: "Parking pass renewed?", view: "term", group: "dependent", custom: true })],
      "term"
    );
    expect(resolved[17].id).toBe("custom-parking");
  });

  it("treats position as an index within the group, not within the whole table", () => {
    const resolved = resolveTaskCatalog(
      TERM_TASKS,
      [override({ taskId: "custom-late", label: "Late?", view: "term", group: "independent", custom: true, position: 0 })],
      "term"
    );
    const firstIndependent = resolved.findIndex((t) => t.group === "independent");
    expect(resolved[firstIndependent].id).toBe("custom-late");
  });

  it("breaks a position tie by built-in catalog order, identically however the overrides arrive", () => {
    // labs-added (built-in index 17), points-added (22) and tests-made (29)
    // all claim position 5 in the independent group; catalog order decides.
    const overrides = [
      override({ taskId: "tests-made", position: 5 }),
      override({ taskId: "labs-added", position: 5 }),
      override({ taskId: "points-added", position: 5 }),
    ];
    const first = resolveTaskCatalog(TERM_TASKS, overrides, "term").map((t) => t.id);
    const second = resolveTaskCatalog(TERM_TASKS, [...overrides].reverse(), "term").map((t) => t.id);
    expect(first).toEqual(second);
    const tied = first.filter((id) => ["labs-added", "points-added", "tests-made"].includes(id));
    expect(tied).toEqual(["labs-added", "points-added", "tests-made"]);
  });

  it("never mutates the catalog or the overrides it is given", () => {
    const overrides = [override({ taskId: "labs-added", label: "Renamed", retired: false })];
    const snapshotCatalog = JSON.stringify(TERM_TASKS);
    const snapshotOverrides = JSON.stringify(overrides);
    resolveTaskCatalog(TERM_TASKS, overrides, "term");
    expect(JSON.stringify(TERM_TASKS)).toBe(snapshotCatalog);
    expect(JSON.stringify(overrides)).toBe(snapshotOverrides);
  });
});

describe("progress arithmetic", () => {
  const tasks: TaskDefinition[] = [
    { id: "a", label: "A", view: "term", group: "dependent", cadence: "once", builtIn: true },
    { id: "b", label: "B", view: "term", group: "dependent", cadence: "once", builtIn: true },
    { id: "c", label: "C", view: "term", group: "dependent", cadence: "once", builtIn: true },
    { id: "d", label: "D", view: "term", group: "dependent", cadence: "once", builtIn: true },
  ];

  it("counts done over applicable, excluding not-applicable tasks from the denominator", () => {
    const cells: TaskCellMap = {
      a: { status: "done", note: "", doneAt: NOW },
      b: { status: "na", note: "", doneAt: null },
      c: { status: "blocked", note: "", doneAt: null },
    };
    expect(computeTaskProgress(cells, tasks, NOW)).toEqual({ done: 1, applicable: 3, outstanding: 2 });
  });

  it("treats an unstored task as open and applicable", () => {
    expect(computeTaskProgress({}, tasks, NOW)).toEqual({ done: 0, applicable: 4, outstanding: 4 });
  });

  it("reports zero applicable when every task is not-applicable - never divides by zero", () => {
    const cells: TaskCellMap = Object.fromEntries(
      tasks.map((t) => [t.id, { status: "na" as const, note: "", doneAt: null }])
    );
    const progress = computeTaskProgress(cells, tasks, NOW);
    expect(progress).toEqual({ done: 0, applicable: 0, outstanding: 0 });
    expect(formatTaskProgress(progress)).toBe("-");
  });

  it("reports zeroes for an empty task list", () => {
    const progress = computeTaskProgress({}, [], NOW);
    expect(progress).toEqual({ done: 0, applicable: 0, outstanding: 0 });
    expect(formatTaskProgress(progress)).toBe("-");
  });

  it("formats a real ratio as done/applicable", () => {
    expect(formatTaskProgress({ done: 12, applicable: 38, outstanding: 26 })).toBe("12/38");
    expect(formatTaskProgress({ done: 0, applicable: 4, outstanding: 4 })).toBe("0/4");
  });

  it("counts an EXPIRED daily completion as outstanding, not done", () => {
    const daily: TaskDefinition[] = [
      { id: "x", label: "X", view: "recurring", group: "daily", cadence: "daily", builtIn: true },
    ];
    const cells: TaskCellMap = { x: { status: "done", note: "", doneAt: YESTERDAY } };
    expect(computeTaskProgress(cells, daily, NOW)).toEqual({ done: 0, applicable: 1, outstanding: 1 });
    // The same cell, read on the day it was ticked, is done.
    expect(computeTaskProgress(cells, daily, YESTERDAY)).toEqual({ done: 1, applicable: 1, outstanding: 0 });
  });

  it("ignores stored cells for tasks that are not in the list (a retired task's history)", () => {
    const cells: TaskCellMap = {
      a: { status: "done", note: "", doneAt: NOW },
      "retired-task": { status: "done", note: "", doneAt: NOW },
    };
    expect(computeTaskProgress(cells, tasks, NOW).applicable).toBe(4);
    expect(computeTaskProgress(cells, tasks, NOW).done).toBe(1);
  });

  it("counts a column's outstanding rows across the visible set", () => {
    const rows: TaskRow[] = [
      row("1", "Alpha", "MCC", "2026 Fall", { a: { status: "done", note: "", doneAt: NOW } }),
      row("2", "Beta", "MCC", "2026 Fall", { a: { status: "blocked", note: "", doneAt: null } }),
      row("3", "Gamma", "MCC", "2026 Fall", { a: { status: "na", note: "", doneAt: null } }),
      row("4", "Delta", "MCC", "2026 Fall", {}),
    ];
    expect(countColumnOutstanding(rows, "a", "once", NOW)).toBe(2);
    expect(countColumnOutstanding([], "a", "once", NOW)).toBe(0);
  });
});

describe("filtering", () => {
  const tasks: TaskDefinition[] = [
    { id: "a", label: "A", view: "term", group: "dependent", cadence: "once", builtIn: true },
  ];
  const rows: TaskRow[] = [
    row("1", "Software Testing", "Metro", "2025 Winter", { a: { status: "done", note: "", doneAt: NOW } }),
    row("2", "College Algebra", "NE Wesleyan", "2026 Spring", { a: { status: "open", note: "Talk with dean", doneAt: null } }),
    row("3", "Databases", "Midland", "2026 Fall", {}),
    row("4", "Ethical Hacking", "Midland", "2026 Fall", { a: { status: "na", note: "", doneAt: null } }),
  ];
  const none = { search: "", institution: ALL_FILTER, term: ALL_FILTER, outstandingOnly: false };

  it("returns every row when nothing is filtered", () => {
    expect(filterTaskRows(rows, tasks, none, NOW)).toHaveLength(4);
  });

  it("matches the search against course name, case-insensitively", () => {
    expect(filterTaskRows(rows, tasks, { ...none, search: "algebra" }, NOW).map((r) => r.course.id)).toEqual(["2"]);
  });

  it("matches the search against institution and term too", () => {
    expect(filterTaskRows(rows, tasks, { ...none, search: "midland" }, NOW)).toHaveLength(2);
    expect(filterTaskRows(rows, tasks, { ...none, search: "2026 spring" }, NOW).map((r) => r.course.id)).toEqual(["2"]);
  });

  it("matches the search against a cell note", () => {
    expect(filterTaskRows(rows, tasks, { ...none, search: "dean" }, NOW).map((r) => r.course.id)).toEqual(["2"]);
  });

  it("trims the search and treats a whitespace-only search as no search", () => {
    expect(filterTaskRows(rows, tasks, { ...none, search: "   " }, NOW)).toHaveLength(4);
    expect(filterTaskRows(rows, tasks, { ...none, search: "  algebra  " }, NOW)).toHaveLength(1);
  });

  it("filters by institution and by term", () => {
    expect(filterTaskRows(rows, tasks, { ...none, institution: "Midland" }, NOW)).toHaveLength(2);
    expect(filterTaskRows(rows, tasks, { ...none, term: "2026 Fall" }, NOW)).toHaveLength(2);
    expect(filterTaskRows(rows, tasks, { ...none, institution: "Midland", term: "2026 Fall" }, NOW)).toHaveLength(2);
    expect(filterTaskRows(rows, tasks, { ...none, institution: "Metro", term: "2026 Fall" }, NOW)).toHaveLength(0);
  });

  it("shows only rows with something outstanding when asked", () => {
    // Row 1 is done, row 4 is n/a - neither is outstanding. Rows 2 and 3 are.
    const out = filterTaskRows(rows, tasks, { ...none, outstandingOnly: true }, NOW);
    expect(out.map((r) => r.course.id)).toEqual(["2", "3"]);
  });

  it("combines every filter conjunctively", () => {
    const out = filterTaskRows(rows, tasks, { search: "d", institution: "Midland", term: "2026 Fall", outstandingOnly: true }, NOW);
    expect(out.map((r) => r.course.id)).toEqual(["3"]);
  });

  it("does not mutate the row array it is given", () => {
    const input = [...rows];
    filterTaskRows(input, tasks, { ...none, search: "algebra" }, NOW);
    expect(input).toHaveLength(4);
  });

  it("lists the distinct institutions and terms present, sorted, with no blanks", () => {
    expect(distinctInstitutions(rows)).toEqual(["Metro", "Midland", "NE Wesleyan"]);
    expect(distinctTerms(rows)).toEqual(["2025 Winter", "2026 Fall", "2026 Spring"]);
    // null, undefined, empty and whitespace-only must all be excluded - the
    // app's Course carries null, not undefined, for an unset field.
    const withBlanks = [
      ...rows,
      row("5", "Nameless", "", undefined),
      row("6", "Nulled", null, null),
      row("7", "Spaced", "   ", "   "),
    ];
    expect(distinctInstitutions(withBlanks)).toEqual(["Metro", "Midland", "NE Wesleyan"]);
    expect(distinctTerms(withBlanks)).toEqual(["2025 Winter", "2026 Fall", "2026 Spring"]);
  });

  it("does not crash searching a course whose institution or term is null", () => {
    const withNull = [...rows, row("6", "Nulled", null, null)];
    expect(() => filterTaskRows(withNull, tasks, { ...none, search: "midland" }, NOW)).not.toThrow();
    expect(filterTaskRows(withNull, tasks, { ...none, search: "nulled" }, NOW).map((r) => r.course.id)).toEqual(["6"]);
  });
});

describe("sorting", () => {
  const tasks: TaskDefinition[] = [
    { id: "a", label: "A", view: "term", group: "dependent", cadence: "once", builtIn: true },
    { id: "b", label: "B", view: "term", group: "dependent", cadence: "once", builtIn: true },
  ];
  const rows: TaskRow[] = [
    row("1", "Zebra", "Metro", "2026 Fall", { a: { status: "done", note: "", doneAt: NOW }, b: { status: "done", note: "", doneAt: NOW } }),
    row("2", "Alpha", "Midland", "2025 Winter", {}),
    row("3", "Mango", "Metro", "2026 Spring", { a: { status: "done", note: "", doneAt: NOW } }),
  ];

  it("defaults to course name ascending", () => {
    expect(DEFAULT_TASK_SORT).toEqual({ field: "name", direction: "asc" });
    expect(sortTaskRows(rows, tasks, DEFAULT_TASK_SORT, NOW).map((r) => r.course.name)).toEqual(["Alpha", "Mango", "Zebra"]);
  });

  it("sorts by name descending", () => {
    expect(sortTaskRows(rows, tasks, { field: "name", direction: "desc" }, NOW).map((r) => r.course.name)).toEqual(["Zebra", "Mango", "Alpha"]);
  });

  it("sorts by institution, breaking ties on course name", () => {
    expect(sortTaskRows(rows, tasks, { field: "institution", direction: "asc" }, NOW).map((r) => r.course.name)).toEqual(["Mango", "Zebra", "Alpha"]);
  });

  it("sorts by term, breaking ties on course name", () => {
    expect(sortTaskRows(rows, tasks, { field: "term", direction: "asc" }, NOW).map((r) => r.course.name)).toEqual(["Alpha", "Zebra", "Mango"]);
  });

  it("sorts by progress", () => {
    // Zebra 2/2, Mango 1/2, Alpha 0/2.
    expect(sortTaskRows(rows, tasks, { field: "progress", direction: "asc" }, NOW).map((r) => r.course.name)).toEqual(["Alpha", "Mango", "Zebra"]);
    expect(sortTaskRows(rows, tasks, { field: "progress", direction: "desc" }, NOW).map((r) => r.course.name)).toEqual(["Zebra", "Mango", "Alpha"]);
  });

  it("sorts by progress as a RATIO, not a raw done count", () => {
    // These two diverge the moment the denominators differ, and the rows
    // above cannot tell them apart because every row there has the same
    // denominator. Low 1/2 = 50 percent; High 1/1 = 100 percent. Under a raw
    // count they tie; under a ratio High wins.
    const ratioRows: TaskRow[] = [
      row("low", "Low", "MCC", "2026 Fall", { a: { status: "done", note: "", doneAt: NOW } }),
      row("high", "High", "MCC", "2026 Fall", {
        a: { status: "done", note: "", doneAt: NOW },
        b: { status: "na", note: "", doneAt: null },
      }),
    ];
    expect(sortTaskRows(ratioRows, tasks, { field: "progress", direction: "desc" }, NOW).map((r) => r.course.id))
      .toEqual(["high", "low"]);
  });

  it("sorts a row with nothing applicable consistently rather than producing NaN", () => {
    const allNa: TaskRow[] = [
      row("na", "AllNa", "MCC", "2026 Fall", {
        a: { status: "na", note: "", doneAt: null },
        b: { status: "na", note: "", doneAt: null },
      }),
      row("half", "Half", "MCC", "2026 Fall", { a: { status: "done", note: "", doneAt: NOW } }),
    ];
    // A zero denominator must not sort as NaN (which compares false against
    // everything and makes the order depend on the input sequence).
    const asc = sortTaskRows(allNa, tasks, { field: "progress", direction: "asc" }, NOW).map((r) => r.course.id);
    const ascReversed = sortTaskRows([...allNa].reverse(), tasks, { field: "progress", direction: "asc" }, NOW).map((r) => r.course.id);
    expect(asc).toEqual(ascReversed);
  });

  it("sorts a course with a blank or null institution LAST, in both directions", () => {
    // Matches the convention courses-table-helpers.ts already establishes for
    // the Courses table: an empty value sorts last whichever way the column
    // is pointed, so a blank never displaces real data at the top.
    const withBlank = [...rows, row("4", "Blankco", null, null)];
    expect(sortTaskRows(withBlank, tasks, { field: "institution", direction: "asc" }, NOW).at(-1)?.course.id).toBe("4");
    expect(sortTaskRows(withBlank, tasks, { field: "institution", direction: "desc" }, NOW).at(-1)?.course.id).toBe("4");
    expect(sortTaskRows(withBlank, tasks, { field: "institution", direction: "asc" }, NOW)).toHaveLength(4);
  });

  it("is a TOTAL order - identical name, institution and term still resolve to one fixed sequence", () => {
    // Course name alone is NOT a total order, and this is not hypothetical:
    // the source workbook contains "Course 1" three times (SCC, SHNU, Mid
    // Plains) and "Course 2" and "Course 3" three times each. With every
    // documented key equal the comparator returns 0, Array.sort is stable,
    // and the output would simply echo the input order - so the two calls
    // below would disagree. The final tie-break must be the course id.
    const ties: TaskRow[] = [
      row("b", "Course 1", "MCC", "2026 Fall"),
      row("c", "Course 1", "MCC", "2026 Fall"),
      row("a", "Course 1", "MCC", "2026 Fall"),
    ];
    const forward = sortTaskRows(ties, tasks, { field: "institution", direction: "asc" }, NOW).map((r) => r.course.id);
    const reversed = sortTaskRows([...ties].reverse(), tasks, { field: "institution", direction: "asc" }, NOW).map((r) => r.course.id);
    expect(forward).toEqual(["a", "b", "c"]);
    expect(reversed).toEqual(["a", "b", "c"]);
  });

  it("breaks ties ascending even when the sort direction is descending", () => {
    const ties: TaskRow[] = [
      row("c", "Course 1", "MCC", "2026 Fall"),
      row("a", "Course 1", "MCC", "2026 Fall"),
      row("b", "Course 1", "MCC", "2026 Fall"),
    ];
    expect(sortTaskRows(ties, tasks, { field: "institution", direction: "desc" }, NOW).map((r) => r.course.id))
      .toEqual(["a", "b", "c"]);
  });

  it("does not mutate the array it is given", () => {
    const input = [...rows];
    sortTaskRows(input, tasks, { field: "name", direction: "asc" }, NOW);
    expect(input.map((r) => r.course.id)).toEqual(["1", "2", "3"]);
  });

  it("parses a persisted sort state, and falls back to the default on anything malformed", () => {
    expect(parseTaskSortState(JSON.stringify({ field: "progress", direction: "desc" }))).toEqual({ field: "progress", direction: "desc" });
    for (const raw of [null, undefined, "", "{", "[]", JSON.stringify({ field: "nope", direction: "asc" }), JSON.stringify({ field: "name", direction: "sideways" }), JSON.stringify("name")]) {
      expect(parseTaskSortState(raw)).toEqual(DEFAULT_TASK_SORT);
    }
  });
});

describe("persisted column visibility", () => {
  const allIds = ["a", "b", "c"];

  it("shows every column when nothing has been persisted", () => {
    expect(parseTaskColumnSet(null, { allIds })).toEqual(["a", "b", "c"]);
    expect(parseTaskColumnSet(undefined, { allIds })).toEqual(["a", "b", "c"]);
    expect(parseTaskColumnSet("", { allIds })).toEqual(["a", "b", "c"]);
  });

  it("falls back to every column on a malformed value rather than throwing", () => {
    for (const raw of ["{", "null", '"a"', "7", JSON.stringify({ v: "x", columns: ["a"] })]) {
      expect(parseTaskColumnSet(raw, { allIds })).toEqual(["a", "b", "c"]);
    }
  });

  it("round-trips a persisted subset", () => {
    const stored = serializeTaskColumnSet(["a", "c"], allIds);
    expect(parseTaskColumnSet(stored, { allIds })).toEqual(["a", "c"]);
  });

  it("stamps the current version on write", () => {
    expect(JSON.parse(serializeTaskColumnSet(["a"], allIds))).toEqual({
      v: CURRENT_TASK_COLUMNS_VERSION,
      columns: ["a"],
      known: allIds,
    });
  });

  it("drops ids that no longer exist, and de-duplicates", () => {
    const stored = JSON.stringify({ v: CURRENT_TASK_COLUMNS_VERSION, columns: ["a", "gone", "a", "c"] });
    expect(parseTaskColumnSet(stored, { allIds })).toEqual(["a", "c"]);
  });

  it("accepts the legacy bare-array shape as version 0", () => {
    expect(parseTaskColumnSet(JSON.stringify(["a", "c"]), { allIds })).toEqual(["a", "c"]);
  });

  it("unions in a BUILT-IN column added after the stored version, so an upgrade is never invisible", () => {
    // "c" is declared as added in a version above 0; a v0-stored set must gain it.
    const stored = JSON.stringify(["a"]);
    const parsed = parseTaskColumnSet(stored, { allIds, addedIn: { 1: ["c"] } });
    expect(parsed).toContain("a");
    expect(parsed).toContain("c");
    expect(parsed).not.toContain("b");
  });

  it("does not re-add a built-in the user hid AT the version that introduced it", () => {
    const stored = JSON.stringify({ v: 1, columns: ["a"] });
    expect(parseTaskColumnSet(stored, { allIds, addedIn: { 1: ["c"] } })).toEqual(["a"]);
  });

  it("does not re-add a built-in the user hid at a version ABOVE the one that introduced it", () => {
    // The rule is `addedVersion <= storedVersion -> skip`, not
    // `addedVersion !== storedVersion -> union`. The latter passes the two
    // tests above and then resurrects a hidden column on every later upgrade.
    const stored = JSON.stringify({ v: 2, columns: ["a"] });
    expect(parseTaskColumnSet(stored, { allIds, addedIn: { 1: ["c"] } })).toEqual(["a"]);
  });

  it("never declares a column at a version above the current one", () => {
    // The classic drift bug courses-table-helpers.ts warns about: an entry
    // added to the version map without bumping the version constant is
    // unioned into nobody's set.
    const declared = Object.keys(TASK_COLUMNS_ADDED_IN).map(Number);
    for (const v of declared) expect(v).toBeLessThanOrEqual(CURRENT_TASK_COLUMNS_VERSION);
  });

  it("shows a custom task the persisted set has never seen", () => {
    // A task the user just created must appear without them hunting for it.
    // `known` is the set of task ids that existed when the set was written.
    const stored = JSON.stringify({ v: CURRENT_TASK_COLUMNS_VERSION, columns: ["a"], known: ["a", "b"] });
    const parsed = parseTaskColumnSet(stored, { allIds: ["a", "b", "custom-1"] });
    expect(parsed).toContain("a");
    expect(parsed).toContain("custom-1");
    expect(parsed).not.toContain("b");
  });

  it("KEEPS a custom task hidden once the user has hidden it", () => {
    // This is why `known` exists rather than a bare list of custom ids: with
    // only "which ids are custom", a hidden custom column is indistinguishable
    // from a newly created one and gets resurrected on every single parse,
    // making it permanently impossible to hide.
    const stored = JSON.stringify({ v: CURRENT_TASK_COLUMNS_VERSION, columns: ["a"], known: ["a", "b", "custom-1"] });
    expect(parseTaskColumnSet(stored, { allIds: ["a", "b", "custom-1"] })).toEqual(["a"]);
  });

  it("records the full known-id set on write, so the next parse can tell new from hidden", () => {
    const written = JSON.parse(serializeTaskColumnSet(["a"], ["a", "b", "custom-1"]));
    expect(written).toEqual({ v: CURRENT_TASK_COLUMNS_VERSION, columns: ["a"], known: ["a", "b", "custom-1"] });
    // Round trip: what was hidden stays hidden.
    expect(parseTaskColumnSet(JSON.stringify(written), { allIds: ["a", "b", "custom-1"] })).toEqual(["a"]);
  });

  it("does no id-based union at all when the persisted set has no known list", () => {
    // Legacy values, written before `known` existed, carry no evidence of what
    // the user had actually seen. The safe reading is to union NOTHING on the
    // id path and fall back to the version path alone: guessing "anything not
    // listed must be new" would resurrect every column the user had hidden,
    // which is the exact failure the `known` list exists to prevent. The cost
    // is that a custom task created against a legacy payload stays hidden
    // until the column chooser is opened - and it self-heals, because `known`
    // is written on the very next save.
    const stored = JSON.stringify({ v: CURRENT_TASK_COLUMNS_VERSION, columns: ["a"] });
    expect(parseTaskColumnSet(stored, { allIds: ["a", "b"] })).toEqual(["a"]);
    // The version path still works without `known`.
    const legacy = JSON.stringify(["a"]);
    expect(parseTaskColumnSet(legacy, { allIds: ["a", "b", "c"], addedIn: { 1: ["c"] } })).toEqual(["a", "c"]);
  });

  it("allows an empty visible set - hiding everything is a legal state, not a reset", () => {
    expect(parseTaskColumnSet(serializeTaskColumnSet([], allIds), { allIds })).toEqual([]);
  });
});

describe("CSV export", () => {
  it("leaves a plain value unquoted", () => {
    expect(escapeCsvValue("Databases")).toBe("Databases");
    expect(escapeCsvValue("")).toBe("");
  });

  it("quotes a value containing a comma", () => {
    expect(escapeCsvValue("Smith-Curtis 220, Acklie 218")).toBe('"Smith-Curtis 220, Acklie 218"');
  });

  it("quotes a value containing a double quote, and doubles the quote", () => {
    expect(escapeCsvValue('He said "yes"')).toBe('"He said ""yes"""');
  });

  it("quotes a value containing a newline or carriage return", () => {
    expect(escapeCsvValue("line one\nline two")).toBe('"line one\nline two"');
    expect(escapeCsvValue("line one\r\nline two")).toBe('"line one\r\nline two"');
  });

  it("renders each status as the spreadsheet's own token", () => {
    expect(sheetTokenForCell({ status: "done", note: "", doneAt: NOW }, "once", NOW)).toBe("Y");
    expect(sheetTokenForCell({ status: "blocked", note: "", doneAt: null }, "once", NOW)).toBe("N");
    expect(sheetTokenForCell({ status: "na", note: "", doneAt: null }, "once", NOW)).toBe("N/A");
    expect(sheetTokenForCell({ status: "open", note: "", doneAt: null }, "once", NOW)).toBe("");
  });

  it("renders an expired daily completion as blank, matching what the grid shows", () => {
    expect(sheetTokenForCell({ status: "done", note: "", doneAt: YESTERDAY }, "daily", NOW)).toBe("");
    expect(sheetTokenForCell({ status: "done", note: "", doneAt: YESTERDAY }, "once", NOW)).toBe("Y");
  });

  it("appends a note in parentheses, and emits the note alone when there is no token", () => {
    expect(csvCellText({ status: "done", note: "Sharepoint", doneAt: NOW }, "once", NOW)).toBe("Y (Sharepoint)");
    expect(csvCellText({ status: "open", note: "Talk with dean", doneAt: null }, "once", NOW)).toBe("(Talk with dean)");
    expect(csvCellText({ status: "done", note: "", doneAt: NOW }, "once", NOW)).toBe("Y");
    expect(csvCellText({ status: "open", note: "", doneAt: null }, "once", NOW)).toBe("");
  });

  it("writes an identity block then one column per task, in the order given", () => {
    const tasks: TaskDefinition[] = [
      { id: "a", label: "Textbook Owned?", view: "term", group: "dependent", cadence: "once", builtIn: true },
      { id: "b", label: "Labs Added?", view: "term", group: "independent", cadence: "once", builtIn: true },
    ];
    const rows: TaskRow[] = [
      row("1", "Databases", "Midland", "2026 Fall", { a: { status: "done", note: "", doneAt: NOW } }),
      row("2", "Python", "WNCC", "2026 Fall", { b: { status: "na", note: "", doneAt: null } }),
    ];
    const lines = buildTasksCsv(rows, tasks, NOW).split("\n");
    expect(lines[0]).toBe("Course,Institution,Term,Textbook Owned?,Labs Added?");
    expect(lines[1]).toBe("Databases,Midland,2026 Fall,Y,");
    expect(lines[2]).toBe("Python,WNCC,2026 Fall,,N/A");
    expect(lines).toHaveLength(3);
  });

  it("escapes a task label that contains a comma", () => {
    const tasks: TaskDefinition[] = [
      { id: "a", label: "Welcome Note Scheduled in LMS (days, times, location)?", view: "term", group: "dependent", cadence: "once", builtIn: true },
    ];
    expect(buildTasksCsv([], tasks, NOW).split("\n")[0]).toBe(
      'Course,Institution,Term,"Welcome Note Scheduled in LMS (days, times, location)?"'
    );
  });

  it("renders a blank institution or term as an empty field, not the word undefined", () => {
    const tasks: TaskDefinition[] = [
      { id: "a", label: "A", view: "term", group: "dependent", cadence: "once", builtIn: true },
    ];
    expect(buildTasksCsv([row("1", "Solo", undefined, undefined)], tasks, NOW).split("\n")[1]).toBe("Solo,,,");
  });

  it("emits only a header when there are no rows", () => {
    expect(buildTasksCsv([], [], NOW)).toBe("Course,Institution,Term");
  });

  it("states the period it was generated for when a label is supplied", () => {
    const csv = buildTasksCsv([], [], NOW, "Week of 2026-08-02");
    const lines = csv.split("\n");
    expect(lines[0]).toBe("Generated,Week of 2026-08-02");
    expect(lines[1]).toBe("Course,Institution,Term");
  });

  it("escapes commas, quotes and newlines inside CELL values, not just headers", () => {
    // The leaf escaper being correct proves nothing if buildTasksCsv
    // interpolates cell text raw. This is not hypothetical: the real workbook
    // holds "Smith-Curtis 220 (10:20), Acklie Hall of Science 218 (2:20)" in
    // column G, which parseSheetCellValue turns into a note with a comma.
    const tasks: TaskDefinition[] = [
      { id: "a", label: "Room?", view: "term", group: "dependent", cadence: "once", builtIn: true },
    ];
    const rows: TaskRow[] = [
      row("1", "Algebra, College", "NE Wesleyan", "2026 Spring", {
        a: { status: "done", note: "Smith-Curtis 220 (10:20), Acklie 218 (2:20)", doneAt: NOW },
      }),
      row("2", 'He said "hi"', "Metro", "2026 Fall", {
        a: { status: "open", note: 'note with "quotes"', doneAt: null },
      }),
      row("3", "Multi", "Midland", "2026 Fall", {
        a: { status: "open", note: "line one\nline two", doneAt: null },
      }),
    ];
    const csv = buildTasksCsv(rows, tasks, NOW);
    expect(csv).toContain('"Algebra, College"');
    expect(csv).toContain('"Y (Smith-Curtis 220 (10:20), Acklie 218 (2:20))"');
    expect(csv).toContain('"He said ""hi"""');
    expect(csv).toContain('"(note with ""quotes"")"');
    expect(csv).toContain('"(line one\nline two)"');
  });

  it("escapes the generated-at label too", () => {
    expect(buildTasksCsv([], [], NOW, 'Week of "Aug 2", 2026')).toContain('"Week of ""Aug 2"", 2026"');
  });
});

describe("normalizeTaskLabel", () => {
  it("trims a label", () => {
    expect(normalizeTaskLabel("  Textbook Owned?  ")).toBe("Textbook Owned?");
  });

  it("caps a label at 200 characters", () => {
    expect(normalizeTaskLabel("x".repeat(500))).toHaveLength(200);
  });

  it("returns an empty string for a blank, whitespace-only or non-string label", () => {
    for (const raw of ["", "   ", null, undefined, 42, {}]) {
      expect(normalizeTaskLabel(raw)).toBe("");
    }
  });

  it("collapses internal whitespace runs so a label cannot smuggle in layout", () => {
    expect(normalizeTaskLabel("Textbook\n\n   Owned?")).toBe("Textbook Owned?");
  });
});

describe("TASK_STATUS_WORDS", () => {
  // Pins the one vocabulary shared by the accessibility layer (aria-labels,
  // via taskCellAccessibleName below) and the visible UI (tooltips, bulk
  // menus, bulk-action announcements). Components previously kept a SECOND,
  // independent copy of this map with different words ("Open"/"N/A" instead
  // of "Not done"/"Not applicable"), so a screen reader announced one status
  // word while the visible UI showed another - this test is what stops that
  // second copy from ever coming back.
  it("pins the four exact status words", () => {
    expect(TASK_STATUS_WORDS).toEqual({
      done: "Done",
      open: "Not done",
      blocked: "Blocked",
      na: "Not applicable",
    });
  });
});

describe("taskCellAccessibleName", () => {
  // WCAG 1.4.1: status is never colour alone, so every cell needs a name that
  // states the course, the task and the status in words.
  const task: TaskDefinition = {
    id: "a",
    label: "Textbook Owned?",
    view: "term",
    group: "dependent",
    cadence: "once",
    builtIn: true,
  };

  it("names the course, the task and the status", () => {
    expect(taskCellAccessibleName("Databases", task, { status: "done", note: "", doneAt: NOW }, NOW))
      .toBe("Databases, Textbook Owned?: Done");
    expect(taskCellAccessibleName("Databases", task, { status: "open", note: "", doneAt: null }, NOW))
      .toBe("Databases, Textbook Owned?: Not done");
    expect(taskCellAccessibleName("Databases", task, { status: "blocked", note: "", doneAt: null }, NOW))
      .toBe("Databases, Textbook Owned?: Blocked");
    expect(taskCellAccessibleName("Databases", task, { status: "na", note: "", doneAt: null }, NOW))
      .toBe("Databases, Textbook Owned?: Not applicable");
  });

  it("appends the note when there is one", () => {
    expect(taskCellAccessibleName("Databases", task, { status: "done", note: "Sharepoint", doneAt: NOW }, NOW))
      .toBe("Databases, Textbook Owned?: Done, note: Sharepoint");
  });

  it("reports the EFFECTIVE status, so an expired daily completion reads as not done", () => {
    const daily: TaskDefinition = { ...task, id: "d", label: "Inbox cleared?", cadence: "daily", group: "daily", view: "recurring" };
    const yesterdayDone = { status: "done" as const, note: "", doneAt: YESTERDAY };
    expect(taskCellAccessibleName("Databases", daily, yesterdayDone, NOW))
      .toBe("Databases, Inbox cleared?: Not done");
    expect(taskCellAccessibleName("Databases", daily, yesterdayDone, YESTERDAY))
      .toBe("Databases, Inbox cleared?: Done");
  });
});
