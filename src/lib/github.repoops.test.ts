import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  forkRepo,
  createBranch,
  mergePullRequest,
  listPullRequests,
  listWorkflowRuns,
} from "./github";

const ok = (v: unknown) => new Response(JSON.stringify(v), { status: 200 });
const empty = () => new Response(null, { status: 204 });

describe("github.repoops", () => {
  beforeEach(() => {
    process.env.GITHUB_TOKEN = "test-token";
  });

  afterEach(() => {
    delete process.env.GITHUB_TOKEN;
    vi.restoreAllMocks();
  });

  it("forkRepo without org POSTs to /repos/o/r/forks with empty body", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      ok({
        full_name: "newuser/myrepo",
        name: "myrepo",
        owner: { login: "newuser" },
        description: "Forked repo",
        private: false,
        default_branch: "main",
        updated_at: "2026-07-06T00:00:00Z",
        html_url: "https://github.com/newuser/myrepo",
        is_template: false,
        archived: false,
      })
    );

    const result = await forkRepo("original", "myrepo");

    const mockFetch = vi.mocked(global.fetch);
    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.github.com/repos/original/myrepo/forks",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "Content-Type": "application/json",
          Authorization: "Bearer test-token",
        }),
        body: JSON.stringify({}),
      })
    );
    expect(result.owner).toBe("newuser");
    expect(result.name).toBe("myrepo");
  });

  it("forkRepo with org POSTs to /repos/o/r/forks with organization in body", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      ok({
        full_name: "myorg/myrepo",
        name: "myrepo",
        owner: { login: "myorg" },
        description: null,
        private: true,
        default_branch: "main",
        updated_at: "2026-07-06T00:00:00Z",
        html_url: "https://github.com/myorg/myrepo",
        is_template: false,
        archived: false,
      })
    );

    await forkRepo("original", "myrepo", "myorg");

    const mockFetch = vi.mocked(global.fetch);
    const callArgs = mockFetch.mock.calls[0];
    expect(callArgs[0]).toBe("https://api.github.com/repos/original/myrepo/forks");
    const bodyStr = (callArgs[1] as RequestInit | undefined)?.body;
    expect(JSON.parse(bodyStr as string)).toEqual({ organization: "myorg" });
  });

  it("createBranch GETs the source branch SHA then POSTs new ref", async () => {
    const mockFetch = vi.spyOn(global, "fetch");
    mockFetch.mockResolvedValueOnce(
      ok({ object: { sha: "abc123" } })
    );
    mockFetch.mockResolvedValueOnce(empty());

    await createBranch("owner", "repo", "feature", "main");

    expect(mockFetch).toHaveBeenCalledTimes(2);
    const getCall = mockFetch.mock.calls[0];
    expect(getCall[0]).toContain("/git/ref/heads/main");

    const postCall = mockFetch.mock.calls[1];
    expect(postCall[0]).toContain("/git/refs");
    expect(postCall[1]).toMatchObject({ method: "POST" });
    const bodyStr = (postCall[1] as RequestInit | undefined)?.body;
    expect(JSON.parse(bodyStr as string)).toEqual({
      ref: "refs/heads/feature",
      sha: "abc123",
    });
  });

  it("mergePullRequest PUTs to /repos/o/r/pulls/n/merge with merge_method", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(empty());

    await mergePullRequest("owner", "repo", 7, "squash");

    const mockFetch = vi.mocked(global.fetch);
    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.github.com/repos/owner/repo/pulls/7/merge",
      expect.objectContaining({
        method: "PUT",
        headers: expect.objectContaining({
          "Content-Type": "application/json",
        }),
        body: JSON.stringify({ merge_method: "squash" }),
      })
    );
  });

  it("listPullRequests parses PR data into PullRequestInfo shape", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      ok([
        {
          number: 1,
          title: "Add feature",
          state: "open",
          html_url: "https://github.com/owner/repo/pull/1",
          head: { ref: "feature-branch" },
          base: { ref: "main" },
          draft: false,
          user: { login: "alice" },
        },
        {
          number: 2,
          title: "Fix bug",
          state: "closed",
          html_url: "https://github.com/owner/repo/pull/2",
          head: { ref: "bugfix" },
          base: { ref: "main" },
          draft: true,
          user: { login: "bob" },
        },
      ])
    );

    const result = await listPullRequests("owner", "repo", "open");

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      number: 1,
      title: "Add feature",
      state: "open",
      head: "feature-branch",
      base: "main",
      draft: false,
      user: "alice",
    });
    expect(result[1]).toMatchObject({
      number: 2,
      title: "Fix bug",
      state: "closed",
      head: "bugfix",
      base: "main",
      draft: true,
      user: "bob",
    });
  });

  it("listWorkflowRuns with branch filter includes branch in params", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      ok({
        workflow_runs: [
          {
            id: 12345,
            name: "Tests",
            status: "completed",
            conclusion: "success",
            head_branch: "main",
            html_url: "https://github.com/owner/repo/actions/runs/12345",
            created_at: "2026-07-06T00:00:00Z",
          },
        ],
      })
    );

    await listWorkflowRuns("owner", "repo", { branch: "main" });

    const mockFetch = vi.mocked(global.fetch);
    const callUrl = mockFetch.mock.calls[0][0] as string;
    expect(callUrl).toContain("/actions/runs");
    expect(callUrl).toContain("branch=main");
  });

  it("listWorkflowRuns maps runs to WorkflowRunInfo", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      ok({
        workflow_runs: [
          {
            id: 12345,
            name: "Tests",
            status: "completed",
            conclusion: "success",
            head_branch: "main",
            html_url: "https://github.com/owner/repo/actions/runs/12345",
            created_at: "2026-07-06T00:00:00Z",
          },
          {
            id: 12346,
            name: "Build",
            status: "in_progress",
            conclusion: null,
            head_branch: "develop",
            html_url: "https://github.com/owner/repo/actions/runs/12346",
            created_at: "2026-07-05T00:00:00Z",
          },
        ],
      })
    );

    const result = await listWorkflowRuns("owner", "repo");

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      id: 12345,
      name: "Tests",
      status: "completed",
      conclusion: "success",
      headBranch: "main",
    });
    expect(result[1]).toMatchObject({
      id: 12346,
      name: "Build",
      status: "in_progress",
      conclusion: null,
      headBranch: "develop",
    });
  });
});
