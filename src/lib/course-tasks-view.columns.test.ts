// TDD contract for sorting and filtering Tasks rows by ANY column's values -
// docs/tasks-column-sort-filter-acceptance-criteria.md, items 200-217 and
// 236-241. Written from the acceptance criteria BEFORE the implementation
// exists, and split out of course-tasks-view.test.ts (which is at 811 lines
// against the repo's 1000-line cap) the same way weekly-checklist.frequency
// .test.ts is split from weekly-checklist.test.ts.
//
// Asserts observable behavior only: the shape of the persisted/parsed state,
// which rows come back, and in what order. Nothing here pins how the
// comparator, the filter, or the normalizer is structured internally.
import { describe, expect, it } from "vitest";
import type { TaskCellMap, TaskDefinition } from "./course-tasks";
import {
  ALL_FILTER,
  CURRENT_TASK_COLUMN_FILTERS_VERSION,
  DEFAULT_TASK_SORT,
  describeTaskColumnFilters,
  filterTaskRows,
  hasActiveColumnFilter,
  normalizeTaskColumnFilters,
  parseTaskColumnFilters,
  parseTaskSortState,
  resolveTaskSort,
  serializeTaskColumnFilters,
  sortTaskRows,
  taskColumnFiltersKey,
  taskSortFromValueKey,
  taskSortValueKey,
  TASK_STATUS_WORDS,
  type TaskColumnFilters,
  type TaskRow,
} from "./course-tasks-view";
// isColumnFilterActive is not re-exported from "./course-tasks-view" (only
// consumed internally by filterTaskRows there), so this gap-analysis suite
// imports it directly from its actual implementation module rather than
// adding an export the app itself never needed - see G1 in the test notes
// this file was extended from.
import { isColumnFilterActive } from "./course-tasks-view-column-filters";

const NOW = new Date(2026, 7, 5, 14, 0, 0).getTime(); // Wednesday
const YESTERDAY = new Date(2026, 7, 4, 14, 0, 0).getTime();

function row(
  id: string,
  name: string,
  institution: string | null | undefined,
  term: string | null | undefined,
  cells: TaskCellMap = {}
): TaskRow {
  return { course: { id, name, institution, term }, cells };
}

const COL_TASKS: TaskDefinition[] = [
  { id: "a", label: "Textbook ordered?", view: "term", group: "dependent", cadence: "once", builtIn: true },
  { id: "b", label: "Syllabus uploaded?", view: "term", group: "independent", cadence: "once", builtIn: true },
];

/** One row per status, plus a row with NO stored cell at all (which must
 * behave exactly like `open` - item 212). Course names are deliberately
 * unrelated to the intended status order, so a comparator that quietly falls
 * back to sorting by name cannot pass these. */
const STATUS_ROWS: TaskRow[] = [
  row("r-blocked", "Zeta", "Metro", "2026 Fall", { a: { status: "blocked", note: "", doneAt: null } }),
  row("r-open", "Omega", "Metro", "2026 Fall", { a: { status: "open", note: "", doneAt: null } }),
  row("r-unstored", "Upsilon", "Metro", "2026 Fall", {}),
  row("r-done", "Delta", "Metro", "2026 Fall", { a: { status: "done", note: "", doneAt: NOW } }),
  row("r-na", "Alpha", "Metro", "2026 Fall", { a: { status: "na", note: "", doneAt: null } }),
];

/** STATUS_ROWS in course-name-ascending order, frozen as a LITERAL rather than
 * computed by calling the function under test with DEFAULT_TASK_SORT. A
 * self-referential oracle moves with the bug: if the default sort breaks, both
 * sides of the comparison break together and the fallback test stays green.
 * Alpha, Delta, Omega, Upsilon, Zeta. */
const BY_NAME_ASC = ["r-na", "r-done", "r-open", "r-unstored", "r-blocked"];

const NO_FILTERS = { search: "", institution: ALL_FILTER, term: ALL_FILTER, outstandingOnly: false };

