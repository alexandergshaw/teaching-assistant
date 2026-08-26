import { describe, it, expect, vi } from "vitest";
import { ingestRepo, selectDigestFiles, DEFAULT_BUDGET, SCOPED_BUDGET, type SelectDigestFilesOpts } from "./github.digest";
import type { RepoTreeEntry } from "./github.files";

// ingestRepo's own network dependencies, mocked so its per-file truncation
// bookkeeping (F3: docs/grading-results-file-viewer-acceptance-criteria.md)
// can be exercised directly rather than only through selectDigestFiles,
// which never sees a real file BODY (only tree metadata) and so cannot prove
// anything about per-file slicing.
vi.mock("./github.repos", () => ({
  getRepo: vi.fn(),
  ghFetch: vi.fn(),
}));
vi.mock("./github.files", () => ({
  getRepoTreeWithMeta: vi.fn(),
  getFileText: vi.fn(),
}));

import { getRepo } from "./github.repos";
import { getRepoTreeWithMeta, getFileText } from "./github.files";

// The filtering in selectDigestFiles is pure given a tree - no network - so it
// is tested directly here, per docs/folder-scoped-grading-completeness-acceptance-criteria.md.

const blob = (path: string, size = 100, mode?: string): RepoTreeEntry => ({
  path,
  type: "blob",
  size,
  sha: "deadbeef",
  mode,
});

const opts = (overrides: Partial<SelectDigestFilesOpts> = {}): SelectDigestFilesOpts => ({
  maxFiles: DEFAULT_BUDGET.maxFiles,
  maxBytes: DEFAULT_BUDGET.maxBytes,
  perFileBytes: DEFAULT_BUDGET.perFileBytes,
  maxBlobBytes: DEFAULT_BUDGET.maxBlobBytes,
  ...overrides,
});

