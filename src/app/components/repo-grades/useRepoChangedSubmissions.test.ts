import { describe, expect, it, vi } from "vitest";
import { changedEmptyTargets } from "./useRepoChangedSubmissions";
import type { OrgRepoTreesResult } from "@/lib/repo-grade-tree-scan";
import type { RepoGradeSavedResults } from "./repoGradesDashboardModel";

vi.mock("@/app/actions/repo-grade-automatic", () => ({ enqueueChangedRepoGradeAction: vi.fn() }));

describe("changed empty repository targets", () => {
  const sha = "b".repeat(40), old = "a".repeat(40);
  const scan: OrgRepoTreesResult = { truncated: false, rateLimit: null, repos: [{
    repo: "org/student", htmlUrl: "", defaultBranch: "main", sourceCommit: sha,
    folders: ["assignments/module_11"], error: null,
  }] };
  const attempt = { repo: "org/student", folder: "assignments/module_11", sourceRef: "main",
    commit: old, status: "no-submission" };
  const saved = new Map([["cell", { latest: attempt, scored: null }]]) as unknown as RepoGradeSavedResults;
  it("queues only the matching changed branch and exact assignment once", () => {
    expect(changedEmptyTargets(scan, "main", saved)).toEqual([
      { repo: "org/student", folder: "assignments/module_11", ref: "main", sha },
    ]);
    expect(changedEmptyTargets(scan, "release", saved)).toEqual([]);
    const withLatest = (latest: object) => new Map([["cell", { latest, scored: null }]]) as unknown as RepoGradeSavedResults;
    expect(changedEmptyTargets(scan, "main", withLatest({ ...attempt, commit: sha }))).toEqual([]);
    expect(changedEmptyTargets(scan, "main", withLatest({ ...attempt, folder: "other" }))).toEqual([]);
    expect(changedEmptyTargets(scan, "main", withLatest({ ...attempt, status: "succeeded", commit: "c".repeat(40) }))).toEqual([]);
    expect(changedEmptyTargets({ ...scan, truncated: true }, "main", saved)).toEqual([]);
    expect(changedEmptyTargets({ ...scan, repos: [{ ...scan.repos[0], partial: true }] }, "main", saved)).toEqual([]);
  });
});
