/**
 * Per-institution row selection (LIVE-LMS-STUDENT-MESSAGING W3). The selection
 * is stored WITH the institution it was made in; reading it for any other
 * institution yields an empty set, so a switch never carries students across.
 * Pure; no React.
 */

export interface SelectionState {
  readonly institution: string;
  readonly keys: readonly string[];
}

export const NO_SELECTION: SelectionState = { institution: "", keys: [] };

/** The keys selected for `institution` (empty when the state belongs to another). */
export function selectionFor(state: SelectionState, institution: string): string[] {
  return state.institution === institution ? [...state.keys] : [];
}

/** Toggles one key in `institution`'s selection. */
export function toggleKey(state: SelectionState, institution: string, key: string): SelectionState {
  const current = selectionFor(state, institution);
  const next = current.includes(key) ? current.filter((k) => k !== key) : [...current, key];
  return { institution, keys: next };
}

/** Adds (select=true) or removes (select=false) many keys at once. */
export function setKeys(
  state: SelectionState,
  institution: string,
  keys: readonly string[],
  select: boolean
): SelectionState {
  const current = selectionFor(state, institution);
  const touched = new Set(keys);
  const next = select
    ? [...current, ...keys.filter((k) => !current.includes(k))]
    : current.filter((k) => !touched.has(k));
  return { institution, keys: next };
}
