// Repo Grades view - AC3/AC4 (docs/repo-grades-view-acceptance-criteria.md):
// turning one org scan (loadOrgRepoTreesAction's OrgRepoTreesResult) plus a
// roster and the tile's stored studentRepos into the grid's row/column model.
// Pure, no I/O, no React - vitest is node-env and collects only
// src/**/*.test.ts (AC6 item 37), so every decision the grid renders has to
// live here, in a module a real test can import, for it to be testable at
// all. index.tsx / RepoGradesGrid.tsx only call these functions and render
// what they return.
//
// This file also owns the one write-back transform (applyRepoGradeBinding)
// AC2 item 10 requires: accepting a binding always goes through the tile's
// existing studentRepos array via the SAME course-update action every other
// consumer of that column already uses (gradeTileRepos,
// messaging-outlook.ts) - never a parallel store. The actual
// updateCourseHubAction call lives in useRepoGradesData.ts (a "use server"
// action call cannot happen in a pure module), but the SHAPE of the patch it
// writes is decided here, where it can be pinned by a test.

import type { CourseStudentRepo } from "@/lib/supabase/courses";
import {
  suggestRepoStudentBindings,
  type RepoBindingRosterEntry,
  type RepoBindingState,
  type RepoBindingSuggestion,
} from "@/lib/repo-student-bindings";
import type { RepoFolderRow } from "@/lib/repo-grade-tree-scan";
// N4/N5 (docs/repo-grades-name-columns-and-sorting-acceptance-criteria.md):
// the sort key for "firstName"/"lastName" reads the EXACT SAME derivation
// the grid's name cells render (repoGradeStudentName.ts), never a
// re-implementation of the split rules - N5 item 16's failure mode is
// precisely two call sites reading different derivations for the same
// visible name. getRepoGradeCellEdit/RepoGradeCellEditsByRepo is a VALUE
// import from repoGradesCellEdits.ts, which itself only TYPE-imports back
// from this file (RepoGradePostStatus/RepoGradeCell/RepoGradeRow) - a
// type-only import is erased at compile time, so this is not a runtime
// circular dependency, the same reasoning RepoGradesGrid.tsx's own imports
// from both files already rely on.
import { deriveRepoGradeStudentName } from "./repoGradeStudentName";
import { scorePercentValue } from "./repoGradeScoreDisplay";
import { getRepoGradeCellEdit, type RepoGradeCellEditsByRepo } from "./repoGradesCellEdits";

// ---------------------------------------------------------------------------
// Natural ordering - the SAME comparator assignmentFoldersFromTree uses
// (src/lib/repo-assignment-folders.ts:58), duplicated rather than imported
// because that module exposes no standalone comparator to call (its sort is
// inline inside assignmentFoldersFromTree, which operates on raw tree PATHS,
// not on an already-derived union of folder NAMES the way this module needs
// it). This mirrors the repoSlug duplication already established in
// src/lib/repo-student-bindings.ts:82 for the identical reason: a one-line
// pure expression that is not separately exported gets copied verbatim, with
// a comment pointing at the source of truth, rather than re-derived by guess.
// If repo-assignment-folders.ts's comparator ever changes, this copy must
// change with it.
function naturalCompare(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
}

// ---------------------------------------------------------------------------
// Cell model - AC3 item 15 (a repo missing a column's folder is a DISTINCT
// state from "folder present, not yet graded" - the existing week-folder path
// (steps.grading-repos.helpers.ts:141-145) SKIPS a student with no matching
// folder rather than grading them as a zero, and silently rendering both
// cases as merely "ungraded" would hide exactly that real problem) and the
// task-5 instruction to leave a cell shape ready for a score, a comment and a
// post status without wiring posting this wave.

export type RepoGradeCellStatus =
  | "missing-folder" // the union column's folder does not exist in this repo
  | "ungraded" // the folder exists; no score has been posted
  | "scan-error"; // this repo's tree fetch failed, so folder presence is unknown - never conflated with "missing-folder" (AC3 item 17c)

