"use client";

// localStorage persistence for the Repo Grades view's controls (AC4 item
// 24 - "every control in this view persists across reload under a ta- key,
// this is a standing project rule"). Modeled on
// src/app/components/tasks/tasksUiState.ts's load/persist pair for the
// course/org-prefix/sort trio, and on
// src/app/components/bulk-repo/hooks/useRepoSelection.ts:17 for the selected-
// repos Set, which - like that precedent - is FILTERED against currently
// valid ids on restore so a stale selection can never resurrect a repo that
// no longer appears in the current scan (AC4 item 23).
//
// Every read/write here is guarded by `typeof window` so this module is safe
// to import from server-rendered code paths, matching every other UI-state
// module in this codebase (tasksUiState.ts, useRepoSelection.ts).

import { DEFAULT_REPO_GRADE_SORT, type RepoGradeSortField, type RepoGradeSortState, type SortDirection } from "./repoGradesRows";
import type { RepoGradeAssignmentMap } from "./repoGradesAssignmentMapping";

const COURSE_KEY = "ta-repo-grades-course";
const ORG_PREFIX_KEY = "ta-repo-grades-org-prefix";
const SORT_KEY = "ta-repo-grades-sort";
const SELECTED_KEY = "ta-repo-grades-selected";
// AC5 items 25-26: the per-column-to-Canvas-assignment mapping, persisted per
// COURSE (one course's "week-1" folder means nothing to another course's
// Canvas assignment list) as a single JSON blob keyed by course id, then by
// column folder name - see loadAssignmentMapping/persistAssignmentMapping
// below. Kept as one key (not one key per course) for the same reason
// SORT_KEY/SELECTED_KEY are single keys: this view only ever has one course
// active at a time, and a single blob is simplest to reason about and to
// clear.
const ASSIGNMENT_MAP_KEY = "ta-repo-grades-assignment-map";
// AC4 items 20-21, item 24: the assignment instructions and rubric text used
// by every "Grade" call in this view (gradeRepoAction's second/third
// parameters). Deliberately a single global pair rather than per-column: the
// acceptance criteria do not call for per-assignment rubric storage, and a
// single persisted pair matches how src/lib/llm-provider.ts's `ta-llm-provider`
// already persists ONE global provider choice for grading across this whole
// app rather than per view - the same "one thing to remember" simplicity.
const INSTRUCTIONS_KEY = "ta-repo-grades-instructions";
const RUBRIC_KEY = "ta-repo-grades-rubric";

export interface RepoGradesUiState {
  courseId: string;
  orgPrefix: string;
  sort: RepoGradeSortState;
  instructions: string;
  rubric: string;
}

function defaultUiState(): RepoGradesUiState {
  return { courseId: "", orgPrefix: "", sort: DEFAULT_REPO_GRADE_SORT, instructions: "", rubric: "" };
}

function isSortField(value: unknown): value is RepoGradeSortField {
  return value === "repo" || value === "binding";
}

function isSortDirection(value: unknown): value is SortDirection {
  return value === "asc" || value === "desc";
}

/** Parses a persisted sort value, falling back to DEFAULT_REPO_GRADE_SORT for
 * anything missing, malformed JSON, or naming a field/direction that no
 * longer exists - the same "never trust stored data" posture
 * parseTaskSortState (course-tasks-view.ts) takes for the Tasks grid's own
 * persisted sort. */
function parseSort(raw: string | null): RepoGradeSortState {
  if (!raw) return DEFAULT_REPO_GRADE_SORT;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (
      parsed &&
      typeof parsed === "object" &&
      isSortField((parsed as { field?: unknown }).field) &&
      isSortDirection((parsed as { direction?: unknown }).direction)
    ) {
      return { field: (parsed as { field: RepoGradeSortField }).field, direction: (parsed as { direction: SortDirection }).direction };
    }
  } catch {
    // fall through to the default below
  }
  return DEFAULT_REPO_GRADE_SORT;
}

export function loadRepoGradesUiState(): RepoGradesUiState {
  if (typeof window === "undefined") return defaultUiState();
  return {
    courseId: localStorage.getItem(COURSE_KEY) ?? "",
    orgPrefix: localStorage.getItem(ORG_PREFIX_KEY) ?? "",
    sort: parseSort(localStorage.getItem(SORT_KEY)),
    instructions: localStorage.getItem(INSTRUCTIONS_KEY) ?? "",
    rubric: localStorage.getItem(RUBRIC_KEY) ?? "",
  };
}

