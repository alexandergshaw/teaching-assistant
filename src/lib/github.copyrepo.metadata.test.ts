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

describe("github.copyrepo.metadata", () => {
  beforeEach(() => {
    process.env.GITHUB_TOKEN = "test-token";
  });

  afterEach(() => {
    delete process.env.GITHUB_TOKEN;
    vi.restoreAllMocks();
  });

  it("5. modes preserved: a 100755 source blob appears as 100755 in the created tree", async () => {
    let capturedMode: string | undefined;

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
              { path: "file.txt", type: "blob", size: 10, sha: "sha1", mode: "100644" },
              { path: "script.sh", type: "blob", size: 20, sha: "sha2", mode: "100755" },
            ],
          })
        );
      }

      if (urlStr.includes("/zipball/")) {
        return createZipResponse({
          "file.txt": "content",
          "script.sh": "#!/bin/bash",
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
        return Promise.resolve(ok({ sha: "blob-sha" }));
      }

      if (urlStr.includes("/git/trees") && !urlStr.includes("recursive") && init?.method === "POST") {
        const bodyStr = init?.body as string;
        const body = JSON.parse(bodyStr);
        if (body.tree && body.tree.length > 0) {
          capturedMode = body.tree[1]?.mode;
        }
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
    expect(capturedMode).toBe("100755");
  });

  it("6. copyLabels tolerates a 422 on label create; copyTopics PUTs the names", async () => {
    let topicsCall = false;
    let labelPostCount = 0;

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

      if (urlStr.includes("/topics") && init?.method === "PUT") {
        topicsCall = true;
        return Promise.resolve(ok({ names: ["topic1", "topic2"] }));
      }

      if (urlStr.includes("/topics")) {
        return Promise.resolve(ok({ names: ["topic1", "topic2"] }));
      }

      if (urlStr.includes("/labels?per_page")) {
        return Promise.resolve(
          ok([
            { name: "bug", color: "FF0000", description: "Bug" },
            { name: "feature", color: "00FF00", description: "Feature" },
          ])
        );
      }

      if (urlStr.includes("/labels") && init?.method === "POST") {
        labelPostCount++;
        if (labelPostCount === 1) {
          // The FIRST create hits the 422 (label already exists); the loop
          // must continue past it and still POST the second label.
          return Promise.resolve(
            new Response(JSON.stringify({ message: "Label already exists" }), { status: 422 })
          );
        }
        return Promise.resolve(ok({ name: "feature" }));
      }

      return Promise.resolve(new Response(null, { status: 404 }));
    });

    const opts: CopyRepoOptions = {
      destName: "copy",
      visibility: "private",
      includeWorkflows: true,
      copyTopics: true,
      copyLabels: true,
    };

    const result = await copyRepo("source", "repo", opts);

    expect(result.copiedFiles).toBe(1);
    expect(labelPostCount).toBe(2);
    expect(topicsCall).toBe(true);
    expect(result.warnings).toHaveLength(0);
  });
});
