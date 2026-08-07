// Pure view logic for the Tasks tab: resolving a per-user task catalog on
// top of the built-ins (AC9), filtering/sorting/searching rows (AC7),
// progress arithmetic (AC8, period-scoped per AC14), persisted column
// visibility (AC7 item 39, amendment 118), CSV export (AC10), and the two
// accessibility string helpers AC12/AC15 need (amendment 143/144).
//
// Like course-tasks.ts, this module is CLIENT-SAFE (no supabase/server,
// no next/headers) and every time-dependent function takes `nowMs` from its
// caller rather than reading Date.now() itself.
import {
  effectiveTaskStatus,
  isTaskOutstanding,
  taskCellAt,
  TASK_STATUS_WORDS,
  type TaskCadence,
  type TaskCell,
  type TaskCellMap,
  type TaskDefinition,
  type TaskGroupId,
  type TaskStatus,
  type TaskView,
} from "./course-tasks";
import {
  isColumnFilterActive,
  normalizeTaskColumnFilters,
  hasActiveColumnFilter,
  describeTaskColumnFilters,
  CURRENT_TASK_COLUMN_FILTERS_VERSION,
  taskColumnFiltersKey,
  serializeTaskColumnFilters,
  parseTaskColumnFilters,
  type TaskColumnFilters,
  type TaskColumnFilterDescriptor,
} from "./course-tasks-view-column-filters";

// Re-exported so every existing `@/lib/course-tasks-view` import (the tests
// for this feature included) keeps resolving these names from one place,
// even though item 240's 1000-line cap moved their IMPLEMENTATION into
// course-tasks-view-column-filters.ts. TASK_STATUS_WORDS similarly moved to
// course-tasks.ts (see that file's own comment) and is re-exported here for
// the same reason - every existing component import stays unchanged.
export {
  TASK_STATUS_WORDS,
  normalizeTaskColumnFilters,
  hasActiveColumnFilter,
  describeTaskColumnFilters,
  CURRENT_TASK_COLUMN_FILTERS_VERSION,
  taskColumnFiltersKey,
  serializeTaskColumnFilters,
  parseTaskColumnFilters,
  type TaskColumnFilters,
  type TaskColumnFilterDescriptor,
};

// ---------------------------------------------------------------------------
// Rows
//
// The row's course is a STRUCTURAL type, deliberately NOT the app's full
// Course (src/lib/supabase/courses.ts) - these modules stay decoupled from
// the app's persistence layer, and the app's real Course is structurally
// assignable to this shape. institution/term are `string | null` (not
// `| undefined`) because that is exactly what the app's Course carries for
// an unset field and what listCourseHubAction returns; `| undefined` is
// additionally accepted so a caller building a row by hand (as the test
// fixtures here do) is not forced to invent a null.

export interface TaskRowCourse {
  id: string;
  name: string;
  institution?: string | null;
  term?: string | null;
}

export interface TaskRow {
  course: TaskRowCourse;
  cells: TaskCellMap;
}

// ---------------------------------------------------------------------------
// Catalog resolution (AC9)

/**
 * One per-user customization on top of the built-in catalog - the shape
 * course_task_defs (amendment 142) persists: a rename, a group/position
 * move, a retirement, or a brand-new custom task. `null` on any of
 * view/group/label/cadence/position means "no change from the built-in" for
 * a built-in override, or "not applicable/not yet chosen" for a custom one.
 */
export interface TaskCatalogOverride {
  taskId: string;
  view: TaskView | null;
  group: TaskGroupId | null;
  label: string | null;
  cadence: TaskCadence | null;
  /** Index within the task's resolved GROUP; null means "append to the end
   * of that group" (amendment 121). This is a sort key, not a literal splice
   * target - two overrides claiming the same position do not collide, they
   * tie-break (amendment 122) rather than one clobbering the other. */
  position: number | null;
  retired: boolean;
  custom: boolean;
}

const GROUPS_BY_VIEW: Record<TaskView, TaskGroupId[]> = {
  term: ["dependent", "independent"],
  recurring: ["daily", "weekly"],
};

/** Cadence for a CUSTOM task: a term-view custom task is always "once"
 * (every Term Setup task is, built-in or not - AC73). A recurring-view
 * custom task trusts an explicit override.cadence when it names a real
 * recurring cadence, and otherwise derives it from the group - the two
 * recurring groups ARE the two cadences (see course-tasks-catalog.ts's
 * recurringTask), so a custom task dropped into "daily" defaults to
 * cadence "daily" even if the def row does not carry one yet. */
function cadenceForCustom(view: TaskView, group: TaskGroupId, overrideCadence: TaskCadence | null): TaskCadence {
  if (view === "term") return "once";
  if (overrideCadence === "daily" || overrideCadence === "weekly") return overrideCadence;
  return group === "daily" ? "daily" : "weekly";
}

