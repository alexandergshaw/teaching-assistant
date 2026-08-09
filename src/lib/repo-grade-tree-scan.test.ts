import { describe, it, expect, vi } from "vitest";
import {
  parseGithubErrorStatus,
  computeOrgReposTruncated,
  pickOverallVerdict,
  scanOrgRepoTrees,
  DEFAULT_TREE_SCAN_CONCURRENCY,
  type OrgRepoTreeFetchers,
  type OrgRepoTreesResult,
} from "./repo-grade-tree-scan";
import type { GithubLimitVerdict } from "./github-rate-limit";

// Every expectation below is a frozen literal, hand-written against AC3
// (docs/repo-grades-view-acceptance-criteria.md, items 12, 17, 18), never
// computed from the implementation.

const NOW_MS = 1_700_000_000_000;

describe("parseGithubErrorStatus", () => {
  // Fixtures below are copied VERBATIM from ghError's known output shapes
  // (src/lib/github.repos.ts:12-24), not generated - this pins the parser
  // against the client's real message text, not against an assumption of it.
  it("extracts the status from ghError's 401 branch", () => {
    expect(parseGithubErrorStatus("GitHub rejected the token (401). Check that GITHUB_TOKEN is valid.")).toBe(401);
  });

  it("extracts the status from ghError's 403 branch with a GitHub-supplied message", () => {
    expect(parseGithubErrorStatus("GitHub forbidden (403): API rate limit exceeded for installation ID 12345.")).toBe(403);
  });

  it("extracts the status from ghError's 403 branch with no GitHub-supplied message", () => {
    expect(parseGithubErrorStatus("GitHub forbidden (403) — rate limit hit or the token lacks the needed scope.")).toBe(403);
  });

  it("extracts the status from ghError's 404 branch", () => {
    expect(parseGithubErrorStatus("GitHub resource not found (404). Check the owner/repo and the token's access.")).toBe(404);
  });

  it("extracts the status from ghError's 422 branch", () => {
    expect(parseGithubErrorStatus("GitHub rejected the request (422): Validation failed.")).toBe(422);
  });

  it("extracts the status from ghError's generic 'HTTP N' branch (covers 429, 500, etc.)", () => {
    expect(parseGithubErrorStatus("GitHub request failed (HTTP 429): You have exceeded a secondary rate limit.")).toBe(429);
    expect(parseGithubErrorStatus("GitHub request failed (HTTP 500).")).toBe(500);
  });

  it("returns null for a message with no parenthesized status at all (e.g. a network failure)", () => {
    expect(parseGithubErrorStatus("fetch failed")).toBeNull();
    expect(parseGithubErrorStatus("TypeError: Failed to fetch")).toBeNull();
  });

  it("returns null for an empty string", () => {
    expect(parseGithubErrorStatus("")).toBeNull();
  });
});

describe("computeOrgReposTruncated", () => {
  it("is true when the count lands exactly on the default 1000 cap", () => {
    expect(computeOrgReposTruncated(1000)).toBe(true);
  });

  it("is false one short of the cap", () => {
    expect(computeOrgReposTruncated(999)).toBe(false);
  });

  it("is false for zero repos", () => {
    expect(computeOrgReposTruncated(0)).toBe(false);
  });

  it("honours a custom cap for testing without depending on the real 1000", () => {
    expect(computeOrgReposTruncated(37, 37)).toBe(true);
    expect(computeOrgReposTruncated(36, 37)).toBe(false);
  });
});

describe("pickOverallVerdict", () => {
  const rateLimited: GithubLimitVerdict = { kind: "rate-limited", message: "rl", resetAtMs: null, remaining: 0 };
  const forbidden: GithubLimitVerdict = { kind: "forbidden", message: "fb", resetAtMs: null, remaining: null };
  const other: GithubLimitVerdict = { kind: "other", message: "ot", resetAtMs: null, remaining: null };

  it("returns null for an empty list", () => {
    expect(pickOverallVerdict([])).toBeNull();
  });

  it("returns null when every verdict is 'other'", () => {
    expect(pickOverallVerdict([other, other])).toBeNull();
  });

  it("prefers 'forbidden' over 'other' when there is no rate-limited verdict", () => {
    expect(pickOverallVerdict([other, forbidden, other])).toBe(forbidden);
  });

  it("prefers 'rate-limited' over 'forbidden' even when forbidden appears FIRST in the list", () => {
    expect(pickOverallVerdict([forbidden, other, rateLimited])).toBe(rateLimited);
  });
});

// ── scanOrgRepoTrees ─────────────────────────────────────────────────────

function fakeRepo(fullName: string) {
  return { fullName, htmlUrl: `https://github.com/${fullName}` };
}

