import { stageRepositoryBatch, emptyRepositoryEvidence } from "@/app/components/grading-chat/chatRepositoryBatch";
import { confirmRepositoryMapping, collectionRequest } from "@/app/components/grading-chat/chatRepositoryProposals";
import { beforeEach, describe, expect, it, vi } from "vitest";
const { owner } = vi.hoisted(() => ({ owner: vi.fn() }));
vi.mock("@/lib/supabase/auth", () => ({ requireAppOwner: owner }));
import { POST } from "./route";
const sha = "a".repeat(40);
const key = { sessionEpoch: "session-1", sourceIndex: 2 };
function body(kind = "blob", ref = "feature/slash", path: string | null = "src/main.py") {
  return { operation: "collect", attemptId: "attempt-1", studentKey: key, mappings: [{ stagedItemId: "item-1", studentKey: key, scope: { owner: "owner", repo: "repo", kind, requestedRef: ref, requestedPath: path }, mappingRevision: 1, basis: "instructor-confirmed", originalUrl: `https://github.com/owner/repo/${kind}/${ref}${path ? `/${path}` : ""}` }] };
}
const send = (data: unknown) => POST(new Request("http://localhost/api/grading-chat-repository", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(data) }));
const fetcher = vi.fn();
beforeEach(() => { vi.clearAllMocks(); owner.mockResolvedValue({}); vi.stubEnv("GITHUB_TOKEN", "synthetic"); vi.stubGlobal("fetch", fetcher); });
function githubFixture(options: { failPin?: boolean; truncated?: boolean; submodule?: boolean } = {}) {
  fetcher.mockImplementation(async (url: string) => {
    if (url.includes("/commits?")) return Response.json(options.failPin ? [] : [{ sha }]);
    if (url.includes("/git/trees/")) return Response.json({ truncated: !!options.truncated, tree: [
      { path: "src", type: "tree" }, { path: "src/main.py", type: "blob", size: 5, mode: "100644" },
      { path: "src/sibling.py", type: "blob", size: 4, mode: "100644" },
      ...(options.submodule ? [{ path: "vendor-module", type: "commit", mode: "160000" }, { path: "odd", type: "future" }] : []),
    ] });
    if (url.includes("/contents/")) return new Response("print('fixed')");
    throw new Error("Unexpected endpoint");
  });
}
describe("guarded route through real strict collector and GitHub lowest boundary", () => {
  it("guards before reading hostile bodies and never fetches", async () => {
    owner.mockRejectedValue(new Error("private"));
    const request = new Request("http://localhost/api/grading-chat-repository", { method: "POST" });
    Object.defineProperty(request, "body", { get() { throw new Error("body read before guard"); } });
    expect((await POST(request)).status).toBe(401); expect(fetcher).not.toHaveBeenCalled();
  });
  it("rejects semantic unknown fields, mismatched targets, foreign and raw traversal URLs", async () => {
    const forged = body(); Object.assign(forged, { pin: "immutable" });
    const foreign = body(); foreign.mappings[0].originalUrl = "https://evil.test/owner/repo/blob/feature/slash/src/main.py";
    const traversal = body(); traversal.mappings[0].originalUrl = "https://github.com/owner/repo/blob/feature/slash/../src/main.py";
    const wrongTarget = body(); wrongTarget.mappings[0].studentKey = { ...key, sourceIndex: 99 };
    for (const item of [forged, foreign, traversal, wrongTarget]) expect((await send(item)).status).toBe(400);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("pins confirmed full slash ref and fetches exactly one blob with stable time-independent digest", async () => {
    githubFixture(); const first = await (await send(body())).json();
    expect(first.evidence[0].manifest.commitSha).toBe(sha);
    expect(first.evidence[0].files.map((f: { path: string }) => f.path)).toEqual(["src/main.py"]);
    expect(first.evidence[0].manifest.timing).toEqual({ kind: "unknown", reason: "no-trusted-submission-time" });
    expect(fetcher.mock.calls.map((c) => c[0])).toEqual([
      "https://api.github.com/repos/owner/repo/commits?per_page=1&sha=feature%2Fslash",
      `https://api.github.com/repos/owner/repo/git/trees/${sha}?recursive=1`,
      `https://api.github.com/repos/owner/repo/contents/src/main.py?ref=${sha}`,
    ]);
    const again = await (await send(body())).json(); expect(again.evidence[0].manifest.digest).toBe(first.evidence[0].manifest.digest);
  });
  it("fails pin closed and does not dispatch moving-ref tree", async () => {
    githubFixture({ failPin: true }); expect((await send(body())).status).toBe(422); expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("accounts truncated trees, unknown types and submodules", async () => {
    githubFixture({ truncated: true, submodule: true });
    const input = body("commit", sha, null); const result = await (await send(input)).json();
    expect(result.evidence[0].manifest.coverage).toMatchObject({ complete: false, treeTruncated: true, unenumerated: true, omitted: [{ path: "vendor-module", reason: "unsupported" }] });
    expect(fetcher.mock.calls.every((c) => !String(c[0]).includes("/commits?"))).toBe(true);
  });
  it("rejects redirects without forwarding the token", async () => {
    fetcher.mockResolvedValue(new Response("", { status: 302, headers: { location: "https://evil.test" } }));
    expect((await send(body())).status).toBe(422); expect(fetcher).toHaveBeenCalledTimes(1); expect(fetcher.mock.calls[0][1].redirect).toBe("manual");
  });
  it("accounts unreadable and byte-capped source rather than claiming complete", async () => {
    githubFixture(); const impl = fetcher.getMockImplementation()!;
    fetcher.mockImplementation(async (...args) => String(args[0]).includes("/contents/") ? new Response("x".repeat(300_001)) : impl(...args));
    const result = await (await send(body())).json(); expect(result.evidence[0].manifest.coverage).toMatchObject({ complete: false, omitted: [{ path: "src/main.py", reason: "byte-cap" }] });
    expect(result.evidence[0].files).toEqual([]);
  });
});
it("refuses wrong content type, oversized body and malformed JSON before GitHub", async () => {
  const request = (text: string, type: string) => new Request("http://localhost", { method: "POST", headers: { "content-type": type }, body: text });
  expect((await POST(request("{}", "text/plain"))).status).toBe(400);
  expect((await POST(request("{", "application/json"))).status).toBe(400);
  expect((await POST(request("x".repeat(3_700_000), "application/json"))).status).toBe(400);
  expect(fetcher).not.toHaveBeenCalled();
});
it("shares the selected-file ceiling across confirmed links", async () => {
  const input = body("commit", sha, null);
  input.mappings.push({ ...input.mappings[0], stagedItemId: "second", scope: { ...input.mappings[0].scope, repo: "second" }, originalUrl: `https://github.com/owner/second/commit/${sha}` });
  fetcher.mockImplementation(async (url: string) => url.includes("/git/trees/") ? Response.json({ tree: Array.from({ length: 50 }, (_, n) => ({ path: `file-${String(n).padStart(2, "0")}.py`, type: "blob", mode: "100644", size: 1 })) }) : new Response("x"));
  const result = await (await send(input)).json();
  expect(result.evidence.map((e: { files: unknown[] }) => e.files.length)).toEqual([50, 30]);
  expect(result.evidence[1].manifest.coverage.omitted).toHaveLength(20);
  expect(result.evidence[1].manifest.coverage.omitted[0]).toEqual({ path: "file-30.py", reason: "file-cap" });
  expect(fetcher.mock.calls.filter((c) => String(c[0]).includes("/contents/"))).toHaveLength(80);
});
it("shares decoded-byte budget across links without resetting it", async () => {
  const input = body("commit", sha, null);
  input.mappings.push({ ...input.mappings[0], stagedItemId: "second", scope: { ...input.mappings[0].scope, repo: "second" }, originalUrl: `https://github.com/owner/second/commit/${sha}` });
  fetcher.mockImplementation(async (url: string) => url.includes("/git/trees/") ? Response.json({ tree: Array.from({ length: 8 }, (_, n) => ({ path: `file-${n}.py`, type: "blob", mode: "100644", size: 300_000 })) }) : new Response("x".repeat(300_000)));
  const result = await (await send(input)).json();
  expect(result.evidence.map((e: { files: unknown[] }) => e.files.length)).toEqual([8, 2]);
  expect(result.evidence[1].manifest.coverage.omitted).toHaveLength(6);
  expect(fetcher.mock.calls.filter((c) => String(c[0]).includes("/contents/"))).toHaveLength(10);
});
it("bounds metadata error streams and never forwards raw error details", async () => {
  let cancelled = false;
  fetcher.mockResolvedValue(new Response(new ReadableStream({ start(c) { c.enqueue(new Uint8Array(1_000_001)); }, cancel() { cancelled = true; } }), { status: 403 }));
  const response = await send(body()); expect(response.status).toBe(422); expect(cancelled).toBe(true);
  expect(await response.text()).not.toContain("403"); expect(fetcher).toHaveBeenCalledTimes(1);
});
it("executes actual stage, confirm, request, route and GitHub tree/file chain for an immutable commit", async () => {
  githubFixture();
  const staged = stageRepositoryBatch(`https://github.com/owner/repo/commit/${sha}`, emptyRepositoryEvidence());
  const mapping = confirmRepositoryMapping(staged.lines[0], { key, label: "Duplicate Name (2)", sourceCue: "original.py", retainedBytes: 100 }, 1);
  expect(mapping).not.toBeNull();
  const request = collectionRequest("attempt-chain", [mapping!]);
  const response = await send(request); expect(response.status).toBe(200);
  const result = await response.json(); expect(result.evidence[0].manifest.commitSha).toBe(sha);
  expect(result.evidence[0].files.map((file: { path: string }) => file.path)).toEqual(["src/main.py", "src/sibling.py"]);
  expect(fetcher.mock.calls.map((call) => call[0])).toEqual([
    `https://api.github.com/repos/owner/repo/git/trees/${sha}?recursive=1`,
    `https://api.github.com/repos/owner/repo/contents/src/main.py?ref=${sha}`,
    `https://api.github.com/repos/owner/repo/contents/src/sibling.py?ref=${sha}`,
  ]);
});
it("does not fabricate a default branch from missing strict metadata", async () => {
  fetcher.mockResolvedValue(Response.json({}));
  const input = body("repository", "", null);
  Object.assign(input.mappings[0].scope, { requestedRef: null }); input.mappings[0].originalUrl = "https://github.com/owner/repo";
  expect((await send(input)).status).toBe(422); expect(fetcher).toHaveBeenCalledTimes(1);
});
it("discards late metadata completion before any source or later-link reads", async () => {
  let now = 1000; const clock = vi.spyOn(Date, "now").mockImplementation(() => now);
  fetcher.mockImplementation(async () => { now += 50_001; return Response.json([{ sha }]); });
  try { expect((await send(body())).status).toBe(422); expect(fetcher).toHaveBeenCalledTimes(1); }
  finally { clock.mockRestore(); }
});
it("retains encoded spaces in an exact scoped blob path through the real network helper", async () => {
  const input = body("blob", "main", "Act 3/file.py");
  input.mappings[0].originalUrl = "https://github.com/owner/repo/blob/main/Act%203/file.py";
  fetcher.mockImplementation(async (url: string) => {
    if (url.includes("/commits?")) return Response.json([{ sha }]);
    if (url.includes("/git/trees/")) return Response.json({ truncated: false, tree: [{ path: "Act 3/file.py", type: "blob", mode: "100644", size: 1 }, { path: "Act 3/sibling.py", type: "blob", mode: "100644", size: 1 }] });
    if (url.includes("/contents/")) return new Response("x");
    throw new Error("Unexpected endpoint");
  });
  const response = await send(input); expect(response.status).toBe(200);
  const result = await response.json(); expect(result.evidence[0].files.map((f: { path: string }) => f.path)).toEqual(["Act 3/file.py"]);
  expect(fetcher.mock.calls.map((c) => c[0])).toEqual([
    "https://api.github.com/repos/owner/repo/commits?per_page=1&sha=main",
    `https://api.github.com/repos/owner/repo/git/trees/${sha}?recursive=1`,
    `https://api.github.com/repos/owner/repo/contents/Act%203/file.py?ref=${sha}`,
  ]);
});