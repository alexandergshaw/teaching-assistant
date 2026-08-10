// Pure, I/O-free resolution of per-(institution, task) instruction text for
// the Tasks tab
// (docs/task-institution-instructions-acceptance-criteria.md, AC2/AC3). No
// imports beyond this file's own types, no Date.now(), no randomness, no
// Supabase - mirrors every other pure domain module in this repo (see
// course-tasks.ts's own header comment for the same discipline).
//
// THE DEFECT THIS MODULE EXISTS TO PREVENT (AC2 item 6): the two existing
// institution stores in this codebase normalize institution casing
// differently on write.
//   - institution_pages uppercases on write via normalizeInstitution
//     (src/lib/knowledge-base.ts:41-43), applied in every action.
//   - course_hub.institution does NOT uppercase - clean()
//     (inside toRow, src/lib/supabase/courses.row.ts:162-165) only trims and
//     maps "" to null. The asymmetry is called out in
//     countCoursesByInstitution's own comment
//     (src/lib/supabase/courses.ts:129-139), which is exactly why that
//     function filters in JS instead of with .eq().
// A course tile saved as "mcc" and an instruction saved as "MCC" would
// therefore never join under a raw string comparison, and the cell would
// silently show no instruction - no error, no warning, nothing to notice.
// The fix: ONE exported function, taskInstructionKey, owns the comparison,
// and BOTH the write path (src/lib/supabase/task-institution-instructions.ts)
// and the read path (buildTaskInstructionMap / resolveTaskInstruction below)
// normalize through it before anything is compared or looked up. Nothing
// anywhere in this feature compares raw institution strings -
// taskInstructionMapKey is the ONLY place the composite lookup key is ever
// assembled; never build it inline at a call site.

/**
 * Normalizes an institution value for BOTH storage and lookup:
 * trim().toUpperCase(), with null/undefined/blank/whitespace-only all
 * collapsing to "". Matches normalizeInstitution
 * (src/lib/knowledge-base.ts:41-43) exactly and on purpose - the two
 * existing institution stores disagree on casing (see this file's header
 * comment), and institution_pages' own normalizer is the one this feature
 * adopts, so a user who has already typed an institution acronym anywhere
 * else in the app gets the same normalized identity here.
 *
 * "" is deliberately never treated as a real institution: a course with a
 * blank/null institution has no institution-scoped instruction (AC2 item 8,
 * A4) - it is not an error and not "the empty-string institution's
 * instruction".
 */
export function taskInstructionKey(institution: string | null | undefined): string {
  return (institution ?? "").trim().toUpperCase();
}

/** One instruction row as read from storage. `institution` and `taskId` are
 * carried as-is here - normalization only ever happens at the point of
 * comparison, via taskInstructionKey / taskInstructionMapKey, never by
 * mutating a row in place before it reaches this shape. */
export interface TaskInstruction {
  institution: string;
  taskId: string;
  body: string;
}

/** key -> trimmed, non-blank instruction body. Keyed by
 * taskInstructionMapKey - see that function for the exact key shape. Never
 * build this key inline at a call site (AC2 item 7). */
export type TaskInstructionMap = Record<string, string>;

/**
 * The ONLY place the composite (institution, task) lookup key is ever
 * assembled (AC3 item 11). Space-separated: a task id is a stable catalog
 * key (src/lib/course-tasks-catalog.ts) that never itself contains
 * whitespace, so joining `${normalizedInstitution} ${taskId}` cannot
 * collide two distinct (institution, taskId) pairs onto the same string.
 * `institution` is normalized through taskInstructionKey first, so
 * "mcc"/"MCC"/" Mcc " all produce the identical key - this is what makes
 * both A3 (one store serves Term and Recurring, since task ids are unique
 * across both catalogs) and AC2's casing fix hold at once.
 */
export function taskInstructionMapKey(institution: string | null | undefined, taskId: string): string {
  return `${taskInstructionKey(institution)} ${taskId}`;
}

/**
 * Builds a lookup map from a flat list of instruction rows (as read from
 * storage, once per Tasks tab mount - AC3 item 12). A row whose normalized
 * institution is "" is dropped rather than indexed (AC2 item 8 - a blank
 * institution is never a lookup key; the storage layer also refuses to
 * write such a row in the first place, but this function stays defensive
 * rather than trusting that invariant blindly, since `rows` could in
 * principle come from anywhere). A blank or whitespace-only body is also
 * dropped (AC3 item 13 - a missing instruction, a blank instruction, and a
 * whitespace-only instruction are all "no instruction"; trim on write AND
 * on read).
 */
export function buildTaskInstructionMap(rows: TaskInstruction[]): TaskInstructionMap {
  const map: TaskInstructionMap = {};
  for (const row of rows) {
    if (taskInstructionKey(row.institution) === "") continue;
    const body = row.body.trim();
    if (body === "") continue;
    map[taskInstructionMapKey(row.institution, row.taskId)] = body;
  }
  return map;
}

/**
 * Resolves the instruction text for one (course institution, task) pair.
 * Returns "" when there is no match: a missing row, a course whose
 * institution is null/undefined/blank (AC4 item 14, A4 - not an error, just
 * no instruction), or a stored-but-blank body (which buildTaskInstructionMap
 * would already have excluded, so this is belt-and-suspenders rather than
 * the primary defense).
 *
 * The blank-institution short-circuit at the top is deliberate rather than
 * relying solely on the map lookup missing: it makes explicit that "" is
 * NEVER a lookup key, matching AC2 item 8 exactly, and it means this
 * function never even has to trust that buildTaskInstructionMap was the one
 * that produced `map`.
 */
export function resolveTaskInstruction(
  map: TaskInstructionMap,
  institution: string | null | undefined,
  taskId: string
): string {
  if (taskInstructionKey(institution) === "") return "";
  return map[taskInstructionMapKey(institution, taskId)] ?? "";
}

/**
 * Max length of an instruction body, enforced on write (the storage layer,
 * src/lib/supabase/task-institution-instructions.ts) AND on input (a later
 * UI wave), matching how TASK_NOTE_MAX_LENGTH is applied in both places for
 * the per-cell note (course-tasks.ts:287, TaskCell.tsx:452).
 *
 * Larger than TASK_NOTE_MAX_LENGTH's 200 (course-tasks.ts:105) on purpose:
 * a note is a per-course scratch remark, while an instruction is standing,
 * shared guidance for an entire institution, read by every course in that
 * column - realistically a short paragraph ("submit final grades via the
 * department Sharepoint by the Friday before finals; CC the program
 * coordinator"), not a phrase. 1000 is double RUN_DETAIL_MAX_CHARS
 * (src/lib/workflows/run-detail.ts:28), this codebase's existing cap for a
 * different free-form "human-readable text" field - doubled because
 * standing multi-sentence guidance naturally runs longer than a one-line
 * status blurb, while staying far short of any real jsonb/text column
 * limit.
 */
export const TASK_INSTRUCTION_MAX_LENGTH = 1000;