export function persistRepoGradesUiState(state: RepoGradesUiState): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(COURSE_KEY, state.courseId);
    localStorage.setItem(ORG_PREFIX_KEY, state.orgPrefix);
    localStorage.setItem(SORT_KEY, JSON.stringify(state.sort));
    localStorage.setItem(INSTRUCTIONS_KEY, state.instructions);
    localStorage.setItem(RUBRIC_KEY, state.rubric);
  } catch {
    // localStorage can throw (private browsing, quota) - losing persistence
    // for one change is acceptable, crashing the tab is not. Matches
    // tasksUiState.ts's persistUiState.
  }
}

/**
 * Restores the persisted row-selection Set, filtered against `validRepoIds`
 * (AC4 item 23) - the exact precedent useRepoSelection.ts:11-22 sets for
 * bulk-repo selection: a repo id that no longer appears in the current scan
 * (a different course was chosen, the org was re-scanned and a repo was
 * renamed/removed, etc.) is silently dropped rather than resurrected as a
 * phantom selected row.
 */
export function loadSelectedRepoIds(validRepoIds: readonly string[]): Set<string> {
  if (typeof window === "undefined") return new Set();
  const stored = localStorage.getItem(SELECTED_KEY);
  if (!stored) return new Set();
  try {
    const parsed = JSON.parse(stored) as unknown;
    if (!Array.isArray(parsed)) return new Set();
    const valid = new Set(validRepoIds);
    return new Set(parsed.filter((id): id is string => typeof id === "string" && valid.has(id)));
  } catch {
    return new Set();
  }
}

export function persistSelectedRepoIds(selected: ReadonlySet<string>): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(SELECTED_KEY, JSON.stringify(Array.from(selected)));
  } catch {
    // best-effort persistence only, matching persistRepoGradesUiState above.
  }
}

// ---------------------------------------------------------------------------
// Per-course assignment mapping (AC5 items 25-26, task 1 of the wave brief).
// The raw stored blob is `Record<courseId, Record<folder, assignmentId>>`;
// loadAssignmentMapping/persistAssignmentMapping below only read/write ONE
// course's slice of it, keeping every other course's mapping untouched. The
// FILTERING (dropping a stale folder or a deleted assignment id) is a
// separate, pure, independently-tested concern - filterRepoGradeAssignmentMapping
// in repoGradesAssignmentMapping.ts - deliberately not done here, so the
// filter logic itself is testable without a fake localStorage (this module's
// own tests already stub one for the plain load/persist round-trip, matching
// this file's existing pattern for RepoGradesUiState/selection above).

function isStringRecord(value: unknown): value is Record<string, string> {
  return (
    !!value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.values(value as Record<string, unknown>).every((v) => typeof v === "string")
  );
}

function parseAssignmentMapByCourse(raw: string | null): Record<string, Record<string, string>> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const result: Record<string, Record<string, string>> = {};
    for (const [courseId, mapping] of Object.entries(parsed as Record<string, unknown>)) {
      if (isStringRecord(mapping)) result[courseId] = mapping;
    }
    return result;
  } catch {
    return {};
  }
}

/** Reads `courseId`'s slice of the persisted assignment mapping - an EMPTY
 * mapping (never null/undefined) when nothing is stored yet, when the JSON is
 * malformed, or when `courseId` is blank. The caller (index.tsx) is expected
 * to run this through filterRepoGradeAssignmentMapping before applying it to
 * the grid's columns (task 1's "FILTER it on restore"). */
export function loadAssignmentMapping(courseId: string): RepoGradeAssignmentMap {
  if (typeof window === "undefined" || !courseId) return {};
  const byCourse = parseAssignmentMapByCourse(localStorage.getItem(ASSIGNMENT_MAP_KEY));
  return byCourse[courseId] ?? {};
}

/** Writes `courseId`'s slice of the persisted assignment mapping, preserving
 * every OTHER course's slice untouched. */
export function persistAssignmentMapping(courseId: string, mapping: RepoGradeAssignmentMap): void {
  if (typeof window === "undefined" || !courseId) return;
  try {
    const byCourse = parseAssignmentMapByCourse(localStorage.getItem(ASSIGNMENT_MAP_KEY));
    byCourse[courseId] = { ...mapping };
    localStorage.setItem(ASSIGNMENT_MAP_KEY, JSON.stringify(byCourse));
  } catch {
    // best-effort persistence only, matching persistRepoGradesUiState above.
  }
}
