// RG-SEARCH-STICKY Wave C: the grade-set reducer and the grade-scope decision.
// Pure, browser-safe, imports nothing. The checkbox handler and the typeahead
// both toggle through toggleRepoInGradeSet (one source of truth); every
// grade-plan site resolves its scope through resolveGradeScope so the run and
// its label can never disagree.

/** A NEW Set with `repo` added if absent, removed if present. Never mutates. */
export function toggleRepoInGradeSet(selected: ReadonlySet<string>, repo: string): Set<string> {
  const next = new Set(selected);
  if (next.has(repo)) next.delete(repo);
  else next.add(repo);
  return next;
}

export interface GradeScope {
  selectionOnly: boolean;
  scopedToSelection: boolean;
}

/**
 * F3-c: a non-empty selection scopes the grade run even with the legacy toggle
 * off; the toggle alone (nothing selected) still means the whole column, and is
 * not labelled as scoped.
 */
export function resolveGradeScope(selected: ReadonlySet<string>, bulkSelectionOnly: boolean): GradeScope {
  const selectionOnly = selected.size > 0 || bulkSelectionOnly;
  return { selectionOnly, scopedToSelection: selectionOnly && selected.size > 0 };
}