describe("sorting by a task column", () => {
  it("sorts a task column ascending: blocked, not done, done - with not-applicable LAST", () => {
    const sorted = sortTaskRows(STATUS_ROWS, COL_TASKS, { field: "task", taskId: "a", direction: "asc" }, NOW);
    expect(sorted.map((r) => r.course.id)).toEqual(["r-blocked", "r-open", "r-unstored", "r-done", "r-na"]);
  });

  it("sorts a task column descending: done, not done, blocked - with not-applicable STILL last", () => {
    const sorted = sortTaskRows(STATUS_ROWS, COL_TASKS, { field: "task", taskId: "a", direction: "desc" }, NOW);
    // "r-open" before "r-unstored" even here: the name tie-break is ascending
    // regardless of direction (Omega < Upsilon), exactly as REGRESSION #232
    // check 12 requires for every other field.
    expect(sorted.map((r) => r.course.id)).toEqual(["r-done", "r-open", "r-unstored", "r-blocked", "r-na"]);
  });

  it("sorts on the EFFECTIVE status, so an expired daily completion sorts as not done", () => {
    const daily: TaskDefinition[] = [
      { id: "a", label: "Inbox cleared?", view: "recurring", group: "daily", cadence: "daily", builtIn: true },
    ];
    const rows: TaskRow[] = [
      row("expired", "Expired", "Metro", "2026 Fall", { a: { status: "done", note: "", doneAt: YESTERDAY } }),
      row("fresh", "Fresh", "Metro", "2026 Fall", { a: { status: "done", note: "", doneAt: NOW } }),
      row("blocked", "Blocked", "Metro", "2026 Fall", { a: { status: "blocked", note: "", doneAt: null } }),
    ];
    // Yesterday's tick does not count today: "expired" belongs in the not-done
    // band, between blocked and the genuinely-done row.
    expect(sortTaskRows(rows, daily, { field: "task", taskId: "a", direction: "asc" }, NOW).map((r) => r.course.id))
      .toEqual(["blocked", "expired", "fresh"]);
    // ...and evaluated INSIDE yesterday, the two swap bands: "expired" is that
    // day's completion and "fresh" (stamped today) has not happened yet.
    expect(sortTaskRows(rows, daily, { field: "task", taskId: "a", direction: "asc" }, YESTERDAY).map((r) => r.course.id))
      .toEqual(["blocked", "fresh", "expired"]);
  });

  it("sorts different columns independently", () => {
    const rows: TaskRow[] = [
      row("1", "One", "Metro", "2026 Fall", {
        a: { status: "done", note: "", doneAt: NOW },
        b: { status: "blocked", note: "", doneAt: null },
      }),
      row("2", "Two", "Metro", "2026 Fall", {
        a: { status: "blocked", note: "", doneAt: null },
        b: { status: "done", note: "", doneAt: NOW },
      }),
    ];
    expect(sortTaskRows(rows, COL_TASKS, { field: "task", taskId: "a", direction: "asc" }, NOW).map((r) => r.course.id))
      .toEqual(["2", "1"]);
    expect(sortTaskRows(rows, COL_TASKS, { field: "task", taskId: "b", direction: "asc" }, NOW).map((r) => r.course.id))
      .toEqual(["1", "2"]);
  });

  it("is a TOTAL order within one status - identical status resolves by name then course id", () => {
    const same = { status: "open" as const, note: "", doneAt: null };
    const rows: TaskRow[] = [
      row("z", "Course 1", "Metro", "2026 Fall", { a: same }),
      row("m", "Course 1", "Metro", "2026 Fall", { a: same }),
      row("a", "Course 1", "Metro", "2026 Fall", { a: same }),
    ];
    const asc = sortTaskRows(rows, COL_TASKS, { field: "task", taskId: "a", direction: "asc" }, NOW).map((r) => r.course.id);
    const desc = sortTaskRows(rows, COL_TASKS, { field: "task", taskId: "a", direction: "desc" }, NOW).map((r) => r.course.id);
    expect(asc).toEqual(["a", "m", "z"]);
    // Tie-breaks stay ASCENDING even when the column is pointed the other way.
    expect(desc).toEqual(["a", "m", "z"]);
    // ...and the answer does not depend on the order the rows arrived in.
    expect(sortTaskRows([...rows].reverse(), COL_TASKS, { field: "task", taskId: "a", direction: "asc" }, NOW).map((r) => r.course.id))
      .toEqual(["a", "m", "z"]);
  });

  it("is a TOTAL order among NOT-APPLICABLE rows too, not merely 'they end up last'", () => {
    // The sorts-last branch is the easy place to lose totality: an
    // implementation that returns a fixed 1/-1 whenever either side is
    // not-applicable never reaches the name/id tie-break, so two n/a rows come
    // back in whatever order they arrived in. That is exactly what REGRESSION
    // #232 check 12 forbids, and no single-n/a fixture can detect it.
    const na = { status: "na" as const, note: "", doneAt: null };
    const rows: TaskRow[] = [
      row("z-id", "Yankee", "Metro", "2026 Fall", { a: na }),
      row("a-id", "Yankee", "Metro", "2026 Fall", { a: na }),
      row("m-id", "Xray", "Metro", "2026 Fall", { a: na }),
      row("done", "Alpha", "Metro", "2026 Fall", { a: { status: "done", note: "", doneAt: NOW } }),
    ];
    // Xray before Yankee (name asc), then a-id before z-id (id asc) - in BOTH
    // directions, and whatever order the rows arrive in.
    const expected = ["done", "m-id", "a-id", "z-id"];
    expect(sortTaskRows(rows, COL_TASKS, { field: "task", taskId: "a", direction: "asc" }, NOW).map((r) => r.course.id))
      .toEqual(expected);
    expect(sortTaskRows(rows, COL_TASKS, { field: "task", taskId: "a", direction: "desc" }, NOW).map((r) => r.course.id))
      .toEqual(expected);
    expect(sortTaskRows([...rows].reverse(), COL_TASKS, { field: "task", taskId: "a", direction: "asc" }, NOW).map((r) => r.course.id))
      .toEqual(expected);
  });

  it("falls back to the default sort when the column is not in the visible task list", () => {
    // A hidden column, a retired task, or a deleted custom task must not
    // produce an arbitrary order - the rows come back in course-name order.
    expect(sortTaskRows(STATUS_ROWS, COL_TASKS, { field: "task", taskId: "gone", direction: "asc" }, NOW).map((r) => r.course.id))
      .toEqual(BY_NAME_ASC);
    expect(sortTaskRows(STATUS_ROWS, COL_TASKS, { field: "task", direction: "desc" }, NOW).map((r) => r.course.id))
      .toEqual(BY_NAME_ASC);
    expect(sortTaskRows(STATUS_ROWS, [], { field: "task", taskId: "a", direction: "asc" }, NOW).map((r) => r.course.id))
      .toEqual(BY_NAME_ASC);
    // Guard on the oracle itself: the default sort really does produce this.
    expect(sortTaskRows(STATUS_ROWS, COL_TASKS, DEFAULT_TASK_SORT, NOW).map((r) => r.course.id)).toEqual(BY_NAME_ASC);
  });

  it("does not mutate the rows it is given", () => {
    const input = [...STATUS_ROWS];
    sortTaskRows(input, COL_TASKS, { field: "task", taskId: "a", direction: "desc" }, NOW);
    expect(input.map((r) => r.course.id)).toEqual(STATUS_ROWS.map((r) => r.course.id));
  });

  it("keeps every pre-existing sort field working unchanged", () => {
    expect(sortTaskRows(STATUS_ROWS, COL_TASKS, { field: "name", direction: "asc" }, NOW).map((r) => r.course.name))
      .toEqual(["Alpha", "Delta", "Omega", "Upsilon", "Zeta"]);
  });
});

