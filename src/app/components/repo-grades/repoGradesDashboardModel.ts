import type { readRepoGradeHistoryAction } from "@/app/actions/repo-grades-dashboard";
import type { CanvasAssignmentBrief } from "@/lib/canvas";
import type { AutomaticRepoGradeBlock } from "@/lib/repo-grades-dashboard/automatic-blocks";
import { suggestRepoStudentBindings, type RepoBindingRosterEntry } from "@/lib/repo-student-bindings";
import type { OrgRepoTreesResult } from "@/lib/repo-grade-tree-scan";
import type { CourseStudentRepo } from "@/lib/supabase/courses";
import { getRepoGradeCellEdit, type RepoGradeCellEdit, type RepoGradeCellEditsByRepo } from "./repoGradesCellEdits";
import { ALL_FOLDERS } from "./repoGradesFolderSelection";
import { gradeStatusForEdit } from "./repoGradeCellStatus";
import { matchesRepoGradeQuery } from "./repoGradesSearch";
import type { RepoGradeColumn, RepoGradeRow, RepoGradeSortState } from "./repoGradesRows";

export type RepoGradesDashboardDiscovery =
  | "Found in scan"
  | "Folder not seen in scan"
  | "No folders reported"
  | "Repository tree scan failed"
  | "Repository not seen in scan"
  | "Discovery unavailable";

export interface RepoGradesDashboardRow {
  repo: string;
  folder: string | null;
  score: string | null;
  result: string;
  discovery: RepoGradesDashboardDiscovery;
  scanRef?: string;
  scanCommit?: string;
}

export interface RepoGradesCourseEdits {
  scope: object;
  edits: RepoGradeCellEditsByRepo;
}

export function admitRepoGradeTargets(
  active: Set<string>,
  courseId: string,
  targets: readonly { repo: string; folder: string }[],
): (() => void) | null {
  const keys = targets.map(({ repo, folder }) => JSON.stringify([courseId, repo, folder]));
  if (keys.some((key) => active.has(key))) return null;
  keys.forEach((key) => active.add(key));
  return () => keys.forEach((key) => active.delete(key));
}

// Each restore gets a fresh scope, including a return to a previously selected
// course. An older grading request must never change this selection's edits.
export function updateRepoGradesCourseEdits(
  state: RepoGradesCourseEdits,
  scope: object,
  update: (edits: RepoGradeCellEditsByRepo) => RepoGradeCellEditsByRepo,
): RepoGradesCourseEdits {
  if (state.scope !== scope) return state;
  const edits = update(state.edits);
  return edits === state.edits ? state : { scope, edits };
}

export function buildRepoGradesDashboard(
  edits: RepoGradeCellEditsByRepo,
  scan: OrgRepoTreesResult | null,
  targetBranch = "",
): RepoGradesDashboardRow[] {
  const scanned = new Map(scan?.repos.map((entry) => [entry.repo, entry]));
  const repos = new Set([...Object.keys(edits), ...scanned.keys()]);
  const rows: RepoGradesDashboardRow[] = [];

  for (const repo of [...repos].sort()) {
    const scannedRepo = scanned.get(repo);
    const found = new Set(scannedRepo?.folders);
    const repoEdits = Object.hasOwn(edits, repo) ? edits[repo] : undefined;
    const folders = new Set([...Object.keys(repoEdits ?? {}), ...found]);
    const visibleFolders = folders.size > 0 ? [...folders].sort() : [null];

    for (const folder of visibleFolders) {
      const edit = folder !== null && repoEdits && Object.hasOwn(repoEdits, folder) ? repoEdits[folder] : undefined;
      const score = edit?.score.trim() || null;
      let result = score === null ? "No score shown" : "Local score";
      if (score !== null && edit?.submissionTruncated) result = "Local score · Submission truncated";
      if (edit?.grading) result += " · Grading in progress";
      if (edit?.gradeError) result += " · Grading failed";

      let discovery: RepoGradesDashboardDiscovery = "Discovery unavailable";
      if (scannedRepo?.folders === null) discovery = "Repository tree scan failed";
      else if (folder === null) discovery = "No folders reported";
      else if (found.has(folder)) discovery = "Found in scan";
      else if (scannedRepo) discovery = "Folder not seen in scan";
      else if (scan) discovery = "Repository not seen in scan";

      rows.push({ repo, folder, score, result, discovery,
        ...(scannedRepo?.sourceCommit && !scannedRepo.partial && (!targetBranch.trim() || targetBranch.trim() === scannedRepo.defaultBranch)
          ? { scanRef: scannedRepo.defaultBranch, scanCommit: scannedRepo.sourceCommit } : {}) });
    }
  }
  return rows;
}

