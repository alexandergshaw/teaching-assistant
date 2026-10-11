// REF-DOTSEGMENT-SWEEP: URL-level proof that every ref/branch PATH sink in the
// github lib files is routed through encodeRefSegment, and that the four QUERY
// sinks were deliberately left alone. Mocks fetch (never @/lib/github) so the
// real URL is what is asserted; `new URL(u).pathname` is used on purpose
// because `not.toContain("..")` is green on the dot-segment bug (the URL
// parser has already collapsed the segment). Harness duplicated from
// github.files.ref-traversal.test.ts (no cross-test-file imports).
//
// Sink classes (see docs/ref-dotsegment-sweep-scope.md):
//  - 7 LIVE reject-testable sinks: reject rows (two forms, see below).
//  - 5 DEFENSE-IN-DEPTH sinks (copy.ts:159, copy.ts:177, copy.ts:385,
//    files.ts:113, files.ts:134): ACCEPT rows only. Their throw is UNREACHABLE
//    through the production callers (GitHub-assigned default branch, or an
//    earlier guard on the SAME value throws first), so a reject row would be
//    unsatisfiable and is deliberately not written.
//  - 4 QUERY sinks: pinned as LEFT (no throw, inert query).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import JSZip from "jszip";
import { createBranch, deleteBranch, listCommits } from "./github.branches";
import { setBranchProtection } from "./github.collab";
import { copyPathsToRepo, copyRepo } from "./github.copy";
import { downloadRepoZipball } from "./github.digest";
import { deletePaths, movePaths, putFile } from "./github.files";
import { findWorkflowRunSince, getLatestWorkflowRun } from "./github.actions";

const INVALID = "That is not a valid branch name.";
const fetchMock = vi.fn();

function okJson(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200 });
}

let zipBytes: Uint8Array;

function repoJson(owner: string, name: string, defaultBranch: string): unknown {
  return { full_name: `${owner}/${name}`, name, default_branch: defaultBranch, owner: { login: owner } };
}