describe("resolveTaskSort", () => {
  it("returns the sort unchanged when its column is visible", () => {
    const sort = { field: "task" as const, taskId: "a", direction: "desc" as const };
    expect(resolveTaskSort(sort, COL_TASKS)).toEqual(sort);
  });

  it("returns the DEFAULT sort when the column is missing, blank or unknown", () => {
    expect(resolveTaskSort({ field: "task", taskId: "gone", direction: "asc" }, COL_TASKS)).toEqual(DEFAULT_TASK_SORT);
    expect(resolveTaskSort({ field: "task", taskId: "", direction: "asc" }, COL_TASKS)).toEqual(DEFAULT_TASK_SORT);
    expect(resolveTaskSort({ field: "task", direction: "asc" }, COL_TASKS)).toEqual(DEFAULT_TASK_SORT);
    expect(resolveTaskSort({ field: "task", taskId: "a", direction: "asc" }, [])).toEqual(DEFAULT_TASK_SORT);
  });

  it("leaves the four non-column fields alone, visible columns or not", () => {
    // toEqual, not toMatchObject: a resolver that materializes `taskId: null`
    // on a non-task sort would round-trip that null into localStorage and make
    // every equality check on a sort state order-of-operations dependent. The
    // key is OMITTED, never nulled (item 200).
    expect(resolveTaskSort({ field: "progress", direction: "desc" }, [])).toEqual({ field: "progress", direction: "desc" });
    expect(resolveTaskSort({ field: "institution", direction: "asc" }, COL_TASKS)).toEqual({ field: "institution", direction: "asc" });
  });
});

describe("persisted sort state with a column sort", () => {
  it("accepts a task-column sort and rejects one with no usable task id", () => {
    // Acceptance and rejection live in ONE test on purpose: asserted
    // separately, the rejection half is satisfied by "reject every task sort",
    // which is what the code does TODAY (TASK_SORT_FIELDS has no "task"
    // entry) and is exactly the implementation item 206 forbids.
    expect(parseTaskSortState(JSON.stringify({ field: "task", taskId: "a", direction: "desc" })))
      .toEqual({ field: "task", taskId: "a", direction: "desc" });
    for (const bad of [
      { field: "task", direction: "asc" },
      { field: "task", taskId: "", direction: "asc" },
      { field: "task", taskId: "   ", direction: "asc" },
      { field: "task", taskId: 7, direction: "asc" },
    ]) {
      expect(parseTaskSortState(JSON.stringify(bad))).toEqual(DEFAULT_TASK_SORT);
    }
  });

  it("drops a stale task id left on a non-task field", () => {
    // This value really does occur: switching the Sort control away from a
    // column with a `{...sort, field}` spread carries the old taskId into
    // localStorage. Reading it back must not resurrect half a column sort.
    expect(parseTaskSortState(JSON.stringify({ field: "name", taskId: "a", direction: "asc" })))
      .toEqual({ field: "name", direction: "asc" });
  });

  it("still parses the four original fields, and still falls back on garbage", () => {
    expect(parseTaskSortState(JSON.stringify({ field: "progress", direction: "desc" })))
      .toEqual({ field: "progress", direction: "desc" });
    expect(parseTaskSortState("{not json")).toEqual(DEFAULT_TASK_SORT);
    expect(parseTaskSortState(null)).toEqual(DEFAULT_TASK_SORT);
    expect(parseTaskSortState(JSON.stringify({ field: "nope", direction: "asc" }))).toEqual(DEFAULT_TASK_SORT);
  });
});

