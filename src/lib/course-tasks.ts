// Pure domain model for the Tasks tab's per-cell state: the task/status
// vocabulary, defensive coercion of the untrusted course_tasks.statuses
// jsonb column, the cell-editing operations, and the period-scoped
// "is this done RIGHT NOW" predicates AC14 needs for the Daily/Weekly view.
//
// This file deliberately does NOT know about the catalog (see
// ./course-tasks-catalog.ts for the built-in task data and
// ./course-tasks-view.ts for catalog resolution/filtering/sorting/CSV) - it
// operates purely on task ids as strings and TaskCellMap as a plain
// key-value store, so it has no dependency on which tasks exist. That keeps
// this module reusable for both the Term Setup and Daily/Weekly views (they
// share one status map - AC14 item 71) without a cyclic import back to the
// catalog.
//
// No Date.now(), no Math.random(), no crypto.randomUUID() anywhere here -
// every time-dependent function takes `nowMs` from its caller, matching
// every existing pure module in this repo (see weekly-checklist.ts's own
// header comment) and making every test in course-tasks.test.ts
// deterministic.
//
// This module is CLIENT-SAFE: no import of "@/lib/supabase/server",
// "next/headers", or anything that transitively reaches them.

import { isSameLocalDay, isSameLocalWeek } from "./weekly-checklist";

// ---------------------------------------------------------------------------
// Task definitions (the shape course-tasks-catalog.ts's data conforms to)

/** "once" for every Term Setup task (persists forever, like today's checked
 * state); "daily"/"weekly" for a Daily/Weekly task (period-scoped - see
 * isTaskDoneNow below). Cadence lives on the TASK, never on the cell -
 * AC14 item 73. */
export type TaskCadence = "once" | "daily" | "weekly";

/** Which sub-view (AC1 item 3) a task or group belongs to. */
export type TaskView = "term" | "recurring";

/** The four groups the two views need (AC3/AC14): "dependent"/"independent"
 * belong to the "term" view, "daily"/"weekly" belong to the "recurring"
 * view. A task's group always belongs to its own view - see
 * course-tasks.test.ts's "puts every task in a group that belongs to that
 * task's own view". */
export type TaskGroupId = "dependent" | "independent" | "daily" | "weekly";

export interface TaskGroupDefinition {
  id: TaskGroupId;
  label: string;
  view: TaskView;
}

export interface TaskDefinition {
  /** Stable, persisted key into TaskCellMap. Never changes once shipped
   * (AC3 item 14) - a relabel keeps the id. */
  id: string;
  label: string;
  view: TaskView;
  group: TaskGroupId;
  cadence: TaskCadence;
  /** True for every task in course-tasks-catalog.ts; false for a per-user
   * custom task (AC9) - see resolveTaskCatalog in course-tasks-view.ts. */
  builtIn: boolean;
}

// ---------------------------------------------------------------------------
// Status vocabulary (AC4)

