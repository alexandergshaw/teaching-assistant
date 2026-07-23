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

describe("github.copyrepo.routing", () => {
  beforeEach(() => {
    process.env.GITHUB_TOKEN = "test-token";
  });

  afterEach(() => {
    delete process.env.GITHUB_TOKEN;
    vi.restoreAllMocks();
  });

  it("4. destOrg routes to POST /orgs/{org}/repos; personal routes to /user/repos", async () => {
    let createdInOrg = false;
    let gitBlobsPath: string | null = null;

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
            tree: [{ path: "file.txt", type: "blob", size: 10, sha: "sha1" }],
          })
        );
      }

      if (urlStr.includes("/zipball/")) {
        return createZipResponse({
          "file.txt": "content",
        });
      }

      if (urlStr.includes("/orgs/myorg/repos")) {
        createdInOrg = true;
        return Promise.resolve(
          ok({
            full_name: "myorg/copy",
            name: "copy",
            owner: { login: "myorg" },
            description: "",
            private: true,
            default_branch: "main",
            updated_at: "2026-07-07T00:00:00Z",
            html_url: "https://github.com/myorg/copy",
            is_template: false,
            archived: false,
          })
        );
      }

      if (urlStr.includes("/user/repos")) {
        return Promise.resolve(
          ok({
            full_name: "me/copy",
            name: "copy",
            owner: { login: "me" },
            description: "",
            private: true,
            default_branch: "main",
            updated_at: "2026-07-07T00:00:00Z",
            html_url: "https://github.com/me/copy",
            is_template: false,
            archived: false,
          })
        );
      }

      if (urlStr.includes("/git/blobs")) {
        if (!gitBlobsPath) {
          gitBlobsPath = urlStr;
        }
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
      destOrg: "myorg",
      destName: "copy",
      visibility: "private",
      includeWorkflows: true,
      copyTopics: false,
      copyLabels: false,
    };

    await copyRepo("source", "repo", opts);
    expect(createdInOrg).toBe(true);
    expect(gitBlobsPath).toContain("/repos/myorg/copy/git/blobs");
  });

  it("4b. personal repo copy routes git-data POSTs to the personal owner", async () => {
    let gitBlobsPath: string | null = null;

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
            tree: [{ path: "file.txt", type: "blob", size: 10, sha: "sha1" }],
          })
        );
      }

      if (urlStr.includes("/zipball/")) {
        return createZipResponse({
          "file.txt": "content",
        });
      }

      if (urlStr.includes("/user/repos")) {
        return Promise.resolve(
          ok({
            full_name: "me/copy",
            name: "copy",
            owner: { login: "me" },
            description: "",
            private: true,
            default_branch: "main",
            updated_at: "2026-07-07T00:00:00Z",
            html_url: "https://github.com/me/copy",
            is_template: false,
            archived: false,
          })
        );
      }

      if (urlStr.includes("/git/blobs")) {
        if (!gitBlobsPath) {
          gitBlobsPath = urlStr;
        }
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

    await copyRepo("source", "repo", opts);
    expect(gitBlobsPath).toContain("/repos/me/copy/git/blobs");
  });
});