describe("the Sort control's option keys", () => {
  it("round-trips every field through an opaque option value", () => {
    expect(taskSortValueKey({ field: "name", direction: "asc" })).toBe("name");
    expect(taskSortValueKey({ field: "progress", direction: "desc" })).toBe("progress");
    expect(taskSortValueKey({ field: "task", taskId: "a", direction: "asc" })).toBe("task:a");
    expect(taskSortFromValueKey("name")).toEqual({ field: "name" });
    expect(taskSortFromValueKey("task:a")).toEqual({ field: "task", taskId: "a" });
  });

  it("never carries a task id onto a non-task field", () => {
    // The stale-taskId bug at its source: a `<select>` carries one string, so
    // the decoder - not the caller's spread - is what must clear it.
    expect(taskSortFromValueKey("institution")).toEqual({ field: "institution" });
    expect(taskSortFromValueKey("institution")).not.toHaveProperty("taskId");
  });

  it("falls back to the default field on an unknown or malformed key", () => {
    expect(taskSortFromValueKey("nope")).toEqual({ field: DEFAULT_TASK_SORT.field });
    expect(taskSortFromValueKey("task:")).toEqual({ field: DEFAULT_TASK_SORT.field });
    expect(taskSortFromValueKey("")).toEqual({ field: DEFAULT_TASK_SORT.field });
  });
});

describe("filtering by a task column's values", () => {
  it("keeps only the rows whose column has one of the selected statuses", () => {
    const out = filterTaskRows(STATUS_ROWS, COL_TASKS, { ...NO_FILTERS, columns: { a: ["blocked"] } }, NOW);
    expect(out.map((r) => r.course.id)).toEqual(["r-blocked"]);
  });

  it("ORs the statuses within one column", () => {
    const out = filterTaskRows(STATUS_ROWS, COL_TASKS, { ...NO_FILTERS, columns: { a: ["blocked", "na"] } }, NOW);
    expect(out.map((r) => r.course.id)).toEqual(["r-blocked", "r-na"]);
  });

  it("treats a row with no stored cell as not-done", () => {
    const out = filterTaskRows(STATUS_ROWS, COL_TASKS, { ...NO_FILTERS, columns: { a: ["open"] } }, NOW);
    expect(out.map((r) => r.course.id)).toEqual(["r-open", "r-unstored"]);
  });

  it("ANDs separate columns together", () => {
    const rows: TaskRow[] = [
      row("both", "Both", "Metro", "2026 Fall", {
        a: { status: "blocked", note: "", doneAt: null },
        b: { status: "done", note: "", doneAt: NOW },
      }),
      row("first", "First", "Metro", "2026 Fall", {
        a: { status: "blocked", note: "", doneAt: null },
        b: { status: "open", note: "", doneAt: null },
      }),
      row("second", "Second", "Metro", "2026 Fall", {
        a: { status: "open", note: "", doneAt: null },
        b: { status: "done", note: "", doneAt: NOW },
      }),
    ];
    const out = filterTaskRows(rows, COL_TASKS, { ...NO_FILTERS, columns: { a: ["blocked"], b: ["done"] } }, NOW);
    expect(out.map((r) => r.course.id)).toEqual(["both"]);
  });

  it("matches the EFFECTIVE status, so an expired daily completion filters as not done", () => {
    const daily: TaskDefinition[] = [
      { id: "a", label: "Inbox cleared?", view: "recurring", group: "daily", cadence: "daily", builtIn: true },
    ];
    const rows: TaskRow[] = [
      row("expired", "Expired", "Metro", "2026 Fall", { a: { status: "done", note: "", doneAt: YESTERDAY } }),
      row("fresh", "Fresh", "Metro", "2026 Fall", { a: { status: "done", note: "", doneAt: NOW } }),
    ];
    expect(filterTaskRows(rows, daily, { ...NO_FILTERS, columns: { a: ["done"] } }, NOW).map((r) => r.course.id))
      .toEqual(["fresh"]);
    expect(filterTaskRows(rows, daily, { ...NO_FILTERS, columns: { a: ["open"] } }, NOW).map((r) => r.course.id))
      .toEqual(["expired"]);
  });

  it("treats an empty selection as NO constraint rather than emptying the table", () => {
    expect(filterTaskRows(STATUS_ROWS, COL_TASKS, { ...NO_FILTERS, columns: { a: [] } }, NOW)).toHaveLength(5);
    // ...while the same column WITH a selection really does constrain, so this
    // cannot be satisfied by ignoring column filters altogether.
    expect(filterTaskRows(STATUS_ROWS, COL_TASKS, { ...NO_FILTERS, columns: { a: ["blocked"] } }, NOW)).toHaveLength(1);
  });

  it("treats a selection of every status as NO constraint", () => {
    const all: TaskColumnFilters = { a: ["open", "done", "blocked", "na"] };
    expect(filterTaskRows(STATUS_ROWS, COL_TASKS, { ...NO_FILTERS, columns: all }, NOW)).toHaveLength(5);
    const allButOne: TaskColumnFilters = { a: ["open", "done", "blocked"] };
    expect(filterTaskRows(STATUS_ROWS, COL_TASKS, { ...NO_FILTERS, columns: allButOne }, NOW)).toHaveLength(4);
  });

  it("IGNORES a filter on a column that is not visible", () => {
    // Same rule as amendment 133's search scoping: a constraint the instructor
    // cannot see must never silently remove rows. Here "b" is filtered while
    // only "a" is visible.
    const visibleA = [COL_TASKS[0]];
    expect(filterTaskRows(STATUS_ROWS, visibleA, { ...NO_FILTERS, columns: { b: ["done"] } }, NOW)).toHaveLength(5);
    // The identical filter on the VISIBLE column does remove rows - so this
    // cannot pass by ignoring column filters altogether.
    expect(filterTaskRows(STATUS_ROWS, visibleA, { ...NO_FILTERS, columns: { a: ["done"] } }, NOW)).toHaveLength(1);
  });

  it("combines column filters conjunctively with search, institution, term and outstanding-only", () => {
    // Every conjunct is load-bearing here: each row below is excluded by
    // exactly ONE of them, so dropping any single conjunct changes the result.
    const openB = { status: "open" as const, note: "", doneAt: null };
    const doneA = { status: "done" as const, note: "", doneAt: NOW };
    const rows: TaskRow[] = [
      row("keep", "Databases", "Midland", "2026 Fall", { a: doneA, b: openB }),
      row("wrong-status", "Data Structures", "Midland", "2026 Fall", { a: { status: "blocked", note: "", doneAt: null }, b: openB }),
      row("wrong-inst", "Data Mining", "Metro", "2026 Fall", { a: doneA, b: openB }),
      row("wrong-term", "Data Ethics", "Midland", "2025 Winter", { a: doneA, b: openB }),
      row("wrong-search", "Statistics", "Midland", "2026 Fall", { a: doneA, b: openB }),
      // Passes search, institution, term AND the column filter; only
      // outstanding-only removes it (nothing is open or blocked on it).
      row("nothing-outstanding", "Data Ops", "Midland", "2026 Fall", { a: doneA, b: { status: "na", note: "", doneAt: null } }),
    ];
    const filters = {
      search: "data",
      institution: "Midland",
      term: "2026 Fall",
      outstandingOnly: true,
      columns: { a: ["done" as const] },
    };
    expect(filterTaskRows(rows, COL_TASKS, filters, NOW).map((r) => r.course.id)).toEqual(["keep"]);
    // Sanity on the fixture itself: relaxing outstanding-only lets exactly the
    // one row back in, proving that conjunct was doing work above.
    expect(filterTaskRows(rows, COL_TASKS, { ...filters, outstandingOnly: false }, NOW).map((r) => r.course.id))
      .toEqual(["keep", "nothing-outstanding"]);
  });

  it("behaves exactly as before when no column filters are supplied at all", () => {
    expect(filterTaskRows(STATUS_ROWS, COL_TASKS, NO_FILTERS, NOW)).toHaveLength(5);
    expect(filterTaskRows(STATUS_ROWS, COL_TASKS, { ...NO_FILTERS, columns: {} }, NOW)).toHaveLength(5);
    // ...and a supplied filter is not ignored, so "unchanged" cannot be won by
    // never reading `columns` at all.
    expect(filterTaskRows(STATUS_ROWS, COL_TASKS, { ...NO_FILTERS, columns: { a: ["done"] } }, NOW)).toHaveLength(1);
  });

  it("does not mutate the rows or the filter object it is given", () => {
    const rows = [...STATUS_ROWS];
    const filters = { ...NO_FILTERS, columns: { a: ["blocked" as const] } };
    // The filter must actually have done something, or "nothing was mutated"
    // is trivially true.
    expect(filterTaskRows(rows, COL_TASKS, filters, NOW)).toHaveLength(1);
    // Length alone cannot see an in-place reorder - filterTaskRows returns a
    // NEW array, so its length could only change by an explicit splice.
    expect(rows.map((r) => r.course.id)).toEqual(STATUS_ROWS.map((r) => r.course.id));
    expect(filters.columns).toEqual({ a: ["blocked"] });
  });
});