interface ResolvedCandidate {
  task: TaskDefinition;
  /** Primary sort key within the task's resolved group: the override's
   * `position`, or +Infinity to append at the end (amendment 121). */
  sortKey: number;
  /** Tie-break #1 (amendment 122): the task's index in the ORIGINAL
   * `builtIns` array passed in, so ties resolve to catalog order regardless
   * of what order the overrides themselves arrive in. A custom task (no
   * catalog position of its own) sorts after every built-in tie via
   * +Infinity here too; ties among several such customs fall through to
   * tie-break #2. */
  catalogIndex: number;
}

/** Ties break on task id ascending (amendment 122's final tie-break) -
 * this is what makes resolveTaskCatalog deterministic regardless of the
 * order overrides are supplied in, not merely "probably stable". */
function compareCandidates(a: ResolvedCandidate, b: ResolvedCandidate): number {
  if (a.sortKey !== b.sortKey) return a.sortKey - b.sortKey;
  if (a.catalogIndex !== b.catalogIndex) return a.catalogIndex - b.catalogIndex;
  return a.task.id.localeCompare(b.task.id);
}

/**
 * Computes the ordered task list a caller should render for `view`:
 * built-in tasks (renamed/repositioned/retired per `overrides`) plus any
 * custom task an override declares, in resolved-group order with groups
 * kept CONTIGUOUS (a repositioned or moved task can never escape its own
 * group - amendment 121). Pure: never mutates `builtIns` or `overrides`.
 *
 * - A rename (override.label) is ignored when blank/whitespace-only
 *   (normalizeTaskLabel returns "") - AC9 item 49's validator applied here
 *   too, not just at the editing UI.
 * - A group move is ignored unless the named group actually belongs to
 *   `view` - a stray or cross-view group id leaves the task in its
 *   existing group rather than producing an inconsistent table.
 * - retired: true drops a built-in or custom task from the resolved list
 *   entirely (AC9 item 46 - its stored cell values are untouched; only the
 *   COLUMN disappears. See course-tasks.ts's coerceTaskCellMap doc comment
 *   for why the id-filter that would otherwise erase that history is never
 *   applied on this path - amendment 120).
 * - A custom override (custom: true) is only realized when its OWN view
 *   matches `view` (a custom task never leaks into the other sub-view),
 *   its group belongs to that view, and its label is non-blank; an
 *   override naming a built-in id that does not exist is otherwise a no-op
 *   (custom: false and no matching built-in - never throws).
 */
export function resolveTaskCatalog(
  builtIns: TaskDefinition[],
  overrides: TaskCatalogOverride[],
  view: TaskView
): TaskDefinition[] {
  const overridesByTaskId = new Map<string, TaskCatalogOverride>();
  for (const override of overrides) overridesByTaskId.set(override.taskId, override);
  const allBuiltInIds = new Set(builtIns.map((t) => t.id));
  const groupsForView = GROUPS_BY_VIEW[view];

  const candidates: ResolvedCandidate[] = [];

  builtIns.forEach((task, catalogIndex) => {
    if (task.view !== view) return;
    const override = overridesByTaskId.get(task.id);
    if (override?.retired) return;

    const label = override ? normalizeTaskLabel(override.label) || task.label : task.label;
    const group = override?.group && groupsForView.includes(override.group) ? override.group : task.group;

    candidates.push({
      task: { ...task, label, group },
      sortKey: override?.position ?? Number.POSITIVE_INFINITY,
      catalogIndex,
    });
  });

  for (const override of overrides) {
    if (!override.custom) continue;
    if (allBuiltInIds.has(override.taskId)) continue; // handled as a built-in override above, regardless of a stray custom flag
    if (override.retired) continue;
    if (override.view !== view) continue;
    if (!override.group || !groupsForView.includes(override.group)) continue;
    const label = normalizeTaskLabel(override.label);
    if (!label) continue;

    candidates.push({
      task: {
        id: override.taskId,
        label,
        view,
        group: override.group,
        cadence: cadenceForCustom(view, override.group, override.cadence),
        builtIn: false,
      },
      sortKey: override.position ?? Number.POSITIVE_INFINITY,
      catalogIndex: Number.POSITIVE_INFINITY,
    });
  }

  const byGroup = new Map<TaskGroupId, ResolvedCandidate[]>();
  for (const candidate of candidates) {
    const list = byGroup.get(candidate.task.group);
    if (list) list.push(candidate);
    else byGroup.set(candidate.task.group, [candidate]);
  }

  const ordered: TaskDefinition[] = [];
  for (const groupId of groupsForView) {
    const list = byGroup.get(groupId) ?? [];
    list.sort(compareCandidates);
    for (const candidate of list) ordered.push(candidate.task);
  }
  return ordered;
}

// ---------------------------------------------------------------------------
// String helpers (amendment 143/144)

// Matches TASK_NOTE_MAX_LENGTH's value (course-tasks.ts) - a separate
// constant because a label and a note are conceptually different fields
// that simply happen to share the same cap (AC9 item 49 / AC4 item 18).
const TASK_LABEL_MAX_LENGTH = 200;

