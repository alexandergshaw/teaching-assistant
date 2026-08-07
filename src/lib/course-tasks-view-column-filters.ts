// Column-level filtering helpers for the Tasks tab (AC-B/AC-C/AC-H,
// docs/tasks-column-sort-filter-acceptance-criteria.md items 208-217 and
// 236-239) - split out of course-tasks-view.ts to stay under this repo's
// 1000-line-per-file cap (item 240), the same way
// weekly-checklist.frequency.test.ts is split from weekly-checklist.test.ts.
// Everything exported here is re-exported from course-tasks-view.ts, so
// every caller - including this feature's own test file, which imports
// exclusively from "./course-tasks-view" - resolves these names from one
// place regardless of which file actually implements them.
//
// Depends only on course-tasks.ts, never on course-tasks-view.ts itself:
// course-tasks-view.ts's own filterTaskRows needs isColumnFilterActive (the
// "does this selection actually constrain anything" rule), so the
// dependency runs this module -> course-tasks.ts and separately
// course-tasks-view.ts -> this module. Reversing that (importing back from
// course-tasks-view.ts, e.g. for TASK_STATUS_WORDS) would create an import
// cycle between the two files; TASK_STATUS_WORDS lives in course-tasks.ts
// for exactly this reason - see that file's own comment.
//
// CLIENT-SAFE like every other module in this feature: no Date.now(), no
// supabase/server import, no next/headers.
import {
  isTaskStatus,
  TASK_STATUS_WORDS,
  TASK_STATUSES,
  type TaskDefinition,
  type TaskStatus,
  type TaskView,
} from "./course-tasks";

/** Maps a task id to the statuses to KEEP for that column (item 208). A
 * column absent from this map, mapped to an empty array, or mapped to all
 * four statuses is not a constraint at all - see isColumnFilterActive. */
export type TaskColumnFilters = Record<string, TaskStatus[]>;

/** Whether a column's selected-statuses list actually constrains anything
 * (item 210/237): empty, or all four statuses selected, is NO constraint -
 * deselecting everything must never silently empty the table, and selecting
 * everything is equivalent to not filtering at all. Re-applied everywhere a
 * column filter is consulted (course-tasks-view.ts's filterTaskRows,
 * hasActiveColumnFilter, describeTaskColumnFilters below) rather than
 * assumed true of an already-normalized map, since none of those callers
 * can rely on the caller having normalized first. Exported so
 * filterTaskRows - which stays in course-tasks-view.ts, since it also owns
 * search/institution/term/outstandingOnly - reuses this exact rule instead
 * of a second copy. */
export function isColumnFilterActive(statuses: readonly TaskStatus[] | undefined): boolean {
  if (!statuses || statuses.length === 0) return false;
  return new Set(statuses).size < TASK_STATUSES.length;
}

/**
 * Coerces untrusted persisted/pasted state (`unknown`, not `TaskColumnFilters`
 * - item 213) into a well-formed TaskColumnFilters: drops a blank key (the
 * same rule coerceTaskCellMap in course-tasks.ts applies to the statuses
 * jsonb column), a value that is not an array, and any status token not in
 * TASK_STATUSES; then drops the whole entry if what remains is empty or
 * complete (item 210 - a non-constraint is not worth persisting or reading
 * back); the survivors are de-duplicated and ordered in TASK_STATUSES order
 * so the same selection never serializes two ways (item 213). Builds fresh
 * arrays/objects throughout - never mutates `raw`, and never an in-place
 * `sort()` on a caller's own array. Never throws.
 */