export type RepoGradeSavedAttempt = Extract<
  Awaited<ReturnType<typeof readRepoGradeHistoryAction>>, { status: "loaded" }
>["rows"][number];

export type RepoGradeSavedResult = {
  latest: RepoGradeSavedAttempt;
  scored: RepoGradeSavedAttempt | null;
};

export type RepoGradeSavedResults = ReadonlyMap<string, RepoGradeSavedResult>;

/** A tree-proven empty folder supersedes an older result only when its run
 * began after every saved receipt settled, on the same ref and a newer pin.
 * Unknown or unorderable receipts must never be hidden by a timestamp guess. */
export function newerVerifiedNoSubmission(
  saved: RepoGradeSavedResult | undefined, blocks: readonly AutomaticRepoGradeBlock[] | undefined,
): boolean {
  const evidence = blocks?.find((block) => block.noSubmission && !block.noSubmissionStale && typeof block.sourceSha === "string"
    && /^[0-9a-f]{40}$/.test(block.sourceSha) && Number.isFinite(Date.parse(block.runStartedAt ?? "")));
  if (!evidence) return false;
  if (!saved) return true;
  const runAt = Date.parse(evidence.runStartedAt!);
  return [saved.latest, saved.scored].every((attempt) => {
    if (!attempt) return true;
    if (attempt.status === "claimed" || attempt.status === "unknown" || attempt.sourceRef !== evidence.sourceRef
      || !attempt.commit || (attempt.commit === evidence.sourceSha && !evidence.noSubmissionExplicit) || !attempt.settledAt) return false;
    const settled = Date.parse(attempt.settledAt);
    return Number.isFinite(settled) && settled < runAt;
  });
}

export function unorderedNoSubmissionContext(
  saved: RepoGradeSavedResult | undefined, blocks: readonly AutomaticRepoGradeBlock[] | undefined,
  provenNoSubmission: boolean, staleNoSubmission: boolean,
): "score" | "attempt" | null {
  if (!saved || provenNoSubmission || staleNoSubmission || !blocks?.some((item) => item.noSubmission)) return null;
  return saved.scored ? "score" : "attempt";
}
/** A fresh scan can disprove that an older empty result describes the current branch. */
export function noSubmissionMatchesScan(
  sourceRef: string | undefined, sourceCommit: string | undefined, browser: RepoGradesDashboardRow | undefined,
): boolean {
  return !!sourceRef && !!sourceCommit && !!browser?.scanRef && !!browser.scanCommit
    && sourceRef === browser.scanRef && sourceCommit.toLowerCase() === browser.scanCommit.toLowerCase();
}

/** A saved score from a different pin is historical while a newer observed
 * pin has not reached a conclusive result. Do not sort it as a current grade. */
export function savedResultIsEarlierThanObservedPin(
  saved: RepoGradeSavedResult | undefined, blocks: readonly AutomaticRepoGradeBlock[] | undefined,
): boolean {
  return !!saved && !!blocks?.some((block) => {
    const shown = saved.scored ?? saved.latest;
    if (!block.noSubmissionStale || !block.observedSourceSha || block.observedSourceSha === shown.commit) return false;
    const settled = Date.parse(shown.settledAt ?? "");
    const observed = Date.parse(block.observedRunStartedAt ?? "");
    return !Number.isFinite(settled) || !Number.isFinite(observed) || settled <= observed;
  });
}

// GitHub repositories are case-insensitive. Assignment folder names are exact.
function savedResultKey(repo: string, folder: string): string {
  return JSON.stringify([repo.toLowerCase(), folder]);
}

export function addRepoGradeSavedPage(
  results: Map<string, RepoGradeSavedResult>, attempts: readonly RepoGradeSavedAttempt[],
): void {
  for (const attempt of attempts) {
    const key = savedResultKey(attempt.repo, attempt.folder);
    const existing = results.get(key);
    const latest = existing?.latest ?? attempt;
    const scored = existing?.scored ?? (attempt.score === null ? null : attempt);
    if (!existing || existing.scored !== scored) results.set(key, { latest, scored });
  }
}

export function mergeIncompleteRepoGradeResults(
  previous: RepoGradeSavedResults, observed: RepoGradeSavedResults,
): RepoGradeSavedResults {
  const combined = new Map(previous);
  for (const [key, current] of observed) {
    const old = previous.get(key);
    if (!old) {
      combined.set(key, current);
      continue;
    }
    const latest = current.latest.generation >= old.latest.generation ? current.latest : old.latest;
    const scored = (current.scored?.generation ?? 0) >= (old.scored?.generation ?? 0) ? current.scored : old.scored;
    combined.set(key, { latest, scored });
  }
  return combined;
}