/** AC9 item 49's label validator: trims, collapses internal whitespace runs
 * (so a label cannot smuggle in layout via embedded newlines/tabs), and caps
 * at TASK_LABEL_MAX_LENGTH. Returns "" for a blank, whitespace-only, or
 * non-string input - callers reject "" with an inline message rather than
 * creating an unlabelled column. */
export function normalizeTaskLabel(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw.trim().replace(/\s+/g, " ").slice(0, TASK_LABEL_MAX_LENGTH);
}

/** Ensures `s` ends with terminal punctuation, without adding a second one
 * if it already ends in "?", "!" or "." (B9/C4) - most of the 40 catalog task
 * labels end in "?", and a blind `+ "."` produced accessible names/
 * announcements like "Textbook ordered?." with two terminators back to back.
 * Exported (moved here from TasksGrid.tsx - the two copies drifted, since
 * the local version never reached TasksTab.tsx's own announcement path) so
 * every caller that follows a task label with more text shares the SAME
 * rule rather than reimplementing it. */
export function terminated(s: string): string {
  return /[?!.]$/.test(s) ? s : `${s}.`;
}

/** Appends a new sentence fragment onto `base` (B9/C4) - `base` may or may
 * not already end in terminal punctuation, so the separator is chosen the
 * same way `terminated` decides whether to add one, rather than always
 * prefixing ". ". */
export function appendSentence(base: string, sentence: string): string {
  const separator = /[?!.]$/.test(base) ? " " : ". ";
  return `${base}${separator}${sentence}.`;
}

/** `"<Course>, <Task>: <Status>"`, plus `", note: <note>"` when the cell
 * carries one - AC12 item 60 (status is never colour alone) needs a name
 * that states the course, the task and the status in words. Reports the
 * EFFECTIVE (period-scoped) status via effectiveTaskStatus, so an expired
 * daily/weekly completion reads back as "Not done" here too, matching what
 * the grid visually shows rather than the raw stored status. */
export function taskCellAccessibleName(
  courseName: string,
  task: TaskDefinition,
  cell: TaskCell,
  nowMs: number
): string {
  const status = effectiveTaskStatus(cell, task.cadence, nowMs);
  const base = `${courseName}, ${task.label}: ${TASK_STATUS_WORDS[status]}`;
  const note = cell.note.trim();
  return note ? `${base}, note: ${note}` : base;
}

// ---------------------------------------------------------------------------
// Progress arithmetic (AC8, period-scoped per AC14 item 44/79)

export interface TaskProgress {
  done: number;
  applicable: number;
  outstanding: number;
}

/** `done`/`applicable` (excluding `na`) plus `outstanding` (open + blocked),
 * all read through effectiveTaskStatus so a Daily/Weekly row's progress
 * means "done in the CURRENT period", not raw stored status (AC14 item 79).
 * A task with no stored cell counts as open and applicable - the same
 * "absence is open" rule as everywhere else in this feature. A stored cell
 * for a task NOT in `tasks` (e.g. a retired task's leftover history) is
 * silently ignored, since only `tasks` is iterated. */
export function computeTaskProgress(cells: TaskCellMap, tasks: TaskDefinition[], nowMs: number): TaskProgress {
  let done = 0;
  let applicable = 0;
  let outstanding = 0;
  for (const task of tasks) {
    const status = effectiveTaskStatus(taskCellAt(cells, task.id), task.cadence, nowMs);
    if (status === "na") continue;
    applicable += 1;
    if (status === "done") done += 1;
    else outstanding += 1; // open or blocked
  }
  return { done, applicable, outstanding };
}

/** `"12/38"` (unspaced - amendment 128) when something is applicable, or
 * `"-"` (ASCII hyphen-minus) when nothing is - a zero-applicable row (every
 * task marked n/a) must never render "0/0" or divide-by-zero into NaN%. */
export function formatTaskProgress(progress: TaskProgress): string {
  if (progress.applicable === 0) return "-";
  return `${progress.done}/${progress.applicable}`;
}

/** How many VISIBLE rows have `taskId` outstanding (open or blocked,
 * period-scoped) right now - the column-header summary AC8 item 41 needs,
 * so the bottleneck task across courses is visible at a glance. */
export function countColumnOutstanding(rows: TaskRow[], taskId: string, cadence: TaskCadence, nowMs: number): number {
  let count = 0;
  for (const row of rows) {
    if (isTaskOutstanding(taskCellAt(row.cells, taskId), cadence, nowMs)) count += 1;
  }
  return count;
}

/** done/applicable as a ratio in [0, 1], or a fixed sentinel (below every
 * real ratio) when nothing is applicable - amendment 117: a raw NaN from
 * 0/0 compares false against everything, which makes Array.sort's result
 * depend on the input order it happened to start from. A fixed sentinel
 * keeps the comparator total and the sort result independent of input
 * order, which is exactly what "sorts a row with nothing applicable
 * consistently" tests for. */
