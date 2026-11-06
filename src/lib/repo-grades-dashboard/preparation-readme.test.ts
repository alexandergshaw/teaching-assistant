import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readPinnedRepoGradeReadme } from "./preparation-readme";
import { getRepoCommitTree } from "../github.repos";
import { discoverRepoGradeSources } from "./discovery";

const target = { owner: "Teacher", repo: "Class", sourceRef: "course/week", sourceCommit: "a".repeat(40) };
const base = "https://api.github.com/repos/Teacher/Class/git";
const folder = "Week";
const preferred = "Week/README.md";
const lower = "Week/readme.txt";
const failure = { status: "failure" };

function hashObject(type: string, bytes: Buffer): string {
  const header = Buffer.from(`${type} ${bytes.length}\u0000`);
  return createHash("sha1").update(Buffer.concat([header, bytes])).digest("hex");
}

function blob(path: string, data: Buffer | string, mode = "100644") {
  const bytes = Buffer.from(data);
  return { path, mode, bytes, type: "blob", sha: hashObject("blob", bytes), size: bytes.length };
}

function makeTree(blobs: ReturnType<typeof blob>[]) {
  const rows: { path: string; mode: string; type: string; sha: string; size?: number }[] = [];
  const dirs = new Map<string, string[]>([["", []]]);
  for (const { path, mode, type, sha, size } of blobs) {
    rows.push({ path, mode, type, sha, size });
    const parts = path.split("/");
    for (let depth = 1; depth < parts.length; depth += 1) dirs.set(parts.slice(0, depth).join("/"), []);
  }
  const rootSha = [...dirs.keys()].sort((a, b) => b.length - a.length).reduce((_, dir) => {
    const entries = rows.filter(({ path }) => path.substring(0, path.lastIndexOf("/")) === dir).map((row) => {
      const name = row.path.split("/").at(-1)!;
      return { key: Buffer.from(row.type === "tree" ? `${name}/` : name), row, name };
    });
    entries.sort((a, b) => Buffer.compare(a.key, b.key));
    const data = Buffer.concat(entries.flatMap(({ name, row }) => [
      Buffer.from(`${Number(row.mode)} ${name}\u0000`), Buffer.from(row.sha, "hex"),
    ]));
    const sha = hashObject("tree", data);
    if (dir) rows.push({ path: dir, mode: "040000", type: "tree", sha });
    return sha;
  }, "");
  return { sha: rootSha, tree: rows, truncated: false };
}

