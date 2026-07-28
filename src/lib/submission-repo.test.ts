import { describe, it, expect } from "vitest";
import {
  parseSubmissionGithubUrl,
  looksLikeGithubUrl,
  selectSubmissionRepoFiles,
  clampFileBytes,
  applyTotalByteBudget,
  MAX_SUBMISSION_REPO_FILES,
  type SubmissionRepoTreeEntry,
  type SubmissionRepoFile,
} from "./submission-repo";

describe("parseSubmissionGithubUrl", () => {
  it("parses a plain owner/repo URL", () => {
    const result = parseSubmissionGithubUrl("https://github.com/octocat/Hello-World");
    expect(result).toEqual({ owner: "octocat", repo: "Hello-World", ref: undefined, subpath: undefined });
  });

  it("parses a URL with a trailing slash", () => {
    const result = parseSubmissionGithubUrl("https://github.com/octocat/Hello-World/");
    expect(result).toEqual({ owner: "octocat", repo: "Hello-World", ref: undefined, subpath: undefined });
  });

  it("parses a /tree/<ref> URL", () => {
    const result = parseSubmissionGithubUrl("https://github.com/octocat/Hello-World/tree/main");
    expect(result).toEqual({ owner: "octocat", repo: "Hello-World", ref: "main", subpath: undefined });
  });

  it("parses a /tree/<ref>/<subpath> URL", () => {
    const result = parseSubmissionGithubUrl("https://github.com/octocat/Hello-World/tree/dev/src/app");
    expect(result).toEqual({ owner: "octocat", repo: "Hello-World", ref: "dev", subpath: "src/app" });
  });

  it("strips a trailing .git suffix", () => {
    const result = parseSubmissionGithubUrl("https://github.com/octocat/Hello-World.git");
    expect(result).toEqual({ owner: "octocat", repo: "Hello-World", ref: undefined, subpath: undefined });
  });

  it("returns a clear error for a non-GitHub URL, without throwing", () => {
    expect(() => parseSubmissionGithubUrl("https://gitlab.com/octocat/Hello-World")).not.toThrow();
    const result = parseSubmissionGithubUrl("https://gitlab.com/octocat/Hello-World");
    expect(result).toHaveProperty("error");
    expect((result as { error: string }).error).toMatch(/github\.com/i);
  });

  it("returns a clear error for garbage input, without throwing", () => {
    expect(() => parseSubmissionGithubUrl("not a url at all????")).not.toThrow();
    const result = parseSubmissionGithubUrl("not a url at all????");
    expect(result).toHaveProperty("error");
  });

  it("returns a clear error for an empty string, without throwing", () => {
    expect(() => parseSubmissionGithubUrl("")).not.toThrow();
    expect(parseSubmissionGithubUrl("")).toHaveProperty("error");
  });

  it("returns a clear error for a GitHub host with no repo path", () => {
    const result = parseSubmissionGithubUrl("https://github.com/octocat");
    expect(result).toHaveProperty("error");
  });
});

describe("looksLikeGithubUrl", () => {
  it("is true for a parseable GitHub repo URL", () => {
    expect(looksLikeGithubUrl("https://github.com/octocat/Hello-World")).toBe(true);
  });

  it("is false for a non-GitHub URL", () => {
    expect(looksLikeGithubUrl("https://example.com/octocat/Hello-World")).toBe(false);
  });

  it("is false for garbage", () => {
    expect(looksLikeGithubUrl("this is not a link")).toBe(false);
  });
});

describe("selectSubmissionRepoFiles", () => {
  const blob = (path: string, size = 100): SubmissionRepoTreeEntry => ({ path, type: "blob", size });

  it("keeps recognized source extensions and drops binaries/lockfiles/vendored dirs", () => {
    const tree: SubmissionRepoTreeEntry[] = [
      blob("main.py"),
      blob("README.md"),
      blob("logo.png"),
      blob("package-lock.json"),
      blob("node_modules/left-pad/index.js"),
      blob(".git/HEAD"),
      { path: "src", type: "tree" },
    ];
    const { selected, truncated } = selectSubmissionRepoFiles(tree);
    const paths = selected.map((f) => f.path).sort();
    expect(paths).toEqual(["README.md", "main.py"]);
    expect(truncated).toBe(false);
  });

  it("scopes to a subpath when given", () => {
    const tree: SubmissionRepoTreeEntry[] = [blob("app/main.py"), blob("other/skip.py"), blob("app/lib/util.py")];
    const { selected } = selectSubmissionRepoFiles(tree, "app");
    expect(selected.map((f) => f.path).sort()).toEqual(["app/lib/util.py", "app/main.py"]);
  });

  it("enforces the max file count and sets truncated", () => {
    const tree: SubmissionRepoTreeEntry[] = Array.from({ length: 5 }, (_, i) => blob(`file${i}.py`));
    const { selected, truncated } = selectSubmissionRepoFiles(tree, undefined, { maxFiles: 3 });
    expect(selected).toHaveLength(3);
    expect(truncated).toBe(true);
  });

  it("does not truncate when under the file count cap", () => {
    const tree: SubmissionRepoTreeEntry[] = Array.from({ length: 3 }, (_, i) => blob(`file${i}.py`));
    const { selected, truncated } = selectSubmissionRepoFiles(tree, undefined, { maxFiles: 3 });
    expect(selected).toHaveLength(3);
    expect(truncated).toBe(false);
  });

  it("uses the real MAX_SUBMISSION_REPO_FILES default when maxFiles is not overridden", () => {
    const tree: SubmissionRepoTreeEntry[] = Array.from({ length: MAX_SUBMISSION_REPO_FILES + 1 }, (_, i) =>
      blob(`file${i}.py`)
    );
    const { selected, truncated } = selectSubmissionRepoFiles(tree);
    expect(selected).toHaveLength(MAX_SUBMISSION_REPO_FILES);
    expect(truncated).toBe(true);
  });

  it("skips a file over the per-file size bound (by tree metadata) and sets truncated", () => {
    const tree: SubmissionRepoTreeEntry[] = [blob("small.py", 10), blob("huge.py", 999)];
    const { selected, truncated } = selectSubmissionRepoFiles(tree, undefined, { maxFileBytes: 100 });
    expect(selected.map((f) => f.path)).toEqual(["small.py"]);
    expect(truncated).toBe(true);
  });
});

describe("clampFileBytes", () => {
  it("leaves short text unchanged", () => {
    const result = clampFileBytes("hello", 100);
    expect(result).toEqual({ text: "hello", truncated: false });
  });

  it("truncates text over the byte bound", () => {
    const result = clampFileBytes("0123456789", 5);
    expect(result.truncated).toBe(true);
    expect(result.text).toBe("01234");
  });
});

describe("applyTotalByteBudget", () => {
  it("keeps every file when under the total budget", () => {
    const files: SubmissionRepoFile[] = [
      { path: "a.py", text: "aaaa" },
      { path: "b.py", text: "bbbb" },
    ];
    const { files: out, truncated } = applyTotalByteBudget(files, 100);
    expect(out).toHaveLength(2);
    expect(truncated).toBe(false);
  });

  it("stops at the first file that would exceed the total budget and sets truncated", () => {
    const files: SubmissionRepoFile[] = [
      { path: "a.py", text: "12345" },
      { path: "b.py", text: "12345" },
      { path: "c.py", text: "12345" },
    ];
    const { files: out, truncated } = applyTotalByteBudget(files, 8);
    expect(out.map((f) => f.path)).toEqual(["a.py"]);
    expect(truncated).toBe(true);
  });
});