/** Mirrors GradingResults.tsx's own PostState union. B1 (ux-audit-grading.md):
 * "skipped" is a genuine third outcome after a post attempt - the student had
 * no grade or comment to send, so Canvas was never called for them
 * (postCanvasGradesAction's own `skipped` array, src/lib/canvas/grades.ts).
 * Never folded into "posted" just because it is absent from `failures`. */
export type RepoGradePostStatus = "idle" | "posting" | "posted" | "error" | "skipped";

/**
 * This pure module (buildRepoGradeRows/buildRepoGradeGridModel) always
 * produces a cell with score/comment "" and postStatus "idle" - it has no
 * memory of a grading call or a post attempt, both of which are genuinely
 * stateful UI actions the instructor triggers on demand (AC4 items 20-21,
 * AC5). That live state lives separately, in repoGradesCellEdits.ts's
 * RepoGradeCellEditsByRepo, keyed by (repo, folder) - RepoGradeCellControl.tsx
 * is the one place that combines a cell's derived `status` (from HERE, since
 * folder presence never changes without a re-scan) with its current edit
 * state (from THERE, since a score/comment/post-status genuinely can change
 * between renders) before rendering. Keeping the two separate is what lets
 * buildRepoGradeRows stay pure and re-derivable on every render (e.g. a
 * re-sort) without clobbering an in-progress edit.
 */
export interface RepoGradeCell {
  status: RepoGradeCellStatus;
  /** Always "" as produced by this module - see the interface comment above. */
  score: string;
  /** Always "" as produced by this module - see the interface comment above. */
  comment: string;
  /** Always "idle" as produced by this module - see the interface comment above. */
  postStatus: RepoGradePostStatus;
}

export interface RepoGradeColumn {
  folder: string;
  /** The Canvas assignment this column posts to (AC5 items 25-26) - always
   * null this wave. The next wave's per-column mapping picker fills this in;
   * nothing in this wave's code ever sets it, matching the wave brief's
   * "leave hooks for the next wave... but do not build them". */
  assignmentId: string | null;
}

export interface RepoGradeRow {
  repo: string;
  htmlUrl: string;
  binding: RepoBindingSuggestion;
  /** This repo's assignment folders, or null when its tree fetch failed
   * (scanOrgRepoTrees's per-repo isolation - AC3 item 17c). */
  folders: string[] | null;
  /** Set only when `folders` is null - the repo row's own scan error text. */
  folderError: string | null;
  /** Keyed by column folder name; every column in the grid model has an
   * entry here, even when this repo's own folders came back null. */
  cells: Record<string, RepoGradeCell>;
}

function buildCell(folder: string, folders: string[] | null): RepoGradeCell {
  const status: RepoGradeCellStatus =
    folders === null ? "scan-error" : folders.includes(folder) ? "ungraded" : "missing-folder";
  return { status, score: "", comment: "", postStatus: "idle" };
}

/**
 * The grid's columns: the union of every scanned repo's folders (AC3 item
 * 15), naturally ordered. A repo whose tree fetch failed (folders === null)
 * contributes nothing to the union - it cannot be known to have ANY folder,
 * so it must not silently narrow the column set either.
 */
export function buildRepoGradeColumns(
  scanRepos: ReadonlyArray<Pick<RepoFolderRow, "folders">>
): RepoGradeColumn[] {
  const folderSet = new Set<string>();
  for (const repo of scanRepos) {
    if (!repo.folders) continue;
    for (const folder of repo.folders) folderSet.add(folder);
  }
  return Array.from(folderSet)
    .sort(naturalCompare)
    .map((folder) => ({ folder, assignmentId: null }));
}

/**
 * One row per scanned repo, cross-referenced against its binding suggestion
 * (matched by exact repo full name - both lists are built from the same
 * scan, so every repo is guaranteed a binding entry; see
 * buildRepoGradeGridModel, the only caller expected in practice) and given
 * one cell per column via buildCell's three-way status above.
 */