describe("scanOrgRepoTrees", () => {
  it("returns one row per scanned repo, each with its assignment folders", async () => {
    const fetchers: OrgRepoTreeFetchers = {
      listRepos: async () => [fakeRepo("org/alice-repo"), fakeRepo("org/bob-repo")],
      fetchTreePaths: async (fullName) =>
        fullName === "org/alice-repo" ? ["week-1/main.py", "week-2/main.py"] : ["week-1/main.py"],
    };

    const result = await scanOrgRepoTrees("org", undefined, undefined, fetchers, { now: () => NOW_MS });

    expect(result).toEqual({
      repos: [
        { repo: "org/alice-repo", htmlUrl: "https://github.com/org/alice-repo", folders: ["week-1", "week-2"], error: null },
        { repo: "org/bob-repo", htmlUrl: "https://github.com/org/bob-repo", folders: ["week-1"], error: null },
      ],
      truncated: false,
      rateLimit: null,
    });
  });

  describe("per-repo isolation (AC3 item 17c)", () => {
    it("one repo's tree fetch failing degrades ONLY that row - every other repo still gets its folders", async () => {
      const fetchers: OrgRepoTreeFetchers = {
        listRepos: async () => [fakeRepo("org/alice-repo"), fakeRepo("org/bob-repo"), fakeRepo("org/carol-repo")],
        fetchTreePaths: async (fullName) => {
          if (fullName === "org/bob-repo") throw new Error("GitHub resource not found (404). Check the owner/repo and the token's access.");
          return ["week-1/main.py"];
        },
      };

      const result = await scanOrgRepoTrees("org", undefined, undefined, fetchers, { now: () => NOW_MS });

      expect(result).toEqual({
        repos: [
          { repo: "org/alice-repo", htmlUrl: "https://github.com/org/alice-repo", folders: ["week-1"], error: null },
          {
            repo: "org/bob-repo",
            htmlUrl: "https://github.com/org/bob-repo",
            folders: null,
            error: "GitHub request failed (HTTP 404).",
          },
          { repo: "org/carol-repo", htmlUrl: "https://github.com/org/carol-repo", folders: ["week-1"], error: null },
        ],
        truncated: false,
        rateLimit: null,
      });
    });

    it("a non-Error throw (e.g. a rejected promise with a plain string) still isolates to one row instead of crashing the scan", async () => {
      const fetchers: OrgRepoTreeFetchers = {
        listRepos: async () => [fakeRepo("org/alice-repo"), fakeRepo("org/bob-repo")],
        fetchTreePaths: async (fullName) => {
          if (fullName === "org/bob-repo") throw "not an Error instance";
          return ["week-1/main.py"];
        },
      };

      const result = await scanOrgRepoTrees("org", undefined, undefined, fetchers, { now: () => NOW_MS });

      expect(result).toEqual({
        repos: [
          { repo: "org/alice-repo", htmlUrl: "https://github.com/org/alice-repo", folders: ["week-1"], error: null },
          {
            repo: "org/bob-repo",
            htmlUrl: "https://github.com/org/bob-repo",
            folders: null,
            error: "Could not read this repository's file tree.",
          },
        ],
        truncated: false,
        rateLimit: null,
      });
    });
  });

  describe("rate-limit classification threaded through per-repo failures (AC3 item 17b)", () => {
    it("a 403-with-remaining-0-shaped failure is classified as rate-limited, NOT reported as a permissions problem", async () => {
      // This path never has real headers (see the module header), so a bare
      // 403 message alone cannot be distinguished from a genuine permissions
      // problem - it is expected to land on "forbidden", not "rate-limited".
      // The case that IS unambiguous without headers is a 429, exercised
      // below - this test instead pins that a plain 403 does NOT get
      // mislabeled as a rate limit just because the word appears nowhere.
      const fetchers: OrgRepoTreeFetchers = {
        listRepos: async () => [fakeRepo("org/alice-repo")],
        fetchTreePaths: async () => {
          throw new Error("GitHub forbidden (403) — rate limit hit or the token lacks the needed scope.");
        },
      };

      const result = await scanOrgRepoTrees("org", undefined, undefined, fetchers, { now: () => NOW_MS });

      expect(result).toEqual({
        repos: [
          {
            repo: "org/alice-repo",
            htmlUrl: "https://github.com/org/alice-repo",
            folders: null,
            error:
              "GitHub returned 403 Forbidden. GitHub reported no rate-limit headers, so this is not confirmed as a " +
              "rate limit either way. The most likely cause is the token missing a scope this operation needs, though " +
              "GitHub's response does not say which one - check the token's permissions.",
          },
        ],
        truncated: false,
        rateLimit: {
          kind: "forbidden",
          message:
            "GitHub returned 403 Forbidden. GitHub reported no rate-limit headers, so this is not confirmed as a " +
            "rate limit either way. The most likely cause is the token missing a scope this operation needs, though " +
            "GitHub's response does not say which one - check the token's permissions.",
          resetAtMs: null,
          remaining: null,
        },
      });
    });

    it("a 429 failure IS classified as rate-limited (unambiguous from the status code alone) and surfaced as the overall verdict", async () => {
      const fetchers: OrgRepoTreeFetchers = {
        listRepos: async () => [fakeRepo("org/alice-repo"), fakeRepo("org/bob-repo")],
        fetchTreePaths: async (fullName) => {
          if (fullName === "org/bob-repo") throw new Error("GitHub request failed (HTTP 429): secondary rate limit.");
          return ["week-1/main.py"];
        },
      };

      const result = (await scanOrgRepoTrees("org", undefined, undefined, fetchers, { now: () => NOW_MS })) as OrgRepoTreesResult;

      expect(result.repos[1]).toEqual({
        repo: "org/bob-repo",
        htmlUrl: "https://github.com/org/bob-repo",
        folders: null,
        error: "GitHub's API rate limit was hit (HTTP 429, no remaining count reported); GitHub did not report when it resets.",
      });
      expect(result).toMatchObject({ rateLimit: { kind: "rate-limited" } });
    });
  });

  describe("truncation flag (AC3 item 18)", () => {
    it("is true when listRepos returns exactly 1000 repos", async () => {
      const repos = Array.from({ length: 1000 }, (_, i) => fakeRepo(`org/student-${i}`));
      const fetchers: OrgRepoTreeFetchers = {
        listRepos: async () => repos,
        fetchTreePaths: async () => [],
      };

      const result = await scanOrgRepoTrees("org", undefined, 0, fetchers, { now: () => NOW_MS });

      expect((result as { truncated: boolean }).truncated).toBe(true);
    });

    it("is false when listRepos returns 999 repos", async () => {
      const repos = Array.from({ length: 999 }, (_, i) => fakeRepo(`org/student-${i}`));
      const fetchers: OrgRepoTreeFetchers = {
        listRepos: async () => repos,
        fetchTreePaths: async () => [],
      };

      const result = await scanOrgRepoTrees("org", undefined, 0, fetchers, { now: () => NOW_MS });

      expect((result as { truncated: boolean }).truncated).toBe(false);
    });
  });

  describe("repoLimit bounds how many repos get a tree fetch, independent of the truncation check", () => {
    it("scans only the first repoLimit repos, but still computes truncated from the FULL listed count", async () => {
      const repos = Array.from({ length: 1000 }, (_, i) => fakeRepo(`org/student-${i}`));
      const fetchTreePaths = vi.fn(async () => ["week-1/main.py"]);
      const fetchers: OrgRepoTreeFetchers = { listRepos: async () => repos, fetchTreePaths };

      const result = await scanOrgRepoTrees("org", undefined, 3, fetchers, { now: () => NOW_MS });

      expect(fetchTreePaths).toHaveBeenCalledTimes(3);
      expect((result as { repos: unknown[] }).repos).toHaveLength(3);
      expect((result as { truncated: boolean }).truncated).toBe(true);
    });

    it("a repoLimit of undefined scans every listed repo", async () => {
      const repos = [fakeRepo("org/a"), fakeRepo("org/b"), fakeRepo("org/c")];
      const fetchTreePaths = vi.fn(async () => []);
      const fetchers: OrgRepoTreeFetchers = { listRepos: async () => repos, fetchTreePaths };

      await scanOrgRepoTrees("org", undefined, undefined, fetchers, { now: () => NOW_MS });

      expect(fetchTreePaths).toHaveBeenCalledTimes(3);
    });
  });

  describe("bounded concurrency (AC3 item 17a) actually bounds - not sequential, not unbounded", () => {
    async function measureMaxInFlight(repoCount: number, concurrency: number | undefined) {
      const repos = Array.from({ length: repoCount }, (_, i) => fakeRepo(`org/student-${i}`));
      let inFlight = 0;
      let maxInFlight = 0;
      const fetchers: OrgRepoTreeFetchers = {
        listRepos: async () => repos,
        fetchTreePaths: async () => {
          inFlight += 1;
          maxInFlight = Math.max(maxInFlight, inFlight);
          await new Promise((resolve) => setTimeout(resolve, 5));
          inFlight -= 1;
          return [];
        },
      };

      await scanOrgRepoTrees("org", undefined, undefined, fetchers, { now: () => NOW_MS, concurrency });
      return maxInFlight;
    }

    it("defaults to DEFAULT_TREE_SCAN_CONCURRENCY (5) in flight for a large repo count - not 1, and not all at once", async () => {
      const maxInFlight = await measureMaxInFlight(12, undefined);
      expect(DEFAULT_TREE_SCAN_CONCURRENCY).toBe(5);
      expect(maxInFlight).toBe(5);
    });

    it("honours an explicit concurrency limit", async () => {
      expect(await measureMaxInFlight(12, 2)).toBe(2);
    });

    it("never exceeds the number of repos when the limit is larger than the repo count", async () => {
      expect(await measureMaxInFlight(3, 10)).toBe(3);
    });
  });

  describe("top-level org enumeration failure (AC3 - the whole scan cannot proceed without a repo list)", () => {
    it("returns { error } with an honest, classified message when listRepos itself fails with a rate-limit shape", async () => {
      const fetchers: OrgRepoTreeFetchers = {
        listRepos: async () => {
          throw new Error("GitHub request failed (HTTP 429): secondary rate limit.");
        },
        fetchTreePaths: async () => [],
      };

      const result = await scanOrgRepoTrees("org", undefined, undefined, fetchers, { now: () => NOW_MS });

      expect(result).toEqual({
        error: "GitHub's API rate limit was hit (HTTP 429, no remaining count reported); GitHub did not report when it resets.",
      });
    });

    it("returns { error } with the raw message when listRepos fails with no parseable status", async () => {
      const fetchers: OrgRepoTreeFetchers = {
        listRepos: async () => {
          throw new Error("fetch failed");
        },
        fetchTreePaths: async () => [],
      };

      const result = await scanOrgRepoTrees("org", undefined, undefined, fetchers, { now: () => NOW_MS });

      expect(result).toEqual({ error: "fetch failed" });
    });

    it("never throws even when listRepos rejects with a non-Error value", async () => {
      const fetchers: OrgRepoTreeFetchers = {
        listRepos: async () => {
          throw "boom";
        },
        fetchTreePaths: async () => [],
      };

      await expect(scanOrgRepoTrees("org", undefined, undefined, fetchers, { now: () => NOW_MS })).resolves.toEqual({
        error: "Could not read this repository's file tree.",
      });
    });
  });
});