describe("column filter normalization", () => {
  it("drops an empty selection, a complete selection, and unknown status tokens", () => {
    expect(
      normalizeTaskColumnFilters({
        empty: [],
        complete: ["open", "done", "blocked", "na"],
        garbage: ["nope", 7, null],
        real: ["blocked", "nope"],
      })
    ).toEqual({ real: ["blocked"] });
  });

  it("de-duplicates and orders each selection by the canonical status order", () => {
    expect(normalizeTaskColumnFilters({ a: ["blocked", "open", "blocked"] })).toEqual({ a: ["open", "blocked"] });
  });

  it("never throws on garbage, and returns an empty map for it", () => {
    expect(normalizeTaskColumnFilters(null)).toEqual({});
    expect(normalizeTaskColumnFilters(undefined)).toEqual({});
    expect(normalizeTaskColumnFilters("nope")).toEqual({});
    expect(normalizeTaskColumnFilters(["a", "b"])).toEqual({});
    expect(normalizeTaskColumnFilters({ a: "blocked" })).toEqual({});
    expect(normalizeTaskColumnFilters({ "  ": ["blocked"] })).toEqual({});
  });

  it("does not mutate its input", () => {
    // Deliberately OUT of canonical order: an implementation that canonicalizes
    // with an in-place arr.sort() is invisible against an already-sorted or
    // single-element fixture.
    const input = { a: ["blocked", "open"], b: [] as string[] };
    normalizeTaskColumnFilters(input);
    expect(input.a).toEqual(["blocked", "open"]);
    expect(input.b).toEqual([]);
  });

  it("answers whether one column is actively filtered", () => {
    expect(hasActiveColumnFilter({ a: ["blocked"] }, "a")).toBe(true);
    expect(hasActiveColumnFilter({ a: ["blocked"] }, "b")).toBe(false);
    expect(hasActiveColumnFilter({ a: [] }, "a")).toBe(false);
    // Re-applies the completeness rule rather than assuming a normalized map -
    // the header indicator must not light up for a filter that constrains
    // nothing, whatever state it is handed.
    expect(hasActiveColumnFilter({ a: ["open", "done", "blocked", "na"] }, "a")).toBe(false);
    expect(hasActiveColumnFilter({}, "a")).toBe(false);
  });
});

