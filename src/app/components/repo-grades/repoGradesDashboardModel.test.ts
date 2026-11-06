import { describe, expect, it, vi } from "vitest";
import type { OrgRepoTreesResult } from "@/lib/repo-grade-tree-scan";
import { defaultRepoGradeCellEdit, type RepoGradeCellEditsByRepo } from "./repoGradesCellEdits";
import {
  addRepoGradeSavedPage, buildRepoGradeMatrix, buildRepoGradesDashboard, mergeIncompleteRepoGradeResults, updateRepoGradesCourseEdits, visibleRepoGradebookRows,
  type RepoGradeSavedAttempt, type RepoGradeSavedResult,
} from "./repoGradesDashboardModel";
import { ALL_FOLDERS } from "./repoGradesFolderSelection";
import { buildRepoGradeGridModel, DEFAULT_REPO_GRADE_SORT } from "./repoGradesRows";

function scan(foldersByRepo: Record<string, string[] | null>): OrgRepoTreesResult {
  return {
    repos: Object.entries(foldersByRepo).map(([repo, folders]) => ({
      repo,
      folders,
      error: folders === null ? "Unavailable" : null,
      defaultBranch: "main",
      htmlUrl: "",
    })),
    truncated: false,
    rateLimit: null,
  };
}

const edit = (score: string) => ({ ...defaultRepoGradeCellEdit(), score });

function attempt(generation: number, repo: string, folder: string, score: number | null): RepoGradeSavedAttempt {
  return {
    generation, repo, folder, score,
    sourceRef: "main", commit: "a".repeat(40), profileFingerprint: "b".repeat(64),
    status: score === null ? "failed" : "succeeded",
    claimedAt: "2026-11-06T12:00:00.000Z", settledAt: null,
    feedback: score === null ? null : `Feedback for ${repo}/${folder}`,
    feedback_sections: null, feedback_retention: null, rubric: null,
  };
}

