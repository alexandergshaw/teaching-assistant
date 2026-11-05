import type { OrgRepoTreesResult } from "@/lib/repo-grade-tree-scan";
import type { RepoGradeCellEditsByRepo } from "./repoGradesCellEdits";

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
