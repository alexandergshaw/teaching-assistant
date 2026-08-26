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
import { parseRepoGradeLogEntries, type RepoGradeLogEntry } from "./repoGradesLog";

const COURSE_KEY = "ta-repo-grades-course";
const ORG_PREFIX_KEY = "ta-repo-grades-org-prefix";
const SORT_KEY = "ta-repo-grades-sort";
const SELECTED_KEY = "ta-repo-grades-selected";
// The Canvas assignment chosen in the "Link GitHub usernames" panel -
// standing project rule (every control in this view persists across reload
// under a ta- key), same as COURSE_KEY/ORG_PREFIX_KEY above.
const LINK_ASSIGNMENT_KEY = "ta-repo-grades-link-assignment";
// Which of the two "Link GitHub usernames" sources is showing (the course
// table roster, or a live Canvas assignment's submissions) - standing
// project rule (every control in this view persists across reload under a
// ta- key), same as LINK_ASSIGNMENT_KEY above. Follow-up to the wave that
// added LinkUsernamesPanel.tsx: that file's own header comment records this
// control was local useState only because this file was outside that
// implementer's file set.
const LINK_SOURCE_KEY = "ta-repo-grades-link-source";
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
// The instructor's own framing of the bulk-grading request this key exists
// for: "I should just be able to grade what's in a selected assignment dir
// against the readme instructions ... without needing to associate these to
// students." Defaults to true - the instructor's whole complaint is having
// to type instructions that are already sitting in the folder, so the
// control should start in the state that avoids that friction rather than
// requiring an opt-in on every course. gradeRepoAction's new
// useReadmeInstructions parameter is what this flag ultimately feeds.
const README_INSTRUCTIONS_KEY = "ta-repo-grades-readme-instructions";
// Whether a "grade this whole column" bulk run is scoped to the checked rows
// only, or (default false) the whole column regardless of what happens to be
// checked - repoGradesBulkGrade.ts's buildBulkGradePlan header comment
// documents why those two are deliberately different even when they happen
// to produce the same target list.
const BULK_SELECTION_ONLY_KEY = "ta-repo-grades-bulk-selection-only";
// L3 (docs/repo-grades-activity-log-acceptance-criteria.md): the activity
// log, stored per COURSE inside one blob for the same reason
// ASSIGNMENT_MAP_KEY is - one course's record of "who did I post, at what
// score" means nothing under another course, and a single key stays simple to
// reason about and to clear. Unlike every other key here this one holds a
// RECORD of what the view did rather than a control's value; it is still a
// `ta-` localStorage key because that is the only durable store this view has
// (postCanvasGradesAction writes to Canvas and keeps nothing locally).
const LOG_KEY = "ta-repo-grades-log";

export interface RepoGradesUiState {
  courseId: string;
  orgPrefix: string;
  sort: RepoGradeSortState;
  instructions: string;
  rubric: string;
  /** The Canvas assignment id chosen for "Link GitHub usernames" - restored
   * on reload so re-running the link doesn't require re-picking it. */
  linkAssignmentId: string;
  /** Which of LinkUsernamesPanel's two sources is showing - "roster" (the
   * course table, default: it needs no Canvas connection) or "live" (a
   * Canvas assignment's own submissions). */
  linkSource: "roster" | "live";
  /** When true, a grading call prefers the graded folder's own README over
   * the typed `instructions` above (gradeRepoAction's useReadmeInstructions
   * parameter). Default true - see README_INSTRUCTIONS_KEY's comment above. */
  useReadmeInstructions: boolean;
  /** When true, a "grade this whole column" bulk run only touches checked
   * rows; when false (the default), it means the whole column. See
   * BULK_SELECTION_ONLY_KEY's comment above. */
  bulkSelectionOnly: boolean;
}

function defaultUiState(): RepoGradesUiState {
  return {
    courseId: "",
    orgPrefix: "",
    sort: DEFAULT_REPO_GRADE_SORT,
    instructions: "",
    rubric: "",
    linkAssignmentId: "",
    linkSource: "roster",
    useReadmeInstructions: true,
    bulkSelectionOnly: false,
  };
}

function isSortField(value: unknown): value is RepoGradeSortField {
  return value === "repo" || value === "binding";
}

function isSortDirection(value: unknown): value is SortDirection {
  return value === "asc" || value === "desc";
}