export function buildRepoGradeRows(
  scanRepos: readonly RepoFolderRow[],
  bindings: readonly RepoBindingSuggestion[],
  columns: readonly RepoGradeColumn[]
): RepoGradeRow[] {
  const bindingByRepo = new Map(bindings.map((b) => [b.repo, b]));
  return scanRepos.map((repo) => {
    const binding = bindingByRepo.get(repo.repo);
    if (!binding) {
      throw new Error(
        `buildRepoGradeRows: no binding suggestion for repo "${repo.repo}" - bindings must be derived from ` +
          "the exact same repo list (see buildRepoGradeGridModel)."
      );
    }
    const cells: Record<string, RepoGradeCell> = {};
    for (const column of columns) cells[column.folder] = buildCell(column.folder, repo.folders);
    return {
      repo: repo.repo,
      htmlUrl: repo.htmlUrl,
      binding,
      folders: repo.folders,
      folderError: repo.error,
      cells,
    };
  });
}

export interface RepoGradeGridModel {
  columns: RepoGradeColumn[];
  rows: RepoGradeRow[];
}

/**
 * The one entry point index.tsx / useRepoGradesData actually call: derives
 * columns, derives bindings via the existing suggestRepoStudentBindings
 * (src/lib/repo-student-bindings.ts - AC2's suggester, reused verbatim, never
 * reimplemented), and assembles rows. `orgPrefix` is the same name-filter
 * prefix the scan itself was run with (AC2 item 8b: the suggester strips
 * "any configured name filter prefix" when deriving a candidate handle).
 */
export function buildRepoGradeGridModel(
  scanRepos: readonly RepoFolderRow[],
  roster: readonly RepoBindingRosterEntry[],
  stored: readonly CourseStudentRepo[],
  orgPrefix: string | undefined
): RepoGradeGridModel {
  const columns = buildRepoGradeColumns(scanRepos);
  const bindings = suggestRepoStudentBindings(
    scanRepos.map((repo) => repo.repo),
    roster as RepoBindingRosterEntry[],
    stored as CourseStudentRepo[],
    orgPrefix
  );
  const rows = buildRepoGradeRows(scanRepos, bindings, columns);
  return { columns, rows };
}

// ---------------------------------------------------------------------------
// Binding write-back (AC2 item 10) - the exact patch shape accepting a
// binding produces. useRepoGradesData.ts feeds this straight into
// updateCourseHubAction(course.id, { ...courseToInput(course), studentRepos:
// applyRepoGradeBinding(...) }), the SAME save path useInlineFieldSave.ts's
// savePatch and RosterCell.tsx's StudentReposCell already use for this
// column - never a parallel store.
//
// `username` is deliberately left null on every call site in this view (see
// RepoGradesGrid.tsx / RepoBindingControl.tsx) rather than writing the
// repoSlug-derived handle back as a confirmed username: that handle is an
// INFERENCE (rule b of suggestRepoStudentBindings), and caching an inference
// into the one field (`username`) that rule c's Tier 1 treats as
// authoritative for every OTHER unresolved repo in the course would let one
// accepted guess quietly seed a second guess elsewhere. Passing null here
// preserves whatever username (if any) a stored row already had, via the
// `?? existing.username` fallback below - it only ever WITHDRAWS a bad
// inference, never adds one.
export function applyRepoGradeBinding(
  existing: readonly CourseStudentRepo[],
  repo: string,
  canvasUserId: string,
  student: string,
  username: string | null
): CourseStudentRepo[] {
  const key = repo.trim().toLowerCase();
  const idx = existing.findIndex((row) => row.repo.trim().toLowerCase() === key);
  if (idx === -1) {
    return [...existing, { student, canvasUserId, repo: repo.trim(), username: username ?? null, email: null }];
  }
  const next = existing.slice();
  const prior = next[idx];
  next[idx] = {
    ...prior,
    student,
    canvasUserId,
    username: username ?? prior.username ?? null,
  };
  return next;
}

// ---------------------------------------------------------------------------
// Sorting (AC4 item 22; extended by docs/repo-grades-name-columns-and-
// sorting-acceptance-criteria.md N4/N5: every column is sortable via a
// header control, including the dynamic per-folder score columns - pure
// helpers, own tests, the .tsx files only render/forward).
//
// Reuses the Tasks view's own solution (src/lib/course-tasks-view.ts:545-747)
// rather than reinventing it: a `Record<RepoGradeSortField, true>`
// exhaustiveness check (so a field added to the union without being added to
// that record is a TYPE ERROR, not silently-dropped data), a SortableValue
// `{kind, value, empty}` shape where "empty" always sorts last regardless of
// direction, and resolveRepoGradeSort mirroring resolveTaskSort's
// stale-field degrade.