function progressRatio(progress: TaskProgress): number {
  return progress.applicable === 0 ? -1 : progress.done / progress.applicable;
}

// ---------------------------------------------------------------------------
// Filtering (AC7)

export const ALL_FILTER = "__all__";

export interface TaskRowFilters {
  search: string;
  institution: string;
  term: string;
  outstandingOnly: boolean;
  /** Per-task-column status constraints (item 208) - optional so every
   * existing caller/test that builds a TaskRowFilters without knowing about
   * this feature still compiles and behaves exactly as before (item 208's
   * "every existing caller and test compiles unchanged"). */
  columns?: TaskColumnFilters;
}

function normalizedFieldValue(raw: string | null | undefined): string {
  return (raw ?? "").trim();
}

/**
 * Applies every filter conjunctively (search AND institution AND term AND
 * outstandingOnly AND every constrained task column - item 209). `search`
 * matches course name, institution, term, and any cell NOTE - but only for a
 * task present in `tasks` (amendment 133): `tasks` is the caller's already-
 * resolved, already-visible-column set, so a hit on a hidden, retired, or
 * other-sub-view task's note (the status map is shared across both views -
 * AC14 item 71) never surfaces here, which would otherwise read as a search
 * bug rather than a feature.
 * `outstandingOnly` uses computeTaskProgress (period-scoped, `tasks`-scoped)
 * so it is likewise a property of what is currently visible, not of the raw
 * stored map (amendment 132: scoped to the visible task columns - a caller
 * hiding every column should disable this toggle rather than let it empty
 * the table via an all-columns-invisible progress of {0,0,0}).
 *
 * A task column filter is applied only when its task is in `tasks` (item
 * 211 - a constraint on a hidden/retired/other-sub-view column must never
 * remove rows, the identical rationale amendment 133 already applies to
 * search) and only when it actually constrains anything (item 210). Within
 * one column the selected statuses are OR-ed (any one match keeps the row);
 * across columns they are AND-ed with each other and with every filter
 * above (item 209). The match is against the EFFECTIVE, period-scoped
 * status, same as every other read in this feature.
 */
export function filterTaskRows(
  rows: TaskRow[],
  tasks: TaskDefinition[],
  filters: TaskRowFilters,
  nowMs: number
): TaskRow[] {
  const search = filters.search.trim().toLowerCase();
  const visibleTaskIds = new Set(tasks.map((t) => t.id));

  const activeColumnFilters: { task: TaskDefinition; allowed: Set<TaskStatus> }[] = [];
  if (filters.columns) {
    for (const task of tasks) {
      const statuses = filters.columns[task.id];
      if (!isColumnFilterActive(statuses)) continue;
      activeColumnFilters.push({ task, allowed: new Set(statuses) });
    }
  }

  return rows.filter((row) => {
    if (filters.institution !== ALL_FILTER && normalizedFieldValue(row.course.institution) !== filters.institution) {
      return false;
    }
    if (filters.term !== ALL_FILTER && normalizedFieldValue(row.course.term) !== filters.term) {
      return false;
    }

    if (search) {
      const haystacks = [row.course.name, row.course.institution ?? "", row.course.term ?? ""];
      for (const [taskId, cell] of Object.entries(row.cells)) {
        if (visibleTaskIds.has(taskId)) haystacks.push(cell.note);
      }
      const matched = haystacks.some((h) => h.toLowerCase().includes(search));
      if (!matched) return false;
    }

    if (filters.outstandingOnly) {
      if (computeTaskProgress(row.cells, tasks, nowMs).outstanding === 0) return false;
    }

    for (const { task, allowed } of activeColumnFilters) {
      const status = effectiveTaskStatus(taskCellAt(row.cells, task.id), task.cadence, nowMs);
      if (!allowed.has(status)) return false;
    }

    return true;
  });
}

function distinctSortedNonBlank(values: (string | null | undefined)[]): string[] {
  const set = new Set<string>();
  for (const value of values) {
    const trimmed = normalizedFieldValue(value);
    if (trimmed) set.add(trimmed);
  }
  return [...set].sort((a, b) => a.localeCompare(b));
}

/** Distinct institution values present across `rows`, sorted, with blanks
 * excluded - the Institution filter's option list (AC7 item 35), never a
 * hardcoded list. */
export function distinctInstitutions(rows: TaskRow[]): string[] {
  return distinctSortedNonBlank(rows.map((r) => r.course.institution));
}

/** Distinct term values present across `rows`, sorted, with blanks
 * excluded - the Term filter's option list (AC7 item 35). */
export function distinctTerms(rows: TaskRow[]): string[] {
  return distinctSortedNonBlank(rows.map((r) => r.course.term));
}

// ---------------------------------------------------------------------------
// Sorting (AC7 item 36, amendment 116/117; task-column sort AC-A item 200)

