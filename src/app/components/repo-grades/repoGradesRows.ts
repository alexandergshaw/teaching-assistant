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

/** Mirrors GradingResults.tsx's own PostState union. */
export type RepoGradePostStatus = "idle" | "posting" | "posted" | "error";

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
// Sorting (AC4 item 22: pure helpers, own tests, the .tsx only renders).

export type RepoGradeSortField = "repo" | "binding";
export type SortDirection = "asc" | "desc";

export interface RepoGradeSortState {
  field: RepoGradeSortField;
  direction: SortDirection;
}

export const DEFAULT_REPO_GRADE_SORT: RepoGradeSortState = { field: "repo", direction: "asc" };

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
 * Sorts a copy of `rows` (never mutates the input) by repo name or binding
 * urgency. Ties within a "binding" sort fall back to repo name, so the
 * result is always fully deterministic - no two rows ever compare equal.
 */
export function sortRepoGradeRows(
  rows: readonly RepoGradeRow[],
  sort: RepoGradeSortState
): RepoGradeRow[] {
  const factor = sort.direction === "asc" ? 1 : -1;
  return rows.slice().sort((a, b) => {
    if (sort.field === "repo") {
      return factor * naturalCompare(a.repo, b.repo);
    }
    const diff = BINDING_STATE_SORT_PRIORITY[a.binding.state] - BINDING_STATE_SORT_PRIORITY[b.binding.state];
    if (diff !== 0) return factor * diff;
    return factor * naturalCompare(a.repo, b.repo);
  });
}
