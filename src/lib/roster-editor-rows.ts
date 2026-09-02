// Pure row-list state transitions shared by RosterCell's roster editor and
// StudentReposCell's student-repos editor (R1/R4). Extracted so the fix for
// R1's "a row vanishes mid-typing, a name containing | is corrupted, a
// trailing space desyncs the caret" - giving the editor its OWN row state
// instead of deriving it from the saved text on every keystroke - is
// actually exercised by a test, not just read. `rowsToRoster`/`rosterToRows`
// themselves are UNCHANGED (REGRESSION 361 pins that format); this module
// never calls either mid-edit, only the component's Save handler does, once.
export interface EditorRowBase {
  id: string;
}

/** Updates exactly one row by id, leaving every other row (and the array's
 * order/length) untouched. Never re-derives from serialized text - this is
 * the whole point of R1's fix: a row whose fields are BOTH currently blank
 * still exists in `rows` until the caller explicitly removes it, so
 * clearing a name mid-correction can never make the row disappear before
 * the new name is typed. */
export function updateEditorRow<T extends EditorRowBase>(rows: T[], id: string, patch: Partial<T>): T[] {
  return rows.map((r) => (r.id === id ? { ...r, ...patch } : r));
}

export interface RemoveEditorRowResult<T> {
  rows: T[];
  /** The row that should receive focus next (R4): the row that shifted
   * into the removed row's position, or the previous row if the last one
   * was removed, or null when no row is left (the caller then focuses
   * "Add student" instead). */
  focusRowId: string | null;
}

/** Removes the row with the given id. `id` is looked up fresh here (not
 * passed in as an index), so removal is correct even if `rows` changed
 * between when a Remove click was armed and when it was confirmed. */
export function removeEditorRow<T extends EditorRowBase>(rows: T[], id: string): RemoveEditorRowResult<T> {
  const idx = rows.findIndex((r) => r.id === id);
  if (idx === -1) return { rows, focusRowId: null };
  const next = rows.filter((r) => r.id !== id);
  const focusTarget = rows[idx + 1] ?? rows[idx - 1] ?? null;
  return { rows: next, focusRowId: focusTarget && focusTarget.id !== id ? focusTarget.id : null };
}

/** Appends one new, entirely blank row (R2: never a "New student"
 * placeholder - a blank student/username row is dropped by `rowsToRoster`'s
 * own filter only if it is STILL blank at Save, which is exactly the
 * desired behavior for a row nobody ever filled in). */
export function addEditorRow<T extends EditorRowBase>(rows: T[], newRow: T): T[] {
  return [...rows, newRow];
}