export type RepoGradeSortField = "repo" | "binding" | "firstName" | "lastName" | "folder";
export type SortDirection = "asc" | "desc";

export interface RepoGradeSortState {
  field: RepoGradeSortField;
  /** Meaningful only when field === "folder" - which folder column is being
   * sorted. OMITTED (never explicit null) on every other field - mirrors
   * TaskSortState.taskId's own convention in course-tasks-view.ts: `toEqual`
   * treats an omitted key differently from an explicit `null`, and
   * DEFAULT_REPO_GRADE_SORT below (and every producer in this file) leaves
   * it out rather than nulling it. */
  folder?: string;
  direction: SortDirection;
}

export const DEFAULT_REPO_GRADE_SORT: RepoGradeSortState = { field: "repo", direction: "asc" };

// A Record<RepoGradeSortField, true> literal, not a hand-written array -
// adding a field to the union without adding it here is a TYPE ERROR (a
// missing property), not silent data loss. Mirrors course-tasks-view.ts's
// own TASK_SORT_FIELD_MEMBERSHIP and the exact trap it exists to catch.
const REPO_GRADE_SORT_FIELD_MEMBERSHIP: Record<RepoGradeSortField, true> = {
  repo: true,
  binding: true,
  firstName: true,
  lastName: true,
  folder: true,
};
const REPO_GRADE_SORT_FIELDS: RepoGradeSortField[] = Object.keys(REPO_GRADE_SORT_FIELD_MEMBERSHIP) as RepoGradeSortField[];

/** Sorting by "binding" surfaces rows that need attention first in ASCENDING
 * order: unbound (nothing known) before ambiguous (needs a human pick) before
 * suggested (needs one confirm click) before confirmed (already done,
 * postable). Exported so both the sort function below and its test share one
 * definition of "which state is more urgent" rather than restating the
 * ordering twice. */
export const BINDING_STATE_SORT_PRIORITY: Record<RepoBindingState, number> = {
  unbound: 0,
  ambiguous: 1,
  suggested: 2,
  confirmed: 3,
};

/**
 * N5 item 17: `ta-repo-grades-sort` (repoGradesUiState.ts) is a GLOBAL
 * localStorage key, unlike `ta-repo-grades-folder`'s per-course slice - a
 * persisted folder sort can name a folder the newly-selected course does not
 * have, which would otherwise render scan order while the header still
 * claims a sort. CHOSEN FIX: resolve the stale case here, at the one
 * function that actually orders rows, the same way resolveTaskSort
 * (course-tasks-view.ts) resolves a stale task-column sort - rather than
 * reshaping SORT_KEY into a per-course record (a bigger, riskier change to
 * an already-shipped schema, for a case sortRepoGradeRows already needs to
 * handle safely regardless, since `columns` can change out from under a
 * persisted sort on every re-scan too, not only a course switch). Any
 * non-"folder" sort passes through unchanged.
 */
export function resolveRepoGradeSort(sort: RepoGradeSortState, columns: readonly RepoGradeColumn[]): RepoGradeSortState {
  if (sort.field !== "folder") return sort;
  if (!sort.folder || !columns.some((c) => c.folder === sort.folder)) return DEFAULT_REPO_GRADE_SORT;
  return sort;
}

/**
 * The next sort state after clicking a header - toggles direction when that
 * field (and, for "folder", that exact folder) is already the active sort;
 * otherwise starts a NEW ascending sort on it. The ONE place a header click
 * decides what "next" means (AC19: vitest never renders a component, so this
 * decision has to live somewhere a real test can exercise it) - every
 * onClick in RepoGradesGrid.tsx is a plain `onSortChange(toggleRepoGradeSort(sort, field[, folder]))`.
 */