export function normalizeTaskColumnFilters(raw: unknown): TaskColumnFilters {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return {};

  // Built on Object.create(null), never a bare `{}` literal - mirrors
  // coerceTaskCellMap in course-tasks.ts (see that function's own doc
  // comment) for the identical reason: `raw` is untrusted, parsed JSON, and
  // an own "__proto__" key (which JSON.parse really does produce as an own
  // property) assigned via `out[key] = ...` on an ordinary object triggers
  // the inherited __proto__ SETTER instead of creating a normal key - it
  // silently reassigns the returned object's own prototype rather than
  // becoming a key in it. A null-prototype object has no inherited
  // `__proto__` setter to hijack, so the same bracket-assignment code below
  // is safe either way.
  const out: TaskColumnFilters = Object.create(null) as TaskColumnFilters;
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (key.trim() === "") continue;
    if (!Array.isArray(value)) continue;

    const present = new Set<TaskStatus>();
    for (const item of value) {
      if (isTaskStatus(item)) present.add(item);
    }
    const ordered = TASK_STATUSES.filter((s) => present.has(s));
    if (!isColumnFilterActive(ordered)) continue;
    out[key] = ordered;
  }
  return out;
}

/** Re-applies the empty/complete rule (item 210) to whatever is handed in,
 * rather than assuming an already-normalized map - the header indicator
 * (item 237) must not light up for a filter that constrains nothing,
 * whatever state it is given. */
export function hasActiveColumnFilter(filters: TaskColumnFilters, taskId: string): boolean {
  return isColumnFilterActive(filters[taskId]);
}

/** One descriptor per ACTIVE column filter (item 236), in `tasks` order (not
 * the filter object's own key order) - the ONE source of the chip text (item
 * 225), the header's accessible name (item 223) and the live-region
 * announcement (item 229), so those three can never drift apart. A filter
 * naming a task not in `tasks`, or one that does not actually constrain
 * anything, contributes nothing (mirrors isColumnFilterActive/item 211). */
export interface TaskColumnFilterDescriptor {
  taskId: string;
  label: string;
  statuses: TaskStatus[];
  statusWords: string;
}

export function describeTaskColumnFilters(
  filters: TaskColumnFilters,
  tasks: TaskDefinition[]
): TaskColumnFilterDescriptor[] {
  const out: TaskColumnFilterDescriptor[] = [];
  for (const task of tasks) {
    const statuses = filters[task.id];
    if (!isColumnFilterActive(statuses)) continue;
    const ordered = TASK_STATUSES.filter((s) => statuses.includes(s));
    out.push({
      taskId: task.id,
      label: task.label,
      statuses: ordered,
      statusWords: ordered.map((s) => TASK_STATUS_WORDS[s]).join(", "),
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Persistence (AC-C, item 215/216)

export const CURRENT_TASK_COLUMN_FILTERS_VERSION = 1;

/** The storage key for a sub-view's column filters (item 216/239) - a pure
 * function so both TasksTab.tsx and tasksUiState.ts read/write the identical
 * string, rather than each hand-rolling its own template literal that could
 * silently diverge (REGRESSION #232 check 25's separation is otherwise
 * enforced only by a template literal with no test watching it). */
export function taskColumnFiltersKey(view: TaskView): string {
  return `ta-tasks-${view}-colfilters`;
}

/** Serializes `filters` at CURRENT_TASK_COLUMN_FILTERS_VERSION, NORMALIZING
 * on write (item 215) - an empty or complete column selection never reaches
 * localStorage in the first place, matching the "not a constraint" rule
 * everywhere else this feature applies it. */
export function serializeTaskColumnFilters(filters: TaskColumnFilters): string {
  return JSON.stringify({ v: CURRENT_TASK_COLUMN_FILTERS_VERSION, filters: normalizeTaskColumnFilters(filters) });
}

/** Parses a persisted (or hand-written - item 215) `{v, filters}` payload;
 * anything malformed - wrong version, missing/non-object `filters`, garbage
 * JSON, not even JSON - falls back to "no filters" rather than throwing.
 * Mirrors parseTaskSortState's own never-throw contract. */
export function parseTaskColumnFilters(raw: string | null | undefined): TaskColumnFilters {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (
      parsed &&
      typeof parsed === "object" &&
      !Array.isArray(parsed) &&
      (parsed as { v?: unknown }).v === CURRENT_TASK_COLUMN_FILTERS_VERSION
    ) {
      return normalizeTaskColumnFilters((parsed as { filters?: unknown }).filters);
    }
    return {};
  } catch {
    return {};
  }
}