/** "task" sorts by one task COLUMN's effective status (item 200); `taskId`
 * on TaskSortState is meaningful only then. */
export type TaskSortField = "name" | "institution" | "term" | "progress" | "task";
export type TaskSortDirection = "asc" | "desc";

export interface TaskSortState {
  field: TaskSortField;
  /** Meaningful only when `field === "task"`. TRAP (item 200): this is
   * `string`, never `string | null`, and every producer here OMITS the key
   * on a non-task sort rather than nulling it - `toEqual` treats a `null`
   * property as a real value but ignores an absent one, so normalizing with
   * `sort.taskId ?? null` would fail several assertions that a plain "leave
   * it out" implementation passes, including DEFAULT_TASK_SORT's own shape. */
  taskId?: string;
  direction: TaskSortDirection;
}

export const DEFAULT_TASK_SORT: TaskSortState = { field: "name", direction: "asc" };

// A `Record<TaskSortField, true>` literal, not a hand-written array: adding a
// field to the TaskSortField union without adding it here is a TYPE ERROR
// (missing property), not silent data loss. The plain-array version this
// replaced compiled fine after "task" was added to the union above and simply
// kept rejecting every persisted column sort - exactly the trap item 200
// calls out ("TASK_SORT_FIELDS...has no exhaustiveness check").
const TASK_SORT_FIELD_MEMBERSHIP: Record<TaskSortField, true> = {
  name: true,
  institution: true,
  term: true,
  progress: true,
  task: true,
};
const TASK_SORT_FIELDS: TaskSortField[] = Object.keys(TASK_SORT_FIELD_MEMBERSHIP) as TaskSortField[];
// The Sort <select>'s four PLAIN option keys (item 227) - "task" is
// deliberately excluded, since a bare "task" key (no `:<id>` suffix) never
// round-trips to a usable sort and is treated as malformed by
// taskSortFromValueKey below, not as a fifth plain option.
const PLAIN_SORT_FIELD_KEYS: TaskSortField[] = TASK_SORT_FIELDS.filter((f) => f !== "task");
const TASK_SORT_DIRECTIONS: TaskSortDirection[] = ["asc", "desc"];

/** Ascending rank for the three statuses a task column sort can actually
 * order by (item 202): Blocked, Not done, Done - most-attention-needed
 * first, matching sort-by-progress ascending's "least done first" framing.
 * `na` is deliberately absent - it never gets a rank, it sorts last via
 * SortableValue.empty instead (item 203), the same mechanism a blank
 * institution/term already uses. Private: item 202's plan explicitly says
 * not to export a rank map, since the ordering is already pinned as
 * observable behavior by the ascending/descending tests. */
const TASK_STATUS_SORT_RANK: Record<Exclude<TaskStatus, "na">, number> = { blocked: 0, open: 1, done: 2 };

interface SortableValue {
  kind: "text" | "number";
  value: string | number;
  /** Always sorts last, in both directions - a blank institution/term, or a
   * not-applicable task cell (item 203), never the sort-by-progress ratio
   * (which always has a defined value via progressRatio's sentinel, so it is
   * never "empty"). SCOPED to field==="task" only - progressRatio's own -1
   * sentinel for a zero-applicable row is a real, non-empty value that
   * happens to sort first; that placement is a different, already-frozen
   * behavior and item 203 is explicit that the analogy between the two does
   * NOT hold. */
  empty: boolean;
}

function sortFieldValue(row: TaskRow, tasks: TaskDefinition[], sort: TaskSortState, nowMs: number): SortableValue {
  switch (sort.field) {
    case "name":
      return { kind: "text", value: row.course.name, empty: false };
    case "institution": {
      const value = normalizedFieldValue(row.course.institution);
      return { kind: "text", value, empty: value === "" };
    }
    case "term": {
      const value = normalizedFieldValue(row.course.term);
      return { kind: "text", value, empty: value === "" };
    }
    case "progress":
      return { kind: "number", value: progressRatio(computeTaskProgress(row.cells, tasks, nowMs)), empty: false };
    case "task": {
      // Unreachable with an INVALID taskId in practice - sortTaskRows below
      // resolves `sort` through resolveTaskSort first, which falls back to
      // DEFAULT_TASK_SORT (field "name") whenever the task is missing. The
      // `na`/not-found fallback here just keeps this function total on its
      // own, for any future direct caller.
      const task = tasks.find((t) => t.id === sort.taskId);
      if (!task) return { kind: "number", value: 0, empty: true };
      const status = effectiveTaskStatus(taskCellAt(row.cells, task.id), task.cadence, nowMs);
      if (status === "na") return { kind: "number", value: 0, empty: true };
      return { kind: "number", value: TASK_STATUS_SORT_RANK[status], empty: false };
    }
  }
}

function compareSortableValues(a: SortableValue, b: SortableValue): number {
  if (a.kind === "text" && b.kind === "text") {
    return (a.value as string).localeCompare(b.value as string, undefined, { sensitivity: "base" });
  }
  return (a.value as number) - (b.value as number);
}

