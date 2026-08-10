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

/**
 * The full TaskCatalogOverride row for `taskId`: the existing override if
 * one is on file, otherwise a "no changes yet" row derived from the
 * built-in definition (its real view/group carried over, everything else
 * null), or an all-null row keyed only by the id when it names neither.
 *
 * Every caller that needs to change ONE field of a task's definition (a
 * rename, a retirement, a reposition) starts here first - upsertCourseTaskDef
 * and upsertCourseTaskDefs (src/lib/supabase/course-tasks.ts) write every
 * column on conflict, and view_id/group_id are NOT NULL, so persisting a
 * bare partial row would either violate a constraint or blank the task's
 * label, cadence and retired flag
 * (docs/tasks-column-reorder-acceptance-criteria.md AC2 item 7). Originally
 * local to ManageTasksDialog.tsx (as baseOverrideFor) - moved here so
 * TasksTab.tsx's column-reorder handlers (drag, keyboard, column-menu move
 * commands) share the EXACT same merge rule rather than a second copy that
 * could drift.
 */
export function baseTaskCatalogOverride(
  taskId: string,
  builtIns: TaskDefinition[],
  overrides: TaskCatalogOverride[]
): TaskCatalogOverride {
  const existing = overrides.find((o) => o.taskId === taskId);
  if (existing) return existing;
  const builtIn = builtIns.find((t) => t.id === taskId);
  if (builtIn) {
    return {
      taskId,
      view: builtIn.view,
      group: builtIn.group,
      label: null,
      cadence: null,
      position: null,
      retired: false,
      custom: false,
    };
  }
  return { taskId, view: null, group: null, label: null, cadence: null, position: null, retired: false, custom: false };
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
 * the grid visually shows rather than the raw stored status.
 *
 * `hasInstruction` (docs/task-institution-instructions-acceptance-criteria.md
 * AC4 item 17) extends this seam: when true, the name gains a BOUNDED
 * mention that an institution instruction exists for this (institution,
 * task) pair - never the instruction BODY itself, which is shared, can run
 * up to TASK_INSTRUCTION_MAX_LENGTH (1000 chars), and is IDENTICAL across
 * every row at that institution in this column; inlining it into every such
 * row's accessible name would make a screen reader re-read the same long
 * paragraph hundreds of times over one column. Defaults to `false` so every
 * existing call site and test (course-tasks-view.test.ts) that has no idea
 * this feature exists keeps compiling and behaving exactly as before -
 * matching how TaskRowFilters.columns was made optional for the identical
 * reason (see that field's own comment below). Appended via appendSentence,
 * not a blind `+= "..."`, because `base` may already end in the note text at
 * this point, and a note is free-form text that can itself end in "?", "!"
 * or "." - appendSentence (not just `terminated`, which only ends in a
 * period without an existing period at the end) is what stops a note ending
 * "...confirmed?" from producing a doubled terminator like "confirmed?." */
export function taskCellAccessibleName(
  courseName: string,
  task: TaskDefinition,
  cell: TaskCell,
  nowMs: number,
  hasInstruction: boolean = false
): string {
  const status = effectiveTaskStatus(cell, task.cadence, nowMs);
  let base = `${courseName}, ${task.label}: ${TASK_STATUS_WORDS[status]}`;
  const note = cell.note.trim();
  if (note) base = `${base}, note: ${note}`;
  if (hasInstruction) base = appendSentence(base, "Institution instructions available");
  return base;
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
// Persisted column visibility (AC7 items 38/39) and CSV export (AC10):
// implementations moved to course-tasks-view-columns.ts and
// course-tasks-view-csv.ts respectively to stay under this repo's
// 1000-line-per-file cap (item 240), the same reason
// course-tasks-view-column-filters.ts was split out before them - see that
// file's header comment for the rationale, and each new file's own header
// comment for why it does or does not import back from this one.
// Re-exported here so every existing `@/lib/course-tasks-view` import (this
// feature's own test files included) keeps resolving these names from one
// place.
export {
  CURRENT_TASK_COLUMNS_VERSION,
  TASK_COLUMNS_ADDED_IN,
  parseTaskColumnSet,
  serializeTaskColumnSet,
  type TaskColumnSetContext,
} from "./course-tasks-view-columns";
export { escapeCsvValue, sheetTokenForCell, csvCellText, buildTasksCsv, type TaskCsvRow } from "./course-tasks-view-csv";
