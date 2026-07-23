import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { copyRepo, type CopyRepoOptions } from "./github";

const ok = (v: unknown) => new Response(JSON.stringify(v), { status: 200 });

describe("github.copyrepo.guards", () => {
  beforeEach(() => {
    process.env.GITHUB_TOKEN = "test-token";
  });

  afterEach(() => {
    delete process.env.GITHUB_TOKEN;
    vi.restoreAllMocks();
  });

  it("7. zero-selection and >2000-file guards throw the friendly errors", async () => {
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
        return Promise.resolve(ok({ tree: [] }));
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

    await expect(copyRepo("source", "repo", opts)).rejects.toThrow("Nothing selected");

    vi.restoreAllMocks();

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
        const largeTree = Array.from({ length: 2001 }).map((_, i) => ({
          path: `file${i}.txt`,
          type: "blob" as const,
          size: 10,
          sha: `sha${i}`,
        }));
        return Promise.resolve(ok({ tree: largeTree }));
      }

      return Promise.resolve(new Response(null, { status: 404 }));
    });

    await expect(copyRepo("source", "repo", opts)).rejects.toThrow("Too many files");
  });
});