/**
 * The decision the toolbar label and the actual row order share (item 205):
 * a task-column sort naming a task not in `tasks` - a hidden column, a
 * retired task, a deleted custom task, or a missing/blank taskId - degrades
 * to DEFAULT_TASK_SORT (course name ascending). Every other sort passes
 * through UNCHANGED, including a non-task sort's absent `taskId` - the
 * result never materializes a `taskId` key that was not already on `sort`
 * (item 200's trap).
 */
export function resolveTaskSort(sort: TaskSortState, tasks: TaskDefinition[]): TaskSortState {
  if (sort.field !== "task") return sort;
  if (!sort.taskId || !tasks.some((t) => t.id === sort.taskId)) return DEFAULT_TASK_SORT;
  return sort;
}

/**
 * Sorts `rows` by `sort.field`/`sort.direction` (`sort` is resolved through
 * resolveTaskSort FIRST, so an invalid task-column sort degrades to
 * DEFAULT_TASK_SORT here exactly as it does everywhere else - item 205).
 * This is a TOTAL order (amendment 116): the primary field, direction-aware,
 * THEN course name ascending, THEN course id ascending - both tie-breaks
 * always ascending regardless of `sort.direction`, matching the convention
 * courses-table-helpers.ts already establishes and REGRESSION #232 check 12
 * pins for every field, task columns included (item 204) - notably this
 * includes two NOT-APPLICABLE rows tying each other: both have
 * `value.empty === true`, so the `primary = 0` branch below is taken and
 * falls through to the same name/id tie-break, never a fixed 1/-1 that would
 * leave their relative order dependent on input order. A course-name
 * tie-break alone is NOT total (the source workbook has "Course 1" three
 * times over), so the id tie-break is what makes the result depend only on
 * the data, not on whatever order it happened to arrive in. A blank/null
 * institution or term, or a not-applicable task cell (item 203), always
 * sorts last, in both directions - never displacing real data regardless of
 * which way the column is pointed. Never mutates `rows`.
 */
export function sortTaskRows(
  rows: TaskRow[],
  tasks: TaskDefinition[],
  sort: TaskSortState,
  nowMs: number
): TaskRow[] {
  const resolved = resolveTaskSort(sort, tasks);
  const decorated = rows.map((row) => ({ row, value: sortFieldValue(row, tasks, resolved, nowMs) }));

  decorated.sort((a, b) => {
    let primary: number;
    if (a.value.empty && b.value.empty) {
      primary = 0;
    } else if (a.value.empty) {
      return 1;
    } else if (b.value.empty) {
      return -1;
    } else {
      const cmp = compareSortableValues(a.value, b.value);
      primary = resolved.direction === "asc" ? cmp : -cmp;
    }
    if (primary !== 0) return primary;

    const nameCmp = a.row.course.name.localeCompare(b.row.course.name);
    if (nameCmp !== 0) return nameCmp;
    return a.row.course.id.localeCompare(b.row.course.id);
  });

  return decorated.map((d) => d.row);
}

/** Parse a persisted ta-tasks-*-sort value; anything malformed falls back
 * to DEFAULT_TASK_SORT rather than throwing. Mirrors parseSortState in
 * courses-table-helpers.ts. Extended for the task-column sort (item 206): a
 * `"task"` field requires a non-blank STRING `taskId` (missing, blank, or a
 * non-string value all fall back to DEFAULT_TASK_SORT), and a `taskId`
 * sitting on any other field is DROPPED rather than carried through - it
 * really does turn up there (item 227: switching the Sort control away from
 * a column with a `{...sort, field}` spread leaves the old `taskId` behind
 * in the object that gets JSON.stringify'd to localStorage), and reading it
 * back must not resurrect half a column sort. */
export function parseTaskSortState(raw: string | null | undefined): TaskSortState {
  if (!raw) return DEFAULT_TASK_SORT;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return DEFAULT_TASK_SORT;

    const field = (parsed as { field?: unknown }).field;
    const direction = (parsed as { direction?: unknown }).direction;
    if (
      !TASK_SORT_FIELDS.includes(field as TaskSortField) ||
      !TASK_SORT_DIRECTIONS.includes(direction as TaskSortDirection)
    ) {
      return DEFAULT_TASK_SORT;
    }

    if (field === "task") {
      const taskId = (parsed as { taskId?: unknown }).taskId;
      if (typeof taskId !== "string" || taskId.trim() === "") return DEFAULT_TASK_SORT;
      return { field: "task", taskId, direction: direction as TaskSortDirection };
    }
    return { field: field as TaskSortField, direction: direction as TaskSortDirection };
  } catch {
    return DEFAULT_TASK_SORT;
  }
}