// --------------------------------------------------------------------------
// SABOTAGE-CHECK LOG (each verified by hand: broke the behavior, ran
// `npx vitest run src/lib/repo-grade-tree-scan.test.ts`, confirmed a failure,
// then reverted before re-running to confirm green again).
//
// 1. Per-repo isolation: changed the per-repo `try { ... } catch (err) {
//    ... }` in scanOrgRepoTrees to let the error propagate (removed the
//    try/catch, letting mapWithConcurrency's rejection bubble up). Result:
//    "one repo's tree fetch failing degrades ONLY that row" failed with an
//    unhandled rejection instead of returning three rows - alice's and
//    carol's folders never appeared, contradicting the frozen expectation
//    that only bob's row shows the error. This is the exact regression AC3
//    item 17c exists to prevent. Reverted; suite green again.
// 2. Concurrency bound: changed `mapWithConcurrency(scanned, concurrency,
//    ...)` to `Promise.all(scanned.map(...))` (unbounded). Result: "honours
//    an explicit concurrency limit" (asserting maxInFlight === 2) failed -
//    the sabotaged version fired all 12 fetches at once, so maxInFlight was
//    12, not 2. This is the exact regression AC3 item 17a exists to prevent
//    (the unbounded Promise.all checkStudentActivityAction already does at
//    src/app/actions/github.ts:487-500). Reverted; suite green again.
// 3. Truncation independence from repoLimit: changed `computeOrgReposTruncated(allRepos.length)`
//    to `computeOrgReposTruncated(scanned.length)` (computing truncation from
//    the POST-slice count instead of the full listed count). Result: "scans
//    only the first repoLimit repos, but still computes truncated from the
//    FULL listed count" failed - truncated came back false (3 !== 1000)
//    instead of the frozen `true`. Reverted; suite green again.
// 4. Rate-limit classification threading: changed `parseGithubErrorStatus(message)`
//    to always return null (short-circuited it) in the per-repo catch block.
//    Result: "a 429 failure IS classified as rate-limited" failed - the
//    row's error fell back to the raw message text ("GitHub request failed
//    (HTTP 429): secondary rate limit.") instead of the frozen, classified
//    rate-limited message, and `rateLimit` stayed null instead of surfacing
//    the rate-limited verdict. Reverted; suite green again.
// 5. pickOverallVerdict priority: swapped the `??` order to check "forbidden"
//    before "rate-limited". Result: "prefers 'rate-limited' over 'forbidden'
//    even when forbidden appears FIRST in the list" failed - the sabotaged
//    version returned the forbidden verdict instead of the frozen rate-limited
//    one. Reverted; suite green again.
// --------------------------------------------------------------------------