function stubGithub(
  blobs: ReturnType<typeof blob>[],
  intercept?: (path: string, init: RequestInit, tree: ReturnType<typeof makeTree>) => Response | Promise<Response> | undefined,
) {
  const tree = makeTree(blobs);
  const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
    const path = url.slice(base.length);
    const custom = intercept?.(path, init, tree);
    if (custom) return custom;
    if (path === `/commits/${target.sourceCommit}`) return Response.json({ sha: target.sourceCommit, tree: { sha: tree.sha } });
    if (path === `/trees/${tree.sha}?recursive=1`) return Response.json(tree);
    const found = blobs.find(({ sha }) => path === `/blobs/${sha}`);
    if (found) return new Response(new Uint8Array(found.bytes));
    throw new Error("Unexpected request");
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

beforeEach(() => vi.stubEnv("GITHUB_TOKEN", "secret-token"));
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("readPinnedRepoGradeReadme", () => {
  it("deduplicates classroom README blobs while preserving target identity, conflicts and authorization", async () => {
    const shared = blob(preferred, "common instructions");
    const changed = blob(preferred, "different instructions");
    const sharedTree = makeTree([shared]);
    const changedTree = makeTree([changed]);
    let denied = false;
    const fetchMock = vi.fn(async (url: string) => {
      const different = url.includes("/Different/");
      if (url.includes("/commits/")) return denied ? new Response(null, { status: 403 })
        : Response.json({ sha: target.sourceCommit, tree: { sha: (different ? changedTree : sharedTree).sha } });
      if (url.includes("/trees/")) return Response.json(different ? changedTree : sharedTree);
      if (url.includes("/blobs/")) return new Response(new Uint8Array(different ? changed.bytes : shared.bytes));
      throw new Error("Unexpected GitHub request");
    });
    vi.stubGlobal("fetch", fetchMock);
    const account = "shared-blob-integration";
    const read = (repo: string, accountId = account) => readPinnedRepoGradeReadme({ ...target, repo }, folder, undefined, accountId);
    await expect(read("First")).resolves.toMatchObject({ status: "present", text: "common instructions", target: { repo: "First" } });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    await expect(read("Second")).resolves.toMatchObject({ status: "present", text: "common instructions", target: { repo: "Second" } });
    expect(fetchMock).toHaveBeenCalledTimes(5);
    await expect(read("Different")).resolves.toMatchObject({ status: "present", text: "different instructions", target: { repo: "Different" } });
    expect(fetchMock).toHaveBeenCalledTimes(8);
    expect(fetchMock.mock.calls.filter(([url]) => url.includes("/blobs/"))).toHaveLength(2);
    denied = true;
    await expect(read("First")).resolves.toEqual(failure);
    await expect(read("Revoked")).resolves.toEqual(failure);
    expect(fetchMock).toHaveBeenCalledTimes(10);
    denied = false;
    await expect(read("Third", "separate-account")).resolves.toMatchObject({ status: "present" });
    vi.stubEnv("GITHUB_TOKEN", "rotated-blob-token");
    await expect(read("Fourth")).resolves.toMatchObject({ status: "present" });
    expect(fetchMock).toHaveBeenCalledTimes(16);
    expect(fetchMock.mock.calls.filter(([url]) => url.includes("/blobs/"))).toHaveLength(4);
  });

  it("requires verified target tree membership and a regular file even when blob content is cached", async () => {
    const readme = blob(preferred, "cached blob cannot authorize another target");
    const tree = makeTree([readme]);
    const account = "shared-blob-tree-membership";
    const fetchMock = vi.fn(async (url: string) => {
      const linked = url.includes("/Symlink/");
      const chosen = linked ? makeTree([{ ...readme, mode: "120000" }]) : tree;
      if (url.includes("/commits/")) return Response.json({ sha: target.sourceCommit, tree: { sha: chosen.sha } });
      if (url.includes("/trees/")) return Response.json(url.includes("/Corrupt/") ? { ...chosen, tree: [] } : chosen);
      return new Response(new Uint8Array(readme.bytes));
    });
    vi.stubGlobal("fetch", fetchMock);
    const read = (repo: string) => readPinnedRepoGradeReadme({ ...target, repo }, folder, undefined, account);
    await expect(read("Valid")).resolves.toMatchObject({ status: "present" });
    await expect(read("Corrupt")).resolves.toEqual(failure);
    await expect(read("Symlink")).resolves.toEqual(failure);
    expect(fetchMock).toHaveBeenCalledTimes(7);
    expect(fetchMock.mock.calls.filter(([url]) => url.includes("/blobs/"))).toHaveLength(1);
  });

  it("shares discovery's verified tree with README preparation and evaluation after fresh authorization", async () => {
    const readme = blob(preferred, "shared instructions");
    const tree = makeTree([readme]);
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes("/orgs/Teacher/repos")) return Response.json([
        { owner: { login: "Teacher" }, name: "Class", full_name: "Teacher/Class", default_branch: "main" },
      ]);
      if (url.endsWith("/commits/main")) return Response.json({ sha: target.sourceCommit, commit: { tree: { sha: tree.sha } } });
      if (url.endsWith(`/git/commits/${target.sourceCommit}`)) return Response.json({ sha: target.sourceCommit, tree: { sha: tree.sha } });
      if (url.includes("/git/trees/")) return Response.json(tree);
      if (url.endsWith(`/blobs/${readme.sha}`)) return new Response(new Uint8Array(readme.bytes));
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    const accountId = "discovery-readme-evaluator-shared";
    await expect(discoverRepoGradeSources({ accountId, organization: "Teacher" })).resolves.toMatchObject({ status: "scanned" });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    await expect(readPinnedRepoGradeReadme(target, folder, undefined, accountId)).resolves.toMatchObject({ status: "present" });
    expect(fetchMock).toHaveBeenCalledTimes(5);
    await expect(getRepoCommitTree(target.owner, target.repo, target.sourceCommit, { treeCacheAccountId: accountId }))
      .resolves.toMatchObject({ truncated: false });
    expect(fetchMock).toHaveBeenCalledTimes(6);
    expect(fetchMock.mock.calls.filter(([url]) => url.includes("/git/trees/"))).toHaveLength(1);
    expect(fetchMock.mock.calls.filter(([url]) => url.includes("/git/commits/"))).toHaveLength(2);
  });

  it("uses the commit, tree and winning executable blob IDs and preserves exact UTF-8 bytes", async () => {
    const contents = "\ufeff  Caf\u00e9 \u{10437}\r\nsecond line\r\n";
    const winning = blob(preferred, contents, "100755");
    const blobs = [blob("README.md", "root"), blob("week/README.md", "other case"), blob("Week.file", "sibling"),
      blob("Week/nested/README.md", "deeper"), blob(lower, "lower"), winning];
    const fetchMock = stubGithub(blobs);

    const result = await readPinnedRepoGradeReadme(target, folder);
    // The expected object IDs come from git hash-object -t <type> --stdin.
    const blobSha = "3f7b7cf8eebcfe3cd173a927bd2eae2bbae2367c";
    const treeSha = "cade1e5baf0f6b3e4f36893db216051a560fdd62";
    expect(result).toEqual({ status: "present", target, path: preferred, blobSha, text: contents });
    if (result.status !== "present") throw new Error("Expected present evidence");
    expect(Buffer.from(result.text)).toEqual(winning.bytes);
    expect(result.target).not.toBe(target);
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      `${base}/commits/${target.sourceCommit}`, `${base}/trees/${treeSha}?recursive=1`, `${base}/blobs/${blobSha}`,
    ]);
    for (const [, init] of fetchMock.mock.calls) {
      expect(init).toMatchObject({ cache: "no-store", redirect: "error", signal: expect.any(AbortSignal) });
    }
    expect(fetchMock.mock.calls[2][1].headers).toMatchObject({ Accept: "application/vnd.github.raw+json" });
  });

  it("recognizes a complete absent result without using READMEs outside the exact folder", async () => {
    const fetchMock = stubGithub([blob("README.md", "root"), blob("week/README.md", "other case"),
      blob("Week-2/README.md", "similar folder"), blob("Week/readmes/week1.txt", "plain file")]);
    await expect(readPinnedRepoGradeReadme(target, folder)).resolves.toEqual({ status: "absent", target });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("requires live authorization and isolates cached evidence by account, credential, repo and folder", async () => {
    const accountId = "readme-cache-account";
    const readme = blob(preferred, "instructions");
    let denied = false;
    const fetchMock = stubGithub([readme], (path) =>
      denied && path.startsWith("/commits/") ? new Response(null, { status: 403 }) : undefined);
    const read = (account = accountId, selectedFolder = folder) =>
      readPinnedRepoGradeReadme(target, selectedFolder, undefined, account);
    await expect(read()).resolves.toMatchObject({ status: "present" });
    expect(fetchMock).toHaveBeenCalledTimes(3);

    const otherRef = { ...target, sourceRef: "another/ref" };
    await expect(readPinnedRepoGradeReadme(otherRef, folder, undefined, accountId))
      .resolves.toMatchObject({ status: "present", target: otherRef });
    expect(fetchMock).toHaveBeenCalledTimes(4);

    denied = true;
    await expect(read()).resolves.toEqual(failure);
    expect(fetchMock).toHaveBeenCalledTimes(5);
    denied = false;
    await expect(read("another-account")).resolves.toMatchObject({ status: "present" });
    await expect(read(accountId, "Week/subfolder")).resolves.toMatchObject({ status: "absent" });
    vi.stubEnv("GITHUB_TOKEN", "rotated-token");
    await expect(read()).resolves.toMatchObject({ status: "present" });
    expect(fetchMock).toHaveBeenCalledTimes(12);

    const otherRepo = { ...target, repo: "Another-class" };
    const otherRepoFetch = vi.fn(async (url: string) => {
      if (url.includes("/commits/")) {
        return Response.json({ sha: target.sourceCommit, tree: { sha: makeTree([readme]).sha } });
      }
      return new Response(null, { status: 404 });
    });
    vi.stubGlobal("fetch", otherRepoFetch);
    await expect(readPinnedRepoGradeReadme(otherRepo, folder, undefined, accountId)).resolves.toEqual(failure);
    expect(otherRepoFetch).toHaveBeenCalledTimes(2);
  });

  it("only retains fully verified evidence for the commit's current tree pointer", async () => {
    const accountId = "readme-verified-cache";
    let corrupt = true;
    const read = () => readPinnedRepoGradeReadme(target, folder, undefined, accountId);
    const first = stubGithub([blob(preferred, "first")], (path) =>
      corrupt && path.startsWith("/blobs/") ? new Response("wrong") : undefined);
    await expect(read()).resolves.toEqual(failure);
    corrupt = false;
    await expect(read()).resolves.toMatchObject({ status: "present", text: "first" });
    expect(first).toHaveBeenCalledTimes(5);

    const second = stubGithub([blob(preferred, "second")]);
    await expect(read()).resolves.toMatchObject({ status: "present", text: "second" });
    expect(second).toHaveBeenCalledTimes(3);
  });

  it.each([
    { limit: "entry count", accounts: 257, contents: null, requests: 2 },
    { limit: "text size", accounts: 34, contents: "x".repeat(128_000), requests: 2 },
  ])("evicts old evidence at the cache's $limit limit", async ({ limit, accounts, contents, requests }) => {
    const fetchMock = stubGithub(contents === null ? [] : [blob(preferred, contents)]);
    const read = (index: number) =>
      readPinnedRepoGradeReadme(target, folder, undefined, `cache-budget-${limit}-${index}`);
    const expected = { status: contents === null ? "absent" : "present" };
    for (let index = 0; index < accounts; index += 1) await expect(read(index)).resolves.toMatchObject(expected);
    fetchMock.mockClear();
    await expect(read(accounts - 1)).resolves.toMatchObject(expected);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    fetchMock.mockClear();
    await expect(read(0)).resolves.toMatchObject(expected);
    expect(fetchMock).toHaveBeenCalledTimes(requests);
  });

  it.each(["", "\ufeff \r\n\t"])("reports verified blank %j without using a lower candidate", async (contents) => {
    const winner = blob(preferred, contents);
    const fetchMock = stubGithub([blob(lower, "lower"), winner]);
    await expect(readPinnedRepoGradeReadme(target, folder)).resolves.toEqual({
      status: "blank", target, path: preferred, blobSha: winner.sha, text: contents,
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[2][0]).toBe(`${base}/blobs/${winner.sha}`);
  });

  it("keeps shallow and named candidate precedence", async () => {
    const winner = blob(lower, "chosen");
    stubGithub([blob("Week/a-readme", "lexically earlier"), blob("Week/sub/README.md", "deeper"), winner]);
    await expect(readPinnedRepoGradeReadme(target, folder)).resolves.toMatchObject({ status: "present", path: lower });
  });

  it.each([
    ["invalid UTF-8", Buffer.from([0xc0, 0xaf])], ["NUL", Buffer.from("a\u0000b")],
  ])("fails on verified bytes containing %s without trying another README", async (_, bytes) => {
    const fetchMock = stubGithub([blob(preferred, bytes), blob(lower, "lower")]);
    await expect(readPinnedRepoGradeReadme(target, folder)).resolves.toEqual(failure);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it.each([
    blob(preferred, "target.md", "120000"), blob(preferred, "x".repeat(128_001)),
  ])("fails before requesting an unsupported winning blob", async (winner) => {
    const fetchMock = stubGithub([winner, blob(lower, "lower")]);
    await expect(readPinnedRepoGradeReadme(target, folder)).resolves.toEqual(failure);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("fails when canonical equivalents give the picker no unique winning path", async () => {
    const fetchMock = stubGithub([blob("Week/caf\u00e9/README.md", "one"), blob("Week/cafe\u0301/README.md", "two")]);
    await expect(readPinnedRepoGradeReadme(target, folder)).resolves.toEqual(failure);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("rejects a symlink in the exact folder scope", async () => {
    const fetchMock = stubGithub([blob("Week", "elsewhere", "120000")]);
    await expect(readPinnedRepoGradeReadme(target, "Week/subfolder")).resolves.toEqual(failure);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it.each(["../Week", "Week//sub", "Week/..", "Week\\sub", "Week/\u0000sub"])("rejects invalid folder %j before transport", async (path) => {
    const fetchMock = stubGithub([]);
    await expect(readPinnedRepoGradeReadme(target, path)).resolves.toEqual(failure);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects invalid target identities and mismatched commit metadata", async () => {
    const fetchMock = stubGithub([], (path) => path.startsWith("/commits/")
      ? Response.json({ sha: "b".repeat(40), tree: { sha: "c".repeat(40) } }) : undefined);
    for (const bad of [{ owner: "Teacher\n" }, { repo: ".." }, { sourceRef: ".." }, { sourceCommit: "abcd" }]) {
      await expect(readPinnedRepoGradeReadme({ ...target, ...bad }, folder)).resolves.toEqual(failure);
    }
    expect(fetchMock).not.toHaveBeenCalled();
    await expect(readPinnedRepoGradeReadme(target, folder)).resolves.toEqual(failure);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  const treeCorruptions: Record<string, (tree: ReturnType<typeof makeTree>) => unknown> = {
    "wrong tree identity": (tree) => ({ ...tree, sha: "b".repeat(40) }),
    "truncation": (tree) => ({ ...tree, truncated: true }),
    "missing completeness marker": ({ sha, tree }) => ({ sha, tree }),
    "malformed listing": (tree) => ({ ...tree, tree: null }),
    "unsafe path": ({ tree, ...rest }) => ({ ...rest, tree: [...tree, { ...tree[0], path: "Week/../README.md" }] }),
    "duplicate path": ({ tree, ...rest }) => ({ ...rest, tree: [...tree, tree[0]] }),
    "invalid mode": ({ tree, ...rest }) => ({ ...rest, tree: [{ ...tree[0], mode: "100600" }, ...tree.slice(1)] }),
    "invalid type": ({ tree, ...rest }) => ({ ...rest, tree: [{ ...tree[0], type: "tree" }, ...tree.slice(1)] }),
    "invalid SHA": ({ tree, ...rest }) => ({ ...rest, tree: [{ ...tree[0], sha: "c".repeat(40) + "\n" }, ...tree.slice(1)] }),
    "missing blob size": ({ tree, ...rest }) => ({ ...rest, tree: [{ ...tree[0], size: undefined }, ...tree.slice(1)] }),
    "invalid blob size": ({ tree, ...rest }) => ({ ...rest, tree: [{ ...tree[0], size: -1 }, ...tree.slice(1)] }),
    "omitted subdirectory child": ({ tree, ...rest }) => ({ ...rest, tree: tree.slice(1) }),
    "omitted parent tree": ({ tree, ...rest }) => ({ ...rest, tree: tree.slice(0, 1) }),
    "wrong subdirectory hash": ({ tree, ...rest }) => ({ ...rest, tree: [tree[0], { ...tree[1], sha: "c".repeat(40) }] }),
  };

  it.each(Object.entries(treeCorruptions))("fails closed on %s", async (_, corrupt) => {
    const fetchMock = stubGithub([blob(preferred, "expected")], (path, _init, tree) =>
      path.startsWith("/trees/") ? Response.json(corrupt(tree)) : undefined);
    await expect(readPinnedRepoGradeReadme(target, folder)).resolves.toEqual(failure);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it.each(["different", "short"])("rejects incorrect blob hash or size (%s)", async (bytes) => {
    const fetchMock = stubGithub([blob(preferred, "original!"), blob(lower, "lower")], (path) =>
      path.startsWith("/blobs/") ? new Response(bytes) : undefined);
    await expect(readPinnedRepoGradeReadme(target, folder)).resolves.toEqual(failure);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it.each(["/commits/", "/trees/", "/blobs/"])("rejects redirects at %s without exposing the location", async (redirected) => {
    stubGithub([blob(preferred, "expected")], (path) => path.startsWith(redirected)
      ? Response.redirect("https://example.com/secret-token") : undefined);
    await expect(readPinnedRepoGradeReadme(target, folder)).resolves.toEqual(failure);
  });

  it("cancels a stream that lies about its byte count and never buffers a transport error body", async () => {
    const cancel = vi.fn();
    const stream = () => new ReadableStream<Uint8Array>({
      start(controller) { controller.enqueue(Uint8Array.from([65, 66, 67])); }, cancel,
    });
    const fetchMock = stubGithub([blob(preferred, "AB"), blob(lower, "lower")], (path) =>
      path.startsWith("/blobs/") ? new Response(stream(), { headers: { "content-length": "2" } }) : undefined);
    await expect(readPinnedRepoGradeReadme(target, folder)).resolves.toEqual(failure);
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(3);

    stubGithub([], () => new Response(stream(), { status: 500 }));
    await expect(readPinnedRepoGradeReadme(target, folder)).resolves.toEqual(failure);
    expect(cancel).toHaveBeenCalledTimes(2);
  });

  it("cancels a stalled body at the overall deadline", async () => {
    vi.useFakeTimers();
    const cancel = vi.fn();
    const fetchMock = stubGithub([blob(preferred, "AB")], (path) => path.startsWith("/blobs/")
      ? new Response(new ReadableStream<Uint8Array>({ cancel })) : undefined);
    const reading = readPinnedRepoGradeReadme(target, folder);
    await vi.advanceTimersByTimeAsync(9_999);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(cancel).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await expect(reading).resolves.toEqual(failure);
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it("passes caller cancellation to pending fetches and sanitizes transport exceptions", async () => {
    const caller = new AbortController();
    const fetchMock = stubGithub([], (_path, init) => new Promise((_resolve, reject) => {
      init.signal!.addEventListener("abort", () => reject(new Error("secret-token /private/repo")), { once: true });
    }));
    const reading = readPinnedRepoGradeReadme(target, folder, caller.signal);
    caller.abort();
    await expect(reading).resolves.toEqual(failure);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await expect(readPinnedRepoGradeReadme(target, folder, caller.signal)).resolves.toEqual(failure);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