describe("class repository results", () => {
  it("unions exact repo and folder keys without borrowing scores from another repo or folder", () => {
    const edits: RepoGradeCellEditsByRepo = {
      "org/a": { "Lab One": edit("0"), archive: edit("7/10") },
      "org/older": { "lab-one": edit("3/5") },
    };
    const rows = buildRepoGradesDashboard(edits, scan({
      "org/a": ["Lab One", "Lab One", "lab one"],
      "org/b": ["Lab One"],
    }));
    expect(rows.map(({ repo, folder, score, discovery }) => [repo, folder, score, discovery])).toEqual([
      ["org/a", "Lab One", "0", "Found in scan"],
      ["org/a", "archive", "7/10", "Folder not seen in scan"],
      ["org/a", "lab one", null, "Found in scan"],
      ["org/b", "Lab One", null, "Found in scan"],
      ["org/older", "lab-one", "3/5", "Repository not seen in scan"],
    ]);
  });

  it("shows historical results without discovery and keeps a cleared score empty", () => {
    const rows = buildRepoGradesDashboard({
      "org/a": { one: edit("0/20"), two: { ...edit(" "), generatedScore: "12/20" } },
    }, null);
    expect(rows).toEqual([
      { repo: "org/a", folder: "one", score: "0/20", discovery: "Discovery unavailable", result: "Local score" },
      { repo: "org/a", folder: "two", score: null, discovery: "Discovery unavailable", result: "No score shown" },
    ]);
  });

  it("keeps tree failure distinct from a scan without folders and preserves a provisional local score", () => {
    const rows = buildRepoGradesDashboard({
      "org/a": { old: { ...edit("5/10"), submissionTruncated: true, gradeError: "Latest request failed" } },
    }, { ...scan({ "org/a": null, "org/b": [], "org/c": null }), truncated: true });
    expect(rows).toEqual([
      {
        repo: "org/a",
        folder: "old",
        score: "5/10",
        result: "Local score · Submission truncated · Grading failed",
        discovery: "Repository tree scan failed",
      },
      { repo: "org/b", folder: null, score: null, result: "No score shown", discovery: "No folders reported" },
      { repo: "org/c", folder: null, score: null, result: "No score shown", discovery: "Repository tree scan failed" },
    ]);
  });

  it("groups confirmed repositories by student, keeps suggestions separate, and shows assignments across sources", () => {
    const edits = { "org/a": { "Lab 1": edit("0/10") } };
    const browser = buildRepoGradesDashboard(edits, scan({ "org/a": ["Lab 1"], "org/andrew": ["Lab 1"] }));
    const results = new Map<string, RepoGradeSavedResult>();
    const zero = attempt(5, "ORG/A", "Lab 1", 0);
    const historical = attempt(3, "org/old", "Lab 2", 90);
    addRepoGradeSavedPage(results, [attempt(7, "org/a", "Lab 1", null), zero, historical]);
    const matrix = buildRepoGradeMatrix(browser, edits, results,
      [{ folder: "Lab 1", assignmentId: "77" }], [{ id: "77", name: "First lab" }],
      [{ id: "1", name: "Andrew" }, { id: "2", name: "Lynn" }],
      [{ repo: "org/a", canvasUserId: "1", student: "Andrew" }, { repo: "org/old", canvasUserId: "1", student: "Andrew" }]);

    expect(matrix.columns).toEqual([{ folder: "Lab 1", label: "First lab" }, { folder: "Lab 2", label: "Lab 2" }]);
    expect(matrix.rows.map(({ key, name, repos }) => [key, name, repos.map((repo) => repo.name)])).toEqual([
      ["student:1", "Andrew", ["org/a", "org/old"]],
      ["student:2", "Lynn", []],
      ["repo:org/andrew", null, ["org/andrew"]],
    ]);
    const [local, old] = matrix.rows[0].repos;
    expect(local.cells.get("Lab 1")).toMatchObject({ local: { score: "0/10" }, saved: { latest: { generation: 7 }, scored: zero } });
    expect(local.cells.get("Lab 2")).toBeUndefined();
    expect(old.cells.get("Lab 2")?.saved?.scored).toEqual(historical);
  });

  it("keeps older score-bearing results across pages without mixing distinct assignment folders", () => {
    const results = new Map<string, RepoGradeSavedResult>();
    const failed = attempt(7, "org/a", "Lab", null);
    const lowerCaseFolder = attempt(6, "org/a", "lab", 65);
    const newestScore = attempt(5, "org/a", "Lab", 90);
    addRepoGradeSavedPage(results, [failed, lowerCaseFolder]);
    addRepoGradeSavedPage(results, [newestScore, attempt(4, "org/a", "Lab", 80)]);
    expect([...results.values()]).toEqual([
      { latest: failed, scored: newestScore },
      { latest: lowerCaseFolder, scored: lowerCaseFolder },
    ]);
  });

  it("keeps retained generated results even when the current browser draft has no score or feedback", () => {
    const source = { ...edit("9/10"), comment: "Generated feedback" };
    const retained = { id: "result-1", source, draft: { ...edit("8/10"), comment: "Reviewed feedback" } };
    const edits = { "org/a": { Lab: { ...edit(""), retainedResults: [retained] } } };
    const matrix = buildRepoGradeMatrix(buildRepoGradesDashboard(edits, null), edits, new Map(), [], [], [], []);
    const cell = matrix.rows[0].repos[0].cells.get("Lab");
    expect(cell?.local).toBeNull();
    expect(cell?.retained).toEqual([retained]);
  });

  it("merges confirmed pages with older fallback results across repeated incomplete refreshes", () => {
    const previous = new Map<string, RepoGradeSavedResult>();
    const firstRefresh = new Map<string, RepoGradeSavedResult>();
    const secondRefresh = new Map<string, RepoGradeSavedResult>();
    const older = attempt(4, "org/older", "Lab", 60);
    const prior = attempt(5, "org/a", "Lab", 70);
    const scored = attempt(6, "org/a", "Lab", 90);
    const latest = attempt(7, "org/a", "Lab", null);
    addRepoGradeSavedPage(previous, [prior, older]);
    addRepoGradeSavedPage(firstRefresh, [scored]);
    addRepoGradeSavedPage(secondRefresh, [latest]);
    const merged = mergeIncompleteRepoGradeResults(
      mergeIncompleteRepoGradeResults(previous, firstRefresh), secondRefresh,
    );
    expect([...merged.values()]).toEqual([{ latest, scored }, { latest: older, scored: older }]);
  });

  it("drops stale callbacks after a switch or return while retaining current edits", () => {
    const firstSelection = {};
    const otherSelection = {};
    const returnedSelection = {};
    const previousEdits = { "org/a": { one: edit("6/10") } };
    const state = { scope: returnedSelection, edits: previousEdits };
    const stale = vi.fn(() => ({}));

    expect(updateRepoGradesCourseEdits(state, firstSelection, stale)).toBe(state);
    expect(updateRepoGradesCourseEdits(state, otherSelection, stale)).toBe(state);
    expect(stale).not.toHaveBeenCalled();
    const current = { "org/a": { one: edit("7/10") } };
    expect(updateRepoGradesCourseEdits(state, returnedSelection, (edits) => {
      expect(edits).toBe(previousEdits);
      return current;
    })).toEqual({ scope: returnedSelection, edits: current });
  });
});