type MatrixCell = {
  browser: RepoGradesDashboardRow | undefined;
  local: RepoGradeCellEdit | null;
  retained: RepoGradeCellEdit["retainedResults"];
  saved: RepoGradeSavedResult | undefined;
  automaticBlocks?: AutomaticRepoGradeBlock[];
  browserStatus?: ReturnType<typeof gradeStatusForEdit>;
};

type MatrixRepository = {
  name: string;
  cells: Map<string, MatrixCell>;
  emptyDiscovery?: RepoGradesDashboardDiscovery;
};

type MatrixStudent = { key: string; name: string | null; repos: MatrixRepository[] };

function hasLocalResult(edit: RepoGradeCellEdit): boolean {
  return !!(edit.score.trim() || edit.comment.trim() || edit.strengths.trim()
    || edit.improvements.trim() || edit.resubmitNotice.trim() || edit.rubricAreas.length
    || edit.generatedScore !== null);
}

export function buildRepoGradeMatrix(
  browserRows: readonly RepoGradesDashboardRow[],
  edits: RepoGradeCellEditsByRepo,
  savedResults: RepoGradeSavedResults,
  gradeColumns: readonly RepoGradeColumn[],
  assignments: readonly Pick<CanvasAssignmentBrief, "id" | "name">[],
  roster: readonly RepoBindingRosterEntry[],
  studentRepos: readonly CourseStudentRepo[],
  automaticBlocks: readonly AutomaticRepoGradeBlock[] = [],
) {
  const folders = new Set(gradeColumns.map(({ folder }) => folder));
  const repos = new Map<string, MatrixRepository>();
  const repository = (name: string) => {
    const key = name.toLowerCase();
    const existing = repos.get(key);
    if (existing) return existing;
    const created: MatrixRepository = { name, cells: new Map() };
    repos.set(key, created);
    return created;
  };
  for (const browser of browserRows) {
    const repo = repository(browser.repo);
    if (browser.folder === null) {
      repo.emptyDiscovery = browser.discovery;
      continue;
    }
    folders.add(browser.folder);
    const edit = getRepoGradeCellEdit(edits, browser.repo, browser.folder);
    const previous = repo.cells.get(browser.folder);
    const local = hasLocalResult(edit) ? edit : null;
    const browserStatus = gradeStatusForEdit(edit);
    repo.cells.set(browser.folder, {
      browser: previous?.browser?.discovery === "Found in scan" ? previous.browser : browser,
      local: local ?? previous?.local ?? null,
      retained: edit.retainedResults?.length ? edit.retainedResults : previous?.retained,
      saved: undefined,
      browserStatus: browserStatus === "not-started" ? previous?.browserStatus : browserStatus,
    });
  }
  for (const saved of savedResults.values()) {
    const { repo: name, folder } = saved.latest;
    folders.add(folder);
    const repo = repository(name);
    const previous = repo.cells.get(folder);
    repo.cells.set(folder, {
      browser: previous?.browser, local: previous?.local ?? null, saved,
      browserStatus: previous?.browserStatus,
      retained: previous?.retained,
    });
  }
  for (const block of automaticBlocks) {
    const { repo: name, folder, sourceRef, explanation } = block;
    folders.add(folder);
    const repo = repository(name);
    const previous = repo.cells.get(folder);
    if (previous?.automaticBlocks?.some((item) => item.sourceRef === sourceRef && item.explanation === explanation)) continue;
    repo.cells.set(folder, {
      browser: previous?.browser,
      local: previous?.local ?? null,
      retained: previous?.retained,
      saved: previous?.saved,
      browserStatus: previous?.browserStatus,
      automaticBlocks: [...(previous?.automaticBlocks ?? []), block],
    });
  }
  for (const { repo, canvasUserId } of studentRepos) {
    const name = repo.trim();
    if (canvasUserId && /^\d+$/.test(canvasUserId) && name.includes("/")) repository(name);
  }

  const students = new Map<string, MatrixStudent>(roster.map(({ id, name }) => [
    id, { key: `student:${id}`, name, repos: [] },
  ]));
  const unlinked: MatrixStudent[] = [];
  const bindings = suggestRepoStudentBindings([...repos.values()].map(({ name }) => name), [...roster], [...studentRepos]);
  for (const binding of bindings) {
    const repo = repos.get(binding.repo.toLowerCase())!;
    if (binding.state !== "confirmed" || !binding.canvasUserId) {
      unlinked.push({ key: `repo:${repo.name.toLowerCase()}`, name: null, repos: [repo] });
      continue;
    }
    const student = students.get(binding.canvasUserId);
    if (student) student.repos.push(repo);
    else students.set(binding.canvasUserId, {
      key: `student:${binding.canvasUserId}`, name: binding.student ?? "Student name unavailable", repos: [repo],
    });
  }

  const assignmentsById = new Map(assignments.map(({ id, name }) => [id, name]));
  const columnsByFolder = new Map(gradeColumns.map((column) => [column.folder, column]));
  const columns = [...folders].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).map((folder) => {
    const assignmentId = columnsByFolder.get(folder)?.assignmentId;
    return { folder, label: (assignmentId && assignmentsById.get(assignmentId)) || folder || "Repository root" };
  });
  const rows = [...students.values()].sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));
  return { columns, rows: [...rows, ...unlinked] };
}