export function toggleRepoGradeSort(
  current: RepoGradeSortState,
  field: RepoGradeSortField,
  folder?: string
): RepoGradeSortState {
  const alreadyActive = current.field === field && (field !== "folder" || current.folder === folder);
  if (alreadyActive) {
    return { ...current, direction: current.direction === "asc" ? "desc" : "asc" };
  }
  return field === "folder" ? { field, folder, direction: "asc" } : { field, direction: "asc" };
}

/** Parses a persisted `ta-repo-grades-sort` value, falling back to
 * DEFAULT_REPO_GRADE_SORT for anything missing, malformed, or naming a
 * field/direction that no longer exists - mirrors parseTaskSortState
 * (course-tasks-view.ts) exactly, including its "folder" (there: "task")
 * case requiring a non-blank string identifier or degrading to the
 * default. */
export function parseRepoGradeSortState(raw: string | null | undefined): RepoGradeSortState {
  if (!raw) return DEFAULT_REPO_GRADE_SORT;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return DEFAULT_REPO_GRADE_SORT;

    const field = (parsed as { field?: unknown }).field;
    const direction = (parsed as { direction?: unknown }).direction;
    if (!REPO_GRADE_SORT_FIELDS.includes(field as RepoGradeSortField) || (direction !== "asc" && direction !== "desc")) {
      return DEFAULT_REPO_GRADE_SORT;
    }

    if (field === "folder") {
      const folder = (parsed as { folder?: unknown }).folder;
      if (typeof folder !== "string" || folder.trim() === "") return DEFAULT_REPO_GRADE_SORT;
      return { field: "folder", folder, direction };
    }
    return { field: field as RepoGradeSortField, direction };
  } catch {
    return DEFAULT_REPO_GRADE_SORT;
  }
}

// The Sort <select>'s (RepoGradesControls.tsx) own plain option keys - every
// field EXCEPT "folder", since a folder column is variable per course and
// cannot be reasonably listed in a fixed <select>. N5 item 15:
// `parseSortValue` used to coerce every unknown field to "repo", so a
// header-set sort (any of these, or a folder sort) would visibly SNAP BACK to
// "repo" the instant the instructor merely touched the select - the two
// controls would disagree about what the sort actually was. The fix here is
// that the select's own VALUE (repoGradeSortSelectValue below) resolves to
// the "custom" placeholder whenever the active sort is not one of these four,
// so the control never shows a value mismatching every one of its real
// <option>s (the actual mechanism behind that snap-back - see this
// function's sibling below) - and DECODING only ever accepts a value the
// select could actually have produced.
const SELECT_SORT_FIELDS: readonly Exclude<RepoGradeSortField, "folder">[] = ["repo", "binding", "firstName", "lastName"];

/** The Sort `<select>`'s current value: `"<field>:<direction>"` for any of
 * the four plain fields, or the "custom" placeholder whenever the active
 * sort is a folder column (or, in principle, any future field the select
 * does not list) - which the select renders as a disabled option, so it is
 * never itself selectable and can never fire a spurious onChange. */
export function repoGradeSortSelectValue(sort: RepoGradeSortState): string {
  return (SELECT_SORT_FIELDS as readonly string[]).includes(sort.field) ? `${sort.field}:${sort.direction}` : "custom";
}

/** Decodes the Sort `<select>`'s onChange value. Only ever accepts one of
 * the four plain fields the select actually renders as real options -
 * anything else (including "custom", which is disabled and unselectable)
 * degrades to DEFAULT_REPO_GRADE_SORT rather than being coerced onto an
 * unrelated field, closing N5 item 15 for good: every value this function
 * can be CALLED with (there is no way for the browser to produce anything
 * else through this select) round-trips to the exact field the instructor
 * clicked. */
export function parseRepoGradeSortSelectValue(value: string): RepoGradeSortState {
  const [field, direction] = value.split(":");
  const parsedDirection: SortDirection = direction === "desc" ? "desc" : "asc";
  if ((SELECT_SORT_FIELDS as readonly string[]).includes(field)) {
    return { field: field as RepoGradeSortField, direction: parsedDirection };
  }
  return DEFAULT_REPO_GRADE_SORT;
}

/** One row's sort-relevant value for `sort.field`, in the Tasks view's own
 * SortableValue shape: `empty` always sorts last, in BOTH directions - never
 * displacing real data regardless of which way the column points. */
