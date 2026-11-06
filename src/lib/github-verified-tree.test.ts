import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { rememberVerifiedGithubTree, reuseVerifiedGithubTree, verifyGithubTree } from "./github-verified-tree";
import { getRepoCommitTree } from "./github.repos";

const empty = { sha: "4b825dc642cb6eb9a060e54bf8d69288fbee4904", truncated: false, tree: [] };
const scope = { accountId: "tree-test", credential: "credential", owner: "owner", repo: "repo", rootSha: empty.sha };
function largeTree() {
  const tree = Array.from({ length: 5_000 }, (_, i) => ({ path: `${String(i).padStart(5, "0")}${"x".repeat(1_700)}`,
    type: "blob", mode: "100644", sha: "a".repeat(40), size: 1 }));
  const bytes = Buffer.concat(tree.map((row) => Buffer.concat([Buffer.from(`100644 ${row.path}\0`), Buffer.from(row.sha, "hex")])));
  const sha = createHash("sha1").update(`tree ${bytes.length}\0`).update(bytes).digest("hex");
  return { sha, truncated: false, tree };
}
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("verified immutable Git tree reuse", () => {
  it("isolates account, credential, repository, owner and root and rejects corrupt replacements", () => {
    rememberVerifiedGithubTree(scope, empty);
    for (const field of ["accountId", "credential", "owner", "repo", "rootSha"] as const) {
      expect(reuseVerifiedGithubTree({ ...scope, [field]: "different" })).toBeUndefined();
    }
    for (const raw of [{ ...empty, truncated: true }, { ...empty, sha: "a".repeat(40) },
      { ...empty, tree: [{ path: "fake", mode: "100644", type: "blob", sha: "a".repeat(40), size: 1 }] }]) {
      expect(() => rememberVerifiedGithubTree(scope, raw)).toThrow();
    }
    expect(reuseVerifiedGithubTree(scope)?.size).toBe(0);
    const received = reuseVerifiedGithubTree(scope)!;
    received.set("fake", { path: "fake", mode: "100644", sha: "a".repeat(40), size: 1 });
    expect(reuseVerifiedGithubTree(scope)?.size).toBe(0);
  });

  it("evicts by entry count, age and retained byte size", () => {
    vi.useFakeTimers();
    for (let i = 0; i < 257; i++) rememberVerifiedGithubTree({ ...scope, accountId: `bounded-${i}` }, empty);
    expect(reuseVerifiedGithubTree({ ...scope, accountId: "bounded-0" })).toBeUndefined();
    expect(reuseVerifiedGithubTree({ ...scope, accountId: "bounded-256" })?.size).toBe(0);
    vi.advanceTimersByTime(30 * 60_000);
    expect(reuseVerifiedGithubTree({ ...scope, accountId: "bounded-256" })).toBeUndefined();
    const huge = largeTree();
    const hugeScope = { ...scope, rootSha: huge.sha };
    expect(rememberVerifiedGithubTree(hugeScope, huge).size).toBe(5_000);
    expect(reuseVerifiedGithubTree(hugeScope)).toBeUndefined();
  });

  it("rejects unsafe paths, duplicate paths, malformed sizes and missing parents", () => {
    const entry = { path: "file", mode: "100644", type: "blob", sha: "a".repeat(40), size: 1 };
    for (const tree of [[{ ...entry, path: "../escape" }], [entry, entry], [{ ...entry, size: -1 }],
      [{ ...entry, path: "absent/file" }]]) expect(() => verifyGithubTree({ ...empty, tree }, empty.sha)).toThrow();
  });

  it("keeps live authorization on every evaluator read, rejects denial and abort, and isolates rotation", async () => {
    vi.stubEnv("GITHUB_TOKEN", "tree-evaluator-token");
    const sha = "b".repeat(40);
    let denied = false;
    const fetcher = vi.fn(async (url: string) => {
      if (url.endsWith(`/commits/${sha}`)) return denied ? new Response(null, { status: 403 })
        : Response.json({ sha, tree: { sha: empty.sha } });
      return Response.json(empty);
    });
    vi.stubGlobal("fetch", fetcher);
    const options = { treeCacheAccountId: "evaluator-live" };
    await expect(getRepoCommitTree("owner", "repo", sha, options)).resolves.toEqual({ entries: [], truncated: false });
    expect(fetcher).toHaveBeenCalledTimes(2);
    await getRepoCommitTree("owner", "repo", sha, options);
    expect(fetcher).toHaveBeenCalledTimes(3);
    denied = true;
    await expect(getRepoCommitTree("owner", "repo", sha, options)).rejects.toThrow();
    expect(fetcher).toHaveBeenCalledTimes(4);
    denied = false;
    vi.stubEnv("GITHUB_TOKEN", "rotated-tree-token");
    await getRepoCommitTree("owner", "repo", sha, options);
    expect(fetcher).toHaveBeenCalledTimes(6);
    await expect(getRepoCommitTree("owner", "repo", sha, { ...options, signal: AbortSignal.abort() })).rejects.toThrow();
  });

  it("conditionally reauthorizes cached pinned commits and isolates their validators", async () => {
    vi.stubEnv("GITHUB_TOKEN", "conditional-token");
    const sha = "d".repeat(40);
    let deny = false;
    const seen: string[] = [];
    const fetcher = vi.fn(async (url: string, init: RequestInit) => {
      if (!url.includes("/commits/")) return Response.json(empty);
      const headers = new Headers(init.headers);
      const conditional = headers.get("if-none-match") ?? "";
      seen.push(conditional);
      if (deny) return new Response(null, { status: 403 });
      return conditional ? new Response(null, { status: 304 })
        : Response.json({ sha, tree: { sha: empty.sha } }, { headers: { etag: '"commit-etag"' } });
    });
    vi.stubGlobal("fetch", fetcher);
    const options = { treeCacheAccountId: "conditional-account" };
    await getRepoCommitTree("owner", "repo", sha, options);
    await getRepoCommitTree("owner", "repo", sha, options);
    expect(seen).toEqual(["", '"commit-etag"']);
    expect(fetcher).toHaveBeenCalledTimes(3);
    deny = true;
    await expect(getRepoCommitTree("owner", "repo", sha, options)).rejects.toThrow();
    deny = false;
    await getRepoCommitTree("owner", "repo", sha, { treeCacheAccountId: "other-account" });
    await getRepoCommitTree("owner", "other-repo", sha, options);
    vi.stubEnv("GITHUB_TOKEN", "conditional-token-rotated");
    await getRepoCommitTree("owner", "repo", sha, options);
    expect(seen.slice(-3)).toEqual(["", "", ""]);
  });

  it("expires validators and rejects an unsolicited 304", async () => {
    vi.useFakeTimers();
    vi.stubEnv("GITHUB_TOKEN", "conditional-expiry-token");
    const sha = "e".repeat(40);
    let unsolicited = false;
    const seen: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
      if (!url.includes("/commits/")) return Response.json(empty);
      seen.push(new Headers(init.headers).get("if-none-match") ?? "");
      return unsolicited ? new Response(null, { status: 304 })
        : Response.json({ sha, tree: { sha: empty.sha } }, { headers: { etag: '"expiring"' } });
    }));
    const options = { treeCacheAccountId: "conditional-expiry" };
    await getRepoCommitTree("owner", "repo", sha, options);
    vi.advanceTimersByTime(60 * 60_000);
    unsolicited = true;
    await expect(getRepoCommitTree("owner", "repo", sha, options)).rejects.toThrow();
    expect(seen).toEqual(["", ""]);
  });

  it("discards the prior validator if GitHub returns a malformed replacement", async () => {
    vi.stubEnv("GITHUB_TOKEN", "conditional-invalid-token");
    const sha = "f".repeat(40);
    let attempt = 0;
    const seen: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
      if (!url.includes("/commits/")) return Response.json(empty);
      seen.push(new Headers(init.headers).get("if-none-match") ?? "");
      attempt += 1;
      if (attempt === 1) return Response.json({ sha, tree: { sha: empty.sha } }, { headers: { etag: '"old"' } });
      if (attempt === 2) return Response.json({ sha: "bad", tree: { sha: empty.sha } });
      return new Response(null, { status: 304 });
    }));
    const options = { treeCacheAccountId: "conditional-invalid" };
    await getRepoCommitTree("owner", "repo", sha, options);
    await expect(getRepoCommitTree("owner", "repo", sha, options)).rejects.toThrow();
    await expect(getRepoCommitTree("owner", "repo", sha, options)).rejects.toThrow();
    expect(seen).toEqual(["", '"old"', ""]);
  });

  it("preserves partial-input outcomes and never caches incomplete evaluator trees", async () => {
    vi.stubEnv("GITHUB_TOKEN", "partial-tree-token");
    const sha = "c".repeat(40);
    let incomplete = true;
    const fetcher = vi.fn(async (url: string) => url.includes("/commits/")
      ? Response.json({ sha, tree: { sha: empty.sha } })
      : Response.json({ ...empty, truncated: incomplete }));
    vi.stubGlobal("fetch", fetcher);
    const options = { treeCacheAccountId: "partial-tree-account" };
    await expect(getRepoCommitTree("owner", "repo", sha, options)).resolves.toEqual({ entries: [], truncated: true });
    incomplete = false;
    await expect(getRepoCommitTree("owner", "repo", sha, options)).resolves.toEqual({ entries: [], truncated: false });
    expect(fetcher).toHaveBeenCalledTimes(4);
  });
});
