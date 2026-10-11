// I-2: URL-level proof that a ref reaching getRepoTreeWithMeta / getFileText is
// routed through encodeRefSegment. Mocks fetch (never @/lib/github) so the real
// URL is what is asserted. `new URL(u).pathname` is used on purpose:
// `not.toContain("../")` is green on the dot-segment bug, because the URL
// parser has already collapsed it.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getFileText, getRepoTreeWithMeta } from "./github.files";

const fetchMock = vi.fn();

function okJson(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200 });
}

beforeEach(() => {
  vi.stubEnv("GITHUB_TOKEN", "t");
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (url: string) => {
    const u = String(url);
    if (u.includes("/git/trees/")) return okJson({ tree: [], truncated: false });
    if (u.endsWith("/repos/o/r")) return okJson({ full_name: "o/r", name: "r", default_branch: "main", owner: { login: "o" } });
    return new Response("text", { status: 200 });
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("getRepoTreeWithMeta ref handling", () => {
  it("encodes a benign ref into the trees path", async () => {
    await getRepoTreeWithMeta("o", "r", "feature/x");
    const u = String(fetchMock.mock.calls[0][0]);
    expect(new URL(u).pathname).toBe("/repos/o/r/git/trees/feature%2Fx");
  });

  it("rejects a dot-dot ref before any fetch", async () => {
    await expect(getRepoTreeWithMeta("o", "r", "..")).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects a single-dot ref before any fetch", async () => {
    await expect(getRepoTreeWithMeta("o", "r", ".")).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("never forwards a whitespace ref: falls back to the default branch", async () => {
    await getRepoTreeWithMeta("o", "r", "  ");
    const paths = fetchMock.mock.calls.map((c) => new URL(String(c[0])).pathname);
    expect(paths).toContain("/repos/o/r/git/trees/main");
    expect(paths.some((p) => p.includes("%20"))).toBe(false);
  });
});

describe("getFileText ref handling", () => {
  it("rejects a dot-dot ref before any fetch", async () => {
    await expect(getFileText("o", "r", "a.txt", "..")).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("encodes a benign ref into the ref query", async () => {
    await getFileText("o", "r", "a.txt", "feature/x");
    const u = new URL(String(fetchMock.mock.calls[0][0]));
    expect(u.pathname).toBe("/repos/o/r/contents/a.txt");
    expect(u.search).toBe("?ref=feature%2Fx");
  });

  it("omits the ref query for a whitespace ref", async () => {
    await getFileText("o", "r", "a.txt", "  ");
    expect(new URL(String(fetchMock.mock.calls[0][0])).search).toBe("");
  });
});
