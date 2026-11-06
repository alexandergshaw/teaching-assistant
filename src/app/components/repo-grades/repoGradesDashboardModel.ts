import type { readRepoGradeHistoryAction } from "@/app/actions/repo-grades-dashboard";
import type { CanvasAssignmentBrief } from "@/lib/canvas";
import { suggestRepoStudentBindings, type RepoBindingRosterEntry } from "@/lib/repo-student-bindings";
import type { OrgRepoTreesResult } from "@/lib/repo-grade-tree-scan";
import type { CourseStudentRepo } from "@/lib/supabase/courses";
import { getRepoGradeCellEdit, type RepoGradeCellEdit, type RepoGradeCellEditsByRepo } from "./repoGradesCellEdits";
import type { RepoGradeColumn } from "./repoGradesRows";

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

      rows.push({ repo, folder, score, result, discovery });
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
  grading: boolean;
  gradeFailed: boolean;
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
    repo.cells.set(browser.folder, {
      browser: previous?.browser?.discovery === "Found in scan" ? previous.browser : browser,
      local: local ?? previous?.local ?? null,
      retained: edit.retainedResults?.length ? edit.retainedResults : previous?.retained,
      saved: undefined,
      grading: edit.grading || previous?.grading === true,
      gradeFailed: !!edit.gradeError || previous?.gradeFailed === true,
    });
  }
  for (const saved of savedResults.values()) {
    const { repo: name, folder } = saved.latest;
    folders.add(folder);
    const repo = repository(name);
    const previous = repo.cells.get(folder);
    repo.cells.set(folder, {
      browser: previous?.browser, local: previous?.local ?? null, saved,
      retained: previous?.retained,
      grading: previous?.grading ?? false, gradeFailed: previous?.gradeFailed ?? false,
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