describe("persisted column filters", () => {
  it("writes the documented envelope, not merely a versioned blob", () => {
    expect(JSON.parse(serializeTaskColumnFilters({ a: ["blocked"] }))).toEqual({
      v: CURRENT_TASK_COLUMN_FILTERS_VERSION,
      filters: { a: ["blocked"] },
    });
  });

  it("round-trips through serialize/parse", () => {
    expect(parseTaskColumnFilters(serializeTaskColumnFilters({ a: ["blocked", "open"] }))).toEqual({ a: ["open", "blocked"] });
  });

  it("parses a hand-written current-version payload, not just its own output", () => {
    expect(parseTaskColumnFilters(JSON.stringify({ v: CURRENT_TASK_COLUMN_FILTERS_VERSION, filters: { a: ["blocked"] } })))
      .toEqual({ a: ["blocked"] });
  });

  it("normalizes on write, so a complete or empty selection is never persisted", () => {
    const raw = serializeTaskColumnFilters({ a: ["open", "done", "blocked", "na"], b: [], c: ["na"] });
    expect(parseTaskColumnFilters(raw)).toEqual({ c: ["na"] });
  });

  it("falls back to no filters on anything malformed rather than throwing", () => {
    expect(parseTaskColumnFilters(null)).toEqual({});
    expect(parseTaskColumnFilters(undefined)).toEqual({});
    expect(parseTaskColumnFilters("")).toEqual({});
    expect(parseTaskColumnFilters("{not json")).toEqual({});
    expect(parseTaskColumnFilters(JSON.stringify(["a"]))).toEqual({});
    expect(parseTaskColumnFilters(JSON.stringify({ v: 1 }))).toEqual({});
    expect(parseTaskColumnFilters(JSON.stringify({ v: 1, filters: { a: ["bogus"] } }))).toEqual({});
  });

  it("keeps the two sub-views on separate storage keys", () => {
    // REGRESSION #232 check 25's contract, which is otherwise enforced only by
    // a template literal inside a function the implementation plan MOVES to a
    // new module - exactly the refactor that would silently merge them.
    expect(taskColumnFiltersKey("term")).toBe("ta-tasks-term-colfilters");
    expect(taskColumnFiltersKey("recurring")).toBe("ta-tasks-recurring-colfilters");
    expect(taskColumnFiltersKey("term")).not.toBe(taskColumnFiltersKey("recurring"));
  });
});

describe("describing active column filters", () => {
  it("names each filtered column and its statuses, in the visible column order", () => {
    const described = describeTaskColumnFilters({ b: ["done"], a: ["blocked", "open"] }, COL_TASKS);
    // Visible-column order, NOT the order the filters happen to be keyed in.
    expect(described.map((d) => d.taskId)).toEqual(["a", "b"]);
    // toMatchObject, not toEqual: the AC fixes these three fields and leaves
    // the implementer free to carry more (a glyph, a count) for the chips.
    expect(described[0]).toMatchObject({ taskId: "a", label: "Textbook ordered?", statusWords: "Not done, Blocked" });
    expect(described[0].statuses).toEqual(["open", "blocked"]);
    expect(described[1].statusWords).toBe("Done");
  });

  it("omits a filter whose column is not visible, and an inactive one", () => {
    expect(describeTaskColumnFilters({ gone: ["done"] }, COL_TASKS)).toEqual([]);
    expect(describeTaskColumnFilters({ a: [] }, COL_TASKS)).toEqual([]);
    expect(describeTaskColumnFilters({ a: ["open", "done", "blocked", "na"] }, COL_TASKS)).toEqual([]);
    expect(describeTaskColumnFilters({}, COL_TASKS)).toEqual([]);
  });

  it("uses the shared status vocabulary, never a second word map", () => {
    const described = describeTaskColumnFilters({ a: ["na"] }, COL_TASKS);
    expect(described[0].statusWords).toBe(TASK_STATUS_WORDS.na);
  });
});

// ---------------------------------------------------------------------------
// GAP-ANALYSIS ADDITIONS below this line. The implementation code and its
// comments were written by a rival company's AI model - every assertion here
// is checked against actual runtime behavior (including a live JSON.parse
// probe for the prototype-pollution case), never against what a comment
// nearby claims.

describe("normalizeTaskColumnFilters - prototype pollution defense (G0)", () => {
  it("does not let an own __proto__ key in the payload reassign the returned object's prototype", () => {
    // JSON.parse really does create an own "__proto__" property on its result
    // (verified via a live probe, not assumed) - the hazard is what
    // normalizeTaskColumnFilters does with it AFTERWARD: assigning
    // `out[key] = ordered` for that key, on an object with the ordinary
    // inherited __proto__ SETTER, reassigns the object's own prototype
    // instead of creating a normal "__proto__" key.
    const raw = JSON.parse('{"__proto__":["blocked"],"real":["blocked"]}') as unknown;
    const out = normalizeTaskColumnFilters(raw);
    const unsafeOut = out as unknown as Record<string, unknown>;

    // Assert on the RETURNED object, never on global Object.prototype -
    // REGRESSION #232 check 9's own assertion style stays green against the
    // broken build and proves nothing. A fixed, null-prototype accumulator
    // is free to hold an own key literally named "__proto__" (it is inert
    // there, just like coerceTaskCellMap's own null-prototype map would be) -
    // what must NOT happen is `out`'s own [[Prototype]] changing.
    expect(Object.getPrototypeOf(out)).toBe(null);

    // The well-formed sibling key in the same payload still survives.
    expect(out.real).toEqual(["blocked"]);

    // Unrelated lookups on the result must read as ABSENT. Against the
    // un-fixed build (a bare `{}` literal accumulator) `out.length` reads `1`,
    // borrowed from the `["blocked"]` array that silently became the
    // prototype - that is exactly the failure this pins.
    expect(unsafeOut.status).toBeUndefined();
    expect(unsafeOut.length).toBeUndefined();
  });
});

