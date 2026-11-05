import { describe, expect, it, vi } from "vitest";
import type { OrgRepoTreesResult } from "@/lib/repo-grade-tree-scan";
import { defaultRepoGradeCellEdit, type RepoGradeCellEditsByRepo } from "./repoGradesCellEdits";
import { buildRepoGradesDashboard, updateRepoGradesCourseEdits } from "./repoGradesDashboardModel";

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
