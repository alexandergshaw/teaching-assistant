// Group A: what threading real GitHub response headers through to
// classifyGithubFailure actually buys the Repo Grades scan.
//
// Kept in its OWN file so repo-grade-tree-scan.test.ts stays byte-identical.
// That file's fixtures all throw plain Errors with ghError-shaped messages,
// which means it now exercises the message-parsing FALLBACK path. Leaving it
// untouched and green is the evidence that adding the preferred structured
// path did not break the weaker one - which is the failure mode that matters,
// since a network error carries no status by either route.

import { describe, it, expect } from "vitest";
import { scanOrgRepoTrees, type OrgRepoTreeFetchers } from "./repo-grade-tree-scan";
import { GithubHttpError } from "./github-http-error";

const NOW_MS = 1_700_000_000_000;
/** NOW_MS + 10 minutes, expressed as the UNIX SECONDS value GitHub sends. */
const RESET_UNIX_SECONDS = "1700000600";

function fakeRepo(fullName: string) {
  return { fullName, htmlUrl: `https://github.com/${fullName}` };
}

/** A failure shaped exactly like the one ghFetch now throws: ghError's real
 * message text, the real status, and real response headers. */
function githubHttpError(message: string, status: number, headers: Record<string, string>): GithubHttpError {
  return new GithubHttpError(message, status, new Headers(headers));
}

const FORBIDDEN_MESSAGE = "GitHub forbidden (403): API rate limit exceeded for installation ID 12345.";

describe("a 403 that IS a primary-quota rate limit", () => {
  // THE case that was unresolvable before this change. Both a quota-exhausted
  // token and a scope-missing token arrive as a bare 403; only the headers
  // tell them apart, and the headers used to be discarded at the throw site.

  it("classifies as rate-limited, with the reset time, when x-ratelimit-remaining is 0", async () => {
    const fetchers: OrgRepoTreeFetchers = {
      listRepos: async () => [fakeRepo("org/alice-repo")],
      fetchTreePaths: async () => {
        throw githubHttpError(FORBIDDEN_MESSAGE, 403, {
          "x-ratelimit-remaining": "0",
          "x-ratelimit-reset": RESET_UNIX_SECONDS,
        });
      },
    };

    const result = await scanOrgRepoTrees("org", undefined, undefined, fetchers, { now: () => NOW_MS });

    expect(result).toEqual({
      repos: [
        {
          repo: "org/alice-repo",
          htmlUrl: "https://github.com/org/alice-repo",
          folders: null,
          error: "GitHub's API rate limit was hit (HTTP 403, 0 requests remaining); it resets in about 10 minutes.",
        },
      ],
      truncated: false,
      rateLimit: {
        kind: "rate-limited",
        message: "GitHub's API rate limit was hit (HTTP 403, 0 requests remaining); it resets in about 10 minutes.",
        resetAtMs: 1_700_000_600_000,
        remaining: 0,
      },
    });
  });

  it("still says 'forbidden' for a 403 with quota REMAINING - the headers resolve it both ways, not just one", async () => {
    const fetchers: OrgRepoTreeFetchers = {
      listRepos: async () => [fakeRepo("org/alice-repo")],
      fetchTreePaths: async () => {
        throw githubHttpError(FORBIDDEN_MESSAGE, 403, {
          "x-ratelimit-remaining": "4999",
          "x-ratelimit-reset": RESET_UNIX_SECONDS,
        });
      },
    };

    const result = await scanOrgRepoTrees("org", undefined, undefined, fetchers, { now: () => NOW_MS });

    expect(result).toMatchObject({ rateLimit: { kind: "forbidden", remaining: 4999, resetAtMs: null } });
    expect(result).toMatchObject({
      repos: [{ error: expect.stringContaining("This is not a rate limit (4999 requests remaining") }],
    });
  });

  it("promotes the rate limit to the scan-wide banner even when a forbidden row was seen first", async () => {
    const fetchers: OrgRepoTreeFetchers = {
      listRepos: async () => [fakeRepo("org/a"), fakeRepo("org/b")],
      fetchTreePaths: async (fullName) => {
        throw fullName === "org/a"
          ? githubHttpError(FORBIDDEN_MESSAGE, 403, { "x-ratelimit-remaining": "4999" })
          : githubHttpError(FORBIDDEN_MESSAGE, 403, { "x-ratelimit-remaining": "0", "x-ratelimit-reset": RESET_UNIX_SECONDS });
      },
    };

    const result = await scanOrgRepoTrees("org", undefined, undefined, fetchers, { now: () => NOW_MS });

    expect(result).toMatchObject({ rateLimit: { kind: "rate-limited", resetAtMs: 1_700_000_600_000 } });
  });
});