describe("selectDigestFiles", () => {
  it("includes a subfolder file at depth when scoped to a prefix", () => {
    const tree: RepoTreeEntry[] = [
      blob("week1/src/app/deep/nested/handler.py"),
      blob("week1/README.md"),
      blob("other/skip.py"),
    ];
    const { selected } = selectDigestFiles(tree, opts({ pathPrefix: "week1" }));
    const paths = selected.map((f) => f.path).sort();
    expect(paths).toEqual(["week1/README.md", "week1/src/app/deep/nested/handler.py"]);
  });

  it("includes a no-extension file that is a well-known project file (LICENSE)", () => {
    const tree: RepoTreeEntry[] = [blob("LICENSE"), blob("logo.png")];
    const { selected, skipped } = selectDigestFiles(tree, opts());
    expect(selected.map((f) => f.path)).toEqual(["LICENSE"]);
    // The .png is excluded for type, proving the no-extension fix did not
    // accidentally let non-code artifacts through too.
    expect(skipped.type).toBe(1);
  });

  it("includes an extensionless executable script by its mode bit, and still excludes a .png", () => {
    const tree: RepoTreeEntry[] = [blob("tools/run-checks", 100, "100755"), blob("assets/logo.png", 100)];
    const { selected } = selectDigestFiles(tree, opts());
    expect(selected.map((f) => f.path)).toEqual(["tools/run-checks"]);
  });

  it("excludes an extensionless file with no executable bit and no known name", () => {
    const tree: RepoTreeEntry[] = [blob("data/mystery", 100)];
    const { selected, skipped } = selectDigestFiles(tree, opts());
    expect(selected).toHaveLength(0);
    expect(skipped.type).toBe(1);
  });

  it("treats a dotted directory name correctly - the file has no extension of its own", () => {
    const tree: RepoTreeEntry[] = [blob("my.project/main", 100, "100755"), blob("my.project/main.py", 100)];
    const { selected } = selectDigestFiles(tree, opts());
    // "main" (no extension, but executable) is included via the mode bit;
    // "main.py" is included via its own real extension. Neither incorrectly
    // inherits ".project" from the parent directory as an extension.
    expect(selected.map((f) => f.path).sort()).toEqual(["my.project/main", "my.project/main.py"]);
  });

  it("still excludes a lockfile and a minified bundle", () => {
    const tree: RepoTreeEntry[] = [
      blob("package-lock.json"),
      blob("dist/app.min.js"),
      blob("dist/app.min.js.map"),
      blob("src/index.js"),
    ];
    const { selected, skipped } = selectDigestFiles(tree, opts());
    expect(selected.map((f) => f.path)).toEqual(["src/index.js"]);
    expect(skipped.type).toBe(3);
  });

  it("still excludes node_modules even inside the chosen folder", () => {
    const tree: RepoTreeEntry[] = [
      blob("week1/src/index.js"),
      blob("week1/node_modules/left-pad/index.js"),
      blob("week1/node_modules/left-pad/package.json"),
    ];
    const { selected, skipped } = selectDigestFiles(tree, opts({ pathPrefix: "week1" }));
    expect(selected.map((f) => f.path)).toEqual(["week1/src/index.js"]);
    expect(skipped.type).toBe(2);
  });

  it("the prefixed budget genuinely differs from the unprefixed default", () => {
    expect(SCOPED_BUDGET.maxFiles).toBeGreaterThan(DEFAULT_BUDGET.maxFiles);
    expect(SCOPED_BUDGET.maxBytes).toBeGreaterThan(DEFAULT_BUDGET.maxBytes);
    expect(SCOPED_BUDGET.perFileBytes).toBeGreaterThan(DEFAULT_BUDGET.perFileBytes);
    expect(SCOPED_BUDGET.maxBlobBytes).toBeGreaterThan(DEFAULT_BUDGET.maxBlobBytes);

    // Demonstrate the difference actually changes what gets through: a file
    // that clears the scoped per-blob ceiling but not the default one.
    const tree: RepoTreeEntry[] = [blob("week1/big.py", 100_000)];
    const unscoped = selectDigestFiles(tree, opts({ maxBlobBytes: DEFAULT_BUDGET.maxBlobBytes }));
    const scoped = selectDigestFiles(tree, opts({ maxBlobBytes: SCOPED_BUDGET.maxBlobBytes, pathPrefix: "week1" }));
    expect(unscoped.selected).toHaveLength(0);
    expect(unscoped.skipped.size).toBe(1);
    expect(scoped.selected).toHaveLength(1);
    expect(scoped.skipped.size).toBe(0);
  });

  it("counts skips by type, size, and budget accurately", () => {
    const tree: RepoTreeEntry[] = [
      blob("a.py", 100),
      blob("b.py", 100),
      blob("c.py", 100),
      blob("logo.png", 100), // type
      blob("huge.py", 999), // size
    ];
    const { selected, skipped } = selectDigestFiles(
      tree,
      opts({ maxFiles: 2, maxBytes: 1_000_000, perFileBytes: 1_000, maxBlobBytes: 500 })
    );
    expect(selected).toHaveLength(2);
    expect(skipped.type).toBe(1);
    expect(skipped.size).toBe(1);
    expect(skipped.budget).toBe(1); // the third .py candidate, cut by maxFiles
  });

  it("reports a matched-nothing outcome distinctly from an empty-but-present folder", () => {
    const tree: RepoTreeEntry[] = [blob("week1/README.md"), blob("week2/README.md")];
    const result = selectDigestFiles(tree, opts({ pathPrefix: "week10" }));
    expect(result.prefixMatchedNothing).toBe(true);
    expect(result.selected).toHaveLength(0);
  });

  it("does not let a matching prefix be confused with a longer sibling folder name", () => {
    // week1 must not match week10 - the trailing slash is enforced before comparing.
    const tree: RepoTreeEntry[] = [blob("week10/README.md")];
    const result = selectDigestFiles(tree, opts({ pathPrefix: "week1" }));
    expect(result.prefixMatchedNothing).toBe(true);
  });

  it("prefix match is case-insensitive", () => {
    const tree: RepoTreeEntry[] = [blob("Week1/main.py")];
    const result = selectDigestFiles(tree, opts({ pathPrefix: "week1" }));
    expect(result.prefixMatchedNothing).toBe(false);
    expect(result.selected.map((f) => f.path)).toEqual(["Week1/main.py"]);
  });

  it("a folder with real content (even one small file) is not reported as matched-nothing", () => {
    const tree: RepoTreeEntry[] = [blob("week3/tiny.py", 10)];
    const result = selectDigestFiles(tree, opts({ pathPrefix: "week3" }));
    expect(result.prefixMatchedNothing).toBe(false);
    expect(result.selected).toHaveLength(1);
  });
});