export const TASK_STATUSES = ["open", "done", "blocked", "na"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export function isTaskStatus(value: unknown): value is TaskStatus {
  return typeof value === "string" && (TASK_STATUSES as readonly string[]).includes(value);
}

/** open -> done -> blocked -> na -> open. Pinned by a unit test (AC5 item
 * 26) since this is also the keyboard `Enter`/`Space` cycle order. */
export function nextTaskStatus(status: TaskStatus): TaskStatus {
  const index = TASK_STATUSES.indexOf(status);
  return TASK_STATUSES[(index + 1) % TASK_STATUSES.length];
}

// Matches WEEKLY_CHECKLIST_MAX_LABEL_LENGTH's rationale in
// weekly-checklist.ts: long enough for a real note, short enough to stay
// scannable in a dense table cell.
export const TASK_NOTE_MAX_LENGTH = 200;

export interface TaskCell {
  status: TaskStatus;
  /** Free text, independent of status (AC4 item 20) - a cell may be `open`
   * with a note ("waiting on the dean"), or `done` with a note
   * ("Sharepoint"). Max TASK_NOTE_MAX_LENGTH after trim. */
  note: string;
  /** Epoch ms of the most recent transition INTO `done`; null whenever
   * status is not `done`. Mirrors WeeklyChecklistItem.checkedAt exactly -
   * this is what makes the period-scoped completion below possible. */
  doneAt: number | null;
}

export type TaskCellMap = Record<string, TaskCell>;

/** What an unstored task reads back as (AC4 item 21): absence and `open`
 * are the same thing. Frozen so a caller mutating what taskCellAt hands back
 * for a missing key cannot corrupt this shared constant (course-tasks.test.ts
 * "does not let a caller corrupt the map through the cell it returns"). */
export const EMPTY_TASK_CELL: TaskCell = Object.freeze({
  status: "open",
  note: "",
  doneAt: null,
} as TaskCell);

export function isEmptyTaskCell(cell: TaskCell): boolean {
  return cell.status === "open" && cell.note === "" && cell.doneAt === null;
}

/** Read one task's cell out of a map, defaulting to EMPTY_TASK_CELL for a
 * task with no stored entry - the map itself is never consulted for
 * "has this key" beyond a plain lookup, so an absent key and a key
 * explicitly stored as `open`/unnoted/undated are indistinguishable, by
 * design (AC4 item 21). */
export function taskCellAt(map: TaskCellMap, taskId: string): TaskCell {
  return map[taskId] ?? EMPTY_TASK_CELL;
}

// ---------------------------------------------------------------------------
// Defensive coercion of the untrusted course_tasks.statuses jsonb column
//
// Mirrors coerceWeeklyChecklist in weekly-checklist.ts: unknown in, a
// concrete TaskCellMap out, never throws, drop garbage entries rather than
// defaulting them, build fresh objects rather than spreading raw input, and
// re-force the status/doneAt invariant on every read regardless of what the
// payload claims.

/** A finite number, or null for anything else (missing, wrong type, NaN,
 * Infinity, a numeric STRING) - mirrors coerceCheckedAt in
 * weekly-checklist.ts exactly. Never uses truthiness (a doneAt of 0 is a
 * legitimate finite timestamp - see course-tasks.test.ts). */
function coerceDoneAtRaw(raw: unknown): number | null {
  return typeof raw === "number" && Number.isFinite(raw) ? raw : null;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Defensive coercion for the course_tasks.statuses jsonb column (or any
 * other untrusted source - a hand-edited row, a paste/import payload): never
 * throws.
 * - Non-plain-object input (null, undefined, an array, a primitive) -> {}.
 * - A blank or whitespace-only key is dropped.
 * - A value that is not a plain object is dropped.
 * - status falls back to "open" for anything not in TASK_STATUSES, rather
 *   than dropping the whole entry - a garbage status with a real note must
 *   not silently discard that note (AC4 item 22).
 * - note is kept only when it is a string, trimmed and capped at
 *   TASK_NOTE_MAX_LENGTH; a non-string note becomes "" rather than being
 *   stringified.
 * - doneAt is forced to null whenever the (already-coerced) status is not
 *   "done", regardless of what the raw payload says - this is the same
 *   defensive re-forcing coerceWeeklyChecklist applies to checked/checkedAt.
 *   When status IS "done", doneAt is coerced via coerceDoneAtRaw.
 * - An entry that coerces down to an empty cell (open, unnoted, undated) is
 *   DROPPED rather than stored - absence and `open` are the same thing
 *   (AC4 item 21), so keeping it would just be a wasted key.
 * - `knownIds`, when supplied, drops any entry whose key is not in it. This
 *   is deliberately OPTIONAL and used ONLY on an import/paste validation
 *   path (parseSheetCellValue's callers) - amendment 120 is explicit that
 *   the read-render-save path must NEVER filter by the resolved catalog's
 *   ids, because the resolved catalog excludes a RETIRED task (AC9 item 46
 *   says its history must survive retirement) and filtering on read would
 *   silently drop that history the next time the row is saved. Every normal
 *   render/save call (see mergeTaskCellEntries) omits this argument.
 * - Output is built on Object.create(null), never a bare `{}` literal: the
 *   payload is untrusted jsonb, and writing `out[key] = ...` into an
 *   ordinary object lets a `__proto__` key reach Object.prototype (a real
 *   prototype-pollution vector, not a theoretical one - see the dedicated
 *   unit test). A null-prototype object has no inherited `__proto__` setter
 *   to hijack, so the same bracket-assignment code is safe either way.
 */
export function coerceTaskCellMap(raw: unknown, knownIds?: Set<string>): TaskCellMap {
  if (!isPlainObject(raw)) return Object.create(null) as TaskCellMap;

  const out: TaskCellMap = Object.create(null) as TaskCellMap;
  for (const key of Object.keys(raw)) {
    if (key.trim() === "") continue;
    if (knownIds && !knownIds.has(key)) continue;

    const value = raw[key];
    if (!isPlainObject(value)) continue;

    const status = isTaskStatus(value.status) ? value.status : "open";
    const note = typeof value.note === "string" ? value.note.trim().slice(0, TASK_NOTE_MAX_LENGTH) : "";
    const doneAt = status === "done" ? coerceDoneAtRaw(value.doneAt) : null;

    const cell: TaskCell = { status, note, doneAt };
    if (isEmptyTaskCell(cell)) continue;

    out[key] = cell;
  }
  return out;
}

// ---------------------------------------------------------------------------
// The spreadsheet's own vocabulary (AC4 item 24, import/paste path only)

const SHEET_DONE_TOKENS = new Set(["y", "yes"]);
const SHEET_BLOCKED_TOKENS = new Set(["n", "no"]);
// JUDGEMENT CALL (amendment 119), recorded so it is not mistaken for a fact:
// the real workbook contains ZERO plain "N" values across its 40 task
// columns (the tally is Y 260, N/A 122, n/a 6, N/N 1, plus free text). The
// lone "N/N" sits in column F beside 122 "N/A" values, so it reads far more
// plausibly as a mistyped "N/A" than a deliberate "no" - hence it maps to
// "na" here, not "blocked". "N"/"No" still map to "blocked" above for data
// typed in the future, where a plain "N" is far more likely to mean it.
const SHEET_NA_TOKENS = new Set(["n/a", "na", "n/n"]);

/**
 * Parses one raw spreadsheet cell value into a TaskCell, for the Term Setup
 * import/paste path only (amendment 123) - never for a "daily"/"weekly"
 * cadence task, because every result here stamps `doneAt: null` even for a
 * `done` status, and AC14 item 74 reads a null `doneAt` on a `done` cell as
 * NEVER-EXPIRING. Importing sheet values into a recurring task would
 * therefore produce a tick that never resets; callers must reject a
 * non-"once" cadence at the call site (or re-stamp doneAt themselves via
 * setTaskCellStatus) rather than route recurring-task input through this
 * function.
 *
 * - Y/y/Yes (any casing/whitespace) -> done.
 * - N/n/No (any casing) -> blocked.
 * - N/A/n/a/NA/na, and the sheet's one N/N typo -> na (see SHEET_NA_TOKENS's
 *   comment above).
 * - blank, whitespace-only, or a non-string -> EMPTY_TASK_CELL (open).
 * - anything else (free text, e.g. "Talk with lead", "Sharepoint") -> done,
 *   with the trimmed (and note-cap-truncated) text carried as the note -
 *   this is the sheet's real behavior: a free-text answer in a Y/N column
 *   means the question has been answered, and the answer is the text.
 */
export function parseSheetCellValue(raw: unknown): TaskCell {
  if (typeof raw !== "string") return EMPTY_TASK_CELL;
  const trimmed = raw.trim();
  if (trimmed === "") return EMPTY_TASK_CELL;

  const lower = trimmed.toLowerCase();
  if (SHEET_DONE_TOKENS.has(lower)) return { status: "done", note: "", doneAt: null };
  if (SHEET_BLOCKED_TOKENS.has(lower)) return { status: "blocked", note: "", doneAt: null };
  if (SHEET_NA_TOKENS.has(lower)) return { status: "na", note: "", doneAt: null };

  return { status: "done", note: trimmed.slice(0, TASK_NOTE_MAX_LENGTH), doneAt: null };
}

// ---------------------------------------------------------------------------
// Editing a cell (AC5)

/** Sets a cell's status, stamping/clearing doneAt in the same step so it can
 * never drift out of sync: becoming "done" stamps `nowMs` (even if the cell
 * was already done - re-stamping on a later "done -> done" transition is
 * deliberate, see the unit test), any other status clears doneAt to null.
 * The note is carried across unchanged (AC4 item 20 - status and note are
 * independent). Never mutates `cell`. */
export function setTaskCellStatus(cell: TaskCell, status: TaskStatus, nowMs: number): TaskCell {
  return { status, note: cell.note, doneAt: status === "done" ? nowMs : null };
}

/** Sets a cell's note (trimmed, capped at TASK_NOTE_MAX_LENGTH), leaving
 * status/doneAt untouched. Never mutates `cell`. */
export function setTaskCellNote(cell: TaskCell, note: string): TaskCell {
  return { ...cell, note: note.trim().slice(0, TASK_NOTE_MAX_LENGTH) };
}

/**
 * Writes `cell` into `map` under `taskId`, EXCEPT that an empty cell
 * (isEmptyTaskCell) is deleted from the map rather than stored (AC4 item
 * 21 - an open, unnoted, undated cell is absence, so storing it would just
 * be a wasted key that grows the payload for no benefit). Returns a new map;
 * never mutates `map`.
 */
export function applyTaskCell(map: TaskCellMap, taskId: string, cell: TaskCell): TaskCellMap {
  const next: TaskCellMap = { ...map };
  if (isEmptyTaskCell(cell)) {
    delete next[taskId];
  } else {
    next[taskId] = cell;
  }
  return next;
}

/**
 * The server-side per-key merge (AC5 item 29): applies `patch` (a small set
 * of changed task ids, each mapped to its new cell or to `null` to delete)
 * on top of `current`, the freshly-READ stored map - never a whole-map
 * replace built from stale client state, which is what would let two
 * concurrent edits to different cells of the same course clobber each
 * other.
 *
 * `current` is run through coerceTaskCellMap FIRST (with no `knownIds`
 * filter - amendment 120: this is the read-render-save path, and filtering
 * by known ids here would silently drop a retired task's history on the
 * very next save), so a corrupted stored row can never survive a write:
 * whatever garbage might be sitting in the column, the merge always starts
 * from a well-formed map.
 *
 * A patch value of `null`, or an EMPTY_TASK_CELL-equivalent cell, deletes
 * that key - matching applyTaskCell's own "absence is open" rule. Never
 * mutates `current`.
 */
export function mergeTaskCellEntries(
  current: TaskCellMap,
  patch: Record<string, TaskCell | null>
): TaskCellMap {
  const out: TaskCellMap = { ...coerceTaskCellMap(current) };
  for (const [key, cell] of Object.entries(patch)) {
    if (cell === null || isEmptyTaskCell(cell)) {
      delete out[key];
    } else {
      out[key] = cell;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Period-scoped completion (AC14) - answered at READ time, never by mutation
//
// This mirrors isChecklistItemCheckedNow in weekly-checklist.ts exactly, and
// that function's own header comment is the precedent this follows: a
// DAILY or WEEKLY task's completion applies to the CURRENT PERIOD only,
// reverting to "open" once the calendar day/week rolls over, while a "once"
// (Term Setup) task's completion is unchanged and stays persistent. Nothing
// here ever mutates a stored cell to make it look open again - the very
// next call with a later `nowMs` simply answers differently.
//
// `blocked` and `na` are deliberately NOT period-scoped (amendment 130) -
// only `done` ever expires. A block is a statement about the world ("the
// dean has not sent the template"), not about today's effort, and it does
// not stop being true at midnight; auto-clearing it would silently discard
// the one signal the instructor deliberately raised. Same for `na`: a task
// that does not apply to this course does not un-not-apply at midnight
// either. effectiveTaskStatus below returns both unchanged, for every
// cadence.

/** Whether `cell` currently reads as "done", given its task's `cadence` and
 * the caller-supplied `nowMs`. A `doneAt` of null on a `done` cell (a legacy
 * or hand-edited row with no period to compare against) reads as
 * done-and-never-expiring, for every cadence - exactly
 * isChecklistItemCheckedNow's own documented decision: silently unchecking
 * it would look like data loss, not a feature. */
export function isTaskDoneNow(cell: TaskCell, cadence: TaskCadence, nowMs: number): boolean {
  if (cell.status !== "done") return false;
  if (cell.doneAt == null) return true;
  if (cadence === "daily") return isSameLocalDay(cell.doneAt, nowMs);
  if (cadence === "weekly") return isSameLocalWeek(cell.doneAt, nowMs);
  return true; // "once": persistent, exactly like today's Term Setup behavior.
}

/**
 * The status a caller should DISPLAY or COUNT, given the cell's raw stored
 * status, its task's cadence, and `nowMs`. For any status other than
 * "done" this is simply the raw status unchanged (blocked/na/open are never
 * period-scoped - see this section's header comment). For "done" it defers
 * to isTaskDoneNow: an expired daily/weekly completion reads back as "open",
 * never as some other status, so an expired cell falls back into the
 * ordinary open/outstanding bucket rather than needing a fifth status.
 */
export function effectiveTaskStatus(cell: TaskCell, cadence: TaskCadence, nowMs: number): TaskStatus {
  if (cell.status !== "done") return cell.status;
  return isTaskDoneNow(cell, cadence, nowMs) ? "done" : "open";
}

/** True for "open" or "blocked" (effective, period-scoped) - the two
 * statuses that still need the instructor's attention. "na" and an
 * (effectively) "done" cell are not outstanding. */
export function isTaskOutstanding(cell: TaskCell, cadence: TaskCadence, nowMs: number): boolean {
  const status = effectiveTaskStatus(cell, cadence, nowMs);
  return status === "open" || status === "blocked";
}