/**
 * Encodes/decodes the Sort `<select>`'s opaque option value (item 227,
 * 238): a `<select>` carries exactly one string, so the composite key
 * (`"name"`, `"progress"`, `"task:<id>"`) is what round-trips through it.
 * The DECODER is deliberately what clears a stale `taskId` (never the
 * caller's spread) - it returns a PARTIAL sort (`{field}` or `{field,
 * taskId}`, no `direction`, since the direction toggle is unrelated UI
 * state the caller merges in separately) and falls back to
 * DEFAULT_TASK_SORT.field on an unknown or malformed key, including
 * `"task:"` with no id after the colon.
 */
export function taskSortValueKey(sort: TaskSortState): string {
  return sort.field === "task" ? `task:${sort.taskId ?? ""}` : sort.field;
}

export function taskSortFromValueKey(key: string): { field: TaskSortField; taskId?: string } {
  if (key.startsWith("task:")) {
    const taskId = key.slice("task:".length);
    return taskId ? { field: "task", taskId } : { field: DEFAULT_TASK_SORT.field };
  }
  if (PLAIN_SORT_FIELD_KEYS.includes(key as TaskSortField)) return { field: key as TaskSortField };
  return { field: DEFAULT_TASK_SORT.field };
}

// ---------------------------------------------------------------------------
// Persisted column visibility (AC7 items 38/39, amendment 118)
//
// Reuses the versioned `{v, columns}` + "added in version N" union idiom
// from courses-table-helpers.ts's parseColumnSet/serializeColumnSet, EXTENDED
// with a `known` id list (amendment 118). The plain versioned union alone
// handles a built-in column added by an app upgrade (every existing
// instructor's persisted set predates it, so it is unioned in once via
// CURRENT_TASK_COLUMNS_VERSION/TASK_COLUMNS_ADDED_IN) but it CANNOT handle a
// user-created CUSTOM task, because a custom task has no version number to
// key off of: "a custom task created since this set was written" and "a
// custom task the user deliberately hid" are indistinguishable from a bare
// list of custom ids alone, so the naive versioned-union design would
// re-add a hidden custom column on every single parse, forever - making
// AC7 item 37 ("task columns can be individually hidden") permanently
// unachievable for exactly the columns AC9 introduces. `known` breaks that
// tie: it is the full set of task ids that existed AT WRITE TIME, so an id
// in `allIds` but missing from `known` is unambiguously "never seen before"
// (union it in, once) rather than "seen and hidden" (leave it alone).
//
// The `known`-based union is deliberately gated on the payload actually
// carrying a `known` array - see parseTaskColumnSet's own comment below for
// why defaulting it (e.g. to the listed columns, or to `allIds`) when the
// field is simply ABSENT would break the plain versioned-union tests this
// idiom is inherited from.

export const CURRENT_TASK_COLUMNS_VERSION = 1;

/** Columns introduced by each version, unioned into every persisted set
 * stored at an earlier version - see COLUMNS_ADDED_IN in
 * courses-table-helpers.ts for the identical idiom. Ships empty at v1
 * (amendment 145): there is no "version 0" Tasks-tab column set to migrate
 * from, since this is the feature's first release. */
export const TASK_COLUMNS_ADDED_IN: Record<number, string[]> = {};

export interface TaskColumnSetContext {
  allIds: string[];
  addedIn?: Record<number, string[]>;
}

/**
 * Parses a persisted ta-tasks-*-columns value into the list of currently
 * VISIBLE task ids. Falls back to every id in `ctx.allIds` (i.e. nothing
 * hidden) on anything malformed or absent, rather than throwing.
 *
 * Accepts the current `{v, columns, known}` shape and, like
 * courses-table-helpers.ts's parseColumnSet, the legacy bare-array shape
 * (treated as version 0, and as never carrying a `known` list at all - a
 * bare array predates the entire `{v, columns}` wrapper, let alone `known`).
 *
 * The `known`-based union (amendment 118) ONLY runs when the parsed payload
 * actually contains a `known` array. When it is absent - a legacy bare
 * array, or a `{v, columns}` value written before `known` existed -
 * reconciliation falls back to the addedIn/version union ALONE, exactly as
 * it behaved before `known` was introduced. This is deliberate, not an
 * oversight: defaulting `known` to "the ids this value lists" (so anything
 * else gets unioned in) would resurrect every built-in column a user has
 * EVER explicitly hidden via the ordinary versioned mechanism, the moment
 * they hide it - the versioned-union tests below (a v1 set that hid a
 * column introduced at v1, or at a version below the current one) pin
 * exactly this, and only run the `known` union when the caller has actually
 * started recording one via serializeTaskColumnSet.
 */
