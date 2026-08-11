// Pure, dependency-free version arithmetic backing generated_artifacts
// (src/lib/supabase/generated-artifacts.ts). Kept in its own module, with no
// Supabase import at all, so the arithmetic that decides version numbers,
// which row is "current", and display ordering is unit-testable without a
// database - mirrors mergeStatusMap in src/lib/supabase/course-tasks.ts,
// which is pure for the same reason.

/**
 * The version number for a NEW row being saved into one course+kind: one
 * past the highest existing version, or 1 when there are none yet.
 *
 * `existingVersions` must already be scoped to the single course+kind being
 * saved - kinds do not share a counter (see saveGeneratedArtifactVersion in
 * src/lib/supabase/generated-artifacts.ts, which filters to one course+kind
 * before calling this).
 */
export function nextArtifactVersion(existingVersions: number[]): number {
  if (existingVersions.length === 0) return 1;
  return Math.max(...existingVersions) + 1;
}

export interface CurrentMarkedVersion {
  version: number;
  isCurrent: boolean;
}

/**
 * The current version among a set of rows already scoped to one course+kind:
 * the row with `isCurrent` true, or - if that invariant is ever violated by
 * corrupt or pre-constraint data - the highest version, so a caller with a
 * non-empty set never silently gets nothing back. Null for an empty set.
 */
export function pickCurrentArtifactVersion<T extends CurrentMarkedVersion>(rows: T[]): T | null {
  if (rows.length === 0) return null;
  const flaggedCurrent = rows.find((row) => row.isCurrent);
  if (flaggedCurrent) return flaggedCurrent;
  return rows.reduce((highest, row) => (row.version > highest.version ? row : highest));
}

export interface OrderableVersion {
  version: number;
}

/**
 * Newest-first ordering by version number. Returns a new array - never
 * mutates `rows` - so a caller holding onto the original list is never
 * surprised by an in-place reorder.
 */
export function sortArtifactVersionsNewestFirst<T extends OrderableVersion>(rows: T[]): T[] {
  return [...rows].sort((a, b) => b.version - a.version);
}