// F3 (docs/grading-results-file-viewer-acceptance-criteria.md): ingestRepo
// must report per-file truncation as a computed FACT, not a hardcoded
// constant - `RepoFile.truncated` is true exactly when that file's own
// content was cut by the byte budget, false when the whole file made it in
// whole. getRepo/getRepoTreeWithMeta/getFileText are mocked (module-level
// above) so this exercises the real slicing logic in ingestRepo itself,
// not just selectDigestFiles's tree-only filtering.
describe("ingestRepo - per-file truncated is computed per file, not guessed", () => {
  const repoInfo = {
    fullName: "org/repo",
    owner: "org",
    name: "repo",
    description: "",
    private: false,
    defaultBranch: "main",
    updatedAt: "",
    htmlUrl: "",
    isTemplate: false,
    archived: false,
  };

  it("a file entirely within perFileBytes is NOT truncated", async () => {
    vi.mocked(getRepo).mockResolvedValue(repoInfo);
    vi.mocked(getRepoTreeWithMeta).mockResolvedValue({
      entries: [{ path: "small.py", type: "blob", size: 50, sha: "s" }],
      truncated: false,
    });
    vi.mocked(getFileText).mockResolvedValue("x".repeat(50));

    const digest = await ingestRepo("org", "repo", { perFileBytes: 8_000, maxBytes: 220_000 });
    expect(digest.files).toHaveLength(1);
    expect(digest.files[0].truncated).toBe(false);
    expect(digest.files[0].content).toBe("x".repeat(50));
    expect(digest.truncated).toBe(false);
  });

  it("a file longer than perFileBytes IS truncated, and the digest-level flag follows it", async () => {
    vi.mocked(getRepo).mockResolvedValue(repoInfo);
    vi.mocked(getRepoTreeWithMeta).mockResolvedValue({
      entries: [{ path: "big.py", type: "blob", size: 20_000, sha: "s" }],
      truncated: false,
    });
    vi.mocked(getFileText).mockResolvedValue("y".repeat(20_000));

    const digest = await ingestRepo("org", "repo", { perFileBytes: 8_000, maxBytes: 220_000 });
    expect(digest.files).toHaveLength(1);
    expect(digest.files[0].truncated).toBe(true);
    expect(digest.files[0].content).toHaveLength(8_000);
    expect(digest.truncated).toBe(true);
  });

  it("two files, only one cut - each file's own flag is independent, not smeared across the digest", async () => {
    vi.mocked(getRepo).mockResolvedValue(repoInfo);
    vi.mocked(getRepoTreeWithMeta).mockResolvedValue({
      entries: [
        { path: "src/short.py", type: "blob", size: 10, sha: "s" },
        { path: "src/long.py", type: "blob", size: 50_000, sha: "s" },
      ],
      truncated: false,
    });
    vi.mocked(getFileText).mockImplementation(async (_owner, _repo, path) =>
      path === "src/short.py" ? "z".repeat(10) : "w".repeat(50_000)
    );

    const digest = await ingestRepo("org", "repo", { perFileBytes: 8_000, maxBytes: 220_000, maxFiles: 40 });
    const short = digest.files.find((f) => f.path === "src/short.py");
    const long = digest.files.find((f) => f.path === "src/long.py");
    expect(short?.truncated).toBe(false);
    expect(long?.truncated).toBe(true);
    // The digest-level aggregate is still true (something was cut), but the
    // per-file flags are what a preview reads, and they must not agree just
    // because the aggregate does.
    expect(digest.truncated).toBe(true);
  });
});