export type RepoGradeMatrix = ReturnType<typeof buildRepoGradeMatrix>;

/** Display selection only. An undiscovered repository can still have results,
 * but only a visible, scanned row may carry operational controls. A student's
 * group sorts by its first repository after sorting the group's repositories. */
export function visibleRepoGradebookRows(
  matrix: RepoGradeMatrix,
  scannedRows: readonly RepoGradeRow[],
  bodyRows: readonly RepoGradeRow[],
  selectedFolder: string,
  query: string,
  selectionFiltered: boolean,
  sort: RepoGradeSortState,
) {
  const scanned = new Map(scannedRows.map((row) => [row.repo.toLowerCase(), row]));
  const visible = new Map(bodyRows.map((row, rank) => [row.repo.toLowerCase(), { row, rank }]));
  const allFolders = selectedFolder === ALL_FOLDERS;
  const sortFolder = sort.field === "folder" && (allFolders || selectedFolder === sort.folder) ? sort.folder : undefined;
  const scoreForSort = (repo: MatrixRepository | undefined) => {
    if (!repo || sortFolder === undefined) return null;
    const cell = repo.cells.get(sortFolder);
    const empty = cell?.automaticBlocks?.find((item) => item.noSubmission && !item.noSubmissionStale);
    return (newerVerifiedNoSubmission(cell?.saved, cell?.automaticBlocks)
      && noSubmissionMatchesScan(empty?.sourceRef, empty?.sourceSha, cell?.browser))
      || savedResultIsEarlierThanObservedPin(cell?.saved, cell?.automaticBlocks) ? null : cell?.saved?.scored?.score ?? null;
  };
  const compareScores = (left: MatrixRepository | undefined, right: MatrixRepository | undefined) => {
    const a = scoreForSort(left);
    const b = scoreForSort(right);
    if (a === b) return 0;
    if (a === null) return 1;
    if (b === null) return -1;
    return (sort.direction === "asc" ? 1 : -1) * (a - b);
  };
  return matrix.rows.flatMap((student) => {
    let rank = Infinity;
    const repos = student.repos.flatMap<MatrixRepository & { active?: RepoGradeRow }>((repo) => {
      const key = repo.name.toLowerCase();
      const active = visible.get(key);
      if (active) {
        rank = Math.min(rank, active.rank);
        return [{ ...repo, active: active.row }];
      }
      const cell = repo.cells.get(selectedFolder);
      const hasResult = !!(cell?.saved || cell?.automaticBlocks?.length);
      const scannedRow = scanned.get(key);
      const operational = scannedRow && (allFolders || scannedRow.cells[selectedFolder]?.status === "ungraded");
      if (selectionFiltered || operational || (!allFolders && !hasResult)
        || !matchesRepoGradeQuery(query, [student.name ?? "Unlinked repository", repo.name])) return [];
      return [repo];
    }).sort((a, b) => {
      const left = visible.get(a.name.toLowerCase())?.rank ?? Infinity;
      const right = visible.get(b.name.toLowerCase())?.rank ?? Infinity;
      return compareScores(a, b) || (left === right ? 0 : left - right);
    });
    if (!repos.length && (student.repos.length || selectionFiltered || !allFolders || !matchesRepoGradeQuery(query, [student.name]))) return [];
    return [{ ...student, repos, rank }];
  }).sort((a, b) => compareScores(a.repos[0], b.repos[0]) || (a.rank === b.rank ? 0 : a.rank - b.rank));
}
