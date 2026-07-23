import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import JSZip from "jszip";
import { copyPathsToRepo, type CopyPathsOptions } from "./github";

const ok = (v: unknown) => new Response(JSON.stringify(v), { status: 200 });
const empty = () => new Response(null, { status: 204 });

async function createZipResponse(files: Record<string, string>): Promise<Response> {
  const zip = new JSZip();
  const folder = zip.folder("owner-repo-abc123");
  if (!folder) throw new Error("Failed to create folder");
  for (const [path, content] of Object.entries(files)) {
    folder.file(path, content);
  }
  const arrayBuffer = await zip.generateAsync({ type: "arraybuffer" });
  return new Response(arrayBuffer);
}

describe("github.copyPathsToRepo", () => {
  beforeEach(() => {
    process.env.GITHUB_TOKEN = "test-token";
  });

  afterEach(() => {
    delete process.env.GITHUB_TOKEN;
    vi.restoreAllMocks();
  });

  it("1. happy path: copies selected files to existing repo, uses base_tree for additive commit", async () => {
    const blobCalls: string[] = [];
    let treeCallBody: unknown = null;

    vi.spyOn(global, "fetch").mockImplementation((url: RequestInfo | URL, init?: RequestInit) => {
      const urlStr = url.toString();

      if (urlStr.endsWith("/repos/source/repo")) {
        return Promise.resolve(
          ok({
            full_name: "source/repo",
            name: "repo",
            owner: { login: "source" },
            description: "",
            private: false,
            default_branch: "main",
            updated_at: "2026-07-06T00:00:00Z",
            html_url: "https://github.com/source/repo",
            is_template: false,
            archived: false,
          })
        );
      }

      if (urlStr.endsWith("/repos/dest/existing")) {
        return Promise.resolve(
          ok({
            full_name: "dest/existing",
            name: "existing",
            owner: { login: "dest" },
            description: "",
            private: true,
            default_branch: "main",
            updated_at: "2026-07-07T00:00:00Z",
            html_url: "https://github.com/dest/existing",
            is_template: false,
            archived: false,
          })
        );
      }

      if (urlStr.includes("/git/trees") && urlStr.includes("recursive=1")) {
        return Promise.resolve(
          ok({
            tree: [
              { path: "file1.txt", type: "blob", size: 10, sha: "sha1" },
              { path: "folder/file2.txt", type: "blob", size: 20, sha: "sha2" },
              { path: "folder/ignored.txt", type: "blob", size: 30, sha: "sha3" },
            ],
          })
        );
      }

      if (urlStr.includes("/zipball/")) {
        return createZipResponse({
          "file1.txt": "content1",
          "folder/file2.txt": "content2",
          "folder/ignored.txt": "content3",
        });
      }

      if (urlStr.includes("/git/blobs")) {
        blobCalls.push(urlStr);
        return Promise.resolve(ok({ sha: `blob-sha-${blobCalls.length}` }));
      }

      if (urlStr.includes("/git/trees") && !urlStr.includes("recursive")) {
        if (init?.method === "POST") {
          treeCallBody = init.body ? JSON.parse(init.body as string) : null;
        }
        return Promise.resolve(ok({ sha: "new-tree-sha" }));
      }

      if (urlStr.includes("/git/ref/heads/main")) {
        return Promise.resolve(ok({ object: { sha: "head-sha" } }));
      }

      if (urlStr.includes("/git/commits/head-sha")) {
        return Promise.resolve(ok({ sha: "head-sha", tree: { sha: "base-tree-sha" } }));
      }

      if (urlStr.includes("/git/commits") && init?.method === "POST") {
        return Promise.resolve(ok({ sha: "new-commit-sha" }));
      }

      if (urlStr.includes("/git/refs/heads/main") && init?.method === "PATCH") {
        return Promise.resolve(empty());
      }

      return Promise.resolve(new Response(null, { status: 404 }));
    });

    const opts: CopyPathsOptions = {
      destOwner: "dest",
      destRepo: "existing",
      paths: ["file1.txt", "folder/file2.txt"],
    };

    const result = await copyPathsToRepo("source", "repo", opts);

    expect(result.copiedFiles).toBe(2);
    expect(result.skippedFiles).toBe(0);
    expect(result.warnings.length).toBe(0);
    expect(result.commitSha).toBe("new-commit-sha");
    expect(result.commitUrl).toBe("https://github.com/dest/existing/commit/new-commit-sha");
    expect(blobCalls.length).toBe(2);
    expect(treeCallBody).toHaveProperty("base_tree", "base-tree-sha");
  });

  it("2. destPrefix prepends to tree paths", async () => {
    let treeCallBody: unknown = null;

    vi.spyOn(global, "fetch").mockImplementation((url: RequestInfo | URL, init?: RequestInit) => {
      const urlStr = url.toString();

      if (urlStr.endsWith("/repos/source/repo")) {
        return Promise.resolve(
          ok({
            full_name: "source/repo",
            name: "repo",
            owner: { login: "source" },
            description: "",
            private: false,
            default_branch: "main",
            updated_at: "2026-07-06T00:00:00Z",
            html_url: "https://github.com/source/repo",
            is_template: false,
            archived: false,
          })
        );
      }

      if (urlStr.endsWith("/repos/dest/existing")) {
        return Promise.resolve(
          ok({
            full_name: "dest/existing",
            name: "existing",
            owner: { login: "dest" },
            description: "",
            private: true,
            default_branch: "main",
            updated_at: "2026-07-07T00:00:00Z",
            html_url: "https://github.com/dest/existing",
            is_template: false,
            archived: false,
          })
        );
      }

      if (urlStr.includes("/git/trees") && urlStr.includes("recursive=1")) {
        return Promise.resolve(
          ok({
            tree: [
              { path: "file.txt", type: "blob", size: 10, sha: "sha1" },
            ],
          })
        );
      }

      if (urlStr.includes("/zipball/")) {
        return createZipResponse({
          "file.txt": "content",
        });
      }

      if (urlStr.includes("/git/blobs")) {
        return Promise.resolve(ok({ sha: "blob-sha-1" }));
      }

      if (urlStr.includes("/git/trees") && !urlStr.includes("recursive")) {
        if (init?.method === "POST") {
          treeCallBody = init.body ? JSON.parse(init.body as string) : null;
        }
        return Promise.resolve(ok({ sha: "new-tree-sha" }));
      }

      if (urlStr.includes("/git/ref/heads/main")) {
        return Promise.resolve(ok({ object: { sha: "head-sha" } }));
      }

      if (urlStr.includes("/git/commits/head-sha")) {
        return Promise.resolve(ok({ sha: "head-sha", tree: { sha: "base-tree-sha" } }));
      }

      if (urlStr.includes("/git/commits") && init?.method === "POST") {
        return Promise.resolve(ok({ sha: "new-commit-sha" }));
      }

      if (urlStr.includes("/git/refs/heads/main") && init?.method === "PATCH") {
        return Promise.resolve(empty());
      }

      return Promise.resolve(new Response(null, { status: 404 }));
    });

    const opts: CopyPathsOptions = {
      destOwner: "dest",
      destRepo: "existing",
      paths: ["file.txt"],
      destPrefix: "/imports/source",
    };

    await copyPathsToRepo("source", "repo", opts);

    const treeData = treeCallBody as { tree?: Array<{ path?: string }> } | null;
    expect(treeData?.tree?.[0]?.path).toBe("imports/source/file.txt");
  });

  it("3. submodule in selection produces warning and skipped count", async () => {
    vi.spyOn(global, "fetch").mockImplementation((url: RequestInfo | URL, init?: RequestInit) => {
      const urlStr = url.toString();

      if (urlStr.endsWith("/repos/source/repo")) {
        return Promise.resolve(
          ok({
            full_name: "source/repo",
            name: "repo",
            owner: { login: "source" },
            description: "",
            private: false,
            default_branch: "main",
            updated_at: "2026-07-06T00:00:00Z",
            html_url: "https://github.com/source/repo",
            is_template: false,
            archived: false,
          })
        );
      }

      if (urlStr.endsWith("/repos/dest/existing")) {
        return Promise.resolve(
          ok({
            full_name: "dest/existing",
            name: "existing",
            owner: { login: "dest" },
            description: "",
            private: true,
            default_branch: "main",
            updated_at: "2026-07-07T00:00:00Z",
            html_url: "https://github.com/dest/existing",
            is_template: false,
            archived: false,
          })
        );
      }

      if (urlStr.includes("/git/trees") && urlStr.includes("recursive=1")) {
        return Promise.resolve(
          ok({
            tree: [
              { path: "file.txt", type: "blob", size: 10, sha: "sha1" },
              { path: "submod", type: "commit", size: 0, sha: "sha2" },
            ],
          })
        );
      }

      if (urlStr.includes("/zipball/")) {
        return createZipResponse({
          "file.txt": "content",
        });
      }

      if (urlStr.includes("/git/blobs")) {
        return Promise.resolve(ok({ sha: "blob-sha-1" }));
      }

      if (urlStr.endsWith("/repos/dest/existing")) {
        return Promise.resolve(
          ok({
            full_name: "dest/existing",
            name: "existing",
            owner: { login: "dest" },
            description: "",
            private: true,
            default_branch: "main",
            updated_at: "2026-07-07T00:00:00Z",
            html_url: "https://github.com/dest/existing",
            is_template: false,
            archived: false,
          })
        );
      }

      if (urlStr.includes("/git/trees") && !urlStr.includes("recursive")) {
        return Promise.resolve(ok({ sha: "new-tree-sha" }));
      }

      if (urlStr.includes("/git/ref/heads/main")) {
        return Promise.resolve(ok({ object: { sha: "head-sha" } }));
      }

      if (urlStr.includes("/git/commits/head-sha")) {
        return Promise.resolve(ok({ sha: "head-sha", tree: { sha: "base-tree-sha" } }));
      }

      if (urlStr.includes("/git/commits") && init?.method === "POST") {
        return Promise.resolve(ok({ sha: "new-commit-sha" }));
      }

      if (urlStr.includes("/git/refs/heads/main") && init?.method === "PATCH") {
        return Promise.resolve(empty());
      }

      return Promise.resolve(new Response(null, { status: 404 }));
    });

    const opts: CopyPathsOptions = {
      destOwner: "dest",
      destRepo: "existing",
      paths: ["file.txt", "submod"],
    };

    const result = await copyPathsToRepo("source", "repo", opts);

    expect(result.copiedFiles).toBe(1);
    expect(result.skippedFiles).toBe(1);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings.some((w) => w.includes("submodule"))).toBe(true);
  });

  it("4. zero matches throws error", async () => {
    vi.spyOn(global, "fetch").mockImplementation((url: RequestInfo | URL) => {
      const urlStr = url.toString();

      if (urlStr.endsWith("/repos/source/repo")) {
        return Promise.resolve(
          ok({
            full_name: "source/repo",
            name: "repo",
            owner: { login: "source" },
            description: "",
            private: false,
            default_branch: "main",
            updated_at: "2026-07-06T00:00:00Z",
            html_url: "https://github.com/source/repo",
            is_template: false,
            archived: false,
          })
        );
      }

      if (urlStr.includes("/git/trees") && urlStr.includes("recursive=1")) {
        return Promise.resolve(
          ok({
            tree: [
              { path: "file.txt", type: "blob", size: 10, sha: "sha1" },
            ],
          })
        );
      }

      return Promise.resolve(new Response(null, { status: 404 }));
    });

    const opts: CopyPathsOptions = {
      destOwner: "dest",
      destRepo: "existing",
      paths: ["nonexistent.txt"],
    };

    await expect(copyPathsToRepo("source", "repo", opts)).rejects.toThrow("Nothing selected");
  });
});
