import { describe, it, expect, vi, beforeEach } from "vitest";

// fetchGradableRepoContent talks to GitHub only through these four functions -
// mock them so URL parsing / ref resolution / file selection / error mapping
// run for real without hitting the network. Mirrors the mocking pattern in
// src/app/actions/submission-repo.test.ts (which exercises the sibling
// on-demand "Load code" fetch built from the same primitives).
vi.mock("../github", () => ({
  getRepo: vi.fn(),
  getRepoTree: vi.fn(),
  getFileText: vi.fn(),
  listCommits: vi.fn(),
}));

import { getRepo, getRepoTree, getFileText, listCommits } from "../github";
import { fetchGradableRepoContent } from "./repo-content";

const mockGetRepo = vi.mocked(getRepo);
const mockGetRepoTree = vi.mocked(getRepoTree);
const mockGetFileText = vi.mocked(getFileText);
const mockListCommits = vi.mocked(listCommits);

function fakeRepo(defaultBranch = "main") {
  return {
    fullName: "octo/cat",
    owner: "octo",
    name: "cat",
    description: "",
    private: false,
    defaultBranch,
    updatedAt: "",
    htmlUrl: "https://github.com/octo/cat",
    isTemplate: false,
    archived: false,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("fetchGradableRepoContent - URL forms (AC2.2)", () => {
  it("returns a clear error for a non-GitHub URL without calling GitHub", async () => {
    const result = await fetchGradableRepoContent("https://gitlab.com/octo/cat");
    expect(result).toHaveProperty("error");
    expect(mockGetRepo).not.toHaveBeenCalled();
  });

  it("returns a clear error for garbage input without throwing", async () => {
    await expect(fetchGradableRepoContent("not a url????")).resolves.toHaveProperty("error");
  });

  it("fetches a plain github.com/owner/repo URL against the default branch", async () => {
    mockGetRepo.mockResolvedValueOnce(fakeRepo("main"));
    mockListCommits.mockResolvedValueOnce([{ sha: "deadbeefcafe0123456789", message: "", author: "", date: "", htmlUrl: "" }]);
    mockGetRepoTree.mockResolvedValueOnce([{ path: "main.py", type: "blob", size: 20, sha: "x" }]);
    mockGetFileText.mockResolvedValueOnce("print('hi')");

    const result = await fetchGradableRepoContent("https://github.com/octo/cat");

    if ("error" in result) throw new Error(`expected success, got error: ${result.error}`);
    expect(result.repo).toBe("octo/cat");
    expect(result.ref).toBe("deadbeefcafe0123456789");
    expect(result.content).toContain("File: main.py");
    expect(result.content).toContain("print('hi')");
    expect(mockGetRepoTree).toHaveBeenCalledWith("octo", "cat", "deadbeefcafe0123456789");
  });

  it("handles a trailing slash", async () => {
    mockGetRepo.mockResolvedValueOnce(fakeRepo());
    mockListCommits.mockResolvedValueOnce([{ sha: "sha1", message: "", author: "", date: "", htmlUrl: "" }]);
    mockGetRepoTree.mockResolvedValueOnce([{ path: "main.py", type: "blob", size: 5, sha: "x" }]);
    mockGetFileText.mockResolvedValueOnce("x = 1");

    const result = await fetchGradableRepoContent("https://github.com/octo/cat/");
    if ("error" in result) throw new Error(`expected success, got error: ${result.error}`);
    expect(result.repo).toBe("octo/cat");
  });

  it("handles a .git suffix", async () => {
    mockGetRepo.mockResolvedValueOnce(fakeRepo());
    mockListCommits.mockResolvedValueOnce([{ sha: "sha1", message: "", author: "", date: "", htmlUrl: "" }]);
    mockGetRepoTree.mockResolvedValueOnce([{ path: "main.py", type: "blob", size: 5, sha: "x" }]);
    mockGetFileText.mockResolvedValueOnce("x = 1");

    const result = await fetchGradableRepoContent("https://github.com/octo/cat.git");
    if ("error" in result) throw new Error(`expected success, got error: ${result.error}`);
    expect(result.repo).toBe("octo/cat");
    expect(mockGetRepo).toHaveBeenCalledWith("octo", "cat");
  });

  it("handles a /tree/<branch> deep link and reads that branch", async () => {
    mockGetRepo.mockResolvedValueOnce(fakeRepo("main"));
    mockListCommits.mockResolvedValueOnce([{ sha: "branchsha", message: "", author: "", date: "", htmlUrl: "" }]);
    mockGetRepoTree.mockResolvedValueOnce([{ path: "main.py", type: "blob", size: 5, sha: "x" }]);
    mockGetFileText.mockResolvedValueOnce("x = 1");

    const result = await fetchGradableRepoContent("https://github.com/octo/cat/tree/dev");
    if ("error" in result) throw new Error(`expected success, got error: ${result.error}`);
    expect(mockListCommits).toHaveBeenCalledWith("octo", "cat", "dev", 1);
  });

  it("handles a /tree/<branch>/<subpath> deep link into a folder", async () => {
    mockGetRepo.mockResolvedValueOnce(fakeRepo("main"));
    mockListCommits.mockResolvedValueOnce([{ sha: "sha1", message: "", author: "", date: "", htmlUrl: "" }]);
    mockGetRepoTree.mockResolvedValueOnce([
      { path: "src/main.py", type: "blob", size: 5, sha: "x" },
      { path: "other/skip.py", type: "blob", size: 5, sha: "y" },
    ]);
    mockGetFileText.mockResolvedValueOnce("x = 1");

    const result = await fetchGradableRepoContent("https://github.com/octo/cat/tree/dev/src");
    if ("error" in result) throw new Error(`expected success, got error: ${result.error}`);
    expect(result.content).toContain("src/main.py");
    expect(result.content).not.toContain("other/skip.py");
  });
});

describe("fetchGradableRepoContent - degraded/failure modes (AC2.3)", () => {
  it("names the repo and reason for a private/missing repo (404)", async () => {
    mockGetRepo.mockRejectedValueOnce(new Error("GitHub resource not found (404). Check the owner/repo and the token's access."));

    const result = await fetchGradableRepoContent("https://github.com/octo/secret-repo");
    expect(result).toHaveProperty("error");
    if (!("error" in result)) throw new Error("expected error");
    expect(result.error).toContain("octo/secret-repo");
    expect(mockGetRepoTree).not.toHaveBeenCalled();
  });

  it("names the repo for a non-404 GitHub API failure", async () => {
    mockGetRepo.mockRejectedValueOnce(new Error("GitHub forbidden (403): rate limit hit."));

    const result = await fetchGradableRepoContent("https://github.com/octo/cat");
    expect(result).toHaveProperty("error");
    if (!("error" in result)) throw new Error("expected error");
    expect(result.error).toContain("octo/cat");
    expect(result.error).toContain("rate limit hit");
  });

  it("falls back to the branch name as ref when the commit lookup fails, and still succeeds", async () => {
    mockGetRepo.mockResolvedValueOnce(fakeRepo("main"));
    mockListCommits.mockRejectedValueOnce(new Error("boom"));
    mockGetRepoTree.mockResolvedValueOnce([{ path: "main.py", type: "blob", size: 5, sha: "x" }]);
    mockGetFileText.mockResolvedValueOnce("ok");

    const result = await fetchGradableRepoContent("https://github.com/octo/cat");
    if ("error" in result) throw new Error(`expected success, got error: ${result.error}`);
    expect(result.ref).toBe("main");
  });

  it("returns an error when the repo tree cannot be read", async () => {
    mockGetRepo.mockResolvedValueOnce(fakeRepo());
    mockListCommits.mockResolvedValueOnce([{ sha: "sha1", message: "", author: "", date: "", htmlUrl: "" }]);
    mockGetRepoTree.mockRejectedValueOnce(new Error("tree unreadable"));

    const result = await fetchGradableRepoContent("https://github.com/octo/cat");
    expect(result).toHaveProperty("error");
    if (!("error" in result)) throw new Error("expected error");
    expect(result.error).toContain("octo/cat");
  });

  it("returns an error when no recognized source files are found", async () => {
    mockGetRepo.mockResolvedValueOnce(fakeRepo());
    mockListCommits.mockResolvedValueOnce([{ sha: "sha1", message: "", author: "", date: "", htmlUrl: "" }]);
    mockGetRepoTree.mockResolvedValueOnce([{ path: "package-lock.json", type: "blob", size: 5, sha: "x" }]);

    const result = await fetchGradableRepoContent("https://github.com/octo/cat");
    expect(result).toHaveProperty("error");
    if (!("error" in result)) throw new Error("expected error");
    expect(result.error).toContain("octo/cat");
    expect(mockGetFileText).not.toHaveBeenCalled();
  });

  it("returns an error when every selected file fails to fetch", async () => {
    mockGetRepo.mockResolvedValueOnce(fakeRepo());
    mockListCommits.mockResolvedValueOnce([{ sha: "sha1", message: "", author: "", date: "", htmlUrl: "" }]);
    mockGetRepoTree.mockResolvedValueOnce([{ path: "main.py", type: "blob", size: 5, sha: "x" }]);
    mockGetFileText.mockRejectedValueOnce(new Error("unreadable"));

    const result = await fetchGradableRepoContent("https://github.com/octo/cat");
    expect(result).toHaveProperty("error");
  });
});