describe("isColumnFilterActive (G1)", () => {
  it("treats an absent or empty selection as no constraint", () => {
    expect(isColumnFilterActive(undefined)).toBe(false);
    expect(isColumnFilterActive([])).toBe(false);
  });

  it("treats any partial selection (one, two, or three of the four statuses) as active", () => {
    expect(isColumnFilterActive(["open"])).toBe(true);
    expect(isColumnFilterActive(["open", "done"])).toBe(true);
    expect(isColumnFilterActive(["open", "done", "blocked"])).toBe(true);
  });

  it("treats all four statuses selected as no constraint", () => {
    expect(isColumnFilterActive(["open", "done", "blocked", "na"])).toBe(false);
  });

  it("counts DISTINCT statuses, not entry count - duplicates cannot fake completeness", () => {
    // Four entries but only ONE distinct status. A length-based
    // implementation (statuses.length >= TASK_STATUSES.length) would read
    // this as complete/no-constraint, which is wrong: the real rule
    // (new Set(statuses).size < TASK_STATUSES.length) says this is still an
    // active filter. This is the case that distinguishes the real rule from
    // a plausible wrong one.
    expect(isColumnFilterActive(["open", "open", "open", "open"])).toBe(true);
  });

  it("counts distinct statuses correctly when duplicates are mixed with distinct entries", () => {
    // Four entries, three distinct statuses - still active (still short of
    // all four DISTINCT statuses).
    expect(isColumnFilterActive(["open", "done", "blocked", "open"])).toBe(true);
  });
});

describe("parseTaskColumnFilters version handling (G2)", () => {
  it("rejects a filters payload stamped at a version other than current", () => {
    expect(parseTaskColumnFilters(JSON.stringify({ v: 2, filters: { a: ["blocked"] } }))).toEqual({});
    expect(parseTaskColumnFilters(JSON.stringify({ v: 0, filters: { a: ["blocked"] } }))).toEqual({});
  });

  it("rejects a non-numeric version and a payload with no version at all", () => {
    expect(parseTaskColumnFilters(JSON.stringify({ v: "1", filters: { a: ["blocked"] } }))).toEqual({});
    expect(parseTaskColumnFilters(JSON.stringify({ filters: { a: ["blocked"] } }))).toEqual({});
  });

  it("never throws on a future-version payload, and falls back to no filters", () => {
    expect(() => parseTaskColumnFilters(JSON.stringify({ v: 99, filters: { a: ["blocked"] } }))).not.toThrow();
    expect(parseTaskColumnFilters(JSON.stringify({ v: 99, filters: { a: ["blocked"] } }))).toEqual({});
  });
});

describe("taskSortValueKey / taskSortFromValueKey degenerate states (G3)", () => {
  it("encodes a task sort with no taskId as 'task:', and decodes that back to the default field", () => {
    // Pin the ENCODER and DECODER together: the degenerate state must
    // round-trip to something safe (the default sort) rather than to a sort
    // that can never be applied (field: "task" with no usable taskId).
    const key = taskSortValueKey({ field: "task", direction: "asc" });
    expect(key).toBe("task:");
    expect(taskSortFromValueKey(key)).toEqual({ field: DEFAULT_TASK_SORT.field });
  });

  it("splits on the FIRST colon only, so a taskId containing a colon survives intact", () => {
    expect(taskSortFromValueKey("task:a:b")).toEqual({ field: "task", taskId: "a:b" });
  });

  it("does not treat a bare 'task' (no colon) as a task sort", () => {
    // "task" is deliberately excluded from the plain-key list
    // (PLAIN_SORT_FIELD_KEYS in course-tasks-view.ts) - it must fall through
    // to the default field, not produce `{field: "task"}` with no taskId.
    expect(taskSortFromValueKey("task")).toEqual({ field: DEFAULT_TASK_SORT.field });
    expect(taskSortFromValueKey("task")).not.toHaveProperty("taskId");
  });
});

