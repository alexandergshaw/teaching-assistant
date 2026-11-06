import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_TREE_SCAN_CONCURRENCY } from "@/lib/repo-grade-tree-scan";
import { discoverRepoGradeSources } from "./discovery";

const root = "https://api.github.com";
const sha = "a".repeat(40);
const treeSha = "b".repeat(40);

function repo(name: string, defaultBranch = "default-source") {
  return { name, owner: { login: "classroom" }, full_name: `classroom/${name}`, default_branch: defaultBranch };
}

beforeEach(() => vi.stubEnv("GITHUB_TOKEN", "test-token"));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("discoverRepoGradeSources", () => {
  it("uses saved scope and isolates a failed repo and a truncated tree from the other repos", async () => {
    const fetcher = vi.fn(async (url: string) => {
      if (url.startsWith(`${root}/orgs/classroom/repos?`)) {
        return Response.json([repo("lab-01"), repo("lab-02"), repo("lab-03"), repo("other")]);
      }
      if (url.endsWith("/commits/grade%2Fsource")) {
        return url.includes("lab-03") ? Response.json({ message: "Resource not accessible" }, { status: 403 }) : Response.json({ sha });
      }
      if (url.endsWith(`/git/commits/${sha}`)) return Response.json({ sha, tree: { sha: treeSha } });
      if (url.endsWith(`/git/trees/${treeSha}?recursive=1`)) {
        return Response.json({
          sha: treeSha, truncated: url.includes("lab-02"),
          tree: [{ type: "blob", size: 20, path: "assignments/module-01/main.py" }],
        });
      }
      throw new Error(`Unexpected GitHub URL ${url}`);
    });
    vi.stubGlobal("fetch", fetcher);

    expect(await discoverRepoGradeSources({ organization: "classroom", prefix: "lab-", sourceRef: "grade/source" })).toEqual({
      status: "scanned",
      enumerationComplete: true,
      repos: [
        { status: "ready", repo: "classroom/lab-01", sourceRef: "grade/source", sourceCommit: sha, folders: ["assignments", "assignments/module-01"] },
        { status: "partial", repo: "classroom/lab-02", sourceRef: "grade/source", sourceCommit: sha, reason: "tree-truncated" },
        { status: "blocked", repo: "classroom/lab-03", sourceRef: "grade/source", reason: "access-denied" },
      ],
    });
    expect(fetcher.mock.calls.some(([url]) => url.includes("/other/"))).toBe(false);
  });

  it("resolves each default branch instead of guessing main", async () => {
    const fetcher = vi.fn(async (url: string) => {
      if (url.startsWith(`${root}/orgs/classroom/repos?`)) return Response.json([repo("lab"), repo("no-branch", "")]);
      if (url.endsWith("/commits/default-source")) return Response.json({ sha });
      if (url.endsWith(`/git/commits/${sha}`)) return Response.json({ sha, tree: { sha: treeSha } });
      if (url.endsWith(`/git/trees/${treeSha}?recursive=1`)) return Response.json({ sha: treeSha, truncated: false, tree: [] });
      throw new Error(`Unexpected GitHub URL ${url}`);
    });
    vi.stubGlobal("fetch", fetcher);
    expect(await discoverRepoGradeSources({ organization: "classroom" })).toMatchObject({
      enumerationComplete: true,
      repos: [
        { status: "ready", repo: "classroom/lab", sourceRef: "default-source", sourceCommit: sha, folders: [] },
        { status: "blocked", repo: "classroom/no-branch", reason: "invalid-source" },
      ],
    });
    expect(fetcher).toHaveBeenCalledWith(`${root}/repos/classroom/lab/commits/default-source`, expect.objectContaining({ cache: "no-store" }));
  });

  it("includes alternate-only folders and resolves a shared ref once per repo", async () => {
    const alternateRef = "work/source";
    const alternateSha = "c".repeat(40);
    const alternateTree = "d".repeat(40);
    const folderSources = new Map([
      ["only-alternate", alternateRef], ["shared", alternateRef], ["still-default", null],
    ]);
    const fetcher = vi.fn(async (url: string) => {
      if (url.startsWith(`${root}/orgs/classroom/repos?`)) {
        return Response.json([repo("lab"), repo("other", alternateRef)]);
      }
      if (url.endsWith("/commits/default-source")) return Response.json({ sha });
      if (url.endsWith("/commits/work%2Fsource")) return Response.json({ sha: alternateSha });
      if (url.endsWith(`/git/commits/${sha}`)) return Response.json({ sha, tree: { sha: treeSha } });
      if (url.endsWith(`/git/commits/${alternateSha}`)) return Response.json({ sha: alternateSha, tree: { sha: alternateTree } });
      const pinnedTree = url.includes(alternateTree) ? alternateTree : treeSha;
      const folders = pinnedTree === alternateTree ? ["only-alternate", "shared", "unconfigured"] : ["shared", "still-default"];
      if (url.endsWith(`/git/trees/${pinnedTree}?recursive=1`)) {
        return Response.json({
          sha: pinnedTree, truncated: false,
          tree: folders.map((folder) => ({ type: "blob", path: `${folder}/main.py`, size: 20 })),
        });
      }
      throw new Error(`Unexpected GitHub URL ${url}`);
    });
    vi.stubGlobal("fetch", fetcher);

    expect(await discoverRepoGradeSources({ organization: "classroom", folderSources })).toEqual({
      status: "scanned", enumerationComplete: true, repos: [
        { status: "ready", repo: "classroom/lab", sourceRef: "default-source", sourceCommit: sha, folders: ["still-default"] },
        { status: "ready", repo: "classroom/lab", sourceRef: alternateRef, sourceCommit: alternateSha, folders: ["only-alternate", "shared"] },
        { status: "ready", repo: "classroom/other", sourceRef: alternateRef, sourceCommit: alternateSha, folders: ["only-alternate", "shared", "unconfigured"] },
      ],
    });
    const urls = fetcher.mock.calls.map(([url]) => url);
    expect(urls.filter((url) => url.startsWith(`${root}/orgs/`))).toHaveLength(1);
    expect(urls.filter((url) => url.endsWith("/commits/work%2Fsource")).sort()).toEqual([
      `${root}/repos/classroom/lab/commits/work%2Fsource`,
      `${root}/repos/classroom/other/commits/work%2Fsource`,
    ]);
  });

  it("preserves failed and truncated overrides without falling back to matching default-branch folders", async () => {
    const failedRef = "missing";
    const truncatedRef = "large";
    const truncatedSha = "c".repeat(40);
    const truncatedTree = "d".repeat(40);
    const folderSources = new Map([["override-failed", failedRef], ["override-truncated", truncatedRef]]);
    const fetcher = vi.fn(async (url: string) => {
      if (url.startsWith(`${root}/orgs/classroom/repos?`)) return Response.json([repo("lab")]);
      if (url.endsWith("/commits/default-source")) return Response.json({ sha });
      if (url.endsWith("/commits/missing")) return new Response(null, { status: 404 });
      if (url.endsWith("/commits/large")) return Response.json({ sha: truncatedSha });
      if (url.endsWith(`/git/commits/${sha}`)) return Response.json({ sha, tree: { sha: treeSha } });
      if (url.endsWith(`/git/commits/${truncatedSha}`)) return Response.json({ sha: truncatedSha, tree: { sha: truncatedTree } });
      if (url.includes("/git/trees/")) {
        const truncated = url.includes(truncatedTree);
        return Response.json({
          sha: truncated ? truncatedTree : treeSha, truncated,
          tree: ["override-failed", "override-truncated", "unrelated"].map((folder) =>
            ({ type: "blob", size: 20, path: `${folder}/main.py` })),
        });
      }
      throw new Error(`Unexpected GitHub URL ${url}`);
    });
    vi.stubGlobal("fetch", fetcher);

    expect(await discoverRepoGradeSources({ organization: "classroom", folderSources })).toEqual({
      status: "scanned", enumerationComplete: true, repos: [
        { status: "ready", repo: "classroom/lab", sourceRef: "default-source", sourceCommit: sha, folders: ["unrelated"] },
        { status: "blocked", repo: "classroom/lab", sourceRef: failedRef, reason: "unavailable" },
        { status: "partial", repo: "classroom/lab", sourceRef: truncatedRef, sourceCommit: truncatedSha, reason: "tree-truncated" },
      ],
    });
  });

  it("reports the enumeration cap even when the filter returns no repos", async () => {
    const fetcher = vi.fn(async (url: string) => {
      const page = new URL(url).searchParams.get("page");
      return Response.json(Array.from({ length: 100 }, (_, index) => repo(`other-${page}-${index}`)));
    });
    vi.stubGlobal("fetch", fetcher);
    expect(await discoverRepoGradeSources({ organization: "classroom", prefix: "lab-" })).toEqual({
      status: "scanned", enumerationComplete: false, repos: [],
    });
    expect(fetcher).toHaveBeenCalledTimes(10);
  });

  it.each([
    ["malformed row", [repo("outside-prefix"), null]],
    ["case-insensitive duplicate", [repo("outside-prefix"), repo("OUTSIDE-PREFIX")]],
    ["foreign owner", [{ ...repo("outside-prefix"), owner: { login: "other" }, full_name: "other/outside-prefix" }]],
    ["inconsistent full name", [{ ...repo("outside-prefix"), full_name: "classroom/different" }]],
  ])("reports incomplete organization coverage for %s before applying the prefix", async (_label, page) => {
    const fetcher = vi.fn(async () => Response.json(page, { headers: { link: '<https://redirect.invalid/>; rel="next"' } }));
    vi.stubGlobal("fetch", fetcher);
    await expect(discoverRepoGradeSources({ organization: "classroom", prefix: "lab-" })).resolves.toEqual({
      status: "scanned", enumerationComplete: false, repos: [],
    });
    expect(fetcher).toHaveBeenCalledExactlyOnceWith(`${root}/orgs/classroom/repos?per_page=100&sort=full_name&page=1`, expect.anything());
  });

  it.each([{}, Array.from({ length: 101 }, (_, index) => repo(`lab-${index}`))])("rejects an invalid organization page", async (page) => {
    const fetcher = vi.fn(async () => Response.json(page));
    vi.stubGlobal("fetch", fetcher);
    await expect(discoverRepoGradeSources({ organization: "classroom" })).resolves.toEqual({ status: "blocked", reason: "unavailable" });
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("marks a duplicate across numbered pages incomplete and retains an independently complete source", async () => {
    const fetcher = vi.fn(async (url: string) => {
      if (url.includes("&page=1")) {
        return Response.json([repo("lab-1"), ...Array.from({ length: 99 }, (_, index) => repo(`other-${index}`))]);
      }
      if (url.includes("&page=2")) return Response.json([repo("OTHER-0")]);
      if (url.endsWith("/commits/default-source")) return Response.json({ sha });
      if (url.endsWith(`/git/commits/${sha}`)) return Response.json({ sha, tree: { sha: treeSha } });
      return Response.json({ sha: treeSha, truncated: false, tree: [{ path: "lab/main.py", type: "blob", size: 5 }] });
    });
    vi.stubGlobal("fetch", fetcher);
    await expect(discoverRepoGradeSources({ organization: "classroom", prefix: "lab-" })).resolves.toEqual({
      status: "scanned", enumerationComplete: false, repos: [
        { status: "ready", repo: "classroom/lab-1", sourceRef: "default-source", sourceCommit: sha, folders: ["lab"] },
      ],
    });
    expect(fetcher).toHaveBeenCalledTimes(5);
  });

  it("rejects a redirected pinned request and never exposes its location or falls back to legacy", async () => {
    const fetcher = vi.fn(async (url: string, init: RequestInit) => {
      expect(init.redirect).toBe("manual");
      if (url.includes("/orgs/")) return Response.json([repo("lab")]);
      if (url.endsWith("/commits/default-source")) return Response.json({ sha });
      return new Response(null, { status: 301, headers: { location: "https://redirect.invalid/?private=value" } });
    });
    vi.stubGlobal("fetch", fetcher);
    await expect(discoverRepoGradeSources({ organization: "classroom" })).resolves.toEqual({
      status: "scanned", enumerationComplete: true, repos: [
        { status: "blocked", repo: "classroom/lab", sourceRef: "default-source", sourceCommit: sha, reason: "redirect-rejected" },
      ],
    });
    expect(fetcher.mock.calls.map(([url]) => new URL(url).origin)).toEqual([root, root, root]);
  });

  it.each([null, { type: "blob", path: "lab/main.py", size: -1 }])("keeps a malformed recursive tree partial", async (entry) => {
    const fetcher = vi.fn(async (url: string) => {
      if (url.includes("/orgs/")) return Response.json([repo("lab")]);
      if (url.endsWith("/commits/default-source")) return Response.json({ sha });
      if (url.endsWith(`/git/commits/${sha}`)) return Response.json({ sha, tree: { sha: treeSha } });
      return Response.json({ sha: treeSha, truncated: false, tree: [entry] });
    });
    vi.stubGlobal("fetch", fetcher);
    await expect(discoverRepoGradeSources({ organization: "classroom" })).resolves.toEqual({
      status: "scanned", enumerationComplete: true, repos: [
        { status: "partial", repo: "classroom/lab", sourceRef: "default-source", sourceCommit: sha, reason: "tree-truncated" },
      ],
    });
  });

  it("caps total GitHub requests and marks every unscanned repo/ref pair as incomplete", async () => {
    const repos = Array.from({ length: 61 }, (_, index) => repo(`lab-${index}`));
    const fetcher = vi.fn(async (url: string) => {
      if (url.startsWith(`${root}/orgs/classroom/repos?`)) return Response.json(repos);
      if (url.endsWith(`/git/commits/${sha}`)) return Response.json({ sha, tree: { sha: treeSha } });
      if (url.endsWith(`/git/trees/${treeSha}?recursive=1`)) {
        return Response.json({
          sha: treeSha, truncated: false,
          tree: ["default-folder", "alternate-folder"].map((folder) => ({ type: "blob", size: 20, path: `${folder}/main.py` })),
        });
      }
      return Response.json({ sha });
    });
    vi.stubGlobal("fetch", fetcher);

    const discovery = await discoverRepoGradeSources({
      organization: "classroom", folderSources: new Map([["alternate-folder", "alt"]]),
    });
    expect(fetcher).toHaveBeenCalledTimes(300);
    expect(discovery).toMatchObject({ status: "scanned", enumerationComplete: true });
    if (discovery.status !== "scanned") throw new Error("Expected source coverage");
    expect(discovery.repos.map((row) => [row.repo, row.sourceRef])).toEqual(
      repos.flatMap(({ full_name }) => [[full_name, "default-source"], [full_name, "alt"]]),
    );
    expect(discovery.repos.some((row) => row.status === "ready")).toBe(true);
    expect(discovery.repos.some((row) => row.status === "blocked")).toBe(true);
    for (const row of discovery.repos) {
      if (row.status === "ready") expect(row.folders).toEqual([row.sourceRef === "alt" ? "alternate-folder" : "default-folder"]);
      else expect(row).toMatchObject({ status: "blocked", reason: "request-budget-exhausted" });
    }
  });

  it("reports a course-wide coverage failure when the source matrix cannot be represented within the cap", async () => {
    const fetcher = vi.fn(async () => Response.json(Array.from({ length: 81 }, (_, index) => repo(`lab-${index}`))));
    vi.stubGlobal("fetch", fetcher);
    const folderSources = new Map(Array.from({ length: 50 }, (_, index) => [`folder-${index}`, `ref-${index}`]));
    await expect(discoverRepoGradeSources({ organization: "classroom", folderSources }))
      .resolves.toEqual({ status: "blocked", reason: "source-set-too-large" });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it.each([
    { status: 429, header: "x-ratelimit-remaining", value: "12" },
    { status: 403, header: "retry-after", value: "60" },
  ])("shares an HTTP $status throttle across in-flight workers and request steps", async ({ status, header, value }) => {
    const repos = Array.from({ length: DEFAULT_TREE_SCAN_CONCURRENCY + 1 }, (_, index) => repo(`lab-${index}`));
    const throttle = Promise.withResolvers<Response>();
    const headersObserved = Promise.withResolvers<void>();
    const outstandingRefs = Promise.withResolvers<void>();
    const outstandingCommit = Promise.withResolvers<Response>();
    const outstandingTree = Promise.withResolvers<Response>();
    const fetcher = vi.fn(async (url: string) => {
      if (url.startsWith(`${root}/orgs/classroom/repos?`)) return Response.json(repos);
      if (url.endsWith("/lab-0/commits/default-source")) return throttle.promise;
      if (url.endsWith("/lab-1/commits/default-source") || url.endsWith("/lab-2/commits/default-source")) {
        return Response.json({ sha });
      }
      if (url.endsWith(`/lab-1/git/commits/${sha}`)) return outstandingCommit.promise;
      if (url.endsWith(`/lab-2/git/commits/${sha}`)) return Response.json({ sha, tree: { sha: treeSha } });
      if (url.endsWith(`/lab-2/git/trees/${treeSha}?recursive=1`)) return outstandingTree.promise;
      if (url.endsWith("/commits/default-source")) {
        await outstandingRefs.promise;
        return Response.json({ sha });
      }
      throw new Error(`Unexpected GitHub URL ${url}`);
    });
    vi.stubGlobal("fetch", fetcher);
    const pending = discoverRepoGradeSources({
      organization: "classroom", folderSources: new Map([["override", "alt"]]),
    });
    const startedRequests = DEFAULT_TREE_SCAN_CONCURRENCY + 4; // Listing, initial refs, two commit objects, one tree.
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(startedRequests));

    const body = new ReadableStream({ cancel: () => headersObserved.resolve() });
    const limited = new Response(body, { status, headers: { [header]: value } });
    throttle.resolve(limited);
    await headersObserved.promise;
    outstandingRefs.resolve();
    outstandingCommit.resolve(Response.json({ sha, tree: { sha: treeSha } }));
    outstandingTree.resolve(Response.json({
      sha: treeSha, truncated: false,
      tree: ["override", "unrelated"].map((folder) => ({ type: "blob", size: 20, path: `${folder}/main.py` })),
    }));

    const discovery = await pending;
    expect(fetcher).toHaveBeenCalledTimes(startedRequests);
    if (discovery.status !== "scanned") throw new Error("Expected source coverage");
    expect(discovery.repos.map((row) => [row.repo, row.sourceRef])).toEqual(
      repos.flatMap(({ full_name }) => [[full_name, "default-source"], [full_name, "alt"]]),
    );
    expect(discovery.repos.filter((row) => row.status === "ready")).toEqual([
      { status: "ready", repo: "classroom/lab-2", sourceRef: "default-source", sourceCommit: sha, folders: ["unrelated"] },
    ]);
    for (const row of discovery.repos.filter((row) => row.status !== "ready")) {
      expect(row).toMatchObject({ status: "blocked", reason: "rate-limited" });
    }
    expect(discovery.repos.find((row) => row.repo === "classroom/lab-1" && row.sourceRef === "default-source"))
      .toMatchObject({ sourceCommit: sha, reason: "rate-limited" });
  });

  it("uses a shared deadline to abort an in-flight request and fence later refs", async () => {
    const controller = new AbortController();
    const timeout = vi.spyOn(AbortSignal, "timeout").mockReturnValue(controller.signal);
    const fetcher = vi.fn(async (url: string, init: RequestInit) => {
      expect(init.signal).toBeInstanceOf(AbortSignal);
      if (url.startsWith(`${root}/orgs/classroom/repos?`)) return Response.json([repo("lab")]);
      return new Promise<Response>((_resolve, reject) => {
        init.signal!.addEventListener("abort", () => reject(init.signal!.reason), { once: true });
      });
    });
    vi.stubGlobal("fetch", fetcher);
    try {
      const pending = discoverRepoGradeSources({
        organization: "classroom", folderSources: new Map([["override", "alt"]]),
      });
      await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
      controller.abort();
      await expect(pending).resolves.toEqual({
        status: "scanned", enumerationComplete: true, repos: [
          { status: "blocked", repo: "classroom/lab", sourceRef: "default-source", reason: "deadline-exceeded" },
          { status: "blocked", repo: "classroom/lab", sourceRef: "alt", reason: "deadline-exceeded" },
        ],
      });
      expect(fetcher).toHaveBeenCalledTimes(2);
    } finally {
      timeout.mockRestore();
    }
  });
});