async function route(url: string, init?: RequestInit): Promise<Response> {
  const u = new URL(String(url));
  const p = u.pathname;
  const method = (init?.method ?? "GET").toUpperCase();
  if (method === "GET" && p === "/repos/o/r") return okJson(repoJson("o", "r", "main"));
  if (method === "GET" && p === "/repos/dO/dR") return okJson(repoJson("dO", "dR", "develop"));
  if (method === "POST" && p === "/user/repos") return okJson(repoJson("dO", "dR", "release/1"));
  if (method === "GET" && /\/git\/trees\//.test(p)) {
    return okJson({ tree: [{ path: "a.txt", type: "blob", size: 2, sha: "s1", mode: "100644" }], truncated: false });
  }
  if (method === "GET" && /\/zipball\//.test(p)) return new Response(zipBytes as unknown as BodyInit, { status: 200 });
  if (method === "POST" && /\/git\/blobs$/.test(p)) return okJson({ sha: "b1" });
  if (method === "POST" && /\/git\/trees$/.test(p)) return okJson({ sha: "t1" });
  if (method === "GET" && /\/git\/ref\/heads\//.test(p)) return okJson({ object: { sha: "h1" } });
  if (method === "GET" && /\/git\/commits\/h1$/.test(p)) return okJson({ tree: { sha: "bt" } });
  if (method === "POST" && /\/git\/commits$/.test(p)) return okJson({ sha: "c1" });
  if (/\/commits$/.test(p)) return okJson([]);
  return okJson({});
}

beforeEach(async () => {
  const zip = new JSZip();
  zip.file("root/a.txt", "hi");
  zipBytes = await zip.generateAsync({ type: "uint8array" });
  vi.stubEnv("GITHUB_TOKEN", "t");
  fetchMock.mockReset();
  fetchMock.mockImplementation(route);
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

function recordedPaths(): string[] {
  return fetchMock.mock.calls.map((c) => new URL(String(c[0])).pathname);
}

async function thrownMessage(fn: () => Promise<unknown>): Promise<string | null> {
  try {
    await fn();
    return null;
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
}

const COPY_OPTS = { destName: "dR", visibility: "private" as const, includeWorkflows: false, copyTopics: false, copyLabels: false };
const PATHS_OPTS = { destOwner: "dO", destRepo: "dR", paths: ["a.txt"] };

// ---------------------------------------------------------------------------
// Instrument O: FROZEN raw-danger oracle. Each row pairs a raw input with the
// exact pathname the UNGUARDED encodeURIComponent interpolation produces.
// ---------------------------------------------------------------------------
describe("raw-danger oracle (unguarded interpolation is really dangerous)", () => {
  const rows: Array<{ name: string; build: (ref: string) => string; ref: string; bad: string; intended: string }> = [
    { name: "git/ref/heads ..", build: (r) => `/repos/o/r/git/ref/heads/${r}`, ref: "..", bad: "/repos/o/r/git/ref/", intended: "/repos/o/r/git/ref/heads/.." },
    { name: "git/refs/heads ..", build: (r) => `/repos/o/r/git/refs/heads/${r}`, ref: "..", bad: "/repos/o/r/git/refs/", intended: "/repos/o/r/git/refs/heads/.." },
    { name: "branches protection ..", build: (r) => `/repos/o/r/branches/${r}/protection`, ref: "..", bad: "/repos/o/r/protection", intended: "/repos/o/r/branches/../protection" },
    { name: "git/trees ..", build: (r) => `/repos/o/r/git/trees/${r}?recursive=1`, ref: "..", bad: "/repos/o/r/git/", intended: "/repos/o/r/git/trees/.." },
    { name: "zipball ..", build: (r) => `/repos/o/r/zipball/${r}`, ref: "..", bad: "/repos/o/r/", intended: "/repos/o/r/zipball/.." },
    { name: "git/ref/heads .", build: (r) => `/repos/o/r/git/ref/heads/${r}`, ref: ".", bad: "/repos/o/r/git/ref/heads/", intended: "/repos/o/r/git/ref/heads/." },
  ];
  for (const row of rows) {
    it(`unguarded ${row.name} collapses to the frozen BAD pathname`, () => {
      const raw = row.build(encodeURIComponent(row.ref));
      const pathname = new URL(`https://api.github.com${raw}`).pathname;
      expect(pathname).toBe(row.bad);
      expect(pathname).not.toBe(row.intended);
    });
  }
});

// ---------------------------------------------------------------------------
// Instrument P, REJECT rows. Form A: first/only-fetch sinks - nothing fetches
// before the guard, so fetch must not be called at all. Form B: sibling-fetch
// sinks - an earlier unrelated fetch fires first, so assert the sink's OWN
// collapsed pathname never reaches fetch. Both also pin the exact message.
// ---------------------------------------------------------------------------
const DOTS = ["..", ".", " .. "];

describe("reject, first/only-fetch sinks: no fetch fires and the message is exact", () => {
  const sinks: Array<{ sink: string; run: (ref: string) => Promise<unknown> }> = [
    { sink: "branches.ts:7 createBranch(fromBranch)", run: (r) => createBranch("o", "r", "new", r) },
    { sink: "branches.ts:20 deleteBranch(branch)", run: (r) => deleteBranch("o", "r", r) },
    {
      sink: "collab.ts:86 setBranchProtection(branch)",
      run: (r) =>
        setBranchProtection("o", "r", r, {
          requirePullRequestReviews: false,
          requiredApprovingReviewCount: 1,
          requireStatusChecks: false,
          statusCheckContexts: [],
          strictStatusChecks: false,
          enforceAdmins: false,
          requireLinearHistory: false,
        }),
    },
    { sink: "digest.ts:445 downloadRepoZipball(ref)", run: (r) => downloadRepoZipball("o", "r", r) },
  ];
  for (const s of sinks) {
    for (const dot of DOTS) {
      it(`${s.sink} rejects ${JSON.stringify(dot)}`, async () => {
        const msg = await thrownMessage(() => s.run(dot));
        expect(fetchMock).not.toHaveBeenCalled();
        expect(msg).toBe(INVALID);
      });
    }
  }
});

describe("reject, sibling-fetch sinks: the sink's own collapsed pathname never reaches fetch", () => {
  const sinks: Array<{ sink: string; collapsed: Record<string, string>; run: (ref: string) => Promise<unknown> }> = [
    {
      sink: "copy.ts:47 copyRepo(sourceBranch)",
      collapsed: { "..": "/repos/o/r/git/", ".": "/repos/o/r/git/trees/", " .. ": "/repos/o/r/git/" },
      run: (r) => copyRepo("o", "r", { ...COPY_OPTS, sourceBranch: r }),
    },
    {
      sink: "copy.ts:262 copyPathsToRepo(sourceBranch)",
      collapsed: { "..": "/repos/o/r/git/", ".": "/repos/o/r/git/trees/", " .. ": "/repos/o/r/git/" },
      run: (r) => copyPathsToRepo("o", "r", { ...PATHS_OPTS, sourceBranch: r }),
    },
    {
      sink: "copy.ts:337 copyPathsToRepo(destBranch)",
      collapsed: { "..": "/repos/dO/dR/git/ref/", ".": "/repos/dO/dR/git/ref/heads/", " .. ": "/repos/dO/dR/git/ref/" },
      run: (r) => copyPathsToRepo("o", "r", { ...PATHS_OPTS, destBranch: r }),
    },
  ];
  for (const s of sinks) {
    for (const dot of DOTS) {
      it(`${s.sink} rejects ${JSON.stringify(dot)}`, async () => {
        const msg = await thrownMessage(() => s.run(dot));
        // A sibling fetch (getRepo etc.) legitimately fired first, so a blanket
        // not.toHaveBeenCalled() would be false even with a working guard.
        expect(fetchMock).toHaveBeenCalled();
        expect(recordedPaths()).not.toContain(s.collapsed[dot]);
        expect(msg).toBe(INVALID);
      });
    }
  }
});

// ---------------------------------------------------------------------------
// Instrument P, ACCEPT rows: the intended pathname for a benign multi-segment
// ref, for all 12 routed sinks.
// ---------------------------------------------------------------------------
describe("accept, live sinks emit the intended pathname", () => {
  it("branches.ts:7 createBranch", async () => {
    await createBranch("o", "r", "new", "feature/x");
    expect(new URL(String(fetchMock.mock.calls[0][0])).pathname).toBe("/repos/o/r/git/ref/heads/feature%2Fx");
  });

  it("branches.ts:20 deleteBranch", async () => {
    await deleteBranch("o", "r", "feature/x");
    expect(new URL(String(fetchMock.mock.calls[0][0])).pathname).toBe("/repos/o/r/git/refs/heads/feature%2Fx");
  });

  it("collab.ts:86 setBranchProtection", async () => {
    await setBranchProtection("o", "r", "feature/x", {
      requirePullRequestReviews: false,
      requiredApprovingReviewCount: 1,
      requireStatusChecks: false,
      statusCheckContexts: [],
      strictStatusChecks: false,
      enforceAdmins: false,
      requireLinearHistory: false,
    });
    expect(new URL(String(fetchMock.mock.calls[0][0])).pathname).toBe("/repos/o/r/branches/feature%2Fx/protection");
  });

  it("digest.ts:445 downloadRepoZipball", async () => {
    await downloadRepoZipball("o", "r", "feature/x");
    expect(new URL(String(fetchMock.mock.calls[0][0])).pathname).toBe("/repos/o/r/zipball/feature%2Fx");
  });

  it("copy.ts:47 copyRepo trees call", async () => {
    await copyRepo("o", "r", { ...COPY_OPTS, sourceBranch: "feature/x" });
    expect(recordedPaths()).toContain("/repos/o/r/git/trees/feature%2Fx");
  });

  it("copy.ts:262 and :337 copyPathsToRepo source tree and dest ref-read", async () => {
    await copyPathsToRepo("o", "r", { ...PATHS_OPTS, sourceBranch: "feature/x", destBranch: "dest/y" });
    const paths = recordedPaths();
    expect(paths).toContain("/repos/o/r/git/trees/feature%2Fx");
    expect(paths).toContain("/repos/dO/dR/git/ref/heads/dest%2Fy");
  });
});

// Defense-in-depth sinks: ACCEPT only. The throw is unreachable via production
// callers, so no reject/sabotage row exists for any of these five.
describe("accept, defense-in-depth sinks emit the intended pathname (throw unreachable via production)", () => {
  it("copy.ts:159 and :177 copyRepo dest default-branch ref read and update", async () => {
    await copyRepo("o", "r", { ...COPY_OPTS });
    const paths = recordedPaths();
    expect(paths).toContain("/repos/dO/dR/git/ref/heads/release%2F1");
    expect(paths).toContain("/repos/dO/dR/git/refs/heads/release%2F1");
  });

  it("copy.ts:385 copyPathsToRepo dest ref update", async () => {
    await copyPathsToRepo("o", "r", { ...PATHS_OPTS, destBranch: "dest/y" });
    expect(recordedPaths()).toContain("/repos/dO/dR/git/refs/heads/dest%2Fy");
  });

  it("files.ts:113 and :134 deletePaths ref read and update", async () => {
    const out = await deletePaths("o", "r", "feature/x", ["a.txt"], "m");
    expect(out.deleted).toBe(1);
    const paths = recordedPaths();
    expect(paths).toContain("/repos/o/r/git/ref/heads/feature%2Fx");
    expect(paths).toContain("/repos/o/r/git/refs/heads/feature%2Fx");
  });

  it("files.ts:113 and :134 movePaths ref read and update", async () => {
    const out = await movePaths("o", "r", "feature/x", [{ from: "a.txt", to: "b.txt" }], "m");
    expect(out.moved).toBe(1);
    const paths = recordedPaths();
    expect(paths).toContain("/repos/o/r/git/ref/heads/feature%2Fx");
    expect(paths).toContain("/repos/o/r/git/refs/heads/feature%2Fx");
  });
});

// ---------------------------------------------------------------------------
// Instrument Q: the four QUERY sinks are deliberately LEFT. A bare ".." in a
// query value is inert; wrapping would add a throw with no protection gained.
// ---------------------------------------------------------------------------
describe("query sinks are left unguarded: no throw, pathname unchanged, dots only in the query", () => {
  it("actions.ts:68 getLatestWorkflowRun", async () => {
    await getLatestWorkflowRun("o", "r", "..");
    const u = new URL(String(fetchMock.mock.calls[0][0]));
    expect(u.pathname).toBe("/repos/o/r/actions/runs");
    expect(u.search).toContain("branch=..");
  });

  it("actions.ts:120 findWorkflowRunSince", async () => {
    await findWorkflowRunSince("o", "r", "..", "2026-01-01T00:00:00Z");
    const u = new URL(String(fetchMock.mock.calls[0][0]));
    expect(u.pathname).toBe("/repos/o/r/actions/runs");
    expect(u.search).toContain("branch=..");
  });

  it("branches.ts:35 listCommits", async () => {
    await listCommits("o", "r", "..");
    const u = new URL(String(fetchMock.mock.calls[0][0]));
    expect(u.pathname).toBe("/repos/o/r/commits");
    expect(u.search).toContain("sha=..");
  });

  it("files.ts:72 putFile existence check", async () => {
    await putFile("o", "r", "p", "c", "m", "..");
    const u = new URL(String(fetchMock.mock.calls[0][0]));
    expect(u.pathname).toBe("/repos/o/r/contents/p");
    expect(u.search).toBe("?ref=..");
  });
});