describe("the org-level listRepos failure", () => {
  it("uses the structured status and headers too, not just the per-repo path", async () => {
    const fetchers: OrgRepoTreeFetchers = {
      listRepos: async () => {
        throw githubHttpError(FORBIDDEN_MESSAGE, 403, {
          "x-ratelimit-remaining": "0",
          "x-ratelimit-reset": RESET_UNIX_SECONDS,
        });
      },
      fetchTreePaths: async () => [],
    };

    const result = await scanOrgRepoTrees("org", undefined, undefined, fetchers, { now: () => NOW_MS });

    expect(result).toEqual({
      error: "GitHub's API rate limit was hit (HTTP 403, 0 requests remaining); it resets in about 10 minutes.",
    });
  });
});

describe("a structured error with NO rate-limit headers", () => {
  it("a headerless 429 is still rate-limited - the status alone is the confirmation", async () => {
    // GitHub's secondary/abuse-detection limit frequently omits x-ratelimit-*
    // entirely, so this shape is real, not hypothetical.
    const fetchers: OrgRepoTreeFetchers = {
      listRepos: async () => [fakeRepo("org/alice-repo")],
      fetchTreePaths: async () => {
        throw githubHttpError("GitHub request failed (HTTP 429): You have exceeded a secondary rate limit.", 429, {});
      },
    };

    const result = await scanOrgRepoTrees("org", undefined, undefined, fetchers, { now: () => NOW_MS });

    expect(result).toMatchObject({
      rateLimit: {
        kind: "rate-limited",
        message: "GitHub's API rate limit was hit (HTTP 429, no remaining count reported); GitHub did not report when it resets.",
        resetAtMs: null,
      },
    });
  });

  it("a headerless 403 falls to forbidden rather than guessing rate-limited without evidence", async () => {
    const fetchers: OrgRepoTreeFetchers = {
      listRepos: async () => [fakeRepo("org/alice-repo")],
      fetchTreePaths: async () => {
        throw githubHttpError(FORBIDDEN_MESSAGE, 403, {});
      },
    };

    const result = await scanOrgRepoTrees("org", undefined, undefined, fetchers, { now: () => NOW_MS });

    expect(result).toMatchObject({ rateLimit: { kind: "forbidden", remaining: null } });
  });
});

describe("the message-parsing fallback still carries non-ghFetch failures", () => {
  it("a plain Error with a ghError-shaped message is still classified", async () => {
    const fetchers: OrgRepoTreeFetchers = {
      listRepos: async () => [fakeRepo("org/alice-repo")],
      fetchTreePaths: async () => {
        throw new Error("GitHub request failed (HTTP 429): You have exceeded a secondary rate limit.");
      },
    };

    const result = await scanOrgRepoTrees("org", undefined, undefined, fetchers, { now: () => NOW_MS });

    expect(result).toMatchObject({ rateLimit: { kind: "rate-limited" } });
  });

  it("a failure with no status by EITHER route surfaces its raw message, unclassified", async () => {
    const fetchers: OrgRepoTreeFetchers = {
      listRepos: async () => [fakeRepo("org/alice-repo")],
      fetchTreePaths: async () => {
        throw new Error("fetch failed");
      },
    };

    const result = await scanOrgRepoTrees("org", undefined, undefined, fetchers, { now: () => NOW_MS });

    expect(result).toEqual({
      repos: [{ repo: "org/alice-repo", htmlUrl: "https://github.com/org/alice-repo", folders: null, error: "fetch failed" }],
      truncated: false,
      rateLimit: null,
    });
  });

  it("one repo's structured failure never blocks another repo's row from succeeding", async () => {
    const fetchers: OrgRepoTreeFetchers = {
      listRepos: async () => [fakeRepo("org/a"), fakeRepo("org/b")],
      fetchTreePaths: async (fullName) => {
        if (fullName === "org/a") {
          throw githubHttpError(FORBIDDEN_MESSAGE, 403, { "x-ratelimit-remaining": "0", "x-ratelimit-reset": RESET_UNIX_SECONDS });
        }
        return ["week-1/main.py"];
      },
    };

    const result = await scanOrgRepoTrees("org", undefined, undefined, fetchers, { now: () => NOW_MS });

    expect(result).toMatchObject({
      repos: [{ repo: "org/a", folders: null }, { repo: "org/b", folders: ["week-1"], error: null }],
    });
  });
});
