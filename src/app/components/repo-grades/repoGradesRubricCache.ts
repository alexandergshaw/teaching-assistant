// Repo Grades rubric picker - the per-column resolution cache for the
// `assignment` source (docs/repo-grades-rubric-picker-acceptance-criteria.md
// item 10, extracted into its own pure module per item 54: "the
// cross-column-leak bug ... is only unit-testable if the key derivation and
// the read/write are pure functions rather than logic buried in a hook").
//
// Background: when the rubric source is `assignment`, the effective rubric
// for a column is resolved by a network call
// (fetchCanvasMetaAction(...).rubricText - item 9) keyed off that column's
// own `assignmentId`. Grading a 30-repo column must make ONE such call, not
// thirty (item 10), and a column's resolved rubric must never leak into a
// DIFFERENT column (a different assignment id) or survive a course switch
// (item 10: "dropped on a course switch, matching how columnPosting and
// cellEdits already reset").
//
// This module owns none of that state itself - it is pure, no I/O, no clock,
// no randomness, no server-only imports. The client hook
// (useRepoGradesRubricSource.ts, outside this file set) holds the actual
// `useRef<RepoGradeRubricCacheStore>` and calls the functions below to read
// and write it; keeping the key derivation and the read/write/drop logic
// here, as plain functions over a Map the caller passes in, is what makes the
// leak scenarios below unit-testable without mounting a component (this repo's
// vitest config is node-env and collects only src/**/*.test.ts - see
// repoGradesAssignmentSources.ts's header for the same constraint driving the
// same "decide" module split).

/**
 * One column's resolved rubric, or the reason it could not be resolved.
 *
 * Deliberately a two-status union rather than a single `rubricText: string`
 * field: item 13 requires that a lookup FAILURE never blocks grading (it
 * degrades to an empty rubric, and the reason is reported), which means a
 * cache entry must be able to say "I tried, and here is why it didn't work"
 * as something distinguishable from "I tried, and the assignment genuinely
 * has no rubric attached" (`status: "resolved"`, `rubricText: ""` - a real,
 * legitimate outcome, not an error). Collapsing "resolved empty" and "failed"
 * into one shape would make a failed lookup indistinguishable from a
 * genuinely rubric-less assignment, which is exactly the kind of cache bug
 * this module exists to make unit-testable.
 */
export type RepoGradeRubricResolution =
  | { status: "resolved"; rubricText: string }
  | { status: "failed"; reason: string };

/**
 * One cached record. `courseId` rides alongside the resolution (not just
 * inside the Map key) so dropRepoGradeRubricCacheForOtherCourses below can
 * decide what to evict without re-parsing the key string.
 */
interface RepoGradeRubricCacheRecord {
  courseId: string;
  resolution: RepoGradeRubricResolution;
}

/**
 * The plain Map-like store this module reads and writes. The hook owns the
 * actual instance (a `useRef<RepoGradeRubricCacheStore>`); this module never
 * allocates or holds one itself, which is what "no I/O" means here - a Map
 * held in memory by the caller is a data structure, not a side effect.
 */
export type RepoGradeRubricCacheStore = Map<string, RepoGradeRubricCacheRecord>;

/** Convenience for a caller that wants a fresh, empty store - equivalent to
 * `new Map()`, provided so callers don't need to know the store is a Map at
 * all (only that it round-trips through this module's functions). */
export function createRepoGradeRubricCacheStore(): RepoGradeRubricCacheStore {
  return new Map();
}

/**
 * Derives the cache key for one column's resolved rubric.
 *
 * Item 10: "keyed by courseId + assignmentId". A naive concatenation
 * (`courseId + assignmentId` or even `${courseId}-${assignmentId}`) can
 * collide across a course/assignment id boundary - courseId "1" +
 * assignmentId "23" and courseId "12" + assignmentId "3" both naively
 * concatenate to "123" - which would be exactly the cross-column leak this
 * cache exists to prevent, just one boundary over. `JSON.stringify` of a
 * two-element tuple keeps the two ids unambiguous regardless of their
 * content, with no separator character to choose or get wrong.
 *
 * Pure: same input always produces the same output string, no mutation, no
 * clock, no randomness.
 */
export function repoGradeRubricCacheKey(courseId: string, assignmentId: string): string {
  return JSON.stringify([courseId, assignmentId]);
}

/**
 * Reads a column's cached resolution.
 *
 * Returns `undefined` for "not resolved yet" - the third state alongside
 * `RepoGradeRubricResolution`'s two - so a caller can tell "never looked this
 * up" apart from "looked it up and got an empty rubric" and knows whether a
 * network call is still owed. This is the distinction item 10's "make ONE
 * call, not thirty" depends on: only `undefined` should trigger a fetch.
 */
export function readRepoGradeRubricCacheEntry(
  store: RepoGradeRubricCacheStore,
  courseId: string,
  assignmentId: string
): RepoGradeRubricResolution | undefined {
  return store.get(repoGradeRubricCacheKey(courseId, assignmentId))?.resolution;
}

/**
 * Writes a column's resolution into the store, keyed by courseId +
 * assignmentId. `courseId` is taken as this function's own parameter (not
 * read off `resolution`) so the record's `courseId` can never drift from the
 * key it was written under - the two are derived from the same call.
 */
export function writeRepoGradeRubricCacheEntry(
  store: RepoGradeRubricCacheStore,
  courseId: string,
  assignmentId: string,
  resolution: RepoGradeRubricResolution
): void {
  store.set(repoGradeRubricCacheKey(courseId, assignmentId), { courseId, resolution });
}

/**
 * Drops every cached entry that does NOT belong to `currentCourseId` -
 * item 10's "dropped on a course switch, matching how columnPosting and
 * cellEdits already reset". Filtering by the record's own `courseId` field
 * (rather than, say, clearing the whole store unconditionally) is what makes
 * the guarantee testable as "removes exactly the right entries and leaves
 * nothing behind": entries for the course being left are gone, and entries
 * for the course being entered (there should never legitimately be any yet,
 * but a test can plant one) are left untouched.
 */
export function dropRepoGradeRubricCacheForOtherCourses(store: RepoGradeRubricCacheStore, currentCourseId: string): void {
  for (const [key, record] of store) {
    if (record.courseId !== currentCourseId) store.delete(key);
  }
}

/** Constructs a successful resolution - the "resolved" half of
 * RepoGradeRubricResolution, including the legitimate "resolved to empty"
 * case (an assignment with no attached rubric) when `rubricText` is `""`. */
export function resolvedRubric(rubricText: string): RepoGradeRubricResolution {
  return { status: "resolved", rubricText };
}

/** Constructs a failed resolution (item 13: a lookup failure never blocks
 * grading - the caller degrades to an empty effective rubric and reports
 * `reason`, but the CACHE still remembers the failure distinctly so a second
 * column-wide grade run does not repeat the failing call for every repo). */
export function failedRubricLookup(reason: string): RepoGradeRubricResolution {
  return { status: "failed", reason };
}