interface SortableValue {
  kind: "text" | "number";
  value: string | number;
  empty: boolean;
}

function sortFieldValue(row: RepoGradeRow, sort: RepoGradeSortState, cellEdits: RepoGradeCellEditsByRepo): SortableValue {
  switch (sort.field) {
    case "repo":
      return { kind: "text", value: row.repo, empty: false };
    case "binding":
      return { kind: "number", value: BINDING_STATE_SORT_PRIORITY[row.binding.state], empty: false };
    case "firstName": {
      // N5 item 16 - the SAME derivation the grid's First name cell renders
      // (repoGradeStudentName.ts), over the SAME two binding fields. Never a
      // second, hand-rolled split.
      const parts = deriveRepoGradeStudentName(row.binding.student, row.binding.studentSortable);
      return { kind: "text", value: parts.firstName, empty: parts.firstName === "" };
    }
    case "lastName": {
      const parts = deriveRepoGradeStudentName(row.binding.student, row.binding.studentSortable);
      // `.lastName` itself (never repoGradeLastNameCellText's em-dash
      // substitution) - a "single token, last name unknown" row must sort as
      // BLANK, not as some fixed dash-shaped string, matching how the CELL
      // deliberately keeps those two ideas separate (repoGradeStudentName.ts
      // header comment).
      return { kind: "text", value: parts.lastName, empty: parts.lastName === "" };
    }
    case "folder": {
      // N4 item 13: scores live in cellEdits, not on the row - reads exactly
      // the one (repo, folder) pair this sort needs via getRepoGradeCellEdit,
      // rather than building a fully-merged row set the way
      // mergeRepoGradeLiveScores (repoGradesCellEdits.ts) does for the two
      // callers that actually need every column merged at once. N5 item 16:
      // scorePercentValue is the SAME function RepoGradeCellControl.tsx
      // reads to compute the percentage shown beside the raw score, so the
      // sort key and the visible badge agree.
      if (!sort.folder) return { kind: "number", value: 0, empty: true };
      const score = getRepoGradeCellEdit(cellEdits, row.repo, sort.folder).score;
      const percent = scorePercentValue(score);
      return { kind: "number", value: percent ?? 0, empty: percent === null };
    }
  }
}

function compareSortableValues(a: SortableValue, b: SortableValue): number {
  if (a.kind === "text" && b.kind === "text") {
    return naturalCompare(a.value as string, b.value as string);
  }
  return (a.value as number) - (b.value as number);
}

/**
 * Sorts a copy of `rows` (never mutates the input) by `sort.field`/
 * `sort.direction`. `sort` is resolved through resolveRepoGradeSort FIRST
 * (N5 item 17), so a stale folder sort degrades to DEFAULT_REPO_GRADE_SORT
 * here exactly as it does everywhere else. `cellEdits`/`columns` both
 * default to empty so every existing "repo"/"binding" call site keeps
 * compiling and behaving identically without passing them - only a "folder"
 * sort needs either. Ties fall back to repo name (direction-aware, matching
 * this function's own pre-existing "binding" tie-break), so the result is
 * always fully deterministic - no two rows ever compare equal.
 */
export function sortRepoGradeRows(
  rows: readonly RepoGradeRow[],
  sort: RepoGradeSortState,
  cellEdits: RepoGradeCellEditsByRepo = {},
  columns: readonly RepoGradeColumn[] = []
): RepoGradeRow[] {
  const resolved = resolveRepoGradeSort(sort, columns);
  const factor = resolved.direction === "asc" ? 1 : -1;
  const decorated = rows.map((row) => ({ row, value: sortFieldValue(row, resolved, cellEdits) }));

  decorated.sort((a, b) => {
    let primary: number;
    if (a.value.empty && b.value.empty) {
      primary = 0;
    } else if (a.value.empty) {
      return 1;
    } else if (b.value.empty) {
      return -1;
    } else {
      primary = factor * compareSortableValues(a.value, b.value);
    }
    if (primary !== 0) return primary;
    return factor * naturalCompare(a.row.repo, b.row.repo);
  });

  return decorated.map((d) => d.row);
}