describe("sorting edges the contract tests do not reach (G4)", () => {
  it("sorts a column where EVERY row is not-applicable as pure name-then-id order", () => {
    // Distinct from the existing 'TOTAL order among NOT-APPLICABLE rows'
    // test, which always mixes in one non-na row. Here every value is
    // `empty`, so the primary comparison is 0 for EVERY pair, not merely
    // among a subset - the degenerate case of REGRESSION #232 check 12's
    // totality rule.
    const na = { status: "na" as const, note: "", doneAt: null };
    const rows: TaskRow[] = [
      row("z-id", "Bravo", "Metro", "2026 Fall", { a: na }),
      row("a-id", "Bravo", "Metro", "2026 Fall", { a: na }),
      row("m-id", "Alpha", "Metro", "2026 Fall", { a: na }),
    ];
    const expected = ["m-id", "a-id", "z-id"]; // Alpha before Bravo, then id asc.
    expect(sortTaskRows(rows, COL_TASKS, { field: "task", taskId: "a", direction: "asc" }, NOW).map((r) => r.course.id))
      .toEqual(expected);
    expect(sortTaskRows(rows, COL_TASKS, { field: "task", taskId: "a", direction: "desc" }, NOW).map((r) => r.course.id))
      .toEqual(expected);
    expect(sortTaskRows([...rows].reverse(), COL_TASKS, { field: "task", taskId: "a", direction: "asc" }, NOW).map((r) => r.course.id))
      .toEqual(expected);
  });

  it("sorts a row with NO stored cell as if it read 'open' - absence-is-open reaches the SORT path too", () => {
    // A fixture that can actually tell "absence reads as open" apart from a
    // plausible wrong answer (e.g. "absence reads as not-applicable"): if
    // absence were empty/na instead of open, "no-cell-id" would sort LAST
    // (after "open-id"), not tie with it right after "blocked-id". A fixture
    // of all-absent rows alone cannot distinguish those two outcomes, because
    // both funnel into the same name/id tie-break.
    const rows: TaskRow[] = [
      row("blocked-id", "Alpha", "Metro", "2026 Fall", { a: { status: "blocked", note: "", doneAt: null } }),
      row("no-cell-id", "Bravo", "Metro", "2026 Fall", {}), // no "a" entry at all
      row("open-id", "Charlie", "Metro", "2026 Fall", { a: { status: "open", note: "", doneAt: null } }),
    ];
    const expected = ["blocked-id", "no-cell-id", "open-id"];
    expect(sortTaskRows(rows, COL_TASKS, { field: "task", taskId: "a", direction: "asc" }, NOW).map((r) => r.course.id))
      .toEqual(expected);
  });

  it("composes with a filter on a DIFFERENT column - the sort applies only to what survives the filter", () => {
    const rows: TaskRow[] = [
      row("keep-1", "Zulu", "Metro", "2026 Fall", {
        a: { status: "open", note: "", doneAt: null },
        b: { status: "done", note: "", doneAt: NOW },
      }),
      row("keep-2", "Alpha", "Metro", "2026 Fall", {
        a: { status: "blocked", note: "", doneAt: null },
        b: { status: "done", note: "", doneAt: NOW },
      }),
      row("dropped", "Mike", "Metro", "2026 Fall", {
        a: { status: "blocked", note: "", doneAt: null },
        b: { status: "open", note: "", doneAt: null },
      }),
    ];
    const filtered = filterTaskRows(rows, COL_TASKS, { ...NO_FILTERS, columns: { b: ["done"] } }, NOW);
    // "dropped" never reaches the sort step at all.
    expect(filtered.map((r) => r.course.id).sort()).toEqual(["keep-1", "keep-2"]);

    const sorted = sortTaskRows(filtered, COL_TASKS, { field: "task", taskId: "a", direction: "asc" }, NOW);
    // Sorted by column "a" ascending among the SURVIVORS only: blocked before
    // open. If the filter step were skipped, "dropped" (also blocked on "a")
    // would appear here too.
    expect(sorted.map((r) => r.course.id)).toEqual(["keep-2", "keep-1"]);
  });
});

const THREE_COL_TASKS: TaskDefinition[] = [
  { id: "x", label: "First?", view: "term", group: "dependent", cadence: "once", builtIn: true },
  { id: "y", label: "Second?", view: "term", group: "dependent", cadence: "once", builtIn: true },
  { id: "z", label: "Third?", view: "term", group: "dependent", cadence: "once", builtIn: true },
];

describe("describeTaskColumnFilters on unnormalized input (G5)", () => {
  it("de-duplicates statuses in an UNNORMALIZED input, so statusWords lists each word once", () => {
    // TasksTab normalizes before persisting, but describeTaskColumnFilters is
    // also called with raw in-memory state, which may not be normalized yet.
    const described = describeTaskColumnFilters({ a: ["blocked", "blocked"] }, COL_TASKS);
    expect(described).toHaveLength(1);
    expect(described[0].statuses).toEqual(["blocked"]);
    expect(described[0].statusWords).toBe("Blocked");
  });

  it("skips a task with no entry at all in the filter object, without throwing", () => {
    // "a" is in COL_TASKS but has no key in `filters` at all - filters.a is
    // `undefined`, not an empty array. isColumnFilterActive must handle that
    // without throwing on `.length` of undefined.
    expect(() => describeTaskColumnFilters({ b: ["done"] }, COL_TASKS)).not.toThrow();
    const described = describeTaskColumnFilters({ b: ["done"] }, COL_TASKS);
    expect(described.map((d) => d.taskId)).toEqual(["b"]);
  });

  it("orders three descriptors by visible-column order, even with the filter object's keys fully reversed", () => {
    const described = describeTaskColumnFilters({ z: ["done"], y: ["blocked"], x: ["open"] }, THREE_COL_TASKS);
    expect(described.map((d) => d.taskId)).toEqual(["x", "y", "z"]);
  });
});
