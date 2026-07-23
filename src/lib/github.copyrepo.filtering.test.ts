import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import JSZip from "jszip";
import { copyRepo, type CopyRepoOptions } from "./github";

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

describe("github.copyrepo.filtering", () => {
  beforeEach(() => {
    process.env.GITHUB_TOKEN = "test-token";
  });

  afterEach(() => {
    delete process.env.GITHUB_TOKEN;
    vi.restoreAllMocks();
  });

  it("1. path filtering: only opts.paths blobs are blob-created/tree-written", async () => {
    const blobCalls: string[] = [];

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

      if (urlStr.includes("/git/trees") && urlStr.includes("recursive=1")) {
        return Promise.resolve(
          ok({
            tree: [
              { path: "file1.txt", type: "blob", size: 10, sha: "sha1" },
              { path: "file2.txt", type: "blob", size: 20, sha: "sha2" },
              { path: "ignored.txt", type: "blob", size: 30, sha: "sha3" },
            ],
          })
        );
      }

      if (urlStr.includes("/zipball/")) {
        return createZipResponse({
          "file1.txt": "content1",
          "file2.txt": "content2",
          "ignored.txt": "content3",
        });
      }

      if (urlStr.includes("/user/repos") && init?.method === "POST") {
        return Promise.resolve(
          ok({
            full_name: "dest/copy",
            name: "copy",
            owner: { login: "dest" },
            description: "",
            private: true,
            default_branch: "main",
            updated_at: "2026-07-07T00:00:00Z",
            html_url: "https://github.com/dest/copy",
            is_template: false,
            archived: false,
          })
        );
      }

      if (urlStr.includes("/git/blobs")) {
        blobCalls.push(urlStr);
        return Promise.resolve(ok({ sha: `blob-sha-${blobCalls.length}` }));
      }

      if (urlStr.includes("/git/trees") && !urlStr.includes("recursive")) {
        return Promise.resolve(ok({ sha: "tree-sha" }));
      }

      if (urlStr.includes("/git/ref/heads/")) {
        return Promise.resolve(ok({ object: { sha: "parent-sha" } }));
      }

      if (urlStr.includes("/git/commits")) {
        return Promise.resolve(ok({ sha: "commit-sha" }));
      }

      if (urlStr.includes("/git/refs/heads/")) {
        return Promise.resolve(empty());
      }

      return Promise.resolve(
        new Response(null, { status: 404 })
      );
    });

    const opts: CopyRepoOptions = {
      destName: "copy",
      visibility: "private",
      paths: ["file1.txt", "file2.txt"],
      includeWorkflows: true,
      copyTopics: false,
      copyLabels: false,
    };

    const result = await copyRepo("source", "repo", opts);

    expect(result.copiedFiles).toBe(2);
    expect(result.skippedFiles).toBe(0);
    expect(result.warnings.length).toBe(0);
    expect(blobCalls.length).toBe(2);
  });

  it("2. includeWorkflows=false excludes .github/workflows/** even when listed in paths", async () => {
    let blobCallCount = 0;

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

      if (urlStr.includes("/git/trees") && urlStr.includes("recursive=1")) {
        return Promise.resolve(
          ok({
            tree: [
              { path: "file.txt", type: "blob", size: 10, sha: "sha1" },
              { path: ".github/workflows/ci.yml", type: "blob", size: 50, sha: "sha2" },
            ],
          })
        );
      }

      if (urlStr.includes("/zipball/")) {
        return createZipResponse({
          "file.txt": "content",
          ".github/workflows/ci.yml": "workflow",
        });
      }

      if (urlStr.includes("/user/repos") && init?.method === "POST") {
        return Promise.resolve(
          ok({
            full_name: "dest/copy",
            name: "copy",
            owner: { login: "dest" },
            description: "",
            private: true,
            default_branch: "main",
            updated_at: "2026-07-07T00:00:00Z",
            html_url: "https://github.com/dest/copy",
            is_template: false,
            archived: false,
          })
        );
      }

      if (urlStr.includes("/git/blobs")) {
        blobCallCount++;
        return Promise.resolve(ok({ sha: `blob-sha-${blobCallCount}` }));
      }

      if (urlStr.includes("/git/trees") && !urlStr.includes("recursive")) {
        return Promise.resolve(ok({ sha: "tree-sha" }));
      }

      if (urlStr.includes("/git/ref/heads/")) {
        return Promise.resolve(ok({ object: { sha: "parent-sha" } }));
      }

      if (urlStr.includes("/git/commits")) {
        return Promise.resolve(ok({ sha: "commit-sha" }));
      }

      if (urlStr.includes("/git/refs/heads/")) {
        return Promise.resolve(empty());
      }

      return Promise.resolve(new Response(null, { status: 404 }));
    });

    const opts: CopyRepoOptions = {
      destName: "copy",
      visibility: "private",
      paths: ["file.txt", ".github/workflows/ci.yml"],
      includeWorkflows: false,
      copyTopics: false,
      copyLabels: false,
    };

    const result = await copyRepo("source", "repo", opts);

    expect(result.copiedFiles).toBe(1);
    expect(result.skippedFiles).toBe(0);
    expect(blobCallCount).toBe(1);
  });

  it("3. submodule (type commit) entries are skipped with a warning", async () => {
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

      if (urlStr.includes("/git/trees") && urlStr.includes("recursive=1")) {
        return Promise.resolve(
          ok({
            tree: [
              { path: "file.txt", type: "blob", size: 10, sha: "sha1" },
              { path: "submodule-dir", type: "commit", size: 0, sha: "sha2" },
            ],
          })
        );
      }

      if (urlStr.includes("/zipball/")) {
        return createZipResponse({
          "file.txt": "content",
        });
      }

      if (urlStr.includes("/user/repos") && init?.method === "POST") {
        return Promise.resolve(
          ok({
            full_name: "dest/copy",
            name: "copy",
            owner: { login: "dest" },
            description: "",
            private: true,
            default_branch: "main",
            updated_at: "2026-07-07T00:00:00Z",
            html_url: "https://github.com/dest/copy",
            is_template: false,
            archived: false,
          })
        );
      }

      if (urlStr.includes("/git/blobs")) {
        return Promise.resolve(ok({ sha: "blob-sha1" }));
      }

      if (urlStr.includes("/git/trees") && !urlStr.includes("recursive")) {
        return Promise.resolve(ok({ sha: "tree-sha" }));
      }

      if (urlStr.includes("/git/ref/heads/")) {
        return Promise.resolve(ok({ object: { sha: "parent-sha" } }));
      }

      if (urlStr.includes("/git/commits")) {
        return Promise.resolve(ok({ sha: "commit-sha" }));
      }

      if (urlStr.includes("/git/refs/heads/")) {
        return Promise.resolve(empty());
      }

      return Promise.resolve(new Response(null, { status: 404 }));
    });

    const opts: CopyRepoOptions = {
      destName: "copy",
      visibility: "private",
      includeWorkflows: true,
      copyTopics: false,
      copyLabels: false,
    };

    const result = await copyRepo("source", "repo", opts);

    expect(result.copiedFiles).toBe(1);
    expect(result.skippedFiles).toBe(1);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0]).toContain("submodule");
  });

  it("8. a paths entry missing from the zipball -> warning + skippedFiles, not a crash", async () => {
    vi.spyOn(global, "fetch").mockImplementation((url: RequestInfo | URL, init?: RequestInit) => { /* eslint-disable-line @typescript-eslint/no-unused-vars */
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
              { path: "file1.txt", type: "blob", size: 10, sha: "sha1" },
              { path: "missing.txt", type: "blob", size: 20, sha: "sha2" },
            ],
          })
        );
      }

      if (urlStr.includes("/zipball/")) {
        return createZipResponse({
          "file1.txt": "content1",
        });
      }

      if (urlStr.includes("/user/repos")) {
        return Promise.resolve(
          ok({
            full_name: "dest/copy",
            name: "copy",
            owner: { login: "dest" },
            description: "",
            private: true,
            default_branch: "main",
            updated_at: "2026-07-07T00:00:00Z",
            html_url: "https://github.com/dest/copy",
            is_template: false,
            archived: false,
          })
        );
      }

      if (urlStr.includes("/git/blobs")) {
        return Promise.resolve(ok({ sha: "blob-sha1" }));
      }

      if (urlStr.includes("/git/trees") && !urlStr.includes("recursive")) {
        return Promise.resolve(ok({ sha: "tree-sha" }));
      }

      if (urlStr.includes("/git/ref/heads/")) {
        return Promise.resolve(ok({ object: { sha: "parent-sha" } }));
      }

      if (urlStr.includes("/git/commits")) {
        return Promise.resolve(ok({ sha: "commit-sha" }));
      }

      if (urlStr.includes("/git/refs/heads/")) {
        return Promise.resolve(empty());
      }

      return Promise.resolve(new Response(null, { status: 404 }));
    });

    const opts: CopyRepoOptions = {
      destName: "copy",
      visibility: "private",
      includeWorkflows: true,
      copyTopics: false,
      copyLabels: false,
    };

    const result = await copyRepo("source", "repo", opts);

    expect(result.copiedFiles).toBe(1);
    expect(result.skippedFiles).toBe(1);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0]).toContain("Missing");
  });
});