export function parseTaskColumnSet(raw: string | null | undefined, ctx: TaskColumnSetContext): string[] {
  const allSet = new Set(ctx.allIds);
  if (!raw) return [...ctx.allIds];

  let storedVersion: number;
  let columnsRaw: unknown;
  let knownRaw: unknown;

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) {
      storedVersion = 0;
      columnsRaw = parsed;
    } else if (
      parsed &&
      typeof parsed === "object" &&
      typeof (parsed as { v?: unknown }).v === "number" &&
      Array.isArray((parsed as { columns?: unknown }).columns)
    ) {
      storedVersion = (parsed as { v: number }).v;
      columnsRaw = (parsed as { columns: unknown[] }).columns;
      knownRaw = (parsed as { known?: unknown }).known;
    } else {
      return [...ctx.allIds];
    }
  } catch {
    return [...ctx.allIds];
  }

  const seen = new Set<string>();
  const visible: string[] = [];
  for (const rawId of columnsRaw as unknown[]) {
    if (typeof rawId !== "string") continue;
    if (allSet.has(rawId) && !seen.has(rawId)) {
      seen.add(rawId);
      visible.push(rawId);
    }
  }

  const addedIn = ctx.addedIn ?? {};
  for (const [versionStr, added] of Object.entries(addedIn)) {
    if (Number(versionStr) <= storedVersion) continue;
    for (const id of added) {
      if (allSet.has(id) && !seen.has(id)) {
        seen.add(id);
        visible.push(id);
      }
    }
  }

  if (Array.isArray(knownRaw)) {
    const known = new Set((knownRaw as unknown[]).filter((id): id is string => typeof id === "string"));
    for (const id of ctx.allIds) {
      if (!known.has(id) && !seen.has(id)) {
        seen.add(id);
        visible.push(id);
      }
    }
  }

  return visible;
}

/** Serializes a column set at CURRENT_TASK_COLUMNS_VERSION, recording the
 * FULL `knownIds` list (every task id that exists at write time - built-ins
 * and the instructor's own custom tasks alike) so the next parse can tell
 * "created since this was written" (show it) apart from "existed, and the
 * user hid it" (respect that). Callers should re-serialize through this
 * function whenever they persist a value read via parseTaskColumnSet, so a
 * legacy or older-version value is upgraded on write. */
export function serializeTaskColumnSet(columns: string[], knownIds: string[]): string {
  return JSON.stringify({ v: CURRENT_TASK_COLUMNS_VERSION, columns, known: knownIds });
}

// ---------------------------------------------------------------------------
// CSV export (AC10)

/** Escapes one CSV field: quotes and doubles internal quotes when the value
 * contains a comma, a double quote, or a newline/carriage return; otherwise
 * returns it unquoted. */
export function escapeCsvValue(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/** Renders one cell's EFFECTIVE (period-scoped) status as the source
 * sheet's own token - "Y"/"N"/"N/A"/"" - so an expired daily/weekly
 * completion exports as blank, matching what the grid visually shows rather
 * than the raw stored status. */
export function sheetTokenForCell(cell: TaskCell, cadence: TaskCadence, nowMs: number): string {
  const status = effectiveTaskStatus(cell, cadence, nowMs);
  switch (status) {
    case "done":
      return "Y";
    case "blocked":
      return "N";
    case "na":
      return "N/A";
    case "open":
      return "";
  }
}

/** The full CSV cell text: the sheet token with a trimmed note appended in
 * parentheses when present, or the note alone (still parenthesized) when
 * there is no token (an open cell with a note - "waiting on the dean" is
 * still worth exporting even though it renders no Y/N/N/A). */
export function csvCellText(cell: TaskCell, cadence: TaskCadence, nowMs: number): string {
  const token = sheetTokenForCell(cell, cadence, nowMs);
  const note = cell.note.trim();
  if (token && note) return `${token} (${note})`;
  if (note) return `(${note})`;
  return token;
}

/**
 * Builds the CSV text for `rows`/`tasks`: an identity block (Course,
 * Institution, Term) then one column per task in the order given, mirroring
 * the source sheet's shape (AC10 item 51). When `generatedLabel` is
 * supplied, a `Generated,<label>` line precedes the header - the period
 * this export was taken for (AC14 item 80), so a Daily/Weekly CSV is never
 * ambiguous about which day/week it describes. Every field (including the
 * generated-at label, and every cell's token+note) is escaped individually -
 * a comma or quote inside a NOTE, not just a header label, must not corrupt
 * the row it sits in.
 */
export function buildTasksCsv(
  rows: TaskRow[],
  tasks: TaskDefinition[],
  nowMs: number,
  generatedLabel?: string
): string {
  const lines: string[] = [];
  if (generatedLabel) {
    lines.push(["Generated", generatedLabel].map(escapeCsvValue).join(","));
  }

  const header = ["Course", "Institution", "Term", ...tasks.map((t) => t.label)];
  lines.push(header.map(escapeCsvValue).join(","));

  for (const row of rows) {
    const values = [
      row.course.name,
      row.course.institution ?? "",
      row.course.term ?? "",
      ...tasks.map((task) => csvCellText(taskCellAt(row.cells, task.id), task.cadence, nowMs)),
    ];
    lines.push(values.map(escapeCsvValue).join(","));
  }

  return lines.join("\n");
}
