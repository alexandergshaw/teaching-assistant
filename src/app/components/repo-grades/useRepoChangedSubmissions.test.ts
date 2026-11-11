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
  const block = { repo: "org/student", folder: "assignments/module_11", sourceRef: "main",
    sourceSha: old, explanation: "", noSubmission: true as const };
  const saved: RepoGradeSavedResults = new Map();
  it("queues only the matching changed branch and exact assignment once", () => {
    expect(changedEmptyTargets(scan, "main", saved, [block, block])).toEqual([
      { repo: "org/student", folder: "assignments/module_11", ref: "main", sha },
    ]);
    expect(changedEmptyTargets(scan, "release", saved, [block])).toEqual([]);
    expect(changedEmptyTargets(scan, "main", saved, [{ ...block, sourceSha: sha }])).toEqual([]);
    expect(changedEmptyTargets(scan, "main", saved, [{ ...block, folder: "other" }])).toEqual([]);
    expect(changedEmptyTargets({ ...scan, truncated: true }, "main", saved, [block])).toEqual([]);
    expect(changedEmptyTargets({ ...scan, repos: [{ ...scan.repos[0], partial: true }] }, "main", saved, [block])).toEqual([]);
  });
});
