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

const COURSE_KEY = "ta-repo-grades-course";
const ORG_PREFIX_KEY = "ta-repo-grades-org-prefix";
const SORT_KEY = "ta-repo-grades-sort";
const SELECTED_KEY = "ta-repo-grades-selected";

export interface RepoGradesUiState {
  courseId: string;
  orgPrefix: string;
  sort: RepoGradeSortState;
}

function defaultUiState(): RepoGradesUiState {
  return { courseId: "", orgPrefix: "", sort: DEFAULT_REPO_GRADE_SORT };
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
  };
}

export function persistRepoGradesUiState(state: RepoGradesUiState): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(COURSE_KEY, state.courseId);
    localStorage.setItem(ORG_PREFIX_KEY, state.orgPrefix);
    localStorage.setItem(SORT_KEY, JSON.stringify(state.sort));
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
