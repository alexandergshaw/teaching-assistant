"use client";

// localStorage persistence for the Tasks tab's per-sub-view UI state
// (search/institution/term/outstanding-only/sort/collapsed groups - AC7 item
// 38), the density switcher, and this feature's column filters (AC-C item
// 216). Moved out of TasksTab.tsx (implementation plan step 2) purely to
// keep that file under the repo's 1000-line cap as this feature adds new
// wiring to it - loadUiState/persistUiState/loadDensity are UNCHANGED from
// their original TasksTab.tsx bodies, not rewritten.
import { ALL_FILTER, DEFAULT_TASK_SORT, parseTaskColumnFilters, parseTaskSortState, serializeTaskColumnFilters, taskColumnFiltersKey, type TaskColumnFilters, type TaskSortState } from "@/lib/course-tasks-view";
import type { TaskGroupId } from "@/lib/course-tasks";
import type { TasksView } from "../../url-state";
import type { Density } from "./TasksGrid";

export interface TaskViewUiState {
  search: string;
  institution: string;
  term: string;
  outstandingOnly: boolean;
  sort: TaskSortState;
  collapsedGroups: TaskGroupId[];
}

function defaultUiState(): TaskViewUiState {
  return {
    search: "",
    institution: ALL_FILTER,
    term: ALL_FILTER,
    outstandingOnly: false,
    sort: DEFAULT_TASK_SORT,
    collapsedGroups: [],
  };
}

export function loadUiState(view: TasksView): TaskViewUiState {
  if (typeof window === "undefined") return defaultUiState();
  const prefix = `ta-tasks-${view}-`;
  let collapsedGroups: TaskGroupId[] = [];
  try {
    const parsed = JSON.parse(localStorage.getItem(`${prefix}collapsed`) ?? "[]") as unknown;
    if (Array.isArray(parsed)) collapsedGroups = parsed.filter((x): x is TaskGroupId => typeof x === "string");
  } catch {
    collapsedGroups = [];
  }
  return {
    search: localStorage.getItem(`${prefix}search`) ?? "",
    institution: localStorage.getItem(`${prefix}institution`) ?? ALL_FILTER,
    term: localStorage.getItem(`${prefix}term`) ?? ALL_FILTER,
    outstandingOnly: localStorage.getItem(`${prefix}outstanding`) === "true",
    sort: parseTaskSortState(localStorage.getItem(`${prefix}sort`)),
    collapsedGroups,
  };
}

export function persistUiState(view: TasksView, state: TaskViewUiState) {
  if (typeof window === "undefined") return;
  const prefix = `ta-tasks-${view}-`;
  try {
    localStorage.setItem(`${prefix}search`, state.search);
    localStorage.setItem(`${prefix}institution`, state.institution);
    localStorage.setItem(`${prefix}term`, state.term);
    localStorage.setItem(`${prefix}outstanding`, String(state.outstandingOnly));
    localStorage.setItem(`${prefix}sort`, JSON.stringify(state.sort));
    localStorage.setItem(`${prefix}collapsed`, JSON.stringify(state.collapsedGroups));
  } catch {
    // localStorage can throw (private browsing, quota) - losing persistence
    // for one change is acceptable, crashing the tab is not.
  }
}

const VALID_DENSITIES: Density[] = ["compact", "default", "comfortable"];

export function loadDensity(): Density {
  if (typeof window === "undefined") return "default";
  const stored = localStorage.getItem("ta-tasks-density");
  return (VALID_DENSITIES as string[]).includes(stored ?? "") ? (stored as Density) : "default";
}

// ---------------------------------------------------------------------------
// Column filters (AC-C item 216/217, new in this feature) - separate storage
// per sub-view via the pure taskColumnFiltersKey(view) builder in
// course-tasks-view.ts, exactly like every other per-sub-view control above.
// The key is NOT a template literal here (REGRESSION #232 check 25's
// separation would otherwise be enforced only by a string in this file that
// nothing watches - see taskColumnFiltersKey's own comment).

export function loadTaskColumnFilters(view: TasksView): TaskColumnFilters {
  if (typeof window === "undefined") return {};
  return parseTaskColumnFilters(localStorage.getItem(taskColumnFiltersKey(view)));
}

export function persistTaskColumnFilters(view: TasksView, filters: TaskColumnFilters) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(taskColumnFiltersKey(view), serializeTaskColumnFilters(filters));
  } catch {
    // best-effort persistence only, matching persistUiState above.
  }
}