describe("visibleRepoGradebookRows", () => {
  const tree = scan({ "org/a": ["Lab"], "org/b": ["Lab"], "org/missing": [] });
  const roster = [{ id: "1", name: "Alice" }, { id: "2", name: "Bob" }];
  const bindings = ["org/a", "org/b", "org/archived", "org/missing"].map((repo) => ({
    repo, canvasUserId: "1", student: "Alice",
  }));
  const results = new Map<string, RepoGradeSavedResult>();
  addRepoGradeSavedPage(results, [attempt(1, "org/archived", "Lab", 89), attempt(2, "org/missing", "Lab", 70)]);
  const { rows: scannedRows, columns } = buildRepoGradeGridModel(tree.repos, roster, bindings, "");
  const matrix = buildRepoGradeMatrix(buildRepoGradesDashboard({}, tree), {}, results, columns, [], roster, bindings);

  it("groups operational and saved-only repos together, keeping scanned payloads in current sort order", () => {
    const rows = visibleRepoGradebookRows(matrix, scannedRows, [...scannedRows].reverse(), ALL_FOLDERS, "", false, DEFAULT_REPO_GRADE_SORT);
    expect(rows.map(({ name }) => name)).toEqual(["Alice", "Bob"]);
    expect(rows[0].repos.map(({ name }) => name)).toEqual(["org/missing", "org/b", "org/a", "org/archived"]);
    expect(rows[0].repos.slice(0, 3).map(({ active }) => active)).toEqual([...scannedRows].reverse());
    expect(rows[0].repos.at(-1)?.active).toBeUndefined();
  });

  it("does not leak searched or unselected operational repos back into the gradebook", () => {
    const selected = scannedRows.filter(({ repo }) => repo === "org/a");
    expect(visibleRepoGradebookRows(matrix, scannedRows, selected, "Lab", "", true, DEFAULT_REPO_GRADE_SORT)
      .flatMap(({ repos }) => repos.map(({ name }) => name))).toEqual(["org/a"]);
    expect(visibleRepoGradebookRows(matrix, scannedRows, [], ALL_FOLDERS, "Alice org/archived", false, DEFAULT_REPO_GRADE_SORT)
      .flatMap(({ repos }) => repos.map(({ name }) => name))).toEqual(["org/archived"]);
    expect(visibleRepoGradebookRows(matrix, scannedRows, [], ALL_FOLDERS, "Bob", false, DEFAULT_REPO_GRADE_SORT)
      .map(({ name }) => name)).toEqual(["Bob"]);
  });

  it("shows a saved result for a missing folder in folder scope without giving it grading controls", () => {
    const bodyRows = scannedRows.filter(({ repo }) => repo === "org/a");
    const rows = visibleRepoGradebookRows(matrix, scannedRows, bodyRows, "Lab", "Alice", false, DEFAULT_REPO_GRADE_SORT);
    expect(rows[0].repos.map(({ name, active }) => [name, active?.repo])).toEqual([
      ["org/a", "org/a"], ["org/missing", undefined], ["org/archived", undefined],
    ]);
  });

  it("sorts by the browser percentage when available, falls back to saved results, and keeps empty scores last", () => {
    const edits = { "org/a": { Lab: edit("2/10") } };
    const scores = new Map(results);
    addRepoGradeSavedPage(scores, [attempt(3, "org/a", "Lab", 95)]);
    const scoredMatrix = buildRepoGradeMatrix(buildRepoGradesDashboard(edits, tree), edits, scores, columns, [], roster, bindings);
    const visibleRepos = (direction: "asc" | "desc") => visibleRepoGradebookRows(
      scoredMatrix, scannedRows, scannedRows, "Lab", "", false, { field: "folder", folder: "Lab", direction },
    )[0].repos.map(({ name }) => name);
    expect(visibleRepos("asc")).toEqual(["org/a", "org/missing", "org/archived", "org/b"]);
    expect(visibleRepos("desc")).toEqual(["org/archived", "org/missing", "org/a", "org/b"]);
  });
});
