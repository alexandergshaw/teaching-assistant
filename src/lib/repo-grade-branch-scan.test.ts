import { describe, it, expect } from "vitest";
import {
  scanBranchesForUnmergedSubmission,
  MAX_BRANCHES_SCANNED,
  type BranchScanFetchers,
} from "./repo-grade-branch-scan";

// Every expectation below is a frozen literal, hand-written against
// docs/no-submission-and-requirement-checking-acceptance-criteria.md section
// 3 (G3), never computed from the implementation.

const NOW_MS = 1_700_000_000_000;

function fetchers(overrides: Partial<BranchScanFetchers> = {}): BranchScanFetchers {
  return {
    listBranches: async () => ({ branches: ["main"], defaultBranch: "main" }),
    fetchTree: async () => ({ entries: [], truncated: false }),
    ...overrides,
  };
}

describe("scanBranchesForUnmergedSubmission", () => {
  it("returns not-found with zero branches checked when the repo has no OTHER branches", async () => {
    const result = await scanBranchesForUnmergedSubmission(
      "org",
      "student-repo",
      "module_02",
      "main",
      fetchers({ listBranches: async () => ({ branches: ["main"], defaultBranch: "main" }) }),
      { now: () => NOW_MS }
    );

    expect(result).toEqual({ kind: "not-found", branchesChecked: 0, branchesSkipped: 0 });
  });

  it("finds a populated scoped folder on another branch and names it", async () => {
    const result = await scanBranchesForUnmergedSubmission(
      "org",
      "student-repo",
      "module_02",
      "main",
      fetchers({
        listBranches: async () => ({ branches: ["main", "feature-work"], defaultBranch: "main" }),
        fetchTree: async (_owner, _repo, branch) =>
          branch === "feature-work"
            ? { entries: [{ path: "module_02/trip_math.py", type: "blob" }], truncated: false }
            : { entries: [], truncated: false },
      }),
      { now: () => NOW_MS }
    );

    expect(result).toEqual({ kind: "found", branch: "feature-work", branchesChecked: 1, branchesSkipped: 0 });
  });

  it("does not count a scaffolding-only (.gitkeep) branch as found", async () => {
    const result = await scanBranchesForUnmergedSubmission(
      "org",
      "student-repo",
      "module_02",
      "main",
      fetchers({
        listBranches: async () => ({ branches: ["main", "empty-branch"], defaultBranch: "main" }),
        fetchTree: async () => ({ entries: [{ path: "module_02/.gitkeep", type: "blob" }], truncated: false }),
      }),
      { now: () => NOW_MS }
    );

    expect(result).toEqual({ kind: "not-found", branchesChecked: 1, branchesSkipped: 0 });
  });

  it("does not count a README-only branch as found (best-effort basename heuristic, G3c)", async () => {
    const result = await scanBranchesForUnmergedSubmission(
      "org",
      "student-repo",
      "module_02",
      "main",
      fetchers({
        listBranches: async () => ({ branches: ["main", "readme-only"], defaultBranch: "main" }),
        fetchTree: async () => ({ entries: [{ path: "module_02/README.md", type: "blob" }], truncated: false }),
      }),
      { now: () => NOW_MS }
    );

    expect(result).toEqual({ kind: "not-found", branchesChecked: 1, branchesSkipped: 0 });
  });

  it("ignores a real file OUTSIDE the scoped prefix on another branch", async () => {
    const result = await scanBranchesForUnmergedSubmission(
      "org",
      "student-repo",
      "module_02",
      "main",
      fetchers({
        listBranches: async () => ({ branches: ["main", "unrelated-work"], defaultBranch: "main" }),
        fetchTree: async () => ({ entries: [{ path: "module_09/other.py", type: "blob" }], truncated: false }),
      }),
      { now: () => NOW_MS }
    );

    expect(result).toEqual({ kind: "not-found", branchesChecked: 1, branchesSkipped: 0 });
  });

  it("excludes a tree entry (folder), not just a blob, from counting as found", async () => {
    const result = await scanBranchesForUnmergedSubmission(
      "org",
      "student-repo",
      "module_02",
      "main",
      fetchers({
        listBranches: async () => ({ branches: ["main", "branch-with-empty-dir"], defaultBranch: "main" }),
        fetchTree: async () => ({ entries: [{ path: "module_02/subdir", type: "tree" }], truncated: false }),
      }),
      { now: () => NOW_MS }
    );

    expect(result).toEqual({ kind: "not-found", branchesChecked: 1, branchesSkipped: 0 });
  });

  describe("could-not-determine states (G3d) never collapse into not-found", () => {
    it("listBranches itself failing (e.g. the repo 404s) is undetermined, not not-found", async () => {
      const result = await scanBranchesForUnmergedSubmission(
        "org",
        "student-repo",
        "module_02",
        "main",
        fetchers({
          listBranches: async () => {
            throw new Error("GitHub resource not found (404). Check the owner/repo and the token's access.");
          },
        }),
        { now: () => NOW_MS }
      );

      expect(result.kind).toBe("undetermined");
      if (result.kind !== "undetermined") throw new Error("expected undetermined");
      expect(result.reason).toContain("GitHub request failed (HTTP 404)");
      expect(result.branchesChecked).toBe(0);
      expect(result.branchesSkipped).toBe(0);
    });

    it("a 409 (empty repository) fetching one branch's tree is undetermined, not not-found", async () => {
      const result = await scanBranchesForUnmergedSubmission(
        "org",
        "student-repo",
        "module_02",
        "main",
        fetchers({
          listBranches: async () => ({ branches: ["main", "odd-branch"], defaultBranch: "main" }),
          fetchTree: async () => {
            throw new Error("GitHub request failed (HTTP 409): Git Repository is empty.");
          },
        }),
        { now: () => NOW_MS }
      );

      expect(result.kind).toBe("undetermined");
      if (result.kind !== "undetermined") throw new Error("expected undetermined");
      expect(result.reason).toContain("HTTP 409");
      expect(result.branchesChecked).toBe(1);
    });

    it("a truncated tree with nothing found on the visible portion is undetermined, not not-found", async () => {
      const result = await scanBranchesForUnmergedSubmission(
        "org",
        "student-repo",
        "module_02",
        "main",
        fetchers({
          listBranches: async () => ({ branches: ["main", "big-branch"], defaultBranch: "main" }),
          fetchTree: async () => ({ entries: [], truncated: true }),
        }),
        { now: () => NOW_MS }
      );

      expect(result.kind).toBe("undetermined");
      if (result.kind !== "undetermined") throw new Error("expected undetermined");
      expect(result.reason).toContain("truncated");
      expect(result.reason).toContain("big-branch");
    });

    it("a POSITIVE finding on a truncated branch is still trusted as found (only absence is downgraded)", async () => {
      const result = await scanBranchesForUnmergedSubmission(
        "org",
        "student-repo",
        "module_02",
        "main",
        fetchers({
          listBranches: async () => ({ branches: ["main", "big-branch"], defaultBranch: "main" }),
          fetchTree: async () => ({
            entries: [{ path: "module_02/real_work.py", type: "blob" }],
            truncated: true,
          }),
        }),
        { now: () => NOW_MS }
      );

      expect(result).toEqual({ kind: "found", branch: "big-branch", branchesChecked: 1, branchesSkipped: 0 });
    });

    it("a rate-limit refusal fetching a branch's tree is undetermined, and its message is preferred over a plain error from another branch", async () => {
      const result = await scanBranchesForUnmergedSubmission(
        "org",
        "student-repo",
        "module_02",
        "main",
        fetchers({
          listBranches: async () => ({ branches: ["main", "branch-a", "branch-b"], defaultBranch: "main" }),
          fetchTree: async (_owner, _repo, branch) => {
            if (branch === "branch-a") throw new Error("GitHub request failed (HTTP 429): secondary rate limit.");
            throw new Error("GitHub resource not found (404). Check the owner/repo and the token's access.");
          },
        }),
        { now: () => NOW_MS }
      );

      expect(result.kind).toBe("undetermined");
      if (result.kind !== "undetermined") throw new Error("expected undetermined");
      expect(result.reason).toContain("rate limit was hit");
      expect(result.reason).toContain("1 other branch could not be checked either");
      expect(result.branchesChecked).toBe(2);
    });
  });

  describe("the branch cap (G3c) is enforced and reported", () => {
    it("checks only MAX_BRANCHES_SCANNED branches and reports the rest as skipped", async () => {
      const otherBranches = Array.from({ length: MAX_BRANCHES_SCANNED + 4 }, (_, i) => `branch-${i}`);
      const result = await scanBranchesForUnmergedSubmission(
        "org",
        "student-repo",
        "module_02",
        "main",
        fetchers({ listBranches: async () => ({ branches: ["main", ...otherBranches], defaultBranch: "main" }) }),
        { now: () => NOW_MS }
      );

      expect(result).toEqual({
        kind: "not-found",
        branchesChecked: MAX_BRANCHES_SCANNED,
        branchesSkipped: 4,
      });
    });

    it("honours a custom cap for testing without depending on the real default", async () => {
      const otherBranches = ["b1", "b2", "b3", "b4", "b5"];
      const result = await scanBranchesForUnmergedSubmission(
        "org",
        "student-repo",
        "module_02",
        "main",
        fetchers({ listBranches: async () => ({ branches: ["main", ...otherBranches], defaultBranch: "main" }) }),
        { now: () => NOW_MS, maxBranches: 2 }
      );

      expect(result).toEqual({ kind: "not-found", branchesChecked: 2, branchesSkipped: 3 });
    });

    it("a maxBranches of 0 checks nothing and reports every candidate as skipped", async () => {
      const result = await scanBranchesForUnmergedSubmission(
        "org",
        "student-repo",
        "module_02",
        "main",
        fetchers({
          listBranches: async () => ({ branches: ["main", "b1", "b2"], defaultBranch: "main" }),
          fetchTree: async () => {
            throw new Error("this must never be called when maxBranches is 0");
          },
        }),
        { now: () => NOW_MS, maxBranches: 0 }
      );

      expect(result).toEqual({ kind: "not-found", branchesChecked: 0, branchesSkipped: 2 });
    });
  });

  describe("establishing the graded branch (G3e)", () => {
    it("excludes the EXPLICIT branch argument from candidates, even though it differs from the repo's default branch", async () => {
      const result = await scanBranchesForUnmergedSubmission(
        "org",
        "student-repo",
        "module_02",
        "the-graded-branch",
        fetchers({
          listBranches: async () => ({
            branches: ["main", "the-graded-branch", "other-branch"],
            defaultBranch: "main",
          }),
          fetchTree: async () => ({ entries: [], truncated: false }),
        }),
        { now: () => NOW_MS }
      );

      // Two candidates left: "main" and "other-branch" - "the-graded-branch"
      // itself must never be checked against itself.
      expect(result).toEqual({ kind: "not-found", branchesChecked: 2, branchesSkipped: 0 });
    });

    it("falls back to the repo's default branch when no explicit branch was graded", async () => {
      const checked: string[] = [];
      const result = await scanBranchesForUnmergedSubmission(
        "org",
        "student-repo",
        "module_02",
        undefined,
        fetchers({
          listBranches: async () => ({ branches: ["main", "side-branch"], defaultBranch: "main" }),
          fetchTree: async (_owner, _repo, branch) => {
            checked.push(branch);
            return { entries: [], truncated: false };
          },
        }),
        { now: () => NOW_MS }
      );

      expect(checked).toEqual(["side-branch"]);
      expect(result).toEqual({ kind: "not-found", branchesChecked: 1, branchesSkipped: 0 });
    });
  });

  it("scopes candidate files to pathPrefix case-insensitively with a trailing-slash boundary, mirroring selectDigestFiles", async () => {
    const result = await scanBranchesForUnmergedSubmission(
      "org",
      "student-repo",
      "week1",
      "main",
      fetchers({
        listBranches: async () => ({ branches: ["main", "other"], defaultBranch: "main" }),
        // "week10/x.py" must NOT match a "week1" prefix.
        fetchTree: async () => ({ entries: [{ path: "WEEK10/x.py", type: "blob" }], truncated: false }),
      }),
      { now: () => NOW_MS }
    );

    expect(result).toEqual({ kind: "not-found", branchesChecked: 1, branchesSkipped: 0 });
  });

  it("with no pathPrefix, any real file anywhere in the repo on another branch counts as found", async () => {
    const result = await scanBranchesForUnmergedSubmission(
      "org",
      "student-repo",
      undefined,
      "main",
      fetchers({
        listBranches: async () => ({ branches: ["main", "other"], defaultBranch: "main" }),
        fetchTree: async () => ({ entries: [{ path: "anything.py", type: "blob" }], truncated: false }),
      }),
      { now: () => NOW_MS }
    );

    expect(result).toEqual({ kind: "found", branch: "other", branchesChecked: 1, branchesSkipped: 0 });
  });
});
