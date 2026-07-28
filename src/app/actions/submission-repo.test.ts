import { describe, it, expect, vi, beforeEach } from "vitest";

// fetchSubmissionRepoAction calls requireOwner() (auth) and the GitHub REST
// client (network) - both are mocked so the action's own wiring (URL parsing,
// ref/sha resolution, error messages, and the shape of the successful
// result) runs for real without a Supabase session or hitting GitHub. The
// underlying pure logic (URL parsing, bounds, file selection) is unit-tested
// directly in src/lib/submission-repo.test.ts.
vi.mock("@/lib/supabase/auth", () => ({
  requireOwner: vi.fn().mockResolvedValue({ id: "owner-1", email: "owner@example.com" }),
}));

vi.mock("@/lib/github", () => ({
  getRepo: vi.fn(),
  getRepoTree: vi.fn(),
  getFileText: vi.fn(),
  listCommits: vi.fn(),
}));

import { getRepo, getRepoTree, getFileText, listCommits } from "@/lib/github";
import { fetchSubmissionRepoAction } from "./submission-repo";

const mockGetRepo = getRepo as unknown as ReturnType<typeof vi.fn>;
const mockGetRepoTree = getRepoTree as unknown as ReturnType<typeof vi.fn>;
const mockGetFileText = getFileText as unknown as ReturnType<typeof vi.fn>;
const mockListCommits = listCommits as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("fetchSubmissionRepoAction", () => {
  it("returns a clear error for a non-GitHub URL without calling GitHub", async () => {
    const result = await fetchSubmissionRepoAction("https://gitlab.com/octo/cat");
    expect(result).toHaveProperty("error");
    expect(mockGetRepo).not.toHaveBeenCalled();
  });

  it("returns a clear error for garbage input without throwing", async () => {
    await expect(fetchSubmissionRepoAction("not a url????")).resolves.toHaveProperty("error");
  });

  it("fetches source files and returns the resolved commit sha as ref, plus repo and truncated", async () => {
    mockGetRepo.mockResolvedValueOnce({
      fullName: "octo/cat",
      owner: "octo",
      name: "cat",
      description: "",
      private: false,
      defaultBranch: "main",
      updatedAt: "",
      htmlUrl: "https://github.com/octo/cat",
      isTemplate: false,
      archived: false,
    });
    mockListCommits.mockResolvedValueOnce([
      { sha: "deadbeefcafe0123456789", message: "latest", author: "Octo", date: "2026-01-01", htmlUrl: "" },
    ]);
    mockGetRepoTree.mockResolvedValueOnce([
      { path: "main.py", type: "blob", size: 20, sha: "x" },
      { path: "node_modules/left-pad/index.js", type: "blob", size: 20, sha: "y" },
    ]);
    mockGetFileText.mockResolvedValueOnce("print('hi')");

    const result = await fetchSubmissionRepoAction("https://github.com/octo/cat");

    if ("error" in result) throw new Error(`expected success, got error: ${result.error}`);
    expect(result.ref).toBe("deadbeefcafe0123456789");
    expect(result.repo).toBe("octo/cat");
    expect(result.truncated).toBe(false);
    expect(result.files).toEqual([{ path: "main.py", text: "print('hi')" }]);

    // The tree/content calls all pin to the resolved commit sha, not the
    // branch name, so a repo that moves mid-fetch cannot produce a
    // Frankenstein mix of two commits.
    expect(mockGetRepoTree).toHaveBeenCalledWith("octo", "cat", "deadbeefcafe0123456789");
    expect(mockGetFileText).toHaveBeenCalledWith("octo", "cat", "main.py", "deadbeefcafe0123456789");
  });

  it("passes the requested ref and subpath through from a /tree/<ref>/<subpath> URL", async () => {
    mockGetRepo.mockResolvedValueOnce({
      fullName: "octo/cat",
      owner: "octo",
      name: "cat",
      description: "",
      private: false,
      defaultBranch: "main",
      updatedAt: "",
      htmlUrl: "",
      isTemplate: false,
      archived: false,
    });
    mockListCommits.mockResolvedValueOnce([{ sha: "abc123", message: "", author: "", date: "", htmlUrl: "" }]);
    mockGetRepoTree.mockResolvedValueOnce([
      { path: "src/main.py", type: "blob", size: 5, sha: "x" },
      { path: "other/skip.py", type: "blob", size: 5, sha: "y" },
    ]);
    mockGetFileText.mockResolvedValueOnce("x = 1");

    const result = await fetchSubmissionRepoAction("https://github.com/octo/cat/tree/dev/src");

    if ("error" in result) throw new Error(`expected success, got error: ${result.error}`);
    expect(mockListCommits).toHaveBeenCalledWith("octo", "cat", "dev", 1);
    expect(result.files).toEqual([{ path: "src/main.py", text: "x = 1" }]);
  });

  it("returns a clear, actionable error for a private or missing repo", async () => {
    mockGetRepo.mockRejectedValueOnce(new Error("GitHub resource not found (404). Check the owner/repo and the token's access."));

    const result = await fetchSubmissionRepoAction("https://github.com/octo/secret-repo");

    expect(result).toHaveProperty("error");
    if (!("error" in result)) throw new Error("expected error");
    expect(result.error).toMatch(/private|not found|could not find/i);
    expect(mockGetRepoTree).not.toHaveBeenCalled();
  });

  it("falls back to the branch name as ref when the commit lookup fails", async () => {
    mockGetRepo.mockResolvedValueOnce({
      fullName: "octo/cat",
      owner: "octo",
      name: "cat",
      description: "",
      private: false,
      defaultBranch: "main",
      updatedAt: "",
      htmlUrl: "",
      isTemplate: false,
      archived: false,
    });
    mockListCommits.mockRejectedValueOnce(new Error("boom"));
    mockGetRepoTree.mockResolvedValueOnce([{ path: "main.py", type: "blob", size: 5, sha: "x" }]);
    mockGetFileText.mockResolvedValueOnce("ok");

    const result = await fetchSubmissionRepoAction("https://github.com/octo/cat");

    if ("error" in result) throw new Error(`expected success, got error: ${result.error}`);
    expect(result.ref).toBe("main");
  });
});