function isLinkSource(value: unknown): value is "roster" | "live" {
  return value === "roster" || value === "live";
}

/** Parses a persisted link-source value, falling back to the default
 * ("roster") for anything missing or naming a source that no longer exists -
 * the same "never trust stored data" posture parseSort takes above. */
function parseLinkSource(raw: string | null): "roster" | "live" {
  return isLinkSource(raw) ? raw : "roster";
}

/** Parses the persisted "use README instructions" flag. Stored as "1" for
 * true / "" for false (persistRepoGradesUiState below always writes one or
 * the other), so `raw === null` is the ONLY case that means "never
 * persisted" and is the one case that falls back to the default (true) -
 * every other raw value, including a stray non-"1" string a hand-edited
 * localStorage blob might carry, reads as false rather than crashing or
 * silently reverting to true. */
function parseUseReadmeInstructions(raw: string | null): boolean {
  return raw === null ? true : raw === "1";
}

/** Parses the persisted "bulk run scoped to selection" flag. Default false,
 * so anything other than the exact persisted "true" marker ("1") reads as
 * false - no `raw === null` special case is needed here (false is already
 * what "never persisted" should read as). */
function parseBulkSelectionOnly(raw: string | null): boolean {
  return raw === "1";
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
    linkAssignmentId: localStorage.getItem(LINK_ASSIGNMENT_KEY) ?? "",
    linkSource: parseLinkSource(localStorage.getItem(LINK_SOURCE_KEY)),
    useReadmeInstructions: parseUseReadmeInstructions(localStorage.getItem(README_INSTRUCTIONS_KEY)),
    bulkSelectionOnly: parseBulkSelectionOnly(localStorage.getItem(BULK_SELECTION_ONLY_KEY)),
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
    localStorage.setItem(LINK_ASSIGNMENT_KEY, state.linkAssignmentId);
    localStorage.setItem(LINK_SOURCE_KEY, state.linkSource);
    localStorage.setItem(README_INSTRUCTIONS_KEY, state.useReadmeInstructions ? "1" : "");
    localStorage.setItem(BULK_SELECTION_ONLY_KEY, state.bulkSelectionOnly ? "1" : "");
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

// ---------------------------------------------------------------------------
// Per-course activity log (docs/repo-grades-activity-log-acceptance-criteria.md
// L3). Same shape as the assignment mapping above: the raw stored blob is
// `Record<courseId, RepoGradeLogEntry[]>`, and the two functions below only
// read/write ONE course's slice of it, leaving every other course's log
// untouched. The VALIDATION (dropping a malformed entry) is deliberately not
// done here - it lives in repoGradesLog.ts's parseRepoGradeLogEntries, a pure
// module a node-env test can import without stubbing a localStorage.

function parseLogByCourse(raw: string | null): Record<string, RepoGradeLogEntry[]> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const result: Record<string, RepoGradeLogEntry[]> = {};
    for (const [courseId, entries] of Object.entries(parsed as Record<string, unknown>)) {
      result[courseId] = parseRepoGradeLogEntries(entries);
    }
    return result;
  } catch {
    return {};
  }
}

/** Reads `courseId`'s slice of the persisted activity log - always an array
 * (never null), already validated and capped by parseRepoGradeLogEntries, so
 * a malformed or hand-edited blob degrades to "fewer entries" rather than to
 * a crashed view (L3 item 14). */
export function loadRepoGradeLog(courseId: string): RepoGradeLogEntry[] {
  if (typeof window === "undefined" || !courseId) return [];
  return parseLogByCourse(localStorage.getItem(LOG_KEY))[courseId] ?? [];
}

/** Writes `courseId`'s slice of the persisted activity log, preserving every
 * OTHER course's slice untouched. Best-effort: a throw (quota, private
 * browsing) loses persistence for this one change and nothing else (L3 item
 * 16), matching persistRepoGradesUiState above. */
export function persistRepoGradeLog(courseId: string, entries: readonly RepoGradeLogEntry[]): void {
  if (typeof window === "undefined" || !courseId) return;
  try {
    const byCourse = parseLogByCourse(localStorage.getItem(LOG_KEY));
    byCourse[courseId] = entries.slice();
    localStorage.setItem(LOG_KEY, JSON.stringify(byCourse));
  } catch {
    // best-effort persistence only, matching persistRepoGradesUiState above.
  }
}
